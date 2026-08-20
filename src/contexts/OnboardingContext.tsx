import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

export type AiStyle = 'T' | 'F';
export type PersonalizationProfile = {
  selfCareGoals: string[];
  selfCareDifficultyReasons: string[];
  planChangeReasons: string[];
  difficultyAfterPlanChange: string[];
  availableFallbackMinutes?: { min: number; max: number };
  preferredActivities: string[];
  preferredAtmospheres: string[];
  preferredIntensity?: 'LOW' | 'MEDIUM' | 'HIGH';
  socialPreference?: 'SOLO' | 'SOCIAL' | 'ANY';
  aiStyle: AiStyle;
};
export type ChatMessage = { id: string; role: 'USER' | 'ASSISTANT'; content: string; createdAt: string };
type OnboardingContextValue = { profile: PersonalizationProfile; setProfile: (profile: PersonalizationProfile) => void; messages: ChatMessage[]; setMessages: (messages: ChatMessage[]) => void };
const initialProfile: PersonalizationProfile = { selfCareGoals: [], selfCareDifficultyReasons: [], planChangeReasons: [], difficultyAfterPlanChange: [], preferredActivities: [], preferredAtmospheres: [], aiStyle: 'T' };
const OnboardingContext = createContext<OnboardingContextValue | null>(null);

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState(initialProfile);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const value = useMemo(() => ({ profile, setProfile, messages, setMessages }), [messages, profile]);
  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>;
}

export function useOnboarding() {
  const context = useContext(OnboardingContext);
  if (!context) throw new Error('useOnboarding must be used inside OnboardingProvider');
  return context;
}
