# Phase 7 map and Place integration

The frontend is React + TypeScript + Vite. The map boundary is
src/frontend/components/map/MapView.tsx and supports EXPLORE, POINT, and
SEGMENT.

VITE_NAVER_MAP_CLIENT_ID is loaded only by the browser Web SDK loader. No
NAVER secret is read by Vite. Initial centering may use
navigator.geolocation; a denied permission is ignored and does not prevent
manual selection.

Frontend coordinates use { lat, lng }. src/api/places.ts converts them at the
HTTP boundary to backend { latitude, longitude } fields. POINT sends point;
SEGMENT sends startPoint and endPoint. SEGMENT rendering is a straight visual
connection only; no route polyline is fabricated.

Place creation is available at /places/create/point and
/places/create/segment. A successful create is followed by a fresh
GET /places/:placeId before navigating to detail. My Places reads
GET /users/me/places; it does not inject a newly created item into local
lists.

Images are uploaded through POST /api/v1/uploads/presigned-url. The backend
uses SUPABASE_SERVICE_ROLE_KEY to issue a signed upload URL for the
place-images bucket. The browser uploads the file to that URL and the
resulting public object URL is sent in imageUrls with the Place create
request. Local blob: preview URLs are never persisted.
