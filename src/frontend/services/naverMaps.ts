export type NaverLatLng = {
  lat(): number;
  lng(): number;
};

export type NaverMap = {
  setCenter(center: NaverLatLng): void;
  getCenter(): NaverLatLng;
  getBounds(): {
    getSW(): NaverLatLng;
    getNE(): NaverLatLng;
  };
};

export type NaverOverlay = {
  setMap(map: NaverMap | null): void;
};

export type NaverMapsApi = {
  Map: new (element: HTMLElement, options: Record<string, unknown>) => NaverMap;
  LatLng: new (lat: number, lng: number) => NaverLatLng;
  Marker: new (options: Record<string, unknown>) => NaverOverlay;
  Polyline: new (options: Record<string, unknown>) => NaverOverlay;
  Size: new (width: number, height: number) => unknown;
  Point: new (x: number, y: number) => unknown;
  Event: {
    addListener(target: unknown, eventName: string, listener: (event?: { coord?: NaverLatLng }) => void): unknown;
  };
};

type NaverGlobal = { maps: NaverMapsApi };

declare global {
  interface Window {
    naver?: NaverGlobal;
  }
}

let sdkPromise: Promise<NaverMapsApi> | null = null;

export function loadNaverMaps(): Promise<NaverMapsApi> {
  if (typeof window === 'undefined') return Promise.reject(new Error('지도는 브라우저에서만 사용할 수 있어요.'));
  if (window.naver?.maps) return Promise.resolve(window.naver.maps);
  if (sdkPromise) return sdkPromise;

  const clientId = import.meta.env.VITE_NAVER_MAP_CLIENT_ID;
  if (!clientId) return Promise.reject(new Error('VITE_NAVER_MAP_CLIENT_ID가 설정되지 않았어요.'));

  sdkPromise = new Promise<NaverMapsApi>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-naver-maps-sdk]');
    if (existing) {
      existing.addEventListener('load', () => window.naver?.maps ? resolve(window.naver.maps) : reject(new Error('NAVER Maps SDK를 불러오지 못했어요.')), { once: true });
      existing.addEventListener('error', () => reject(new Error('NAVER Maps SDK를 불러오지 못했어요.')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://oapi.map.naver.com/openapi/v3/maps.js?ncpClientId=' + encodeURIComponent(clientId);
    script.async = true;
    script.dataset.naverMapsSdk = 'true';
    script.onload = () => window.naver?.maps ? resolve(window.naver.maps) : reject(new Error('NAVER Maps SDK를 불러오지 못했어요.'));
    script.onerror = () => reject(new Error('NAVER Maps SDK를 불러오지 못했어요.'));
    document.head.appendChild(script);
  }).catch((error: unknown) => {
    sdkPromise = null;
    throw error;
  });

  return sdkPromise;
}
