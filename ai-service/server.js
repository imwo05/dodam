// DODAM AI 서비스 (순수 Node.js ESM, 의존성 0)
//  실행: AI_PORT=8000 node ai-service/server.js
//  백엔드가 POST /analyze-concern, /plan-b-reasons 로 호출.
import { createServer } from 'node:http';
import { loadEnv } from './env.js';
import { analyzeConcern, planBPlan, planBReasons } from './plan.js';
import { onboardingTurn } from './onboarding.js';
import { hasOpenAI } from './openai.js';

loadEnv();

const PORT = Number(process.env.AI_PORT || 8000);
// 백엔드가 Authorization: Bearer <키> 를 보낼 때 대조할 공유키(선택)
const SHARED_KEY = process.env.AI_API_KEY || '';

function sendJson(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS'
  });
  res.end(JSON.stringify(body));
}

const HANDLERS = {
  '/analyze-concern': analyzeConcern,
  '/plan-b': planBPlan,
  '/plan-b-reasons': planBReasons,
  '/onboarding-turn': onboardingTurn
};

const server = createServer((req, res) => {
  if (req.method === 'OPTIONS') return sendJson(res, 204, {});

  if (req.method === 'GET' && req.url === '/health') {
    return sendJson(res, 200, { ok: true, openai: hasOpenAI() });
  }

  if (req.method === 'POST' && HANDLERS[req.url]) {
    if (SHARED_KEY) {
      const auth = req.headers['authorization'] || '';
      if (auth !== `Bearer ${SHARED_KEY}`) return sendJson(res, 401, { error: 'unauthorized' });
    }
    const handler = HANDLERS[req.url];
    const route = req.url;
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 5_000_000) req.destroy();
    });
    req.on('end', async () => {
      try {
        const payload = body ? JSON.parse(body) : {};
        const result = await handler(payload);
        console.info(`[ai-service] ${route}`, { openai: hasOpenAI() });
        sendJson(res, 200, result);
      } catch (err) {
        console.error('[ai-service] error', err);
        sendJson(res, 500, { error: 'request failed' });
      }
    });
    return;
  }

  sendJson(res, 404, { error: 'not found' });
});

server.listen(PORT, () => {
  console.log(`DODAM AI service on http://localhost:${PORT}`);
  console.log(`  OpenAI: ${hasOpenAI() ? 'ON' : 'OFF (휴리스틱 폴백)'}`);
  console.log(`  POST /analyze-concern · /plan-b · /plan-b-reasons · /onboarding-turn  ·  GET /health`);
});
