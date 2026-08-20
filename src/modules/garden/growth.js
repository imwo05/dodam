// Garden counts the existing UserActivity completion records only.
// Today those records are created by completing a Plan B stop; planned schedules,
// skipped stops, saved places, journals, and reviews do not create UserActivity.

// This is the project self-care category enum subset that the Garden contract
// can expose. CUSTOM remains a valid self-care input elsewhere, but has no
// Garden category asset and is therefore not emitted here.
export const GARDEN_CATEGORIES = Object.freeze([
  'WALK',
  'EXERCISE',
  'DIET',
  'MENTAL_HEALTH',
  'RUNNING'
]);

// The current GardenView assets support stage 0 (hidden) through stage 4.
// Keep the thresholds in one place so API responses and future callers cannot
// drift or produce a stage for which the frontend has no supported range.
export const GARDEN_STAGE_THRESHOLDS = Object.freeze([
  Object.freeze({ stage: 0, minimumCount: 0 }),
  Object.freeze({ stage: 1, minimumCount: 1 }),
  Object.freeze({ stage: 2, minimumCount: 3 }),
  Object.freeze({ stage: 3, minimumCount: 6 }),
  Object.freeze({ stage: 4, minimumCount: 10 })
]);

export const MAX_GARDEN_STAGE = GARDEN_STAGE_THRESHOLDS.at(-1).stage;

export function gardenStageForCount(count) {
  const safeCount = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  let stage = 0;
  for (const threshold of GARDEN_STAGE_THRESHOLDS) {
    if (safeCount < threshold.minimumCount) break;
    stage = threshold.stage;
  }
  return Math.min(stage, MAX_GARDEN_STAGE);
}

/**
 * Build the API payload from persisted completion records.
 *
 * `source: PLAN_B` identifies the only current business event that creates a
 * UserActivity. `planBStopId` is retained as the completion record's source
 * metadata, but the source value is the eligibility rule so existing activity
 * rows remain compatible. The category is read from the structured
 * activity.category field populated from the completed stop's place category;
 * titles, locations, and other free text are intentionally ignored.
 */
export function calculateGardenData(activities = []) {
  const counts = new Map(GARDEN_CATEGORIES.map((category) => [category, 0]));
  const completedActivities = activities.filter(isCountedActivity);

  for (const activity of completedActivities) {
    if (counts.has(activity.category)) {
      counts.set(activity.category, counts.get(activity.category) + 1);
    }
  }

  const completedActivityCount = completedActivities.length;
  return {
    completedActivityCount,
    pointBalance: completedActivityCount * 10,
    categoryGrowth: GARDEN_CATEGORIES.map((category) => {
      const count = counts.get(category);
      return { category, count, stage: gardenStageForCount(count) };
    })
  };
}

function isCountedActivity(activity) {
  return activity?.source === 'PLAN_B';
}
