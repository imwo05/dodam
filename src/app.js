import { createServer } from 'node:http';
import { URL } from 'node:url';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { createStore } from './data/store.js';
import { createRepositories } from './data/repositories/index.js';
import { ApiError } from './lib/errors.js';
import { parseJsonBody, sendError, sendNoContent, sendSuccess } from './lib/http.js';
import { buildAuthService } from './modules/auth/service.js';
import { buildAiClient } from './modules/ai/client.js';

import {
  signup,
  login,
  logout,
  usernameRecovery,
  passwordResetRequest,
  passwordResetConfirm
} from './modules/auth/handlers.js';
import { getOptions } from './modules/metadata/handlers.js';
import { getMe, patchMe } from './modules/users/handlers.js';
import {
  putSelfCareProfile,
  getSelfCareProfile,
  patchSelfCareProfile,
  postConcern
} from './modules/self-care/handlers.js';
import { completeOnboarding } from './modules/onboarding/handlers.js';
import {
  createConversation,
  getConversation,
  addConversationMessage,
  completeConversation
} from './modules/onboarding/conversations.js';
import { getHome } from './modules/home/handlers.js';
import {
  createSchedule,
  bulkCreateSchedules,
  getWeekSchedules,
  getDaySchedules,
  patchSchedule,
  deleteSchedule,
  getCopySources,
  copySchedules,
  getSchedules
} from './modules/schedules/handlers.js';
import {
  getPlace,
  createPlace,
  patchPlace,
  deletePlace,
  getMapPlaces,
  searchPlaces,
  savePlace,
  unsavePlace,
  getSavedPlaces,
  getMyPlaces,
  getRealtimeRecommendations,
  getScheduleRecommendations
} from './modules/places/handlers.js';
import { searchAddresses, reverseGeocode } from './modules/geo/handlers.js';
import {
  createRecommendations,
  getSession,
  regenerate,
  getCourse,
  addStop,
  removeStop,
  reorderStops,
  startSession,
  startStop,
  completeStop,
  skipStop,
  cancelSession
} from './modules/plan-b/handlers.js';
import {
  createReview,
  listPlaceReviews,
  patchReview,
  deleteReview,
  listMyReviews
} from './modules/reviews/handlers.js';
import {
  createJournal,
  listJournals,
  getCalendar,
  getJournal,
  patchJournal,
  deleteJournal
} from './modules/journals/handlers.js';
import { getArchive, getStatistics, getActivities } from './modules/archive/handlers.js';
import { getMyPage, getNeighbors, getGarden } from './modules/my-page/handlers.js';
import { createPresignedUrl } from './modules/uploads/handlers.js';
import { getHealth } from './modules/health/handlers.js';

const API_PREFIX = '/api/v1';

