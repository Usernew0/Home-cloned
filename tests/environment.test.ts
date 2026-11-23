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
      assert.equal(getServiceSupabase().supabaseKey, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY);
    }
  `;
  const result = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '--eval', script], { cwd: process.cwd(), env, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

test('server clients work with SUPABASE_URL alone', () => runtimeProbe({ SUPABASE_URL: 'https://primary.supabase.test', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-service-key' }));
test('server clients prefer SUPABASE_URL over legacy URL', () => runtimeProbe({ SUPABASE_URL: 'https://primary.supabase.test', VITE_SUPABASE_URL: 'https://legacy.supabase.test', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-service-key' }));
test('server clients retain legacy public URL and anon fallback', () => runtimeProbe({ VITE_SUPABASE_URL: 'https://legacy.supabase.test', VITE_SUPABASE_ANON_KEY: 'synthetic-anon-key' }));
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
