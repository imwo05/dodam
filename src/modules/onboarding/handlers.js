import { requireAuth } from '../auth/service.js';

export async function completeOnboarding(context) {
  const user = requireAuth(context);
  const store = context.store;

  const scProfile = await context.repositories.profile.getSelfCareProfile(user.id);
  const concern = store.getConcern(user.id);

  const selfCareAreas = concern?.analysis?.categories ?? [];
  const availableMinutes = scProfile?.availableMinutes ?? null;

  // 성향 추론
  let tendency = '나에게 맞는 자기관리 활동 선호';
  if (availableMinutes != null && availableMinutes <= 45) tendency = '짧고 부담 없는 활동 선호';
  else if (availableMinutes != null && availableMinutes >= 90) tendency = '여유 있게 즐기는 활동 선호';

  // 초기 추천: 관심 카테고리에 맞는 장소 우선, 없으면 아무거나
  let candidates = store.listPlaces({});
  if (selfCareAreas.length) {
    const matched = candidates.filter((p) => selfCareAreas.includes(p.activityType));
    if (matched.length) candidates = matched;
  }
  const initialRecommendations = candidates.slice(0, 3).map((p) => ({ placeId: p.id, name: p.name }));

  await context.repositories.user.setOnboardingCompleted(user.id, true);

  return {
    data: {
      profile: {
        selfCareAreas,
        concern: concern?.analysis?.summary ?? scProfile?.purpose ?? '',
        availableMinutes,
        tendency
      },
      initialRecommendations,
      onboardingCompleted: true
    }
  };
}