// 주의: 매칭은 위에서부터 순차 진행. 같은 길이라면 정적 경로를 파라미터 경로보다 먼저 둘 것.
const routes = [
  ['GET', '/health', getHealth],

  // Auth
  ['POST', '/auth/signup', signup],
  ['POST', '/auth/login', login],
  ['POST', '/auth/logout', logout],
  ['POST', '/auth/username-recovery', usernameRecovery],
  ['POST', '/auth/password-reset/request', passwordResetRequest],
  ['POST', '/auth/password-reset/confirm', passwordResetConfirm],

  // Metadata
  ['GET', '/metadata/options', getOptions],

  // User / Onboarding
  ['GET', '/users/me', getMe],
  ['PATCH', '/users/me', patchMe],
  ['GET', '/users/me/self-care-profile', getSelfCareProfile],
  ['PUT', '/users/me/self-care-profile', putSelfCareProfile],
  ['PATCH', '/users/me/self-care-profile', patchSelfCareProfile],
  ['POST', '/users/me/self-care-concern', postConcern],
  ['GET', '/users/me/saved-places', getSavedPlaces],
  ['GET', '/users/me/places', getMyPlaces],
  ['GET', '/users/me/reviews', listMyReviews],
  ['GET', '/users/me/activities', getActivities],
  ['GET', '/users/me/page', getMyPage],
  ['GET', '/users/me/neighbors', getNeighbors],
  ['GET', '/users/me/garden', getGarden],
  ['POST', '/onboarding/complete', completeOnboarding],
  ['POST', '/onboarding/conversations', createConversation],
  ['GET', '/onboarding/conversations/:conversationId', getConversation],
  ['POST', '/onboarding/conversations/:conversationId/messages', addConversationMessage],
  ['POST', '/onboarding/conversations/:conversationId/complete', completeConversation],

  // Home
  ['GET', '/home', getHome],

  // Schedule (정적 경로 먼저)
  ['GET', '/schedules', getSchedules],
  ['GET', '/schedules/week', getWeekSchedules],
  ['GET', '/schedules/day', getDaySchedules],
  ['GET', '/schedules/copy-sources', getCopySources],
  ['POST', '/schedules/bulk', bulkCreateSchedules],
  ['POST', '/schedules/copy', copySchedules],
  ['POST', '/schedules', createSchedule],
  ['PATCH', '/schedules/:scheduleId', patchSchedule],
  ['DELETE', '/schedules/:scheduleId', deleteSchedule],

  // Place (정적 경로를 :placeId 보다 먼저)
  ['GET', '/places/map', getMapPlaces],
  ['GET', '/places/search', searchPlaces],
  ['GET', '/places/realtime-recommendations', getRealtimeRecommendations],
  ['GET', '/places/schedule-recommendations', getScheduleRecommendations],
  ['POST', '/places', createPlace],
  ['GET', '/places/:placeId/reviews', listPlaceReviews],
  ['POST', '/places/:placeId/reviews', createReview],
  ['POST', '/places/:placeId/save', savePlace],
  ['DELETE', '/places/:placeId/save', unsavePlace],
  ['GET', '/places/:placeId', getPlace],
  ['PATCH', '/places/:placeId', patchPlace],
  ['DELETE', '/places/:placeId', deletePlace],

  // Geo
  ['GET', '/geo/addresses', searchAddresses],
  ['GET', '/geo/reverse', reverseGeocode],

  // Plan B
  ['POST', '/plan-b/recommendations', createRecommendations],
  ['GET', '/plan-b/:sessionId/course', getCourse],
  ['POST', '/plan-b/:sessionId/course/stops', addStop],
  ['DELETE', '/plan-b/:sessionId/course/stops/:stopId', removeStop],
  ['PATCH', '/plan-b/:sessionId/course/order', reorderStops],
  ['POST', '/plan-b/:sessionId/regenerate', regenerate],
  ['POST', '/plan-b/:sessionId/start', startSession],
  ['POST', '/plan-b/:sessionId/cancel', cancelSession],
  ['POST', '/plan-b/:sessionId/stops/:stopId/start', startStop],
  ['POST', '/plan-b/:sessionId/stops/:stopId/complete', completeStop],
  ['POST', '/plan-b/:sessionId/stops/:stopId/skip', skipStop],
  ['GET', '/plan-b/:sessionId', getSession],

  // Review
  ['PATCH', '/reviews/:reviewId', patchReview],
  ['DELETE', '/reviews/:reviewId', deleteReview],

  // Journal (정적 calendar 먼저)
  ['POST', '/journals', createJournal],
  ['GET', '/journals/calendar', getCalendar],
  ['GET', '/journals', listJournals],
  ['GET', '/journals/:journalId', getJournal],
  ['PATCH', '/journals/:journalId', patchJournal],
  ['DELETE', '/journals/:journalId', deleteJournal],

  // Archive
  ['GET', '/archive/statistics', getStatistics],
  ['GET', '/archive', getArchive],

  // Upload
  ['POST', '/uploads/presigned-url', createPresignedUrl]
].map(([method, path, handler]) => ({
  method,
  path,
  handler,
  parts: path.split('/').filter(Boolean)
}));

export function createApp(options = {}) {
  const requestHandler = createRequestHandler(options);
  const server = createServer(requestHandler);
  server.persistenceAdapterName = requestHandler.persistenceAdapterName;
  return server;
}

