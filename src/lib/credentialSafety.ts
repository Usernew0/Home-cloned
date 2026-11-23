/** Legacy credential mirrors are not an authority. Only the server owns credentials. */
export const isCredentialSetting = (row: any) => row?.id === 'adminAccounts' || row?.id === 'credentials';
const secretKeys = new Set(['password', 'twoFactorSecret', 'two_factor_secret', 'twoFactorBackupCodes', 'two_factor_backup_codes']);
export function redactCredentialRecord<T>(value: T): T {
  if (Array.isArray(value)) return value.map(redactCredentialRecord) as T;
  if (!value || typeof value !== 'object') return value;
  const clean: any = {};
  for (const [key, child] of Object.entries(value)) {
    if (!secretKeys.has(key)) clean[key] = redactCredentialRecord(child);
  }
  return clean;
}
export function safeCachedSettings<T>(rows: T[]): T[] {
  return rows.map(row => isCredentialSetting(row) ? redactCredentialRecord(row) : row);
}

/** No cache/mirror writes before server success. Inputs may contain a password only in memory. */
export async function saveCredentialSetting(
  setting: any,
  deps: { fetch: typeof fetch; token: string; commit: (rows: any[]) => void }
) {
  const headers = { 'Content-Type': 'application/json', ...(deps.token ? {'x-server-session': deps.token} : {}) };
  const response = await deps.fetch('/api/admin-settings', {method:'POST', headers, body:JSON.stringify(setting)});
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error(result.error || 'Credential save failed.');
  const refreshed = await deps.fetch('/api/admin-settings', {headers});
  const data = await refreshed.json();
  if (!refreshed.ok || !data.success || !Array.isArray(data.settings)) {
    throw new Error('Credentials were saved, but refresh failed. Reload before editing again.');
  }
  deps.commit(safeCachedSettings(data.settings));
}
