import assert from 'node:assert/strict';
import test from 'node:test';
import { createApp } from '../src/app.js';
import { createSupabaseStorageClient } from '../src/data/supabase/storage.js';

async function withServer(options, fn) {
  const server = createApp({ jwtSecret: 'phase7-test-secret', ...options });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const base = 'http://127.0.0.1:' + address.port + '/api/v1';
  try {
    return await fn(base);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function request(base, path, options = {}) {
  const response = await fetch(base + path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers ?? {}) }
  });
  return { status: response.status, body: response.status === 204 ? null : await response.json() };
}

function data(response) {
  return response.body?.data;
}

async function createUser(base) {
  const label = 'phase7_' + Math.random().toString(36).slice(2, 9);
  const response = await request(base, '/auth/signup', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Phase 7',
      username: label,
      email: label + '@example.com',
      password: 'Password123!',
      age: 30
    })
  });
  assert.equal(response.status, 201, JSON.stringify(response));
  return data(response).accessToken;
}

test('POINT and SEGMENT create data round-trip through detail, map, My Places, and saved places', async () => {
  await withServer({}, async (base) => {
    const token = await createUser(base);
    const auth = { Authorization: 'Bearer ' + token };
    const point = await request(base, '/places', {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({
        name: 'Phase point',
        address: '',
        activityType: 'WALK',
        geometryType: 'POINT',
        point: { latitude: 37.49, longitude: 127.01 },
        description: 'A real point',
        tip: 'Visit in the morning',
        atmosphereTags: ['QUIET'],
        imageUrls: ['https://example.com/real-image.jpg']
      })
    });
    assert.equal(point.status, 201, JSON.stringify(point));
    assert.equal(data(point).geometryType, 'POINT');
    assert.deepEqual(data(point).geometry.point, { latitude: 37.49, longitude: 127.01 });
    assert.deepEqual(data(point).imageUrls, ['https://example.com/real-image.jpg']);

    const segment = await request(base, '/places', {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({
        name: 'Phase segment',
        address: '',
        activityType: 'WALK',
        geometryType: 'SEGMENT',
        startPoint: { latitude: 37.48, longitude: 127.00 },
        endPoint: { latitude: 37.50, longitude: 127.02 },
        description: 'A real segment',
        tip: 'Walk slowly',
        durationMinutes: 20
      })
    });
    assert.equal(segment.status, 201, JSON.stringify(segment));
    assert.equal(data(segment).geometryType, 'SEGMENT');
    assert.deepEqual(data(segment).geometry.start, { latitude: 37.48, longitude: 127 });
    assert.deepEqual(data(segment).geometry.end, { latitude: 37.5, longitude: 127.02 });

    const pointDetail = await request(base, '/places/' + data(point).id, { headers: auth });
    assert.equal(pointDetail.status, 200);
    assert.equal(data(pointDetail).description, 'A real point');
    assert.equal(data(pointDetail).tip, 'Visit in the morning');

    const map = await request(base, '/places/map?southWestLat=37.47&southWestLng=126.99&northEastLat=37.51&northEastLng=127.03');
    assert.ok(data(map).places.some((place) => place.id === data(point).id));
    assert.ok(data(map).places.some((place) => place.id === data(segment).id && place.geometryType === 'SEGMENT'));

    const mine = await request(base, '/users/me/places', { headers: auth });
    assert.deepEqual(new Set(data(mine).places.map((place) => place.id)), new Set([data(point).id, data(segment).id]));

    const saved = await request(base, '/places/' + data(point).id + '/save', { method: 'POST', headers: auth });
    assert.equal(saved.status, 200);
    const savedPlaces = await request(base, '/users/me/saved-places', { headers: auth });
    assert.ok(data(savedPlaces).places.some((place) => place.id === data(point).id));
  });
});

test('reverse geocoding uses the backend Naver boundary when configured', async () => {
  const naverGeoClient = {
    isConfigured: false,
    isMapsConfigured: true,
    async reverseGeocode(latitude, longitude) {
      return { address: '실제 주소', latitude, longitude };
    }
  };
  await withServer({ naverGeoClient }, async (base) => {
    const response = await request(base, '/geo/reverse?lat=37.5&lng=127.0');
    assert.equal(response.status, 200);
    assert.equal(data(response).address, '실제 주소');
    assert.equal(data(response).latitude, 37.5);
  });
});

test('image upload boundary never returns a fake URL when Storage is unavailable', async () => {
  await withServer({}, async (base) => {
    const token = await createUser(base);
    const response = await request(base, '/uploads/presigned-url', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token },
      body: JSON.stringify({ type: 'PLACE', fileName: 'point.png', contentType: 'image/png', size: 10 })
    });
    assert.equal(response.status, 503);
    assert.equal(response.body.error.code, 'STORAGE_NOT_CONFIGURED');
    assert.equal(JSON.stringify(response.body).includes('mock-uploads'), false);
  });
});

test('image upload boundary returns a signed Storage URL and public path', async () => {
  const storageClient = {
    async createSignedUploadUrl(path, contentType) {
      assert.match(path, /^places\/usr_/);
      assert.equal(contentType, 'image/png');
      return {
        uploadUrl: 'https://storage.example/signed',
        fileUrl: 'https://storage.example/public/place-images/' + path,
        path
      };
    }
  };
  await withServer({ storageClient }, async (base) => {
    const token = await createUser(base);
    const response = await request(base, '/uploads/presigned-url', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token },
      body: JSON.stringify({ type: 'PLACE', fileName: 'point.png', contentType: 'image/png', size: 10 })
    });
    assert.equal(response.status, 200);
    assert.equal(data(response).uploadUrl, 'https://storage.example/signed');
    assert.match(data(response).fileUrl, /^https:\/\/storage\.example\/public\/place-images\/places\/usr_/);
    assert.equal(data(response).headers['Content-Type'], 'image/png');
  });
});

test('Supabase Storage REST response URL is converted into a browser upload URL', async () => {
  const client = createSupabaseStorageClient({
    url: 'https://project.supabase.co',
    serviceRoleKey: 'server-only',
    bucket: 'place-images',
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      async text() {
        return JSON.stringify({ url: '/object/upload/sign/place-images/places/usr_1/file.png?token=signed-token' });
      }
    })
  });
  const signed = await client.createSignedUploadUrl('places/usr_1/file.png', 'image/png');
  assert.equal(signed.uploadUrl, 'https://project.supabase.co/storage/v1/object/upload/sign/place-images/places/usr_1/file.png?token=signed-token');
  assert.equal(signed.fileUrl, 'https://project.supabase.co/storage/v1/object/public/place-images/places/usr_1/file.png');
});
