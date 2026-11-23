import { authHeaders } from "./authHeaders";

/**
 * 2FA changes always re-authenticate on the server. The current password is requested here;
 * a current authenticator/backup code is requested only when the server says it needs one.
 */
async function call(body: Record<string, unknown>): Promise<{ success: boolean; error?: string }> {
  const res = await fetch("/api/auth/two-factor", { method: "POST", headers: authHeaders(), body: JSON.stringify(body) });
  try {
    return await res.json();
  } catch {
    return { success: false, error: "Server error" };
  }
}

export async function changeTwoFactor(
  action: "enable" | "disable",
  extra: { secret?: string; backupCodes?: string[]; enrollCode?: string; targetUsername?: string; targetType?: "admin" | "user" } = {},
): Promise<void> {
  const password = window.prompt("Confirm with your current account password to change two-factor settings:");
  if (!password) throw new Error("Password required");
  let result = await call({ action, password, ...extra });
  if (!result.success && /authenticator code/i.test(result.error || "")) {
    const code = window.prompt("Enter a current authenticator code (or a backup code) for your account:");
    if (!code) throw new Error("Code required");
    result = await call({ action, password, code, ...extra });
  }
  if (!result.success) throw new Error(result.error || "Could not update two-factor settings");
}
