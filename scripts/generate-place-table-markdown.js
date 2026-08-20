import { readFileSync, writeFileSync } from 'node:fs';

const input = new URL('../data/dodam_places_beta.csv', import.meta.url);
const output = new URL('../data/dodam_places_table.md', import.meta.url);
const rows = readCsv(readFileSync(input, 'utf8'));
const byDistrict = Object.groupBy(rows, ({ district }) => district);
const lines = [
  '# 도담 장소 후보 표',
  '',
  `총 ${rows.length}개 Point 후보입니다. 원본 전체 필드는 [dodam_places_beta.csv](./dodam_places_beta.csv)에서 확인할 수 있습니다.`,
  '',
  '이 표는 GitHub에서 읽기 쉽게 핵심 필드만 표시합니다. 지도 링크는 장소명·상세주소 기반 네이버 지도 검색입니다.',
  ''
];

for (const district of ['관악', '종로']) {
  const districtRows = byDistrict[district] ?? [];
  lines.push(`## ${district}구 (${districtRows.length}개)`, '');
  for (const category of ['건강 간편식', '힐링 공간', '공원', '산책로', '운동 스팟']) {
    const group = districtRows.filter((row) => row.wellness_type === category);
    if (!group.length) continue;
    lines.push(`### ${category} (${group.length}개)`, '', '| 장소명 | 상세주소 | 좌표 | 상태 | 지도 |', '| --- | --- | --- | --- | --- |');
    for (const row of group) {
      const query = encodeURIComponent(`${row.place_name} ${row.address}`);
      lines.push(`| ${escapeCell(row.place_name)} | ${escapeCell(row.address)} | ${row.latitude}, ${row.longitude} | ${row.source_status} | [보기](https://map.naver.com/p/search/${query}) |`);
    }
    lines.push('');
  }
}

writeFileSync(output, `${lines.join('\n').trimEnd()}\n`, 'utf8');
console.log(`Wrote ${rows.length} rows to ${output.pathname}`);

function escapeCell(value) { return String(value).replace(/\|/g, '\\|').replace(/\r?\n/g, ' '); }
function readCsv(text) { const lines = text.trim().split(/\r?\n/); const header = parse(lines.shift()); return lines.map((line) => Object.fromEntries(parse(line).map((value, index) => [header[index], value]))); }
function parse(line) { const out = []; let value = ''; let quoted = false; for (let i = 0; i < line.length; i += 1) { const char = line[i]; if (char === '"' && line[i + 1] === '"') { value += '"'; i += 1; } else if (char === '"') quoted = !quoted; else if (char === ',' && !quoted) { out.push(value); value = ''; } else value += char; } out.push(value); return out; }
