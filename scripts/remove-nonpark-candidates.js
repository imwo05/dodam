import { readFileSync, writeFileSync } from 'node:fs';

const output = new URL('../data/dodam_places_beta.csv', import.meta.url);
const rows = readCsv(readFileSync(output, 'utf8'));
const nonPark = /카페|커피|식당|음식|삼겹|해장|은행|금고|자동차|호텔|아파트|학교|교회|병원|의원|약국|마트|편의점|미용|헤어|피트니스|필라테스|요가|탁구|배드민턴|운동장|체육|사무소|주민센터|화장실|충전소|주차장|웨딩|골프|키즈|시장|빵|베이커리|보호소|회관/i;
const removed = rows.filter((row) => row.wellness_type === '공원' && (nonPark.test(row.place_name) || nonPark.test(row.address)));
const retained = rows.filter((row) => !removed.includes(row));
writeFileSync(output, `${toCsv(retained)}\n`, 'utf8');
console.log(JSON.stringify({ removed: removed.length, byDistrict: Object.groupBy(removed, ({ district }) => district) }, null, 2));

function readCsv(text) { const lines = text.trim().split(/\r?\n/); const header = parse(lines.shift()); return lines.map((line) => Object.fromEntries(parse(line).map((value, index) => [header[index], value]))); }
function parse(line) { const out = []; let value = ''; let quoted = false; for (let i = 0; i < line.length; i += 1) { const char = line[i]; if (char === '"' && line[i + 1] === '"') { value += '"'; i += 1; } else if (char === '"') quoted = !quoted; else if (char === ',' && !quoted) { out.push(value); value = ''; } else value += char; } out.push(value); return out; }
function toCsv(items) { const fields = ['place_id', 'place_name', 'place_kind', 'district', 'wellness_type', 'address', 'image_url', 'latitude', 'longitude', 'description', 'experience_tip', 'mood_tags', 'source_status']; const line = (row) => fields.map((field) => `"${String(row[field] ?? '').replace(/"/g, '""')}"`).join(','); return `${fields.join(',')}\n${items.map(line).join('\n')}`; }
