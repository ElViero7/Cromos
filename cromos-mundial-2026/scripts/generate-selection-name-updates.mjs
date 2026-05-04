#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

function fail(message) {
  console.error(message);
  process.exit(1);
}

const [, , inputPath, outputPathArg] = process.argv;

if (!inputPath) {
  fail(
    'Uso: node scripts/generate-selection-name-updates.mjs <ruta-json> [ruta-sql-salida]',
  );
}

const resolvedInputPath = path.resolve(inputPath);

if (!fs.existsSync(resolvedInputPath)) {
  fail(`No existe el fichero JSON: ${resolvedInputPath}`);
}

const raw = fs.readFileSync(resolvedInputPath, 'utf8');

let payload;

try {
  payload = JSON.parse(raw);
} catch (error) {
  fail(`El fichero no es JSON valido: ${error instanceof Error ? error.message : String(error)}`);
}

if (!payload || !Array.isArray(payload.cromos)) {
  fail('El JSON no tiene la estructura esperada: falta el array "cromos".');
}

const selectionStickerPattern = /^([A-Z]{3})\s+(\d{3})\s+(.+)$/;
const skippedCountries = new Set(['FWC', 'CC']);
const isoAliases = {
  HAI: 'HTI',
  KSA: 'SAU',
};
const updates = [];

for (const sticker of payload.cromos) {
  if (!sticker || typeof sticker.nombre !== 'string') {
    continue;
  }

  const match = sticker.nombre.trim().match(selectionStickerPattern);

  if (!match) {
    continue;
  }

  const [, rawCountryIso, stickerNumber, stickerName] = match;
  const countryIso = isoAliases[rawCountryIso] ?? rawCountryIso;

  if (skippedCountries.has(countryIso)) {
    continue;
  }

  const numero = `${countryIso}${Number.parseInt(stickerNumber, 10)}`;
  const nombre = stickerName.replace(/\s+\*$/, '').trim();

  updates.push({ numero, nombre });
}

if (updates.length === 0) {
  fail('No se ha detectado ningun cromo de seleccion en el JSON.');
}

const uniqueUpdates = Array.from(
  new Map(updates.map((item) => [item.numero, item])).values(),
).sort((left, right) => left.numero.localeCompare(right.numero));

const escapeSqlText = (value) => value.replaceAll("'", "''");

const sql = [
  'begin;',
  '',
  '-- Actualiza solo nombres de cromos de selecciones usando el export de cromosrepes.',
  'update public.cromos as c',
  'set nombre = v.nombre',
  'from (values',
  uniqueUpdates
    .map(
      ({ numero, nombre }, index) =>
        `  ${index === 0 ? '' : ','}('${escapeSqlText(numero)}', '${escapeSqlText(nombre)}')`,
    )
    .join('\n'),
  ') as v(numero, nombre)',
  'where c.numero = v.numero;',
  '',
  'commit;',
  '',
].join('\n');

const resolvedOutputPath = outputPathArg
  ? path.resolve(outputPathArg)
  : path.resolve('supabase', 'update_selection_names.sql');

fs.mkdirSync(path.dirname(resolvedOutputPath), { recursive: true });
fs.writeFileSync(resolvedOutputPath, sql);

console.log(`SQL generado en: ${resolvedOutputPath}`);
console.log(`Cromos de seleccion preparados: ${uniqueUpdates.length}`);
