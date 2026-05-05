#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const DEFAULT_BUCKET = 'player-headshots-sportsdb';
const DEFAULT_API_KEY = '123';
const DEFAULT_COUNTRY_ISO = 'ESP';
const EXCLUDED_COUNTRY_ISOS = new Set(['FWC', 'COK']);
const REQUEST_DELAY_MS = 1200;
const SEARCH_RETRY_DELAYS_MS = [1500, 3500, 7000];
const COOLDOWN_ON_429_MS = 30000;
const RATE_LIMIT_RETRY_AFTER_MS = 60 * 60 * 1000;
const MAX_DEFERRED_ATTEMPTS = 2;
const DEFAULT_REPORT_PATH = path.resolve(
  'supabase',
  'player_headshots_sportsdb_spain_report.json',
);
const DEFAULT_DEV_MAP_PATH = path.resolve(
  'src',
  'data',
  'devSportsdbSpainHeadshots.json',
);
const DEFAULT_STATE_PATH = path.resolve(
  'supabase',
  'player_headshots_sportsdb_state.json',
);

function parseArgs(argv) {
  const options = {
    allCountries: false,
    bucket: undefined,
    countryIso: DEFAULT_COUNTRY_ISO,
    dryRun: false,
    force: false,
    limit: Number.POSITIVE_INFINITY,
    reportPath: DEFAULT_REPORT_PATH,
    devMapPath: DEFAULT_DEV_MAP_PATH,
    overrides: undefined,
    stateFile: DEFAULT_STATE_PATH,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--dry-run') {
      options.dryRun = true;
      continue;
    }

    if (arg === '--all-countries') {
      options.allCountries = true;
      continue;
    }

    if (arg === '--force') {
      options.force = true;
      continue;
    }

    if (arg === '--bucket') {
      options.bucket = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === '--country') {
      options.countryIso = String(argv[index + 1] ?? DEFAULT_COUNTRY_ISO).toUpperCase();
      index += 1;
      continue;
    }

    if (arg === '--limit') {
      options.limit = Number.parseInt(argv[index + 1] ?? '', 10);
      index += 1;
      continue;
    }

    if (arg === '--report-path') {
      options.reportPath = argv[index + 1] ?? options.reportPath;
      index += 1;
      continue;
    }

    if (arg === '--overrides') {
      options.overrides = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === '--dev-map-path') {
      options.devMapPath = argv[index + 1] ?? options.devMapPath;
      index += 1;
      continue;
    }

    if (arg === '--state-file') {
      options.stateFile = argv[index + 1] ?? options.stateFile;
      index += 1;
      continue;
    }
  }

  if (!Number.isFinite(options.limit) || options.limit <= 0) {
    options.limit = Number.POSITIVE_INFINITY;
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

  console.error(String(message));
  process.exit(1);
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

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function timestamp() {
  return new Date().toLocaleString('es-ES', { hour12: false });
}

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, ' ')
    .trim();
}

function isRateLimitErrorMessage(message) {
  return typeof message === 'string' && message.includes('429');
}

function isPlayerSticker(sticker) {
  return (
    /^[A-Z]{3}\d+$/u.test(sticker.numero) &&
    !EXCLUDED_COUNTRY_ISOS.has(sticker.pais?.iso ?? '') &&
    sticker.nombre !== 'Escudo' &&
    sticker.nombre !== 'Equipo'
  );
}

function slugifyForSportsDb(value) {
  return normalizeText(value).replace(/\s+/gu, '_');
}

async function fetchJson(url) {
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
      return response.json();
    }

    if (response.status !== 429 || attempt === SEARCH_RETRY_DELAYS_MS.length) {
      break;
    }

    await sleep(SEARCH_RETRY_DELAYS_MS[attempt]);
  }

  throw new Error(`SportsDB ${lastStatus} ${lastStatusText}`);
}

function buildSportsDbSearchUrl(apiKey, playerName) {
  const url = new URL(`https://www.thesportsdb.com/api/v1/json/${apiKey}/searchplayers.php`);
  url.searchParams.set('p', playerName);
  return url;
}

function buildSportsDbLookupUrl(apiKey, playerId) {
  const url = new URL(`https://www.thesportsdb.com/api/v1/json/${apiKey}/lookupplayer.php`);
  url.searchParams.set('id', String(playerId));
  return url;
}

