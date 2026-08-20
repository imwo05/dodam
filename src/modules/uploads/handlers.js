import { randomUUID } from 'node:crypto';
import { ApiError } from '../../lib/errors.js';
import { requireAuth } from '../auth/service.js';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

export async function createPresignedUrl(context) {
  const user = requireAuth(context);
  const input = context.body && typeof context.body === 'object' ? context.body : {};
  const uploadType = String(input.type ?? 'PLACE').toUpperCase();
  const fileName = String(input.fileName ?? '').trim();
  const contentType = String(input.contentType ?? '').toLowerCase();
  const size = input.size == null ? null : Number(input.size);

  if (uploadType !== 'PLACE') throw new ApiError(422, 'VALIDATION_ERROR', 'type은 PLACE만 지원합니다.');
  if (!fileName || fileName.length > 255) throw new ApiError(422, 'VALIDATION_ERROR', 'fileName이 필요합니다.');
  if (!IMAGE_TYPES.has(contentType)) throw new ApiError(422, 'VALIDATION_ERROR', '지원하지 않는 이미지 형식입니다.');
  if (size != null && (!Number.isFinite(size) || size <= 0 || size > MAX_IMAGE_BYTES)) {
    throw new ApiError(422, 'VALIDATION_ERROR', '이미지 크기는 10MB 이하여야 합니다.');
  }
  if (!context.storageClient) {
    throw new ApiError(503, 'STORAGE_NOT_CONFIGURED', '이미지 저장소가 아직 연결되지 않았습니다.');
  }

  const extension = contentType.split('/')[1].replace('jpeg', 'jpg');
  const path = 'places/' + user.id + '/' + randomUUID() + '.' + extension;
  const signed = await context.storageClient.createSignedUploadUrl(path, contentType);

  return {
    data: {
      uploadUrl: signed.uploadUrl,
      fileUrl: signed.fileUrl,
      path: signed.path,
      method: 'PUT',
      headers: { 'Content-Type': contentType }
    }
  };
}
