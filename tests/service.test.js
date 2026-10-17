import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKey, hashKey, hashPassword, verifyOwner } from '../lib/security.js';
import { submissionHandler } from '../lib/submissions.js';
import { adminHandler } from '../lib/admin.js';
import { sendEmail, emailContent } from '../lib/email.js';
const fields = { firstName: 'Alex', email: 'alex@example.com', message: 'Hello!' };
const form = { label: 'Website', recipientName: 'Owner', recipientEmail: 'owner@example.com', subject: 'New message' };
function fixture() {
  const keys = [1, 2].map(n => ({ id: `key${n}`, formId: `form${n}`, hash: hashKey(`raw${n}`), revokedAt: null, form: { ...form, recipientEmail: `recipient${n}@example.com` } }));
  const submissions = []; let inTransaction = false;
  const db = {
    async $transaction(fn) { inTransaction = true; try { return await fn(db); } finally { inTransaction = false; } },
    async $queryRaw(strings, value) { return keys.filter(k => strings.join('').includes('"hash"') ? k.hash === value : k.id === value).map(k => ({ id: k.id })); },
    apiKey: {
      async findUnique({ where }) { return keys.find(k => k.id === where.id); },
      async update({ where, data }) { return Object.assign(keys.find(k => k.id === where.id), data); },
      async create({ data }) { const k = { ...data, id: 'new-key', revokedAt: null, form: keys.find(k => k.formId === data.formId).form }; keys.push(k); return k; },
    },
    form: { async create({ data }) { assert.equal(data.keys.create.raw, undefined); return data; }, async update() {} },
    submission: {
      async create({ data }) { const s = { ...data, id: `s${submissions.length + 1}`, status: 'PENDING', createdAt: new Date() }; submissions.push(s); return { ...s }; },
      async update({ where, data }) { return Object.assign(submissions.find(s => s.id === where.id), data); },
    },
  };
  return { db, keys, submissions, inTransaction: () => inTransaction };
}
const req = (key = 'raw1', body = { fields }) => new Request('https://submitly.test/form/send', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(key ? { 'X-API-Key': key } : {}) }, body: JSON.stringify(body) });
const adminRequest = (body, origin = 'https://submitly.test') => new Request('https://submitly.test/api/admin', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin, 'X-Submitly-Action': '1' }, body: JSON.stringify(body) });
process.env.ADMIN_EMAIL = 'owner@example.com';
const owner = async () => ({ user: { email: process.env.ADMIN_EMAIL } });
test('only configured owner credentials authenticate', async () => {
  const env = { ADMIN_EMAIL: 'owner@example.com', ADMIN_PASSWORD_HASH: await hashPassword('test-password-only') };
  assert.equal((await verifyOwner({ email: env.ADMIN_EMAIL, password: 'test-password-only' }, env)).id, 'owner');
  assert.equal(await verifyOwner({ email: 'stranger@example.com', password: 'test-password-only' }, env), null);
  assert.equal(await verifyOwner({ email: env.ADMIN_EMAIL, password: 'wrong' }, env), null);
  assert.equal(await verifyOwner({ email: env.ADMIN_EMAIL, password: 'test-password-only' }, {}), null);
});
test('admin mutations require owner session and same-origin CSRF header', async () => {
  for (const session of [null, { user: { email: 'stranger@example.com' } }]) assert.equal((await adminHandler({}, async () => session)(adminRequest({ action: 'create', form }))).status, 401);
  assert.equal((await adminHandler({}, owner)(adminRequest({ action: 'create', form }, 'https://evil.test'))).status, 403);
  const missing = adminRequest({ action: 'create', form }); missing.headers.delete('X-Submitly-Action');
  assert.equal((await adminHandler({}, owner)(missing)).status, 403);
});
test('keys have 256 random bits, hashes and safe prefixes', () => { const a = generateKey(), b = generateKey(); assert.notEqual(a.raw, b.raw); assert.equal(a.hash, hashKey(a.raw)); assert.equal(a.hash.length, 64); assert.equal(a.prefix.length, 12); assert.equal(a.raw.length, 47); });
test('create returns key once and requires recipient email', async () => {
  const { db } = fixture(); const handler = adminHandler(db, owner);
  const response = await handler(adminRequest({ action: 'create', form })); assert.equal(response.status, 200); assert.match((await response.json()).key, /^sub_/); assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal((await handler(adminRequest({ action: 'create', form: { ...form, recipientEmail: '' } }))).status, 400);
});
test('each key routes only to its database recipient; save precedes send outside transaction', async () => {
  const f = fixture(); const recipients = [];
  const handler = submissionHandler(f.db, async s => { assert.equal(f.inTransaction(), false); assert.equal(f.submissions.find(x => x.id === s.id).status, 'SENDING'); recipients.push(s.recipientEmail); return { status: 'ACCEPTED', brevoMessageId: 'provider-id' }; });
  for (const key of ['raw1', 'raw2']) { const res = await handler(req(key)); assert.equal(res.status, 202); assert.equal(res.headers.get('access-control-allow-origin'), '*'); assert.equal(res.headers.get('access-control-allow-credentials'), null); assert.equal((await res.json()).status, 'ACCEPTED'); }
  assert.deepEqual(recipients, ['recipient1@example.com', 'recipient2@example.com']);
  assert.equal(f.submissions[0].brevoMessageId, 'provider-id');
});
test('revocation and rotation immediately deny old keys and preserve history', async () => {
  const f = fixture(); const handler = submissionHandler(f.db, async () => ({ status: 'ACCEPTED' }));
  await handler(req());
  assert.equal((await adminHandler(f.db, owner)(adminRequest({ action: 'revoke', id: 'key1' }))).status, 200);
  assert.equal((await handler(req())).status, 401); assert.equal(f.submissions.length, 1);
  const rotated = await adminHandler(f.db, owner)(adminRequest({ action: 'rotate', id: 'key2' })); const { key } = await rotated.json();
  assert.equal((await handler(req('raw2'))).status, 401); assert.equal((await handler(req(key))).status, 202);
  assert.equal((await adminHandler(f.db, owner)(adminRequest({ action: 'rotate', id: 'key2' }))).status, 409);
});
test('missing, invalid and revoked keys cannot send', async () => { const f = fixture(); let sends = 0; f.keys[0].revokedAt = new Date(); const handler = submissionHandler(f.db, async () => { sends++; }); for (const key of [null, 'nope', 'raw1']) assert.equal((await handler(req(key))).status, 401); assert.equal(sends, 0); });
test('strict validation rejects overrides, missing fields, invalid types, lengths and email', async () => {
  const f = fixture(); const handler = submissionHandler(f.db, async () => assert.fail('Must not send'));
  const invalid = [{ fields, recipient: 'evil@example.com' }, { fields: { ...fields, recipient: 'evil@example.com' } }, { fields: { ...fields, firstName: '' } }, { fields: { ...fields, email: 'bad' } }, { fields: { ...fields, message: 42 } }, { fields: { ...fields, message: 'x'.repeat(10001) } }, { fields: { ...fields, firstName: 'x'.repeat(101) } }, { fields: { ...fields, firstName: 'a\nb' } }, { fields: { email: fields.email } }, null];
  for (const body of invalid) assert.equal((await handler(req('raw1', body))).status, 400);
  const malformed = req(); malformed.headers.set('content-type', 'text/plain'); assert.equal((await handler(malformed)).status, 415);
  const huge = req('raw1', { fields: { ...fields, message: 'x'.repeat(70000) } }); assert.equal((await handler(huge)).status, 413);
  assert.equal(f.submissions.length, 0);
});
const env = { BREVO_API_KEY: 'test-secret', MAIL_FROM_EMAIL: 'verified@example.com', MAIL_FROM_NAME: 'Submitly' };
const sample = { ...form, fields, createdAt: new Date(), recipientEmail: 'destination@example.com' };
test('Brevo payload uses configured sender, isolated recipient and visitor replyTo; escapes HTML', async () => {
  const s = { ...sample, fields: { ...fields, firstName: '<b>Alex</b>', message: '<script>alert(1)</script>\nSecond paragraph' } };
  const payload = emailContent(s, env); assert.ok(payload.htmlContent.includes('&lt;script&gt;')); assert.ok(!payload.htmlContent.includes('<script>')); assert.ok(payload.textContent.includes(s.fields.message));
  const result = await sendEmail(s, { env, fetchImpl: async (url, options) => { assert.equal(url, 'https://api.brevo.com/v3/smtp/email'); assert.equal(options.headers['api-key'], env.BREVO_API_KEY); const body = JSON.parse(options.body); assert.equal(body.to[0].email, s.recipientEmail); assert.equal(body.sender.email, env.MAIL_FROM_EMAIL); assert.equal(body.replyTo.email, fields.email); return Response.json({ messageId: 'id-123' }, { status: 201 }); } });
  assert.deepEqual(result, { status: 'ACCEPTED', brevoMessageId: 'id-123' });
});
test('Brevo rejects safely, timeouts and interruptions remain uncertain and never retry', async () => {
  assert.deepEqual(await sendEmail(sample, { env, fetchImpl: async () => new Response('sensitive provider error', { status: 400 }) }), { status: 'FAILED', errorCode: 'BREVO_HTTP_400' });
  let calls = 0;
  assert.deepEqual(await sendEmail(sample, { env, timeoutMs: 5, fetchImpl: async () => { calls++; return new Promise(() => {}); } }), { status: 'UNKNOWN', errorCode: 'BREVO_TIMEOUT' }); assert.equal(calls, 1);
  assert.equal((await sendEmail(sample, { env, fetchImpl: async () => { throw new Error('secret'); } })).status, 'UNKNOWN');
  assert.equal((await sendEmail(sample, { env, fetchImpl: async () => Response.json({}) })).status, 'UNKNOWN');
  assert.equal((await sendEmail(sample, { env: {} })).errorCode, 'EMAIL_NOT_CONFIGURED');
});
test('failed/uncertain sends persist statuses and consistent HTTP errors', async () => {
  for (const [status, http] of [['FAILED', 502], ['UNKNOWN', 504]]) { const f = fixture(); const res = await submissionHandler(f.db, async () => ({ status, errorCode: 'MOCK_FAILURE' }))(req()); assert.equal(res.status, http); const body = await res.json(); assert.equal(body.submissionId, 's1'); assert.equal(body.status, status); assert.equal(f.submissions[0].status, status); assert.equal(body.error.code, 'MOCK_FAILURE'); }
});
test('database failures cannot produce false acceptance or trigger resend', async () => {
  const f = fixture(); let sends = 0; f.db.submission.create = async () => { throw new Error('database secret'); };
  const res = await submissionHandler(f.db, async () => { sends++; })(req()); assert.equal(res.status, 503); assert.equal(sends, 0); assert.ok(!(await res.text()).includes('database secret'));
  const g = fixture(); let updates = 0; g.db.submission.update = async () => { if (++updates === 2) throw new Error('failed'); };
  const uncertain = await submissionHandler(g.db, async () => ({ status: 'ACCEPTED' }))(req()); assert.equal(uncertain.status, 503); assert.equal((await uncertain.json()).status, 'UNKNOWN');
});
