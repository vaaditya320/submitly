import { z } from 'zod';
const name = z.string().trim().min(1).max(100).regex(/^[^\r\n\x00-\x1f]*$/);
export const submissionSchema = z.object({ fields: z.object({ firstName: name, lastName: z.string().trim().max(100).regex(/^[^\r\n\x00-\x1f]*$/).optional(), email: z.string().trim().email().max(254), message: z.string().trim().min(1).max(10000) }).strict() }).strict();
export const formSchema = z.object({ label: name, recipientName: name, recipientEmail: z.string().trim().email().max(254), subject: z.string().trim().min(1).max(200).regex(/^[^\r\n\x00-\x1f]*$/) }).strict();
export class HttpError extends Error { constructor(status, code, message) { super(message); this.status = status; this.code = code; } }
export async function readJson(request) {
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') throw new HttpError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Use application/json.');
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, 'INVALID_JSON', 'A JSON body is required.');
  const chunks = []; let size = 0;
  while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > 65536) { await reader.cancel(); throw new HttpError(413, 'BODY_TOO_LARGE', 'Body exceeds 64 KB.'); } chunks.push(value); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new HttpError(400, 'INVALID_JSON', 'Provide valid JSON.'); }
}
