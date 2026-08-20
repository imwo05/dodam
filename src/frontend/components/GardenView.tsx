import type { GardenCategory, GardenData } from '../../api/garden';

type GardenViewProps = {
  garden: GardenData | null;
  isLoading?: boolean;
  className?: string;
};

type StageAsset = {
  sourceNodeId: string;
  src: string;
};

type CategoryLayer = {
  className: string;
  stages: Record<number, StageAsset>;
};

const STATIC_LAYERS = {
  path: { sourceNodeId: '427:6861', src: '/assets/garden/garden-path.png' },
  base: { sourceNodeId: '427:6862', src: '/assets/garden/garden-base.png' }
} as const;

// These category mappings follow the rendered Figma source artwork: flowers, trees,
// garden beds, and rest areas. The source inventory has no RUNNING-specific stage asset.
const CATEGORY_LAYERS: Partial<Record<GardenCategory, CategoryLayer>> = {
  WALK: {
    className: 'garden-layer--walk',
    stages: {
      1: { sourceNodeId: '428:6866', src: '/assets/garden/flower-1.png' },
      2: { sourceNodeId: '428:6865', src: '/assets/garden/flower-2.png' },
      3: { sourceNodeId: '428:6864', src: '/assets/garden/flower-3.png' },
      4: { sourceNodeId: '428:6863', src: '/assets/garden/flower-4.png' }
    }
  },
  EXERCISE: {
    className: 'garden-layer--exercise',
    stages: {
      1: { sourceNodeId: '442:1875', src: '/assets/garden/tree-1.png' },
      2: { sourceNodeId: '428:6869', src: '/assets/garden/tree-2.png' },
      3: { sourceNodeId: '428:6868', src: '/assets/garden/tree-3.png' },
      4: { sourceNodeId: '428:6867', src: '/assets/garden/tree-4.png' }
    }
  },
  DIET: {
    className: 'garden-layer--diet',
    stages: {
      1: { sourceNodeId: '428:6876', src: '/assets/garden/gardenbed-1.png' },
      2: { sourceNodeId: '428:6875', src: '/assets/garden/gardenbed-2.png' },
      3: { sourceNodeId: '428:6874', src: '/assets/garden/gardenbed-3.png' },
      4: { sourceNodeId: '428:6877', src: '/assets/garden/gardenbed-4.png' }
    }
  },
  MENTAL_HEALTH: {
    className: 'garden-layer--mental-health',
    stages: {
      1: { sourceNodeId: '428:6873', src: '/assets/garden/restarea-1.png' },
      2: { sourceNodeId: '428:6872', src: '/assets/garden/restarea-2.png' },
      3: { sourceNodeId: '428:6871', src: '/assets/garden/restarea-3.png' },
      4: { sourceNodeId: '428:6870', src: '/assets/garden/restarea-4.png' }
    }
  }
};

const CATEGORY_ORDER: GardenCategory[] = ['WALK', 'EXERCISE', 'DIET', 'MENTAL_HEALTH', 'RUNNING'];

function stageAsset(category: GardenCategory, stage: number) {
  if (!Number.isInteger(stage) || stage < 1) return null;
  return CATEGORY_LAYERS[category]?.stages[stage] ?? null;
}

export function GardenView({ garden, isLoading = false, className = '' }: GardenViewProps) {
  const growthByCategory = new Map((garden?.categoryGrowth ?? []).map((growth) => [growth.category, growth]));
  const status = isLoading ? '정원을 불러오는 중이에요.' : garden ? '' : '정원 정보를 불러오지 못했어요.';

  return (
    <section className={`garden-view ${className}`.trim()} aria-label="다람쥐의 정원" aria-busy={isLoading}>
      <h2>다람쥐의 정원</h2>
      <div className="garden-canvas" data-coordinate-canvas="389x293">
        <img
          className="garden-layer garden-layer--path"
          src={STATIC_LAYERS.path.src}
          alt=""
          data-node-id={STATIC_LAYERS.path.sourceNodeId}
          aria-hidden="true"
        />
        {CATEGORY_ORDER.map((category) => {
          const asset = stageAsset(category, growthByCategory.get(category)?.stage ?? 0);
          const layer = CATEGORY_LAYERS[category];
          if (!asset || !layer) return null;
          return (
            <img
              className={`garden-layer ${layer.className}`}
              key={category}
              src={asset.src}
              alt=""
              data-category={category}
              data-stage={growthByCategory.get(category)?.stage}
              data-node-id={asset.sourceNodeId}
              aria-hidden="true"
            />
          );
        })}
        <img
          className="garden-layer garden-layer--base"
          src={STATIC_LAYERS.base.src}
          alt=""
          data-node-id={STATIC_LAYERS.base.sourceNodeId}
          aria-hidden="true"
        />
        {status ? <p className="garden-canvas__status" role={isLoading ? 'status' : 'alert'}>{status}</p> : null}
      </div>
    </section>
  );
}
