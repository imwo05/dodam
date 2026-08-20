import { readFileSync } from 'node:fs';

const DATA_URL = new URL('../../data/', import.meta.url);
const ACTIVITY_BY_WELLNESS = [
  ['운동', 'EXERCISE'],
  ['산책', 'WALK'],
  ['자연', 'WALK'],
  ['독서', 'MENTAL_HEALTH'],
  ['집중', 'MENTAL_HEALTH'],
  ['휴식', 'MENTAL_HEALTH'],
  ['문화', 'MENTAL_HEALTH']
];

export function loadBetaPlaceDb() {
  const places = readCsv('dodam_places_beta.csv');
  const segments = readCsv('dodam_walk_segments_beta.csv');
  const experiences = readCsv('dodam_experiences_beta.csv');
  return { places, segments, experiences };
}

export function betaPointsAsPlaces() {
  return loadBetaPlaceDb().places.map((point, index) => ({
    id: `plc_beta_${String(index + 1).padStart(3, '0')}`,
    creatorId: 'usr_900',
    name: point.place_name,
    address: point.address,
    latitude: Number(point.latitude),
    longitude: Number(point.longitude),
    activityType: activityTypeFor(point.wellness_type),
    durationMinutes: null,
    description: point.description,
    tip: point.experience_tip,
    imageUrls: point.image_url ? [point.image_url] : [],
    placeDbId: point.place_id,
    placeKind: point.place_kind,
    district: point.district,
    wellnessType: point.wellness_type,
    moodTags: point.mood_tags.split(' ').filter(Boolean),
    sourceStatus: point.source_status,
    createdAt: '2026-08-20T00:00:00.000Z'
  }));
}

function readCsv(filename) {
  const text = readFileSync(new URL(filename, DATA_URL), 'utf8').trim();
  const [header, ...rows] = text.split(/\r?\n/).filter(Boolean).map(parseCsvLine);
  return rows.map((row) => Object.fromEntries(header.map((name, index) => [name, row[index] ?? ''])));
}

function parseCsvLine(line) {
  const cells = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"' && line[i + 1] === '"') { cell += '"'; i += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === ',' && !quoted) { cells.push(cell); cell = ''; }
    else cell += char;
  }
  cells.push(cell);
  return cells;
}

function activityTypeFor(wellnessType) {
  return ACTIVITY_BY_WELLNESS.find(([keyword]) => wellnessType.includes(keyword))?.[1] ?? 'CUSTOM';
}
