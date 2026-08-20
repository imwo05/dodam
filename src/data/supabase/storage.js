import { ApiError } from '../../lib/errors.js';

const DEFAULT_BUCKET = 'place-images';

export function createSupabaseStorageClient({
  url,
  serviceRoleKey,
  bucket = DEFAULT_BUCKET,
  fetchImpl = fetch
} = {}) {
  if (!url || !serviceRoleKey) return null;

  const baseUrl = String(url).replace(/\/+$/, '') + '/storage/v1';
  const headers = {
    apikey: serviceRoleKey,
    Authorization: 'Bearer ' + serviceRoleKey,
    Accept: 'application/json',
    'Content-Type': 'application/json'
  };

  return {
    bucket,
    async createSignedUploadUrl(path, contentType) {
      const encodedPath = encodeStoragePath(path);
      const endpoint = baseUrl + '/object/upload/sign/' + encodeURIComponent(bucket) + '/' + encodedPath;
      const response = await fetchImpl(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({ upsert: false, contentType })
      });
      const payload = await readPayload(response);
      if (!response.ok) {
        throw new ApiError(502, 'STORAGE_API_ERROR', 'Supabase Storage signed URL 발급에 실패했습니다. (' + response.status + ')');
      }
      const signedUrlValue = payload?.signedUrl ?? payload?.signedURL ?? payload?.url ?? payload?.data?.signedUrl ?? payload?.data?.url;
      const signedUrl = signedUrlValue
        ? new URL(String(signedUrlValue).startsWith('/') ? baseUrl + String(signedUrlValue) : String(signedUrlValue), baseUrl)
        : null;
      const token = payload?.token ?? payload?.data?.token ?? signedUrl?.searchParams.get('token');
      if (!token) throw new ApiError(502, 'STORAGE_API_ERROR', 'Supabase Storage signed URL 응답이 올바르지 않습니다.');

      return {
        token,
        path,
        uploadUrl: signedUrl?.toString() ?? baseUrl + '/object/upload/sign/' + encodeURIComponent(bucket) + '/' + encodedPath + '?token=' + encodeURIComponent(token),
        fileUrl: baseUrl + '/object/public/' + encodeURIComponent(bucket) + '/' + encodedPath
      };
    }
  };
}

function encodeStoragePath(path) {
  return String(path).split('/').filter(Boolean).map(encodeURIComponent).join('/');
}

async function readPayload(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
