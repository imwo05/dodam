export type Coordinates = {
  lat: number;
  lng: number;
};

export type PointGeometry = {
  type: 'POINT';
  point: Coordinates;
};

export type SegmentGeometry = {
  type: 'SEGMENT';
  startPoint: Coordinates;
  endPoint: Coordinates;
};

export type PlaceGeometry = PointGeometry | SegmentGeometry;
export type GeometryType = PlaceGeometry['type'];

/**
 * Frontend map-domain place shape. Backend transport fields are kept separate
 * in BackendPlace because the current API uses latitude/longitude names.
 */
export type Place = {
  id: string;
  name: string;
  geometryType: GeometryType;
  geometry?: PlaceGeometry;
  category?: string | null;
  categories?: readonly string[];
  image?: string | null;
  address?: string | null;
  durationMinutes?: number | null;
};

/**
 * Current backend place response shape, documented here so a future adapter
 * can explicitly map latitude/longitude to the frontend lat/lng boundary.
 */
export type BackendPlaceCoordinates = {
  latitude: number;
  longitude: number;
};

export type BackendPlace = {
  id: string;
  name: string;
  geometryType: GeometryType;
  point?: BackendPlaceCoordinates | null;
  startPoint?: BackendPlaceCoordinates | null;
  endPoint?: BackendPlaceCoordinates | null;
  latitude?: number | null;
  longitude?: number | null;
  category?: string | null;
  primaryCategory?: string | null;
  imageUrl?: string | null;
  imageUrls?: readonly string[];
  address?: string | null;
  durationMinutes?: number | null;
};

export type MapViewMode = 'EXPLORE' | 'POINT' | 'SEGMENT';

type MapViewBaseProps = {
  className?: string;
  ariaLabel?: string;
};

export type MapViewProps =
  | (MapViewBaseProps & {
      mode: 'EXPLORE';
      places: readonly Place[];
      onPlaceSelect?: (place: Place) => void;
    })
  | (MapViewBaseProps & {
      mode: 'POINT';
      point?: Coordinates;
      onPointChange?: (point: Coordinates) => void;
    })
  | (MapViewBaseProps & {
      mode: 'SEGMENT';
      startPoint?: Coordinates;
      endPoint?: Coordinates;
      onSegmentChange?: (value: { startPoint: Coordinates; endPoint: Coordinates }) => void;
    });
