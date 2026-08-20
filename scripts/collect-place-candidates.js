import { readFileSync, writeFileSync } from 'node:fs';
import { loadEnvFile } from '../src/lib/env.js';

loadEnvFile();

const SEARCH_URL = 'https://naverapihub.apigw.ntruss.com/search/v1/local';
const GEOCODE_URL = 'https://maps.apigw.ntruss.com/map-geocode/v2/geocode';
const OUTPUT = new URL('../data/dodam_places_beta.csv', import.meta.url);
const REQUIRED_PER_CATEGORY = 80;
const CATEGORIES = {
  '건강 간편식': { keywords: ['샐러드', '포케', '그릭요거트', '아사이볼', '샌드위치', '비건식', '샐러드 도시락', '다이어트 도시락', '건강식', '주스', '스무디'], menu: '샐러드·포케·그릭요거트·아사이볼·신선 샌드위치 및 건강식 검색 후보', tags: '#건강간편식 #혼밥 #짧은체류 #검수필요' },
  '힐링 공간': { keywords: ['조용한 카페', '카페', '커피', '북카페', '독립서점', '도서관', '음악감상실', 'LP카페', '갤러리', '전시', '문화공간', '작은도서관'], menu: '조용한 카페·독립서점·도서관·음악감상·문화 공간 검색 후보', tags: '#힐링공간 #조용한 #혼자좋은 #검수필요' },
  '공원': { keywords: ['공원', '어린이공원', '근린공원', '녹지', '쌈지공원', '쉼터', '놀이터', '정자', '광장', '휴식공간', '산책'], menu: '잠깐 쉬거나 가볍게 걷기 좋은 공원·녹지·휴식 공간 검색 후보', tags: '#공원 #잠깐휴식 #산책 #검수필요' },
  '산책로': { keywords: ['산책로', '둘레길', '자락길', '하천길', '골목길', '등산로', '숲길', '문화거리', '보행로', '산책', '전망대'], menu: '혼자 걷기 좋은 하천·골목·숲·문화 산책 구간 검색 후보', tags: '#산책로 #혼자좋은 #걷기 #검수필요' },
  '운동 스팟': { keywords: ['헬스장', '필라테스', '요가', '체육센터', '운동장', '체력단련장', '탁구장', '수영장', '배드민턴장', '풋살장', '생활체육'], menu: '가볍게 운동을 시작할 수 있는 체육·요가·필라테스·운동 공간 검색 후보', tags: '#운동스팟 #가벼운시작 #회복 #검수필요' }
};
const DISTRICTS = {
  관악: ['봉천동', '신림동', '남현동', '난곡동', '난향동', '조원동', '대학동', '미성동', '서원동', '신원동', '인헌동', '행운동', '청룡동', '은천동', '성현동', '중앙동', '청림동', '삼성동', '보라매동', '낙성대', '서울대입구', '샤로수길'],
  종로: ['청운동', '효자동', '사직동', '삼청동', '부암동', '평창동', '무악동', '교남동', '가회동', '종로1가', '종로2가', '종로3가', '종로4가', '종로5가', '종로6가', '이화동', '혜화동', '창신동', '숭인동', '서촌', '북촌', '대학로', '인사동', '익선동']
};
const LARGE_CHAIN_PATTERN = /스타벅스|투썸|이디야|메가커피|컴포즈|빽다방|할리스|폴바셋|탐앤탐스|커피빈|파스쿠찌|던킨|파리바게뜨|뚜레쥬르|서브웨이|스포애니|커브스|바디채널/i;
const [targetDistrict, targetCategory] = process.argv.slice(2);
if (!DISTRICTS[targetDistrict] || !CATEGORIES[targetCategory]) throw new Error('Usage: node scripts/collect-place-candidates.js <관악|종로> <건강 간편식|힐링 공간|공원|산책로|운동 스팟>');

const requiredEnv = ['NAVER_SEARCH_CLIENT_ID', 'NAVER_SEARCH_CLIENT_SECRET', 'NAVER_MAPS_CLIENT_ID', 'NAVER_MAPS_CLIENT_SECRET'];
for (const key of requiredEnv) if (!process.env[key]) throw new Error(`${key} is required`);

const existing = readCsv(readFileSync(OUTPUT, 'utf8'));
const existingNames = new Set(existing.map((row) => normalize(row.place_name)));
const existingAddresses = new Set(existing.map((row) => normalize(row.address)));
const collected = new Map();

for (const [district, areas] of Object.entries(DISTRICTS).filter(([district]) => district === targetDistrict)) {
  for (const [category, spec] of Object.entries(CATEGORIES).filter(([category]) => category === targetCategory)) {
    const key = `${district}:${category}`;
    collected.set(key, []);
    const queries = areas.flatMap((area) => spec.keywords.flatMap((keyword) => [`${district} ${area} ${keyword}`, `${area} ${keyword}`]));
    for (const batch of chunk(queries, 4)) {
      const results = await Promise.all(batch.map((query) => search(query)));
      for (const items of results) {
        for (const item of items) addCandidate({ district, category, spec, item });
      }
      if (collected.get(key).length >= REQUIRED_PER_CATEGORY + 20) break;
    }
    console.log(`${key}: ${collected.get(key).length} unique API candidates`);
  }
}

const shortages = [...collected.entries()].filter(([, rows]) => rows.length < REQUIRED_PER_CATEGORY);
if (shortages.length) {
  throw new Error(`Not enough candidates: ${shortages.map(([key, rows]) => `${key}=${rows.length}`).join(', ')}`);
}

