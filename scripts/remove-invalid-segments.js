import { readFileSync, writeFileSync } from 'node:fs';

const places = new Set(readCsv(readFileSync(new URL('../data/dodam_places_beta.csv', import.meta.url), 'utf8')).map((row) => row.place_id));
const output = new URL('../data/dodam_walk_segments_beta.csv', import.meta.url);
const lines = readFileSync(output, 'utf8').trim().split(/\r?\n/);
const retained = [lines[0], ...lines.slice(1).filter((line) => {
  const row = parse(line);
  return places.has(row[3]) && places.has(row[4]) && Number(row[5]) > 0 && Number(row[6]) > 0;
})];
writeFileSync(output, `${retained.join('\n')}\n`, 'utf8');
console.log(`Removed ${lines.length - retained.length} invalid segments.`);

function readCsv(text) {
  const [header, ...lines] = text.trim().split(/\r?\n/);
  return lines.map((line) => Object.fromEntries(parse(line).map((value, index) => [parse(header)[index], value])));
}

function parse(line) {
  const out = []; let value = ''; let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"' && line[i + 1] === '"') { value += '"'; i += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === ',' && !quoted) { out.push(value); value = ''; }
    else value += char;
  }
  out.push(value);
  return out;
}
