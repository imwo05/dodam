import { readFileSync, writeFileSync } from 'node:fs';

const placesPath = new URL('../data/dodam_places_beta.csv', import.meta.url);
const experiencesPath = new URL('../data/dodam_experiences_beta.csv', import.meta.url);
const PLACE_FIELDS = ['place_id', 'place_name', 'place_kind', 'district', 'wellness_type', 'address', 'image_url', 'latitude', 'longitude', 'description', 'experience_tip', 'mood_tags', 'source_status'];
const EXPERIENCE_FIELDS = ['experience_id', 'experience_name', 'district', 'place_id', 'segment_id', 'scenario', 'time_of_day', 'weather', 'available_minutes', 'activity_intensity', 'description', 'experience_tip', 'mood_tags', 'review_status'];
const places = readCsv(readFileSync(placesPath, 'utf8'));

for (const place of places) {
  const profile = profileFor(place);
  place.mood_tags = profile.tags.join(' ');
}

const experiences = places.map((place) => {
  const profile = profileFor(place);
  return {
    experience_id: `exp_${place.place_id.replace(/^pt_/, '')}`,
    experience_name: profile.experienceName(place.place_name),
    district: place.district,
    place_id: place.place_id,
    segment_id: '',
    scenario: profile.scenario,
    time_of_day: profile.timeOfDay,
    weather: profile.weather,
    available_minutes: String(profile.minutes),
    activity_intensity: profile.intensity,
    description: profile.description(place.place_name),
    experience_tip: profile.tip,
    mood_tags: profile.tags.join(' '),
    review_status: 'DRAFT'
  };
});

writeFileSync(placesPath, `${toCsv(places, PLACE_FIELDS)}\n`, 'utf8');
writeFileSync(experiencesPath, `${toCsv(experiences, EXPERIENCE_FIELDS)}\n`, 'utf8');
console.log(`Tagged ${places.length} points and created ${experiences.length} draft experiences.`);

function profileFor(place) {
  const name = place.place_name;
  if (place.wellness_type === '건강 간편식') {
    return profile(['#식단관리', '#혼밥선호', '#짧은시간', '#가벼운식사', '#점심'], '점심에 가볍게 식단을 챙기고 싶을 때', 'AFTERNOON', 'ANY', 30, 'LOW', (n) => `${n}에서 부담 없는 한 끼로 식사 리듬을 정돈하는 경험`, '알레르기와 재료 선택, 당일 영업 여부를 주문 전에 확인하세요.', (n) => `${n}에서 가벼운 한 끼`);
  }
  if (place.wellness_type === '힐링 공간') {
    const reading = /도서관|책방|서점|문학|북카페/.test(name);
    const culture = /미술관|박물관|갤러리|아트홀|문화|전시/.test(name);
    if (reading) return profile(['#내향형', '#저자극', '#집중회복', '#혼자좋은', '#비오는날'], '조용히 생각을 정리하고 싶을 때', 'AFTERNOON', 'RAIN', 60, 'LOW', (n) => `${n}에서 읽고 머무르며 생각을 정리하는 경험`, '운영 시간과 열람·좌석 이용 가능 여부를 확인하세요.', (n) => `${n}에서 조용한 집중`);
    if (culture) return profile(['#문화취향', '#기분전환', '#혼자좋은', '#주말', '#저자극'], '혼자 문화 자극으로 기분을 전환하고 싶을 때', 'AFTERNOON', 'ANY', 60, 'LOW', (n) => `${n}에서 전시나 공간을 천천히 둘러보며 쉬는 경험`, '당일 전시·프로그램과 입장 가능 시간을 확인하세요.', (n) => `${n}에서 문화 휴식`);
    return profile(['#내향형', '#혼자좋은', '#기분전환', '#비오는날', '#짧은휴식'], '혼자 잠깐 쉬며 기분을 전환하고 싶을 때', 'AFTERNOON', 'RAIN', 45, 'LOW', (n) => `${n}에서 잠시 머물며 일상의 속도를 낮추는 경험`, '혼잡 시간과 혼자 머무르기 좋은 좌석을 확인하세요.', (n) => `${n}에서 잠깐 쉬기`);
  }
  if (place.wellness_type === '공원') {
    const longWalk = /산|계곡|둘레길|숲/.test(name);
    return longWalk
      ? profile(['#자연선호', '#기분전환', '#걷기', '#주말오전', '#스트레스완화'], '생각을 비우며 천천히 걷고 싶을 때', 'MORNING', 'CLEAR', 50, 'LOW', (n) => `${n}에서 자연을 따라 천천히 걸으며 머리를 식히는 경험`, '해 지기 전 동선을 정하고, 기상·통제 구간을 확인하세요.', (n) => `${n}에서 자연 걷기`)
      : profile(['#자연선호', '#짧은휴식', '#걷기', '#기분전환', '#퇴근후'], '가까운 곳에서 잠깐 바람을 쐬고 싶을 때', 'EVENING', 'CLEAR', 25, 'LOW', (n) => `${n}에서 짧게 걷고 앉아 숨을 고르는 경험`, '조명과 휴식 공간이 있는 짧은 동선을 먼저 확인하세요.', (n) => `${n}에서 짧은 산책`);
  }
  if (place.wellness_type === '산책로') {
    return profile(['#자연선호', '#걷기', '#혼자좋은', '#기분전환', '#퇴근후'], '혼자 걸으며 하루를 전환하고 싶을 때', 'EVENING', 'CLEAR', 35, 'LOW', (n) => `${n}을 따라 무리 없이 걸으며 생각을 정리하는 경험`, '왕복 시간과 야간 보행 환경을 확인하세요.', (n) => `${n}에서 혼자 걷기`);
  }
  return profile(['#초보운동', '#가벼운운동', '#스트레스완화', '#퇴근후', '#자기관리시작'], '퇴근 후 가볍게 몸을 움직이고 싶을 때', 'EVENING', 'ANY', 50, 'MEDIUM', (n) => `${n}에서 내 컨디션에 맞춰 가볍게 운동을 시작하는 경험`, '첫 방문 전 수업·시설 이용 방식과 예약 필요 여부를 확인하세요.', (n) => `${n}에서 가벼운 운동`);
}

function profile(tags, scenario, timeOfDay, weather, minutes, intensity, description, tip, experienceName) {
  return { tags, scenario, timeOfDay, weather, minutes, intensity, description, tip, experienceName };
}

function readCsv(text) { const lines = text.trim().split(/\r?\n/); const fields = parse(lines.shift()); return lines.map((line) => Object.fromEntries(parse(line).map((value, i) => [fields[i], value]))); }
function parse(line) { const out = []; let value = ''; let quoted = false; for (let i = 0; i < line.length; i += 1) { const char = line[i]; if (char === '"' && line[i + 1] === '"') { value += '"'; i += 1; } else if (char === '"') quoted = !quoted; else if (char === ',' && !quoted) { out.push(value); value = ''; } else value += char; } out.push(value); return out; }
function toCsv(rows, fields) { const quote = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`; return `${fields.join(',')}\n${rows.map((row) => fields.map((field) => quote(row[field])).join(',')).join('\n')}`; }
