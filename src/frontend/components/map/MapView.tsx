import { useEffect, useRef, useState } from 'react';
import type { Coordinates, MapBounds, MapViewProps, Place } from './map.types';
import { hasNaverMapsClientId, loadNaverMaps, type NaverMap, type NaverMapsNamespace, type NaverOverlay } from './naver-sdk';

const VIEWPORT_CENTER = { lat: 36.5, lng: 127.8 } satisfies Coordinates;

function validPoint(point: Coordinates | undefined | null): point is Coordinates {
  return Boolean(point && Number.isFinite(point.lat) && Number.isFinite(point.lng));
}

function firstPlacePoint(place: Place) {
  if (place.geometry?.type === 'POINT') return place.geometry.point;
  return place.geometry?.startPoint;
}

function decodePolyline(encoded: string) {
  const points: Coordinates[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte = 0;
    do { byte = encoded.charCodeAt(index++) - 63; result |= (byte & 0x1f) << shift; shift += 5; } while (byte >= 0x20 && index < encoded.length);
    lat += (result & 1) ? ~(result >> 1) : result >> 1;
    shift = 0;
    result = 0;
    do { byte = encoded.charCodeAt(index++) - 63; result |= (byte & 0x1f) << shift; shift += 5; } while (byte >= 0x20 && index < encoded.length);
    lng += (result & 1) ? ~(result >> 1) : result >> 1;
    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return points;
}

function mapBounds(map: NaverMap): MapBounds {
  const bounds = map.getBounds();
  const southWest = bounds.getSW();
  const northEast = bounds.getNE();
  return { swLat: southWest.lat(), swLng: southWest.lng(), neLat: northEast.lat(), neLng: northEast.lng() };
}

function mapCenter(props: MapViewProps) {
  if (props.initialCenter && validPoint(props.initialCenter)) return props.initialCenter;
  if (props.mode === 'EXPLORE') {
    const first = props.places.map(firstPlacePoint).find(validPoint);
    if (first) return first;
  }
  if (props.mode === 'POINT' && validPoint(props.point)) return props.point;
  if (props.mode === 'SEGMENT' && validPoint(props.startPoint)) return props.startPoint;
  return VIEWPORT_CENTER;
}

export function MapView(props: MapViewProps) {
  const { mode, className, ariaLabel = '지도 영역' } = props;
  const naverMapsEnabled = hasNaverMapsClientId();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<NaverMap | null>(null);
  const mapsRef = useRef<NaverMapsNamespace | null>(null);
  const overlaysRef = useRef<NaverOverlay[]>([]);
  const propsRef = useRef(props);
  const boundsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [state, setState] = useState<'disabled' | 'loading' | 'ready' | 'error'>(() => naverMapsEnabled ? 'loading' : 'disabled');
  const [sdkError, setSdkError] = useState('');
  propsRef.current = props;

  useEffect(() => {
    if (!naverMapsEnabled) {
      setState('disabled');
      return;
    }
    let active = true;
    setSdkError('');
    setState('loading');
    loadNaverMaps().then((maps) => {
      if (!active || !containerRef.current) return;
      mapsRef.current = maps;
      const center = mapCenter(propsRef.current);
      const map = new maps.Map(containerRef.current, { center: new maps.LatLng(center.lat, center.lng), zoom: 14, zoomControl: true });
      mapRef.current = map;
      const scheduleBounds = () => {
        if (boundsTimerRef.current) clearTimeout(boundsTimerRef.current);
        boundsTimerRef.current = setTimeout(() => {
          const current = propsRef.current;
          if (current.mode === 'EXPLORE') current.onBoundsChange?.(mapBounds(map));
        }, 350);
      };
      maps.Event.addListener(map, 'idle', scheduleBounds);
      maps.Event.addListener(map, 'click', (event) => {
        const point = event.coord;
        if (!point) return;
        const current = propsRef.current;
        const coordinates = { lat: point.lat(), lng: point.lng() };
        if (current.mode === 'POINT') current.onPointChange?.(coordinates);
        if (current.mode === 'SEGMENT') {
          if (!current.startPoint || current.endPoint) current.onSegmentChange?.({ startPoint: coordinates, endPoint: null });
          else current.onSegmentChange?.({ startPoint: current.startPoint, endPoint: coordinates });
        }
      });
      setState('ready');
      scheduleBounds();
    }).catch((error: unknown) => {
      if (!active) return;
      setSdkError(error instanceof Error ? error.message : '지도를 불러오지 못했어요.');
      setState('error');
    });
    return () => {
      active = false;
      if (boundsTimerRef.current) clearTimeout(boundsTimerRef.current);
      overlaysRef.current.forEach((overlay) => overlay.setMap(null));
      overlaysRef.current = [];
      mapRef.current = null;
    };
  }, [mode, naverMapsEnabled]);

  useEffect(() => {
    const map = mapRef.current;
    const maps = mapsRef.current;
    if (!map || !maps || state !== 'ready') return;
    overlaysRef.current.forEach((overlay) => overlay.setMap(null));
    overlaysRef.current = [];
    const current = propsRef.current;
    if (current.mode === 'EXPLORE') {
      current.places.forEach((place) => {
        const geometry = place.geometry;
        if (!geometry) return;
        const points = geometry.type === 'POINT' ? [geometry.point] : [geometry.startPoint, geometry.endPoint];
        points.filter(validPoint).forEach((point, index) => {
          const marker = new maps.Marker({ position: new maps.LatLng(point.lat, point.lng), map, title: index ? `${place.name} 도착` : place.name });
          overlaysRef.current.push(marker);
          if (index === 0) maps.Event.addListener(marker, 'click', () => current.onPlaceSelect?.(place));
        });
        if (geometry.type === 'SEGMENT') {
          const polylinePoints = geometry.encodedPolyline ? decodePolyline(geometry.encodedPolyline) : [geometry.startPoint, geometry.endPoint];
          if (polylinePoints.length >= 2) overlaysRef.current.push(new maps.Polyline({ path: polylinePoints.map((point) => new maps.LatLng(point.lat, point.lng)), map, strokeColor: '#4f635b', strokeOpacity: .75, strokeWeight: 4 }));
        }
      });
    }
    if (current.mode === 'POINT' && validPoint(current.point)) overlaysRef.current.push(new maps.Marker({ position: new maps.LatLng(current.point.lat, current.point.lng), map, title: '선택한 위치' }));
    if (current.mode === 'SEGMENT') {
      if (validPoint(current.startPoint)) overlaysRef.current.push(new maps.Marker({ position: new maps.LatLng(current.startPoint.lat, current.startPoint.lng), map, title: '시작 위치' }));
      if (validPoint(current.endPoint)) {
        const endPoint = current.endPoint;
        const startPoint = current.startPoint;
        overlaysRef.current.push(new maps.Marker({ position: new maps.LatLng(endPoint.lat, endPoint.lng), map, title: '종료 위치' }));
        if (validPoint(startPoint)) overlaysRef.current.push(new maps.Polyline({ path: [startPoint, endPoint].map((point) => new maps.LatLng(point.lat, point.lng)), map, strokeColor: '#4f635b', strokeOpacity: .75, strokeWeight: 4 }));
      }
    }
  }, [props, state]);

  const classes = ['map-view', state === 'disabled' ? 'map-view--disabled' : null, className].filter(Boolean).join(' ');
  const message = props.error || (state === 'error' ? sdkError : null);

  if (state === 'disabled') {
    return (
      <section className={classes} role="region" aria-label={ariaLabel} data-map-provider="disabled" data-map-mode={mode} data-map-state="disabled">
        <div className="map-view__disabled-copy">
          <strong>지도 기능을 준비 중이에요.</strong>
          <span>현재 배포 환경에서는 NAVER 지도를 사용할 수 없어요.</span>
        </div>
      </section>
    );
  }

  return (
    <div
      ref={containerRef}
      className={classes}
      role="region"
      aria-label={ariaLabel}
      data-map-provider="naver"
      data-map-mode={mode}
      data-map-state={state}
    >
      {state === 'loading' || props.isLoading ? <span className="map-view__status" role="status">지도를 불러오는 중이에요.</span> : null}
      {message ? <span className="map-view__status map-view__status--error" role="alert">{message}</span> : null}
      {state === 'ready' && mode === 'EXPLORE' && !props.places.length && !props.isLoading && !message ? <span className="map-view__status">표시할 장소가 아직 없어요.</span> : null}
    </div>
  );
}
