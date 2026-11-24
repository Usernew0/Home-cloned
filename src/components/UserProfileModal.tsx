import React, { useState, useEffect } from 'react';
import { refreshFirebaseSession } from '../lib/firebaseScope';
import { motion, AnimatePresence } from 'motion/react';
import {
  User,
  Heart,
  Copy,
  Check,
  Eye,
  EyeOff,
  X,
  Users,
  ShieldCheck,
  KeyRound,
  CheckCircle2,
  AlertCircle,
  UserCheck,
  UserPlus,
  Globe,
  Send,
  RefreshCw
} from 'lucide-react';
import { UserAccount, CoupleTenant, AdminSetting } from '../types';
import { saveUserAccountDoc, saveCoupleTenantDoc, logActivity, saveChatMessageDoc } from '../lib/syncService';
import { TwoFactorSetupModal } from './TwoFactorSetupModal';
import { changeTwoFactor } from '../lib/twoFactorApi';
import { authHeaders } from '../lib/authHeaders';
import { useTelegramWhitelistSync } from '../hooks/useTelegramWhitelistSync';

interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUsername: string;
  userAccounts: UserAccount[];
  coupleTenant: CoupleTenant;
  allCoupleTenants?: CoupleTenant[];
  adminSettings?: AdminSetting[];
  onUserUpdated?: () => void;
}

