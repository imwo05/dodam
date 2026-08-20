import type { MapViewProps } from './map.types';

/**
 * Stable map-provider boundary. NAVER Maps rendering will be attached here in
 * a later phase; this component intentionally contains no SDK or fake map UI.
 */
export function MapView({ mode, className, ariaLabel = '지도 영역' }: MapViewProps) {
  const classes = ['map-view', className].filter(Boolean).join(' ');

  return (
    <div
      className={classes}
      role="region"
      aria-label={ariaLabel}
      data-map-provider="naver"
      data-map-mode={mode}
      data-map-placeholder="true"
    />
  );
}
