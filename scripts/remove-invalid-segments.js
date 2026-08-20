import { readFileSync, writeFileSync } from 'node:fs';

const places = new Set(readFileSync(new URL('../data/dodam_places_beta.csv', import.meta.url), 'utf8').trim().split(/\r?\n/).slice(1).map((line) => line.split('","')[0].replace(/^"/, '')));
const output = new URL('../data/dodam_walk_segments_beta.csv', import.meta.url);
const lines = readFileSync(output, 'utf8').trim().split(/\r?\n/);
const retained = [lines[0], ...lines.slice(1).filter((line) => { const cells = line.split('","'); return places.has(cells[3]) && places.has(cells[4]); })];
writeFileSync(output, `${retained.join('\n')}\n`, 'utf8');
console.log(`Removed ${lines.length - retained.length} invalid segments.`);
