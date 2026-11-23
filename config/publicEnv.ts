/** Only these public values may be included in browser code. Never spread server env. */
export function publicBuildEnv(env: Record<string, string | undefined>): Record<string, string> {
  const unsafe = Object.keys(env).filter((name) => env[name] && (
    /^VITE_.*PASSWORD/i.test(name) || name === 'VITE_SUPABASE_SERVICE_ROLE_KEY'
  ));
  if (unsafe.length) {
    // Names only: never print configured values in logs.
    throw new Error(`Unsafe browser secret configuration: ${unsafe.sort().join(', ')}. Remove these variables from the build environment. Legacy UI passcodes need a reviewed server-side design; renaming is not a migration.`);
  }
  return {
    VITE_SUPABASE_URL: env.SUPABASE_URL || env.VITE_SUPABASE_URL || '',
    VITE_SUPABASE_ANON_KEY: env.VITE_SUPABASE_ANON_KEY || '',
    VITE_APP_USERNAME: env.VITE_APP_USERNAME || '',
  };
}
