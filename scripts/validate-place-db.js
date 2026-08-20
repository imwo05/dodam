import assert from 'node:assert/strict';
import { loadPlaceSource, validatePlaceSource } from '../src/data/place-source.js';

const source = loadPlaceSource();
const validation = validatePlaceSource(source);
assert.equal(validation.valid, true, validation.errors.join('\n'));
console.log(`Place source valid: ${validation.counts.points} points, ${validation.counts.segments} segments, ${validation.counts.experiences} experiences`);
console.log('Segment self-loops:', source.segments.filter((segment) => segment.start_place_id === segment.end_place_id).map((segment) => segment.segment_id).join(', ') || 'none');