export function createRequestHandler(options = {}) {
  const store = options.store ?? createStore();
  const repositories = options.repositories ?? createRepositories({
    store,
    supabaseClient: options.supabaseClient,
    supabaseUrl: options.supabaseUrl,
    supabaseServiceRoleKey: options.supabaseServiceRoleKey,
    fetchImpl: options.fetchImpl,
    adapter: options.persistenceAdapter
  });
  const auth = buildAuthService({
    store,
    jwtSecret: options.jwtSecret ?? process.env.JWT_SECRET ?? 'dodam-dev-secret',
    accessTokenTtlSeconds: Number(
      options.accessTokenTtlSeconds ?? process.env.ACCESS_TOKEN_TTL_SECONDS ?? 60 * 60 * 24
    ),
    refreshTokenTtlSeconds: Number(
      options.refreshTokenTtlSeconds ?? process.env.REFRESH_TOKEN_TTL_SECONDS ?? 60 * 60 * 24 * 14
    ),
    now: options.now
  });
  const aiClient =
    options.aiClient ??
    buildAiClient({
      baseUrl: options.aiBaseUrl ?? process.env.AI_BASE_URL,
      apiKey: options.aiApiKey ?? process.env.AI_RECOMMENDATION_API_KEY,
      fetchImpl: options.fetchImpl
    });

  const handleRequest = async function handleRequest(req, res) {
    try {
      setCorsHeaders(res);
      if (req.method === 'OPTIONS') return sendNoContent(res);

      const requestUrl = new URL(req.url ?? '/', 'http://localhost');
      if (!requestUrl.pathname.startsWith(API_PREFIX)) {
        return serveFrontend(requestUrl.pathname, res);
      }
      const route = matchRoute(req.method, requestUrl.pathname);

      if (!route) {
        throw new ApiError(404, 'NOT_FOUND', '요청한 API를 찾을 수 없습니다.');
      }

      const body = await parseJsonBody(req);
      const context = {
        req,
        res,
        body,
        query: Object.fromEntries(requestUrl.searchParams.entries()),
        params: route.params,
        store,
        repositories,
        auth,
        aiClient
      };

      const result = await route.handler(context);

      if (result?.status === 204) return sendNoContent(res);

      return sendSuccess(res, result?.status ?? 200, result?.data ?? null, result?.message ?? null);
    } catch (error) {
      return sendError(res, error);
    }
  };
  handleRequest.persistenceAdapterName = repositories.adapterName;
  return handleRequest;
}

function matchRoute(method, pathname) {
  if (!pathname.startsWith(API_PREFIX)) return null;
  const routePath = pathname.slice(API_PREFIX.length) || '/';
  const requestParts = routePath.split('/').filter(Boolean);

  for (const route of routes) {
    if (route.method !== method || route.parts.length !== requestParts.length) continue;

    const params = {};
    let isMatch = true;
    for (let i = 0; i < route.parts.length; i += 1) {
      const expected = route.parts[i];
      const actual = requestParts[i];
      if (expected.startsWith(':')) params[expected.slice(1)] = decodeURIComponent(actual);
      else if (expected !== actual) {
        isMatch = false;
        break;
      }
    }
    if (isMatch) return { ...route, params };
  }
  return null;
}

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS');
}

async function serveFrontend(pathname, res) {
  const requestedPath = pathname === '/' ? '/index.html' : pathname;
  const publicRoot = join(process.cwd(), 'public');
  const filePath = normalize(join(publicRoot, requestedPath));

  if (!filePath.startsWith(`${publicRoot}/`)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Forbidden');
  }

  try {
    const body = await readFile(filePath);
    const contentType = {
      '.css': 'text/css; charset=utf-8',
      '.html': 'text/html; charset=utf-8',
      '.js': 'text/javascript; charset=utf-8',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.svg': 'image/svg+xml'
    }[extname(filePath)] ?? 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'no-cache' });
    return res.end(body);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Not Found');
    }
    throw error;
  }
}