function scoreSportsDbCandidate(candidate, sticker) {
  const normalizedPlayerName = normalizeText(sticker.nombre);
  const normalizedCandidateName = normalizeText(candidate.strPlayer);
  const normalizedNationality = normalizeText(candidate.strNationality);
  const normalizedCountry = normalizeText(sticker.pais?.nombre ?? '');
  const normalizedTeam = normalizeText(candidate.strTeam);
  const playerTokens = normalizedPlayerName.split(' ').filter(Boolean);
  const candidateTokens = normalizedCandidateName.split(' ').filter(Boolean);
  const overlappingTokens = playerTokens.filter((token) => candidateTokens.includes(token));
  let score = 0;

  if (normalizedCandidateName === normalizedPlayerName) {
    score += 20;
  } else if (playerTokens.length > 1 && playerTokens.every((token) => candidateTokens.includes(token))) {
    score += 12;
  } else if (normalizedCandidateName.startsWith(normalizedPlayerName)) {
    score += 10;
  }

  score += overlappingTokens.length * 3;

  if (candidate.strSport === 'Soccer') {
    score += 8;
  }

  if (normalizedNationality === normalizedCountry) {
    score += 12;
  }

  if (normalizedTeam === normalizedCountry) {
    score += 8;
  }

  if (candidate.strRender) {
    score += 6;
  }

  if (candidate.strCutout) {
    score += 4;
  }

  if (candidate.strThumb) {
    score += 2;
  }

  if (candidate.strCreativeCommons === 'Yes') {
    score += 1;
  }

  return score;
}

function chooseSportsDbCandidate(players, sticker) {
  if (!Array.isArray(players) || players.length === 0) {
    return null;
  }

  const soccerPlayers = players.filter((candidate) => candidate.strSport === 'Soccer');
  const poolBySport = soccerPlayers.length > 0 ? soccerPlayers : players;
  const normalizedCountry = normalizeText(sticker.pais?.nombre ?? '');
  const sameNationalityPlayers = poolBySport.filter(
    (candidate) => normalizeText(candidate.strNationality) === normalizedCountry,
  );
  const poolByNationality = sameNationalityPlayers.length > 0 ? sameNationalityPlayers : poolBySport;
  const scored = poolByNationality
    .map((candidate) => ({ candidate, score: scoreSportsDbCandidate(candidate, sticker) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score);

  return scored[0]?.candidate ?? null;
}

function pickSportsDbImage(candidate) {
  if (candidate.strRender) {
    return { type: 'render', url: candidate.strRender };
  }

  if (candidate.strCutout) {
    return { type: 'cutout', url: candidate.strCutout };
  }

  if (candidate.strThumb) {
    return { type: 'thumb', url: candidate.strThumb };
  }

  return null;
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
      const contentType = response.headers.get('content-type') ?? 'image/png';
      const bytes = Buffer.from(await response.arrayBuffer());
      return { bytes, contentType };
    }

    if (response.status !== 429 || attempt === SEARCH_RETRY_DELAYS_MS.length) {
      break;
    }

    await sleep(SEARCH_RETRY_DELAYS_MS[attempt]);
  }

  throw new Error(`Descarga SportsDB ${lastStatus} ${lastStatusText}`);
}

