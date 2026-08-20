import { ApiError } from '../../lib/errors.js';

const SEARCH_URL = 'https://openapi.naver.com/v1/search/local.json';
const GEOCODE_URL = 'https://maps.apigw.ntruss.com/map-geocode/v2/geocode';
const REVERSE_GEOCODE_URL = 'https://maps.apigw.ntruss.com/map-reversegeocode/v2/gc';

export function buildNaverGeoClient({ env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const searchId = env.NAVER_SEARCH_CLIENT_ID;
  const searchSecret = env.NAVER_SEARCH_CLIENT_SECRET;
  const mapsId = env.NAVER_MAPS_CLIENT_ID;
  const mapsSecret = env.NAVER_MAPS_CLIENT_SECRET;

  return {
    isSearchConfigured: Boolean(searchId && searchSecret),
    isMapsConfigured: Boolean(mapsId && mapsSecret),
    // 장소 후보 검색은 Search API와 Maps Geocoding을 모두 사용한다.
    isConfigured: Boolean(searchId && searchSecret && mapsId && mapsSecret),
    async searchLocal(query, display = 10) {
      requireCredentials(searchId, searchSecret, '네이버 검색 API');
      const url = new URL(SEARCH_URL);
      url.searchParams.set('query', query);
      url.searchParams.set('display', String(Math.min(Math.max(display, 1), 5)));
      const payload = await request(fetchImpl, url, { 'X-Naver-Client-Id': searchId, 'X-Naver-Client-Secret': searchSecret });
      return payload.items.map((item) => ({
        name: stripTags(item.title), category: item.category, address: item.roadAddress || item.address,
        telephone: item.telephone || null
      }));
    },
    async geocode(query) {
      requireCredentials(mapsId, mapsSecret, 'Naver Cloud Maps Geocoding');
      const url = new URL(GEOCODE_URL);
      url.searchParams.set('query', query);
      const payload = await request(fetchImpl, url, mapHeaders(mapsId, mapsSecret));
      return (payload.addresses ?? []).map((item) => ({ address: item.roadAddress || item.jibunAddress, latitude: Number(item.y), longitude: Number(item.x) }));
    },
    async reverseGeocode(lat, lng) {
      requireCredentials(mapsId, mapsSecret, 'Naver Cloud Maps Reverse Geocoding');
      const url = new URL(REVERSE_GEOCODE_URL);
      url.searchParams.set('coords', `${lng},${lat}`);
      url.searchParams.set('output', 'json');
      url.searchParams.set('orders', 'roadaddr,addr');
      const payload = await request(fetchImpl, url, mapHeaders(mapsId, mapsSecret));
      const result = payload.results?.[0];
      return { address: result ? formatAddress(result) : null, latitude: lat, longitude: lng };
    }
  };
}

function mapHeaders(id, secret) { return { 'x-ncp-apigw-api-key-id': id, 'x-ncp-apigw-api-key': secret }; }
function requireCredentials(id, secret, service) { if (!id || !secret) throw new ApiError(503, 'NAVER_API_NOT_CONFIGURED', `${service} 환경변수가 설정되지 않았습니다.`); }
async function request(fetchImpl, url, headers) {
  const response = await fetchImpl(url, { headers });
  if (!response.ok) throw new ApiError(502, 'NAVER_API_ERROR', `네이버 API 요청에 실패했습니다. (${response.status})`);
  return response.json();
}
function stripTags(value = '') { return value.replace(/<\/?b>/g, ''); }
function formatAddress(result) {
  const area = result.region?.area1?.name ? [result.region.area1.name, result.region.area2.name, result.region.area3.name, result.region.area4.name].filter(Boolean).join(' ') : '';
  const land = result.land ? [result.land.name, result.land.number1, result.land.number2].filter(Boolean).join(result.land.name ? ' ' : '-') : '';
  return [area, land].filter(Boolean).join(' ');
}
