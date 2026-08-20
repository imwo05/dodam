import { readFileSync, writeFileSync } from 'node:fs';

const ids = new Set(process.argv.slice(2));
const output = new URL('../data/dodam_places_beta.csv', import.meta.url);
const lines = readFileSync(output, 'utf8').trim().split(/\r?\n/);
const retained = [lines[0], ...lines.slice(1).filter((line) => !ids.has(line.split('","')[0].replace(/^"/, '')))];
writeFileSync(output, `${retained.join('\n')}\n`, 'utf8');
console.log(`Removed ${lines.length - retained.length} rows.`);
