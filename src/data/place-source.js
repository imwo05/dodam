import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const DEFAULT_DATA_DIRECTORY = resolve(fileURLToPath(new URL('../../data/place-seed/', import.meta.url)));

// This is the explicit seed/import boundary. Runtime repositories do not call
// this module; they read the places table instead.
const ACTIVITY_BY_WELLNESS = [
  ['운동', 'EXERCISE'],
  ['산책', 'WALK'],
  ['자연', 'WALK'],
  ['독서', 'MENTAL_HEALTH'],
  ['집중', 'MENTAL_HEALTH'],
  ['휴식', 'MENTAL_HEALTH'],
  ['문화', 'MENTAL_HEALTH']
];

export function loadPlaceSource({ dataDirectory = DEFAULT_DATA_DIRECTORY } = {}) {
  return {
    points: readCsv(resolve(dataDirectory, 'dodam_places_beta.csv')),
    segments: readCsv(resolve(dataDirectory, 'dodam_walk_segments_beta.csv')),
    experiences: readCsv(resolve(dataDirectory, 'dodam_experiences_beta.csv'))
  };
}

export function validatePlaceSource(source) {
  const points = source?.points ?? [];
  const segments = source?.segments ?? [];
  const experiences = source?.experiences ?? [];
  const errors = [];
  const pointIds = new Set();
  const segmentIds = new Set();

  if (points.length !== 16) errors.push(`expected 16 points, found ${points.length}`);
  if (segments.length !== 8) errors.push(`expected 8 segments, found ${segments.length}`);
  if (experiences.length !== 12) errors.push(`expected 12 experiences, found ${experiences.length}`);

  for (const point of points) {
    if (pointIds.has(point.place_id)) errors.push(`${point.place_id}: duplicate place_id`);
    pointIds.add(point.place_id);
    if (point.place_kind !== 'POINT') errors.push(`${point.place_id}: place_kind must be POINT`);
    if (!validCoordinate(point.latitude, point.longitude)) errors.push(`${point.place_id}: invalid coordinates`);
    for (const field of ['place_name', 'address', 'description', 'experience_tip', 'mood_tags']) {
      if (!point[field]) errors.push(`${point.place_id}: ${field} is required`);
    }
  }

  for (const segment of segments) {
    if (segmentIds.has(segment.segment_id)) errors.push(`${segment.segment_id}: duplicate segment_id`);
    segmentIds.add(segment.segment_id);
    if (!pointIds.has(segment.start_place_id)) errors.push(`${segment.segment_id}: missing start point ${segment.start_place_id}`);
    if (!pointIds.has(segment.end_place_id)) errors.push(`${segment.segment_id}: missing end point ${segment.end_place_id}`);
    if (!positiveNumber(segment.distance_m) || !positiveNumber(segment.estimated_walk_min)) {
      errors.push(`${segment.segment_id}: distance_m and estimated_walk_min must be positive`);
    }
    if (!['LOW', 'MEDIUM', 'HIGH'].includes(String(segment.activity_intensity).toUpperCase())) {
      errors.push(`${segment.segment_id}: activity_intensity is invalid`);
    }
  }

  for (const experience of experiences) {
    if (!pointIds.has(experience.place_id)) errors.push(`${experience.experience_id}: missing point ${experience.place_id}`);
    if (experience.segment_id && !segmentIds.has(experience.segment_id)) {
      errors.push(`${experience.experience_id}: missing segment ${experience.segment_id}`);
    }
    if (!positiveNumber(experience.available_minutes)) {
      errors.push(`${experience.experience_id}: available_minutes must be positive`);
    }
    if (!['LOW', 'MEDIUM', 'HIGH'].includes(String(experience.activity_intensity).toUpperCase())) {
      errors.push(`${experience.experience_id}: activity_intensity is invalid`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    counts: { points: points.length, segments: segments.length, experiences: experiences.length }
  };
}

export function buildSeedPlaces(source) {
  const validation = validatePlaceSource(source);
  if (!validation.valid) {
    const error = new Error(`Invalid Place source: ${validation.errors.join('; ')}`);
    error.validation = validation;
    throw error;
  }

  const experiencesByPoint = groupBy(source.experiences, (row) => row.place_id);
  const experiencesBySegment = groupBy(source.experiences.filter((row) => row.segment_id), (row) => row.segment_id);
  const pointsById = new Map(source.points.map((point) => [point.place_id, point]));

  const points = source.points.map((point) => {
    const experiences = experiencesByPoint.get(point.place_id) ?? [];
    const atmosphereTags = unique([
      ...normalizeTags(point.mood_tags),
      ...experiences.flatMap((experience) => normalizeTags(experience.mood_tags))
    ]);
    const intensities = unique(experiences.map((experience) => normalizeIntensity(experience.activity_intensity)));
    return {
      id: stableSeedId(point.place_id),
      sourceId: point.place_id,
      creatorId: null,
      name: point.place_name,
      description: point.description,
      tip: point.experience_tip,
      address: point.address,
      district: point.district || null,
      geometryType: 'POINT',
      latitude: number(point.latitude),
      longitude: number(point.longitude),
      activityType: activityTypeFor(point.wellness_type),
      experienceCategories: [],
      sourceWellnessType: point.wellness_type || null,
      atmosphereTags,
      tags: atmosphereTags,
      intensity: intensities.length === 1 ? intensities[0] : null,
      soloFriendly: null,
      imageUrls: point.image_url ? [point.image_url] : [],
      status: 'ACTIVE',
      source: 'SEED',
      createdAt: '2026-08-20T00:00:00.000Z',
      updatedAt: '2026-08-20T00:00:00.000Z',
      sourceMetadata: {
        placeKind: point.place_kind,
        sourceStatus: point.source_status || null,
        rawMoodTags: point.mood_tags || '',
        experienceIds: experiences.map((experience) => experience.experience_id),
        experiences,
        experienceIntensities: intensities,
        intensityConflict: intensities.length > 1,
        sourceRow: point
      }
    };
  });

  const segments = source.segments.map((segment) => {
    const start = pointsById.get(segment.start_place_id);
    const end = pointsById.get(segment.end_place_id);
    const experiences = experiencesBySegment.get(segment.segment_id) ?? [];
    const segmentIntensity = normalizeIntensity(segment.activity_intensity);
    const experienceIntensities = unique(experiences.map((experience) => normalizeIntensity(experience.activity_intensity)));
    return {
      id: stableSeedId(segment.segment_id),
      sourceId: segment.segment_id,
      creatorId: null,
      name: segment.segment_name,
      description: segment.route_description,
      tip: segment.safety_tip,
      address: start?.address ?? '',
      district: segment.district || null,
      geometryType: 'SEGMENT',
      startLatitude: number(start?.latitude),
      startLongitude: number(start?.longitude),
      endLatitude: number(end?.latitude),
      endLongitude: number(end?.longitude),
      encodedPolyline: null,
      distanceMeters: number(segment.distance_m),
      durationMinutes: number(segment.estimated_walk_min),
      activityType: 'WALK',
      experienceCategories: ['WALK'],
      sourceWellnessType: null,
      atmosphereTags: unique([
        ...normalizeTags(segment.mood_tags),
        ...experiences.flatMap((experience) => normalizeTags(experience.mood_tags))
      ]),
      tags: unique([
        ...normalizeTags(segment.mood_tags),
        ...experiences.flatMap((experience) => normalizeTags(experience.mood_tags))
      ]),
      intensity: segmentIntensity,
      soloFriendly: null,
      imageUrls: [],
      status: 'ACTIVE',
      source: 'SEED',
      createdAt: '2026-08-20T00:00:00.000Z',
      updatedAt: '2026-08-20T00:00:00.000Z',
      sourceMetadata: {
        placeKind: 'SEGMENT',
        sourceStatus: segment.source_status || null,
        startPlaceId: segment.start_place_id,
        endPlaceId: segment.end_place_id,
        selfLoop: segment.start_place_id === segment.end_place_id,
        experienceIds: experiences.map((experience) => experience.experience_id),
        experiences,
        experienceIntensities,
        intensityConflict: experienceIntensities.length > 1,
        sourceRow: segment
      }
    };
  });

  return { points, segments, places: [...points, ...segments] };
}

export function stableSeedId(sourceId) {
  return `plc_${String(sourceId)}`;
}

export function normalizeTags(value) {
  return String(value ?? '')
    .split(/\s+/)
    .map((tag) => tag.trim().replace(/^#/, ''))
    .filter(Boolean);
}

function activityTypeFor(wellnessType) {
  return ACTIVITY_BY_WELLNESS.find(([keyword]) => String(wellnessType ?? '').includes(keyword))?.[1] ?? 'CUSTOM';
}

function readCsv(filename) {
  const text = readFileSync(filename, 'utf8').replace(/^\uFEFF/, '').trim();
  if (!text) return [];
  const [header, ...rows] = text.split(/\r?\n/).filter(Boolean).map(parseCsvLine);
  return rows.map((row) => Object.fromEntries(header.map((name, index) => [name, row[index] ?? ''])));
}

function parseCsvLine(line) {
  const cells = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"' && line[index + 1] === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      cells.push(cell);
      cell = '';
    } else {
      cell += char;
    }
  }
  cells.push(cell);
  return cells;
}

function groupBy(rows, key) {
  const grouped = new Map();
  for (const row of rows) {
    const value = key(row);
    if (!grouped.has(value)) grouped.set(value, []);
    grouped.get(value).push(row);
  }
  return grouped;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function normalizeIntensity(value) {
  const normalized = String(value ?? '').toUpperCase();
  return ['LOW', 'MEDIUM', 'HIGH'].includes(normalized) ? normalized : null;
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function positiveNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0;
}

function validCoordinate(latitude, longitude) {
  const lat = Number(latitude);
  const lng = Number(longitude);
  return Number.isFinite(lat) && lat >= -90 && lat <= 90
    && Number.isFinite(lng) && lng >= -180 && lng <= 180;
}
