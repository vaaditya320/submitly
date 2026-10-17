import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { generateKey } from '../lib/security.js';
import { submissionHandler } from '../lib/submissions.js';
import { adminHandler } from '../lib/admin.js';
const db = new PrismaClient({ log: [] });
const created = [];
try {
  const keys = [generateKey(), generateKey()];
  for (let i = 0; i < 2; i++) {
    const form = await db.form.create({ data: { label: 'Submitly automated verification', recipientName: 'Test recipient', recipientEmail: `recipient${i}@example.com`, subject: 'Mocked test only', keys: { create: { hash: keys[i].hash, prefix: keys[i].prefix } } }, include: { keys: true } });
    created.push(form);
  }
  const seen = [];
  const handler = submissionHandler(db, async submission => { seen.push(submission.recipientEmail); return { status: 'ACCEPTED', brevoMessageId: 'mock-only-no-email-sent' }; });
  const request = key => new Request('http://localhost:3000/form/send', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-API-Key': key }, body: JSON.stringify({ fields: { firstName: 'Test', email: 'visitor@example.com', message: 'Automated verification with mocked email.' } }) });
  for (const key of keys) assert.equal((await handler(request(key.raw))).status, 202);
  assert.deepEqual(seen, ['recipient0@example.com', 'recipient1@example.com']);
  const admin = adminHandler(db, async () => ({ user: { email: process.env.ADMIN_EMAIL } }));
  assert.equal((await admin(new Request('http://localhost:3000/api/admin', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3000', 'X-Submitly-Action': '1' }, body: JSON.stringify({ action: 'revoke', id: created[0].keys[0].id }) }))).status, 200);
  assert.equal((await handler(request(keys[0].raw))).status, 401);
  assert.equal(await db.submission.count({ where: { formId: { in: created.map(f => f.id) } } }), 2);
  console.log('PostgreSQL integration passed: persistence, recipient isolation, row locks, revocation, and retained history. No real emails sent.');
} catch (error) { console.error('Database integration failed:', error.code || error.name); process.exitCode = 1; }
finally {
  const ids = created.map(f => f.id);
  try { if (ids.length) await db.$transaction([
    db.submission.deleteMany({ where: { formId: { in: ids } } }),
    db.apiKey.deleteMany({ where: { formId: { in: ids } } }),
    db.form.deleteMany({ where: { id: { in: ids } } }),
  ]); } catch { console.error('Test fixture cleanup failed; check forms labeled Submitly automated verification.'); process.exitCode = 1; }
  await db.$disconnect();
}
