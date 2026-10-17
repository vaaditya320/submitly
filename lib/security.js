import { scrypt, timingSafeEqual, createHash, randomBytes } from 'node:crypto';
import { promisify } from 'node:util';
const derive = promisify(scrypt);
export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  return `scrypt:${salt}:${(await derive(password, salt, 64)).toString('hex')}`;
}
export async function verifyOwner(credentials, env = process.env) {
  if (!env.ADMIN_EMAIL || !env.ADMIN_PASSWORD_HASH || typeof credentials?.email !== 'string' || typeof credentials?.password !== 'string' || credentials.password.length > 1024) return null;
  const [method, salt, hash] = env.ADMIN_PASSWORD_HASH.split(':');
  if (method !== 'scrypt' || !/^[a-f0-9]{32}$/.test(salt || '') || !/^[a-f0-9]{128}$/.test(hash || '')) return null;
  const actual = await derive(credentials.password, salt, 64);
  const valid = timingSafeEqual(actual, Buffer.from(hash, 'hex'));
  return valid && credentials.email?.toLowerCase() === env.ADMIN_EMAIL.toLowerCase() ? { id: 'owner', email: env.ADMIN_EMAIL, name: 'Owner' } : null;
}
export function isOwner(session) { return !!process.env.ADMIN_EMAIL && session?.user?.email === process.env.ADMIN_EMAIL; }
export function hashKey(key) { return createHash('sha256').update(key).digest('hex'); }
export function generateKey() {
  const raw = `sub_${randomBytes(32).toString('base64url')}`;
  return { raw, hash: hashKey(raw), prefix: raw.slice(0, 12) };
}
export function sameOrigin(request) {
  return request.headers.get('origin') === new URL(request.url).origin && request.headers.get('x-submitly-action') === '1';
}
