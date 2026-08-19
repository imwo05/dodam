import { ApiError } from '../../lib/errors.js';
import { assertRequiredString } from '../../lib/validation.js';
import { requireAuth } from '../auth/service.js';
import { maskUsername } from '../places/handlers.js';

const REACTIONS = new Set(['RECOMMEND', 'DISAPPOINTED']);

function serializeReview(review, store, viewer) {
  const author = store.findUserById(review.userId);
  return {
    id: review.id,
    placeId: review.placeId,
    reaction: review.reaction,
    content: review.content,
    author: { id: review.userId, maskedUsername: maskUsername(author?.username) },
    isMine: viewer ? review.userId === viewer.id : false,
    createdAt: review.createdAt,
    updatedAt: review.updatedAt
  };
}

export async function createReview(context) {
  const user = requireAuth(context);
  const place = context.store.findPlaceById(context.params.placeId);
  if (!place) throw new ApiError(404, 'PLACE_NOT_FOUND', '장소를 찾을 수 없습니다.');

  const reaction = String(context.body.reaction ?? '').toUpperCase();
  if (!REACTIONS.has(reaction)) {
    throw new ApiError(422, 'VALIDATION_ERROR', 'reaction은 RECOMMEND 또는 DISAPPOINTED 여야 합니다.');
  }
  const content =
    context.body.content == null || context.body.content === ''
      ? ''
      : assertRequiredString(context.body.content, 'content', { min: 1, max: 1000 });

  if (context.store.findUserReviewForPlace(user.id, place.id)) {
    throw new ApiError(409, 'ALREADY_REVIEWED', '이미 이 장소에 후기를 남겼습니다.');
  }

  const review = context.store.createReview({
    userId: user.id,
    placeId: place.id,
    planBSessionId: context.body.planBSessionId ?? null,
    reaction,
    content
  });
  return { status: 201, data: serializeReview(review, context.store, user), message: '후기가 등록되었습니다.' };
}

export async function listPlaceReviews(context) {
  const place = context.store.findPlaceById(context.params.placeId);
  if (!place) throw new ApiError(404, 'PLACE_NOT_FOUND', '장소를 찾을 수 없습니다.');
  const limit = Math.min(Number(context.query.limit ?? 20) || 20, 100);
  const all = context.store.listReviewsByPlace(place.id);
  const items = all.slice(0, limit).map((r) => serializeReview(r, context.store, null));
  return { data: { reviews: items, summary: context.store.getPlaceReviewSummary(place.id) } };
}

export async function patchReview(context) {
  const user = requireAuth(context);
  const review = findOwnedReview(context, user.id);
  const patch = {};
  if (context.body.reaction !== undefined) {
    const reaction = String(context.body.reaction).toUpperCase();
    if (!REACTIONS.has(reaction)) throw new ApiError(422, 'VALIDATION_ERROR', 'reaction 값이 올바르지 않습니다.');
    patch.reaction = reaction;
  }
  if (context.body.content !== undefined) {
    patch.content = context.body.content === '' ? '' : assertRequiredString(context.body.content, 'content', { min: 1, max: 1000 });
  }
  if (Object.keys(patch).length === 0) throw new ApiError(422, 'VALIDATION_ERROR', '수정할 값이 필요합니다.');
  const updated = context.store.updateReview(review.id, patch);
  return { data: serializeReview(updated, context.store, user), message: '후기가 수정되었습니다.' };
}

export async function deleteReview(context) {
  const user = requireAuth(context);
  const review = findOwnedReview(context, user.id);
  context.store.deleteReview(review.id);
  return { status: 204 };
}

export async function listMyReviews(context) {
  const user = requireAuth(context);
  const reviews = context.store.listReviewsByUser(user.id).map((r) => {
    const place = context.store.findPlaceById(r.placeId);
    return {
      id: r.id,
      reaction: r.reaction,
      content: r.content,
      place: place ? { id: place.id, name: place.name, category: place.activityType } : null,
      createdAt: r.createdAt
    };
  });
  return { data: { reviews } };
}

function findOwnedReview(context, userId) {
  const review = context.store.findReviewById(context.params.reviewId);
  if (!review) throw new ApiError(404, 'REVIEW_NOT_FOUND', '후기를 찾을 수 없습니다.');
  if (review.userId !== userId) throw new ApiError(403, 'FORBIDDEN', '본인 후기만 수정/삭제할 수 있습니다.');
  return review;
}
