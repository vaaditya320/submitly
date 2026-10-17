import { auth } from '../../auth';
import { isOwner } from '../../lib/security';
import { db } from '../../lib/db';
import { redirect } from 'next/navigation';
import Dashboard from './workspace';
export const dynamic = 'force-dynamic';
export default async function Page({ searchParams }) {
  const session = await auth(); if (!isOwner(session)) redirect('/login');
  const params = await searchParams;
  const page = Math.min(100000, Math.max(1, Number.parseInt(params.page, 10) || 1));
  let data;
  try {
    // A stopped process cannot reconcile an in-flight send; mark stale states uncertain.
    await db.submission.updateMany({ where: { status: { in: ['PENDING', 'SENDING'] }, updatedAt: { lt: new Date(Date.now() - 300000) } }, data: { status: 'UNKNOWN', errorCode: 'PROCESS_INTERRUPTED' } });
    const [forms, submissions, total, accepted, uncertain] = await Promise.all([
      db.form.findMany({ orderBy: { createdAt: 'desc' }, include: { keys: { orderBy: { createdAt: 'desc' }, select: { id: true, prefix: true, createdAt: true, revokedAt: true } }, _count: { select: { submissions: true } } } }),
      db.submission.findMany({ orderBy: { createdAt: 'desc' }, skip: (page - 1) * 25, take: 25, include: { form: { select: { label: true } }, apiKey: { select: { prefix: true } } } }),
      db.submission.count(), db.submission.count({ where: { status: 'ACCEPTED' } }), db.submission.count({ where: { status: { in: ['FAILED', 'UNKNOWN'] } } }),
    ]);
    data = JSON.parse(JSON.stringify({ forms, submissions, total, accepted, uncertain, page }));
  } catch { data = { forms: [], submissions: [], total: 0, accepted: 0, uncertain: 0, page, unavailable: true }; }
  return <Dashboard data={data} email={session.user.email} />;
}
