import { readFileSync, writeFileSync } from 'node:fs';

const output = new URL('../data/dodam_places_beta.csv', import.meta.url);
const rows = readCsv(readFileSync(output, 'utf8'));
const matchers = {
  '건강 간편식': /샐러드|포케|요거트|아사이|샌드위치|비건|스무디|주스|건강식|다이어트|도시락|보울|볼|랩/i,
  '힐링 공간': /카페|커피|북카페|서점|도서관|음악|LP|갤러리|미술관|박물관|문화|문학|전시|공예|책방|아트/i,
  '공원': /공원|녹지|산|계곡|숲|놀이터|광장|마당/i,
  '운동 스팟': /헬스|피트니스|필라테스|요가|체육|운동|탁구|배드민턴|수영|풋살|축구|PT|짐|볼링/i
};
const obviousCommercial = /헤어|미용|뷰티|네일|와인|칵테일|주류|아가방|의류|안경|부동산|약국|병원|의원|요양|인테리어|대리점|편의점|GS25|BBQ|닭강정|활어회|낙지|생선|한우|오징어|닭개장|호프|베이커리|장난감|스터디카페|아이스크림|식당|맛집|스파|클래스|출판|사단법인|협동조합|기획|빌딩|상가|주택/i;
const facilityOnly = /화장실|주차장|충전소|대피장소|무더위쉼터|한파쉼터|입구$|안내소|관리사무소|음수대|운동기구|운동장운동장|농구장|롤러스케이트장|테니스장|수영장주차장/i;
const parkFacility = /주민센터|아파트|학교|교회|웨딩|시장|사무소|대여소|경로당|회관|체육|운동장|반려|강아지|키즈|놀이터|유아숲체험장/i;
const healingOnly = /아파트|홈플러스|복지관|청년센터|장난감|어린이|무더위쉼터/i;
const activityOnly = /학교|대학교|아파트|대피장소|화장실|주차장|충전소|관공서|경찰청/i;
// 검색어의 일부가 공원·산·숲과 겹쳤지만, 실제 공원/녹지 Point가 아닌 결과를 재검수해 기록한다.
const notStandalonePark = /^(51녹지관리초|광장이엠씨|동경산책 서울대입구점|도토리숲 신림점|신림마당|남도마당|신림계곡어린이물놀이장|당곡 유아숲체험원|공원|꼬소한부뚜막 광화문광장점|비어광장|송현문화공원\(2028년예정\)|삼청공원입구|배스킨라빈스 삼청마당점|넓은마당|녹지 종로직영점|산모퉁이|인왕산공원입구|인왕산 호랑이동상|인왕산 유아숲체험원|숲니스|공간풀숲|보리수숲|숲울림flower class|백사실계곡입구|아리계곡 종각점|한옥숲)$/i;
const removed = rows.filter((row) => {
  const matcher = matchers[row.wellness_type];
  if (!matcher) return false;
  const text = `${row.place_name} ${row.address}`;
  if (obviousCommercial.test(row.place_name) || facilityOnly.test(text)) return true;
  if (row.wellness_type === '공원' && parkFacility.test(text)) return true;
  if (row.wellness_type === '공원' && notStandalonePark.test(row.place_name)) return true;
  if (row.wellness_type === '힐링 공간' && healingOnly.test(text)) return true;
  if (row.wellness_type === '운동 스팟' && activityOnly.test(text)) return true;
  return !matcher.test(row.place_name);
});
const retained = rows.filter((row) => !removed.includes(row));
writeFileSync(output, `${toCsv(retained)}\n`, 'utf8');
const by = {};
for (const row of removed) { const key = `${row.district}:${row.wellness_type}`; by[key] = (by[key] ?? 0) + 1; }
console.log(JSON.stringify({ removed: removed.length, by }, null, 2));

function readCsv(text) { const lines = text.trim().split(/\r?\n/); const header = parse(lines.shift()); return lines.map((line) => Object.fromEntries(parse(line).map((value, index) => [header[index], value]))); }
function parse(line) { const out = []; let value = ''; let quoted = false; for (let i = 0; i < line.length; i += 1) { const char = line[i]; if (char === '"' && line[i + 1] === '"') { value += '"'; i += 1; } else if (char === '"') quoted = !quoted; else if (char === ',' && !quoted) { out.push(value); value = ''; } else value += char; } out.push(value); return out; }
function toCsv(items) { const fields = ['place_id', 'place_name', 'place_kind', 'district', 'wellness_type', 'address', 'image_url', 'latitude', 'longitude', 'description', 'experience_tip', 'mood_tags', 'source_status']; const line = (row) => fields.map((field) => `"${String(row[field] ?? '').replace(/"/g, '""')}"`).join(','); return `${fields.join(',')}\n${items.map(line).join('\n')}`; }
