import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { publicBuildEnv } from '../config/publicEnv.ts';

const envNames = ['SUPABASE_URL', 'VITE_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'VITE_SUPABASE_SERVICE_ROLE_KEY', 'VITE_SUPABASE_ANON_KEY'];
function runtimeProbe(overrides: Record<string, string>, missing = false) {
  const env = { ...process.env };
  for (const name of envNames) delete env[name];
  Object.assign(env, overrides, { SERVER_SESSION_SECRET: 'synthetic-session-secret-at-least-32-chars' });
  const script = `
    import assert from 'node:assert/strict';
    globalThis.fetch = async () => { throw new Error('Network is prohibited in environment tests'); };
    const { supabaseAdmin, verifyLogin } = await import('./server/handlers.ts');
    const { getServiceSupabase } = await import('./server/supabaseLazy.ts');
    if (${missing}) {
      assert.equal(supabaseAdmin, null);
      assert.throws(() => getServiceSupabase(), /Supabase is not configured/);
      const res = { status(c) { this.code = c; return this; }, json(body) { this.body = body; return this; } };
      await verifyLogin({ body: { username: 'alice', password: 'test-only' }, headers: {}, socket: {} }, res);
      assert.equal(res.code, 503);
      assert.equal(res.body.success, false);
    } else {
      const expected = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
      assert.equal(supabaseAdmin.supabaseUrl, expected);
      assert.equal(getServiceSupabase().supabaseUrl, expected);
      assert.equal(getServiceSupabase().supabaseKey, process.env.SUPABASE_SERVICE_ROLE_KEY);
    }
  `;
  const result = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '--eval', script], { cwd: process.cwd(), env, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

test('server clients work with SUPABASE_URL alone', () => runtimeProbe({ SUPABASE_URL: 'https://primary.supabase.test', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-service-key' }));
test('server clients prefer SUPABASE_URL over legacy URL', () => runtimeProbe({ SUPABASE_URL: 'https://primary.supabase.test', VITE_SUPABASE_URL: 'https://legacy.supabase.test', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-service-key' }));
test('server clients keep the legacy public URL alias with a service key', () => runtimeProbe({ VITE_SUPABASE_URL: 'https://legacy.supabase.test', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-service-key' }));
test('no anon-key fallback: the public key alone leaves the server unconfigured (503)', () => runtimeProbe({ SUPABASE_URL: 'https://primary.supabase.test', VITE_SUPABASE_ANON_KEY: 'synthetic-anon-key' }, true));
const jwt = (role: string) => `h.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.s`;
test('an anon JWT or sb_publishable key placed in the service-role variable is refused', () => {
  runtimeProbe({ SUPABASE_URL: 'https://primary.supabase.test', SUPABASE_SERVICE_ROLE_KEY: jwt('anon') }, true);
  runtimeProbe({ SUPABASE_URL: 'https://primary.supabase.test', SUPABASE_SERVICE_ROLE_KEY: 'sb_publishable_synthetic' }, true);
});
test('a service_role JWT and an sb_secret key are accepted', () => {
  runtimeProbe({ SUPABASE_URL: 'https://primary.supabase.test', SUPABASE_SERVICE_ROLE_KEY: jwt('service_role') });
  runtimeProbe({ SUPABASE_URL: 'https://primary.supabase.test', SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_synthetic' });
});
test('missing URL fails closed without network calls', () => runtimeProbe({ SUPABASE_SERVICE_ROLE_KEY: 'synthetic-service-key' }, true));
test('missing server key refuses unsafe VITE service-role alias', () => runtimeProbe({ SUPABASE_URL: 'https://primary.supabase.test', VITE_SUPABASE_SERVICE_ROLE_KEY: 'unsafe-legacy-test-key' }, true));
test('public build config exposes only allowlisted values and maps public URL', () => {
  assert.deepEqual(publicBuildEnv({ SUPABASE_URL: 'https://primary.supabase.test', VITE_SUPABASE_URL: 'https://legacy.supabase.test', VITE_SUPABASE_ANON_KEY: 'public-anon', VITE_APP_USERNAME: 'display-only', SUPABASE_SERVICE_ROLE_KEY: 'server-only', SERVER_SESSION_SECRET: 'server-only', VITE_UNKNOWN_SECRET: 'must-not-appear' }), { VITE_SUPABASE_URL: 'https://primary.supabase.test', VITE_SUPABASE_ANON_KEY: 'public-anon', VITE_APP_USERNAME: 'display-only' });
  assert.equal(publicBuildEnv({ VITE_SUPABASE_URL: 'legacy' }).VITE_SUPABASE_URL, 'legacy');
  assert.equal(publicBuildEnv({}).VITE_SUPABASE_URL, '');
});
test('known browser-secret settings block builds, with names but never values', () => {
  for (const name of ['VITE_PASSWORD_EXAMPLE', 'VITE_MILESTONES_PASSWORD', 'VITE_CHOOSE_BIRTHDAY_PASSWORD', 'VITE_CHOOSE_ENGAGEMENT_PASSWORD', 'VITE_CHOOSE_FIREWORKS_PASSWORD', 'VITE_SUPABASE_SERVICE_ROLE_KEY']) {
    assert.throws(() => publicBuildEnv({ [name]: 'synthetic-secret-not-for-logs' }), (error: Error) => error.message.includes(name) && !error.message.includes('synthetic-secret-not-for-logs'));
  }
});

test('server clients do not keep a user session (service key stays in force after a sign-in)', async () => {
  const script = `
    import assert from 'node:assert/strict';
    const seen = [];
    globalThis.fetch = async (url, init) => {
      const u = String(url); const h = new Headers(init?.headers);
      seen.push([u.replace(/^https?:\\/\\/[^/]+/, ''), h.get('authorization')]);
      if (u.includes('/auth/v1/token')) return new Response(JSON.stringify({ access_token: 'user-jwt', refresh_token: 'r', token_type: 'bearer', expires_in: 3600, user: { id: 'u1' } }), { status: 200, headers: { 'content-type': 'application/json' } });
      return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } });
    };
    const { supabaseAdmin } = await import('./server/handlers.ts');
    const { createClient } = await import('@supabase/supabase-js');
    await supabaseAdmin.from('user_accounts').select('id');
    await createClient('https://primary.supabase.test', 'service-key-synthetic', { auth: { persistSession: false, autoRefreshToken: false } }).auth.signInWithPassword({ email: 'a@b.c', password: 'x' });
    await supabaseAdmin.from('user_accounts').select('id');
    const rest = seen.filter(([p]) => p.startsWith('/rest/v1/'));
    assert.equal(rest.length, 2);
    for (const [, auth] of rest) assert.equal(auth, 'Bearer service-key-synthetic');
  `;
  const env = { ...process.env, SUPABASE_URL: 'https://primary.supabase.test', SUPABASE_SERVICE_ROLE_KEY: 'service-key-synthetic', SERVER_SESSION_SECRET: 'synthetic-session-secret-at-least-32-chars' };
  const r = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '--eval', script], { cwd: process.cwd(), env, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr || r.stdout);
});

test('source guard: no password sign-in on the shared server client (it would turn the service client into that user)', async () => {
  const { readFileSync } = await import('node:fs');
  for (const f of ['server/handlers.ts', 'server.ts', 'server/supabaseLazy.ts']) {
    assert.doesNotMatch(readFileSync(f, 'utf8'), /supabaseAdmin\.auth\.signIn|getServiceSupabase\(\)\.auth\.signIn|lazySupabase\.auth\.signIn/, f);
  }
});
