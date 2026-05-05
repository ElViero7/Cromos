#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const DEFAULT_BUCKET = 'player-headshots';
const DEFAULT_LIMIT = Number.POSITIVE_INFINITY;
const WIKIPEDIA_API_URL = 'https://en.wikipedia.org/w/api.php';
const SEARCH_RETRY_DELAYS_MS = [2000, 5000, 9000];
const REQUEST_DELAY_MS = 900;
const COOLDOWN_ON_429_MS = 15000;
const MAX_DEFERRED_ATTEMPTS = 1;
const PAGE_IMAGE_WIDTH = 640;
const RATE_LIMIT_RETRY_AFTER_MS = 60 * 60 * 1000;
const NO_RESULT_RETRY_AFTER_MS = 24 * 60 * 60 * 1000;
const DEFAULT_STATE_PATH = path.resolve('supabase', 'player_headshots_state.json');

function parseArgs(argv) {
  const options = {
    bucket: undefined,
    dryRun: false,
    limit: DEFAULT_LIMIT,
    drain: false,
    offset: 0,
    overrides: undefined,
    force: false,
    stateFile: DEFAULT_STATE_PATH,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--dry-run') {
      options.dryRun = true;
      continue;
    }

    if (arg === '--limit') {
      options.limit = Number.parseInt(argv[index + 1] ?? '', 10);
      index += 1;
      continue;
    }

    if (arg === '--drain') {
      options.drain = true;
      continue;
    }

    if (arg === '--offset') {
      options.offset = Number.parseInt(argv[index + 1] ?? '', 10);
      index += 1;
      continue;
    }

    if (arg === '--bucket') {
      options.bucket = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === '--overrides') {
      options.overrides = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === '--force') {
      options.force = true;
      continue;
    }

    if (arg === '--state-file') {
      options.stateFile = argv[index + 1];
      index += 1;
      continue;
    }
  }

  if (!Number.isFinite(options.limit) || options.limit <= 0) {
    options.limit = DEFAULT_LIMIT;
  }

  if (!Number.isFinite(options.offset) || options.offset < 0) {
    options.offset = 0;
  }

  return options;
}