function inferExtension(contentType, imageUrl) {
  if (contentType.includes('png')) {
    return 'png';
  }

  if (contentType.includes('webp')) {
    return 'webp';
  }

  if (contentType.includes('jpeg') || contentType.includes('jpg')) {
    return 'jpg';
  }

  try {
    const pathname = new URL(imageUrl).pathname;
    const extension = path.extname(pathname).replace('.', '').toLowerCase();
    return extension || 'png';
  } catch {
    return 'png';
  }
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

async function fetchCountryStickers(supabase) {
  const { data, error } = await supabase
    .from('cromos')
    .select('id, numero, nombre, avatar_url, avatar_url_sportsdb, pais:paises(nombre, iso)')
    .order('numero');

  if (error) {
    throw error;
  }

  return (data ?? [])
    .map((item) => ({
      ...item,
      pais: Array.isArray(item.pais) ? item.pais[0] ?? null : item.pais,
    }))
    .filter(isPlayerSticker);
}

async function fetchPlayerStickers(supabase, countryIso, allCountries) {
  const stickers = await fetchCountryStickers(supabase);

  if (allCountries) {
    return stickers;
  }

  return stickers.filter((item) => item.pais?.iso === countryIso);
}

async function uploadSportsDbHeadshot({
  apiKey,
  bucketName,
  dryRun,
  override,
  sticker,
  supabase,
}) {
  let candidate = null;
  let sourceUrl = '';
  let forcedImage = null;

  if (override?.imageUrl) {
    forcedImage = {
      type: override.imageType ?? 'override',
      url: override.imageUrl,
    };
    sourceUrl = override.sourceUrl ?? override.imageUrl;
  }

  if (!forcedImage && override?.playerId) {
    const lookupUrl = buildSportsDbLookupUrl(apiKey, override.playerId);
    const payload = await fetchJson(lookupUrl);
    candidate = payload.players?.[0] ?? payload.player?.[0] ?? null;
    sourceUrl = lookupUrl.toString();
  } else if (!forcedImage) {
    const searchUrl = buildSportsDbSearchUrl(apiKey, override?.search ?? sticker.nombre);
    const payload = await fetchJson(searchUrl);
    candidate = chooseSportsDbCandidate(payload.player, sticker);
    sourceUrl = searchUrl.toString();
  }

  if (!forcedImage && !candidate) {
    throw new Error('Sin candidato valido en TheSportsDB');
  }

  const image = forcedImage ?? pickSportsDbImage(candidate);

  if (!image) {
    throw new Error(`Sin imagen usable en TheSportsDB para ${candidate.strPlayer}`);
  }

  if (dryRun) {
    return {
      avatarUrl: image.url,
      candidateName: override?.candidateName ?? candidate?.strPlayer ?? sticker.nombre,
      creativeCommons: override?.creativeCommons ?? candidate?.strCreativeCommons ?? null,
      imageType: image.type,
      objectPath: null,
      sourceTeam: override?.sourceTeam ?? candidate?.strTeam ?? null,
      sourceUrl,
    };
  }

  const { bytes, contentType } = await downloadImage(image.url);
  const extension = inferExtension(contentType, image.url);
  const objectPath = `stickers-${sticker.pais?.iso?.toLowerCase() ?? 'misc'}/${sticker.id}.${extension}`;

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
    .update({ avatar_url_sportsdb: publicUrl })
    .eq('id', sticker.id);

  if (updateError) {
    throw updateError;
  }

  return {
    avatarUrl: publicUrl,
    candidateName: override?.candidateName ?? candidate?.strPlayer ?? sticker.nombre,
    creativeCommons: override?.creativeCommons ?? candidate?.strCreativeCommons ?? null,
    imageType: image.type,
    objectPath,
    sourceTeam: override?.sourceTeam ?? candidate?.strTeam ?? null,
    sourceUrl,
  };
}

function saveJson(targetPath, payload) {
  const resolvedPath = path.resolve(targetPath);
  fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
  fs.writeFileSync(resolvedPath, JSON.stringify(payload, null, 2));
}

function saveProgress({ devMapPath, report, reportPath, state, stateFile }) {
  const devMap = Object.fromEntries(
    report
      .filter((item) => item.ok && item.avatarUrl)
      .map((item) => [item.numero, item.avatarUrl]),
  );

  saveState(stateFile, state);
  saveJson(reportPath, report);
  saveJson(devMapPath, devMap);
}

async function main() {
  loadDotEnv();

  const options = parseArgs(process.argv.slice(2));
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const apiKey = process.env.THESPORTSDB_API_KEY ?? DEFAULT_API_KEY;
  const bucketName =
    options.bucket ?? process.env.SUPABASE_PLAYER_BUCKET_SPORTSDB ?? DEFAULT_BUCKET;

  if (!supabaseUrl) {
    fail('Falta VITE_SUPABASE_URL en .env');
  }

  if (!serviceRoleKey) {
    fail('Falta SUPABASE_SERVICE_ROLE_KEY en .env');
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
  const overrides = loadOverrides(options.overrides);
  const state = loadState(options.stateFile);

  if (!options.dryRun) {
    await ensureBucket(supabase, bucketName);
  }

  const stickers = await fetchPlayerStickers(supabase, options.countryIso, options.allCountries);
  const now = Date.now();
  const pendingStickers = options.force
    ? stickers
    : stickers.filter((sticker) => {
        const entry = state[sticker.numero];
        return !entry?.done;
      });
  const eligibleStickers = options.force
    ? pendingStickers
    : pendingStickers.filter((sticker) => {
        const entry = state[sticker.numero];
        return !entry?.retryAfter || entry.retryAfter <= now;
      });
  const cooledDownCount = pendingStickers.length - eligibleStickers.length;
  const limitedStickers = eligibleStickers.slice(0, options.limit);
  const report = [];
  const queue = limitedStickers.map((sticker) => ({ sticker, deferredAttempts: 0 }));
  let rateLimitDeferrals = 0;

  console.log(
    `[${timestamp()}] Procesando ${limitedStickers.length} cromos de ${
      options.allCountries ? 'todas las selecciones' : options.countryIso
    } en TheSportsDB${options.dryRun ? ' (dry-run)' : ''}... (${cooledDownCount} en cooldown)`,
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
      const result = await uploadSportsDbHeadshot({
        apiKey,
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
      state[sticker.numero] = {
        done: true,
        updatedAt: Date.now(),
      };
      saveProgress({
        devMapPath: options.devMapPath,
        report,
        reportPath: options.reportPath,
        state,
        stateFile: options.stateFile,
      });

      console.log(
        `[OK] ${sticker.numero} ${sticker.nombre} -> ${result.candidateName} (${result.imageType})`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      if (isRateLimitErrorMessage(message) && deferredAttempts < MAX_DEFERRED_ATTEMPTS) {
        console.log(
          `[${timestamp()}] [WAIT] ${sticker.numero} ${sticker.nombre} -> 429, reintentando al final (${deferredAttempts + 1}/${MAX_DEFERRED_ATTEMPTS}) y esperando ${Math.round(COOLDOWN_ON_429_MS / 1000)}s`,
        );
        queue.push({
          sticker,
          deferredAttempts: deferredAttempts + 1,
        });
        rateLimitDeferrals += 1;
        await sleep(COOLDOWN_ON_429_MS);
        continue;
      }

      if (isRateLimitErrorMessage(message) && deferredAttempts >= MAX_DEFERRED_ATTEMPTS) {
        state[sticker.numero] = {
          done: false,
          lastError: 'rate_limit',
          retryAfter: Date.now() + RATE_LIMIT_RETRY_AFTER_MS,
          updatedAt: Date.now(),
        };
        report.push({
          numero: sticker.numero,
          nombre: sticker.nombre,
          ok: false,
          error: 'Rate limited en esta tanda; se aplaza 60 minutos',
        });
        saveProgress({
          devMapPath: options.devMapPath,
          report,
          reportPath: options.reportPath,
          state,
          stateFile: options.stateFile,
        });
        console.log(
          `[${timestamp()}] [SKIP] ${sticker.numero} ${sticker.nombre} -> 429 persistente, cooldown 60 minutos`,
        );
        continue;
      }

      state[sticker.numero] = {
        done: false,
        lastError: message,
        updatedAt: Date.now(),
      };
      report.push({
        numero: sticker.numero,
        nombre: sticker.nombre,
        ok: false,
        error: message,
      });
      saveProgress({
        devMapPath: options.devMapPath,
        report,
        reportPath: options.reportPath,
        state,
        stateFile: options.stateFile,
      });
      console.log(`[FAIL] ${sticker.numero} ${sticker.nombre} -> ${message}`);
    }
  }

  saveProgress({
    devMapPath: options.devMapPath,
    report,
    reportPath: options.reportPath,
    state,
    stateFile: options.stateFile,
  });

  const successCount = report.filter((item) => item.ok).length;
  console.log(`[${timestamp()}] Resumen: ${successCount}/${report.length} correctos`);
  console.log(`[${timestamp()}] Reencolados por 429: ${rateLimitDeferrals}`);
  console.log(`[${timestamp()}] Reporte: ${path.resolve(options.reportPath)}`);
  console.log(`[${timestamp()}] Mapa dev: ${path.resolve(options.devMapPath)}`);
  console.log(`[${timestamp()}] Estado: ${path.resolve(options.stateFile)}`);
}

void main().catch((error) => {
  fail(error);
});
