import { createStore } from '../src/data/store.js';
import { createRepositories } from '../src/data/repositories/index.js';
import { buildSeedPlaces, loadPlaceSource } from '../src/data/place-source.js';
import { loadEnvFile } from '../src/lib/env.js';

loadEnvFile();
const source = loadPlaceSource();
const { places } = buildSeedPlaces(source);
const repositories = createRepositories({ store: createStore(), adapter: 'supabase' });
let imported = 0;

for (const place of places) {
  await repositories.place.upsertSeed(place);
  imported += 1;
}

console.log(`Seeded ${imported} Places (${source.points.length} points, ${source.segments.length} segments).`);
console.log('Import is idempotent on source_id; no CSV data is read by the application server.');
