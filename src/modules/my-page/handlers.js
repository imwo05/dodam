import { requireAuth } from '../auth/service.js';
import { maskUsername } from '../places/handlers.js';

export async function getMyPage(context) {
  const user = requireAuth(context);
  const store = context.store;
  const scProfile = store.getSelfCareProfile(user.id);
  const concern = store.getConcern(user.id);
  const neighbors = store.listNeighbors(user.id);
  const garden = store.getGarden(user.id);

  return {
    data: {
      user: {
        id: user.id,
        username: user.username,
        profileImageUrl: user.profileImageUrl
      },
      selfCareProfile: {
        summary:
          concern?.analysis?.summary ??
          scProfile?.purpose ??
          '아직 자기관리 성향이 설정되지 않았어요.'
      },
      neighbors: {
        count: neighbors.length,
        preview: neighbors.slice(0, 4).map((n) => ({
          id: n.id,
          username: maskUsername(n.username),
          profileImageUrl: n.profileImageUrl
        }))
      },
      garden
    }
  };
}

export async function getNeighbors(context) {
  const user = requireAuth(context);
  const neighbors = context.store.listNeighbors(user.id).map((n) => ({
    id: n.id,
    username: maskUsername(n.username),
    profileImageUrl: n.profileImageUrl
  }));
  return { data: { neighbors } };
}

export async function getGarden(context) {
  const user = requireAuth(context);
  return { data: context.store.getGarden(user.id) };
}
