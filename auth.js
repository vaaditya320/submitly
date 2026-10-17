import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { verifyOwner } from './lib/security';
export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: process.env.SESSION_SECRET,
  trustHost: true,
  useSecureCookies: process.env.NODE_ENV === 'production',
  session: { strategy: 'jwt', maxAge: 8 * 60 * 60 },
  pages: { signIn: '/login' },
  providers: [Credentials({ credentials: { email: {}, password: {} }, authorize: (credentials) => verifyOwner(credentials) })],
  logger: { error() { console.error('Authentication failed'); }, warn() {}, debug() {} },
});
