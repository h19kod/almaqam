import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { openDb } from '../src/db.js';
import { createApp } from '../src/app.js';
import { seedIfEmpty } from '../src/seed.js';

function setup() {
  const db = openDb(':memory:');
  seedIfEmpty(db);
  return request.agent(createApp(db));
}

const user = { name: 'حيدر', email: 'h@example.com', password: 'oud-strings-8' };
const piece = { title: 'تجربة', maqam: 'hijaz', notes: [{ d: 0, t: 0, l: 400 }, { d: 2, t: 450, l: 400 }] };

test('register, me, logout, login', async () => {
  const a = setup();
  const r = await a.post('/api/auth/register').send(user).expect(201);
  assert.equal(r.body.user.name, 'حيدر');
  assert.equal((await a.get('/api/auth/me')).body.user.email, user.email);
  await a.post('/api/auth/register').send(user).expect(409);
  await a.post('/api/auth/logout').expect(200);
  assert.equal((await a.get('/api/auth/me')).body.user, null);
  await a.post('/api/auth/login').send({ email: user.email, password: 'wrong-pass' }).expect(401);
  await a.post('/api/auth/login').send({ email: 'H@EXAMPLE.com', password: user.password }).expect(200);
});

test('validation errors are readable', async () => {
  const a = setup();
  const r = await a.post('/api/auth/register').send({ ...user, password: '123' }).expect(400);
  assert.match(r.body.error, /٨/);
});

test('seeded gallery is public', async () => {
  const a = setup();
  const r = await a.get('/api/compositions').expect(200);
  assert.ok(r.body.compositions.length >= 6);
  const hijaz = await a.get('/api/compositions?maqam=hijaz');
  assert.ok(hijaz.body.compositions.every((c) => c.maqam === 'hijaz'));
});

test('compositions: create, like toggle, private visibility, delete', async () => {
  const a = setup();
  await a.post('/api/compositions').send(piece).expect(401);
  await a.post('/api/auth/register').send(user);
  await a.post('/api/compositions').send({ ...piece, maqam: 'nope' }).expect(400);
  const c = (await a.post('/api/compositions').send(piece).expect(201)).body.composition;
  assert.equal(c.notes.length, 2);
  let l = await a.post(`/api/compositions/${c.id}/like`).expect(200);
  assert.deepEqual(l.body, { liked: true, likes: 1 });
  l = await a.post(`/api/compositions/${c.id}/like`).expect(200);
  assert.deepEqual(l.body, { liked: false, likes: 0 });

  const priv = (await a.post('/api/compositions').send({ ...piece, public: false })).body.composition;
  await a.get(`/api/compositions/${priv.id}`).expect(200);
  const stranger = setup();
  await stranger.get(`/api/compositions/${priv.id}`).expect(404);
  const mine = await a.get('/api/compositions?mine=1');
  assert.equal(mine.body.compositions.length, 2);

  await a.delete(`/api/compositions/${c.id}`).expect(200);
  await a.delete(`/api/compositions/${c.id}`).expect(404);
});

test('training attempts feed stats and streaks', async () => {
  const a = setup();
  await a.post('/api/auth/register').send(user);
  await a.post('/api/training/attempts').send({ maqam: 'rast', guess: 'bayati' });
  for (let i = 0; i < 3; i++) await a.post('/api/training/attempts').send({ maqam: 'hijaz', guess: 'hijaz' });
  const s = (await a.get('/api/me/stats').expect(200)).body;
  assert.equal(s.total, 4);
  assert.equal(s.correct, 3);
  assert.equal(s.streak, 3);
  assert.equal(s.best, 3);
  assert.deepEqual(s.perMaqam.hijaz, { total: 3, correct: 3 });
});