function loadDotEnv(envPath = '.env') {
  const resolvedPath = path.resolve(envPath);

  if (!fs.existsSync(resolvedPath)) {
    return;
  }

  const raw = fs.readFileSync(resolvedPath, 'utf8');

  for (const line of raw.split(/\r?\n/u)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');

    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

function fail(message) {
  if (typeof message === 'string') {
    console.error(message);
    process.exit(1);
  }

  if (message instanceof Error) {
    console.error(message.stack ?? message.message);
    process.exit(1);
  }

  try {
    console.error(JSON.stringify(message, null, 2));
  } catch {
    console.error(String(message));
  }

  process.exit(1);
}

function normalizeText(value) {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, ' ')
    .trim();
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function timestamp() {
  return new Date().toLocaleString('es-ES', {
    hour12: false,
  });
}

function isRateLimitErrorMessage(message) {
  return typeof message === 'string' && message.includes('429');
}

function isNoResultErrorMessage(message) {
  return typeof message === 'string' && message.includes('Sin resultados de Wikipedia');
}

function isSelectionSticker(sticker) {
  return /^[A-Z]{3}\d+$/u.test(sticker.numero) && sticker.pais?.iso !== 'FWC' && sticker.pais?.iso !== 'COK';
}

function isPlayerSticker(sticker) {
  return isSelectionSticker(sticker) && sticker.nombre !== 'Escudo' && sticker.nombre !== 'Equipo';
}

function loadOverrides(overridesPath) {
  if (!overridesPath) {
    return {};
  }

  const resolvedPath = path.resolve(overridesPath);

  if (!fs.existsSync(resolvedPath)) {
    fail(`No existe el fichero de overrides: ${resolvedPath}`);
  }

  try {
    return JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
  } catch (error) {
    fail(
      `No se ha podido leer el fichero de overrides: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

function loadState(statePath) {
  const resolvedPath = path.resolve(statePath);

  if (!fs.existsSync(resolvedPath)) {
    return {};
  }

  try {
    const raw = fs.readFileSync(resolvedPath, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveState(statePath, state) {
  const resolvedPath = path.resolve(statePath);
  fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
  fs.writeFileSync(resolvedPath, JSON.stringify(state, null, 2));
}

function buildSearchQuery(sticker, override) {
  if (override?.search) {
    return override.search;
  }

  return `"${sticker.nombre}" ${sticker.pais?.nombre ?? ''} footballer`;
}

function buildSearchQueries(sticker, override) {
  if (override?.search) {
    return [override.search];
  }

  const queries = [];
  const playerName = sticker.nombre?.trim() ?? '';
  const countryName = sticker.pais?.nombre?.trim() ?? '';
  const normalizedPlayerName = normalizeText(playerName);
  const normalizedCountryName = normalizeText(countryName);
  const normalizedDisplayName = normalizedPlayerName
    .split(' ')
    .filter(Boolean)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(' ');
  const normalizedDisplayCountry = normalizedCountryName
    .split(' ')
    .filter(Boolean)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(' ');

  const candidates = [
    `"${playerName}" ${countryName} footballer`,
    `${playerName} ${countryName} footballer`,
    `"${playerName}" ${countryName} football`,
    `"${playerName}" soccer`,
  ];

  if (normalizedPlayerName && normalizedPlayerName !== normalizeText(playerName)) {
    candidates.push(
      `"${normalizedDisplayName}" ${normalizedDisplayCountry} footballer`,
      `${normalizedDisplayName} ${normalizedDisplayCountry} footballer`,
      `"${normalizedDisplayName}" soccer`,
    );
  }

  for (const query of candidates) {
    const trimmed = query.trim();

    if (trimmed && !queries.includes(trimmed)) {
      queries.push(trimmed);
    }
  }

  return queries;
}

async function wikipediaSearch(query) {
  const url = new URL(WIKIPEDIA_API_URL);
  url.searchParams.set('action', 'query');
  url.searchParams.set('format', 'json');
  url.searchParams.set('list', 'search');
  url.searchParams.set('srsearch', query);
  url.searchParams.set('srnamespace', '0');
  url.searchParams.set('srlimit', '5');
  url.searchParams.set('origin', '*');

  let lastStatus = 0;
  let lastStatusText = '';

  for (let attempt = 0; attempt <= SEARCH_RETRY_DELAYS_MS.length; attempt += 1) {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'cromos-mundial-2026/1.0',
      },
    });

    lastStatus = response.status;
    lastStatusText = response.statusText;

    if (response.ok) {
      const payload = await response.json();
      return payload.query?.search ?? [];
    }

    if (response.status !== 429 || attempt === SEARCH_RETRY_DELAYS_MS.length) {
      break;
    }

    await sleep(SEARCH_RETRY_DELAYS_MS[attempt]);
  }

  throw new Error(`Wikipedia search ${lastStatus} ${lastStatusText}`);
}

function chooseBestSearchResult(results, sticker, override) {
  if (!Array.isArray(results) || results.length === 0) {
    return null;
  }

  if (override?.title) {
    const forced = results.find((item) => item.title === override.title);
    if (forced) {
      return forced;
    }
  }

  const nameTokens = normalizeText(sticker.nombre).split(' ').filter(Boolean);
  const countryTokens = normalizeText(sticker.pais?.nombre ?? '').split(' ').filter(Boolean);

  const scored = results.map((item) => {
    const haystack = normalizeText(`${item.title} ${item.snippet ?? ''}`);
    const normalizedTitle = normalizeText(item.title);
    const normalizedName = normalizeText(sticker.nombre);
    let score = 0;

    if (normalizedTitle === normalizedName) {
      score += 20;
    } else if (normalizedTitle.includes(normalizedName)) {
      score += 10;
    }

    for (const token of nameTokens) {
      if (haystack.includes(token)) {
        score += 3;
      }
    }

    for (const token of countryTokens) {
      if (haystack.includes(token)) {
        score += 1;
      }
    }

    if (haystack.includes('footballer')) {
      score += 3;
    }

    if (haystack.includes('football')) {
      score += 1;
    }

    if (normalizedTitle.startsWith('list of ')) {
      score -= 10;
    }

    if (normalizedTitle.length < 5) {
      score -= 5;
    }

    return { item, score };
  });

  scored.sort((left, right) => right.score - left.score);

  const filtered = scored.filter(({ item, score }) => {
    const normalizedTitle = normalizeText(item.title);

    if (normalizedTitle.startsWith('list of ')) {
      return false;
    }

    return score > 0;
  });

  return filtered[0]?.item ?? null;
}

function chooseSearchCandidates(results, sticker, override) {
  if (!Array.isArray(results) || results.length === 0) {
    return [];
  }

  if (override?.title) {
    const forced = results.find((item) => item.title === override.title);
    if (forced) {
      return [forced];
    }
  }

  const nameTokens = normalizeText(sticker.nombre).split(' ').filter(Boolean);
  const countryTokens = normalizeText(sticker.pais?.nombre ?? '').split(' ').filter(Boolean);
  const normalizedName = normalizeText(sticker.nombre);

  return results
    .map((item) => {
      const haystack = normalizeText(`${item.title} ${item.snippet ?? ''}`);
      const normalizedTitle = normalizeText(item.title);
      let score = 0;

      if (normalizedTitle === normalizedName) {
        score += 20;
      } else if (normalizedTitle.startsWith(normalizedName)) {
        score += 12;
      } else if (normalizedTitle.includes(normalizedName)) {
        score += 10;
      }

      for (const token of nameTokens) {
        if (haystack.includes(token)) {
          score += 3;
        }
      }

      for (const token of countryTokens) {
        if (haystack.includes(token)) {
          score += 1;
        }
      }

      if (haystack.includes('footballer')) {
        score += 3;
      }

      if (haystack.includes('football')) {
        score += 1;
      }

      if (normalizedTitle.includes('born 19')) {
        score -= 6;
      }

      if (normalizedTitle.includes('born 20')) {
        score += 2;
      }

      if (normalizedTitle.startsWith('list of ')) {
        score -= 10;
      }

      if (normalizedTitle.length < 5) {
        score -= 5;
      }

      return { item, score };
    })
    .filter(({ item, score }) => {
      const normalizedTitle = normalizeText(item.title);

      if (normalizedTitle.startsWith('list of ')) {
        return false;
      }

      return score > 0;
    })
    .sort((left, right) => right.score - left.score)
    .map(({ item }) => item);
}

async function wikipediaPageImage(title) {
  const url = new URL(WIKIPEDIA_API_URL);
  url.searchParams.set('action', 'query');
  url.searchParams.set('format', 'json');
  url.searchParams.set('prop', 'pageimages');
  url.searchParams.set('piprop', 'original|thumbnail|name');
  url.searchParams.set('pithumbsize', String(PAGE_IMAGE_WIDTH));
  url.searchParams.set('titles', title);
  url.searchParams.set('origin', '*');

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'cromos-mundial-2026/1.0',
    },
  });

  if (!response.ok) {
    throw new Error(`Wikipedia image ${response.status} ${response.statusText}`);
  }

  const payload = await response.json();
  const pages = payload.query?.pages ?? {};
  const page = Object.values(pages)[0];

  if (!page || typeof page !== 'object') {
    return null;
  }

  const imageUrl = page.thumbnail?.source ?? page.original?.source ?? null;
  const imageName = page.pageimage ?? null;

  if (!imageUrl) {
    return null;
  }

  return {
    imageName,
    imageUrl,
    pageTitle: page.title ?? title,
  };
}

function inferExtension(contentType, imageUrl) {
  if (contentType?.includes('png')) {
    return 'png';
  }

  if (contentType?.includes('webp')) {
    return 'webp';
  }

  if (contentType?.includes('jpeg') || contentType?.includes('jpg')) {
    return 'jpg';
  }

  try {
    const pathname = new URL(imageUrl).pathname;
    const extension = path.extname(pathname).replace('.', '').toLowerCase();

    if (extension) {
      return extension;
    }
  } catch {
    return 'jpg';
  }

  return 'jpg';
}

async function downloadImage(imageUrl) {
  let lastStatus = 0;
  let lastStatusText = '';

  for (let attempt = 0; attempt <= SEARCH_RETRY_DELAYS_MS.length; attempt += 1) {
    const response = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'cromos-mundial-2026/1.0',
      },
    });

    lastStatus = response.status;
    lastStatusText = response.statusText;

    if (response.ok) {
      const contentType = response.headers.get('content-type') ?? 'image/jpeg';
      const bytes = Buffer.from(await response.arrayBuffer());
      return { bytes, contentType };
    }

    if (response.status !== 429 || attempt === SEARCH_RETRY_DELAYS_MS.length) {
      break;
    }

    await sleep(SEARCH_RETRY_DELAYS_MS[attempt]);
  }

  throw new Error(`Descarga de imagen ${lastStatus} ${lastStatusText}`);
}

async function ensureBucket(supabase, bucketName) {
  const { data, error } = await supabase.storage.getBucket(bucketName);

  if (error && !String(error.message).toLowerCase().includes('not found')) {
    throw error;
  }

  if (!data) {
    const { error: createError } = await supabase.storage.createBucket(bucketName, {
      public: true,
      allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
      fileSizeLimit: '5MB',
    });

    if (createError) {
      throw createError;
    }

    return;
  }

  if (!data.public) {
    const { error: updateError } = await supabase.storage.updateBucket(bucketName, {
      public: true,
      allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
      fileSizeLimit: '5MB',
    });

    if (updateError) {
      throw updateError;
    }
  }
}

async function fetchPlayerStickers(supabase) {
  const { data, error } = await supabase
    .from('cromos')
    .select('id, numero, nombre, avatar_url, pais:paises(nombre, iso)');

  if (error) {
    throw error;
  }

  return (data ?? [])
    .map((item) => ({
      ...item,
      pais: Array.isArray(item.pais) ? item.pais[0] ?? null : item.pais,
    }))
    .filter(isPlayerSticker)
    .sort((left, right) => left.numero.localeCompare(right.numero));
}

async function uploadHeadshot({ bucketName, dryRun, override, sticker, supabase }) {
  const searchQueries = buildSearchQueries(sticker, override);
  const attemptedTitles = [];
  let lastQueryWithResults = null;
  let resolvedImage = null;

  for (const searchQuery of searchQueries) {
    const searchResults = await wikipediaSearch(searchQuery);
    const candidates = override?.title
      ? [chooseBestSearchResult(searchResults, sticker, override)].filter(Boolean)
      : chooseSearchCandidates(searchResults, sticker, override);

    if (candidates.length === 0) {
      continue;
    }

    lastQueryWithResults = searchQuery;

    for (const candidate of candidates) {
      if (attemptedTitles.includes(candidate.title)) {
        continue;
      }

      attemptedTitles.push(candidate.title);

      if (normalizeText(candidate.title).startsWith('list of ')) {
        continue;
      }

      const image = await wikipediaPageImage(candidate.title);

      if (!image) {
        continue;
      }

      resolvedImage = {
        image,
        pageTitle: candidate.title,
        searchQuery,
      };
      break;
    }

    if (resolvedImage) {
      break;
    }
  }

  if (!resolvedImage) {
    if (attemptedTitles.length === 0) {
      throw new Error('Sin resultados de Wikipedia');
    }

    throw new Error(
      `No se encontro una pagina con imagen para ${sticker.nombre}. Probadas: ${attemptedTitles.join(', ')}`,
    );
  }

  const { image, searchQuery } = resolvedImage;

  if (dryRun) {
    return {
      avatarUrl: image.imageUrl,
      pageTitle: image.pageTitle,
      path: null,
      searchQuery,
      sourceImageName: image.imageName,
    };
  }

  const { bytes, contentType } = await downloadImage(image.imageUrl);
  const extension = inferExtension(contentType, image.imageUrl);
  const objectPath = `stickers/${sticker.id}.${extension}`;

  const { error: uploadError } = await supabase.storage.from(bucketName).upload(objectPath, bytes, {
    cacheControl: '31536000',
    contentType,
    upsert: true,
  });

  if (uploadError) {
    throw uploadError;
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(bucketName).getPublicUrl(objectPath);

  const { error: updateError } = await supabase
    .from('cromos')
    .update({ avatar_url: publicUrl })
    .eq('id', sticker.id);

  if (updateError) {
    throw updateError;
  }

  return {
    avatarUrl: publicUrl,
    pageTitle: image.pageTitle,
    path: objectPath,
    searchQuery,
    sourceImageName: image.imageName,
  };
}

async function main() {
  loadDotEnv();

  const options = parseArgs(process.argv.slice(2));
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucketName = options.bucket ?? process.env.SUPABASE_PLAYER_BUCKET ?? DEFAULT_BUCKET;

  if (!supabaseUrl) {
    fail('Falta VITE_SUPABASE_URL en .env');
  }

  if (!serviceRoleKey) {
    fail('Falta SUPABASE_SERVICE_ROLE_KEY en .env');
  }

  const overrides = loadOverrides(options.overrides);
  const state = loadState(options.stateFile);
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  if (!options.dryRun) {
    await ensureBucket(supabase, bucketName);
  }

  const stickers = await fetchPlayerStickers(supabase);
  const now = Date.now();
  const pendingStickers = options.force
    ? stickers
    : stickers.filter((sticker) => !sticker.avatar_url);
  const eligibleStickers = options.force
    ? pendingStickers
    : pendingStickers.filter((sticker) => {
        const entry = state[sticker.numero];
        return !entry?.retryAfter || entry.retryAfter <= now;
      });
  const cooledDownCount = pendingStickers.length - eligibleStickers.length;
  const limitedStickers = options.drain
    ? eligibleStickers.slice(options.offset)
    : eligibleStickers.slice(options.offset, options.offset + options.limit);
  const queue = limitedStickers.map((sticker) => ({ sticker, deferredAttempts: 0 }));
  const report = [];
  let rateLimitDeferrals = 0;

  console.log(
    `[${timestamp()}] Procesando ${limitedStickers.length} cromos de jugador${
      options.dryRun ? ' en dry-run' : ''
    }... (${cooledDownCount} en cooldown${options.drain ? ', modo drain' : ''})`,
  );

  if (limitedStickers.length === 0) {
    console.log(
      `[${timestamp()}] No hay cromos elegibles en esta tanda. Todo lo pendiente esta en cooldown.`,
    );
    saveState(options.stateFile, state);
    return;
  }

  while (queue.length > 0) {
    const current = queue.shift();

    if (!current) {
      break;
    }

    const { deferredAttempts, sticker } = current;

    try {
      await sleep(REQUEST_DELAY_MS);
      const result = await uploadHeadshot({
        bucketName,
        dryRun: options.dryRun,
        override: overrides[sticker.numero],
        sticker,
        supabase,
      });

      report.push({
        numero: sticker.numero,
        nombre: sticker.nombre,
        ok: true,
        ...result,
      });
      delete state[sticker.numero];

      console.log(`[OK] ${sticker.numero} ${sticker.nombre} -> ${result.pageTitle}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      if (isRateLimitErrorMessage(message) && options.drain) {
        console.log(
          `[${timestamp()}] [WAIT] ${sticker.numero} ${sticker.nombre} -> 429, se mueve al final y espera ${Math.round(COOLDOWN_ON_429_MS / 1000)}s`,
        );
        queue.push({
          sticker,
          deferredAttempts: deferredAttempts + 1,
        });
        rateLimitDeferrals += 1;
        await sleep(COOLDOWN_ON_429_MS);
        continue;
      }

      if (isRateLimitErrorMessage(message) && deferredAttempts < MAX_DEFERRED_ATTEMPTS) {
        console.log(
          `[${timestamp()}] [WAIT] ${sticker.numero} ${sticker.nombre} -> 429, reintentando al final (${deferredAttempts + 1}/${MAX_DEFERRED_ATTEMPTS}) y esperando ${Math.round(COOLDOWN_ON_429_MS / 1000)}s`,
        );
        queue.push({
          sticker,
          deferredAttempts: deferredAttempts + 1,
        });
        await sleep(COOLDOWN_ON_429_MS);
        continue;
      }

      if (isRateLimitErrorMessage(message) && deferredAttempts >= MAX_DEFERRED_ATTEMPTS) {
        state[sticker.numero] = {
          lastError: 'rate_limit',
          retryAfter: Date.now() + RATE_LIMIT_RETRY_AFTER_MS,
        };
        report.push({
          numero: sticker.numero,
          nombre: sticker.nombre,
          ok: false,
          error: 'Rate limited en esta tanda; se aplaza 60 minutos',
        });

        console.log(
          `[${timestamp()}] [SKIP] ${sticker.numero} ${sticker.nombre} -> 429 persistente en esta tanda, cooldown 60 minutos`,
        );
        continue;
      }

      if (isNoResultErrorMessage(message)) {
        state[sticker.numero] = {
          lastError: 'no_result',
          retryAfter: Date.now() + NO_RESULT_RETRY_AFTER_MS,
        };
      }

      report.push({
        numero: sticker.numero,
        nombre: sticker.nombre,
        ok: false,
        error: message,
      });

      console.log(`[${timestamp()}] [FAIL] ${sticker.numero} ${sticker.nombre} -> ${message}`);
    }
  }

  const successCount = report.filter((item) => item.ok).length;
  const reportPath = path.resolve(
    'supabase',
    options.dryRun ? 'player_headshots_dry_run_report.json' : 'player_headshots_import_report.json',
  );

  saveState(options.stateFile, state);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log(`[${timestamp()}] Resumen: ${successCount}/${report.length} correctos`);
  if (options.drain) {
    console.log(`[${timestamp()}] Reencolados por 429 durante la ejecucion: ${rateLimitDeferrals}`);
  }
  console.log(`[${timestamp()}] Reporte: ${reportPath}`);
}

void main().catch((error) => {
  fail(error);
});
