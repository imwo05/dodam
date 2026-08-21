import { apiRequest } from './client';

export type AiStyle = 'T' | 'F';

export type BasicProfileInput = {
  purpose: string;
  selfCareGoals?: string[];
  weeklyTargetCount: number;
  availableMinutes: number;
  residentialRegion: string;
  lifeRegion: string;
  planChangeReasons: string[];
  aiStyle: AiStyle;
};

export type PersonalizationProfile = BasicProfileInput & {
  selfCareGoals: string[];
  selfCareDifficultyReasons: string[];
  difficultyAfterPlanChange: string[];
  availableFallbackMinutes: { min: number; max: number } | null;
  preferredActivities: string[];
  preferredAtmospheres: string[];
  avoidAtmospheres: string[];
  preferredIntensity: 'LOW' | 'MEDIUM' | 'HIGH' | null;
  socialPreference: 'SOLO' | 'SOCIAL' | 'ANY' | null;
};

export type ChatMessage = {
  id: string;
  conversationId: string;
  role: 'USER' | 'ASSISTANT';
  content: string;
  createdAt: string;
};

export type ConversationSummary = {
  id: string;
  userId: string;
  status: 'ACTIVE' | 'COMPLETED';
  createdAt: string;
  completedAt: string | null;
};

export type ConversationResponse = {
  conversation: ConversationSummary;
  userMessage?: ChatMessage;
  assistantMessage?: ChatMessage;
  messages?: ChatMessage[];
  profile: PersonalizationProfile;
  missingSlots: string[];
  canComplete: boolean;
  aiFallback?: boolean;
};

export type OnboardingOptions = {
  regions: Array<{ code: string; label: string }>;
  selfCareCategories: string[];
  conditions: string[];
  continuityModes: string[];
};

function authHeaders(accessToken: string) {
  return { Authorization: `Bearer ${accessToken}` };
}

export function getOnboardingOptions() {
  return apiRequest<OnboardingOptions>('/metadata/options');
}

export function saveBasicProfile(accessToken: string, input: BasicProfileInput) {
  return apiRequest<PersonalizationProfile>('/users/me/self-care-profile', {
    method: 'PUT',
    headers: authHeaders(accessToken),
    body: JSON.stringify(input)
  });
}

export function createOnboardingConversation(accessToken: string) {
  return apiRequest<ConversationResponse>('/onboarding/conversations', {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify({})
  });
}

export function getOnboardingConversation(accessToken: string, conversationId: string) {
  return apiRequest<ConversationResponse>(`/onboarding/conversations/${conversationId}`, {
    headers: authHeaders(accessToken)
  });
}

export function sendOnboardingMessage(accessToken: string, conversationId: string, content: string) {
  return apiRequest<ConversationResponse>(`/onboarding/conversations/${conversationId}/messages`, {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ content })
  });
}

export function completeOnboardingConversation(accessToken: string, conversationId: string) {
  return apiRequest<ConversationResponse>(`/onboarding/conversations/${conversationId}/complete`, {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify({})
  });
}
