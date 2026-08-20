import { readFileSync, writeFileSync } from 'node:fs';

const [district, countArg] = process.argv.slice(2);
const requestedCount = Number(countArg ?? 80);
if (!['관악', '종로'].includes(district) || !Number.isInteger(requestedCount) || requestedCount < 1) throw new Error('Usage: node scripts/build-walk-segment-candidates.js <관악|종로> [count]');

const placesUrl = new URL('../data/dodam_places_beta.csv', import.meta.url);
const segmentsUrl = new URL('../data/dodam_walk_segments_beta.csv', import.meta.url);
const places = readCsv(readFileSync(placesUrl, 'utf8'));
const segments = readCsv(readFileSync(segmentsUrl, 'utf8'));
const prefix = district === '관악' ? 'gwanak' : 'jongno';
const candidates = places
  .filter((place) => place.district === district && Number.isFinite(Number(place.latitude)) && Number.isFinite(Number(place.longitude)))
  .map((place) => ({ ...place, latitude: Number(place.latitude), longitude: Number(place.longitude) }));
const usedPairs = new Set(segments.filter((segment) => segment.district === district).map((segment) => pairKey(segment.start_place_id, segment.end_place_id)));
const edges = [];

for (let i = 0; i < candidates.length; i += 1) {
  for (let j = i + 1; j < candidates.length; j += 1) {
    const start = candidates[i]; const end = candidates[j]; const distance = Math.round(haversine(start, end));
    const key = pairKey(start.place_id, end.place_id);
    if (distance >= 120 || distance > 1200 || usedPairs.has(key)) continue;
    edges.push({ start, end, distance, key });
  }
}

edges.sort((a, b) => a.distance - b.distance);
const selected = [];
const endpointUse = new Map();
for (const edge of edges) {
  if (selected.length === requestedCount) break;
  const startCount = endpointUse.get(edge.start.place_id) ?? 0;
  const endCount = endpointUse.get(edge.end.place_id) ?? 0;
  if (startCount >= 3 || endCount >= 3) continue;
  selected.push(edge); endpointUse.set(edge.start.place_id, startCount + 1); endpointUse.set(edge.end.place_id, endCount + 1);
}
if (selected.length < requestedCount) throw new Error(`${district}: walk segment pairs insufficient (${selected.length})`);

const highestId = Math.max(0, ...segments.filter((segment) => segment.segment_id.startsWith(`sg_${prefix}_`)).map((segment) => Number(segment.segment_id.match(/_(\d+)$/)?.[1] ?? 0)));
const rows = selected.map((edge, index) => ({
  segment_id: `sg_${prefix}_${String(highestId + index + 1).padStart(3, '0')}`,
  segment_name: `${edge.start.place_name}–${edge.end.place_name} 보행 연결`, district,
  start_place_id: edge.start.place_id, end_place_id: edge.end.place_id, distance_m: edge.distance,
  estimated_walk_min: Math.max(3, Math.ceil(edge.distance / 70)), activity_intensity: edge.distance >= 700 ? 'MEDIUM' : 'LOW',
  route_description: '주소·좌표가 확인된 두 장소를 연결한 실제 보행 동선 후보입니다. 보도 상태와 도로 횡단 여부는 지도·현장 검수 전 확인이 필요합니다.',
  safety_tip: '횡단보도·보도 폭·야간 조명을 확인하고, 공사·통제 구간은 우회하세요.',
  mood_tags: '#산책로 #보행연결 #혼자걷기 #검수필요', source_status: 'CANDIDATE'
}));
writeFileSync(segmentsUrl, `${toCsv(segments)}\n${toCsv(rows, false)}\n`, 'utf8');
console.log(`Wrote ${rows.length} ${district} walk-segment candidates.`);

function haversine(a, b) { const r = 6371000; const rad = (value) => value * Math.PI / 180; const dLat = rad(b.latitude - a.latitude); const dLng = rad(b.longitude - a.longitude); const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLng / 2) ** 2; return 2 * r * Math.asin(Math.sqrt(h)); }
function pairKey(a, b) { return [a, b].sort().join(':'); }
function readCsv(text) { const lines = text.trim().split(/\r?\n/); const header = parse(lines.shift()); return lines.map((line) => Object.fromEntries(parse(line).map((value, index) => [header[index], value]))); }
function parse(line) { const out = []; let value = ''; let quoted = false; for (let i = 0; i < line.length; i += 1) { const char = line[i]; if (char === '"' && line[i + 1] === '"') { value += '"'; i += 1; } else if (char === '"') quoted = !quoted; else if (char === ',' && !quoted) { out.push(value); value = ''; } else value += char; } out.push(value); return out; }
function toCsv(rows, header = true) { const fields = ['segment_id', 'segment_name', 'district', 'start_place_id', 'end_place_id', 'distance_m', 'estimated_walk_min', 'activity_intensity', 'route_description', 'safety_tip', 'mood_tags', 'source_status']; const line = (row) => fields.map((field) => `"${String(row[field] ?? '').replace(/"/g, '""')}"`).join(','); return `${header ? `${fields.join(',')}\n` : ''}${rows.map(line).join('\n')}`; }
