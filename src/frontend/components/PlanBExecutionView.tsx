import type { PlanBResponse, PlanBStop } from '../../api/planB';

type PlanBExecutionViewProps = {
  session: PlanBResponse;
  currentStop: PlanBStop;
  index: number;
  total: number;
  loading: boolean;
  onComplete: () => void;
  onSkip: () => void;
};

function stateLabel(value: string | null) {
  const labels: Record<string, string> = {
    SCHEDULE_CHECK: '일정 확인',
    EXERCISE: '운동',
    EATING: '식사',
    MEDITATION: '마음 돌보기',
    WALKING: '걷기',
    RESTING: '회복',
    DEFAULT: '자기관리'
  };
  return value ? labels[value] ?? value : '자기관리';
}

export function PlanBExecutionView({ session, currentStop, index, total, loading, onComplete, onSkip }: PlanBExecutionViewProps) {
  const place = currentStop.place;
  const image = place.imageUrl ?? place.imageUrls[0] ?? null;
  const completedReviewCount = place.reviewSummary?.count ?? 0;

  return (
    <main className="plan-b-screen plan-b-execution-screen" data-node-id="291:5155">
      <section className="plan-b-execution-progress" aria-label="Plan B 진행 상황">
        <span>STOP {index + 1} / {total}</span>
        <span>{session.aiStyle} 스타일 · {stateLabel(session.damiState)}</span>
      </section>
      <section className="plan-b-place-hero">
        <div className="plan-b-place-photo">
          {image ? <img src={image} alt="" /> : <p>장소 이미지가 아직 없어요.</p>}
        </div>
        <p className="plan-b-place-category">{place.primaryCategory ?? place.category ?? '자기관리'}</p>
        <h1>{place.name}</h1>
        {place.address ? <p className="plan-b-place-address">{place.address}</p> : null}
        <div className="plan-b-place-meta">
          <span>{currentStop.durationMinutes}분</span>
          {currentStop.startTime && currentStop.endTime ? <span>{currentStop.startTime}–{currentStop.endTime}</span> : null}
          {completedReviewCount ? <span>리뷰 {completedReviewCount}</span> : null}
        </div>
      </section>
      <section className="plan-b-copy-card">
        <h2>이번 장소에서 할 일</h2>
        {place.description ? <p>{place.description}</p> : <p>이 장소에서 오늘 가능한 자기관리를 이어가 보세요.</p>}
        {currentStop.reason ? <p className="plan-b-copy-card__reason">추천 이유 · {currentStop.reason}</p> : null}
        {currentStop.miniMission ? <p className="plan-b-copy-card__mission">미니 미션 · {currentStop.miniMission}</p> : null}
        {place.tip ? <p className="plan-b-copy-card__tip">TIP · {place.tip}</p> : null}
      </section>
      <section className="plan-b-dami-card" aria-label="담이 상태">
        <img src="/assets/dami-default.png" alt="담이" />
        <div><strong>담이 · {stateLabel(session.damiState)}</strong><p>{session.summary ?? session.courseConcept ?? ''}</p></div>
      </section>
      <div className="plan-b-execution-actions">
        <button type="button" className="tape-button plan-b-primary-action" onClick={onComplete} disabled={loading}>
          <img src="/assets/tape-primary.png" alt="" aria-hidden="true" /><span>{loading ? '처리 중' : '완료했어요'}</span>
        </button>
        <button type="button" className="plan-b-text-action" onClick={onSkip} disabled={loading}>이번 장소 건너뛰기</button>
      </div>
    </main>
  );
}
