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
  encodedPolyline?: string | null;
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
  intensity?: string | null;
  description?: string | null;
  tip?: string | null;
  atmosphereTags?: string[];
  isSaved?: boolean;
  reviewSummary?: { count?: number; recommendCount: number; disappointedCount: number } | null;
  reviews?: { id: string; reaction: string; content: string; createdAt: string }[];
  creator?: { id: string; maskedUsername?: string | null; username?: string } | null;
  source?: string | null;
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
  categories?: readonly string[];
  imageUrl?: string | null;
  imageUrls?: readonly string[];
  address?: string | null;
  durationMinutes?: number | null;
  intensity?: string | null;
  description?: string | null;
  tip?: string | null;
  atmosphereTags?: string[];
  encodedPolyline?: string | null;
  geometry?: {
    type?: GeometryType;
    point?: BackendPlaceCoordinates | null;
    start?: BackendPlaceCoordinates | null;
    end?: BackendPlaceCoordinates | null;
    encodedPolyline?: string | null;
  } | null;
  isSaved?: boolean;
  reviewSummary?: { count?: number; recommendCount: number; disappointedCount: number } | null;
  reviews?: { id: string; reaction: string; content: string; createdAt: string }[];
  creator?: { id: string; maskedUsername?: string | null; username?: string } | null;
  source?: string | null;
};

export type MapViewMode = 'EXPLORE' | 'POINT' | 'SEGMENT';

export type MapBounds = {
  swLat: number;
  swLng: number;
  neLat: number;
  neLng: number;
};

type MapViewBaseProps = {
  className?: string;
  ariaLabel?: string;
};

export type MapViewProps =
  | (MapViewBaseProps & {
      mode: 'EXPLORE';
      places: readonly Place[];
      onPlaceSelect?: (place: Place) => void;
      onBoundsChange?: (bounds: MapBounds) => void;
      isLoading?: boolean;
      error?: string | null;
      initialCenter?: Coordinates;
    })
  | (MapViewBaseProps & {
      mode: 'POINT';
      point?: Coordinates;
      onPointChange?: (point: Coordinates) => void;
      isLoading?: boolean;
      error?: string | null;
      initialCenter?: Coordinates;
    })
  | (MapViewBaseProps & {
      mode: 'SEGMENT';
      startPoint?: Coordinates;
      endPoint?: Coordinates;
      onSegmentChange?: (value: { startPoint: Coordinates | null; endPoint: Coordinates | null }) => void;
      isLoading?: boolean;
      error?: string | null;
      initialCenter?: Coordinates;
    });
