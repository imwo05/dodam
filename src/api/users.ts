import { apiRequest } from './client';
import type { PersonalizationProfile } from './onboarding';

export type CompletionProfile = {
  selfCareAreas: string[];
  concern: string;
  availableMinutes: number | null;
  tendency: string;
};

export type CompletionResponse = {
  profile: CompletionProfile;
  initialRecommendations: Array<{ placeId: string; name: string }>;
  onboardingCompleted: boolean;
};

export function getSelfCareProfile(accessToken: string) {
  return apiRequest<PersonalizationProfile>('/users/me/self-care-profile', {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
}

export function completeOnboarding(accessToken: string) {
  return apiRequest<CompletionResponse>('/onboarding/complete', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({})
  });
}
