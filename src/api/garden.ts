export type GardenCategory = 'WALK' | 'EXERCISE' | 'DIET' | 'MENTAL_HEALTH' | 'RUNNING';

export type GardenGrowth = {
  category: string;
  count: number;
  stage: number;
};

export type GardenData = {
  completedActivityCount: number;
  pointBalance: number;
  categoryGrowth: GardenGrowth[];
};
