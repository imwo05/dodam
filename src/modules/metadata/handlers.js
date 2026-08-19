// 온보딩 드롭다운/칩 값. 프론트가 하드코딩 안 하려면 이거 씀.
const REGIONS = [
  { code: 'GWANAK', label: '관악' },
  { code: 'JONGNO', label: '종로' },
  { code: 'MAPO', label: '마포' },
  { code: 'SEONGDONG', label: '성동' },
  { code: 'YEONGDEUNGPO', label: '영등포' },
  { code: 'GANGNAM', label: '강남' }
];

export const SELF_CARE_CATEGORIES = ['EXERCISE', 'DIET', 'WALK', 'RUNNING', 'MENTAL_HEALTH', 'CUSTOM'];
export const CONDITIONS = ['VERY_GOOD', 'GOOD', 'NORMAL', 'TIRED', 'VERY_TIRED'];
export const CONTINUITY_MODES = ['SIMILAR', 'EASY', 'MINIMUM', 'AUTO'];

export async function getOptions() {
  return {
    data: {
      regions: REGIONS,
      selfCareCategories: SELF_CARE_CATEGORIES,
      conditions: CONDITIONS,
      continuityModes: CONTINUITY_MODES
    }
  };
}

export function isValidRegion(code) {
  return REGIONS.some((r) => r.code === code);
}
