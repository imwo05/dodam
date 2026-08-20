export type NaverLatLng = {
  lat(): number;
  lng(): number;
};

export type NaverBounds = {
  getSW(): NaverLatLng;
  getNE(): NaverLatLng;
};

export type NaverMap = {
  getBounds(): NaverBounds;
  setCenter(center: NaverLatLng): void;
  setZoom(zoom: number): void;
};

export type NaverOverlay = {
  setMap(map: NaverMap | null): void;
};

export type NaverMapsNamespace = {
  Map: new (element: HTMLElement, options: { center: NaverLatLng; zoom: number; zoomControl?: boolean }) => NaverMap;
  LatLng: new (lat: number, lng: number) => NaverLatLng;
  LatLngBounds: new (southWest: NaverLatLng, northEast: NaverLatLng) => NaverBounds;
  Marker: new (options: { position: NaverLatLng; map: NaverMap; title?: string }) => NaverOverlay;
  Polyline: new (options: { path: NaverLatLng[]; map: NaverMap; strokeColor?: string; strokeOpacity?: number; strokeWeight?: number }) => NaverOverlay;
  Event: {
    addListener(target: unknown, eventName: string, listener: (event: { coord?: NaverLatLng }) => void): unknown;
    removeListener?(listener: unknown): void;
  };
};

declare global {
  interface Window {
    naver?: { maps?: NaverMapsNamespace };
  }
}

const SCRIPT_ID = 'dodam-naver-maps-sdk';
let sdkPromise: Promise<NaverMapsNamespace> | null = null;

function currentMaps() {
  return typeof window !== 'undefined' ? window.naver?.maps : undefined;
}

export function loadNaverMaps() {
  if (currentMaps()) return Promise.resolve(currentMaps() as NaverMapsNamespace);
  if (sdkPromise) return sdkPromise;

  sdkPromise = new Promise<NaverMapsNamespace>((resolve, reject) => {
    if (typeof document === 'undefined') {
      reject(new Error('지도는 브라우저에서만 사용할 수 있어요.'));
      return;
    }
    const clientId = import.meta.env.VITE_NAVER_MAP_CLIENT_ID;
    if (!clientId) {
      reject(new Error('VITE_NAVER_MAP_CLIENT_ID가 설정되지 않았어요.'));
      return;
    }
    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    const script = existing ?? document.createElement('script');
    const finish = () => {
      const maps = currentMaps();
      if (maps) resolve(maps);
      else reject(new Error('Naver Maps SDK를 초기화하지 못했어요.'));
    };
    script.addEventListener('load', finish, { once: true });
    script.addEventListener('error', () => reject(new Error('Naver Maps SDK를 불러오지 못했어요.')), { once: true });
    if (!existing) {
      script.id = SCRIPT_ID;
      script.async = true;
      script.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpClientId=${encodeURIComponent(clientId)}`;
      document.head.appendChild(script);
    } else if (currentMaps()) {
      finish();
    }
  }).catch((error) => {
    sdkPromise = null;
    throw error;
  });

  return sdkPromise;
}
