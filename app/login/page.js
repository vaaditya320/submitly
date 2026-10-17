import { auth } from '../../auth';
import { isOwner } from '../../lib/security';
import { redirect } from 'next/navigation';
import Login from './login';
export const dynamic = 'force-dynamic';
export default async function Page() { if (isOwner(await auth())) redirect('/dashboard'); return <Login />; }