export const UserProfileModal: React.FC<UserProfileModalProps> = ({
  isOpen,
  onClose,
  currentUsername,
  userAccounts,
  coupleTenant,
  allCoupleTenants = [],
  adminSettings,
  onUserUpdated
}) => {
  // Find current user account doc
  const userAccount = userAccounts.find(
    u => u.username?.toLowerCase().trim() === currentUsername.toLowerCase().trim()
  );

  // Password fields state
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Password visibility toggles
  const [showOldPassword, setShowOldPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Gender state
  const [gender, setGender] = useState<'male' | 'female' | 'other' | string>(userAccount?.gender || 'male');

  // Global Community Chat toggle state
  const [enableGlobalChat, setEnableGlobalChat] = useState<boolean>(() => {
    if (userAccount?.enableGlobalChat !== undefined) return userAccount.enableGlobalChat;
    const stored = localStorage.getItem(`enable_global_chat_${currentUsername}`);
    return stored === 'false' ? false : true;
  });

  // Telegram Username state
  const [telegramUsername, setTelegramUsername] = useState<string>(userAccount?.telegramUsername || '');

  // View-only Couple Space ID
  const coupleId = userAccount?.coupleId || coupleTenant.coupleId || `couple_${currentUsername}`;

  // Partner states
  const [partnerUsername, setPartnerUsername] = useState('');
  const [invitePartnerInput, setInvitePartnerInput] = useState('');

  // General state
  const [isCopied, setIsCopied] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [telegramFeedback, setTelegramFeedback] = useState<string | null>(null);

  // Hook: Telegram Whitelist Auto-Sync
  const {
    isSyncing: isTelegramSyncing,
    syncStatus: telegramSyncStatus,
    isWhitelisted: isTelegramWhitelisted,
    isConfirmed: isTelegramConfirmed,
    linkedChatId: telegramChatId,
    errorMessage: telegramSyncError,
    botUsername,
    syncUserToWhitelist
  } = useTelegramWhitelistSync({
    telegramUsername,
    appUsername: currentUsername,
    coupleId,
    adminSettings,
    userAccounts
  });

  const handleManualSyncTelegram = async () => {
    if (!telegramUsername.trim()) return;
    setTelegramFeedback(null);
    const res = await syncUserToWhitelist(telegramUsername);
    setTelegramFeedback(res.message);
  };

  // 2FA Setup Modal State
  const [is2FAModalOpen, setIs2FAModalOpen] = useState(false);

  const handleSaveUser2FA = async (newSecret: string, newBackupCodes: string[], enrollCode: string) => {
    await changeTwoFactor('enable', { secret: newSecret, backupCodes: newBackupCodes, enrollCode });
    await logActivity(currentUsername, 'security_2fa_enabled', `User "${currentUsername}" activated Two-Factor Authentication (TOTP RFC 6238).`);
    setSuccessMsg('Two-Factor Authentication (2FA) successfully activated for your account!');
    setTimeout(() => setSuccessMsg(null), 4000);
    if (onUserUpdated) onUserUpdated();
  };

  const handleDisableUser2FA = async () => {
    await changeTwoFactor('disable');
    await logActivity(currentUsername, 'security_2fa_disabled', `User "${currentUsername}" disabled Two-Factor Authentication.`);
    setSuccessMsg('Two-Factor Authentication has been disabled.');
    setTimeout(() => setSuccessMsg(null), 4000);
    if (onUserUpdated) onUserUpdated();
  };

  // Detect current partner on open
  useEffect(() => {
    if (!isOpen) return;

    // Reset password fields
    setOldPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setSuccessMsg(null);
    setErrorMsg(null);
    setInvitePartnerInput('');

    const targetAcc = userAccount || userAccounts.find(u => u.username?.toLowerCase().trim() === currentUsername.toLowerCase().trim());
    if (targetAcc) {
      setGender(targetAcc.gender || 'male');
      setTelegramUsername(targetAcc.telegramUsername || '');
      if (targetAcc.enableGlobalChat !== undefined) {
        setEnableGlobalChat(targetAcc.enableGlobalChat);
      } else {
        const stored = localStorage.getItem(`enable_global_chat_${currentUsername}`);
        setEnableGlobalChat(stored === 'false' ? false : true);
      }
    } else {
      const stored = localStorage.getItem(`enable_global_chat_${currentUsername}`);
      setEnableGlobalChat(stored === 'false' ? false : true);
    }

    // Determine partner username if already paired
    const tenantPartner = coupleTenant.partner1?.toLowerCase() === currentUsername.toLowerCase()
      ? coupleTenant.partner2
      : coupleTenant.partner1;

    if (tenantPartner && tenantPartner.trim()) {
      setPartnerUsername(tenantPartner.trim());
    } else {
      // Look for another user with same coupleId
      const targetCoupleId = userAccount?.coupleId || coupleTenant.coupleId;
      const partnerAcc = userAccounts.find(
        u => u.id !== userAccount?.id &&
             u.username.toLowerCase() !== currentUsername.toLowerCase() &&
             u.coupleId && u.coupleId === targetCoupleId &&
             u.coupleId !== 'couple_default'
      );
      setPartnerUsername(partnerAcc?.username || '');
    }
  }, [isOpen, userAccount, coupleTenant, currentUsername, userAccounts]);

  if (!isOpen) return null;

  // Handle Copy Couple ID
  const handleCopyCoupleId = () => {
    if (!coupleId) return;
    navigator.clipboard.writeText(coupleId);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  // Helper for partner details
  const pairedPartnerAcc = partnerUsername
    ? userAccounts.find(u => u.username.toLowerCase() === partnerUsername.toLowerCase())
    : null;

  // Handle Save Profile Settings
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSuccessMsg(null);
    setErrorMsg(null);

    try {
      const finalPassword = userAccount?.password || '';

      // Password changes are verified and stored by the server; the browser never sees or compares hashes.
      if (oldPassword || newPassword || confirmPassword) {
        if (!newPassword.trim()) {
          throw new Error("Please enter a new password.");
        }
        if (newPassword !== confirmPassword) {
          throw new Error("The new password and confirmation password do not match.");
        }
        if (newPassword.trim().length < 8) {
          throw new Error("New password must be at least 8 characters long.");
        }
        const pwRes = await fetch('/api/auth/change-password', {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({ oldPassword: oldPassword.trim(), newPassword: newPassword.trim() }),
        });
        const pwJson = await pwRes.json().catch(() => ({}));
        if (!pwRes.ok || !pwJson.success) {
          throw new Error(pwJson.error || 'Could not change the password.');
        }
      }

      const cleanTg = telegramUsername.trim()
        ? (telegramUsername.trim().startsWith('@') ? telegramUsername.trim() : `@${telegramUsername.trim()}`).toLowerCase()
        : '';

      // 1. Update current user account
      const updatedUser: UserAccount = {
        ...(userAccount || {}),
        id: userAccount?.id || `user_${Date.now()}`,
        username: currentUsername,
        password: finalPassword,
        gender: gender,
        coupleId: coupleId,
        role: userAccount?.role || 'user',
        visibleTabs: userAccount?.visibleTabs,
        enableGlobalChat: enableGlobalChat,
        telegramUsername: cleanTg
      };

      try {
        localStorage.setItem(`enable_global_chat_${currentUsername}`, enableGlobalChat ? 'true' : 'false');
      } catch (e) {
        console.warn("Could not save enableGlobalChat to localStorage", e);
      }

      await saveUserAccountDoc(updatedUser);
      void refreshFirebaseSession();

      // Auto-sync into Telegram whitelist via the useTelegramWhitelistSync hook
      if (cleanTg) {
        try {
          await syncUserToWhitelist(cleanTg);
        } catch (tgErr) {
          console.warn("Could not auto-sync profile telegram username to whitelist:", tgErr);
        }
      }

      let inviteSentText = '';

      // 2. Handle partner invitation if user is single and entered a partner username/ID
      if (!partnerUsername && invitePartnerInput.trim()) {
        const targetInviteUser = invitePartnerInput.trim();
        const foundPartnerAcc = userAccounts.find(
          u => u.username.toLowerCase() === targetInviteUser.toLowerCase() || u.id === targetInviteUser
        );

        // Send a notification activity log & chat message
        await logActivity(
          currentUsername,
          'partner_invite_sent',
          `User "${currentUsername}" sent a partner space invitation to "${targetInviteUser}".`
        );

        await saveChatMessageDoc({
          id: `msg_invite_${Date.now()}`,
          coupleId: coupleId,
          sender: currentUsername,
          content: `💖 Sent a partner space invitation to @${targetInviteUser}! Join space ID: ${coupleId}`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });

        if (foundPartnerAcc) {
          // Link partner directly to shared couple space if account exists
          const updatedPartner: UserAccount = {
            ...foundPartnerAcc,
            coupleId: coupleId
          };
          await saveUserAccountDoc(updatedPartner);

          // Update tenant
          const tenantPartner1 = currentUsername;
          const tenantPartner2 = foundPartnerAcc.username;
          const updatedTenant: CoupleTenant = {
            coupleId: coupleId,
            coupleName: `${tenantPartner1} & ${tenantPartner2}'s Space`,
            partner1: tenantPartner1,
            partner2: tenantPartner2,
            plan: coupleTenant.plan || 'pro',
            smsEnabled: coupleTenant.smsEnabled || false
          };
          await saveCoupleTenantDoc(updatedTenant);
          setPartnerUsername(foundPartnerAcc.username);
          inviteSentText = ` Invitation sent and linked with ${foundPartnerAcc.username}!`;
        } else {
          inviteSentText = ` Invitation notification logged for @${targetInviteUser}!`;
        }
      }

      await logActivity(
        currentUsername,
        'profile_updated',
        `User profile updated for "${currentUsername}". Gender: ${gender}.${newPassword ? ' Password updated.' : ''}`
      );

      setSuccessMsg(`Your profile settings have been updated successfully!${inviteSentText}`);
      if (onUserUpdated) onUserUpdated();

      // Reset password fields
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');

      setTimeout(() => {
        setSuccessMsg(null);
        onClose();
      }, 1800);

    } catch (err: any) {
      console.error("Failed to save profile:", err);
      setErrorMsg(err.message || "Failed to update profile settings. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const getGenderEmoji = (g?: string) => {
    switch (g?.toLowerCase()) {
      case 'male': return '👨';
      case 'female': return '👩';
      case 'other': return '🧑';
      default: return '👤';
    }
  };

  return (
    // FIX: a plain fragment replaces the outer <AnimatePresence>, which had two
    // key-less children (the backdrop div + the inner AnimatePresence) and
    // caused the "two children with the same key" warning.
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          className="relative w-full max-w-lg bg-neutral-900 border border-white/10 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        >
          {/* Header */}
          <div className="relative p-5 sm:p-6 bg-gradient-to-r from-rose-950/60 via-purple-950/40 to-neutral-900 border-b border-white/10 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-rose-500 via-pink-500 to-amber-500 p-0.5 shadow-lg shadow-rose-950/50 flex items-center justify-center">
                <div className="w-full h-full bg-neutral-950 rounded-[14px] flex items-center justify-center text-xl">
                  {getGenderEmoji(gender)}
                </div>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-white tracking-tight capitalize">
                    {currentUsername}
                  </h2>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 font-semibold uppercase tracking-wider">
                    {userAccount?.role === 'admin' ? 'Admin' : 'Member'}
                  </span>
                </div>
                <p className="text-xs text-neutral-400">
                  Profile Details & Account Security
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-2 text-neutral-400 hover:text-white rounded-xl hover:bg-white/10 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body Form */}
          <form onSubmit={handleSaveProfile} className="p-5 sm:p-6 space-y-5 overflow-y-auto flex-1">

            {/* Success / Error Banners */}
            {successMsg && (
              <motion.div
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-3.5 rounded-2xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-200 text-xs flex items-center gap-2.5"
              >
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{successMsg}</span>
              </motion.div>
            )}

            {errorMsg && (
              <motion.div
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-3.5 rounded-2xl bg-rose-950/60 border border-rose-500/40 text-rose-200 text-xs flex items-center gap-2.5"
              >
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{errorMsg}</span>
              </motion.div>
            )}

            {/* Field 1: Username (View Only) */}
            <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-neutral-300 flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-rose-400" />
                  Username
                </label>
                <span className="text-[10px] text-neutral-500 font-mono">User ID</span>
              </div>
              <input
                type="text"
                value={currentUsername}
                disabled
                className="w-full bg-neutral-950/70 border border-white/10 rounded-xl px-3.5 py-2 text-xs font-medium text-neutral-300 cursor-not-allowed opacity-90 capitalize"
              />
            </div>

            {/* Field 2: Password Update Block (Old, New, Confirm) */}
            <div className="p-4 rounded-2xl bg-neutral-950/70 border border-white/10 space-y-3">
              <div className="flex items-center justify-between border-b border-white/10 pb-2">
                <label className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                  <KeyRound className="w-4 h-4 text-amber-400" />
                  Change Password
                </label>
                <span className="text-[10px] text-neutral-400 font-mono">Optional</span>
              </div>

              {/* Old Password */}
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-neutral-400">Old Password</label>
                <div className="relative">
                  <input
                    type={showOldPassword ? 'text' : 'password'}
                    value={oldPassword}
                    onChange={(e) => setOldPassword(e.target.value)}
                    placeholder="Enter current password"
                    className="w-full bg-neutral-900 border border-white/10 rounded-xl pl-3 pr-9 py-2 text-xs text-white focus:outline-none focus:border-amber-500 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowOldPassword(!showOldPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white transition-colors"
                  >
                    {showOldPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              {/* New Password */}
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-neutral-400">New Password</label>
                <div className="relative">
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter new password"
                    className="w-full bg-neutral-900 border border-white/10 rounded-xl pl-3 pr-9 py-2 text-xs text-white focus:outline-none focus:border-amber-500 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white transition-colors"
                  >
                    {showNewPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              {/* Confirm Password */}
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-neutral-400">Confirm New Password</label>
                <div className="relative">
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter new password"
                    className="w-full bg-neutral-900 border border-white/10 rounded-xl pl-3 pr-9 py-2 text-xs text-white focus:outline-none focus:border-amber-500 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white transition-colors"
                  >
                    {showConfirmPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            </div>

            {/* Field 2.5: Two-Factor Authentication (2FA TOTP) */}
            <div className="p-4 rounded-2xl bg-neutral-950/70 border border-white/10 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-indigo-500/15 border border-indigo-500/25 rounded-lg text-indigo-400">
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-white block">Google Authenticator (2FA)</span>
                    <span className="text-[10px] text-neutral-400 font-mono">RFC 6238 TOTP Protection</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {userAccount?.twoFactorEnabled ? (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                      <ShieldCheck className="w-2.5 h-2.5 text-emerald-400" />
                      <span>Active</span>
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-neutral-800 text-neutral-400 border border-neutral-700 flex items-center gap-1">
                      <span>Disabled</span>
                    </span>
                  )}
                </div>
              </div>

              <p className="text-[11px] text-neutral-400 leading-relaxed font-sans">
                Require a 6-digit verification code from Google Authenticator, Authy, or 1Password whenever you sign in.
              </p>

              <button
                type="button"
                onClick={() => setIs2FAModalOpen(true)}
                className={`w-full py-2.5 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  userAccount?.twoFactorEnabled
                    ? 'bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-200'
                    : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-950/40'
                }`}
              >
                <KeyRound className="w-3.5 h-3.5" />
                <span>{userAccount?.twoFactorEnabled ? 'Manage 2FA & View Backup Codes' : 'Setup Google Authenticator 2FA'}</span>
              </button>
            </div>

            {/* Field 3: Gender */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-neutral-300 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-purple-400" />
                Gender
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'male', label: 'Male', emoji: '👨' },
                  { id: 'female', label: 'Female', emoji: '👩' },
                  { id: 'other', label: 'Other', emoji: '🧑' }
                ].map((g) => {
                  const isSelected = gender.toLowerCase() === g.id;
                  return (
                    <button
                      key={`gender-opt-${g.id}`}
                      type="button"
                      onClick={() => setGender(g.id)}
                      className={`py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer border ${
                        isSelected
                          ? 'bg-gradient-to-r from-rose-600 to-purple-600 text-white border-rose-400/40 shadow-md shadow-rose-950/50 scale-[1.02]'
                          : 'bg-neutral-950/60 text-neutral-400 border-white/10 hover:text-white hover:bg-white/5'
                      }`}
                    >
                      <span className="text-sm">{g.emoji}</span>
                      <span>{g.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Field 3.5: Global Community Chat Toggle */}
            <div className="p-4 rounded-2xl bg-neutral-950/70 border border-white/10 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-400">
                    <Globe className="w-4 h-4" />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-white flex items-center gap-1.5">
                      Global Community Chat
                    </label>
                    <p className="text-[10px] text-neutral-400 leading-tight mt-0.5">
                      Toggle public chat lounge with all community members
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={async () => {
                    const nextVal = !enableGlobalChat;
                    setEnableGlobalChat(nextVal);
                    try {
                      localStorage.setItem(`enable_global_chat_${currentUsername}`, nextVal ? 'true' : 'false');
                    } catch (e) {
                      console.warn("Could not save enableGlobalChat to localStorage", e);
                    }
                    const targetAcc = userAccount || userAccounts.find(u => u.username?.toLowerCase().trim() === currentUsername.toLowerCase().trim());
                    if (targetAcc) {
                      await saveUserAccountDoc({
                        ...targetAcc,
                        enableGlobalChat: nextVal
                      });
                    } else {
                      await saveUserAccountDoc({
                        id: `user_${Date.now()}`,
                        username: currentUsername,
                        coupleId: coupleTenant?.coupleId || `couple_${currentUsername}`,
                        enableGlobalChat: nextVal
                      });
                    }
                    if (onUserUpdated) onUserUpdated();
                  }}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    enableGlobalChat ? 'bg-gradient-to-r from-rose-500 to-purple-500' : 'bg-neutral-800'
                  }`}
                  role="switch"
                  aria-checked={enableGlobalChat}
                  title={enableGlobalChat ? "Click to disable Global Community Chat" : "Click to enable Global Community Chat"}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                      enableGlobalChat ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              <div className="text-[10px] text-neutral-400 font-mono flex items-center gap-1.5 pt-2 border-t border-white/5">
                <span className={`w-2 h-2 rounded-full ${enableGlobalChat ? 'bg-emerald-400 shadow-[0_0_6px_#34d399]' : 'bg-neutral-600'}`} />
                <span>Status: {enableGlobalChat ? 'Global Lounge Enabled' : 'Global Lounge Hidden (Private Mode)'}</span>
              </div>
            </div>

            {/* Field 3.6: Telegram Bot Username */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-neutral-300 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Send className="w-3.5 h-3.5 text-sky-400" />
                  <span>Telegram Bot Username (@username)</span>
                </span>
                {telegramUsername.trim() && (
                  <div>
                    {isTelegramConfirmed ? (
                      <span className="text-[10px] font-mono text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400" />
                        Active & Verified 🟢
                      </span>
                    ) : isTelegramWhitelisted ? (
                      <span className="text-[10px] font-mono text-amber-300 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded-full flex items-center gap-1">
                        Whitelisted 🟡
                      </span>
                    ) : (
                      <span className="text-[10px] font-mono text-neutral-400 bg-neutral-800 border border-neutral-700 px-2 py-0.5 rounded-full">
                        Not Synced
                      </span>
                    )}
                  </div>
                )}
              </label>

              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <input
                    type="text"
                    placeholder="@your_telegram_username"
                    value={telegramUsername}
                    onChange={(e) => setTelegramUsername(e.target.value)}
                    className="w-full bg-neutral-950/80 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-neutral-500 font-mono focus:outline-none focus:border-sky-500/60 transition-all"
                  />
                </div>
                {telegramUsername.trim() && (
                  <button
                    type="button"
                    onClick={handleManualSyncTelegram}
                    disabled={isTelegramSyncing}
                    className="px-3 py-2.5 bg-sky-950/60 hover:bg-sky-900/60 text-sky-300 border border-sky-500/30 rounded-xl text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer shrink-0 disabled:opacity-50 active:scale-95"
                    title="Sync username to Admin Whitelist now"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isTelegramSyncing ? 'animate-spin text-sky-400' : ''}`} />
                    <span>{isTelegramSyncing ? 'Syncing...' : 'Sync Whitelist'}</span>
                  </button>
                )}
              </div>

              {telegramFeedback && (
                <div className="text-[10px] text-sky-300 bg-sky-500/10 border border-sky-500/20 px-2.5 py-1.5 rounded-lg font-sans">
                  {telegramFeedback}
                </div>
              )}

              {isTelegramConfirmed ? (
                <p className="text-[10px] text-emerald-400/90 leading-relaxed font-sans flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 shrink-0 text-emerald-400" />
                  Linked to Chat ID <span className="font-mono font-semibold text-white">{telegramChatId}</span>. Alerts for your couple space & personal security will be sent directly to your Telegram chat.
                </p>
              ) : isTelegramWhitelisted ? (
                <p className="text-[10px] text-amber-300/90 leading-relaxed font-sans">
                  Enrolled on the Global Telegram Whitelist! Open your Telegram bot and send <span className="font-mono font-semibold text-amber-200">/confirm</span> or <span className="font-mono font-semibold text-amber-200">/start</span> to verify your chat ID.
                </p>
              ) : (
                <p className="text-[10px] text-neutral-400 leading-relaxed font-sans">
                  Receive instant notifications on anniversaries, dates, love letters, and security alerts on Telegram. Saving or clicking "Sync Whitelist" automatically adds you to the global Admin Panel Whitelist!
                </p>
              )}
            </div>

            {/* Field 4: View-Only Couple Space ID */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-neutral-300 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  Your Couple Space ID
                </label>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={coupleId}
                  disabled
                  readOnly
                  className="w-full bg-neutral-950/90 border border-emerald-500/30 rounded-xl px-3.5 py-2.5 text-xs text-emerald-200 font-mono cursor-not-allowed opacity-90 select-all"
                />
                <button
                  type="button"
                  onClick={handleCopyCoupleId}
                  className="px-3 py-2.5 bg-emerald-950/60 hover:bg-emerald-900/60 text-emerald-300 rounded-xl text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer border border-emerald-500/40 shrink-0 active:scale-95"
                  title="Copy Couple ID to clipboard"
                >
                  {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{isCopied ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            </div>

            {/* Field 5: Partner Details (View Only if paired, Invite input if single) */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-neutral-300 flex items-center gap-1.5">
                <Heart className="w-3.5 h-3.5 text-rose-500 fill-rose-500/20" />
                Your Partner
              </label>

              {partnerUsername ? (
                /* VIEW ONLY PARTNER CARD */
                <div className="p-3.5 rounded-2xl bg-gradient-to-r from-rose-950/40 via-purple-950/30 to-neutral-950 border border-rose-500/30 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-rose-500/20 border border-rose-500/30 flex items-center justify-center text-lg text-rose-300">
                      {pairedPartnerAcc?.gender === 'female' ? '👩' : pairedPartnerAcc?.gender === 'male' ? '👨' : '🧑'}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-white capitalize">{partnerUsername}</span>
                        <span className="text-[10px] font-mono text-rose-300 bg-rose-500/20 px-2 py-0.5 rounded-full border border-rose-500/30 flex items-center gap-1">
                          <UserCheck className="w-3 h-3" /> Paired
                        </span>
                      </div>
                      <p className="text-[11px] text-neutral-400">
                        Sharing couple space: <span className="font-mono text-neutral-300">{coupleId}</span>
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                /* SINGLE USER: INPUT TO SEND NOTIFICATION / INVITATION */
                <div className="p-3.5 rounded-2xl bg-neutral-950/80 border border-purple-500/30 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-rose-300 font-semibold flex items-center gap-1">
                      <UserPlus className="w-3.5 h-3.5" /> Single (No Partner Connected)
                    </span>
                    <span className="text-[10px] text-neutral-400 font-mono">Send Invitation</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={invitePartnerInput}
                      onChange={(e) => setInvitePartnerInput(e.target.value)}
                      placeholder="Enter partner's username or user ID"
                      className="w-full bg-neutral-900 border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-rose-500 transition-colors"
                    />
                  </div>
                  <p className="text-[10px] text-neutral-400 leading-normal">
                    Enter your partner's username or account ID above to log and send an invitation notification to join your space.
                  </p>
                </div>
              )}
            </div>

            {/* Submit Button */}
            <div className="pt-3 flex items-center justify-end gap-3 border-t border-white/10">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl text-xs font-semibold text-neutral-400 hover:text-white bg-white/5 hover:bg-white/10 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-rose-600 via-pink-600 to-rose-500 hover:from-rose-500 hover:to-pink-500 shadow-lg shadow-rose-950/50 hover:scale-[1.02] active:scale-95 transition-all cursor-pointer flex items-center gap-2 disabled:opacity-50"
              >
                {isSaving ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Save Profile Settings</span>
                  </>
                )}
              </button>
            </div>

          </form>
        </motion.div>
      </div>

      {/* Two-Factor Authentication Setup Modal */}
      <AnimatePresence>
        {is2FAModalOpen && (
          <TwoFactorSetupModal
            key="2fa-setup-modal"
            isOpen={is2FAModalOpen}
            onClose={() => setIs2FAModalOpen(false)}
            username={currentUsername}
            isAlreadyEnabled={!!userAccount?.twoFactorEnabled}
            currentSecret={userAccount?.twoFactorSecret || ''}
            currentBackupCodes={userAccount?.twoFactorBackupCodes || []}
            onSave2FA={handleSaveUser2FA}
            onDisable2FA={handleDisableUser2FA}
          />
        )}
      </AnimatePresence>
    </>
  );
};

export default UserProfileModal;