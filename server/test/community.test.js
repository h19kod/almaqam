import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { openDb } from '../src/db.js';
import { createApp } from '../src/app.js';
import { seedIfEmpty } from '../src/seed.js';
import { dayStreak } from '../src/routes/learn.js';

function world() {
  const db = openDb(':memory:');
  seedIfEmpty(db);
  const app = createApp(db);
  const agent = async (name, email) => {
    const a = request.agent(app);
    await a.post('/api/auth/register').send({ name, email, password: 'long-enough-pass' }).expect(201);
    return a;
  };
  return { db, app, agent };
}
const piece = { title: 'أصل', maqam: 'rast', notes: [{ d: 0, t: 0, l: 300 }] };

test('remix links back to its parent and counts on it', async () => {
  const { agent } = world();
  const a = await agent('سارة', 'sara@example.com');
  const b = await agent('علي', 'ali@example.com');
  const orig = (await a.post('/api/compositions').send(piece)).body.composition;
  const remix = (await b.post('/api/compositions').send({ ...piece, title: 'نسخة', parentId: orig.id }).expect(201)).body.composition;
  assert.deepEqual(remix.parent, { id: orig.id, title: 'أصل', author: 'سارة' });
  assert.equal((await b.get(`/api/compositions/${orig.id}`)).body.composition.remixes, 1);
  await b.post('/api/compositions').send({ ...piece, parentId: 99999 }).expect(400);
});

test('comments: add, list, only owner or admin may delete', async () => {
  const { agent } = world();
  process.env.ADMIN_EMAILS = 'boss@example.com';
  const a = await agent('سارة', 'sara@example.com');
  const b = await agent('علي', 'ali@example.com');
  const boss = await agent('المشرف', 'boss@example.com');
  delete process.env.ADMIN_EMAILS;
  const c = (await a.post('/api/compositions').send(piece)).body.composition;
  await b.post(`/api/compositions/${c.id}/comments`).send({ body: '   ' }).expect(400);
  const m = (await b.post(`/api/compositions/${c.id}/comments`).send({ body: 'جميلة جداً' }).expect(201)).body.comment;
  assert.equal(m.canDelete, true);
  const list = (await a.get(`/api/compositions/${c.id}/comments`)).body.comments;
  assert.equal(list[0].body, 'جميلة جداً');
  assert.equal(list[0].canDelete, false);
  await a.delete(`/api/comments/${m.id}`).expect(403);
  await boss.delete(`/api/comments/${m.id}`).expect(200);
  assert.equal((await a.get(`/api/compositions/${c.id}`)).body.composition.comments, 0);
});

test('reports flow to admins, hiding removes content from public lists', async () => {
  const { agent, app } = world();
  process.env.ADMIN_EMAILS = 'boss@example.com';
  const a = await agent('سارة', 'sara@example.com');
  const b = await agent('علي', 'ali@example.com');
  const boss = await agent('المشرف', 'boss@example.com');
  delete process.env.ADMIN_EMAILS;
  const c = (await a.post('/api/compositions').send({ ...piece, title: 'سبام' })).body.composition;
  await b.post('/api/reports').send({ type: 'composition', id: c.id, reason: 'إعلان' }).expect(201);
  await b.post('/api/reports').send({ type: 'composition', id: c.id, reason: 'مكرر' }).expect(201); // ignored duplicate
  await b.get('/api/admin/reports').expect(403);
  const reports = (await boss.get('/api/admin/reports').expect(200)).body.reports;
  assert.equal(reports.length, 1);
  assert.equal(reports[0].preview, 'سبام');
  await boss.post(`/api/admin/reports/${reports[0].id}`).send({ action: 'hide' }).expect(200);
  const anon = request(app);
  await anon.get(`/api/compositions/${c.id}`).expect(404);
  assert.ok(!(await anon.get('/api/compositions')).body.compositions.some((x) => x.id === c.id));
  await a.get(`/api/compositions/${c.id}`).expect(200); // the owner still sees it
  assert.equal((await boss.get('/api/admin/stats')).body.openReports, 0);
});

test('lessons need a passing score and unlock the path achievement', async () => {
  const { agent } = world();
  const a = await agent('سارة', 'sara@example.com');
  await a.post('/api/lessons/nope/complete').send({ score: 100 }).expect(404);
  assert.equal((await a.post('/api/lessons/intro/complete').send({ score: 30 })).body.passed, false);
  for (const l of ['intro', 'ajam', 'nahawand', 'kurd', 'hijaz', 'rast', 'bayati', 'saba', 'sikah']) {
    await a.post(`/api/lessons/${l}/complete`).send({ score: 100 }).expect(201);
  }
  const s = (await a.get('/api/me/stats')).body;
  assert.equal(s.lessons.length, 9);
  assert.equal(s.dayStreak, 1);
  assert.equal(s.achievements.find((x) => x.id === 'path').earned, true);
  assert.equal(s.achievements.find((x) => x.id === 'golden').earned, false);
});

test('leaderboard ranks by correct answers with a minimum of five', async () => {
  const { agent, app } = world();
  const a = await agent('سارة', 'sara@example.com');
  const b = await agent('علي', 'ali@example.com');
  for (let i = 0; i < 6; i++) await a.post('/api/training/attempts').send({ maqam: 'rast', guess: 'rast' });
  for (let i = 0; i < 3; i++) await b.post('/api/training/attempts').send({ maqam: 'rast', guess: 'rast' });
  const leaders = (await request(app).get('/api/leaderboard')).body.leaders;
  assert.deepEqual(leaders.map((l) => [l.name, l.correct, l.accuracy]), [['سارة', 6, 100]]);
});

test('public profile shows summary but no email', async () => {
  const { agent, app } = world();
  const a = await agent('سارة', 'sara@example.com');
  const me = (await a.get('/api/auth/me')).body.user;
  const p = (await request(app).get(`/api/users/${me.id}`).expect(200)).body.user;
  assert.equal(p.name, 'سارة');
  assert.equal(p.email, undefined);
  await request(app).get('/api/users/0').expect(404);
});

test('day streak counts back from today or yesterday', () => {
  assert.equal(dayStreak(['2026-10-27', '2026-10-28', '2026-10-29'], '2026-10-29'), 3);
  assert.equal(dayStreak(['2026-10-27', '2026-10-28'], '2026-10-29'), 2);
  assert.equal(dayStreak(['2026-10-25', '2026-10-27'], '2026-10-29'), 0);
});
