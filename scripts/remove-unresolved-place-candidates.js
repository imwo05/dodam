import { readFileSync, writeFileSync } from 'node:fs';

const output = new URL('../data/dodam_places_beta.csv', import.meta.url);
const rows = readCsv(readFileSync(output, 'utf8'));
const retained = rows.filter((row) => !row.address.includes('상세 도로명·좌표 검수 필요'));
console.log(`Removed ${rows.length - retained.length} unresolved candidates.`);
writeFileSync(output, `${toCsv(retained)}\n`, 'utf8');

function readCsv(text) { const lines = text.trim().split(/\r?\n/); const header = parse(lines.shift()); return lines.map((line) => Object.fromEntries(parse(line).map((value, index) => [header[index], value]))); }
function parse(line) { const out = []; let value = ''; let quoted = false; for (let i = 0; i < line.length; i += 1) { const char = line[i]; if (char === '"' && line[i + 1] === '"') { value += '"'; i += 1; } else if (char === '"') quoted = !quoted; else if (char === ',' && !quoted) { out.push(value); value = ''; } else value += char; } out.push(value); return out; }
function toCsv(items) { const fields = ['place_id', 'place_name', 'place_kind', 'district', 'wellness_type', 'address', 'image_url', 'latitude', 'longitude', 'description', 'experience_tip', 'mood_tags', 'source_status']; const line = (row) => fields.map((field) => `"${String(row[field] ?? '').replace(/"/g, '""')}"`).join(','); return `${fields.join(',')}\n${items.map(line).join('\n')}`; }
