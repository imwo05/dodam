import { useEffect, useRef, useState } from 'react';
import { getCurrentPosition } from '../../services/geolocation';
import { loadNaverMaps, type NaverLatLng, type NaverMap, type NaverMapsApi, type NaverOverlay } from '../../services/naverMaps';
import type { Coordinates, MapViewProps, Place } from './map.types';

const DEFAULT_CENTER: Coordinates = { lat: 37.5665, lng: 126.978 };
const EMPTY_PLACES: readonly Place[] = [];

function toLatLng(maps: NaverMapsApi, point: Coordinates): NaverLatLng {
  return new maps.LatLng(point.lat, point.lng);
}

function markerIcon(maps: NaverMapsApi, className: string) {
  return {
    content: '<span class="naver-map-marker ' + className + '" aria-hidden="true"></span>',
    size: new maps.Size(24, 24),
    anchor: new maps.Point(12, 12)
  };
}

function addMarker(
  maps: NaverMapsApi,
  map: NaverMap,
  point: Coordinates,
  className: string,
  title: string,
  onClick?: () => void
) {
  const marker = new maps.Marker({
    map,
    position: toLatLng(maps, point),
    title,
    icon: markerIcon(maps, className)
  });
  if (onClick) maps.Event.addListener(marker, 'click', onClick);
  return marker;
}

function addSegment(maps: NaverMapsApi, map: NaverMap, start: Coordinates, end: Coordinates) {
  return new maps.Polyline({
    map,
    path: [toLatLng(maps, start), toLatLng(maps, end)],
    strokeColor: '#4f635b',
    strokeOpacity: 0.85,
    strokeWeight: 4,
    strokeLineCap: 'round',
    strokeLineJoin: 'round'
  });
}

function clearOverlays(overlays: NaverOverlay[]) {
  overlays.forEach((overlay) => overlay.setMap(null));
}

