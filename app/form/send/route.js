import { db } from '../../../lib/db';
import { cors, submissionHandler } from '../../../lib/submissions';
export const runtime = 'nodejs';
export const POST = submissionHandler(db);
export function OPTIONS() { return new Response(null, { status: 204, headers: cors }); }
