import assert from 'node:assert/strict';
const base = 'http://localhost:3000';
const cookies = new Map();
async function request(path, options = {}) {
  const headers = new Headers(options.headers);
  headers.set('cookie', [...cookies].map(([k,v]) => `${k}=${v}`).join('; '));
  const response = await fetch(base + path, { ...options, headers, redirect: 'manual' });
  for (const entry of response.headers.getSetCookie()) { const pair = entry.split(';')[0]; const pos = pair.indexOf('='); cookies.set(pair.slice(0,pos), pair.slice(pos + 1)); }
  return response;
}
try {
  assert.equal((await request('/dashboard')).status, 307);
  assert.equal((await request('/api/admin', { method: 'POST' })).status, 401);
  const preflight = await request('/form/send', { method: 'OPTIONS', headers: { Origin: 'https://any-website.example' } });
  assert.equal(preflight.status, 204); assert.equal(preflight.headers.get('access-control-allow-origin'), '*'); assert.equal(preflight.headers.get('access-control-allow-credentials'), null);
  assert.equal((await request('/form/send', { method: 'POST' })).status, 401);
  if (process.env.SUBMITLY_SMOKE_PASSWORD) {
    const csrf = (await (await request('/api/auth/csrf')).json()).csrfToken;
    const result = await request('/api/auth/callback/credentials', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Auth-Return-Redirect': '1' }, body: new URLSearchParams({ csrfToken: csrf, email: process.env.ADMIN_EMAIL, password: process.env.SUBMITLY_SMOKE_PASSWORD, callbackUrl: base + '/dashboard' }) });
    assert.ok(!(await result.json()).url.includes('error='), 'Login failed');
    const session = await (await request('/api/auth/session')).json(); assert.equal(session.user.email, process.env.ADMIN_EMAIL);
    const dashboard = await request('/dashboard'); assert.equal(dashboard.status, 200); const html = await dashboard.text(); assert.ok(html.includes('A home for every hello.')); assert.ok(!html.includes('Database unavailable.'));
    assert.equal((await request('/api/admin', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example', 'X-Submitly-Action': '1' }, body: JSON.stringify({ action: 'create' }) })).status, 403);
    if (process.env.SUBMITLY_BROWSER_CHECK) {
      const { execSync } = await import('node:child_process');
      const token = cookies.get('authjs.session-token');
      assert.match(token, /^[A-Za-z0-9_.-]+$/);
      // Only a validated encrypted cookie is passed; never print it or persist auth state.
      execSync(`npx --yes agent-browser --session submitly cookies set authjs.session-token ${token}`, { stdio: 'pipe' });
      execSync('npx --yes agent-browser --session submitly open http://localhost:3000/dashboard', { stdio: 'pipe' });
    }
    console.log('HTTP checks passed: real NextAuth login/session, protected dashboard, database rendering, CSRF, API authorization, and CORS.');
  } else console.log('Unauthenticated HTTP checks passed. Set SUBMITLY_SMOKE_PASSWORD to also verify owner login.');
} catch (error) { console.error('HTTP verification failed:', error.name, error instanceof assert.AssertionError ? error.message.split('\n')[0] : 'Request or browser command failed'); process.exitCode = 1; }
