import React, { useState, useEffect, useRef } from "react";
import { startFirebaseSession } from "../lib/firebaseScope";
import { motion } from "motion/react";
import { Heart, Lock, User, Sparkles, KeyRound, ShieldAlert, ShieldCheck } from "lucide-react";
import { UserAccount, AdminSetting } from "../types";
import { getClientIp, isUnusualAccessHour } from "../utils/crypto";
import { logActivity } from "../lib/syncService";
import { TwoFactorAuthStep } from "./TwoFactorAuthStep";
import { sendTelegramAlert, formatSecurityAlertTelegramMessage } from "../lib/telegramService";
import { supabase } from "../lib/supabase";

interface LoginProps {
  onLoginSuccess: (username: string) => void;
  userAccounts: UserAccount[];
  adminSettings: AdminSetting[];
  logoutMessage?: string | null;
}

interface TwoFactorPendingAccount {
  username: string;
}

export const Login: React.FC<LoginProps> = ({ onLoginSuccess, userAccounts, adminSettings, logoutMessage }) => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [quoteIndex, setQuoteIndex] = useState(0);

  // 2FA pending state
  const [pending2FA, setPending2FA] = useState<TwoFactorPendingAccount | null>(null);
  // Held only in memory between the password step and the 2FA step; never persisted.
  const pendingPasswordRef = useRef("");

  // Anti-brute-force rate limiting state
  const [failedAttempts, setFailedAttempts] = useState<number>(() => {
    const stored = localStorage.getItem("love_login_failed_attempts");
    return stored ? parseInt(stored, 10) : 0;
  });
  const [lockoutUntil, setLockoutUntil] = useState<number>(() => {
    const stored = localStorage.getItem("love_login_lockout_until");
    return stored ? parseInt(stored, 10) : 0;
  });
  const [lockoutRemaining, setLockoutRemaining] = useState<number>(0);

  const loveQuotes = ["“In all the world, there is no heart for me like yours.”", "“I love you and that’s the beginning and end of everything.”", "“You are my today and all of my tomorrows.”", "“To love and be loved is to feel the sun from both sides.”"];

  useEffect(() => {
    const interval = setInterval(() => {
      setQuoteIndex((prev) => (prev + 1) % loveQuotes.length);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  // Update lockout countdown timer
  useEffect(() => {
    const checkLockout = () => {
      const now = Date.now();
      if (lockoutUntil > now) {
        setLockoutRemaining(Math.ceil((lockoutUntil - now) / 1000));
      } else {
        setLockoutRemaining(0);
      }
    };
    checkLockout();
    const interval = setInterval(checkLockout, 1000);
    return () => clearInterval(interval);
  }, [lockoutUntil]);

  const secDoc = adminSettings.find((s) => s.id === "securityConfig");
  const configuredMaxAttempts = Math.max(1, secDoc?.loginMaxAttempts ?? 5);
  const configuredLockoutSeconds = Math.max(5, secDoc?.loginLockoutSeconds ?? 60);

  type ServerLoginResult = { success: boolean; username?: string; requires2fa?: boolean; error?: string; status?: number };

  // All credential and second-factor checks happen on the server. The browser never receives password hashes or 2FA secrets.
  const callServerLogin = async (extra: { totp?: string; backupCode?: string } = {}, creds?: { username: string; password: string }): Promise<ServerLoginResult> => {
    const body = { username: (creds?.username ?? username).trim(), password: creds?.password ?? pendingPasswordRef.current, ...extra };
    try {
      const res = await fetch("/api/auth/verify-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (data.success && data.username) {
        if (supabase && data.supabaseSession?.access_token && data.supabaseSession?.refresh_token) {
          // Fail closed: only keep a Supabase session whose token names the account that just signed in.
          let ok = false;
          try {
            const md = JSON.parse(atob(String(data.supabaseSession.access_token).split(".")[1].replace(/-/g, "+").replace(/_/g, "/")))?.app_metadata;
            ok = !!md && (md.pid ?? "") === (data.pid ?? "") && md.couple_id === data.coupleId && md.role === data.role;
          } catch { ok = false; }
          if (ok) {
            await supabase.auth.setSession({
              access_token: data.supabaseSession.access_token,
              refresh_token: data.supabaseSession.refresh_token,
            });
          } else {
            await supabase.auth.signOut().catch(() => {});
          }
        }
        if (data.sessionToken) localStorage.setItem("love_server_session_token", data.sessionToken);
        await startFirebaseSession({ firebaseToken: data.firebaseToken, coupleId: data.coupleId, role: data.role, username: data.username, pid: data.pid });
        return { success: true, username: data.username };
      }
      return { success: false, requires2fa: !!data.requires2fa, error: data.error, status: res.status };
    } catch {
      return { success: false, error: "Could not reach the server. Please try again.", status: 0 };
    }
  };

  const registerFailure = (name: string, kind: string, details: string, clientIp: string, unusualLabel: string) => {
    const nextFailed = failedAttempts + 1;
    setFailedAttempts(nextFailed);
    localStorage.setItem("love_login_failed_attempts", nextFailed.toString());
    if (nextFailed >= configuredMaxAttempts) {
      const lockoutTime = Date.now() + configuredLockoutSeconds * 1000;
      setLockoutUntil(lockoutTime);
      localStorage.setItem("love_login_lockout_until", lockoutTime.toString());
      const lockoutDetails = `🚨 Account locked out for ${configuredLockoutSeconds}s after ${nextFailed} failed attempts. IP: ${clientIp} | ${unusualLabel}`;
      logActivity(name || "Unknown User", "security_lockout_triggered", lockoutDetails).catch(() => {});
      sendTelegramAlert(formatSecurityAlertTelegramMessage(name || "Unknown User", "security_lockout_triggered", lockoutDetails), "security", { targetUsername: name, adminSettings, userAccounts }).catch(() => {});
      return { locked: true, remaining: 0 };
    }
    const failedDetails = `${details} (${nextFailed}/${configuredMaxAttempts}). IP: ${clientIp} | ${unusualLabel}`;
    logActivity(name || "Unknown User", kind, failedDetails).catch(() => {});
    sendTelegramAlert(formatSecurityAlertTelegramMessage(name || "Unknown User", kind, failedDetails), "security", { targetUsername: name, adminSettings, userAccounts }).catch(() => {});
    return { locked: false, remaining: configuredMaxAttempts - nextFailed };
  };

  const completeLogin = async (name: string) => {
    const clientIp = await getClientIp();
    const unusualTime = isUnusualAccessHour();
    setFailedAttempts(0);
    setLockoutUntil(0);
    localStorage.removeItem("love_login_failed_attempts");
    localStorage.removeItem("love_login_lockout_until");
    pendingPasswordRef.current = "";
    if (unusualTime.isUnusual) {
      logActivity(name, "security_unusual_time_login", `Login detected during unusual off-hours (${unusualTime.label}) from IP: ${clientIp}`).catch(() => {});
    }
    sendTelegramAlert(formatSecurityAlertTelegramMessage(name, unusualTime.isUnusual ? "security_unusual_time_login" : "security_login_success", `User '${name}' logged in successfully. IP: ${clientIp} | ${unusualTime.label}`), "security", { targetUsername: name, adminSettings, userAccounts }).catch(() => {});
    onLoginSuccess(name);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (Date.now() < lockoutUntil) {
      setError(`Too many failed attempts. Please wait ${lockoutRemaining}s before trying again.`);
      return;
    }
    if (!username.trim()) {
      setError("Please enter your beautiful name");
      return;
    }
    if (!password) {
      setError("Please enter the secret password");
      return;
    }

    setIsSubmitting(true);
    pendingPasswordRef.current = password;
    const result = await callServerLogin({}, { username, password });

    if (result.success && result.username) {
      await completeLogin(result.username);
      return;
    }

    if (result.requires2fa) {
      setIsSubmitting(false);
      setPending2FA({ username: username.trim() });
      logActivity(username.trim(), "security_2fa_prompted", `Password verified. 2FA verification step prompted for "${username.trim()}".`).catch(() => {});
      return;
    }

    pendingPasswordRef.current = "";
    if (result.status === 429 || result.status === 0 || (result.status && result.status >= 500)) {
      setError(result.error || "Sign-in is unavailable right now.");
      setIsSubmitting(false);
      return;
    }

    const clientIp = await getClientIp();
    const unusualTime = isUnusualAccessHour();
    const outcome = registerFailure(username.trim(), "security_failed_login", "Failed login password attempt", clientIp, unusualTime.label);
    setError(outcome.locked ? `Too many failed login attempts. Please wait ${configuredLockoutSeconds} seconds.` : `Incorrect name or secret password. (${outcome.remaining} attempts remaining)`);
    setIsSubmitting(false);
  };

  const verifySecondFactor = async (extra: { totp?: string; backupCode?: string }): Promise<{ success: boolean; message?: string }> => {
    if (!pending2FA) return { success: false, message: "No 2FA session found." };
    const name = pending2FA.username;
    const result = await callServerLogin(extra, { username: name, password: pendingPasswordRef.current });
    if (result.success && result.username) {
      const clientIp = await getClientIp();
      logActivity(name, extra.backupCode ? "security_backup_code_used" : "security_2fa_success", extra.backupCode ? `🚨 Emergency single-use backup recovery code was used for "${name}". IP: ${clientIp}` : `🔐 Two-factor authentication (TOTP) successful for "${name}". IP: ${clientIp}`).catch(() => {});
      setPending2FA(null);
      await completeLogin(result.username);
      return { success: true };
    }
    if (result.status === 429) {
      return { success: false, message: result.error || "Too many attempts. Try again later." };
    }
    const clientIp = await getClientIp();
    const unusualTime = isUnusualAccessHour();
    const outcome = registerFailure(name, "security_2fa_failed", extra.backupCode ? "🚨 Failed emergency backup recovery code attempt" : "🚨 Failed 2FA TOTP code attempt", clientIp, unusualTime.label);
    if (outcome.locked) {
      setPending2FA(null);
      pendingPasswordRef.current = "";
      setError(`Too many failed 2FA verification attempts. Locked out for ${configuredLockoutSeconds}s.`);
      return { success: false, message: `Account locked out for ${configuredLockoutSeconds} seconds.` };
    }
    return {
      success: false,
      message: extra.backupCode ? `Invalid or already consumed emergency recovery code. (${outcome.remaining} attempts remaining)` : `Invalid 6-digit code. Please verify your authenticator app clock. (${outcome.remaining} attempts remaining)`,
    };
  };

  const handleVerifyTOTP = (code: string) => verifySecondFactor({ totp: code.trim() });
  const handleVerifyBackupCode = (code: string) => verifySecondFactor({ backupCode: code.trim() });

  return (
    <main id="login_container" className="min-h-screen min-h-[100dvh] w-full flex items-center justify-center bg-neutral-950 text-white relative px-4 overflow-hidden">
      {/* ATMOSPHERIC BACKGROUND BLOBS */}
      <div className="absolute top-[-200px] left-[-200px] w-[600px] h-[600px] bg-rose-600/10 rounded-full blur-[150px] pointer-events-none z-0"></div>
      <div className="absolute bottom-[-200px] right-[-200px] w-[600px] h-[600px] bg-purple-600/10 rounded-full blur-[150px] pointer-events-none z-0"></div>

      <div className="relative z-10 w-full max-w-md">
        {/* LOGO AND BRANDING */}
        <div className="text-center mb-8">
          <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.5, type: "spring" }} className="inline-block p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl mb-4 text-rose-500 shadow-xl shadow-rose-950/20">
            <Heart className="w-10 h-10 fill-rose-500 animate-pulse" />
          </motion.div>
          <motion.h1 initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.1, duration: 0.5 }} className="font-serif text-3xl font-extrabold tracking-tight text-white mb-2 bg-gradient-to-r from-white via-rose-100 to-rose-300 bg-clip-text text-transparent">
            Our Home
          </motion.h1>
          <motion.p initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.2, duration: 0.5 }} className="text-xs text-rose-200/60 font-mono tracking-widest uppercase">
            Our Sacred Space of Love & Memories
          </motion.p>
        </div>

        {/* LOGIN FORM / 2FA CARD */}
        <motion.div initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.3, duration: 0.6 }} className="bg-neutral-900/60 border border-white/10 backdrop-blur-xl rounded-3xl p-6 sm:p-8 shadow-2xl shadow-neutral-950/80 relative">
          {/* Subtle sparkles decoration */}
          <div className="absolute top-4 right-4 text-rose-500/30">
            <Sparkles className="w-5 h-5 animate-spin-slow" />
          </div>

          {pending2FA ? (
            /* TWO-FACTOR AUTHENTICATION STEP */
            <TwoFactorAuthStep username={pending2FA.username} onVerifyTOTP={handleVerifyTOTP} onVerifyBackupCode={handleVerifyBackupCode} onCancel={() => setPending2FA(null)} remainingAttempts={configuredMaxAttempts - failedAttempts} />
          ) : (
            /* STANDARD PASSWORD FORM */
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Logout/Security Warning Message */}
              {logoutMessage && !error && (
                <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="p-3.5 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-xs text-rose-300 text-center font-sans font-medium flex items-center justify-center gap-2">
                  <Lock className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>{logoutMessage}</span>
                </motion.div>
              )}

              {/* Username Input */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-rose-200/80 tracking-wide uppercase block">Enter the Beautiful Name</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-neutral-400">
                    <User className="w-4 h-4" />
                  </div>
                  <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} className="w-full bg-neutral-950/80 border border-white/10 rounded-2xl pl-10 pr-4 py-3 text-white placeholder-neutral-500 focus:outline-none focus:border-rose-500/60 focus:ring-2 focus:ring-rose-500/20 transition-all font-sans" placeholder="e.g. username" disabled={isSubmitting} />
                </div>
              </div>

              {/* Password Input */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-rose-200/80 tracking-wide uppercase block">Enter the Secret Password</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-neutral-400">
                    <KeyRound className="w-4 h-4" />
                  </div>
                  <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full bg-neutral-950/80 border border-white/10 rounded-2xl pl-10 pr-4 py-3 text-white placeholder-neutral-500 focus:outline-none focus:border-rose-500/60 focus:ring-2 focus:ring-rose-500/20 transition-all font-sans" placeholder="••••••••" disabled={isSubmitting} />
                </div>
              </div>

              {/* Error Message */}
              {error && (
                <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs text-rose-300 text-center font-sans font-medium">
                  {error}
                </motion.div>
              )}

              {/* Submit Button */}
              <button type="submit" disabled={isSubmitting} className="w-full relative group overflow-hidden bg-gradient-to-r from-rose-500 to-pink-600 text-white rounded-2xl py-3.5 px-4 font-semibold text-sm hover:opacity-95 active:scale-[0.98] transition-all duration-200 shadow-lg shadow-rose-950/30 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50">
                {isSubmitting ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                ) : (
                  <>
                    <span>Enter Our Love Garden</span>
                    <Heart className="w-4 h-4 fill-white" />
                  </>
                )}
              </button>
            </form>
          )}
        </motion.div>

        {/* ROTATING LOVE QUOTE FOOTER */}
        <div className="mt-12 text-center h-12 flex items-center justify-center px-4">
          <motion.p key={`login-quote-${quoteIndex}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.5 }} className="text-xs text-neutral-400 italic font-serif leading-relaxed max-w-sm">
            {loveQuotes[quoteIndex]}
          </motion.p>
        </div>
      </div>
    </main>
  );
};
