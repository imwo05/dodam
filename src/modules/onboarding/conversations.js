import { ApiError } from '../../lib/errors.js';
import { assertRequiredString } from '../../lib/validation.js';
import { requireAuth } from '../auth/service.js';
import {
  canCompleteProfile,
  missingRequiredSlots,
  normalizePersonalizationPatch,
  profileForResponse
} from './profile.js';

export async function createConversation(context) {
  const user = requireAuth(context);
  const conversation = context.store.createOnboardingConversation({ userId: user.id });
  const profile = ensureProfile(context.store, user);
  const result = await requestTurn(context, user, profile, []);
  const assistantMessage = context.store.addOnboardingMessage({
    conversationId: conversation.id,
    role: 'ASSISTANT',
    content: result.assistantMessage
  });
  return {
    status: 201,
    data: buildConversationResponse(context.store, user, conversation.id, {
      assistantMessage,
      missingSlots: result.missingSlots,
      fallback: result.fallback
    })
  };
}

export async function getConversation(context) {
  const { user, conversation } = findOwnedConversation(context);
  return { data: buildConversationResponse(context.store, user, conversation.id) };
}

export async function addConversationMessage(context) {
  const { user, conversation } = findOwnedConversation(context);
  if (conversation.status !== 'ACTIVE') {
    throw new ApiError(409, 'CONVERSATION_COMPLETED', '완료된 onboarding 대화에는 메시지를 추가할 수 없습니다.');
  }
  const content = assertRequiredString(context.body.content, 'content', { min: 1, max: 3000 });
  const userMessage = context.store.addOnboardingMessage({
    conversationId: conversation.id,
    role: 'USER',
    content
  });
  const profile = ensureProfile(context.store, user);
  const messages = context.store.listOnboardingMessages(conversation.id);
  const result = await requestTurn(context, user, profile, messages);
  const patch = result.extractedProfilePatch;
  if (Object.keys(patch).length) context.store.setSelfCareProfile(user.id, patch);
  const assistantMessage = context.store.addOnboardingMessage({
    conversationId: conversation.id,
    role: 'ASSISTANT',
    content: result.assistantMessage
  });
  return {
    data: {
      ...buildConversationResponse(context.store, user, conversation.id, {
        userMessage,
        assistantMessage,
        missingSlots: result.missingSlots,
        fallback: result.fallback
      }),
      canComplete: canCompleteFor(context.store, user)
    }
  };
}

export async function completeConversation(context) {
  const { user, conversation } = findOwnedConversation(context);
  if (conversation.status === 'COMPLETED') {
    return { data: buildConversationResponse(context.store, user, conversation.id) };
  }
  if (!canCompleteFor(context.store, user)) {
    throw new ApiError(409, 'ONBOARDING_INCOMPLETE', '개인화에 필요한 정보가 아직 부족합니다.', {
      missingSlots: missingRequiredSlots(context.store.getSelfCareProfile(user.id), context.store.getSelfCareProfile(user.id))
    });
  }
  const updated = context.store.updateOnboardingConversation(conversation.id, {
    status: 'COMPLETED',
    completedAt: new Date().toISOString()
  });
  context.store.updateUser(user.id, { onboardingCompleted: true });
  return { data: buildConversationResponse(context.store, user, conversation.id, { conversation: updated }) };
}

async function requestTurn(context, user, profile, messages) {
  let result = null;
  try {
    if (context.aiClient?.onboardingTurn) {
      result = await context.aiClient.onboardingTurn({
        context: {
          aiStyle: profile.aiStyle ?? user.aiStyle ?? 'F',
          userId: user.id
        },
        profile: profileForResponse(profile),
        messages: messages.map((message) => ({
          role: message.role,
          content: message.content,
          createdAt: message.createdAt
        }))
      });
    }
  } catch {
    result = null;
  }
  const validated = validateAiTurn(result);
  if (validated) return validated;
  return safeFallbackTurn(profile, messages);
}