const verified = [];
for (const [key, rows] of collected.entries()) {
  for (const batch of chunk(rows, 4)) {
    if (verified.filter((row) => row.district === key.split(':')[0] && row.category === key.split(':')[1]).length >= REQUIRED_PER_CATEGORY) break;
    const locations = await Promise.all(batch.map((row) => geocode(row.address)));
    for (let index = 0; index < batch.length; index += 1) {
      if (locations[index] && verified.filter((row) => row.district === key.split(':')[0] && row.category === key.split(':')[1]).length < REQUIRED_PER_CATEGORY) verified.push({ ...batch[index], ...locations[index] });
    }
  }
  if (verified.filter((row) => row.district === key.split(':')[0] && row.category === key.split(':')[1]).length < REQUIRED_PER_CATEGORY) throw new Error(`${key}: fewer than ${REQUIRED_PER_CATEGORY} geocoded candidates`);
  console.log(`${key}: geocoded ${REQUIRED_PER_CATEGORY}`);
}

const sequenceByDistrict = Object.fromEntries(Object.keys(DISTRICTS).map((district) => [district, Math.max(100, ...existing.filter((row) => row.district === district).map((row) => Number(row.place_id.match(/_(\d+)$/)?.[1] ?? 0)))]));
const newRows = verified.map((row) => {
  const number = ++sequenceByDistrict[row.district];
  return {
    place_id: `pt_${row.district === '관악' ? 'gwanak' : 'jongno'}_${String(number).padStart(3, '0')}`,
    place_name: row.place_name,
    place_kind: 'POINT', district: row.district, wellness_type: row.category, address: row.address,
    image_url: '', latitude: row.latitude, longitude: row.longitude,
    description: `${row.menu}. NAVER API HUB 지역 검색·Maps Geocoding 확인(2026-08-21). 소규모 다점포 여부·실제 운영·주력 목적·혼자 방문 경험은 최종 검수 전 보류 후보입니다.`,
    experience_tip: '방문 전 당일 영업, 정확한 출입 위치, 혼잡도와 혼자 머물기 좋은 좌석·동선을 확인하세요.',
    mood_tags: row.tags, source_status: 'CANDIDATE'
  };
});

writeFileSync(OUTPUT, `${toCsv(existing)}\n${toCsv(newRows, false)}\n`, 'utf8');
console.log(`Wrote ${newRows.length} candidates; total ${existing.length + newRows.length} points.`);

async function search(query) {
  const url = new URL(SEARCH_URL);
  url.searchParams.set('query', query); url.searchParams.set('display', '5'); url.searchParams.set('start', '1'); url.searchParams.set('sort', 'random'); url.searchParams.set('format', 'json');
  let response;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    response = await fetch(url, { headers: apiHubHeaders(process.env.NAVER_SEARCH_CLIENT_ID, process.env.NAVER_SEARCH_CLIENT_SECRET) });
    if (response.status !== 429) break;
    await wait(1000 * (attempt + 1));
  }
  if (!response.ok) throw new Error(`Search ${response.status}: ${query}`);
  return (await response.json()).items ?? [];
}

function addCandidate({ district, category, spec, item }) {
  const address = item.roadAddress || item.address || '';
  const placeName = stripTags(item.title || '');
  if (!placeName || !address.includes(`서울특별시 ${district}구`) || LARGE_CHAIN_PATTERN.test(placeName)) return;
  const key = `${district}:${category}`;
  const rows = collected.get(key);
  const nameKey = normalize(placeName); const addressKey = normalize(address);
  if (existingNames.has(nameKey) || existingAddresses.has(addressKey) || rows.some((row) => normalize(row.place_name) === nameKey || normalize(row.address) === addressKey)) return;
  rows.push({ district, category, place_name: placeName, address, menu: spec.menu, tags: spec.tags });
}

async function geocode(query) {
  const url = new URL(GEOCODE_URL); url.searchParams.set('query', query);
  const response = await fetch(url, { headers: apiHubHeaders(process.env.NAVER_MAPS_CLIENT_ID, process.env.NAVER_MAPS_CLIENT_SECRET) });
  if (!response.ok) throw new Error(`Geocoding ${response.status}: ${query}`);
  const item = (await response.json()).addresses?.[0];
  return item ? { address: item.roadAddress || item.jibunAddress, latitude: Number(item.y), longitude: Number(item.x) } : null;
}

function apiHubHeaders(id, secret) { return { 'x-ncp-apigw-api-key-id': id, 'x-ncp-apigw-api-key': secret }; }
function normalize(value) { return String(value).toLowerCase().replace(/\s+/g, '').replace(/[^0-9a-z가-힣]/g, ''); }
function stripTags(value) { return value.replace(/<\/?b>/g, ''); }
function chunk(items, size) { return Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, index * size + size)); }
function wait(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function readCsv(text) { const [header, ...lines] = text.trim().split(/\r?\n/); return lines.map((line) => Object.fromEntries(parse(line).map((value, index) => [parse(header)[index], value]))); }
function parse(line) { const out = []; let value = ''; let quoted = false; for (let i = 0; i < line.length; i += 1) { const char = line[i]; if (char === '"' && line[i + 1] === '"') { value += '"'; i += 1; } else if (char === '"') quoted = !quoted; else if (char === ',' && !quoted) { out.push(value); value = ''; } else value += char; } out.push(value); return out; }
function toCsv(rows, header = true) { const fields = ['place_id', 'place_name', 'place_kind', 'district', 'wellness_type', 'address', 'image_url', 'latitude', 'longitude', 'description', 'experience_tip', 'mood_tags', 'source_status']; const line = (row) => fields.map((field) => `"${String(row[field] ?? '').replace(/"/g, '""')}"`).join(','); return `${header ? `${fields.join(',')}\n` : ''}${rows.map(line).join('\n')}`; }
