import { isOwner, sameOrigin, generateKey } from './security.js';
import { formSchema, readJson, HttpError } from './validation.js';
export function adminHandler(db, auth) {
  return async function POST(request) {
    try {
      if (!isOwner(await auth())) throw new HttpError(401, 'UNAUTHORIZED', 'Owner login required.');
      if (!sameOrigin(request)) throw new HttpError(403, 'CSRF_REJECTED', 'Refresh the dashboard and try again.');
      const body = await readJson(request);
      if (!body || typeof body !== 'object') throw new HttpError(400, 'INVALID_REQUEST', 'Invalid action.');
      const { action, id, form } = body;
      if (action === 'create' || action === 'edit') {
        const parsed = formSchema.safeParse(form);
        if (!parsed.success) throw new HttpError(400, 'INVALID_FORM', 'Enter a label, recipient name, valid email, and subject within the displayed limits.');
        if (action === 'create') {
          const { raw, hash, prefix } = generateKey();
          await db.form.create({ data: { ...parsed.data, keys: { create: { hash, prefix } } } });
          return Response.json({ key: raw }, { headers: { 'Cache-Control': 'no-store' } });
        }
        if (typeof id !== 'string') throw new HttpError(400, 'INVALID_REQUEST', 'Form ID required.');
        await db.form.update({ where: { id }, data: parsed.data });
      } else if (action === 'rotate' || action === 'revoke') {
        if (typeof id !== 'string') throw new HttpError(400, 'INVALID_REQUEST', 'Key ID required.');
        const generated = generateKey();
        await db.$transaction(async tx => {
          await tx.$queryRaw`SELECT "id" FROM "ApiKey" WHERE "id" = ${id} FOR UPDATE`;
          const key = await tx.apiKey.findUnique({ where: { id } });
          if (!key) throw new HttpError(404, 'NOT_FOUND', 'Key not found.');
          if (key.revokedAt) throw new HttpError(409, 'ALREADY_REVOKED', 'This key has already been revoked.');
          await tx.apiKey.update({ where: { id }, data: { revokedAt: new Date() } });
          if (action === 'rotate') await tx.apiKey.create({ data: { formId: key.formId, hash: generated.hash, prefix: generated.prefix } });
        });
        return Response.json(action === 'rotate' ? { key: generated.raw } : { ok: true }, { headers: { 'Cache-Control': 'no-store' } });
      } else throw new HttpError(400, 'INVALID_ACTION', 'Unknown action.');
      return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
      return Response.json({ error: { code: error instanceof HttpError ? error.code : 'SERVICE_UNAVAILABLE', message: error instanceof HttpError ? error.message : 'Could not save changes. Refresh before retrying.' } }, { status: error instanceof HttpError ? error.status : 503, headers: { 'Cache-Control': 'no-store' } });
    }
  };
}
