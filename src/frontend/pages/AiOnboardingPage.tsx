import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useOnboarding, type ChatMessage } from '../../contexts/OnboardingContext';
import { AppShell } from '../components/AppShell';

function MessageBubble({ message }: { message: ChatMessage }) {
  return (
    <article className={`onboarding-message onboarding-message--${message.role.toLowerCase()}`} data-message-id={message.id} data-role={message.role}>
      <img src="/assets/onboarding-chat-tape.png" alt="" aria-hidden="true" />
      <p>{message.content}</p>
    </article>
  );
}

export function AiOnboardingPage() {
  const navigate = useNavigate();
  const { accessToken, refreshUser } = useAuth();
  const {
    conversationId,
    messages,
    canComplete,
    loading,
    error,
    ensureConversation,
    sendMessage,
    completeConversation
  } = useOnboarding();
  const [draft, setDraft] = useState('');
  const [failedMessage, setFailedMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (accessToken) void ensureConversation(accessToken);
  }, [accessToken, ensureConversation]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [loading, messages.length]);

  async function submitMessage(content: string) {
    if (!accessToken || !content.trim() || loading) return;
    setFailedMessage('');
    try {
      await sendMessage(accessToken, content);
      setDraft('');
    } catch {
      setFailedMessage(content);
      setDraft(content);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await submitMessage(draft);
  }

  async function handleComplete() {
    if (!accessToken || !conversationId || !canComplete || loading) return;
    try {
      await completeConversation(accessToken);
      await refreshUser(accessToken);
      navigate('/schedule/initial');
    } catch {
      // Context retains the conversation and server error so completion can be retried.
    }
  }

  function retryFailedRequest() {
    if (!accessToken || loading) return;
    if (!conversationId) {
      void ensureConversation(accessToken);
    } else if (canComplete) {
      void handleComplete();
    }
  }

  return (
    <AppShell className="onboarding-shell onboarding-shell--ai">
      <main className="onboarding-screen ai-onboarding-screen" data-node-id="291:4087">
        <div className="ai-onboarding-messages" aria-live="polite">
          {messages.map((message) => <MessageBubble key={message.id} message={message} />)}
          {loading && conversationId ? (
            <div className="onboarding-message onboarding-message--typing" data-typing="true">
              <img src="/assets/onboarding-chat-tape.png" alt="" aria-hidden="true" />
              <p>담이가 생각 중이에요…</p>
            </div>
          ) : null}
          <div ref={messagesEndRef} />
        </div>
        {error ? (
          <div className="ai-onboarding-error" role="alert">
            <p>{error}</p>
            {failedMessage ? <button type="button" onClick={() => void submitMessage(failedMessage)} disabled={loading}>다시 보내기</button> : <button type="button" onClick={retryFailedRequest} disabled={loading}>다시 시도</button>}
          </div>
        ) : null}
        <form className="ai-onboarding-composer" onSubmit={handleSubmit}>
          <label className="sr-only" htmlFor="onboarding-message">담이에게 답하기</label>
          <textarea id="onboarding-message" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="담이에게 답해 주세요" rows={1} disabled={!conversationId || loading} />
          <button type="submit" disabled={!conversationId || !draft.trim() || loading}>보내기</button>
        </form>
        <button className={`onboarding-next-button ${canComplete ? 'is-ready' : ''}`} type="button" onClick={() => void handleComplete()} disabled={!canComplete || loading}>
          <img src="/assets/onboarding-tape.png" alt="" aria-hidden="true" />
          <span>{loading ? '확인 중' : '다음'}</span>
        </button>
      </main>
    </AppShell>
  );
}
