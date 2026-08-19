import { ApiError } from '../../lib/errors.js';
import { assertRequiredString } from '../../lib/validation.js';
import { requireAuth } from '../auth/service.js';

function serialize(journal) {
  return {
    id: journal.id,
    date: journal.date,
    placeId: journal.placeId,
    planBSessionId: journal.planBSessionId,
    content: journal.content,
    imageUrls: journal.imageUrls,
    tags: journal.tags,
    createdAt: journal.createdAt,
    updatedAt: journal.updatedAt
  };
}

export async function createJournal(context) {
  const user = requireAuth(context);
  const content = assertRequiredString(context.body.content, 'content', { min: 1, max: 2000 });
  const journal = context.store.createJournal({
    userId: user.id,
    date: parseDate(context.body.date),
    placeId: context.body.placeId ?? null,
    planBSessionId: context.body.planBSessionId ?? null,
    content,
    imageUrls: parseStringArray(context.body.imageUrls, 'imageUrls', 2048),
    tags: parseStringArray(context.body.tags, 'tags', 30)
  });
  return { status: 201, data: serialize(journal), message: '기록이 저장되었습니다.' };
}

export async function listJournals(context) {
  const user = requireAuth(context);
  const date = context.query.date ? assertDateStr(context.query.date) : null;
  const journals = context.store.listJournals({ userId: user.id, date });
  return { data: { journals: journals.map(serialize) } };
}

export async function getCalendar(context) {
  const user = requireAuth(context);
  const year = Number(context.query.year);
  const month = Number(context.query.month);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new ApiError(422, 'VALIDATION_ERROR', 'year, month가 올바르지 않습니다.');
  }
  const journals = context.store.listJournals({ userId: user.id, year, month });
  const counts = new Map();
  for (const j of journals) counts.set(j.date, (counts.get(j.date) ?? 0) + 1);
  const dates = [...counts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, journalCount]) => ({ date, journalCount }));
  return { data: { year, month, dates } };
}

export async function getJournal(context) {
  const user = requireAuth(context);
  const journal = findOwned(context, user.id);
  return { data: serialize(journal) };
}

export async function patchJournal(context) {
  const user = requireAuth(context);
  const journal = findOwned(context, user.id);
  const patch = {};
  if (context.body.content !== undefined) patch.content = assertRequiredString(context.body.content, 'content', { min: 1, max: 2000 });
  if (context.body.imageUrls !== undefined) patch.imageUrls = parseStringArray(context.body.imageUrls, 'imageUrls', 2048);
  if (context.body.tags !== undefined) patch.tags = parseStringArray(context.body.tags, 'tags', 30);
  if (Object.keys(patch).length === 0) throw new ApiError(422, 'VALIDATION_ERROR', '수정할 값이 필요합니다.');
  const updated = context.store.updateJournal(journal.id, patch);
  return { data: serialize(updated), message: '기록이 수정되었습니다.' };
}

export async function deleteJournal(context) {
  const user = requireAuth(context);
  const journal = findOwned(context, user.id);
  context.store.deleteJournal(journal.id);
  return { status: 204 };
}

function findOwned(context, userId) {
  const journal = context.store.findJournalById(context.params.journalId);
  if (!journal) throw new ApiError(404, 'JOURNAL_NOT_FOUND', '기록을 찾을 수 없습니다.');
  if (journal.userId !== userId) throw new ApiError(403, 'FORBIDDEN', '본인 기록만 접근할 수 있습니다.');
  return journal;
}

function parseDate(value) {
  if (value === undefined || value === null || value === '') return undefined;
  return assertDateStr(value);
}
function assertDateStr(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ApiError(422, 'VALIDATION_ERROR', 'date는 YYYY-MM-DD 형식이어야 합니다.');
  }
  return value;
}
function parseStringArray(value, field, max) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > 20) throw new ApiError(422, 'VALIDATION_ERROR', `${field}는 최대 20개 배열이어야 합니다.`);
  return value.map((v) => assertRequiredString(v, `${field}[]`, { min: 1, max }));
}
