import assert from 'node:assert/strict';
import { loadBetaPlaceDb } from '../src/data/place-db.js';

const { places, segments, experiences } = loadBetaPlaceDb();
const placeIds = new Set(places.map((row) => row.place_id));
const segmentIds = new Set(segments.map((row) => row.segment_id));

assert.ok(places.length > 0, '장소(Point)가 1건 이상 필요합니다.');
assert.ok(segments.length > 0, '산책 구간(Segment)이 1건 이상 필요합니다.');
assert.ok(experiences.length > 0, '경험(Experience)이 1건 이상 필요합니다.');
assert.equal(placeIds.size, places.length, 'place_id는 고유해야 합니다.');
assert.equal(segmentIds.size, segments.length, 'segment_id는 고유해야 합니다.');

for (const place of places) {
  assert.equal(place.place_kind, 'POINT', `${place.place_id}: place_kind는 POINT여야 합니다.`);
  assert.ok(['서초', '종로'].includes(place.district), `${place.place_id}: 베타 생활권 밖입니다.`);
  assert.ok(Number(place.latitude) >= 37 && Number(place.latitude) <= 38, `${place.place_id}: latitude가 올바르지 않습니다.`);
  assert.ok(Number(place.longitude) >= 126 && Number(place.longitude) <= 128, `${place.place_id}: longitude가 올바르지 않습니다.`);
  for (const field of ['place_name', 'wellness_type', 'address', 'description', 'experience_tip', 'mood_tags']) {
    assert.ok(place[field], `${place.place_id}: ${field}가 필요합니다.`);
  }
}
for (const segment of segments) {
  assert.ok(placeIds.has(segment.start_place_id), `${segment.segment_id}: 시작 장소가 없습니다.`);
  assert.ok(placeIds.has(segment.end_place_id), `${segment.segment_id}: 종료 장소가 없습니다.`);
  assert.ok(Number(segment.distance_m) > 0 && Number(segment.estimated_walk_min) > 0, `${segment.segment_id}: 거리 또는 시간이 올바르지 않습니다.`);
}
for (const experience of experiences) {
  assert.ok(placeIds.has(experience.place_id), `${experience.experience_id}: 장소가 없습니다.`);
  assert.ok(!experience.segment_id || segmentIds.has(experience.segment_id), `${experience.experience_id}: 산책 구간이 없습니다.`);
  assert.ok(Number(experience.available_minutes) > 0, `${experience.experience_id}: available_minutes가 올바르지 않습니다.`);
}

console.log(`Place DB valid: ${places.length} points, ${segments.length} segments, ${experiences.length} experiences`);
