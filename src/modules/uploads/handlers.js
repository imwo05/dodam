// 이미지 업로드 presigned URL 발급 스텁.
// 실제로는 S3/GCS presigned URL을 발급. 데모에선 가짜 URL을 돌려준다.
import { ApiError } from '../../lib/errors.js';
import { createTokenId } from '../../lib/security.js';
import { requireAuth } from '../auth/service.js';

const TYPES = new Set(['PLACE', 'JOURNAL', 'PROFILE']);

export async function createPresignedUrl(context) {
  requireAuth(context);
  const { fileName, contentType, type } = context.body;
  if (!fileName || !contentType) {
    throw new ApiError(422, 'VALIDATION_ERROR', 'fileName, contentType이 필요합니다.');
  }
  const uploadType = String(type ?? 'PLACE').toUpperCase();
  if (!TYPES.has(uploadType)) {
    throw new ApiError(422, 'VALIDATION_ERROR', 'type은 PLACE, JOURNAL, PROFILE 중 하나여야 합니다.');
  }

  const key = `${uploadType.toLowerCase()}/${createTokenId()}-${fileName}`;
  // 데모용 mock. 실제 배포 시 S3 presigned PUT URL로 교체.
  return {
    data: {
      uploadUrl: `https://mock-uploads.dodam.app/put/${key}`,
      fileUrl: `https://cdn.dodam.app/${key}`,
      key,
      method: 'PUT',
      headers: { 'Content-Type': contentType }
    }
  };
}
