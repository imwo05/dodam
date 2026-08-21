import type { GardenData } from '../../api/garden';
import gardenStageOne from '../assets/garden/garden-1.png';
import gardenStageTwo from '../assets/garden/garden-2.png';
import gardenStageThree from '../assets/garden/garden-3.png';
import gardenStageFour from '../assets/garden/garden-4.png';

type GardenViewProps = {
  garden: GardenData | null;
  isLoading?: boolean;
  className?: string;
};

const STAGE_IMAGES = [gardenStageOne, gardenStageOne, gardenStageTwo, gardenStageThree, gardenStageFour] as const;

function visibleStage(garden: GardenData | null) {
  const highestCategoryStage = Math.max(0, ...(garden?.categoryGrowth ?? []).map((growth) => Number(growth.stage) || 0));
  return Math.min(STAGE_IMAGES.length - 1, Math.max(1, highestCategoryStage));
}

export function GardenView({ garden, isLoading = false, className = '' }: GardenViewProps) {
  const status = isLoading ? '정원을 불러오는 중이에요.' : garden ? '' : '정원 정보를 불러오지 못했어요.';
  const stage = visibleStage(garden);

  return (
    <section className={`garden-view ${className}`.trim()} aria-label="다람쥐의 정원" aria-busy={isLoading}>
      <h2>다람쥐의 정원</h2>
      <div className="garden-canvas" data-garden-stage={stage}>
        <img className="garden-stage-image" src={STAGE_IMAGES[stage]} alt="" aria-hidden="true" />
        {status ? <p className="garden-canvas__status" role={isLoading ? 'status' : 'alert'}>{status}</p> : null}
      </div>
    </section>
  );
}