export function MapView(props: MapViewProps) {
  const { mode, className, ariaLabel = '지도 영역' } = props;
  const mapElementRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<NaverMap | null>(null);
  const mapsRef = useRef<NaverMapsApi | null>(null);
  const overlaysRef = useRef<NaverOverlay[]>([]);
  const modeRef = useRef(mode);
  const pointChangeRef = useRef(props.mode === 'POINT' ? props.onPointChange : undefined);
  const segmentChangeRef = useRef(props.mode === 'SEGMENT' ? props.onSegmentChange : undefined);
  const placeSelectRef = useRef(props.mode === 'EXPLORE' ? props.onPlaceSelect : undefined);
  const startPointRef = useRef(props.mode === 'SEGMENT' ? props.startPoint : undefined);
  const endPointRef = useRef(props.mode === 'SEGMENT' ? props.endPoint : undefined);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');

  modeRef.current = mode;
  pointChangeRef.current = props.mode === 'POINT' ? props.onPointChange : undefined;
  segmentChangeRef.current = props.mode === 'SEGMENT' ? props.onSegmentChange : undefined;
  placeSelectRef.current = props.mode === 'EXPLORE' ? props.onPlaceSelect : undefined;
  startPointRef.current = props.mode === 'SEGMENT' ? props.startPoint : undefined;
  endPointRef.current = props.mode === 'SEGMENT' ? props.endPoint : undefined;
  const currentPoint = props.mode === 'POINT' ? props.point : undefined;
  const currentStartPoint = props.mode === 'SEGMENT' ? props.startPoint : undefined;
  const currentEndPoint = props.mode === 'SEGMENT' ? props.endPoint : undefined;
  const explorePlaces = props.mode === 'EXPLORE' ? props.places : EMPTY_PLACES;

  useEffect(() => {
    let active = true;
    loadNaverMaps().then((maps) => {
      if (!active || !mapElementRef.current) return;
      const map = new maps.Map(mapElementRef.current, {
        center: toLatLng(maps, DEFAULT_CENTER),
        zoom: 15,
        minZoom: 6,
        maxZoom: 21,
        zoomControl: false,
        draggable: true,
        pinchZoom: true,
        scrollWheel: false,
        disableKineticPan: false
      });
      mapsRef.current = maps;
      mapRef.current = map;
      setStatus('ready');
      maps.Event.addListener(map, 'click', (event) => {
        const coordinate = event?.coord;
        if (!coordinate) return;
        const nextPoint = { lat: coordinate.lat(), lng: coordinate.lng() };
        if (modeRef.current === 'POINT') {
          pointChangeRef.current?.(nextPoint);
          return;
        }
        if (modeRef.current === 'SEGMENT') {
          const currentStart = startPointRef.current;
          const currentEnd = endPointRef.current;
          if (!currentStart || currentEnd) {
            segmentChangeRef.current?.({ startPoint: nextPoint });
          } else {
            segmentChangeRef.current?.({ startPoint: currentStart, endPoint: nextPoint });
          }
        }
      });

      getCurrentPosition({ enableHighAccuracy: false, maximumAge: 300000, timeout: 5000 })
        .then((position) => map.setCenter(toLatLng(maps, position)))
        .catch(() => undefined);
    }).catch((requestError: unknown) => {
      if (!active) return;
      setStatus('error');
      setError(requestError instanceof Error ? requestError.message : '지도를 불러오지 못했어요.');
    });

    return () => {
      active = false;
      clearOverlays(overlaysRef.current);
      overlaysRef.current = [];
      mapRef.current = null;
      mapsRef.current = null;
    };
  }, []);

  useEffect(() => {
    const maps = mapsRef.current;
    const map = mapRef.current;
    if (!maps || !map) return;
    clearOverlays(overlaysRef.current);
    const overlays: NaverOverlay[] = [];

    if (mode === 'POINT' && currentPoint) {
      overlays.push(addMarker(maps, map, currentPoint, 'naver-map-marker--selected', '선택한 장소'));
    }
    if (mode === 'SEGMENT') {
      if (currentStartPoint) overlays.push(addMarker(maps, map, currentStartPoint, 'naver-map-marker--start', '시작점'));
      if (currentEndPoint) overlays.push(addMarker(maps, map, currentEndPoint, 'naver-map-marker--end', '도착점'));
      if (currentStartPoint && currentEndPoint) overlays.push(addSegment(maps, map, currentStartPoint, currentEndPoint));
    }
    if (mode === 'EXPLORE') {
      explorePlaces.forEach((place) => {
        if (!place.geometry) return;
        if (place.geometry.type === 'POINT') {
          overlays.push(addMarker(maps, map, place.geometry.point, 'naver-map-marker--place', place.name, () => placeSelectRef.current?.(place)));
        } else {
          overlays.push(addMarker(maps, map, place.geometry.startPoint, 'naver-map-marker--start', place.name, () => placeSelectRef.current?.(place)));
          overlays.push(addMarker(maps, map, place.geometry.endPoint, 'naver-map-marker--end', place.name, () => placeSelectRef.current?.(place)));
          overlays.push(addSegment(maps, map, place.geometry.startPoint, place.geometry.endPoint));
        }
      });
    }
    overlaysRef.current = overlays;
  }, [currentEndPoint?.lat, currentEndPoint?.lng, currentPoint?.lat, currentPoint?.lng, currentStartPoint?.lat, currentStartPoint?.lng, explorePlaces, mode]);

  const classes = ['map-view', className].filter(Boolean).join(' ');
  return (
    <div className={classes} role="region" aria-label={ariaLabel} data-map-provider="naver" data-map-mode={mode}>
      <div ref={mapElementRef} className="map-view__canvas" aria-hidden={status !== 'ready'} />
      {status === 'loading' ? <p className="map-view__status">지도를 불러오는 중이에요.</p> : null}
      {status === 'error' ? <p className="map-view__status map-view__status--error" role="status">{error}</p> : null}
    </div>
  );
}
