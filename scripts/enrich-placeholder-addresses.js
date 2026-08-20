import { readFileSync, writeFileSync } from 'node:fs';
import { loadEnvFile } from '../src/lib/env.js';

loadEnvFile();
const SEARCH_URL = 'https://naverapihub.apigw.ntruss.com/search/v1/local';
const GEOCODE_URL = 'https://maps.apigw.ntruss.com/map-geocode/v2/geocode';
const output = new URL('../data/dodam_places_beta.csv', import.meta.url);
const rows = readCsv(readFileSync(output, 'utf8'));
const targets = rows.filter((row) => row.address.includes('상세 도로명·좌표 검수 필요'));
let updated = 0;

for (const batch of chunk(targets, 4)) {
  const matches = await Promise.all(batch.map(findVerifiedAddress));
  for (let index = 0; index < batch.length; index += 1) {
    const verified = matches[index];
    if (!verified) continue;
    Object.assign(batch[index], verified);
    updated += 1;
  }
}

writeFileSync(output, `${toCsv(rows)}\n`, 'utf8');
console.log(JSON.stringify({ placeholders: targets.length, updated, unresolved: targets.length - updated }));

async function findVerifiedAddress(row) {
  const url = new URL(SEARCH_URL);
  url.searchParams.set('query', `${row.place_name} ${row.district}구`);
  url.searchParams.set('display', '5'); url.searchParams.set('format', 'json');
  const response = await fetch(url, { headers: headers(process.env.NAVER_SEARCH_CLIENT_ID, process.env.NAVER_SEARCH_CLIENT_SECRET) });
  if (!response.ok) return null;
  const item = ((await response.json()).items ?? []).find((candidate) => {
    const address = candidate.roadAddress || candidate.address || '';
    return address.includes(`서울특별시 ${row.district}구`) && normalize(candidate.title) === normalize(row.place_name);
  });
  if (!item) return null;
  const address = item.roadAddress || item.address;
  const geoUrl = new URL(GEOCODE_URL); geoUrl.searchParams.set('query', address);
  const geo = await fetch(geoUrl, { headers: headers(process.env.NAVER_MAPS_CLIENT_ID, process.env.NAVER_MAPS_CLIENT_SECRET) });
  if (!geo.ok) return null;
  const location = (await geo.json()).addresses?.[0];
  if (!location?.roadAddress) return null;
  return {
    address: location.roadAddress, latitude: String(location.y), longitude: String(location.x),
    description: `${row.description} NAVER API HUB 지역 검색·Maps Geocoding으로 도로명 주소·좌표를 재확인했습니다(2026-08-21).`
  };
}

function headers(id, secret) { return { 'x-ncp-apigw-api-key-id': id, 'x-ncp-apigw-api-key': secret }; }
function normalize(value) { return String(value).replace(/<\/?b>/g, '').toLowerCase().replace(/\s+/g, '').replace(/[^0-9a-z가-힣]/g, ''); }
function chunk(items, size) { return Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, index * size + size)); }
function readCsv(text) { const lines = text.trim().split(/\r?\n/); const header = parse(lines.shift()); return lines.map((line) => Object.fromEntries(parse(line).map((value, index) => [header[index], value]))); }
function parse(line) { const out = []; let value = ''; let quoted = false; for (let i = 0; i < line.length; i += 1) { const char = line[i]; if (char === '"' && line[i + 1] === '"') { value += '"'; i += 1; } else if (char === '"') quoted = !quoted; else if (char === ',' && !quoted) { out.push(value); value = ''; } else value += char; } out.push(value); return out; }
function toCsv(items) { const fields = ['place_id', 'place_name', 'place_kind', 'district', 'wellness_type', 'address', 'image_url', 'latitude', 'longitude', 'description', 'experience_tip', 'mood_tags', 'source_status']; const line = (row) => fields.map((field) => `"${String(row[field] ?? '').replace(/"/g, '""')}"`).join(','); return `${fields.join(',')}\n${items.map(line).join('\n')}`; }
