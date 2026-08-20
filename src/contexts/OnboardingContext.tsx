import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  completeOnboardingConversation,
  createOnboardingConversation,
  saveBasicProfile as saveBasicProfileRequest,
  sendOnboardingMessage,
  type BasicProfileInput,
  type ChatMessage,
  type ConversationResponse,
  type PersonalizationProfile
} from '../api/onboarding';

export type { BasicProfileInput, ChatMessage, PersonalizationProfile } from '../api/onboarding';

const emptyProfile: PersonalizationProfile = {
  purpose: '',
  weeklyTargetCount: 0,
  availableMinutes: 0,
  residentialRegion: '',
  lifeRegion: '',
  planChangeReasons: [],
  selfCareGoals: [],
  selfCareDifficultyReasons: [],
  difficultyAfterPlanChange: [],
  availableFallbackMinutes: null,
  preferredActivities: [],
  preferredAtmospheres: [],
  avoidAtmospheres: [],
  preferredIntensity: null,
  socialPreference: null,
  aiStyle: 'T'
};

type OnboardingContextValue = {
  conversationId: string | null;
  conversationStatus: 'ACTIVE' | 'COMPLETED' | null;
  profile: PersonalizationProfile;
  messages: ChatMessage[];
  missingSlots: string[];
  canComplete: boolean;
  loading: boolean;
  error: string | null;
  setProfile: (profile: PersonalizationProfile) => void;
  setMessages: (messages: ChatMessage[]) => void;
  saveBasicProfile: (accessToken: string, input: BasicProfileInput) => Promise<PersonalizationProfile>;
  ensureConversation: (accessToken: string) => Promise<void>;
  sendMessage: (accessToken: string, content: string) => Promise<void>;
  completeConversation: (accessToken: string) => Promise<void>;
};

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

function normalizeProfile(profile?: Partial<PersonalizationProfile> | null): PersonalizationProfile {
  return {
    ...emptyProfile,
    ...(profile ?? {}),
    planChangeReasons: [...(profile?.planChangeReasons ?? [])],
    selfCareGoals: [...(profile?.selfCareGoals ?? [])],
    selfCareDifficultyReasons: [...(profile?.selfCareDifficultyReasons ?? [])],
    difficultyAfterPlanChange: [...(profile?.difficultyAfterPlanChange ?? [])],
    preferredActivities: [...(profile?.preferredActivities ?? [])],
    preferredAtmospheres: [...(profile?.preferredAtmospheres ?? [])],
    avoidAtmospheres: [...(profile?.avoidAtmospheres ?? [])]
  };
}

function responseMessages(response: ConversationResponse) {
  if (response.messages) return response.messages;
  return [
    ...(response.userMessage ? [response.userMessage] : []),
    ...(response.assistantMessage ? [response.assistantMessage] : [])
  ];
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : '온보딩 요청을 처리하지 못했어요.';
}

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversationStatus, setConversationStatus] = useState<'ACTIVE' | 'COMPLETED' | null>(null);
  const [profile, setProfile] = useState<PersonalizationProfile>(emptyProfile);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [missingSlots, setMissingSlots] = useState<string[]>([]);
  const [canComplete, setCanComplete] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const createConversationPromise = useRef<Promise<void> | null>(null);

  const applyConversationResponse = useCallback((response: ConversationResponse) => {
    setConversationId(response.conversation.id);
    setConversationStatus(response.conversation.status);
    setProfile(normalizeProfile(response.profile));
    setMissingSlots(response.missingSlots ?? []);
    setCanComplete(Boolean(response.canComplete));
  }, []);

  const saveBasicProfile = useCallback(async (accessToken: string, input: BasicProfileInput) => {
    setLoading(true);
    setError(null);
    try {
      const saved = await saveBasicProfileRequest(accessToken, input);
      const nextProfile = normalizeProfile(saved);
      setProfile(nextProfile);
      return nextProfile;
    } catch (requestError) {
      setError(errorMessage(requestError));
      throw requestError;
    } finally {
      setLoading(false);
    }
  }, []);

  const ensureConversation = useCallback(async (accessToken: string) => {
    if (conversationId) return;
    if (createConversationPromise.current) return createConversationPromise.current;

    setLoading(true);
    setError(null);
    const promise = createOnboardingConversation(accessToken)
      .then((response) => {
        applyConversationResponse(response);
        setMessages(responseMessages(response));
      })
      .catch((requestError) => {
        setError(errorMessage(requestError));
        throw requestError;
      })
      .finally(() => {
        if (createConversationPromise.current === promise) createConversationPromise.current = null;
        setLoading(false);
      });
    createConversationPromise.current = promise;
    return promise;
  }, [applyConversationResponse, conversationId]);

  const sendMessage = useCallback(async (accessToken: string, content: string) => {
    if (!conversationId) throw new Error('대화가 아직 준비되지 않았어요.');
    const trimmed = content.trim();
    if (!trimmed) throw new Error('메시지를 입력해 주세요.');

    setLoading(true);
    setError(null);
    try {
      const response = await sendOnboardingMessage(accessToken, conversationId, trimmed);
      applyConversationResponse(response);
      setMessages(response.messages ?? [
        ...messages,
        ...(response.userMessage ? [response.userMessage] : []),
        ...(response.assistantMessage ? [response.assistantMessage] : [])
      ]);
    } catch (requestError) {
      setError(errorMessage(requestError));
      throw requestError;
    } finally {
      setLoading(false);
    }
  }, [applyConversationResponse, conversationId, messages]);

  const completeConversation = useCallback(async (accessToken: string) => {
    if (!conversationId) throw new Error('대화가 아직 준비되지 않았어요.');

    setLoading(true);
    setError(null);
    try {
      const response = await completeOnboardingConversation(accessToken, conversationId);
      applyConversationResponse(response);
      setMessages(responseMessages(response));
    } catch (requestError) {
      setError(errorMessage(requestError));
      throw requestError;
    } finally {
      setLoading(false);
    }
  }, [applyConversationResponse, conversationId]);

  const value = useMemo(
    () => ({
      conversationId,
      conversationStatus,
      profile,
      messages,
      missingSlots,
      canComplete,
      loading,
      error,
      setProfile,
      setMessages,
      saveBasicProfile,
      ensureConversation,
      sendMessage,
      completeConversation
    }),
    [canComplete, completeConversation, conversationId, conversationStatus, ensureConversation, error, loading, messages, missingSlots, profile, saveBasicProfile, sendMessage]
  );

  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>;
}

export function useOnboarding() {
  const context = useContext(OnboardingContext);
  if (!context) throw new Error('useOnboarding must be used inside OnboardingProvider');
  return context;
}
