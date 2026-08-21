import type { Coordinates } from '../components/map/map.types';

/**
 * Explicit browser location boundary. It is called only by a future screen;
 * importing this module never requests permission or starts location polling.
 */
export function getCurrentPosition(options?: PositionOptions): Promise<Coordinates> {
  if (!navigator.geolocation) {
    return Promise.reject(new Error('이 브라우저에서는 위치 기능을 사용할 수 없습니다.'));
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve({ lat: coords.latitude, lng: coords.longitude }),
      reject,
      options
    );
  });
}
