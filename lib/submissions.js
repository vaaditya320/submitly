import { hashKey } from './security.js';
import { submissionSchema, readJson, HttpError } from './validation.js';
import { sendEmail } from './email.js';
// Public submission keys work from any website. Do not enable cookie credentials.
// These headers also apply to error responses and OPTIONS preflight.
export const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, X-API-Key', 'Cache-Control': 'no-store' };
const json = (data, status) => Response.json(data, { status, headers: cors });
export function submissionHandler(db, send = sendEmail) {
  return async function POST(request) {
    let submission;
    try {
      const raw = request.headers.get('x-api-key');
      if (!raw || raw.length > 128) throw new HttpError(401, 'INVALID_API_KEY', 'A valid submission key is required.');
      const parsed = submissionSchema.safeParse(await readJson(request));
      if (!parsed.success) throw new HttpError(400, 'INVALID_FIELDS', 'Use only firstName (1–100), optional lastName (up to 100), a valid email, and message (1–10000) inside fields.');
      // Lock the key until the submission is admitted. Revoke/rotate uses this same lock.
      submission = await db.$transaction(async tx => {
        const keys = await tx.$queryRaw`SELECT "id" FROM "ApiKey" WHERE "hash" = ${hashKey(raw)} FOR UPDATE`;
        if (!keys.length) throw new HttpError(401, 'INVALID_API_KEY', 'A valid submission key is required.');
        const key = await tx.apiKey.findUnique({ where: { id: keys[0].id }, include: { form: true } });
        if (!key || key.revokedAt) throw new HttpError(401, 'INVALID_API_KEY', 'A valid submission key is required.');
        return tx.submission.create({ data: { formId: key.formId, apiKeyId: key.id, fields: parsed.data.fields, recipientName: key.form.recipientName, recipientEmail: key.form.recipientEmail, subject: key.form.subject } });
      });
      await db.submission.update({ where: { id: submission.id }, data: { status: 'SENDING' } });
      const result = await send(submission);
      try { await db.submission.update({ where: { id: submission.id }, data: result }); }
      catch { return json({ submissionId: submission.id, status: 'UNKNOWN', error: { code: 'STATUS_SAVE_FAILED', message: 'Send outcome could not be recorded. Do not automatically resend.' } }, 503); }
      if (result.status === 'ACCEPTED') return json({ submissionId: submission.id, status: 'ACCEPTED' }, 202);
      return json({ submissionId: submission.id, status: result.status, error: { code: result.errorCode, message: result.status === 'UNKNOWN' ? 'Send outcome is uncertain. Do not automatically resend.' : 'The email was not accepted. Contact the form owner.' } }, result.status === 'UNKNOWN' ? 504 : 502);
    } catch (error) {
      return json({ ...(submission ? { submissionId: submission.id, status: 'UNKNOWN' } : {}), error: { code: error instanceof HttpError ? error.code : 'SERVICE_UNAVAILABLE', message: error instanceof HttpError ? error.message : 'The service is unavailable. Contact the form owner before retrying.' } }, error instanceof HttpError ? error.status : 503);
    }
  };
}