function validateAiTurn(value) {
  if (!value || typeof value !== 'object') return null;
  if (typeof value.assistantMessage !== 'string' || !value.assistantMessage.trim()) return null;
  if (!Array.isArray(value.missingSlots) || typeof value.completed !== 'boolean') return null;
  try {
    const patch = normalizePersonalizationPatch(value.extractedProfilePatch, { strict: true });
    return {
      assistantMessage: value.assistantMessage.trim(),
      extractedProfilePatch: patch,
      missingSlots: value.missingSlots.filter((slot) => typeof slot === 'string'),
      completed: value.completed,
      fallback: Boolean(value.fallback)
    };
  } catch {
    return null;
  }
}

function safeFallbackTurn(profile, messages) {
  const missingSlots = missingRequiredSlots(profile, profile);
  return {
    assistantMessage: messages.length
      ? '지금 답변을 안전하게 저장했어요. 잠시 후 다시 이어서 말씀해 주세요.'
      : '요즘, 나를 위해 가장 챙기고 싶은 건 무엇인가요?',
    extractedProfilePatch: {},
    missingSlots,
    completed: false,
    fallback: true
  };
}

function ensureProfile(store, user) {
  const existing = store.getSelfCareProfile(user.id);
  if (existing) return existing;
  return store.setSelfCareProfile(user.id, { aiStyle: user.aiStyle === 'T' ? 'T' : 'F' });
}

function canCompleteFor(store, user) {
  const profile = store.getSelfCareProfile(user.id);
  return canCompleteProfile(profile, profile);
}

function buildConversationResponse(store, user, conversationId, extra = {}) {
  const conversation = extra.conversation ?? store.findOnboardingConversation(conversationId);
  const profile = store.getSelfCareProfile(user.id) ?? ensureProfile(store, user);
  const messages = store.listOnboardingMessages(conversationId);
  const missingSlots = sanitizeMissingSlots(
    extra.missingSlots ?? missingRequiredSlots(profile, profile),
    profile
  );
  return {
    conversation: serializeConversation(conversation),
    ...(extra.userMessage ? { userMessage: serializeMessage(extra.userMessage) } : {}),
    ...(extra.assistantMessage ? { assistantMessage: serializeMessage(extra.assistantMessage) } : {}),
    ...(extra.assistantMessage ? {} : { messages: messages.map(serializeMessage) }),
    profile: profileForResponse(profile),
    missingSlots,
    canComplete: missingSlots.length === 0,
    ...(extra.fallback ? { aiFallback: true } : {})
  };
}

function sanitizeMissingSlots(slots, profile) {
  const required = missingRequiredSlots(profile, profile);
  const combined = [...new Set([...required, ...(slots ?? [])])];
  return combined.filter((slot) => !isFilled(profile, slot));
}

function isFilled(profile, slot) {
  if (slot === 'preferredActivities_or_preferredAtmospheres') {
    return Boolean(profile.preferredActivities?.length || profile.preferredAtmospheres?.length);
  }
  if (slot === 'selfCareDifficultyReasons') {
    return Boolean(profile.selfCareDifficultyReasons?.length || profile.difficultyAfterPlanChange?.length);
  }
  if (slot === 'availableFallbackMinutes') return Boolean(profile.availableFallbackMinutes);
  return Array.isArray(profile[slot]) ? profile[slot].length > 0 : profile[slot] != null;
}

function findOwnedConversation(context) {
  const user = requireAuth(context);
  const conversation = context.store.findOnboardingConversation(context.params.conversationId);
  if (!conversation) throw new ApiError(404, 'ONBOARDING_CONVERSATION_NOT_FOUND', 'onboarding 대화를 찾을 수 없습니다.');
  if (conversation.userId !== user.id) throw new ApiError(403, 'FORBIDDEN', '본인 onboarding 대화만 접근할 수 있습니다.');
  return { user, conversation };
}

function serializeConversation(conversation) {
  return {
    id: conversation.id,
    userId: conversation.userId,
    status: conversation.status,
    createdAt: conversation.createdAt,
    completedAt: conversation.completedAt
  };
}

function serializeMessage(message) {
  return {
    id: message.id,
    conversationId: message.conversationId,
    role: message.role,
    content: message.content,
    createdAt: message.createdAt
  };
}
