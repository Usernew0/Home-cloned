import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { CoupleTenantRow } from "./CoupleTenantRow";
import { linkCouple, unlinkCouple, adminCreateAccount } from "../lib/membershipClient";
import { findTenantForUser, partnerNameFor, isSpaceUnlinked, unlinkTargets } from "../lib/coupleLink";
import schemaSql from '../../supabase_schema.sql?raw';
import { motion, AnimatePresence } from "motion/react";
import {
  Users,
  KeyRound,
  UserPlus,
  Lock,
  LogOut,
  CheckCircle,
  AlertCircle,
  Trash2,
  Edit3,
  ShieldAlert,
  ShieldCheck,
  Database,
  RefreshCw,
  Home,
  LogIn,
  Eye,
  EyeOff,
  MessageSquareHeart,
  Gift,
  Calendar,
  Mail,
  HelpCircle,
  Images,
  Clock,
  Search,
  Sparkles,
  Heart,
  ImageIcon,
  Upload,
  Download,
  FileText,
  Check,
  X,
  Sliders,
  User,
  HeartHandshake,
  Link,
  Unlink,
  Activity,
  Play,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Bug,
  Terminal,
  Copy,
  FileCheck,
  ChevronDown,
  ChevronUp,
  Crown,
  Plus,
  Shield,
  DollarSign,
  Layers,
  Ticket,
  Tag,
  Percent,
  Compass,
  Navigation,
  ChevronRight,
  Wrench,
  Code,
  Cake,
  Timer,
  SlidersHorizontal,
  Send,
  Music,
  Headphones,
  Volume2,
  VolumeX,
  Pause,
  ExternalLink,
} from "lucide-react";

import imageCompression from "browser-image-compression";
import { UserAccount, AdminSetting, AdminAccount, UserActivityLog, CoupleTenant, SubscriptionPlan, TabLimitation, APP_TABS, PromoCode, DEFAULT_PROMO_CODES, Milestone, MilestoneCategory, CountdownConfig, DEFAULT_COUNTDOWN_CONFIG, MilestoneQuotas, DEFAULT_MILESTONE_QUOTAS, TelegramConfig, DEFAULT_TELEGRAM_CONFIG, MusicTrack, TelegramAuthorizedUser, TelegramCapturedSender } from "../types";
import { runAutomatedWebsiteTests, FullTestReport, TestCaseResult } from "../utils/autoTester";
import { calculateSubscriptionEndDate, getSubscriptionStatus, formatMilestoneDateInEgypt, parseEventDateInEgypt, storage, DEFAULT_MUSIC_TRACKS } from "../utils";
import {
  getTelegramConfig,
  saveTelegramConfig as persistTelegramConfig,
  testTelegramConnection,
  setTelegramWebhook,
  getTelegramWebhookInfo,
  deleteTelegramWebhook,
  extractTelegramUsernamesFromProfiles,
  mergeProfileUsernamesIntoWhitelist,
  sendDirectTelegramMessage,
  addAuthorizedTelegramUser,
  removeAuthorizedTelegramUser,
  toggleAuthorizedTelegramUserStatus,
  fetchTelegramChatIdsFromUpdates,
  fetchTelegramChatIdsDetailed,
  fetchCapturedTelegramSenders,
  clearCapturedTelegramSenders,
  autoResolveTelegramUsers,
  testTelegramMultiBroadcast,
  runTelegramBotDiagnostics,
  TelegramDiagnosticReport,
} from "../lib/telegramService";

import { saveFirestoreMusicTrackDoc, deleteFirestoreMusicTrackDoc } from "../lib/firebaseService";
import { bulkCopyAllowed } from "../lib/firebaseScope";
import { HorizontalScrollWrapper } from "./HorizontalScrollWrapper";
import { MilestonesCountdownManager } from "./MilestonesCountdownManager";
import { SecurityLogsDashboard } from "./SecurityLogsDashboard";
import { BackupDataSection } from "./BackupDataSection";
import { TwoFactorSetupModal } from "./TwoFactorSetupModal";
import { changeTwoFactor } from "../lib/twoFactorApi";
import {
  saveUserAccountDoc,
  deleteUserAccountDoc,
  saveAdminSettingDoc,
  subscribeToActivityLogs,
  logActivity,
  useDatabaseStatus,
  useSupabaseTableDiagnostics,
  TableDiagnosticStatus,
  migrateAndDeduplicateFirestoreToSupabase,
  MigrationResult,
  syncAllDataToSupabase,
  SupabaseSyncSummary,
  subscribeToCoupleTenants,
  saveCoupleTenantDoc,
  deleteCoupleTenantDoc,
  updateDataCoupleId,
  SYNC_TABLES_LIST,
  SyncTableKey,
  syncSingleTableFirestoreToSupabase,
  syncSingleTableSupabaseToFirestore,
  syncAllTablesFirestoreToSupabase,
  syncAllTablesSupabaseToFirestore,
  TableSyncResult,
  saveMilestoneDoc,
  deleteMilestoneDoc,
  subscribeToMilestones,
} from "../lib/syncService";
import { isSupabaseConfigured } from "../lib/supabase";
import { isFirestoreOnline } from "../lib/firebase";
import { hashPassword } from "../utils/crypto";
import { authHeaders } from '../lib/authHeaders';

// Single source of truth: the repo's supabase_schema.sql (tenant + participant-scoped policies). The helper used to embed its own copy with allow-all policies.
export const SUPABASE_SCHEMA_FIX_SQL: string = schemaSql;

const getLogIcon = (action: string) => {
  const normalized = action.toLowerCase();
  if (normalized.includes("login")) return <LogIn className="w-3.5 h-3.5 text-emerald-400" />;
  if (normalized.includes("logout")) return <LogOut className="w-3.5 h-3.5 text-neutral-400" />;
  if (normalized.includes("created")) return <Sparkles className="w-3.5 h-3.5 text-rose-400" />;
  if (normalized.includes("updated")) return <Edit3 className="w-3.5 h-3.5 text-sky-400" />;
  if (normalized.includes("deleted")) return <Trash2 className="w-3.5 h-3.5 text-rose-500" />;
  if (normalized.includes("reacted")) return <Heart className="w-3.5 h-3.5 text-pink-400 fill-pink-400 animate-pulse" />;
  if (normalized.includes("sent") || normalized.includes("letter")) return <Mail className="w-3.5 h-3.5 text-indigo-400" />;
  if (normalized.includes("chat")) return <MessageSquareHeart className="w-3.5 h-3.5 text-rose-400" />;
  return <Database className="w-3.5 h-3.5 text-blue-400" />;
};

interface AdminPanelProps {
  userAccounts: UserAccount[];
  /** True once the account list came from the server, not only the local cache. */
  accountsLoaded?: boolean;
  adminSettings: AdminSetting[];
  onLogout: () => void;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({ userAccounts, accountsLoaded = false, adminSettings, onLogout }) => {
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newUserGender, setNewUserGender] = useState<string>("male");
  const [editingUser, setEditingUser] = useState<UserAccount | null>(null);
  const [editingPassword, setEditingPassword] = useState("");
  const [editingUserGender, setEditingUserGender] = useState<string>("male");
  const [userToDelete, setUserToDelete] = useState<UserAccount | null>(null);

  // Countdown Configuration state
  const [countdownConfig, setCountdownConfig] = useState<CountdownConfig>(() => {
    const doc = adminSettings.find((s) => s.id === "countdownConfig");
    return doc?.countdownConfig || DEFAULT_COUNTDOWN_CONFIG;
  });

  useEffect(() => {
    const doc = adminSettings.find((s) => s.id === "countdownConfig");
    if (doc?.countdownConfig) {
      setCountdownConfig(doc.countdownConfig);
    }
  }, [adminSettings]);

  // Milestone Quotas / Limits state (Platform-level count capacities; personal milestones are strictly private per user)
  const [milestoneQuotas, setMilestoneQuotas] = useState<MilestoneQuotas>(() => {
    const doc = adminSettings.find((s) => s.id === "milestoneQuotas");
    return doc?.milestoneQuotas || DEFAULT_MILESTONE_QUOTAS;
  });

  useEffect(() => {
    const doc = adminSettings.find((s) => s.id === "milestoneQuotas");
    if (doc?.milestoneQuotas) {
      setMilestoneQuotas(doc.milestoneQuotas);
    }
  }, [adminSettings]);

  // Couple Tenants & Partner Relationships State
  const [coupleTenants, setCoupleTenants] = useState<CoupleTenant[]>([]);
  const [isPairingCouple, setIsPairingCouple] = useState(false);
  const [pairPartner1, setPairPartner1] = useState("");
  const [pairPartner2, setPairPartner2] = useState("");
  const [pairCoupleName, setPairCoupleName] = useState("");
  const [pairPlan, setPairPlan] = useState<string>("free");
  const [newUserPartner, setNewUserPartner] = useState("");
  const [newUserPlan, setNewUserPlan] = useState<string>("free");
  const [editingUserCoupleId, setEditingUserCoupleId] = useState("");
  const [editingUserPlan, setEditingUserPlan] = useState<string>("free");

  // Telegram Bot & Alert Notifications State
  const [telegramConfig, setTelegramConfig] = useState<TelegramConfig>(() => {
    const doc = adminSettings.find((s) => s.id === "telegramConfig");
    return doc?.telegramConfig ? { ...doc.telegramConfig, botToken: "" } : getTelegramConfig(adminSettings);
  });
  const [showBotToken, setShowBotToken] = useState(false);
  const [isTestingTelegram, setIsTestingTelegram] = useState(false);
  const [telegramTestStatus, setTelegramTestStatus] = useState<{ success: boolean; message: string } | null>(null);
  const [isSavingTelegram, setIsSavingTelegram] = useState(false);
  const [telegramSaveStatus, setTelegramSaveStatus] = useState<string | null>(null);

  useEffect(() => {
    const doc = adminSettings.find((s) => s.id === "telegramConfig");
    if (doc?.telegramConfig) {
      setTelegramConfig({ ...doc.telegramConfig, botToken: "" });
    }
  }, [adminSettings]);

  const [isResolvingChatIds, setIsResolvingChatIds] = useState(false);
  const [autoResolveStatus, setAutoResolveStatus] = useState<string | null>(null);
  const [detectedSenders, setDetectedSenders] = useState<TelegramCapturedSender[]>(() => {
    return telegramConfig.capturedSenders || [];
  });
  const [isRefreshingSenders, setIsRefreshingSenders] = useState(false);
  const [selectedLinkTargets, setSelectedLinkTargets] = useState<{ [chatId: string]: string }>({});
  const [linkingSenderChatId, setLinkingSenderChatId] = useState<string | null>(null);
  const [copiedChatId, setCopiedChatId] = useState<string | null>(null);

  // Load any cached or server senders on mount
  useEffect(() => {
    fetchCapturedTelegramSenders().then((senders) => {
      if (Array.isArray(senders) && senders.length > 0) {
        setDetectedSenders(senders);
      }
    });
  }, []);

  const handleAutoResolveChatIds = async () => {
    if (!telegramConfig.botToken.trim()) {
      setAutoResolveStatus("⚠️ Please enter your Bot Token first.");
      setTimeout(() => setAutoResolveStatus(null), 4000);
      return;
    }

    setIsResolvingChatIds(true);
    setAutoResolveStatus(null);
    try {
      const res = await autoResolveTelegramUsers(telegramConfig, userAccounts);
      setTelegramConfig(res.updatedConfig);
      if (res.allSenders) {
        setDetectedSenders(res.allSenders);
      }
      await persistTelegramConfig(res.updatedConfig, async (setting) => {
        await saveAdminSettingDoc(setting);
      });

      if (res.newlyResolvedCount > 0) {
        const usernamesList = res.resolvedUsers.map((u) => `${u.username} (ID: ${u.chatId})`).join(", ");
        setAutoResolveStatus(`🎉 Success! Auto-detected & verified Chat IDs for ${res.newlyResolvedCount} user(s): ${usernamesList}!`);
      } else {
        const totalKnown = (res.updatedConfig.authorizedUsers || []).filter((u) => u.chatId && u.confirmed).length;
        const sendersFound = res.allSenders?.length || 0;
        if (sendersFound > 0) {
          const senderPreview = res.allSenders
            .slice(0, 3)
            .map((s) => `${s.username || s.firstName || "User"} (ID: ${s.chatId})`)
            .join(", ");
          setAutoResolveStatus(`ℹ️ Found ${sendersFound} recent message(s) from Telegram (${senderPreview}). You can link any of them instantly using the "⚡ Link & Verify" button in the Detected Senders card below!`);
        } else {
          setAutoResolveStatus(`ℹ️ Found ${totalKnown} active user(s) with Chat IDs. To add someone new, ask them to open your bot in Telegram and send "start" or "confirm", then click this button again!`);
        }
      }
    } catch (e: any) {
      setAutoResolveStatus(`❌ Failed to resolve updates: ${e.message || String(e)}`);
    } finally {
      setIsResolvingChatIds(false);
      setTimeout(() => setAutoResolveStatus(null), 8000);
    }
  };

  const handleRefreshDetectedSenders = async () => {
    if (!telegramConfig.botToken.trim()) {
      setAutoResolveStatus("⚠️ Please enter your Bot Token first.");
      setTimeout(() => setAutoResolveStatus(null), 3000);
      return;
    }
    setIsRefreshingSenders(true);
    try {
      const detailed = await fetchTelegramChatIdsDetailed(telegramConfig.botToken);
      if (detailed.senders) {
        setDetectedSenders(detailed.senders);
        setTelegramConfig((prev) => ({
          ...prev,
          capturedSenders: detailed.senders,
        }));
      }
      if (detailed.webhookReleased) {
        setAutoResolveStatus("🔓 Note: Bot webhook was active; automatically unlocked pending updates from Telegram!");
      } else {
        setAutoResolveStatus(`⚡ Retrieved ${detailed.senders?.length || 0} recent message(s) from Telegram Bot!`);
      }
    } catch (err: any) {
      setAutoResolveStatus(`Failed to fetch updates: ${err.message || String(err)}`);
    } finally {
      setIsRefreshingSenders(false);
      setTimeout(() => setAutoResolveStatus(null), 6000);
    }
  };

  const handleClearDetectedSenders = async () => {
    if (!window.confirm("Clear recent Telegram messages history?")) return;
    await clearCapturedTelegramSenders();
    setDetectedSenders([]);
    setTelegramConfig((prev) => ({ ...prev, capturedSenders: [] }));
    setAutoResolveStatus("Cleared recent message history.");
    setTimeout(() => setAutoResolveStatus(null), 3000);
  };

  const handleReleaseWebhookAndPull = async () => {
    if (!telegramConfig.botToken.trim()) {
      setAutoResolveStatus("⚠️ Please enter your Bot Token first.");
      setTimeout(() => setAutoResolveStatus(null), 3000);
      return;
    }
    setIsRefreshingSenders(true);
    setAutoResolveStatus("🔓 Releasing Telegram webhook lock and pulling unread messages...");
    try {
      await deleteTelegramWebhook(telegramConfig.botToken);
      await new Promise((r) => setTimeout(r, 400));
      const detailed = await fetchTelegramChatIdsDetailed(telegramConfig.botToken);
      if (detailed.senders) {
        setDetectedSenders(detailed.senders);
        setTelegramConfig((prev) => ({
          ...prev,
          webhookEnabled: false,
          capturedSenders: detailed.senders,
        }));
      }
      setAutoResolveStatus(`🎉 Webhook released! Successfully retrieved ${detailed.senders?.length || 0} messages from Telegram!`);
    } catch (err: any) {
      setAutoResolveStatus(`Error: ${err.message || String(err)}`);
    } finally {
      setIsRefreshingSenders(false);
      setTimeout(() => setAutoResolveStatus(null), 6000);
    }
  };

  const handleQuickLinkSender = async (sender: TelegramCapturedSender) => {
    const target = selectedLinkTargets[sender.chatId] || sender.username || sender.firstName;
    if (!target) {
      setAutoResolveStatus("Please select or specify a target username to link.");
      setTimeout(() => setAutoResolveStatus(null), 3000);
      return;
    }
    setLinkingSenderChatId(sender.chatId);
    try {
      const cleanUser = target.startsWith("@") ? target.toLowerCase().trim() : `@${target.toLowerCase().trim()}`;

      const updated = addAuthorizedTelegramUser(telegramConfig, {
        telegramUsername: cleanUser,
        chatId: sender.chatId,
        appUsername: sender.firstName || cleanUser.replace(/^@/, ""),
        role: "partner",
        confirmed: true,
      });

      setTelegramConfig(updated);
      await persistTelegramConfig(updated, async (setting) => {
        await saveAdminSettingDoc(setting);
      });

      setAutoResolveStatus(`🎉 Linked & Verified ${cleanUser} to Chat ID ${sender.chatId} successfully!`);
    } catch (err: any) {
      setAutoResolveStatus(`Failed to link user: ${err.message || String(err)}`);
    } finally {
      setLinkingSenderChatId(null);
      setTimeout(() => setAutoResolveStatus(null), 6000);
    }
  };

  const handleCopyChatId = (chatId: string) => {
    try {
      navigator.clipboard.writeText(chatId);
      setCopiedChatId(chatId);
      setTimeout(() => setCopiedChatId(null), 2500);
    } catch (e) {
      // ignore
    }
  };

  const handleTestTelegramConnection = async () => {
    if (!telegramConfig.botToken.trim()) {
      setTelegramTestStatus({
        success: false,
        message: "Please enter your Telegram Bot Token.",
      });
      return;
    }

    setIsTestingTelegram(true);
    setTelegramTestStatus(null);
    try {
      // 1. Try to auto-resolve any missing Chat IDs from Telegram first
      let currentCfg = telegramConfig;
      try {
        const resolveRes = await autoResolveTelegramUsers(telegramConfig, userAccounts);
        if (resolveRes.newlyResolvedCount > 0) {
          currentCfg = resolveRes.updatedConfig;
          setTelegramConfig(currentCfg);
          await persistTelegramConfig(currentCfg, async (setting) => {
            await saveAdminSettingDoc(setting);
          });
        }
      } catch (rErr) {
        console.warn("Auto-resolve during test skipped:", rErr);
      }

      // 2. Dispatch multi-broadcast test alert to all recipients
      const result = await testTelegramMultiBroadcast(currentCfg);
      setTelegramTestStatus({
        success: result.success,
        message: result.message,
      });
    } catch (err: any) {
      setTelegramTestStatus({
        success: false,
        message: err.message || "Failed to ping Telegram Bot API",
      });
    } finally {
      setIsTestingTelegram(false);
    }
  };

  const handleSaveTelegramConfig = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsSavingTelegram(true);
    setTelegramSaveStatus(null);
    try {
      await persistTelegramConfig(telegramConfig, async (setting) => {
        await saveAdminSettingDoc(setting);
      });
      setTelegramSaveStatus("Telegram configuration saved and synchronized successfully!");
      setTimeout(() => setTelegramSaveStatus(null), 4000);
    } catch (err: any) {
      setTelegramTestStatus({
        success: false,
        message: "Failed to save settings: " + (err.message || String(err)),
      });
    } finally {
      setIsSavingTelegram(false);
    }
  };

  // ==========================================
  // TELEGRAM WHITELIST & WEBHOOK MANAGEMENT
  // ==========================================
  const [newWhitelistUsername, setNewWhitelistUsername] = useState("");

  // Discovered Telegram usernames across registered user accounts
  const discoveredProfileUsernames = useMemo(() => {
    return extractTelegramUsernamesFromProfiles(userAccounts);
  }, [userAccounts]);

  // Combined active whitelist: manual usernames + auto-discovered from user profiles
  const activeCombinedWhitelist = useMemo(() => {
    const manual = telegramConfig.whitelistedUsernames || [];
    if (telegramConfig.autoSyncProfiles !== false) {
      return mergeProfileUsernamesIntoWhitelist(manual, userAccounts);
    }
    return manual;
  }, [telegramConfig.whitelistedUsernames, telegramConfig.autoSyncProfiles, userAccounts]);

  // Webhook form state
  const [webhookInputUrl, setWebhookInputUrl] = useState<string>(() => {
    if (telegramConfig.webhookUrl) return telegramConfig.webhookUrl;
    if (typeof window !== "undefined" && window.location.origin) {
      return `${window.location.origin}/api/telegram/webhook`;
    }
    return "";
  });
  const [isManagingWebhook, setIsManagingWebhook] = useState(false);
  const [webhookInfoData, setWebhookInfoData] = useState<any | null>(null);
  const [webhookStatusNotice, setWebhookStatusNotice] = useState<{ success: boolean; message: string } | null>(null);

  // Synchronize webhookInputUrl if telegramConfig.webhookUrl changes
  useEffect(() => {
    if (telegramConfig.webhookUrl) {
      setWebhookInputUrl(telegramConfig.webhookUrl);
    }
  }, [telegramConfig.webhookUrl]);

  // Whitelist Handlers
  const handleAddWhitelistUsername = () => {
    const raw = newWhitelistUsername.trim();
    if (!raw) return;
    const clean = raw.startsWith("@") ? raw.toLowerCase() : `@${raw.toLowerCase()}`;
    const current = telegramConfig.whitelistedUsernames || [];
    if (!current.includes(clean)) {
      setTelegramConfig((prev) => ({
        ...prev,
        whitelistedUsernames: [...(prev.whitelistedUsernames || []), clean],
      }));
    }
    setNewWhitelistUsername("");
  };

  const handleRemoveWhitelistUsername = (userToRemove: string) => {
    setTelegramConfig((prev) => ({
      ...prev,
      whitelistedUsernames: (prev.whitelistedUsernames || []).filter((u) => u.toLowerCase() !== userToRemove.toLowerCase()),
    }));
  };

  const handleSyncAllProfilesToWhitelist = () => {
    const merged = mergeProfileUsernamesIntoWhitelist(telegramConfig.whitelistedUsernames || [], userAccounts);
    setTelegramConfig((prev) => ({
      ...prev,
      whitelistedUsernames: merged,
    }));
    setTelegramSaveStatus(`Auto-synced ${discoveredProfileUsernames.length} profile Telegram username(s) into whitelist!`);
    setTimeout(() => setTelegramSaveStatus(null), 4000);
  };

  // Webhook Handlers
  const handleSetWebhook = async () => {
    if (!telegramConfig.botToken || !webhookInputUrl) {
      setWebhookStatusNotice({ success: false, message: "Please provide both Bot Token and Webhook URL." });
      return;
    }
    setIsManagingWebhook(true);
    setWebhookStatusNotice(null);
    try {
      const res = await setTelegramWebhook(telegramConfig.botToken, webhookInputUrl);
      if (res.success) {
        setTelegramConfig((prev) => ({
          ...prev,
          webhookUrl: webhookInputUrl,
          webhookEnabled: true,
          webhookLastCheckedAt: new Date().toISOString(),
        }));
        setWebhookStatusNotice({ success: true, message: res.message || "Webhook activated successfully on Telegram!" });
      } else {
        setWebhookStatusNotice({ success: false, message: res.error || "Failed to set webhook." });
      }
    } catch (e: any) {
      setWebhookStatusNotice({ success: false, message: e.message || "Error configuring webhook." });
    } finally {
      setIsManagingWebhook(false);
    }
  };

  const handleCheckWebhookInfo = async () => {
    if (!telegramConfig.botToken) {
      setWebhookStatusNotice({ success: false, message: "Bot Token is required to inspect webhook." });
      return;
    }
    setIsManagingWebhook(true);
    setWebhookStatusNotice(null);
    try {
      const res = await getTelegramWebhookInfo(telegramConfig.botToken);
      if (res.success && res.info) {
        setWebhookInfoData(res.info);
        const hasUrl = !!res.info.url;
        setWebhookStatusNotice({
          success: true,
          message: hasUrl ? `Webhook is ACTIVE on: ${res.info.url} (${res.info.pending_update_count || 0} pending updates)` : "No webhook is currently active on this bot (standard push/polling mode).",
        });
      } else {
        setWebhookStatusNotice({ success: false, message: res.error || "Failed to inspect webhook." });
      }
    } catch (e: any) {
      setWebhookStatusNotice({ success: false, message: e.message || "Error checking webhook." });
    } finally {
      setIsManagingWebhook(false);
    }
  };

  const handleDeleteWebhook = async () => {
    if (!telegramConfig.botToken) {
      setWebhookStatusNotice({ success: false, message: "Bot Token is required." });
      return;
    }
    if (!window.confirm("Remove Telegram webhook? Bot will revert to direct push/polling mode.")) return;
    setIsManagingWebhook(true);
    setWebhookStatusNotice(null);
    try {
      const res = await deleteTelegramWebhook(telegramConfig.botToken);
      if (res.success) {
        setTelegramConfig((prev) => ({ ...prev, webhookEnabled: false }));
        setWebhookInfoData(null);
        setWebhookStatusNotice({ success: true, message: "Webhook removed successfully!" });
      } else {
        setWebhookStatusNotice({ success: false, message: res.error || "Failed to delete webhook." });
      }
    } catch (e: any) {
      setWebhookStatusNotice({ success: false, message: e.message || "Error deleting webhook." });
    } finally {
      setIsManagingWebhook(false);
    }
  };

  // ==========================================
  // UNIFIED TELEGRAM & SECURITY HUB STATE & ACTIONS
  // ==========================================
  const [telegramHubActiveTab, setTelegramHubActiveTab] = useState<"users" | "senders" | "settings">("users");
  const [telegramUserSearch, setTelegramUserSearch] = useState("");
  const [telegramUserFilter, setTelegramUserFilter] = useState<"all" | "verified" | "pending" | "paused">("all");

  // Telegram Diagnostics State
  const [isDiagnosingTelegram, setIsDiagnosingTelegram] = useState(false);
  const [diagnosticReport, setDiagnosticReport] = useState<TelegramDiagnosticReport | null>(null);
  const [showDiagnosticModal, setShowDiagnosticModal] = useState(false);
  const [diagnosticCustomChatId, setDiagnosticCustomChatId] = useState("");
  const [copyDiagnosticJsonSuccess, setCopyDiagnosticJsonSuccess] = useState(false);

  const [newAuthUsername, setNewAuthUsername] = useState("");
  const [newAuthAppUsername, setNewAuthAppUsername] = useState("");
  const [newAuthChatId, setNewAuthChatId] = useState("");
  const [newAuthRole, setNewAuthRole] = useState<"partner" | "admin" | "guest">("partner");
  const [testingUserId, setTestingUserId] = useState<string | null>(null);
  const [userActionNotice, setUserActionNotice] = useState<{ [userId: string]: string }>({});

  // Consolidated Telegram Users & Whitelist Directory (No Duplication)
  const consolidatedTelegramUsers = useMemo(() => {
    const list: Array<{
      key: string;
      telegramUsername: string;
      id?: string;
      chatId?: string;
      appUsername?: string;
      role: "partner" | "admin" | "guest";
      confirmed: boolean;
      confirmedAt?: string;
      isActive: boolean;
      source: "registry" | "whitelist" | "profile";
      profileAccount?: UserAccount;
    }> = [];

    const processedHandles = new Set<string>();

    // 1. Process authorizedUsers registry
    (telegramConfig.authorizedUsers || []).forEach((u) => {
      const handleLower = u.telegramUsername.toLowerCase().trim();
      processedHandles.add(handleLower);
      const matchedProfile = userAccounts.find((acc) => acc.telegramUsername && acc.telegramUsername.toLowerCase().trim().replace(/^@/, "") === handleLower.replace(/^@/, "")) || (u.appUsername ? userAccounts.find((acc) => acc.username.toLowerCase() === u.appUsername!.toLowerCase()) : undefined);

      list.push({
        key: `auth-${u.id}`,
        id: u.id,
        telegramUsername: u.telegramUsername,
        chatId: u.chatId,
        appUsername: u.appUsername || matchedProfile?.username,
        role: u.role || "partner",
        confirmed: !!u.confirmed,
        confirmedAt: u.confirmedAt,
        isActive: u.isActive !== false,
        source: matchedProfile ? "profile" : "registry",
        profileAccount: matchedProfile,
      });
    });

    // 2. Process activeCombinedWhitelist (incorporates manual whitelistedUsernames & profile usernames)
    activeCombinedWhitelist.forEach((handle) => {
      const handleLower = handle.toLowerCase().trim();
      if (!processedHandles.has(handleLower)) {
        processedHandles.add(handleLower);
        const matchedProfile = userAccounts.find((acc) => acc.telegramUsername && acc.telegramUsername.toLowerCase().trim().replace(/^@/, "") === handleLower.replace(/^@/, ""));

        list.push({
          key: `white-${handleLower}`,
          telegramUsername: handle,
          role: "partner",
          confirmed: false,
          isActive: true,
          source: matchedProfile ? "profile" : "whitelist",
          appUsername: matchedProfile?.username,
          profileAccount: matchedProfile,
        });
      }
    });

    return list;
  }, [telegramConfig.authorizedUsers, activeCombinedWhitelist, userAccounts]);

  // Filtered Directory for Search & Status
  const filteredConsolidatedUsers = useMemo(() => {
    return consolidatedTelegramUsers.filter((u) => {
      // Status filter
      if (telegramUserFilter === "verified" && !u.confirmed) return false;
      if (telegramUserFilter === "pending" && u.confirmed) return false;
      if (telegramUserFilter === "paused" && u.isActive) return false;

      // Text search
      if (telegramUserSearch.trim()) {
        const query = telegramUserSearch.toLowerCase().trim();
        const matchHandle = u.telegramUsername.toLowerCase().includes(query);
        const matchApp = u.appUsername ? u.appUsername.toLowerCase().includes(query) : false;
        const matchChat = u.chatId ? u.chatId.includes(query) : false;
        const matchRole = u.role.toLowerCase().includes(query);
        if (!matchHandle && !matchApp && !matchChat && !matchRole) return false;
      }

      return true;
    });
  }, [consolidatedTelegramUsers, telegramUserFilter, telegramUserSearch]);

  // Diagnostic Test Runner
  const handleRunDiagnostics = async (customChat?: string) => {
    if (!telegramConfig.botToken.trim()) {
      setTelegramTestStatus({
        success: false,
        message: "Please enter your Telegram Bot Token before running diagnostics.",
      });
      return;
    }

    setIsDiagnosingTelegram(true);
    setShowDiagnosticModal(true);
    setDiagnosticReport(null);

    const targetChat = (customChat !== undefined ? customChat : diagnosticCustomChatId || telegramConfig.chatId || (telegramConfig.authorizedUsers || []).find((u) => u.chatId && u.confirmed)?.chatId || "").trim();

    try {
      const report = await runTelegramBotDiagnostics(telegramConfig.botToken, targetChat);
      setDiagnosticReport(report);
      if (report.success) {
        setTelegramTestStatus({
          success: true,
          message: `Diagnostics passed! Bot @${report.bot?.username || "bot"} verified (${report.latencyMs}ms latency).`,
        });
      } else {
        setTelegramTestStatus({
          success: false,
          message: report.error || "Diagnostics reported an issue connecting to Telegram.",
        });
      }
    } catch (err: any) {
      setTelegramTestStatus({
        success: false,
        message: `Diagnostics failed: ${err.message || String(err)}`,
      });
    } finally {
      setIsDiagnosingTelegram(false);
    }
  };

  const handleAddTelegramAuthorizedUser = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const raw = newAuthUsername.trim();
    if (!raw) return;

    const cleanHandle = raw.startsWith("@") ? raw.toLowerCase() : `@${raw.toLowerCase()}`;

    // Add to authorized users
    let updated = addAuthorizedTelegramUser(telegramConfig, {
      telegramUsername: cleanHandle,
      chatId: newAuthChatId.trim() || undefined,
      appUsername: newAuthAppUsername.trim() || undefined,
      role: newAuthRole,
    });

    // Keep whitelistedUsernames synced as well
    const currentWhitelist = updated.whitelistedUsernames || [];
    if (!currentWhitelist.map((w) => w.toLowerCase()).includes(cleanHandle)) {
      updated = {
        ...updated,
        whitelistedUsernames: [...currentWhitelist, cleanHandle],
      };
    }

    setTelegramConfig(updated);
    setNewAuthUsername("");
    setNewAuthAppUsername("");
    setNewAuthChatId("");

    // Auto-save to persistence
    try {
      await persistTelegramConfig(updated, async (setting) => {
        await saveAdminSettingDoc(setting);
      });
      setTelegramSaveStatus(`Added ${cleanHandle} to Telegram & Security Hub!`);
      setTimeout(() => setTelegramSaveStatus(null), 4000);
    } catch (err: any) {
      console.warn("Could not auto-save after adding authorized user:", err);
    }
  };

  const handleRemoveConsolidatedUser = async (u: { id?: string; telegramUsername: string }) => {
    let updated = { ...telegramConfig };
    if (u.id) {
      updated = removeAuthorizedTelegramUser(updated, u.id);
    }
    const cleanHandle = u.telegramUsername.toLowerCase().trim();
    updated.whitelistedUsernames = (updated.whitelistedUsernames || []).filter((h) => h.toLowerCase().trim() !== cleanHandle);

    setTelegramConfig(updated);
    try {
      await persistTelegramConfig(updated, async (setting) => {
        await saveAdminSettingDoc(setting);
      });
      setTelegramSaveStatus(`User ${u.telegramUsername} removed from Telegram & Security Hub.`);
      setTimeout(() => setTelegramSaveStatus(null), 3000);
    } catch (err: any) {
      console.warn("Could not save user removal:", err);
    }
  };

  const handlePromoteWhitelistUser = async (handle: string, role: "partner" | "admin" | "guest" = "partner") => {
    const clean = handle.startsWith("@") ? handle.toLowerCase() : `@${handle.toLowerCase()}`;
    const matchedProfile = userAccounts.find((acc) => acc.telegramUsername && acc.telegramUsername.toLowerCase().trim().replace(/^@/, "") === clean.replace(/^@/, ""));

    const updated = addAuthorizedTelegramUser(telegramConfig, {
      telegramUsername: clean,
      appUsername: matchedProfile?.username,
      role,
      confirmed: true,
    });

    setTelegramConfig(updated);
    try {
      await persistTelegramConfig(updated, async (setting) => {
        await saveAdminSettingDoc(setting);
      });
      setTelegramSaveStatus(`Verified and activated ${clean}!`);
      setTimeout(() => setTelegramSaveStatus(null), 4000);
    } catch (err: any) {
      console.warn("Could not save user promotion:", err);
    }
  };

  const handleRemoveAuthorizedUser = async (id: string) => {
    const updated = removeAuthorizedTelegramUser(telegramConfig, id);
    setTelegramConfig(updated);
    try {
      await persistTelegramConfig(updated, async (setting) => {
        await saveAdminSettingDoc(setting);
      });
      setTelegramSaveStatus("Authorized user removed.");
      setTimeout(() => setTelegramSaveStatus(null), 3000);
    } catch (err: any) {
      console.warn("Could not auto-save after removing authorized user:", err);
    }
  };

  const handleToggleAuthorizedUser = async (id: string, currentActive: boolean) => {
    const updated = toggleAuthorizedTelegramUserStatus(telegramConfig, id, !currentActive);
    setTelegramConfig(updated);
    try {
      await persistTelegramConfig(updated, async (setting) => {
        await saveAdminSettingDoc(setting);
      });
    } catch (err: any) {
      console.warn("Could not auto-save toggle state:", err);
    }
  };

  const handleManualConfirmUser = async (userId: string) => {
    const updatedUsers = (telegramConfig.authorizedUsers || []).map((u) => {
      if (u.id === userId) {
        return {
          ...u,
          confirmed: true,
          confirmedAt: new Date().toISOString(),
          isActive: true,
        };
      }
      return u;
    });

    const updated = {
      ...telegramConfig,
      authorizedUsers: updatedUsers,
    };
    setTelegramConfig(updated);
    try {
      await persistTelegramConfig(updated, async (setting) => {
        await saveAdminSettingDoc(setting);
      });
      setTelegramSaveStatus("User marked as manually confirmed & access granted!");
      setTimeout(() => setTelegramSaveStatus(null), 4000);
    } catch (err: any) {
      console.warn("Could not save manual confirm:", err);
    }
  };

  const handleTestIndividualUser = async (user: { id?: string; telegramUsername: string; chatId?: string }) => {
    if (!telegramConfig.botToken) {
      setTelegramTestStatus({ success: false, message: "Bot Token is required to send tests." });
      return;
    }
    const key = user.id || user.telegramUsername;
    if (!user.chatId) {
      setUserActionNotice((prev) => ({ ...prev, [key]: "No Chat ID! Ask user to send /confirm in the bot." }));
      setTimeout(
        () =>
          setUserActionNotice((prev) => {
            const n = { ...prev };
            delete n[key];
            return n;
          }),
        4000,
      );
      return;
    }

    setTestingUserId(key);
    try {
      const pingMessage = `✨ <b>Our Home Verification Ping</b> 💕\n\n` + `Hello <b>${user.telegramUsername}</b>!\n` + `Your personal Telegram access is <b>Verified & Active</b> in Our Home.\n` + `You will receive milestone countdowns, date night alerts, and love letters directly in this chat! 💌\n\n` + `<i>Sent at ${new Date().toLocaleTimeString()}</i>`;

      const res = await sendDirectTelegramMessage(telegramConfig.botToken, user.chatId, pingMessage);
      if (res.success) {
        setUserActionNotice((prev) => ({ ...prev, [key]: "✅ Test Ping Sent!" }));
      } else {
        setUserActionNotice((prev) => ({ ...prev, [key]: `❌ ${res.error || "Failed"}` }));
      }
    } catch (e: any) {
      setUserActionNotice((prev) => ({ ...prev, [key]: `❌ ${e.message || "Error"}` }));
    } finally {
      setTestingUserId(null);
      setTimeout(
        () =>
          setUserActionNotice((prev) => {
            const n = { ...prev };
            delete n[key];
            return n;
          }),
        4000,
      );
    }
  };

  // ==========================================
  // GLOBAL MUSIC VAULT STATE & ACTIONS
  // ==========================================
  const [globalMusicTracks, setGlobalMusicTracks] = useState<MusicTrack[]>(() => {
    const doc = adminSettings.find((s) => s.id === "globalMusicTracks");
    if (doc?.globalMusicTracks && Array.isArray(doc.globalMusicTracks) && doc.globalMusicTracks.length > 0) {
      return doc.globalMusicTracks;
    }
    return storage.getGlobalMusicTracks();
  });

  useEffect(() => {
    const doc = adminSettings.find((s) => s.id === "globalMusicTracks");
    if (doc?.globalMusicTracks && Array.isArray(doc.globalMusicTracks) && doc.globalMusicTracks.length > 0) {
      setGlobalMusicTracks(doc.globalMusicTracks);
      storage.saveGlobalMusicTracks(doc.globalMusicTracks);
    }
  }, [adminSettings]);

  const [isAddMusicModalOpen, setIsAddMusicModalOpen] = useState(false);
  const [editingMusicTrack, setEditingMusicTrack] = useState<MusicTrack | null>(null);
  const [musicToDelete, setMusicToDelete] = useState<MusicTrack | null>(null);

  // Form states
  const [musicTitle, setMusicTitle] = useState("");
  const [musicArtist, setMusicArtist] = useState("");
  const [musicUrl, setMusicUrl] = useState("");
  const [musicDuration, setMusicDuration] = useState("3:30");
  const [musicCategory, setMusicCategory] = useState<"romantic" | "celebration">("romantic");
  const [musicDedication, setMusicDedication] = useState("");
  const [isUploadingAudio, setIsUploadingAudio] = useState(false);
  const [musicUploadProgress, setMusicUploadProgress] = useState<string | null>(null);
  const [musicFormError, setMusicFormError] = useState<string | null>(null);
  const [musicSuccessStatus, setMusicSuccessStatus] = useState<string | null>(null);

  // Audio preview player state
  const [previewTrackId, setPreviewTrackId] = useState<string | null>(null);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  const handleOpenAddMusicModal = () => {
    setEditingMusicTrack(null);
    setMusicTitle("");
    setMusicArtist("");
    setMusicUrl("");
    setMusicDuration("3:30");
    setMusicCategory("romantic");
    setMusicDedication("");
    setMusicFormError(null);
    setMusicUploadProgress(null);
    setIsAddMusicModalOpen(true);
  };

  const handleOpenEditMusicModal = (track: MusicTrack) => {
    setEditingMusicTrack(track);
    setMusicTitle(track.title || "");
    setMusicArtist(track.artist || "");
    setMusicUrl(track.url || "");
    setMusicDuration(track.duration || "3:30");
    setMusicCategory(track.category === "celebration" ? "celebration" : "romantic");
    setMusicDedication(track.dedication || "");
    setMusicFormError(null);
    setMusicUploadProgress(null);
    setIsAddMusicModalOpen(true);
  };

  const handleTogglePreview = (track: MusicTrack) => {
    if (previewTrackId === track.id && isPreviewPlaying) {
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
      }
      setIsPreviewPlaying(false);
      return;
    }

    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
    }

    const audio = new Audio(track.url);
    previewAudioRef.current = audio;
    setPreviewTrackId(track.id);
    setIsPreviewPlaying(true);

    audio.play().catch((err) => {
      console.warn("Audio preview failed:", err);
      setIsPreviewPlaying(false);
    });

    audio.onended = () => {
      setIsPreviewPlaying(false);
      setPreviewTrackId(null);
    };
  };

  const handleAudioFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.includes("audio") && !file.name.match(/\.(mp3|wav|ogg|m4a|aac)$/i)) {
      setMusicFormError("Please select a valid audio file (.mp3, .m4a, .wav, .ogg).");
      return;
    }

    if (file.size > 25 * 1024 * 1024) {
      setMusicFormError("Audio file is too large. Maximum supported size is 25MB.");
      return;
    }

    setIsUploadingAudio(true);
    setMusicUploadProgress("Reading audio file...");
    setMusicFormError(null);

    try {
      const reader = new FileReader();
      reader.onload = async (uploadEvent) => {
        const base64Data = uploadEvent.target?.result as string;
        setMusicUploadProgress("Uploading MP3 to server...");

        const cleanName = file.name.replace(/\.[^/.]+$/, "");
        const autoTitle = musicTitle.trim() || cleanName;

        const response = await fetch("/api/upload-audio", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            fileName: file.name,
            dataUrl: base64Data,
            title: autoTitle,
          }),
        });

        const data = await response.json();
        if (data.success && data.url) {
          setMusicUrl(data.url);
          if (!musicTitle.trim()) setMusicTitle(autoTitle);
          setMusicUploadProgress("Audio uploaded! Calculating track duration...");

          try {
            const tempAudio = new Audio(data.url);
            tempAudio.onloadedmetadata = () => {
              const sec = Math.floor(tempAudio.duration);
              const m = Math.floor(sec / 60);
              const s = sec % 60;
              setMusicDuration(`${m}:${s < 10 ? "0" : ""}${s}`);
              setMusicUploadProgress(null);
            };
            tempAudio.onerror = () => setMusicUploadProgress(null);
          } catch {
            setMusicUploadProgress(null);
          }
        } else {
          setMusicFormError(data.error || "Failed to upload audio to server.");
          setMusicUploadProgress(null);
        }
      };

      reader.onerror = () => {
        setMusicFormError("Failed to read the local audio file.");
        setIsUploadingAudio(false);
        setMusicUploadProgress(null);
      };

      reader.readAsDataURL(file);
    } catch (err: any) {
      setMusicFormError("Audio upload failed: " + (err.message || String(err)));
      setMusicUploadProgress(null);
    } finally {
      setIsUploadingAudio(false);
    }
  };

  const handleSaveGlobalMusicTrack = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!musicTitle.trim()) {
      setMusicFormError("Track title is required.");
      return;
    }
    if (!musicUrl.trim()) {
      setMusicFormError("Please upload an audio file or provide a valid MP3 audio URL.");
      return;
    }

    const cleanId = editingMusicTrack ? editingMusicTrack.id : "preset-" + Date.now();
    const trackObj: MusicTrack = {
      id: cleanId,
      title: musicTitle.trim(),
      artist: musicArtist.trim() || "Romantic Vault Melody",
      url: musicUrl.trim(),
      duration: musicDuration.trim() || "3:30",
      category: musicCategory,
      dedication: musicDedication.trim() || "Global Romantic Anthem for all couples 💖",
      isPreset: true,
      createdAt: editingMusicTrack?.createdAt || new Date().toISOString(),
    };

    let updatedList: MusicTrack[];
    if (editingMusicTrack) {
      updatedList = globalMusicTracks.map((t) => (t.id === editingMusicTrack.id ? trackObj : t));
    } else {
      updatedList = [...globalMusicTracks, trackObj];
    }

    setGlobalMusicTracks(updatedList);
    storage.saveGlobalMusicTracks(updatedList);

    await saveAdminSettingDoc({
      id: "globalMusicTracks",
      globalMusicTracks: updatedList,
    });

    await saveFirestoreMusicTrackDoc(trackObj);

    logActivity("Admin", editingMusicTrack ? "Edit Global Music" : "Add Global Music", `Updated global track "${trackObj.title}"`);
    setMusicSuccessStatus(`Global track "${trackObj.title}" saved and broadcast to all couples!`);
    setTimeout(() => setMusicSuccessStatus(null), 4000);
    setIsAddMusicModalOpen(false);
  };

  const handleConfirmDeleteMusicTrack = async () => {
    if (!musicToDelete) return;
    const deletedId = musicToDelete.id;
    const deletedTitle = musicToDelete.title;

    const updatedList = globalMusicTracks.filter((t) => t.id !== deletedId);
    setGlobalMusicTracks(updatedList);
    storage.saveGlobalMusicTracks(updatedList);

    await saveAdminSettingDoc({
      id: "globalMusicTracks",
      globalMusicTracks: updatedList,
    });

    await deleteFirestoreMusicTrackDoc(deletedId);
    logActivity("Admin", "Delete Global Music", `Removed global track "${deletedTitle}"`);

    if (previewTrackId === deletedId && previewAudioRef.current) {
      previewAudioRef.current.pause();
      setIsPreviewPlaying(false);
      setPreviewTrackId(null);
    }

    setMusicToDelete(null);
    setMusicSuccessStatus(`Global track "${deletedTitle}" removed from global presets.`);
    setTimeout(() => setMusicSuccessStatus(null), 4000);
  };

  const handleResetDefaultGlobalMusic = async () => {
    if (!window.confirm("Reset global music vault to original factory presets (Hamaki, Amr Gaber, Birthday Anthem)?")) {
      return;
    }

    setGlobalMusicTracks(DEFAULT_MUSIC_TRACKS);
    storage.saveGlobalMusicTracks(DEFAULT_MUSIC_TRACKS);

    await saveAdminSettingDoc({
      id: "globalMusicTracks",
      globalMusicTracks: DEFAULT_MUSIC_TRACKS,
    });

    for (const track of DEFAULT_MUSIC_TRACKS) {
      await saveFirestoreMusicTrackDoc(track);
    }

    logActivity("Admin", "Reset Global Music", "Restored default global music presets");
    setMusicSuccessStatus("Global music vault reset to default factory presets.");
    setTimeout(() => setMusicSuccessStatus(null), 4000);
  };

  // Floating Section Index Navigation & Real-time Scroll Tracking State
  const [activeSectionId, setActiveSectionId] = useState<string>("users_section");
  const [isSectionMenuOpen, setIsSectionMenuOpen] = useState<boolean>(false);
  const [isFloatingNavMinimized, setIsFloatingNavMinimized] = useState<boolean>(false);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState<boolean>(false);

  // Active section tracking via IntersectionObserver
  useEffect(() => {
    const sectionIds = ["overview_section", "countdown_milestones_section", "users_section", "tenants_section", "activity_logs_section", "security_threats_section", "security_favicon_section", "backup_data_section", "telegram_alerts_section", "global_music_section", "credentials_section", "visibility_overrides_section", "subscription_tiers_section", "promo_coupons_section", "db_diagnostics_section", "test_report_section"];

    const observerOptions: IntersectionObserverInit = {
      root: null,
      rootMargin: "-15% 0px -60% 0px",
      threshold: 0,
    };

    const handleIntersect: IntersectionObserverCallback = (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          setActiveSectionId(entry.target.id);
        }
      });
    };

    const observer = new IntersectionObserver(handleIntersect, observerOptions);

    sectionIds.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });

    return () => {
      sectionIds.forEach((id) => {
        const el = document.getElementById(id);
        if (el) observer.unobserve(el);
      });
    };
  }, []);

  // Dynamically aggregate explicit database coupleTenants AND any implicit couple spaces from userAccounts
  const allLinkedCoupleTenants = useMemo(() => {
    const map = new Map<string, CoupleTenant & { isFromDatabase?: boolean }>();

    // 1. Add all explicit couple tenant records from database
    coupleTenants.forEach((t) => {
      if (t.coupleId) {
        map.set(t.coupleId, { ...t, isFromDatabase: true });
      }
    });

    // 2. Group userAccounts by coupleId to catch any linked users missing from DB couple_tenants
    const usersByCoupleId: Record<string, UserAccount[]> = {};
    userAccounts.forEach((u) => {
      if (u.coupleId) {
        if (!usersByCoupleId[u.coupleId]) {
          usersByCoupleId[u.coupleId] = [];
        }
        usersByCoupleId[u.coupleId].push(u);
      }
    });

    // 3. For each group of user accounts, if not already in map, synthesize a CoupleTenant entry
    Object.entries(usersByCoupleId).forEach(([cId, users]) => {
      if (!map.has(cId)) {
        const p1 = users[0]?.username || "Partner 1";
        const p2 = users[1]?.username || (users.length > 1 ? users[1].username : "");
        const cName = p2 ? `${p1} & ${p2}` : `${p1}'s Space`;

        map.set(cId, {
          coupleId: cId,
          coupleName: cName,
          partner1: p1,
          partner2: p2,
          plan: "free",
          created_at: new Date().toISOString(),
          isFromDatabase: false,
        });
      }
    });

    return Array.from(map.values());
  }, [coupleTenants, userAccounts]);

  // Section index list for floating navigation
  const SECTION_LIST = useMemo(
    () => [
      { id: "overview_section", label: "Overview & Stats", icon: Home, badge: "Top" },
      { id: "countdown_milestones_section", label: "Milestones & Countdown", icon: Calendar, badge: "SaaS" },
      { id: "users_section", label: "User Accounts", icon: Users, count: userAccounts.length },
      { id: "tenants_section", label: "Couple Tenants", icon: HeartHandshake, count: allLinkedCoupleTenants.length },
      { id: "activity_logs_section", label: "Activity Logs", icon: Activity, badge: "Logs" },
      { id: "security_threats_section", label: "Security Logs", icon: ShieldAlert, badge: "Threats" },
      { id: "security_favicon_section", label: "Security & Favicon", icon: ShieldCheck, badge: "Settings" },
      { id: "backup_data_section", label: "Backup Data", icon: Database, badge: "Export" },
      { id: "telegram_alerts_section", label: "Telegram & Security Hub", icon: Send, badge: "Hub" },
      { id: "global_music_section", label: "Global Music Vault", icon: Music, count: globalMusicTracks.length },
      { id: "credentials_section", label: "Admin Credentials", icon: KeyRound, badge: "Auth" },
      { id: "visibility_overrides_section", label: "Tab Visibility Controls", icon: Sliders, badge: "Access" },
      { id: "subscription_tiers_section", label: "Subscription Tiers & Limits", icon: Crown, badge: "Tiers" },
      { id: "promo_coupons_section", label: "Promo Codes & Coupons", icon: Ticket, badge: "Coupons" },
      { id: "db_diagnostics_section", label: "Database Diagnostics", icon: Database, badge: "Sync" },
      { id: "test_report_section", label: "Automated Test Report", icon: CheckCircle2, badge: "Tests" },
    ],
    [userAccounts.length, allLinkedCoupleTenants.length, globalMusicTracks.length],
  );

  // Helper to check if a user is already connected to a partner in any couple tenant
  const isUserConnectedToPartner = useCallback(
    (username: string, currentAllowedPartner?: string) => {
      if (!username) return false;
      const targetLower = username.toLowerCase().trim();
      if (currentAllowedPartner && targetLower === currentAllowedPartner.toLowerCase().trim()) {
        return false; // Allow currently linked partner
      }

      return allLinkedCoupleTenants.some((t) => {
        const p1 = (t.partner1 || "").toLowerCase().trim();
        const p2 = (t.partner2 || "").toLowerCase().trim();
        // Considered connected if both partners exist
        if (p1 && p2) {
          return p1 === targetLower || p2 === targetLower;
        }
        return false;
      });
    },
    [allLinkedCoupleTenants],
  );

  // Handler to sync all missing/auto-detected tenants into database
  const handleSyncAllMissingTenantsToDb = async () => {
    const unsynced = allLinkedCoupleTenants.filter((t) => !t.isFromDatabase);
    if (unsynced.length === 0) {
      setUserSuccessMsg("All couple tenants are already synchronized with the database!");
      setTimeout(() => setUserSuccessMsg(null), 3000);
      return;
    }

    setIsSyncing(true);
    try {
      for (const t of unsynced) {
        const tenantToSave: CoupleTenant = {
          coupleId: t.coupleId,
          coupleName: t.coupleName,
          partner1: t.partner1,
          partner2: t.partner2,
          plan: t.plan || "free",
          created_at: t.created_at || new Date().toISOString(),
        };
        await saveCoupleTenantDoc(tenantToSave);
      }
      setUserSuccessMsg(`Successfully synchronized ${unsynced.length} missing couple tenant(s) to database!`);
      setTimeout(() => setUserSuccessMsg(null), 4000);
    } catch (err) {
      setUserErrorMsg("Failed to sync missing couple tenants to database.");
    } finally {
      setIsSyncing(false);
    }
  };

  // Handler to set tenant subscription plan with real duration calculations
  const handleSetTenantPlan = async (tenant: CoupleTenant, updatedPlan: string) => {
    const planObj = subscriptionPlans.find((p) => p.id === updatedPlan);
    const durationDays = planObj?.durationDays ?? (updatedPlan === "pro" ? 30 : -1);
    const subscriptionEndDate = calculateSubscriptionEndDate(new Date(), durationDays);

    setIsSyncing(true);
    try {
      const updated: CoupleTenant = {
        ...tenant,
        plan: updatedPlan,
        subscriptionEndDate,
      };
      await saveCoupleTenantDoc(updated);
      setUserSuccessMsg(`Updated subscription plan for "${tenant.coupleName}" to ${planObj?.name || updatedPlan.toUpperCase()} (${durationDays === -1 || durationDays <= 0 ? "Lifetime" : `${durationDays} Days`})!`);
      setTimeout(() => setUserSuccessMsg(null), 3500);
    } catch (err) {
      setUserErrorMsg("Failed to update tenant plan.");
    } finally {
      setIsSyncing(false);
    }
  };

  // Admin credentials state (Multi-admin portal support)
  const [adminAccountsList, setAdminAccountsList] = useState<AdminAccount[]>([]);
  const [showAdminPasswordIds, setShowAdminPasswordIds] = useState<Record<string, boolean>>({});
  const [showAllAdminPasswords, setShowAllAdminPasswords] = useState(false);
  const [syncingAdminId, setSyncingAdminId] = useState<string | null>(null);

  // Add new admin modal state
  const [isAddingAdmin, setIsAddingAdmin] = useState(false);
  const [newAdminUser, setNewAdminUser] = useState("");
  const [newAdminPass, setNewAdminPass] = useState("");
  const [newAdminRole, setNewAdminRole] = useState("Super Admin");
  const [newAdminNotes, setNewAdminNotes] = useState("");

  // Edit existing admin state
  const [editingAdmin, setEditingAdmin] = useState<AdminAccount | null>(null);
  const [editAdminUser, setEditAdminUser] = useState("");
  const [editAdminPass, setEditAdminPass] = useState("");
  const [editAdminRole, setEditAdminRole] = useState("Super Admin");
  const [editAdminNotes, setEditAdminNotes] = useState("");

  // Delete admin confirmation state
  const [adminToDelete, setAdminToDelete] = useState<AdminAccount | null>(null);

  const [adminUsername, setAdminUsername] = useState(() => {
    const envUser = (import.meta as any).env?.VITE_APP_USERNAME || "Admin";
    return envUser.trim();
  });
  const [adminNewPassword, setAdminNewPassword] = useState("");
  const [adminConfirmPassword, setAdminConfirmPassword] = useState("");
  const [hasLoadedAdminSettings, setHasLoadedAdminSettings] = useState(false);

  // Feedback messages
  const [userSuccessMsg, setUserSuccessMsg] = useState<string | null>(null);
  const [userErrorMsg, setUserErrorMsg] = useState<string | null>(null);
  const [adminSuccessMsg, setAdminSuccessMsg] = useState<string | null>(null);
  const [adminErrorMsg, setAdminErrorMsg] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  // Favicon upload states
  const [faviconSuccessMsg, setFaviconSuccessMsg] = useState<string | null>(null);
  const [faviconErrorMsg, setFaviconErrorMsg] = useState<string | null>(null);
  const [isUploadingFavicon, setIsUploadingFavicon] = useState(false);
  const [isDragOverFavicon, setIsDragOverFavicon] = useState(false);

  // Security auto-logout and login lockout settings states
  const [secLogoutEnabled, setSecLogoutEnabled] = useState(false);
  const [secLogoutMinutes, setSecLogoutMinutes] = useState(15);
  const [secLockoutSeconds, setSecLockoutSeconds] = useState(60);
  const [secMaxAttempts, setSecMaxAttempts] = useState(5);
  const [hasLoadedSecuritySettings, setHasLoadedSecuritySettings] = useState(false);
  const [secSuccessMsg, setSecSuccessMsg] = useState<string | null>(null);
  const [secErrorMsg, setSecErrorMsg] = useState<string | null>(null);

  // Two-Factor Authentication (TOTP / Google Authenticator) Modal state
  const [twoFactorModalAccount, setTwoFactorModalAccount] = useState<{
    type: "admin" | "user";
    id: string;
    username: string;
    enabled: boolean;
    secret: string;
    backupCodes: string[];
  } | null>(null);

  // Database Connection Health & Table Diagnostics Hooks
  const { status: dbStatus, isChecking: isCheckingDb, refresh: refreshDbStatus } = useDatabaseStatus(30000);
  const { diagnostics: tableDiagnostics, isChecking: isCheckingTables, runDiagnostics: refreshTableDiagnostics } = useSupabaseTableDiagnostics(true);
  const [showSqlSetupModal, setShowSqlSetupModal] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);
  const [migrationResult, setMigrationResult] = useState<MigrationResult | null>(null);
  const [isMigrating, setIsMigrating] = useState(false);
  const [migrationError, setMigrationError] = useState<string | null>(null);

  const [isFixingDb, setIsFixingDb] = useState(false);
  const [autoFixMessage, setAutoFixMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleAutoFixDatabase = async () => {
    setIsFixingDb(true);
    setAutoFixMessage(null);
    try {
      await refreshTableDiagnostics();
      const summary = await syncAllDataToSupabase();
      setSyncDataSummary(summary);
      await refreshDbStatus();
      await refreshTableDiagnostics();

      if (summary.errors.length === 0) {
        setAutoFixMessage({
          type: "success",
          text: "Database schema repair & sync completed successfully! Diagnostics refreshed.",
        });
      } else {
        setAutoFixMessage({
          type: "error",
          text: `Schema sync completed with notices: ${summary.errors[0]}. Click "View SQL Fix Code" to review full SQL script.`,
        });
      }
    } catch (err: any) {
      setAutoFixMessage({
        type: "error",
        text: `Auto-repair error: ${err?.message || String(err)}. Click "View SQL Fix Code" to review SQL script.`,
      });
    } finally {
      setIsFixingDb(false);
    }
  };

  const [syncDataSummary, setSyncDataSummary] = useState<SupabaseSyncSummary | null>(null);
  const [isSyncingAllData, setIsSyncingAllData] = useState(false);

  const [syncingTableState, setSyncingTableState] = useState<Record<string, "to_supabase" | "to_firestore" | null>>({});
  const [tableSyncResults, setTableSyncResults] = useState<Record<string, TableSyncResult>>({});
  const [bulkSyncDirection, setBulkSyncDirection] = useState<"to_supabase" | "to_firestore" | null>(null);

  // Automated Test Report state
  const [testReport, setTestReport] = useState<FullTestReport | null>(null);
  const [isRunningAutoTests, setIsRunningAutoTests] = useState(false);
  const [testSearchQuery, setTestSearchQuery] = useState("");
  const [testStatusFilter, setTestStatusFilter] = useState<"all" | "passed" | "warning" | "failed">("all");
  const [testCategoryFilter, setTestCategoryFilter] = useState<string>("all");
  const [expandedTestId, setExpandedTestId] = useState<string | null>(null);
  const [copiedErrors, setCopiedErrors] = useState(false);

  const handleRunAutoTests = async () => {
    setIsRunningAutoTests(true);
    try {
      const report = await runAutomatedWebsiteTests();
      setTestReport(report);
    } catch (err) {
      console.error("Failed to run automated website tests:", err);
    } finally {
      setIsRunningAutoTests(false);
    }
  };

  const handleDownloadTestReport = () => {
    if (!testReport) return;
    const lines = [
      `====================================================`,
      `OUR HOME WEBSITE AUTOMATED TEST REPORT`,
      `====================================================`,
      `Generated At   : ${testReport.timestamp}`,
      `Overall Status : ${testReport.overallStatus.toUpperCase()}`,
      `Execution Time : ${testReport.durationMs} ms`,
      `Total Tests    : ${testReport.totalTests}`,
      `Passed         : ${testReport.passedCount}`,
      `Warnings       : ${testReport.warningCount}`,
      `Failures       : ${testReport.failedCount}`,
      `====================================================\n`,
    ];

    testReport.results.forEach((test, idx) => {
      lines.push(`[${idx + 1}] ${test.status.toUpperCase()}: ${test.name}`);
      lines.push(`    Category    : ${test.category}`);
      lines.push(`    Duration    : ${test.durationMs} ms`);
      lines.push(`    Message     : ${test.message}`);
      if (test.details) lines.push(`    Details     : ${test.details}`);
      if (test.remedy) lines.push(`    Remedy      : ${test.remedy}`);
      lines.push(``);
    });

    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `OurHome_TestReport_${new Date().toISOString().slice(0, 10)}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleCopyErrors = () => {
    if (!testReport) return;
    const errors = testReport.results.filter((r) => r.status === "failed" || r.status === "warning");
    if (errors.length === 0) return;

    const errorText = errors.map((e) => `[${e.status.toUpperCase()}] ${e.name} (${e.category}): ${e.message} ${e.details ? "| " + e.details : ""}`).join("\n");
    navigator.clipboard.writeText(errorText);
    setCopiedErrors(true);
    setTimeout(() => setCopiedErrors(false), 2500);
  };

  const handleSyncSingleTable = async (tableKey: SyncTableKey, direction: "firestore_to_supabase" | "supabase_to_firestore") => {
    setSyncingTableState((prev) => ({ ...prev, [tableKey]: direction === "firestore_to_supabase" ? "to_supabase" : "to_firestore" }));
    setMigrationError(null);
    try {
      const res = direction === "firestore_to_supabase" ? await syncSingleTableFirestoreToSupabase(tableKey) : await syncSingleTableSupabaseToFirestore(tableKey);

      setTableSyncResults((prev) => ({ ...prev, [tableKey]: res }));
      logActivity("Admin", `Sync ${tableKey}`, `Synced ${tableKey} (${direction === "firestore_to_supabase" ? "Firestore ➔ Supabase" : "Supabase ➔ Firestore"}) - ${res.syncedCount} items.`);
      refreshDbStatus();
      refreshTableDiagnostics();
    } catch (err: any) {
      setMigrationError(`Error syncing ${tableKey}: ${err?.message || String(err)}`);
    } finally {
      setSyncingTableState((prev) => ({ ...prev, [tableKey]: null }));
    }
  };

  const handleBulkSyncTables = async (direction: "firestore_to_supabase" | "supabase_to_firestore") => {
    setBulkSyncDirection(direction === "firestore_to_supabase" ? "to_supabase" : "to_firestore");
    setIsSyncingAllData(true);
    setMigrationError(null);
    try {
      const { totalSynced, results, errors } = direction === "firestore_to_supabase" ? await syncAllTablesFirestoreToSupabase() : await syncAllTablesSupabaseToFirestore();

      const resultMap: Record<string, TableSyncResult> = {};
      results.forEach((r) => {
        resultMap[r.tableKey] = r;
      });
      setTableSyncResults(resultMap);

      if (errors.length > 0) {
        setMigrationError(`Bulk sync notices (${errors.length}): ${errors.slice(0, 3).join("; ")}`);
      }

      logActivity("Admin", `Bulk Sync (${direction})`, `Synced all tables (${direction === "firestore_to_supabase" ? "Firestore ➔ Supabase" : "Supabase ➔ Firestore"}) - total ${totalSynced} items.`);
      refreshDbStatus();
      refreshTableDiagnostics();
    } catch (err: any) {
      setMigrationError(`Bulk sync failed: ${err?.message || String(err)}`);
    } finally {
      setIsSyncingAllData(false);
      setBulkSyncDirection(null);
    }
  };

  const handleSyncAllSupabaseData = async () => {
    setIsSyncingAllData(true);
    setMigrationError(null);
    try {
      const summary = await syncAllDataToSupabase();
      setSyncDataSummary(summary);
      logActivity("Admin", "Supabase Data Sync", "Synchronized all local & default app data into Supabase tables.");
      refreshDbStatus();
      refreshTableDiagnostics();
    } catch (err: any) {
      setMigrationError(err?.message || "Failed to sync data to Supabase.");
    } finally {
      setIsSyncingAllData(false);
    }
  };

  const handleRunMigration = async () => {
    setIsMigrating(true);
    setMigrationError(null);
    try {
      const res = await migrateAndDeduplicateFirestoreToSupabase();
      setMigrationResult(res);
      logActivity("Admin", "System Maintenance", "Ran Firestore to Supabase deduplication & purge migration routine.");
      refreshDbStatus();
    } catch (err: any) {
      setMigrationError(err?.message || "Migration execution failed.");
    } finally {
      setIsMigrating(false);
    }
  };

  const handleDownloadReport = () => {
    if (!migrationResult) return;

    const lines = [
      `===================================================`,
      `DATABASE MAINTENANCE & MIGRATION REPORT`,
      `===================================================`,
      `Generated At: ${migrationResult.timestamp}`,
      ``,
      `DATABASE HEALTH STATUS:`,
      `---------------------------------------------------`,
      `Firebase DB : ${dbStatus.firebase.online ? "Connected" : "Offline"} (${dbStatus.firebase.latencyMs}ms) - ${dbStatus.firebase.details}`,
      `Supabase DB : ${dbStatus.supabase.online ? "Connected" : dbStatus.supabase.configured ? "Unreachable" : "Local Fallback Mode"} (${dbStatus.supabase.latencyMs}ms) - ${dbStatus.supabase.details}`,
      ``,
      `MIGRATION & DEDUPLICATION RESULTS:`,
      `---------------------------------------------------`,
      `Activity Logs Examined in Firestore : ${migrationResult.logsProcessed}`,
      `Activity Logs Migrated to Supabase    : ${migrationResult.logsMigrated}`,
      `Activity Logs Purged from Firestore   : ${migrationResult.logsPurgedFromFirestore}`,
      ``,
      `Admin Settings Examined in Firestore : ${migrationResult.settingsProcessed}`,
      `Admin Settings Migrated to Supabase   : ${migrationResult.settingsMigrated}`,
      `Admin Settings Purged from Firestore  : ${migrationResult.settingsPurgedFromFirestore}`,
      ``,
      `NOTICES / LOG DETAILS:`,
      `---------------------------------------------------`,
    ];

    if (migrationResult.errors && migrationResult.errors.length > 0) {
      migrationResult.errors.forEach((err, idx) => {
        lines.push(`[Notice ${idx + 1}] ${err}`);
      });
    } else {
      lines.push(`All records successfully verified, deduplicated, and old Firestore copies purged.`);
    }

    lines.push(``, `===================================================`, `End of Report`, `===================================================`);

    const reportContent = lines.join("\r\n");
    const blob = new Blob([reportContent], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const cleanDate = migrationResult.timestamp.replace(/[/, :]/g, "_");
    link.download = `database_maintenance_report_${cleanDate}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // User password visibility states
  const [showAllUserPasswords, setShowAllUserPasswords] = useState(false);
  const [visiblePasswordIds, setVisiblePasswordIds] = useState<Record<string, boolean>>({});
  const [showNewUserPassword, setShowNewUserPassword] = useState(false);
  const [showEditUserPassword, setShowEditUserPassword] = useState(false);

  // Subscribe to Couple Tenants
  useEffect(() => {
    const unsub = subscribeToCoupleTenants((tenants) => {
      setCoupleTenants(tenants);
    });
    return () => {
      unsub();
    };
  }, []);

  // Sync state when admin credentials load
  useEffect(() => {
    if (adminSettings.length > 0) {
      const adminAccountsDoc = adminSettings.find((s) => s.id === "adminAccounts");
      const legacyCreds = adminSettings.find((s) => s.id === "credentials");

      if (adminAccountsDoc && adminAccountsDoc.adminAccounts && adminAccountsDoc.adminAccounts.length > 0) {
        const normalized = adminAccountsDoc.adminAccounts.map((a) => ({
          ...a,
          role: "Super Admin",
        }));
        setAdminAccountsList(normalized);
        setAdminUsername(adminAccountsDoc.adminAccounts[0].username);
        setHasLoadedAdminSettings(true);
      } else if (legacyCreds && legacyCreds.username) {
        const initialAdmin: AdminAccount = {
          id: "admin_primary",
          username: legacyCreds.username,
          password: legacyCreds.password || "",
          role: "Super Admin",
          createdAt: new Date().toISOString(),
          notes: "Primary System Admin",
        };
        setAdminAccountsList([initialAdmin]);
        setAdminUsername(legacyCreds.username);
        setHasLoadedAdminSettings(true);
      } else {
        setAdminAccountsList([]);
        setHasLoadedAdminSettings(true);
      }
    }
  }, [adminSettings, hasLoadedAdminSettings]);

  // Sync security settings when loaded
  useEffect(() => {
    if (!hasLoadedSecuritySettings && adminSettings.length > 0) {
      const secDoc = adminSettings.find((s) => s.id === "securityConfig");
      if (secDoc) {
        setSecLogoutEnabled(secDoc.autoLogoutEnabled ?? false);
        setSecLogoutMinutes(secDoc.autoLogoutMinutes ?? 15);
        setSecLockoutSeconds(secDoc.loginLockoutSeconds ?? 60);
        setSecMaxAttempts(secDoc.loginMaxAttempts ?? 5);
        setHasLoadedSecuritySettings(true);
      }
    }
  }, [adminSettings, hasLoadedSecuritySettings]);

  // Run initial website auto-test suite on load
  useEffect(() => {
    let isMounted = true;
    const runInitialTests = async () => {
      setIsRunningAutoTests(true);
      try {
        const report = await runAutomatedWebsiteTests();
        if (isMounted) {
          setTestReport(report);
        }
      } catch (err) {
        console.error("Initial auto test failed:", err);
      } finally {
        if (isMounted) {
          setIsRunningAutoTests(false);
        }
      }
    };
    runInitialTests();
    return () => {
      isMounted = false;
    };
  }, []);

  // Tabs list metadata
  const TABS_LIST = [
    { id: "dashboard", label: "Home", icon: Home, desc: "Primary landing dashboard with quick shortcuts" },
    { id: "choose", label: "Choose Card", icon: Sparkles, desc: "Interactive card selector & daily couples spin" },
    { id: "milestones", label: "Milestones", icon: Gift, desc: "Milestone events timeline and shared media" },
    { id: "planner", label: "Date Planner", icon: Calendar, desc: "Date schedules, location map, and action checklists" },
    { id: "album", label: "Scrapbook", icon: ImageIcon, desc: "Memory scrapbook and shared camera roll" },
    { id: "gallery", label: "Gallery", icon: Images, desc: "Unified media gallery for Milestones, Scrapbook & Chat photos" },
    { id: "letters", label: "Letters", icon: Mail, desc: "Cute digitale sealed love letters drawer" },
    { id: "chat", label: "Chat", icon: MessageSquareHeart, desc: "Real-time couple messenger with voice notes" },
    { id: "questions", label: "Questions", icon: HelpCircle, desc: "Romantic relationship side-by-side questionnaires" },
    { id: "animation", label: "Animation", icon: Heart, desc: "Interactive romantic canvas and interactive elements" },
  ];

  // Tab visibility state
  const [visibleTabs, setVisibleTabs] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    initial["dashboard"] = true;
    initial["choose"] = true;
    initial["milestones"] = true;
    initial["planner"] = true;
    initial["album"] = true;
    initial["letters"] = true;
    initial["chat"] = true;
    initial["questions"] = true;
    initial["animation"] = true;
    return initial;
  });

  // Logs state
  const [logs, setLogs] = useState<UserActivityLog[]>([]);
  const [logSearchQuery, setLogSearchQuery] = useState("");

  // Selected user account whose tab visibility is being configured ('all' = Global)
  const [selectedTargetUser, setSelectedTargetUser] = useState<string>("all");

  // Subscribe to activity logs on mount
  useEffect(() => {
    const unsubscribe = subscribeToActivityLogs((data) => {
      setLogs(data);
    });
    return () => unsubscribe();
  }, []);

  // Subscription Plans & Feature Limits State
  const [subscriptionPlans, setSubscriptionPlans] = useState<SubscriptionPlan[]>(() => {
    const foundSetting = adminSettings.find((s) => s.id === "subscriptionPlans");
    return foundSetting?.subscriptionPlans || [];
  });

  // Selected plan in Admin Panel UI
  const [selectedPlanId, setSelectedPlanId] = useState<string>("free");

  // Modal State for Plan CRUD
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [editingPlan, setEditingPlan] = useState<SubscriptionPlan | null>(null);
  const [planForm, setPlanForm] = useState<{
    id: string;
    name: string;
    price: string;
    badgeColor: string;
    description: string;
    durationDays: number;
    billingCycle: "monthly" | "annual" | "custom" | "lifetime";
    isDefault: boolean;
    tabLimits: Record<string, TabLimitation>;
  }>({
    id: "",
    name: "",
    price: "",
    badgeColor: "amber",
    description: "",
    durationDays: 30,
    billingCycle: "monthly",
    isDefault: false,
    tabLimits: {},
  });

  // Sync subscription plans when adminSettings change
  useEffect(() => {
    const foundSetting = adminSettings.find((s) => s.id === "subscriptionPlans");
    if (foundSetting?.subscriptionPlans && foundSetting.subscriptionPlans.length > 0) {
      setSubscriptionPlans(foundSetting.subscriptionPlans);
    }
  }, [adminSettings]);

  // Save subscription plans to DB
  const handleSaveSubscriptionPlansToDb = async (updatedPlans: SubscriptionPlan[]) => {
    setIsSyncing(true);
    const currentAdmin = localStorage.getItem("love_app_username") || "Admin";
    setSubscriptionPlans(updatedPlans);
    try {
      await saveAdminSettingDoc({
        id: "subscriptionPlans",
        subscriptionPlans: updatedPlans,
      });
      await logActivity(currentAdmin, "subscriptions_updated", `Updated subscription plans & feature limitations`);
      setAdminSuccessMsg("Subscription plans & tab limitations saved successfully!");
      setTimeout(() => setAdminSuccessMsg(null), 3500);
    } catch (err) {
      setAdminErrorMsg("Failed to save subscription plans.");
      setTimeout(() => setAdminErrorMsg(null), 3500);
    } finally {
      setIsSyncing(false);
    }
  };

  // Countdown & Milestone Quotas Manager Handlers
  const handleSaveCountdownConfigFromManager = async (config: CountdownConfig) => {
    setIsSyncing(true);
    setCountdownConfig(config);
    const currentAdmin = localStorage.getItem("love_app_username") || "Admin";
    try {
      await saveAdminSettingDoc({
        id: "countdownConfig",
        countdownConfig: config,
      });
      await logActivity(currentAdmin, "countdown_config_updated", `Updated countdown settings in admin panel: mode=${config.mode}, enabled=${config.enabled}`);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSaveMilestoneQuotasFromManager = async (quotas: MilestoneQuotas) => {
    setIsSyncing(true);
    setMilestoneQuotas(quotas);
    const currentAdmin = localStorage.getItem("love_app_username") || "Admin";
    try {
      await saveAdminSettingDoc({
        id: "milestoneQuotas",
        milestoneQuotas: quotas,
      });
      await logActivity(currentAdmin, "milestone_quotas_updated", `Updated milestone counts & quotas in admin panel: Total=${quotas.maxTotalMilestones}, Anniversaries=${quotas.maxAnniversaries}, Birthdays=${quotas.maxBirthdays}`);
    } finally {
      setIsSyncing(false);
    }
  };

  // Promo Codes Management State
  const [promoCodes, setPromoCodes] = useState<PromoCode[]>(() => {
    const foundSetting = adminSettings.find((s) => s.id === "promoCodes");
    return foundSetting?.promoCodes || DEFAULT_PROMO_CODES;
  });

  // Modal State for Promo Code CRUD
  const [showPromoModal, setShowPromoModal] = useState(false);
  const [editingPromo, setEditingPromo] = useState<PromoCode | null>(null);
  const [promoForm, setPromoForm] = useState<{
    id: string;
    code: string;
    discountType: "percentage" | "fixed";
    discountValue: number;
    applicablePlanIds: string[];
    maxUses: number;
    expiresAt: string;
    isActive: boolean;
    description: string;
  }>({
    id: "",
    code: "",
    discountType: "percentage",
    discountValue: 50,
    applicablePlanIds: ["all"],
    maxUses: -1,
    expiresAt: "",
    isActive: true,
    description: "",
  });

  // Sync promo codes when adminSettings change
  useEffect(() => {
    const foundSetting = adminSettings.find((s) => s.id === "promoCodes");
    if (foundSetting?.promoCodes && foundSetting.promoCodes.length > 0) {
      setPromoCodes(foundSetting.promoCodes);
    }
  }, [adminSettings]);

  // Save promo codes to DB
  const handleSavePromoCodesToDb = async (updatedCodes: PromoCode[]) => {
    setIsSyncing(true);
    const currentAdmin = localStorage.getItem("love_app_username") || "Admin";
    setPromoCodes(updatedCodes);
    try {
      await saveAdminSettingDoc({
        id: "promoCodes",
        promoCodes: updatedCodes,
      });
      await logActivity(currentAdmin, "promo_codes_updated", `Updated subscription promo codes & discount coupons`);
      setAdminSuccessMsg("Promo codes & discounts saved successfully!");
      setTimeout(() => setAdminSuccessMsg(null), 3500);
    } catch (err) {
      console.error("Error saving promo codes:", err);
      setAdminErrorMsg("Failed to save promo codes.");
      setTimeout(() => setAdminErrorMsg(null), 3500);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleTogglePromoActive = async (codeId: string) => {
    const updated = promoCodes.map((p) => (p.id === codeId ? { ...p, isActive: !p.isActive } : p));
    await handleSavePromoCodesToDb(updated);
  };

  const handleDeletePromoCode = async (codeId: string) => {
    if (!confirm(`Are you sure you want to delete promo code "${codeId}"?`)) return;
    const updated = promoCodes.filter((p) => p.id !== codeId);
    await handleSavePromoCodesToDb(updated);
  };

  const handleOpenAddPromoModal = () => {
    setEditingPromo(null);
    setPromoForm({
      id: "",
      code: "",
      discountType: "percentage",
      discountValue: 50,
      applicablePlanIds: ["all"],
      maxUses: -1,
      expiresAt: "",
      isActive: true,
      description: "Special subscription discount",
    });
    setShowPromoModal(true);
  };

  const handleOpenEditPromoModal = (promo: PromoCode) => {
    setEditingPromo(promo);
    setPromoForm({
      id: promo.id,
      code: promo.code,
      discountType: promo.discountType || "percentage",
      discountValue: promo.discountValue ?? 50,
      applicablePlanIds: promo.applicablePlanIds || ["all"],
      maxUses: promo.maxUses ?? -1,
      expiresAt: promo.expiresAt || "",
      isActive: promo.isActive ?? true,
      description: promo.description || "",
    });
    setShowPromoModal(true);
  };

  const handleSavePromoForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!promoForm.code.trim()) {
      alert("Please enter a coupon promo code name.");
      return;
    }

    const cleanCode = promoForm.code
      .toUpperCase()
      .trim()
      .replace(/[^A-Z0-9_-]/g, "");
    const cleanId = editingPromo ? editingPromo.id : cleanCode;

    const newPromo: PromoCode = {
      id: cleanId,
      code: cleanCode,
      discountType: promoForm.discountType,
      discountValue: Number(promoForm.discountValue) || 0,
      applicablePlanIds: promoForm.applicablePlanIds.length === 0 ? ["all"] : promoForm.applicablePlanIds,
      maxUses: Number(promoForm.maxUses) ?? -1,
      timesUsed: editingPromo ? editingPromo.timesUsed || 0 : 0,
      expiresAt: promoForm.expiresAt || "",
      isActive: promoForm.isActive,
      description: promoForm.description,
      createdAt: editingPromo ? editingPromo.createdAt : new Date().toISOString(),
    };

    let updatedList: PromoCode[];
    if (editingPromo) {
      updatedList = promoCodes.map((p) => (p.id === editingPromo.id ? newPromo : p));
    } else {
      if (promoCodes.some((p) => p.code === cleanCode)) {
        alert(`Promo code "${cleanCode}" already exists.`);
        return;
      }
      updatedList = [...promoCodes, newPromo];
    }

    setShowPromoModal(false);
    await handleSavePromoCodesToDb(updatedList);
  };

  // Toggle Tab Lock status for a specific Subscription Plan
  const handleTogglePlanTabLock = async (planId: string, tabId: string) => {
    const updated = subscriptionPlans.map((plan) => {
      if (plan.id !== planId) return plan;
      const currentTabLimit = plan.tabLimits?.[tabId] || { maxLimit: -1, isLocked: false };
      return {
        ...plan,
        tabLimits: {
          ...plan.tabLimits,
          [tabId]: {
            ...currentTabLimit,
            isLocked: !currentTabLimit.isLocked,
          },
        },
      };
    });
    await handleSaveSubscriptionPlansToDb(updated);
  };

  // Update Tab Max Limit quota for a specific Subscription Plan
  const handleUpdatePlanTabLimit = async (planId: string, tabId: string, maxLimit: number) => {
    const updated = subscriptionPlans.map((plan) => {
      if (plan.id !== planId) return plan;
      const currentTabLimit = plan.tabLimits?.[tabId] || { maxLimit: -1, isLocked: false };
      return {
        ...plan,
        tabLimits: {
          ...plan.tabLimits,
          [tabId]: {
            ...currentTabLimit,
            maxLimit,
          },
        },
      };
    });
    await handleSaveSubscriptionPlansToDb(updated);
  };

  // Update Tab Description / Note for a specific Subscription Plan
  const handleUpdatePlanTabDesc = async (planId: string, tabId: string, description: string) => {
    const updated = subscriptionPlans.map((plan) => {
      if (plan.id !== planId) return plan;
      const currentTabLimit = plan.tabLimits?.[tabId] || { maxLimit: -1, isLocked: false };
      return {
        ...plan,
        tabLimits: {
          ...plan.tabLimits,
          [tabId]: {
            ...currentTabLimit,
            description,
          },
        },
      };
    });
    await handleSaveSubscriptionPlansToDb(updated);
  };

  // Handle Opening Plan Modal (Add vs Edit)
  const handleOpenAddPlanModal = () => {
    setEditingPlan(null);
    const defaultLimits: Record<string, TabLimitation> = {};
    TABS_LIST.forEach((t) => {
      defaultLimits[t.id] = { maxLimit: -1, isLocked: false, description: `Access to ${t.label}` };
    });
    setPlanForm({
      id: "",
      name: "",
      price: "$9.99/month",
      badgeColor: "purple",
      description: "Exclusive custom subscription tier with tailored feature limits.",
      durationDays: 30,
      billingCycle: "monthly",
      isDefault: false,
      tabLimits: defaultLimits,
    });
    setShowPlanModal(true);
  };

  const handleOpenEditPlanModal = (plan: SubscriptionPlan) => {
    setEditingPlan(plan);
    const existingLimits = plan.tabLimits || {};
    const mergedLimits: Record<string, TabLimitation> = { ...existingLimits };
    TABS_LIST.forEach((t) => {
      if (!mergedLimits[t.id]) {
        mergedLimits[t.id] = { maxLimit: -1, isLocked: false, description: `Access to ${t.label}` };
      }
    });
    setPlanForm({
      id: plan.id,
      name: plan.name,
      price: plan.price,
      badgeColor: plan.badgeColor || "amber",
      description: plan.description || "",
      durationDays: plan.durationDays ?? (plan.id === "free" ? -1 : 30),
      billingCycle: plan.billingCycle || (plan.id === "free" ? "lifetime" : "monthly"),
      isDefault: !!plan.isDefault,
      tabLimits: mergedLimits,
    });
    setShowPlanModal(true);
  };

  // Save Plan from Modal
  const handleSavePlanFromModal = async () => {
    if (!planForm.name || !planForm.id) {
      setAdminErrorMsg("Please fill in Plan Name and Plan ID!");
      setTimeout(() => setAdminErrorMsg(null), 3000);
      return;
    }

    const cleanId = planForm.id
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9_]/g, "");

    const updatedPlan: SubscriptionPlan = {
      id: cleanId,
      name: planForm.name,
      price: planForm.price,
      badgeColor: planForm.badgeColor,
      description: planForm.description,
      durationDays: Number(planForm.durationDays) ?? 30,
      billingCycle: planForm.billingCycle,
      isDefault: planForm.isDefault,
      tabLimits: planForm.tabLimits,
    };

    let updatedList: SubscriptionPlan[];
    if (editingPlan) {
      updatedList = subscriptionPlans.map((p) => (p.id === editingPlan.id ? updatedPlan : p));
    } else {
      updatedList = [...subscriptionPlans.filter((p) => p.id !== cleanId), updatedPlan];
    }

    if (updatedPlan.isDefault) {
      updatedList = updatedList.map((p) => ({
        ...p,
        isDefault: p.id === cleanId,
      }));
    }

    await handleSaveSubscriptionPlansToDb(updatedList);
    setSelectedPlanId(cleanId);
    setShowPlanModal(false);
  };

  // Delete Plan
  const handleDeletePlan = async (planId: string) => {
    if (subscriptionPlans.length <= 1) {
      alert("You must keep at least one subscription plan in the system!");
      return;
    }

    if (!confirm(`Are you sure you want to delete subscription plan "${planId}"?`)) return;

    const updated = subscriptionPlans.filter((p) => p.id !== planId);
    await handleSaveSubscriptionPlansToDb(updated);
    if (selectedPlanId === planId) {
      setSelectedPlanId(updated[0]?.id || "free");
    }
  };

  // Sync tab visibility when adminSettings load
  useEffect(() => {
    const tabSetting = adminSettings.find((s) => s.id === "tabVisibility");
    if (tabSetting?.visibleTabs) {
      setVisibleTabs((prev) => ({
        ...prev,
        ...tabSetting.visibleTabs,
      }));
    }
  }, [adminSettings]);

  // Handle toggling tab visibility
  const handleToggleTabVisibility = async (tabId: string) => {
    setIsSyncing(true);
    const currentAdmin = localStorage.getItem("love_app_username") || "Admin";
    if (selectedTargetUser === "all") {
      const updated = {
        ...visibleTabs,
        [tabId]: !visibleTabs[tabId],
      };
      setVisibleTabs(updated);
      try {
        await saveAdminSettingDoc({
          id: "tabVisibility",
          visibleTabs: updated,
        });
        await logActivity(currentAdmin, "admin_tabs_updated", `Toggled global visibility of tab "${tabId}" to ${!visibleTabs[tabId] ? "Visible" : "Hidden"}`);
        setAdminSuccessMsg("Global tab visibility updated successfully!");
        setTimeout(() => setAdminSuccessMsg(null), 3000);
      } catch (err) {
        setAdminErrorMsg("Failed to update global tab visibility.");
        setTimeout(() => setAdminErrorMsg(null), 3000);
      } finally {
        setIsSyncing(false);
      }
    } else {
      const targetUser = userAccounts.find((u) => u.id === selectedTargetUser);
      if (!targetUser) {
        setIsSyncing(false);
        return;
      }
      const userTabs = targetUser.visibleTabs || {};
      const isGloballyVisible = visibleTabs[tabId] !== false;

      // Determine current effective visibility for this user
      let isCurrentlyVisible = isGloballyVisible;
      if (userTabs && tabId in userTabs && userTabs[tabId] !== undefined) {
        isCurrentlyVisible = userTabs[tabId] === true;
      }

      const newVisibility = !isCurrentlyVisible;
      const updatedUserTabs = {
        ...userTabs,
        [tabId]: newVisibility,
      };

      const updatedUserAccount: UserAccount = {
        ...targetUser,
        visibleTabs: updatedUserTabs,
      };

      try {
        await saveUserAccountDoc(updatedUserAccount);
        await logActivity(currentAdmin, "user_tabs_updated", `Toggled tab "${tabId}" visibility for "${targetUser.username}" to ${newVisibility ? "Visible" : "Hidden"}`);
        setAdminSuccessMsg(`Tab "${tabId}" set to ${newVisibility ? "Visible" : "Hidden"} for user "${targetUser.username}"!`);
        setTimeout(() => setAdminSuccessMsg(null), 3000);
      } catch (err) {
        setAdminErrorMsg(`Failed to update tab visibility for "${targetUser.username}".`);
        setTimeout(() => setAdminErrorMsg(null), 3000);
      } finally {
        setIsSyncing(false);
      }
    }
  };

  // Handle batch enabling/disabling of all tabs
  const handleBatchToggleTabs = async (enable: boolean) => {
    setIsSyncing(true);
    const currentAdmin = localStorage.getItem("love_app_username") || "Admin";
    const newTabsState: Record<string, boolean> = {};
    TABS_LIST.forEach((tab) => {
      newTabsState[tab.id] = enable;
    });

    if (selectedTargetUser === "all") {
      setVisibleTabs(newTabsState);
      try {
        await saveAdminSettingDoc({
          id: "tabVisibility",
          visibleTabs: newTabsState,
        });
        await logActivity(currentAdmin, "admin_tabs_updated", `Batch set all global tabs to ${enable ? "Visible" : "Hidden"}`);
        setAdminSuccessMsg(`All tabs globally set to ${enable ? "Visible" : "Hidden"}!`);
        setTimeout(() => setAdminSuccessMsg(null), 3000);
      } catch (err) {
        setAdminErrorMsg("Failed to update tab visibility.");
        setTimeout(() => setAdminErrorMsg(null), 3000);
      } finally {
        setIsSyncing(false);
      }
    } else {
      const targetUser = userAccounts.find((u) => u.id === selectedTargetUser);
      if (!targetUser) {
        setIsSyncing(false);
        return;
      }
      const updatedUserAccount: UserAccount = {
        ...targetUser,
        visibleTabs: newTabsState,
      };
      try {
        await saveUserAccountDoc(updatedUserAccount);
        await logActivity(currentAdmin, "user_tabs_updated", `Batch set all tabs for "${targetUser.username}" to ${enable ? "Visible" : "Hidden"}`);
        setAdminSuccessMsg(`All tabs set to ${enable ? "Visible" : "Hidden"} for user "${targetUser.username}"!`);
        setTimeout(() => setAdminSuccessMsg(null), 3000);
      } catch (err) {
        setAdminErrorMsg(`Failed to update tab visibility for "${targetUser.username}".`);
        setTimeout(() => setAdminErrorMsg(null), 3000);
      } finally {
        setIsSyncing(false);
      }
    }
  };

  // Favicon Helpers
  const fileToBase64 = (file: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (error) => reject(error);
    });
  };

  const handleFaviconFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      setFaviconErrorMsg("Please select a valid image file.");
      setTimeout(() => setFaviconErrorMsg(null), 3000);
      return;
    }

    setIsUploadingFavicon(true);
    setFaviconSuccessMsg(null);
    setFaviconErrorMsg(null);

    try {
      const options = {
        maxSizeMB: 0.05, // 50KB limit is perfect for a favicon
        maxWidthOrHeight: 128, // Max size 128x128 pixels (great for high-res favicons)
        useWebWorker: true,
        fileType: "image/png",
        initialQuality: 0.8,
      };

      const compressedBlob = await imageCompression(file, options);
      const base64String = await fileToBase64(compressedBlob);

      await saveAdminSettingDoc({
        id: "websiteFavicon",
        favicon: base64String,
      });

      const currentAdmin = localStorage.getItem("love_app_username") || "Admin";
      await logActivity(currentAdmin, "admin_favicon_updated", "Uploaded and set a new website favicon");

      setFaviconSuccessMsg("Website favicon updated successfully!");
      setTimeout(() => setFaviconSuccessMsg(null), 3000);
    } catch (err) {
      console.error("Favicon compression/upload error:", err);
      setFaviconErrorMsg("Failed to upload and set website favicon.");
      setTimeout(() => setFaviconErrorMsg(null), 3000);
    } finally {
      setIsUploadingFavicon(false);
    }
  };

  const handleResetFavicon = async () => {
    setFaviconSuccessMsg(null);
    setFaviconErrorMsg(null);
    setIsUploadingFavicon(true);
    try {
      await saveAdminSettingDoc({
        id: "websiteFavicon",
        favicon: "",
      });
      const currentAdmin = localStorage.getItem("love_app_username") || "Admin";
      await logActivity(currentAdmin, "admin_favicon_reset", "Reset website favicon to default");
      setFaviconSuccessMsg("Website favicon reset to default successfully!");
      setTimeout(() => setFaviconSuccessMsg(null), 3000);
    } catch (err) {
      setFaviconErrorMsg("Failed to reset website favicon.");
      setTimeout(() => setFaviconErrorMsg(null), 3000);
    } finally {
      setIsUploadingFavicon(false);
    }
  };

  const handleConnectCoupleTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    setUserSuccessMsg(null);
    setUserErrorMsg(null);

    const p1 = pairPartner1.trim();
    const p2 = pairPartner2.trim();
    const cName = pairCoupleName.trim() || `${p1} & ${p2}`;

    if (!p1 || !p2) {
      setUserErrorMsg("Please select two user accounts to link as partners.");
      return;
    }
    if (p1.toLowerCase() === p2.toLowerCase()) {
      setUserErrorMsg("Partner 1 and Partner 2 must be different user accounts.");
      return;
    }

    setIsSyncing(true);
    try {
      // Linking runs on the server as one fenced operation (database and Firestore membership). Nothing is rewritten in the browser.
      const linked = await linkCouple(p1, p2, cName);
      if (!linked.ok) {
        setUserErrorMsg((linked as any).error);
        setIsSyncing(false);
        return;
      }
      const coupleId = String(linked.data?.txId || "");

      const currentAdmin = localStorage.getItem("love_app_username") || "Admin";
      await logActivity(currentAdmin, "couple_tenant_created", `Connected partners "${p1}" and "${p2}" into couple tenant "${cName}" (op ${coupleId}).`);

      setUserSuccessMsg(`Successfully connected partners "${p1}" and "${p2}" as couple "${cName}"!`);
      setIsPairingCouple(false);
      setPairPartner1("");
      setPairPartner2("");
      setPairCoupleName("");
      setTimeout(() => setUserSuccessMsg(null), 4000);
    } catch (err) {
      setUserErrorMsg("Failed to connect couple tenant.");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleUnlinkCouple = async (tenant: CoupleTenant) => {
    setUserSuccessMsg(null);
    setUserErrorMsg(null);
    setIsSyncing(true);
    try {
      // 1. Only accounts that really live in this space are unlinked (never matched by name).
      const { users: affectedUsers, canUnlink } = unlinkTargets(tenant, userAccounts, accountsLoaded);
      if (!canUnlink) {
        setUserErrorMsg(accountsLoaded ? "No account is linked to this space, so there is nothing to unlink. Nothing was changed or deleted." : "Accounts are still loading from the server. Wait a moment and try again. Nothing was changed.");
        setIsSyncing(false);
        return;
      }
      // The server restores each account's own personal space and keeps the joint space and the chat. Nothing is deleted in the browser.
      const unlinked = await unlinkCouple(tenant.coupleId);
      if (!unlinked.ok) {
        setUserErrorMsg((unlinked as any).error);
        setIsSyncing(false);
        return;
      }

      const currentAdmin = localStorage.getItem("love_app_username") || "Admin";
      await logActivity(currentAdmin, "couple_tenant_unlinked", `Unlinked couple tenant "${tenant.coupleName}" (${tenant.coupleId}).`);

      setUserSuccessMsg(`Unlinked couple tenant "${tenant.coupleName}".`);
      setTimeout(() => setUserSuccessMsg(null), 4000);
    } catch (err) {
      setUserErrorMsg("Failed to unlink couple tenant.");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setUserSuccessMsg(null);
    setUserErrorMsg(null);

    const uName = newUsername.trim().toLowerCase();
    const rawPass = newPassword.trim();

    if (!uName || !rawPass) {
      setUserErrorMsg("Both username and password are required.");
      return;
    }

    const configUser = ((import.meta as any).env?.VITE_APP_USERNAME || "").toLowerCase().trim();
    if (uName === configUser || uName === adminUsername.toLowerCase().trim()) {
      setUserErrorMsg(`"${newUsername}" is reserved for the Admin Panel.`);
      return;
    }

    // Check if user already exists
    if (userAccounts.some((u) => u.username.toLowerCase() === uName)) {
      setUserErrorMsg(`User "${newUsername}" already exists.`);
      return;
    }

    setIsSyncing(true);
    try {
      const uPass = rawPass; // plaintext over TLS; the server hashes it
      // Decided by a FRESH server answer, never the stored scope: only a fresh "gate off" selects the legacy path; stored false, unknown or a failed refresh all take the strict server create op.
      const strictScope = !(await bulkCopyAllowed());
      if (strictScope) {
        // Strict release: a new account always starts SOLO on its own personal space (the database assigns it from the account id). Joining a partner happens only through the link operation, and the message reports its real result.
        const cr = await adminCreateAccount(newUsername.trim(), uPass, newUserGender as "male" | "female", newUserPlan || undefined);
        if (cr.ok === false) { setUserErrorMsg(cr.error); return; }
        const solo = { username: cr.data.account.username };
        let msg = `Account "${solo.username}" created (solo, space ${cr.data.account.personalCoupleId}, ${(cr.data.plan || "free").toUpperCase()} plan).` + (cr.data.warnings?.length ? ` Warnings: ${cr.data.warnings.join("; ")}.` : "");
        if (newUserPartner) {
          const lk = await linkCouple(solo.username, newUserPartner, `${solo.username} & ${newUserPartner}`);
          msg += lk.ok ? ` Linked with ${newUserPartner}.` : ` NOT linked with ${newUserPartner}: ${(lk as any).error}`;
        }
        setNewUsername(""); setNewPassword(""); setNewUserPartner(""); setNewUserPlan("free"); setNewUserGender("male");
        setUserSuccessMsg(msg);
        setTimeout(() => setUserSuccessMsg(null), 6000);
        return;
      }
      let coupleId = `couple_${Date.now()}`;
      let partnerAccount: UserAccount | undefined;

      if (newUserPartner) {
        partnerAccount = userAccounts.find((u) => u.username.toLowerCase() === newUserPartner.toLowerCase());
        if (partnerAccount && partnerAccount.coupleId) {
          coupleId = partnerAccount.coupleId;
        }
      }

      const newUser: UserAccount = {
        id: `user_${Date.now()}`,
        username: newUsername.trim(),
        password: uPass,
        gender: newUserGender,
        coupleId,
      };
      await saveUserAccountDoc(newUser);

      // If partner was selected, create/update couple tenant and update partner account
      if (partnerAccount) {
        const cTenant: CoupleTenant = {
          coupleId,
          coupleName: `${newUser.username} & ${partnerAccount.username}`,
          partner1: newUser.username,
          partner2: partnerAccount.username,
          plan: newUserPlan || "free",
          created_at: new Date().toISOString(),
        };
        await saveCoupleTenantDoc(cTenant);
        await saveUserAccountDoc({ ...partnerAccount, coupleId });
      } else {
        // Create a new couple tenant record for this standalone user
        const cTenant: CoupleTenant = {
          coupleId,
          coupleName: `${newUser.username}'s Couple`,
          partner1: newUser.username,
          partner2: "",
          plan: newUserPlan || "free",
          created_at: new Date().toISOString(),
        };
        await saveCoupleTenantDoc(cTenant);
      }

      setNewUsername("");
      setNewPassword("");
      setNewUserPartner("");
      setNewUserPlan("free");
      setNewUserGender("male");
      setUserSuccessMsg(`User account "${newUser.username}" created successfully with ${newUserPlan.toUpperCase()} plan (Password Cryptographically Hashed)!${partnerAccount ? ` (Linked with partner "${partnerAccount.username}")` : ""}`);

      setTimeout(() => setUserSuccessMsg(null), 4000);
    } catch (err) {
      setUserErrorMsg("Failed to save user account to database.");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleUpdateUserPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setUserSuccessMsg(null);
    setUserErrorMsg(null);

    if (!editingUser) return;
    const rawPass = editingPassword.trim();

    setIsSyncing(true);
    try {
      const uPass = rawPass; // blank keeps the current password; otherwise the server hashes it
      const newCoupleId = editingUserCoupleId || editingUser.coupleId || `couple_${Date.now()}`;
      const oldCoupleId = editingUser.coupleId;
      const updated: UserAccount = {
        ...editingUser,
        password: uPass,
        gender: editingUserGender,
        coupleId: newCoupleId,
      };
      await saveUserAccountDoc(updated);
      if (oldCoupleId && oldCoupleId !== newCoupleId) {
        await updateDataCoupleId(oldCoupleId, newCoupleId, [editingUser.username]);
      }

      // Update tenant plan if specified
      if (newCoupleId) {
        const existingTenant = allLinkedCoupleTenants.find((t) => t.coupleId === newCoupleId);
        const updatedTenant: CoupleTenant = {
          coupleId: newCoupleId,
          coupleName: existingTenant?.coupleName || `${editingUser.username}'s Space`,
          partner1: existingTenant?.partner1 || editingUser.username,
          partner2: existingTenant?.partner2 || "",
          plan: editingUserPlan || existingTenant?.plan || "free",
          created_at: existingTenant?.created_at || new Date().toISOString(),
        };
        await saveCoupleTenantDoc(updatedTenant);
      }

      setUserSuccessMsg(`User account "${editingUser.username}" updated successfully!`);
      setEditingUser(null);
      setEditingPassword("");
      setEditingUserCoupleId("");
      setEditingUserPlan("free");
      setEditingUserGender("male");

      setTimeout(() => setUserSuccessMsg(null), 4000);
    } catch (err) {
      setUserErrorMsg("Failed to update user account.");
    } finally {
      setIsSyncing(false);
    }
  };

  const [syncingUserId, setSyncingUserId] = useState<string | null>(null);

  const handleSyncUser = async (user: UserAccount) => {
    setUserSuccessMsg(null);
    setUserErrorMsg(null);
    setSyncingUserId(user.id);
    setIsSyncing(true);
    try {
      await saveUserAccountDoc(user);
      const currentAdmin = localStorage.getItem("love_app_username") || "Admin";
      await logActivity(currentAdmin, "user_synced", `Synchronized account "${user.username}" across Firestore and Supabase databases.`);
      setUserSuccessMsg(`User account "${user.username}" synchronized to database successfully!`);
      setTimeout(() => setUserSuccessMsg(null), 4000);
    } catch (err) {
      setUserErrorMsg(`Failed to synchronize user account "${user.username}".`);
    } finally {
      setSyncingUserId(null);
      setIsSyncing(false);
    }
  };

  const handleSyncAllUsers = async () => {
    if (userAccounts.length === 0) {
      setUserErrorMsg("No user accounts available to sync.");
      return;
    }
    setUserSuccessMsg(null);
    setUserErrorMsg(null);
    setIsSyncing(true);
    try {
      for (const user of userAccounts) {
        await saveUserAccountDoc(user);
      }
      const currentAdmin = localStorage.getItem("love_app_username") || "Admin";
      await logActivity(currentAdmin, "all_users_synced", `Synchronized all ${userAccounts.length} user accounts across Firestore and Supabase databases.`);
      setUserSuccessMsg(`All ${userAccounts.length} user accounts synchronized to Firestore and Supabase successfully!`);
      setTimeout(() => setUserSuccessMsg(null), 4000);
    } catch (err) {
      setUserErrorMsg("Failed to synchronize all user accounts.");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleDeleteUser = async (user: UserAccount) => {
    setUserSuccessMsg(null);
    setUserErrorMsg(null);
    setIsSyncing(true);
    try {
      await deleteUserAccountDoc(user.id);
      setUserSuccessMsg(`User "${user.username}" deleted successfully.`);
      setUserToDelete(null);
      setTimeout(() => setUserSuccessMsg(null), 4000);
    } catch (err) {
      setUserErrorMsg("Failed to delete user.");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSaveAdminAccountsList = async (updatedList: AdminAccount[], logMsg?: string) => {
    setIsSyncing(true);
    setAdminSuccessMsg(null);
    setAdminErrorMsg(null);
    try {
      // 1. Save adminAccounts document
      await saveAdminSettingDoc({
        id: "adminAccounts",
        adminAccounts: updatedList,
      });

      // Do not duplicate primary-admin credentials into a second legacy row.
      // The submitted list may contain plaintext. Use only the redacted server refresh.
      const safeSettings = storage.getAdminSettings();
      setAdminAccountsList(safeSettings.find(s => s.id === "adminAccounts")?.adminAccounts || []);
      setNewAdminPass("");
      setEditAdminPass("");
      const currentAdmin = localStorage.getItem("love_app_username") || "Admin";
      await logActivity(currentAdmin, "admin_credentials_updated", logMsg || "Updated admin credentials in Firestore & Supabase.");
      setAdminSuccessMsg("Admin portal credentials synchronized to database successfully!");
      setTimeout(() => setAdminSuccessMsg(null), 4000);
    } catch (err: any) {
      const reason = typeof err?.message === "string" ? err.message.slice(0, 160) : "";
      setAdminErrorMsg(reason ? `Failed to save admin credentials to database: ${reason}` : "Failed to save admin credentials to database.");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleAddAdminAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminSuccessMsg(null);
    setAdminErrorMsg(null);

    const cleanUser = newAdminUser.trim();
    if (!cleanUser) {
      setAdminErrorMsg("Admin username cannot be empty.");
      return;
    }

    if (adminAccountsList.some((a) => a.username.toLowerCase() === cleanUser.toLowerCase())) {
      setAdminErrorMsg(`Admin account "${cleanUser}" already exists.`);
      return;
    }

    const hashedAdminPass = newAdminPass.trim(); // plaintext over TLS; the server hashes it

    const newAcc: AdminAccount = {
      id: `admin_${Date.now()}`,
      username: cleanUser,
      password: hashedAdminPass,
      role: newAdminRole || "Super Admin",
      createdAt: new Date().toISOString(),
      notes: newAdminNotes.trim(),
    };

    const updated = [...adminAccountsList, newAcc];
    await handleSaveAdminAccountsList(updated, `Created new admin portal credential "${cleanUser}" (${newAcc.role}) [Hashed].`);

    setNewAdminUser("");
    setNewAdminPass("");
    setNewAdminRole("Super Admin");
    setNewAdminNotes("");
    setIsAddingAdmin(false);
  };

  const handleUpdateAdminAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAdmin) return;
    setAdminSuccessMsg(null);
    setAdminErrorMsg(null);

    const cleanUser = editAdminUser.trim();
    if (!cleanUser) {
      setAdminErrorMsg("Admin username cannot be empty.");
      return;
    }

    const updated = await Promise.all(
      adminAccountsList.map(async (a) => {
        if (a.id === editingAdmin.id) {
          const pass = editAdminPass.trim() !== "" ? editAdminPass.trim() : ""; // blank keeps the stored password server-side
          return {
            ...a,
            username: cleanUser,
            password: pass,
            role: editAdminRole || "Super Admin",
            notes: editAdminNotes.trim(),
          };
        }
        return a;
      }),
    );

    await handleSaveAdminAccountsList(updated, `Updated admin portal credential "${cleanUser}".`);
    setEditingAdmin(null);
  };

  const handleDeleteAdminAccount = async (account: AdminAccount) => {
    if (adminAccountsList.length <= 1) {
      setAdminErrorMsg("Cannot delete the last admin account. At least one admin credential is required.");
      setAdminToDelete(null);
      return;
    }

    const updated = adminAccountsList.filter((a) => a.id !== account.id);
    await handleSaveAdminAccountsList(updated, `Deleted admin credential "${account.username}".`);
    setAdminToDelete(null);
  };

  const handleSyncAdminAccount = async (account: AdminAccount) => {
    setSyncingAdminId(account.id);
    try {
      await handleSaveAdminAccountsList(adminAccountsList, `Synchronized admin credential "${account.username}" across Firestore & Supabase.`);
    } finally {
      setSyncingAdminId(null);
    }
  };

  const handleSyncAllAdmins = async () => {
    await handleSaveAdminAccountsList(adminAccountsList, `Synchronized all ${adminAccountsList.length} admin accounts across Firestore & Supabase.`);
  };

  const handleOpen2FAModalForAdmin = (acc: AdminAccount) => {
    setTwoFactorModalAccount({
      type: "admin",
      id: acc.id,
      username: acc.username,
      enabled: !!acc.twoFactorEnabled,
      secret: acc.twoFactorSecret || "",
      backupCodes: acc.twoFactorBackupCodes || [],
    });
  };

  const handleOpen2FAModalForUser = (user: UserAccount) => {
    setTwoFactorModalAccount({
      type: "user",
      id: user.id,
      username: user.username,
      enabled: !!user.twoFactorEnabled,
      secret: user.twoFactorSecret || "",
      backupCodes: user.twoFactorBackupCodes || [],
    });
  };

  const handleSave2FA = async (newSecret: string, newBackupCodes: string[], enrollCode: string) => {
    if (!twoFactorModalAccount) return;
    const currentAdmin = localStorage.getItem("love_app_username") || "Admin";
    // The server only lets an account enrol itself, after re-authentication.
    await changeTwoFactor("enable", {
      secret: newSecret,
      backupCodes: newBackupCodes,
      enrollCode,
      targetUsername: twoFactorModalAccount.username,
      targetType: twoFactorModalAccount.type,
    });
    await logActivity(currentAdmin, "security_2fa_enabled", `Activated Two-Factor Authentication (TOTP RFC 6238) for "${twoFactorModalAccount.username}".`);
    setTwoFactorModalAccount((prev) => (prev ? { ...prev, enabled: true, secret: "", backupCodes: newBackupCodes } : null));
  };

  const handleDisable2FA = async () => {
    if (!twoFactorModalAccount) return;
    const currentAdmin = localStorage.getItem("love_app_username") || "Admin";
    await changeTwoFactor("disable", { targetUsername: twoFactorModalAccount.username, targetType: twoFactorModalAccount.type });
    await logActivity(currentAdmin, "security_2fa_disabled", `Disabled Two-Factor Authentication for "${twoFactorModalAccount.username}".`);
    setTwoFactorModalAccount(null);
  };

  const handleSaveSecuritySettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSecSuccessMsg(null);
    setSecErrorMsg(null);
    setIsSyncing(true);

    try {
      await saveAdminSettingDoc({
        id: "securityConfig",
        autoLogoutEnabled: secLogoutEnabled,
        autoLogoutMinutes: Number(secLogoutMinutes),
        loginLockoutSeconds: Number(secLockoutSeconds),
        loginMaxAttempts: Number(secMaxAttempts),
      });

      const currentAdmin = localStorage.getItem("love_app_username") || "Admin";
      await logActivity(currentAdmin, "admin_security_updated", `Configured security: auto-logout ${secLogoutEnabled ? "Enabled" : "Disabled"} (${secLogoutMinutes}m), login cooldown ${secLockoutSeconds}s after ${secMaxAttempts} attempts`);

      setSecSuccessMsg("Security settings updated successfully!");
      setTimeout(() => setSecSuccessMsg(null), 3000);
    } catch (err) {
      setSecErrorMsg("Failed to save security settings.");
      setTimeout(() => setSecErrorMsg(null), 3000);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSimulateTestAlert = async () => {
    try {
      const sampleIps = ["197.38.45.12", "156.204.88.3", "41.233.19.45", "102.189.72.10"];
      const randomIp = sampleIps[Math.floor(Math.random() * sampleIps.length)];
      const randomUser = ["Intruder_Probe", "Unknown_Visitor", "admin"][Math.floor(Math.random() * 3)];
      await logActivity(randomUser, "security_failed_login", `Failed login password attempt (4/5). IP: ${randomIp} | Late-night / Unusual Hour (03:42)`);
      setAdminSuccessMsg(`Simulated test security event recorded for "${randomUser}" from IP ${randomIp}!`);
      setTimeout(() => setAdminSuccessMsg(null), 3500);
    } catch {
      setAdminErrorMsg("Failed to log test security alert.");
      setTimeout(() => setAdminErrorMsg(null), 3000);
    }
  };

  return (
    <div id="admin_portal_container" className="min-h-screen bg-neutral-950 text-neutral-100 font-sans flex flex-col relative overflow-x-clip">
      {/* ATMOSPHERIC BACKGROUND BLOBS */}
      <div className="absolute top-[-200px] left-[-200px] w-[600px] h-[600px] bg-indigo-600/10 rounded-full blur-[150px] pointer-events-none z-0"></div>
      <div className="absolute top-[-200px] right-[-200px] w-[600px] h-[600px] bg-rose-600/10 rounded-full blur-[150px] pointer-events-none z-0"></div>

      {/* HEADER (PERMANENTLY FIXED ON SCROLL) */}
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-white/10 bg-neutral-950/95 backdrop-blur-2xl px-4 py-3 sm:px-6 shadow-2xl">
        <div className="max-w-[1600px] mx-auto flex flex-wrap justify-between items-center gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-indigo-400">
              <Home className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-serif text-xl font-bold tracking-tight text-white flex items-center gap-2">
                Our Home
                <span className="px-2 py-0.5 rounded-full text-[10px] uppercase font-mono tracking-wider bg-indigo-500/20 text-indigo-300 border border-indigo-500/25">Admin</span>
              </h1>
              <p className="text-[10px] text-neutral-400 font-mono tracking-widest uppercase mt-0.5">Central User & Credentials Console</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:gap-2.5 min-w-0">
            {/* INTEGRATED SECTION INDEX DROPDOWN */}
            <div className="relative">
              <button type="button" onClick={() => setIsSectionMenuOpen(!isSectionMenuOpen)} className="px-3 sm:px-3.5 py-2 rounded-xl border border-indigo-500/30 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 hover:text-white transition-all duration-200 text-xs font-semibold inline-flex items-center gap-2 cursor-pointer shadow-sm">
                <Compass className="w-4 h-4 text-indigo-400 shrink-0" />
                <span className="hidden md:inline font-mono text-[10px] uppercase tracking-wider text-indigo-300">Section Index:</span>
                <span className="max-w-[120px] sm:max-w-[160px] truncate text-white">{SECTION_LIST.find((s) => s.id === activeSectionId)?.label || "Overview & Stats"}</span>
                <ChevronDown className={`w-3.5 h-3.5 text-neutral-400 transition-transform duration-200 ${isSectionMenuOpen ? "rotate-180 text-white" : ""}`} />
              </button>

              {/* DROPDOWN MENU POPOVER */}
              <AnimatePresence>
                {isSectionMenuOpen && (
                  <>
                    {/* BACKDROP TO CLOSE */}
                    <div className="fixed inset-0 z-40" onClick={() => setIsSectionMenuOpen(false)} />

                    <motion.div initial={{ opacity: 0, y: 8, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: 0.95 }} className="absolute right-0 top-full mt-2 w-72 bg-neutral-900/95 border border-white/15 rounded-2xl p-3 shadow-2xl backdrop-blur-2xl ring-1 ring-white/10 space-y-1 z-50 max-h-[75vh] overflow-y-auto scrollbar-thin scrollbar-thumb-white/10">
                      <div className="px-2 py-1.5 mb-1 border-b border-white/10 flex items-center justify-between">
                        <span className="text-[10px] font-mono text-neutral-400 uppercase tracking-wider">Jump to Section</span>
                        <span className="text-[9px] font-mono text-indigo-400 font-bold">{SECTION_LIST.length} Sections</span>
                      </div>

                      {SECTION_LIST.map((sec, idx) => {
                        const SecIcon = sec.icon;
                        const isActive = activeSectionId === sec.id;
                        return (
                          <button
                            key={`admin-sec-item-${sec.id}-${idx}`}
                            type="button"
                            onClick={() => {
                              setIsSectionMenuOpen(false);
                              if (sec.id === "overview_section") {
                                window.scrollTo({ top: 0, behavior: "smooth" });
                                setActiveSectionId("overview_section");
                              } else {
                                const el = document.getElementById(sec.id);
                                if (el) {
                                  el.scrollIntoView({ behavior: "smooth", block: "start" });
                                  setActiveSectionId(sec.id);
                                }
                              }
                            }}
                            className={`w-full flex items-center justify-between p-2 rounded-xl text-xs transition-all text-left cursor-pointer group ${isActive ? "bg-gradient-to-r from-indigo-600/30 via-purple-600/20 to-indigo-600/10 border border-indigo-500/50 text-white font-semibold shadow-lg shadow-indigo-500/10" : "text-neutral-400 hover:text-white hover:bg-white/5 border border-transparent"}`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <div className={`p-1 rounded-lg border transition-all shrink-0 ${isActive ? "bg-indigo-500 text-white border-indigo-400" : "bg-neutral-950 border-white/10 text-neutral-400 group-hover:text-indigo-300"}`}>
                                <SecIcon className="w-3.5 h-3.5" />
                              </div>
                              <span className="truncate text-[11px]">{sec.label}</span>
                            </div>
                            {"count" in sec && sec.count !== undefined && <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded-md border shrink-0 ${isActive ? "bg-indigo-500/20 text-indigo-200 border-indigo-500/30" : "bg-neutral-950 text-neutral-500 border-white/5"}`}>{sec.count}</span>}
                          </button>
                        );
                      })}
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>

            <button onClick={handleSyncAllSupabaseData} disabled={isSyncingAllData || isSyncing} className="px-3 py-2 rounded-xl border border-teal-500/30 bg-teal-500/10 hover:bg-teal-500/20 text-teal-300 hover:text-teal-100 transition-all duration-200 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer shadow-sm disabled:opacity-50" title="Sync All Data & Sections to Database">
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncingAllData || isSyncing ? "animate-spin text-teal-300" : "text-teal-400"}`} />
              <span className="hidden sm:inline">{isSyncingAllData ? "Syncing All..." : "Sync All Data"}</span>
            </button>

            <button aria-label="Fix DB / SQL Script" onClick={() => setShowSqlSetupModal(true)} className="px-3 py-2 rounded-xl border border-indigo-500/40 bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-200 hover:text-white transition-all duration-200 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer shadow-sm" title="View full Supabase SQL Schema Setup Script">
              <Code className="w-3.5 h-3.5 text-indigo-300" />
              <span className="hidden sm:inline">Fix DB / SQL Script</span>
            </button>
            <button title="Lock Panel" aria-label="Lock Panel" onClick={onLogout} className="px-3.5 py-2 rounded-xl text-xs font-semibold uppercase tracking-wider inline-flex items-center gap-1.5 transition-all cursor-pointer text-rose-400 hover:text-rose-300 hover:bg-rose-950/20 border border-rose-900/10 shadow-sm">
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden min-[420px]:inline">Lock Panel</span>
            </button>
          </div>
        </div>
      </header>

      {/* MAIN CONTAINER */}
      <main className="relative z-10 flex-1 max-w-[1600px] w-full mx-auto px-4 sm:px-6 pt-20 pb-6 flex flex-col gap-6">
        {/* GLOBAL SYNC NOTIFICATION TOAST */}
        <AnimatePresence>
          {syncDataSummary && (
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="w-full p-3.5 bg-gradient-to-r from-teal-950/90 via-emerald-950/90 to-neutral-950/90 border border-teal-500/40 backdrop-blur-md rounded-2xl text-xs text-teal-200 shadow-2xl flex flex-col gap-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-teal-300 font-bold">
                  <CheckCircle className="w-4 h-4 text-teal-400 shrink-0" />
                  <span>All Tables & Sections Synchronized to Database</span>
                </div>
                <button onClick={() => setSyncDataSummary(null)} className="p-1 hover:bg-teal-500/20 rounded-md transition-all cursor-pointer text-neutral-400 hover:text-white shrink-0" title="Close notification">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 text-[10px]">
                <div className="bg-black/40 p-2 rounded-xl border border-teal-500/20 flex flex-col items-center">
                  <span className="text-neutral-400">Questions</span>
                  <strong className="text-teal-300 text-xs mt-0.5">{syncDataSummary?.coupleQuestionsSynced ?? 0}</strong>
                </div>
                <div className="bg-black/40 p-2 rounded-xl border border-teal-500/20 flex flex-col items-center">
                  <span className="text-neutral-400">Date Plans</span>
                  <strong className="text-teal-300 text-xs mt-0.5">{syncDataSummary?.datePlansSynced ?? 0}</strong>
                </div>
                <div className="bg-black/40 p-2 rounded-xl border border-teal-500/20 flex flex-col items-center">
                  <span className="text-neutral-400">Letters</span>
                  <strong className="text-teal-300 text-xs mt-0.5">{syncDataSummary?.lettersSynced ?? 0}</strong>
                </div>
                <div className="bg-black/40 p-2 rounded-xl border border-teal-500/20 flex flex-col items-center">
                  <span className="text-neutral-400">Memories</span>
                  <strong className="text-teal-300 text-xs mt-0.5">{syncDataSummary?.memoriesSynced ?? 0}</strong>
                </div>
                <div className="bg-black/40 p-2 rounded-xl border border-teal-500/20 flex flex-col items-center">
                  <span className="text-neutral-400">Milestones</span>
                  <strong className="text-teal-300 text-xs mt-0.5">{syncDataSummary?.milestonesSynced ?? 0}</strong>
                </div>
                <div className="bg-black/40 p-2 rounded-xl border border-teal-500/20 flex flex-col items-center">
                  <span className="text-neutral-400">Users</span>
                  <strong className="text-teal-300 text-xs mt-0.5">{syncDataSummary?.userAccountsSynced ?? 0}</strong>
                </div>
                <div className="bg-black/40 p-2 rounded-xl border border-teal-500/20 flex flex-col items-center">
                  <span className="text-neutral-400">Settings</span>
                  <strong className="text-teal-300 text-xs mt-0.5">{syncDataSummary?.adminSettingsSynced ?? 0}</strong>
                </div>
              </div>

              {syncDataSummary?.errors && syncDataSummary.errors.length > 0 && (
                <div className="mt-1 pt-1.5 border-t border-teal-500/20 text-[10px] text-rose-300 space-y-0.5 max-h-20 overflow-y-auto">
                  <span className="font-semibold text-rose-400">Sync Notices:</span>
                  {syncDataSummary.errors.map((err, idx) => (
                    <p key={`sync-summary-err-${idx}`} className="truncate">
                      • {err}
                    </p>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* STATS SUMMARY BANNER (OVERVIEW & STATS TOP SECTION) */}
        <div id="overview_section" className="w-full bg-neutral-900/60 border border-white/10 rounded-3xl p-5 shadow-xl backdrop-blur-xl transition-all hover:border-white/15 scroll-mt-24">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3.5">
            {/* CARD 1: MANAGED USERS */}
            <div className="bg-neutral-900/60 border border-white/10 rounded-xl p-3 sm:p-3.5 flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-[10px] text-neutral-400 uppercase tracking-widest font-mono truncate">Managed Users</p>
                <h3 className="text-lg sm:text-xl font-bold text-white mt-0.5">{userAccounts.length}</h3>
                <p className="text-[9px] text-neutral-500 truncate">Registered Accounts</p>
              </div>
              <div className="p-2 bg-indigo-500/10 border border-indigo-500/20 rounded-lg text-indigo-400 shrink-0">
                <Users className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>
            </div>

            {/* CARD 2: FIRESTORE DATABASE STATUS */}
            <div className="bg-neutral-900/60 border border-white/10 rounded-xl p-3 sm:p-3.5 flex items-center justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="text-[10px] text-neutral-400 uppercase tracking-widest font-mono truncate">Firebase DB</p>
                  <button onClick={() => refreshDbStatus()} disabled={isCheckingDb} title="Ping & refresh connection status" className="p-0.5 rounded hover:bg-white/10 text-neutral-400 hover:text-white transition-all cursor-pointer">
                    <RefreshCw className={`w-2.5 h-2.5 ${isCheckingDb ? "animate-spin text-indigo-400" : ""}`} />
                  </button>
                </div>
                <div className="mt-1 flex items-center gap-1.5">
                  <span className="relative flex h-2 w-2">
                    {dbStatus.firebase.online && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>}
                    <span className={`relative inline-flex rounded-full h-2 w-2 ${dbStatus.firebase.online ? "bg-emerald-500" : "bg-rose-500"}`}></span>
                  </span>
                  <h3 className={`text-xs font-semibold flex items-center gap-1 truncate ${dbStatus.firebase.online ? "text-emerald-400" : "text-rose-400"}`}>
                    {dbStatus.firebase.online ? (
                      <>
                        <ShieldCheck className="w-3.5 h-3.5" /> Connected
                      </>
                    ) : (
                      <>
                        <ShieldAlert className="w-3.5 h-3.5" /> Offline
                      </>
                    )}
                  </h3>
                </div>
              </div>
              <div className={`p-2 rounded-lg border shrink-0 ${dbStatus.firebase.online ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" : "bg-rose-500/10 border-rose-500/20 text-rose-400"}`}>
                <Database className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>
            </div>

            {/* CARD 3: SUPABASE DATABASE STATUS */}
            <div className="bg-neutral-900/60 border border-white/10 rounded-xl p-3 sm:p-3.5 flex items-center justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="text-[10px] text-neutral-400 uppercase tracking-widest font-mono truncate">Supabase DB</p>
                  <button onClick={() => refreshDbStatus()} disabled={isCheckingDb} title="Ping & refresh connection status" className="p-0.5 rounded hover:bg-white/10 text-neutral-400 hover:text-white transition-all cursor-pointer">
                    <RefreshCw className={`w-2.5 h-2.5 ${isCheckingDb ? "animate-spin text-indigo-400" : ""}`} />
                  </button>
                </div>
                <div className="mt-1 flex items-center gap-1.5">
                  <span className="relative flex h-2 w-2">
                    {dbStatus.supabase.online && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>}
                    <span className={`relative inline-flex rounded-full h-2 w-2 ${dbStatus.supabase.online ? "bg-emerald-500" : dbStatus.supabase.configured ? "bg-amber-500" : "bg-neutral-500"}`}></span>
                  </span>
                  <h3 className={`text-xs font-semibold flex items-center gap-1 truncate ${dbStatus.supabase.online ? "text-emerald-400" : dbStatus.supabase.configured ? "text-amber-400" : "text-neutral-400"}`}>
                    {dbStatus.supabase.online ? (
                      <>
                        <ShieldCheck className="w-3.5 h-3.5" /> Connected
                      </>
                    ) : dbStatus.supabase.configured ? (
                      <>
                        <ShieldAlert className="w-3.5 h-3.5" /> Unreachable
                      </>
                    ) : (
                      <>
                        <ShieldAlert className="w-3.5 h-3.5" /> Local Mode
                      </>
                    )}
                  </h3>
                </div>
              </div>
              <div className={`p-2 rounded-lg border shrink-0 ${dbStatus.supabase.online ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" : dbStatus.supabase.configured ? "bg-amber-500/10 border-amber-500/20 text-amber-400" : "bg-neutral-800 border-neutral-700 text-neutral-400"}`}>
                <Database className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>
            </div>

            {/* CARD 4: SECURITY MODEL */}
            <div className="bg-neutral-900/60 border border-white/10 rounded-xl p-3 sm:p-3.5 flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-[10px] text-neutral-400 uppercase tracking-widest font-mono truncate">Security Model</p>
                <h3 className="text-xs font-semibold text-indigo-400 mt-1 flex items-center gap-1 truncate">
                  <Lock className="w-3.5 h-3.5 shrink-0" /> Granular Access
                </h3>
                <p className="text-[9px] text-neutral-500 truncate">Role & Permission Rules</p>
              </div>
              <div className="p-2 bg-indigo-500/10 border border-indigo-500/20 rounded-lg text-indigo-400 shrink-0">
                <KeyRound className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>
            </div>
          </div>
        </div>

        {/* MILESTONES & COUNTDOWN MANAGER SECTION */}
        <MilestonesCountdownManager totalMilestonesCount={syncDataSummary?.milestonesSynced ?? 0} countdownConfig={countdownConfig} milestoneQuotas={milestoneQuotas} coupleTenants={allLinkedCoupleTenants} onSaveCountdownConfig={handleSaveCountdownConfigFromManager} onSaveMilestoneQuotas={handleSaveMilestoneQuotasFromManager} isSyncing={isSyncing} />

        {/* USER MANAGEMENT CARD */}
        <div id="users_section" className="bg-neutral-900/60 border border-white/10 rounded-3xl p-6 sm:p-7 relative shadow-xl backdrop-blur-xl transition-all hover:border-white/15 scroll-mt-24">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2.5 bg-indigo-500/15 border border-indigo-500/25 rounded-2xl text-indigo-400 shadow-inner">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-serif font-bold text-white tracking-wide">Website User Accounts</h2>
              <p className="text-[11px] text-neutral-400 font-mono mt-0.5">User accounts, passwords & access rules</p>
            </div>
          </div>

          {/* Error & Success Feedback */}
          <AnimatePresence>
            {userSuccessMsg && (
              <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-xs text-emerald-300 flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <span>{userSuccessMsg}</span>
              </motion.div>
            )}
            {userErrorMsg && (
              <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mb-4 p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs text-rose-300 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
                <span>{userErrorMsg}</span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Quick Action: Connect Couple Partners Button */}
          <div className="mb-6 flex items-center justify-between bg-gradient-to-r from-pink-500/10 via-rose-500/10 to-indigo-500/10 border border-pink-500/20 p-4 rounded-2xl">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-pink-500/20 rounded-xl text-pink-400">
                <HeartHandshake className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-xs font-semibold text-white uppercase tracking-wider font-mono">Couple & Partner Management</h3>
                <p className="text-[11px] text-neutral-400">Pair users together into couple tenants to connect their partners</p>
              </div>
            </div>
            <button type="button" onClick={() => setIsPairingCouple(!isPairingCouple)} className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-pink-500/20 hover:bg-pink-500/30 text-pink-300 border border-pink-500/30 transition-all flex items-center gap-1.5 cursor-pointer shadow-sm">
              <Link className="w-3.5 h-3.5" />
              <span>{isPairingCouple ? "Close Partner Linker" : "Connect Partners"}</span>
            </button>
          </div>

          {/* Connect Couple Partners Box */}
          <AnimatePresence>
            {isPairingCouple && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="mb-8 p-5 bg-pink-950/20 border border-pink-500/30 rounded-2xl space-y-4 overflow-hidden">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-pink-300 uppercase tracking-widest font-mono flex items-center gap-2">
                    <HeartHandshake className="w-4 h-4 text-pink-400" />
                    Link Two Users as Connected Partners
                  </h3>
                  <button type="button" onClick={() => setIsPairingCouple(false)} className="text-neutral-400 hover:text-white p-1 rounded-lg">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <form onSubmit={handleConnectCoupleTenant} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] text-pink-300 uppercase tracking-wider font-mono">Select Partner 1</label>
                      <select value={pairPartner1} onChange={(e) => setPairPartner1(e.target.value)} className="w-full bg-neutral-950/90 border border-pink-500/30 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-pink-500" required>
                        <option value="">-- Choose First Partner --</option>
                        {userAccounts
                          .filter((u) => !isUserConnectedToPartner(u.username, pairPartner2))
                          .map((u, idx) => (
                            <option key={`pair-p1-${u.id || u.username}-${idx}`} value={u.username}>
                              👤 {u.username}
                            </option>
                          ))}
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] text-pink-300 uppercase tracking-wider font-mono">Select Partner 2</label>
                      <select value={pairPartner2} onChange={(e) => setPairPartner2(e.target.value)} className="w-full bg-neutral-950/90 border border-pink-500/30 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-pink-500" required>
                        <option value="">-- Choose Second Partner --</option>
                        {userAccounts
                          .filter((u) => u.username !== pairPartner1 && !isUserConnectedToPartner(u.username, pairPartner1))
                          .map((u, idx) => (
                            <option key={`pair-p2-${u.id || u.username}-${idx}`} value={u.username}>
                              👤 {u.username}
                            </option>
                          ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] text-pink-300 uppercase tracking-wider font-mono">Couple Display Name (Optional)</label>
                      <input type="text" value={pairCoupleName} onChange={(e) => setPairCoupleName(e.target.value)} placeholder="e.g. Alex & Sam" className="w-full bg-neutral-950/90 border border-pink-500/30 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-pink-500" />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] text-pink-300 uppercase tracking-wider font-mono">Subscription Plan</label>
                      <select value={pairPlan} onChange={(e) => setPairPlan(e.target.value)} className="w-full bg-neutral-950/90 border border-pink-500/30 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-pink-500">
                        {subscriptionPlans.map((plan, idx) => (
                          <option key={`pair-plan-${plan.id}-${idx}`} value={plan.id}>
                            {plan.name} ({plan.price})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="flex justify-end pt-2">
                    <button type="submit" disabled={isSyncing} className="bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500 text-white font-semibold text-xs py-2.5 px-5 rounded-xl transition-all cursor-pointer flex items-center gap-2 shadow-lg disabled:opacity-50">
                      <HeartHandshake className="w-4 h-4" />
                      <span>Link Partners & Create Couple Tenant</span>
                    </button>
                  </div>
                </form>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Create / Edit Form */}
          <div className="mb-8 p-5 bg-neutral-950/40 border border-white/5 rounded-2xl">
            {editingUser ? (
              <form onSubmit={handleUpdateUserPassword} className="space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-xs font-semibold text-indigo-300 uppercase tracking-widest font-mono">
                    Edit Account Details for: <span className="text-white capitalize">{editingUser.username}</span>
                  </h3>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingUser(null);
                      setEditingPassword("");
                      setEditingUserCoupleId("");
                      setUserErrorMsg(null);
                    }}
                    className="text-xs text-neutral-400 hover:text-white transition-all"
                  >
                    Cancel Edit
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] text-neutral-400 uppercase tracking-wider font-mono">New Password</label>
                    <div className="relative">
                      <input type={showEditUserPassword ? "text" : "password"} value={editingPassword} onChange={(e) => setEditingPassword(e.target.value)} placeholder="Optional new password" className="w-full bg-neutral-950/80 border border-white/10 rounded-xl px-3 py-2 pr-9 text-sm text-white focus:outline-none focus:border-indigo-500/60" />
                      <button type="button" onClick={() => setShowEditUserPassword(!showEditUserPassword)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white transition-colors p-0.5" title={showEditUserPassword ? "Hide password" : "Show password"}>
                        {showEditUserPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                    <p className="text-[11px] text-neutral-400 mt-1">Leave blank to keep the current password.</p>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] text-neutral-400 uppercase tracking-wider font-mono">Gender</label>
                    <select value={editingUserGender} onChange={(e) => setEditingUserGender(e.target.value)} className="w-full bg-neutral-950/80 border border-indigo-500/30 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500">
                      <option value="male">Male 👨</option>
                      <option value="female">Female 👩</option>
                      <option value="other">Other 🧑</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] text-neutral-400 uppercase tracking-wider font-mono">Subscription Plan</label>
                    <select value={editingUserPlan} onChange={(e) => setEditingUserPlan(e.target.value)} className="w-full bg-neutral-950/80 border border-indigo-500/30 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500">
                      {subscriptionPlans.map((plan, idx) => (
                        <option key={`edit-user-plan-${plan.id}-${idx}`} value={plan.id}>
                          {plan.name} ({plan.price})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] text-neutral-400 uppercase tracking-wider font-mono">Couple Tenant ID</label>
                    <input type="text" value={editingUserCoupleId} onChange={(e) => setEditingUserCoupleId(e.target.value)} placeholder={editingUser.coupleId || "e.g., couple_12345"} className="w-full bg-neutral-950/80 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500/60 font-mono" />
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button type="submit" disabled={isSyncing} className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs py-2 px-5 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-md disabled:opacity-50 h-10">
                    <CheckCircle className="w-3.5 h-3.5" />
                    Save Account Changes
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleCreateUser} className="space-y-4">
                <h3 className="text-xs font-semibold text-indigo-300 uppercase tracking-widest font-mono flex items-center gap-1.5">
                  <UserPlus className="w-3.5 h-3.5" />
                  Create New Website User
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] text-neutral-400 uppercase tracking-wider font-mono">Username</label>
                    <input type="text" value={newUsername} onChange={(e) => setNewUsername(e.target.value)} placeholder="e.g. alex" className="w-full bg-neutral-950/80 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500/60" required />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] text-neutral-400 uppercase tracking-wider font-mono">Secret Password</label>
                    <div className="relative">
                      <input type={showNewUserPassword ? "text" : "password"} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Secret code" className="w-full bg-neutral-950/80 border border-white/10 rounded-xl px-3 py-2 pr-9 text-sm text-white focus:outline-none focus:border-indigo-500/60" required />
                      <button type="button" onClick={() => setShowNewUserPassword(!showNewUserPassword)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white transition-colors p-0.5" title={showNewUserPassword ? "Hide password" : "Show password"}>
                        {showNewUserPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] text-neutral-400 uppercase tracking-wider font-mono">Gender</label>
                    <select value={newUserGender} onChange={(e) => setNewUserGender(e.target.value)} className="w-full bg-neutral-950/80 border border-indigo-500/30 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500">
                      <option value="male">Male 👨</option>
                      <option value="female">Female 👩</option>
                      <option value="other">Other 🧑</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] text-neutral-400 uppercase tracking-wider font-mono">Subscription Plan</label>
                    <select value={newUserPlan} onChange={(e) => setNewUserPlan(e.target.value)} className="w-full bg-neutral-950/80 border border-indigo-500/30 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500">
                      {subscriptionPlans.map((plan, idx) => (
                        <option key={`new-user-plan-${plan.id}-${idx}`} value={plan.id}>
                          {plan.name} ({plan.price})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] text-neutral-400 uppercase tracking-wider font-mono">Connect Partner (Optional)</label>
                    <select value={newUserPartner} onChange={(e) => setNewUserPartner(e.target.value)} className="w-full bg-neutral-950/80 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500/60">
                      <option value="">None (Unlinked Single)</option>
                      {userAccounts
                        .filter((u) => !isUserConnectedToPartner(u.username))
                        .map((u, idx) => (
                          <option key={`new-user-partner-${u.id || u.username}-${idx}`} value={u.username}>
                            💕 Pair with {u.username}
                          </option>
                        ))}
                    </select>
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button type="submit" disabled={isSyncing} className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs py-2 px-5 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-md disabled:opacity-50 h-10">
                    <UserPlus className="w-3.5 h-3.5" />
                    Create Account
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* List of Accounts */}
          <div className="space-y-3">
            <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
              <h3 className="text-xs font-semibold text-neutral-400 uppercase tracking-widest font-mono">Active User Accounts</h3>
              <div className="flex items-center gap-2 flex-wrap">
                <button type="button" onClick={handleSyncAllUsers} disabled={isSyncing} className="text-[11px] text-sky-400 hover:text-sky-300 font-mono flex items-center gap-1.5 bg-sky-500/10 px-2.5 py-1 rounded-lg border border-sky-500/20 transition-all cursor-pointer disabled:opacity-50" title="Sync and push all user accounts to Firestore & Supabase">
                  <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? "animate-spin" : ""}`} />
                  <span>Sync All Users</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const next = !showAllUserPasswords;
                    setShowAllUserPasswords(next);
                    if (!next) {
                      setVisiblePasswordIds({});
                    }
                  }}
                  className="text-[11px] text-indigo-400 hover:text-indigo-300 font-mono flex items-center gap-1.5 bg-indigo-500/10 px-2.5 py-1 rounded-lg border border-indigo-500/20 transition-all cursor-pointer"
                >
                  {showAllUserPasswords ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  <span>{showAllUserPasswords ? "Hide All Passwords" : "Show All Passwords"}</span>
                </button>
              </div>
            </div>

            {userAccounts.length === 0 ? (
              <div className="text-center py-6 text-neutral-500 text-xs font-mono">Loading user accounts...</div>
            ) : (
              <div className="divide-y divide-white/5 border border-white/10 rounded-2xl overflow-hidden bg-neutral-950/20">
                {(() => {
                  const seen = new Set<string>();
                  const uniqueUsers = userAccounts.filter((u) => {
                    const key = (u.id || u.username || "").toLowerCase().trim();
                    if (!key || seen.has(key)) return false;
                    seen.add(key);
                    return true;
                  });
                  return uniqueUsers.map((user, uIdx) => {
                    const isPasswordVisible = showAllUserPasswords || !!visiblePasswordIds[user.id];

                    // Find matching tenant for this user
                    const tenant = findTenantForUser(user, allLinkedCoupleTenants);

                    const partnerName = partnerNameFor(user, userAccounts, allLinkedCoupleTenants);

                    return (
                      <div key={`user-row-${user.id || user.username}-${uIdx}`} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-white/5 transition-all">
                        <div className="flex items-start gap-3">
                          <div className="w-9 h-9 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 font-mono text-xs uppercase font-semibold flex-shrink-0 mt-0.5">{user.username.charAt(0)}</div>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-semibold text-white capitalize">{user.username}</p>
                              {user.gender && <span className="text-[10px] font-mono text-purple-300 bg-purple-500/15 border border-purple-500/30 px-2 py-0.5 rounded-md capitalize">{user.gender === "male" ? "👨 Male" : user.gender === "female" ? "👩 Female" : `🧑 ${user.gender}`}</span>}
                              {user.coupleId && <span className="text-[10px] font-mono text-neutral-400 bg-neutral-800 px-2 py-0.5 rounded-md border border-neutral-700">ID: {user.coupleId}</span>}
                            </div>

                            <div className="flex items-center gap-2 mt-1">
                              <p className="text-xs text-neutral-500 font-mono flex items-center gap-1">
                                <span>Password:</span>
                                <span className="text-indigo-300 font-sans tracking-wide">{isPasswordVisible ? (user.password?.startsWith("sha256_v1:") ? "🔒 [SHA-256 Hashed]" : user.password || "••••••••") : "••••••••"}</span>
                              </p>
                              <button
                                type="button"
                                onClick={() =>
                                  setVisiblePasswordIds((prev) => ({
                                    ...prev,
                                    [user.id]: !isPasswordVisible,
                                  }))
                                }
                                className="p-1 text-neutral-500 hover:text-indigo-300 hover:bg-white/5 rounded transition-all cursor-pointer"
                                title={isPasswordVisible ? "Hide password" : "Show password"}
                              >
                                {isPasswordVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                              </button>
                            </div>

                            {/* Relationship & Partner Badge */}
                            <div className="mt-2 flex items-center gap-2 flex-wrap">
                              {partnerName ? (
                                <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-pink-500/15 border border-pink-500/30 text-pink-300 px-2.5 py-0.5 rounded-full shadow-sm">
                                  <Heart className="w-3 h-3 fill-pink-400 text-pink-400" />
                                  <span>
                                    Partner: <strong className="capitalize text-white">{partnerName}</strong>
                                  </span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[10px] font-mono bg-neutral-800/80 border border-neutral-700/50 text-neutral-400 px-2 py-0.5 rounded-full">
                                  <span>Single / Unlinked User</span>
                                </span>
                              )}

                              {tenant && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-mono bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded-full">
                                  <span>
                                    Couple: {tenant.coupleName} ({tenant.plan.toUpperCase()})
                                  </span>
                                </span>
                              )}

                              {user.twoFactorEnabled ? (
                                <button type="button" onClick={() => handleOpen2FAModalForUser(user)} className="inline-flex items-center gap-1 text-[10px] font-mono bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 px-2 py-0.5 rounded-full hover:bg-emerald-500/25 transition-colors cursor-pointer" title="2FA Protected - Click to manage">
                                  <ShieldCheck className="w-3 h-3 text-emerald-400" />
                                  <span>2FA Active</span>
                                </button>
                              ) : (
                                <button type="button" onClick={() => handleOpen2FAModalForUser(user)} className="inline-flex items-center gap-1 text-[10px] font-mono bg-neutral-800/80 border border-neutral-700/50 text-neutral-400 hover:text-white px-2 py-0.5 rounded-full hover:bg-white/5 transition-colors cursor-pointer" title="Setup 2FA for this user">
                                  <KeyRound className="w-2.5 h-2.5 text-neutral-500" />
                                  <span>2FA Off</span>
                                </button>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 self-end sm:self-center">
                          <button type="button" onClick={() => handleOpen2FAModalForUser(user)} className={`p-1.5 rounded-lg border transition-all cursor-pointer ${user.twoFactorEnabled ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20" : "border-white/10 text-neutral-400 hover:text-white hover:bg-white/5"}`} title={user.twoFactorEnabled ? "2FA Protected - Click to manage" : "Setup 2FA for this user"}>
                            <ShieldCheck className="w-3.5 h-3.5" />
                          </button>
                          {!partnerName && (
                            <button
                              type="button"
                              onClick={() => {
                                setIsPairingCouple(true);
                                setPairPartner1(user.username);
                              }}
                              className="text-xs px-2.5 py-1 rounded-lg border border-pink-500/30 bg-pink-500/10 hover:bg-pink-500/20 text-pink-300 font-mono flex items-center gap-1 transition-all cursor-pointer"
                              title={`Connect partner for ${user.username}`}
                            >
                              <Link className="w-3 h-3" />
                              <span>Link Partner</span>
                            </button>
                          )}
                          <button onClick={() => handleSyncUser(user)} disabled={isSyncing || syncingUserId === user.id} className="p-1.5 rounded-lg border border-sky-500/20 hover:bg-sky-500/10 text-sky-400 hover:text-sky-300 transition-all cursor-pointer" title={`Sync "${user.username}" to Firestore & Supabase`}>
                            <RefreshCw className={`w-3.5 h-3.5 ${syncingUserId === user.id ? "animate-spin text-sky-300" : ""}`} />
                          </button>
                          <button
                            onClick={() => {
                              setEditingUser(user);
                              setEditingPassword("");
                              setEditingUserCoupleId(user.coupleId || "");
                              setEditingUserGender(user.gender || "male");
                              const userTenant = allLinkedCoupleTenants.find((t) => t.coupleId === user.coupleId);
                              setEditingUserPlan(userTenant?.plan || "free");
                            }}
                            className="p-1.5 rounded-lg border border-white/10 hover:bg-white/5 text-neutral-400 hover:text-white transition-all cursor-pointer"
                            title="Edit Account Details"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => setUserToDelete(user)} className="p-1.5 rounded-lg border border-rose-900/10 hover:bg-rose-950/20 text-neutral-500 hover:text-rose-400 transition-all cursor-pointer" title="Delete Account">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            )}
          </div>

          {/* Active & Linked Couple Tenants Section */}
          <div id="tenants_section" className="mt-8 pt-6 border-t border-white/10 space-y-4 scroll-mt-24">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-xs font-semibold text-pink-300 uppercase tracking-widest font-mono flex items-center gap-1.5">
                  <HeartHandshake className="w-4 h-4 text-pink-400" />
                  Couple Spaces: linked and unlinked status ({allLinkedCoupleTenants.length})
                </h3>
                <p className="text-[11px] text-neutral-400 font-mono mt-0.5">Shows every stored couple space. "No accounts currently linked" only means no loaded account points at it now; it does not show whether the space holds data.</p>
              </div>

              {allLinkedCoupleTenants.some((t) => !t.isFromDatabase) && (
                <button type="button" onClick={handleSyncAllMissingTenantsToDb} disabled={isSyncing} className="text-xs text-amber-300 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 font-mono cursor-pointer self-start sm:self-auto active:scale-95 shadow-sm" title="Save missing detected couple tenants to Firestore & Supabase database">
                  <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? "animate-spin" : ""}`} />
                  <span>Sync Missing Tenants to DB</span>
                </button>
              )}
            </div>

            {allLinkedCoupleTenants.length === 0 ? (
              <div className="p-4 bg-neutral-950/40 border border-white/5 rounded-2xl text-center text-xs text-neutral-500 font-mono">No linked couples found. Use the "Connect / Pair Partners" button above to link two user accounts!</div>
            ) : (
              <div className="grid grid-cols-1 gap-3">
                {allLinkedCoupleTenants.map((tenant, index) => (
                  <CoupleTenantRow
                    key={`tenant-${tenant.coupleId}-${index}`}
                    tenant={tenant}
                    unlinkedSpace={isSpaceUnlinked(tenant, userAccounts, accountsLoaded)}
                    isSyncing={isSyncing}
                    accountsLoaded={accountsLoaded}
                    subscriptionPlans={subscriptionPlans}
                    getStatus={getSubscriptionStatus}
                    onSetPlan={handleSetTenantPlan}
                    onUnlink={handleUnlinkCouple}
                    onSaveToDb={async (t) => {
                      setIsSyncing(true);
                      try {
                        await saveCoupleTenantDoc({
                          coupleId: t.coupleId,
                          coupleName: t.coupleName,
                          partner1: t.partner1,
                          partner2: t.partner2,
                          plan: t.plan || "free",
                          created_at: t.created_at || new Date().toISOString(),
                        });
                        setUserSuccessMsg(`Persisted couple tenant "${t.coupleName}" to database!`);
                        setTimeout(() => setUserSuccessMsg(null), 3000);
                      } catch (err) {
                        setUserErrorMsg("Failed to save tenant to DB.");
                      } finally {
                        setIsSyncing(false);
                      }
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* USER ACTIVITY LOGS PANEL */}
        <div id="activity_logs_section" className="bg-neutral-900/60 border border-white/10 rounded-3xl p-6 sm:p-7 relative shadow-xl backdrop-blur-xl transition-all hover:border-white/15 scroll-mt-24">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-indigo-500/15 border border-indigo-500/25 rounded-2xl text-indigo-400 shadow-inner">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-serif font-bold text-white tracking-wide">Live Website Activity Logs</h2>
                <p className="text-[11px] text-neutral-400 font-mono mt-0.5">Real-time session auditing & tracking</p>
              </div>
            </div>

            {/* Search input */}
            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
              <input type="text" placeholder="Filter logs by user or action..." value={logSearchQuery} onChange={(e) => setLogSearchQuery(e.target.value)} className="w-full bg-neutral-950/80 border border-white/10 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-indigo-500/60" />
            </div>
          </div>

          {/* Logs Table / List */}
          <div className="border border-white/10 rounded-2xl overflow-hidden bg-neutral-950/20">
            <div className="max-h-[450px] overflow-y-auto no-scrollbar divide-y divide-white/5">
              {(() => {
                const filteredLogs = logs.filter((l) => {
                  const query = logSearchQuery.toLowerCase().trim();
                  if (!query) return true;
                  return l.username.toLowerCase().includes(query) || l.action.toLowerCase().includes(query) || l.details.toLowerCase().includes(query);
                });

                if (filteredLogs.length === 0) {
                  return <div className="p-12 text-center text-xs text-neutral-500 font-mono">{logs.length === 0 ? "No activity logs found. Try performing actions on the website!" : "No matching logs found."}</div>;
                }

                return filteredLogs.map((log, index) => {
                  const formattedDate = new Date(log.timestamp).toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  });

                  return (
                    <div key={`log-${log.id || "log"}-${index}`} className="p-3 sm:p-4 hover:bg-white/5 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 p-1.5 bg-white/5 rounded-lg border border-white/10 flex items-center justify-center shrink-0">{getLogIcon(log.action)}</div>
                        <div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-semibold text-white capitalize">{log.username}</span>
                            <span className="px-1.5 py-0.5 rounded bg-indigo-950/60 text-indigo-300 font-mono text-[9px] uppercase tracking-wider border border-indigo-900/30">{log.action.replace(/_/g, " ")}</span>
                          </div>
                          <p className="text-neutral-400 mt-1 leading-relaxed break-all font-sans">{log.details}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 text-[10px] text-neutral-500 font-mono shrink-0">
                        <Clock className="w-3 h-3 text-neutral-600" />
                        <span>{formattedDate}</span>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>

          <div className="mt-4 text-[10px] text-neutral-500 font-mono flex items-center justify-between">
            <span>Showing {logs.length} total logged events</span>
            <span>Central Audit System</span>
          </div>
        </div>

        {/* SECURITY LOGS & THREAT INTELLIGENCE DASHBOARD */}
        <div id="security_threats_section" className="bg-neutral-900/60 border border-white/10 rounded-3xl p-5 sm:p-7 relative shadow-xl backdrop-blur-xl transition-all hover:border-white/15 scroll-mt-24">
          <SecurityLogsDashboard
            activityLogs={logs}
            defaultCollapsed={true}
            onRefreshLogs={() => {
              const current = storage.getActivityLogs();
              setLogs(current);
            }}
            onSimulateTestAlert={handleSimulateTestAlert}
          />
        </div>

        {/* BACKUP DATA (read-only export of Supabase and Firestore) */}
        <div id="backup_data_section" className="bg-neutral-900/60 border border-white/10 rounded-3xl p-5 sm:p-7 relative shadow-xl backdrop-blur-xl scroll-mt-44 sm:scroll-mt-24">
          <BackupDataSection />
        </div>

        {/* SECURITY SETTINGS & WEBSITE FAVICON (SIDE-BY-SIDE GRID) */}
        <div id="security_favicon_section" className="grid grid-cols-1 lg:grid-cols-2 gap-6 w-full scroll-mt-24">
          {/* SECURITY SETTINGS CARD */}
          <div className="bg-neutral-900/60 border border-white/10 rounded-3xl p-6 sm:p-7 relative shadow-xl backdrop-blur-xl transition-all hover:border-white/15 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2.5 bg-indigo-500/15 border border-indigo-500/25 rounded-2xl text-indigo-400 shadow-inner">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-serif font-bold text-white tracking-wide">Security Settings</h2>
                  <p className="text-[11px] text-neutral-400 font-mono mt-0.5">Session timeout & access controls</p>
                </div>
              </div>

              <p className="text-xs text-neutral-400 leading-relaxed mb-5">Configure auto-logout timers to log users (including admin) out automatically after a specific period of inactivity for enhanced privacy.</p>

              <form onSubmit={handleSaveSecuritySettings} className="space-y-4">
                {/* Toggle Enable */}
                <div className="flex items-center justify-between p-4 bg-neutral-950/60 rounded-2xl border border-white/10 hover:border-white/15 transition-all">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs font-semibold text-white">Auto-Logout on Inactivity</span>
                    <span className="text-[10px] text-neutral-500 font-mono">Enable automatic session termination</span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer select-none">
                    <input type="checkbox" checked={secLogoutEnabled} onChange={(e) => setSecLogoutEnabled(e.target.checked)} className="sr-only peer" />
                    <div className="w-9 h-5 bg-neutral-800 rounded-full peer peer-focus:ring-2 peer-focus:ring-indigo-500/20 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-neutral-400 peer-checked:after:bg-indigo-400 after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-950/60 border border-white/10 peer-checked:border-indigo-500/30"></div>
                  </label>
                </div>

                {/* Inactivity Minutes input */}
                {secLogoutEnabled && (
                  <div className="space-y-2">
                    <label className="text-[11px] font-semibold text-neutral-400 tracking-wide uppercase block font-mono">Screen Inactivity Waiting Time (Minutes)</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-neutral-500">
                        <Clock className="w-4 h-4" />
                      </div>
                      <input type="number" min="1" max="1440" value={secLogoutMinutes} onChange={(e) => setSecLogoutMinutes(Math.max(1, parseInt(e.target.value) || 1))} placeholder="e.g. 15" className="w-full bg-neutral-950/80 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500/60 transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                    </div>
                    <p className="text-[10px] text-neutral-500 font-mono">
                      Screen will automatically lock after {secLogoutMinutes} minute{secLogoutMinutes === 1 ? "" : "s"} of inactivity.
                    </p>
                  </div>
                )}

                {/* Anti-Brute-Force Login Waiting Time & Lockout Controls */}
                <div className="pt-2 border-t border-white/5 space-y-4">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs font-semibold text-white">Login Cooldown & Anti-Brute-Force Waiting Time</span>
                    <span className="text-[10px] text-neutral-500 font-mono">Control lockout duration after incorrect passwords</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-semibold text-neutral-400 tracking-wide uppercase block font-mono">Max Failed Attempts</label>
                      <input type="number" min="1" max="20" value={secMaxAttempts} onChange={(e) => setSecMaxAttempts(Math.max(1, parseInt(e.target.value) || 1))} placeholder="5" className="w-full bg-neutral-950/80 border border-white/10 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-indigo-500/60 transition-all font-mono" />
                      <p className="text-[10px] text-neutral-500 font-mono">Lockout triggers after {secMaxAttempts} bad passwords.</p>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-semibold text-neutral-400 tracking-wide uppercase block font-mono">Lockout Waiting Time (Seconds)</label>
                      <input type="number" min="5" max="3600" value={secLockoutSeconds} onChange={(e) => setSecLockoutSeconds(Math.max(5, parseInt(e.target.value) || 5))} placeholder="60" className="w-full bg-neutral-950/80 border border-white/10 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-indigo-500/60 transition-all font-mono" />
                      <p className="text-[10px] text-neutral-500 font-mono">Screen waiting cooldown: {secLockoutSeconds}s.</p>
                    </div>
                  </div>
                </div>

                {/* Two-Factor Authentication (TOTP / Google Authenticator) Section */}
                <div className="pt-3 border-t border-white/5 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 bg-indigo-500/15 border border-indigo-500/25 rounded-lg text-indigo-400">
                        <ShieldCheck className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="text-xs font-semibold text-white block">Google Authenticator (2FA / TOTP)</span>
                        <span className="text-[10px] text-neutral-400 font-mono">RFC 6238 Two-Factor Protection</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const myAdmin = adminAccountsList.find((a) => a.username.toLowerCase() === adminUsername.toLowerCase()) || adminAccountsList[0];
                        if (myAdmin) {
                          handleOpen2FAModalForAdmin(myAdmin);
                        }
                      }}
                      className="px-2.5 py-1.5 bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/40 text-indigo-200 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
                    >
                      <KeyRound className="w-3.5 h-3.5 text-indigo-300" />
                      <span>Configure 2FA</span>
                    </button>
                  </div>
                  <p className="text-[10px] text-neutral-500 font-mono leading-relaxed">Generate QR codes, secret backup keys & single-use recovery codes to safeguard admin accounts from unauthorized logins.</p>
                </div>

                {/* Security feedback messages */}
                {secSuccessMsg && <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-xs text-emerald-400 text-center font-medium">{secSuccessMsg}</div>}
                {secErrorMsg && <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs text-rose-400 text-center font-medium">{secErrorMsg}</div>}

                <button type="submit" disabled={isSyncing} className="w-full bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white font-semibold text-xs py-3 px-4 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2 shadow-md shadow-indigo-500/15 active:scale-[0.99] disabled:opacity-50 mt-2">
                  {isSyncing ? (
                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  ) : (
                    <>
                      <ShieldCheck className="w-4 h-4" />
                      <span>Save Security Settings</span>
                    </>
                  )}
                </button>
              </form>
            </div>
          </div>

          {/* WEBSITE FAVICON CONTROLS CARD */}
          <div className="bg-neutral-900/60 border border-white/10 rounded-3xl p-6 sm:p-7 relative shadow-xl backdrop-blur-xl transition-all hover:border-white/15 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2.5 bg-rose-500/15 border border-rose-500/25 rounded-2xl text-rose-400 shadow-inner">
                  <Upload className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-serif font-bold text-white tracking-wide">Website Favicon</h2>
                  <p className="text-[11px] text-neutral-400 font-mono mt-0.5">Browser tab icon customization</p>
                </div>
              </div>
              <p className="text-xs text-neutral-400 leading-relaxed mb-6">Upload an image to customize the tab icon shown in visitors' browsers. We automatically compress it for optimal loading speed.</p>

              <AnimatePresence>
                {faviconSuccessMsg && (
                  <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-xs text-emerald-300 flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                    <span>{faviconSuccessMsg}</span>
                  </motion.div>
                )}
                {faviconErrorMsg && (
                  <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mb-4 p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs text-rose-300 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
                    <span>{faviconErrorMsg}</span>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Current Favicon mock browser tab preview */}
              {(() => {
                const faviconDoc = adminSettings.find((s) => s.id === "websiteFavicon");
                const hasCustomFavicon = !!faviconDoc?.favicon;
                return (
                  <div className="space-y-4">
                    <div className="p-4 rounded-2xl bg-neutral-950/40 border border-white/5 space-y-3">
                      <span className="text-[10px] text-neutral-500 uppercase tracking-wider font-mono">Browser Preview</span>
                      <div className="bg-neutral-900 border border-white/10 rounded-t-xl px-3 py-2 flex items-center gap-2">
                        <div className="flex gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-500/60"></span>
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500/60"></span>
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/60"></span>
                        </div>
                        <div className="flex-1 max-w-[150px] bg-neutral-950 px-2.5 py-1 rounded-md border border-white/5 flex items-center gap-2 text-[10px] text-neutral-300 truncate">
                          {hasCustomFavicon ? <img src={faviconDoc.favicon} alt="Favicon" className="w-3.5 h-3.5 rounded object-contain" referrerPolicy="no-referrer" /> : <Heart className="w-3.5 h-3.5 text-rose-500 fill-rose-500" />}
                          <span className="truncate font-sans font-medium">Our Home ❤️</span>
                        </div>
                      </div>
                    </div>

                    {/* Drag and Drop Zone */}
                    <label
                      onDragOver={(e) => {
                        e.preventDefault();
                        setIsDragOverFavicon(true);
                      }}
                      onDragLeave={() => setIsDragOverFavicon(false)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setIsDragOverFavicon(false);
                        const file = e.dataTransfer.files?.[0];
                        if (file) handleFaviconFile(file);
                      }}
                      className={`relative flex flex-col items-center justify-center border-2 border-dashed rounded-2xl p-6 transition-all cursor-pointer text-center group ${isDragOverFavicon ? "border-indigo-500 bg-indigo-500/5" : "border-white/10 hover:border-white/20 bg-neutral-950/20 hover:bg-neutral-950/40"}`}
                    >
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleFaviconFile(file);
                        }}
                        className="hidden"
                        disabled={isUploadingFavicon}
                      />

                      <div className="p-3 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 group-hover:scale-105 transition-transform mb-3">{isUploadingFavicon ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}</div>

                      <p className="text-xs font-semibold text-white">{isUploadingFavicon ? "Compressing and uploading..." : "Upload custom favicon"}</p>
                      <p className="text-[10px] text-neutral-500 mt-1">Drag & drop image, or click to browse</p>
                    </label>

                    {hasCustomFavicon && (
                      <button onClick={handleResetFavicon} disabled={isUploadingFavicon} className="w-full bg-white/5 hover:bg-white/10 border border-white/10 text-neutral-400 hover:text-white font-semibold text-xs py-2 px-4 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50 mt-2">
                        <RefreshCw className="w-3.5 h-3.5" />
                        Reset to Default
                      </button>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>

        {/* TELEGRAM BOT & REAL-TIME ALERTS SECTION */}
        {/* ========================================================= */}
        {/* UNIFIED TELEGRAM & SECURITY HUB                            */}
        {/* ========================================================= */}
        <div id="telegram_alerts_section" className="bg-neutral-900/60 border border-white/10 rounded-3xl p-6 sm:p-7 relative shadow-xl backdrop-blur-xl transition-all hover:border-white/15 scroll-mt-24 space-y-6">
          {/* Header: Title, KPI Badges, Master Switch & Quick Diagnostic */}
          <div className="flex items-center justify-between flex-wrap gap-4 border-b border-white/5 pb-5">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-gradient-to-br from-sky-500/20 to-indigo-500/20 border border-sky-500/30 rounded-2xl text-sky-400 shadow-inner">
                <Send className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-lg font-serif font-bold text-white tracking-wide">Telegram & Security Hub</h2>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold border ${telegramConfig.enabled ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" : "bg-neutral-800 text-neutral-400 border-white/10"}`}>{telegramConfig.enabled ? "Active 🟢" : "Disabled ⚪"}</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-sky-500/15 text-sky-300 border border-sky-500/25">{consolidatedTelegramUsers.length} Users</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-purple-500/15 text-purple-300 border border-purple-500/25">{consolidatedTelegramUsers.filter((u) => u.confirmed && u.isActive).length} Verified 🟢</span>
                  {consolidatedTelegramUsers.filter((u) => !u.confirmed).length > 0 && <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/15 text-amber-300 border border-amber-500/25">{consolidatedTelegramUsers.filter((u) => !u.confirmed).length} Pending ⏳</span>}
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-neutral-800 text-neutral-300 border border-white/10">{detectedSenders.length} Inbound Msgs</span>
                </div>
                <p className="text-[11px] text-neutral-400 font-mono mt-0.5">Unified access control, whitelist directory, live sender detection & real-time couple event alerts</p>
              </div>
            </div>

            {/* Header Right Actions: Quick Diagnostic & Master Broadcast Toggle */}
            <div className="flex items-center gap-3 flex-wrap">
              <button type="button" onClick={() => handleRunDiagnostics()} disabled={isDiagnosingTelegram || !telegramConfig.botToken.trim()} className="px-3.5 py-1.5 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50 shadow-md shadow-sky-500/20" title="Run end-to-end bot connection audit, API key check, and ping test">
                {isDiagnosingTelegram ? <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Bug className="w-3.5 h-3.5" />}
                <span>🔍 Run Bot Diagnostics</span>
              </button>

              <div className="flex items-center gap-2 bg-neutral-950/60 border border-white/10 px-3 py-1.5 rounded-xl">
                <span className="text-xs font-mono text-neutral-300">Bot Broadcast</span>
                <button type="button" onClick={() => setTelegramConfig((prev) => ({ ...prev, enabled: !prev.enabled }))} className={`w-10 h-5 flex items-center rounded-full p-0.5 transition-colors cursor-pointer ${telegramConfig.enabled ? "bg-sky-500" : "bg-neutral-800"}`}>
                  <div className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${telegramConfig.enabled ? "translate-x-5" : "translate-x-0"}`} />
                </button>
              </div>
            </div>
          </div>

          {/* Step-by-Step Setup Guide Banner */}
          <div className="bg-gradient-to-r from-sky-950/30 via-indigo-950/20 to-neutral-950/40 border border-sky-500/20 rounded-2xl p-4 text-xs text-neutral-300 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-semibold text-sky-300">
                <Sparkles className="w-4 h-4 text-sky-400" />
                <span>Telegram Bot Setup & Access Guide:</span>
              </div>
              <span className="text-[10px] font-mono text-neutral-400">Step-by-step connection</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1 text-[11px] leading-relaxed">
              <div className="bg-black/30 p-2.5 rounded-xl border border-white/5 space-y-1">
                <div className="font-semibold text-white flex items-center gap-1.5">
                  <span className="w-4 h-4 rounded-full bg-sky-500/20 text-sky-300 flex items-center justify-center text-[10px] font-mono font-bold">1</span>
                  <span>Get Bot Token</span>
                </div>
                <p className="text-neutral-400">
                  Search <code className="text-sky-300">@BotFather</code> in Telegram, send <code className="text-sky-300">/newbot</code>, and copy your HTTP API Bot Token.
                </p>
              </div>
              <div className="bg-black/30 p-2.5 rounded-xl border border-white/5 space-y-1">
                <div className="font-semibold text-white flex items-center gap-1.5">
                  <span className="w-4 h-4 rounded-full bg-sky-500/20 text-sky-300 flex items-center justify-center text-[10px] font-mono font-bold">2</span>
                  <span>Authorize Users</span>
                </div>
                <p className="text-neutral-400">
                  Add Telegram usernames below. Users simply open your bot and send <code className="text-sky-300 font-mono">/start</code> or <code className="text-sky-300 font-mono">/confirm</code> to activate.
                </p>
              </div>
              <div className="bg-black/30 p-2.5 rounded-xl border border-white/5 space-y-1">
                <div className="font-semibold text-white flex items-center gap-1.5">
                  <span className="w-4 h-4 rounded-full bg-sky-500/20 text-sky-300 flex items-center justify-center text-[10px] font-mono font-bold">3</span>
                  <span>Couple & Security Alerts</span>
                </div>
                <p className="text-neutral-400">Partners receive instant alerts for milestone countdowns, date nights, sealed love letters, chat messages, and cards!</p>
              </div>
            </div>
          </div>

          {/* Unified Hub Sub-Navigation Tabs */}
          <div className="flex items-center gap-2 p-1 bg-neutral-950/70 border border-white/10 rounded-2xl flex-wrap sm:flex-nowrap">
            <button type="button" onClick={() => setTelegramHubActiveTab("users")} className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${telegramHubActiveTab === "users" ? "bg-gradient-to-r from-sky-600 to-indigo-600 text-white shadow-md" : "text-neutral-400 hover:text-white hover:bg-neutral-900"}`}>
              <Users className="w-4 h-4" />
              <span>👥 Authorized Users & Whitelist</span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${telegramHubActiveTab === "users" ? "bg-white/20 text-white" : "bg-neutral-800 text-neutral-300"}`}>{consolidatedTelegramUsers.length}</span>
            </button>

            <button type="button" onClick={() => setTelegramHubActiveTab("senders")} className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${telegramHubActiveTab === "senders" ? "bg-gradient-to-r from-sky-600 to-indigo-600 text-white shadow-md" : "text-neutral-400 hover:text-white hover:bg-neutral-900"}`}>
              <Send className="w-4 h-4" />
              <span>📥 Detected Senders & Messages</span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${telegramHubActiveTab === "senders" ? "bg-white/20 text-white" : "bg-neutral-800 text-neutral-300"}`}>{detectedSenders.length}</span>
            </button>

            <button type="button" onClick={() => setTelegramHubActiveTab("settings")} className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${telegramHubActiveTab === "settings" ? "bg-gradient-to-r from-sky-600 to-indigo-600 text-white shadow-md" : "text-neutral-400 hover:text-white hover:bg-neutral-900"}`}>
              <Sliders className="w-4 h-4" />
              <span>⚙️ Bot Config, Webhook & Triggers</span>
            </button>
          </div>

          {/* ========================================================================= */}
          {/* SUB-VIEW 1: AUTHORIZED USERS & WHITELIST DIRECTORY                        */}
          {/* ========================================================================= */}
          {telegramHubActiveTab === "users" && (
            <div className="space-y-4">
              {/* Directory Controls: Search, Status Filters & Action Buttons */}
              <div className="bg-neutral-950/70 border border-white/10 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  {/* Search filter input */}
                  <div className="relative flex-1 min-w-[220px]">
                    <Search className="w-3.5 h-3.5 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input type="text" value={telegramUserSearch} onChange={(e) => setTelegramUserSearch(e.target.value)} placeholder="Search directory by @handle, account, or role..." className="w-full bg-neutral-900 border border-white/10 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-neutral-500 font-mono focus:outline-none focus:border-sky-500/60" />
                    {telegramUserSearch && (
                      <button type="button" onClick={() => setTelegramUserSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white">
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>

                  {/* Filter Pills */}
                  <div className="flex items-center gap-1.5 bg-neutral-900 p-1 rounded-xl border border-white/5 flex-wrap">
                    <button type="button" onClick={() => setTelegramUserFilter("all")} className={`px-2.5 py-1 rounded-lg text-[11px] font-mono font-medium transition-all cursor-pointer ${telegramUserFilter === "all" ? "bg-sky-500/20 text-sky-300 border border-sky-500/30" : "text-neutral-400 hover:text-white"}`}>
                      All ({consolidatedTelegramUsers.length})
                    </button>
                    <button type="button" onClick={() => setTelegramUserFilter("verified")} className={`px-2.5 py-1 rounded-lg text-[11px] font-mono font-medium transition-all cursor-pointer ${telegramUserFilter === "verified" ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30" : "text-neutral-400 hover:text-white"}`}>
                      Verified ({consolidatedTelegramUsers.filter((u) => u.confirmed && u.isActive).length})
                    </button>
                    <button type="button" onClick={() => setTelegramUserFilter("pending")} className={`px-2.5 py-1 rounded-lg text-[11px] font-mono font-medium transition-all cursor-pointer ${telegramUserFilter === "pending" ? "bg-amber-500/20 text-amber-300 border border-amber-500/30" : "text-neutral-400 hover:text-white"}`}>
                      Pending ({consolidatedTelegramUsers.filter((u) => !u.confirmed).length})
                    </button>
                    <button type="button" onClick={() => setTelegramUserFilter("paused")} className={`px-2.5 py-1 rounded-lg text-[11px] font-mono font-medium transition-all cursor-pointer ${telegramUserFilter === "paused" ? "bg-neutral-800 text-neutral-300 border border-white/10" : "text-neutral-400 hover:text-white"}`}>
                      Paused ({consolidatedTelegramUsers.filter((u) => !u.isActive).length})
                    </button>
                  </div>

                  {/* Toolbar Actions */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <label className="flex items-center gap-2 bg-neutral-900 px-3 py-1.5 rounded-xl border border-white/10 cursor-pointer" title="Automatically imports and links usernames saved in user profiles">
                      <input type="checkbox" checked={telegramConfig.autoSyncProfiles !== false} onChange={(e) => setTelegramConfig((prev) => ({ ...prev, autoSyncProfiles: e.target.checked }))} className="rounded border-white/20 text-sky-500 focus:ring-0" />
                      <span className="text-[11px] text-neutral-300 font-mono">Auto-Sync Profiles</span>
                    </label>

                    <button type="button" onClick={handleReleaseWebhookAndPull} disabled={isRefreshingSenders || !telegramConfig.botToken.trim()} className="px-3 py-1.5 bg-neutral-900 hover:bg-neutral-800 border border-white/10 text-neutral-300 hover:text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50" title="Deletes active Telegram webhook lock and pulls unread messages">
                      <RefreshCw className={`w-3.5 h-3.5 text-sky-400 ${isRefreshingSenders ? "animate-spin" : ""}`} />
                      <span>Unlock & Pull</span>
                    </button>

                    <button type="button" onClick={handleAutoResolveChatIds} disabled={isResolvingChatIds || !telegramConfig.botToken.trim()} className="px-3.5 py-1.5 bg-gradient-to-r from-purple-600 to-sky-600 hover:from-purple-500 hover:to-sky-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50 shadow-md shadow-purple-500/20" title="Inspect Telegram updates to auto-detect numeric Chat IDs for every username">
                      {isResolvingChatIds ? <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                      <span>Auto-Detect Chat IDs</span>
                    </button>
                  </div>
                </div>

                {/* Auto-Resolve Status Notice */}
                {autoResolveStatus && (
                  <div className="p-3 bg-purple-500/10 border border-purple-500/20 rounded-xl text-xs text-purple-300 flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-purple-400 shrink-0" />
                    <span>{autoResolveStatus}</span>
                  </div>
                )}

                {/* Unified Add/Authorize User Input Row */}
                <form onSubmit={handleAddTelegramAuthorizedUser} className="bg-neutral-900/90 border border-white/10 rounded-xl p-3 pt-2.5 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-white flex items-center gap-1.5">
                      <Plus className="w-3.5 h-3.5 text-sky-400" />
                      <span>Authorize & Whitelist New Telegram Account</span>
                    </span>
                    <span className="text-[10px] text-neutral-400 font-mono">Instant bot access & couple alerts authorization</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                    {/* Telegram Username */}
                    <div>
                      <label className="text-[10px] font-semibold text-neutral-400 block mb-1 font-mono uppercase">Telegram Username *</label>
                      <div className="relative">
                        <span className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-neutral-500 font-mono text-xs">@</span>
                        <input type="text" placeholder="username (e.g. mariem)" value={newAuthUsername} onChange={(e) => setNewAuthUsername(e.target.value)} className="w-full bg-neutral-950 border border-white/10 rounded-xl pl-7 pr-3 py-1.5 text-xs text-white placeholder-neutral-500 font-mono focus:outline-none focus:border-sky-500/60" />
                      </div>
                    </div>

                    {/* Linked App Account */}
                    <div>
                      <label className="text-[10px] font-semibold text-neutral-400 block mb-1 font-mono uppercase">Linked App Profile</label>
                      <select value={newAuthAppUsername} onChange={(e) => setNewAuthAppUsername(e.target.value)} className="w-full bg-neutral-950 border border-white/10 rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-sky-500/60 font-mono">
                        <option value="">-- Choose Account (Optional) --</option>
                        {userAccounts.map((acc) => (
                          <option key={`opt-acc-${acc.id}`} value={acc.username}>
                            {acc.username} {acc.gender ? `(${acc.gender})` : ""}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Optional Chat ID */}
                    <div>
                      <label className="text-[10px] font-semibold text-neutral-400 block mb-1 font-mono uppercase">Chat ID (Optional)</label>
                      <input type="text" placeholder="Auto-captured on /confirm" value={newAuthChatId} onChange={(e) => setNewAuthChatId(e.target.value)} className="w-full bg-neutral-950 border border-white/10 rounded-xl px-2.5 py-1.5 text-xs text-white placeholder-neutral-500 font-mono focus:outline-none focus:border-sky-500/60" />
                    </div>

                    {/* Role & Submit */}
                    <div className="flex items-end gap-2">
                      <div className="flex-1">
                        <label className="text-[10px] font-semibold text-neutral-400 block mb-1 font-mono uppercase">Access Role</label>
                        <select value={newAuthRole} onChange={(e) => setNewAuthRole(e.target.value as any)} className="w-full bg-neutral-950 border border-white/10 rounded-xl px-2 py-1.5 text-xs text-white focus:outline-none focus:border-sky-500/60 font-mono">
                          <option value="partner">Partner 💖</option>
                          <option value="admin">Admin 🛡️</option>
                          <option value="guest">Guest 👤</option>
                        </select>
                      </div>

                      <button type="submit" disabled={!newAuthUsername.trim()} className="px-3.5 py-1.5 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer disabled:opacity-50 shrink-0 h-[32px] shadow-sm">
                        <Plus className="w-3.5 h-3.5" />
                        <span>Authorize</span>
                      </button>
                    </div>
                  </div>
                </form>
              </div>

              {/* Unified User Directory List */}
              <div className="space-y-2">
                {filteredConsolidatedUsers.map((user) => {
                  const noticeKey = user.id || user.telegramUsername;
                  const notice = userActionNotice[noticeKey];
                  const isTesting = testingUserId === noticeKey;

                  return (
                    <div key={user.key} className={`p-3.5 rounded-2xl border transition-all flex flex-col md:flex-row md:items-center justify-between gap-3.5 ${user.isActive ? "bg-neutral-950/70 border-white/10 hover:border-sky-500/30" : "bg-neutral-950/40 border-white/5 opacity-60"}`}>
                      {/* User Identity & Badges */}
                      <div className="flex items-start sm:items-center gap-3 min-w-0">
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs shrink-0 mt-0.5 sm:mt-0 ${user.confirmed ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30" : "bg-amber-500/20 text-amber-300 border border-amber-500/30"}`}>{user.confirmed ? "✓" : "⏳"}</div>

                        <div className="min-w-0 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <a href={`https://t.me/${user.telegramUsername.replace(/^@/, "")}`} target="_blank" rel="noopener noreferrer" className="font-mono text-xs font-bold text-sky-300 hover:underline flex items-center gap-1">
                              <span>{user.telegramUsername}</span>
                              <ExternalLink className="w-3 h-3 opacity-60" />
                            </a>

                            <span className="text-[9px] font-mono px-2 py-0.5 rounded-md bg-purple-500/15 text-purple-300 border border-purple-500/25 uppercase font-semibold">{user.role}</span>

                            {user.confirmed ? (
                              <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full flex items-center gap-1">
                                <span>Verified & Active 🟢</span>
                              </span>
                            ) : (
                              <span className="text-[10px] font-mono text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full">Awaiting /confirm in bot ⏳</span>
                            )}

                            {user.source === "profile" && <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-300 border border-sky-500/20">Profile Linked</span>}
                          </div>

                          <div className="flex items-center gap-2 text-[11px] text-neutral-400 font-mono flex-wrap">
                            {user.appUsername && (
                              <span>
                                Profile: <strong className="text-white">@{user.appUsername}</strong>
                              </span>
                            )}
                            <span>•</span>
                            <span>Chat ID: {user.chatId ? <code className="text-sky-300 font-bold bg-neutral-900 px-1.5 py-0.5 rounded border border-white/5">{user.chatId}</code> : <span className="text-neutral-500 italic">Pending /confirm in bot</span>}</span>
                            {user.confirmedAt && (
                              <>
                                <span>•</span>
                                <span>Confirmed: {new Date(user.confirmedAt).toLocaleDateString()}</span>
                              </>
                            )}
                          </div>

                          {notice && <p className="text-[10px] font-mono text-sky-400 animate-pulse">{notice}</p>}
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-2 self-end md:self-center shrink-0 flex-wrap">
                        {/* Manual Confirm / Promote Button */}
                        {!user.confirmed && (
                          <button
                            type="button"
                            onClick={() => {
                              if (user.id) {
                                handleManualConfirmUser(user.id);
                              } else {
                                handlePromoteWhitelistUser(user.telegramUsername, user.role);
                              }
                            }}
                            className="px-2.5 py-1 bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 rounded-lg text-[10px] font-semibold transition-all cursor-pointer"
                            title="Manually verify and grant access without waiting for /confirm"
                          >
                            Verify Access
                          </button>
                        )}

                        {/* Individual Diagnostic Ping Button */}
                        <button type="button" disabled={isTesting || !user.chatId} onClick={() => handleTestIndividualUser(user)} className="px-2.5 py-1 bg-neutral-900 hover:bg-neutral-800 border border-white/10 text-neutral-200 rounded-lg text-[10px] font-semibold flex items-center gap-1 transition-all cursor-pointer disabled:opacity-40" title={user.chatId ? `Send a direct test alert to ${user.telegramUsername}` : "User has not messaged bot yet"}>
                          {isTesting ? <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Send className="w-3 h-3 text-sky-400" />}
                          <span>Test Ping</span>
                        </button>

                        {/* Toggle Active Switch if user has id */}
                        {user.id && (
                          <button type="button" onClick={() => handleToggleAuthorizedUser(user.id!, user.isActive)} className={`px-2 py-1 rounded-lg text-[10px] font-semibold border transition-all cursor-pointer ${user.isActive ? "bg-sky-500/15 border-sky-500/30 text-sky-300" : "bg-neutral-800 border-white/5 text-neutral-500"}`} title={user.isActive ? "Pause alerts for this user" : "Resume alerts"}>
                            {user.isActive ? "Active" : "Paused"}
                          </button>
                        )}

                        {/* Delete button (removes cleanly from both registry and whitelist) */}
                        <button type="button" onClick={() => handleRemoveConsolidatedUser(user)} className="p-1.5 text-neutral-500 hover:text-rose-400 rounded-lg hover:bg-rose-500/10 transition-colors cursor-pointer" title="Remove user from Telegram & Security Hub">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}

                {filteredConsolidatedUsers.length === 0 && (
                  <div className="p-6 rounded-2xl border border-dashed border-white/10 text-center space-y-2">
                    <p className="text-xs text-neutral-300 font-semibold">{telegramUserSearch ? "No matching users found in directory." : "No users registered in Telegram & Security Hub yet."}</p>
                    <p className="text-[11px] text-neutral-400 max-w-md mx-auto">Add a partner's Telegram username above or have them save their Telegram handle in their User Profile to grant access!</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* SUB-VIEW 2: DETECTED TELEGRAM SENDERS & LIVE MESSAGES                     */}
          {/* ========================================================================= */}
          {telegramHubActiveTab === "senders" && (
            <div className="space-y-4">
              <div className="bg-neutral-950/70 border border-white/10 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <h4 className="text-xs font-bold text-white uppercase tracking-wider font-mono">Live Detected Telegram Senders ({detectedSenders.length})</h4>
                    <p className="text-[11px] text-neutral-400">
                      Inbound messages sent to your bot (<code className="text-sky-300 font-mono">/start</code>, <code className="text-sky-300 font-mono">/confirm</code>). Link any sender to an account with 1 click.
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button type="button" onClick={handleRefreshDetectedSenders} disabled={isRefreshingSenders || !telegramConfig.botToken.trim()} className="px-3 py-1.5 bg-neutral-900 hover:bg-neutral-800 border border-white/10 text-neutral-300 hover:text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50" title="Fetch latest updates and unread messages">
                      <RefreshCw className={`w-3.5 h-3.5 text-sky-400 ${isRefreshingSenders ? "animate-spin" : ""}`} />
                      <span>Refresh Messages</span>
                    </button>

                    {detectedSenders.length > 0 && (
                      <button type="button" onClick={handleClearDetectedSenders} className="px-2.5 py-1.5 bg-neutral-900 hover:bg-neutral-800 border border-white/10 text-neutral-400 hover:text-rose-400 rounded-xl text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer" title="Clear message history">
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Clear Log</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Senders Cards */}
              <div className="space-y-2.5">
                {detectedSenders.map((sender, idx) => {
                  const isLinked = (telegramConfig.authorizedUsers || []).some((u) => u.chatId === sender.chatId && u.confirmed);
                  const linkedUser = (telegramConfig.authorizedUsers || []).find((u) => u.chatId === sender.chatId);
                  const isLinking = linkingSenderChatId === sender.chatId;
                  const isCopied = copiedChatId === sender.chatId;

                  return (
                    <div key={`det-snd-${sender.chatId}-${idx}`} className={`p-3.5 rounded-2xl border transition-all flex flex-col md:flex-row md:items-center justify-between gap-3.5 ${isLinked ? "bg-neutral-950/70 border-emerald-500/20" : "bg-neutral-950/90 border-white/10 hover:border-sky-500/30"}`}>
                      {/* Sender info */}
                      <div className="flex items-start gap-3 min-w-0">
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs shrink-0 mt-0.5 ${isLinked ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30" : "bg-sky-500/20 text-sky-300 border border-sky-500/30"}`}>{isLinked ? "✓" : sender.firstName ? sender.firstName[0].toUpperCase() : "TG"}</div>

                        <div className="min-w-0 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-xs text-white">
                              {sender.firstName} {sender.lastName || ""}
                            </span>

                            {sender.username ? (
                              <a href={`https://t.me/${sender.username.replace(/^@/, "")}`} target="_blank" rel="noopener noreferrer" className="text-xs font-mono text-sky-400 hover:underline flex items-center gap-1">
                                <span>{sender.username}</span>
                                <ExternalLink className="w-3 h-3 opacity-70" />
                              </a>
                            ) : (
                              <span className="text-[10px] font-mono text-neutral-500 italic">No @username</span>
                            )}

                            {isLinked ? <span className="text-[10px] font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full font-bold">Verified & Linked {linkedUser ? `(${linkedUser.telegramUsername})` : ""} 🟢</span> : <span className="text-[10px] font-mono bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full font-bold">Unlinked Sender ⚠️</span>}
                          </div>

                          {/* Message details & Chat ID */}
                          <div className="flex items-center gap-2 text-[11px] font-mono text-neutral-300 flex-wrap">
                            <div className="flex items-center gap-1.5 bg-neutral-900 px-2 py-0.5 rounded-md border border-white/5">
                              <span className="text-neutral-500">Chat ID:</span>
                              <code className="text-sky-300 font-bold">{sender.chatId}</code>
                              <button type="button" onClick={() => handleCopyChatId(sender.chatId)} className="text-neutral-400 hover:text-white transition-colors cursor-pointer ml-0.5" title="Copy numeric Chat ID">
                                {isCopied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                              </button>
                            </div>

                            {sender.text && (
                              <div className="bg-neutral-900 px-2 py-0.5 rounded-md border border-white/5 text-neutral-300 truncate max-w-[240px]">
                                <span>Msg: </span>
                                <strong className="text-white">"{sender.text}"</strong>
                              </div>
                            )}

                            {sender.timestamp && <span className="text-[10px] text-neutral-500">{new Date(sender.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>}
                          </div>
                        </div>
                      </div>

                      {/* Quick Link Action Form */}
                      {!isLinked && (
                        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap shrink-0 self-end md:self-center">
                          <select value={selectedLinkTargets[sender.chatId] || sender.username || activeCombinedWhitelist[0] || ""} onChange={(e) => setSelectedLinkTargets((prev) => ({ ...prev, [sender.chatId]: e.target.value }))} className="bg-neutral-900 border border-white/10 rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-sky-500/60 font-mono">
                            <optgroup label="Whitelist Handles">
                              {activeCombinedWhitelist.map((u) => (
                                <option key={`wh-tgt-${u}`} value={u}>
                                  {u}
                                </option>
                              ))}
                            </optgroup>
                            <optgroup label="App User Accounts">
                              {userAccounts.map((acc) => (
                                <option key={`acc-tgt-${acc.id}`} value={acc.telegramUsername ? (acc.telegramUsername.startsWith("@") ? acc.telegramUsername : `@${acc.telegramUsername}`) : `@${acc.username}`}>
                                  {acc.username} {acc.telegramUsername ? `(${acc.telegramUsername})` : ""}
                                </option>
                              ))}
                            </optgroup>
                            {sender.username && !activeCombinedWhitelist.includes(sender.username.toLowerCase()) && <option value={sender.username}>This Sender: {sender.username}</option>}
                          </select>

                          <button type="button" disabled={isLinking} onClick={() => handleQuickLinkSender(sender)} className="px-3 py-1.5 bg-gradient-to-r from-emerald-600 to-sky-600 hover:from-emerald-500 hover:to-sky-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50 shadow-md shadow-emerald-500/15 shrink-0" title="Instantly link and verify this Telegram Chat ID to the selected account">
                            {isLinking ? <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                            <span>⚡ Link & Verify</span>
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}

                {detectedSenders.length === 0 && (
                  <div className="p-6 rounded-2xl border border-dashed border-white/10 text-center space-y-2">
                    <p className="text-xs text-neutral-300 font-semibold">No recent Telegram bot messages captured yet.</p>
                    <p className="text-[11px] text-neutral-400 max-w-lg mx-auto">
                      Open your bot in Telegram and send <code className="text-sky-300 font-mono font-bold">/start</code> or <code className="text-sky-300 font-mono font-bold">/confirm</code>. Then click <b>"Refresh Messages"</b> or <b>"Auto-Detect Chat IDs"</b> above!
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* SUB-VIEW 3: BOT CREDENTIALS, WEBHOOK & EVENT TRIGGERS                     */}
          {/* ========================================================================= */}
          {telegramHubActiveTab === "settings" && (
            <div className="space-y-6">
              {/* Credentials Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Bot Token */}
                <div className="bg-neutral-950/70 border border-white/10 rounded-2xl p-4 space-y-2">
                  <label className="text-xs font-semibold text-neutral-300 block">Telegram Bot Token (HTTP API)</label>
                  <div className="relative">
                    <input type={showBotToken ? "text" : "password"} value={telegramConfig.botToken} onChange={(e) => setTelegramConfig((prev) => ({ ...prev, botToken: e.target.value }))} placeholder="123456789:ABCdefGHIjklMNOpqrsTUVwxyz" className="w-full bg-neutral-900 border border-white/10 rounded-xl pl-3.5 pr-10 py-2.5 text-xs text-white focus:outline-none focus:border-sky-500/60 transition-all font-mono" />
                    <button type="button" onClick={() => setShowBotToken(!showBotToken)} className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white cursor-pointer">
                      {showBotToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-[10px] text-neutral-500 font-mono">Generated by Telegram's @BotFather when creating your bot.</p>
                </div>

                {/* Primary Group Chat ID (Optional) */}
                <div className="bg-neutral-950/70 border border-white/10 rounded-2xl p-4 space-y-2">
                  <label className="text-xs font-semibold text-neutral-300 block">
                    Primary Group Chat ID <span className="text-[10px] text-neutral-500 font-mono font-normal">(Optional for shared groups)</span>
                  </label>
                  <input type="text" value={telegramConfig.chatId} onChange={(e) => setTelegramConfig((prev) => ({ ...prev, chatId: e.target.value }))} placeholder="-100... (Optional for shared couple group chats)" className="w-full bg-neutral-900 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-sky-500/60 transition-all font-mono" />
                  <p className="text-[10px] text-neutral-500 font-mono">Optional. Authorized users receive alerts in their personal chats automatically by their @usernames.</p>
                </div>
              </div>

              {/* Event Category Notification Toggles */}
              <div className="bg-neutral-950/70 border border-white/10 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-white uppercase tracking-wider font-mono">Broadcast Event Triggers & Reminders</h4>
                    <p className="text-[11px] text-neutral-400">Choose which romance, couple celebration, and security events trigger automated Telegram alerts</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  <label className="flex items-center gap-2.5 bg-neutral-900 border border-white/10 p-3 rounded-xl cursor-pointer hover:border-white/20 transition-all">
                    <input type="checkbox" checked={telegramConfig.notifyMilestones} onChange={(e) => setTelegramConfig((prev) => ({ ...prev, notifyMilestones: e.target.checked }))} className="rounded border-white/20 text-sky-500 focus:ring-0" />
                    <div>
                      <span className="text-xs font-semibold text-white block">💍 Milestones & Anniversaries</span>
                      <span className="text-[10px] text-neutral-400 font-mono">Countdowns & celebration pings</span>
                    </div>
                  </label>

                  <label className="flex items-center gap-2.5 bg-neutral-900 border border-white/10 p-3 rounded-xl cursor-pointer hover:border-white/20 transition-all">
                    <input type="checkbox" checked={telegramConfig.notifyDates} onChange={(e) => setTelegramConfig((prev) => ({ ...prev, notifyDates: e.target.checked }))} className="rounded border-white/20 text-sky-500 focus:ring-0" />
                    <div>
                      <span className="text-xs font-semibold text-white block">🗓️ Date Night Reminders</span>
                      <span className="text-[10px] text-neutral-400 font-mono">Itineraries & checklist alerts</span>
                    </div>
                  </label>

                  <label className="flex items-center gap-2.5 bg-neutral-900 border border-white/10 p-3 rounded-xl cursor-pointer hover:border-white/20 transition-all">
                    <input type="checkbox" checked={telegramConfig.notifyLetters} onChange={(e) => setTelegramConfig((prev) => ({ ...prev, notifyLetters: e.target.checked }))} className="rounded border-white/20 text-sky-500 focus:ring-0" />
                    <div>
                      <span className="text-xs font-semibold text-white block">💌 Sealed Love Letters</span>
                      <span className="text-[10px] text-neutral-400 font-mono">Alert when partner seals a letter</span>
                    </div>
                  </label>

                  <label className="flex items-center gap-2.5 bg-neutral-900 border border-white/10 p-3 rounded-xl cursor-pointer hover:border-white/20 transition-all">
                    <input type="checkbox" checked={telegramConfig.notifyChat} onChange={(e) => setTelegramConfig((prev) => ({ ...prev, notifyChat: e.target.checked }))} className="rounded border-white/20 text-sky-500 focus:ring-0" />
                    <div>
                      <span className="text-xs font-semibold text-white block">💬 Sweet Chat Messages</span>
                      <span className="text-[10px] text-neutral-400 font-mono">Direct message partner notices</span>
                    </div>
                  </label>

                  <label className="flex items-center gap-2.5 bg-neutral-900 border border-white/10 p-3 rounded-xl cursor-pointer hover:border-white/20 transition-all">
                    <input type="checkbox" checked={telegramConfig.notifySecurity} onChange={(e) => setTelegramConfig((prev) => ({ ...prev, notifySecurity: e.target.checked }))} className="rounded border-white/20 text-sky-500 focus:ring-0" />
                    <div>
                      <span className="text-xs font-semibold text-white block">🛡️ Security & Login Alerts</span>
                      <span className="text-[10px] text-neutral-400 font-mono">Suspicious login & lockout alerts</span>
                    </div>
                  </label>

                  <label className="flex items-center gap-2.5 bg-neutral-900 border border-white/10 p-3 rounded-xl cursor-pointer hover:border-white/20 transition-all">
                    <input type="checkbox" checked={telegramConfig.notifyCards !== false} onChange={(e) => setTelegramConfig((prev) => ({ ...prev, notifyCards: e.target.checked }))} className="rounded border-white/20 text-sky-500 focus:ring-0" />
                    <div>
                      <span className="text-xs font-semibold text-white block">🎉 Choose Moment & Cards</span>
                      <span className="text-[10px] text-neutral-400 font-mono">Interactive cards & celebrations</span>
                    </div>
                  </label>
                </div>
              </div>

              {/* Telegram Webhook Engine */}
              <div className="bg-neutral-950/70 border border-white/10 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-xs font-bold text-white uppercase tracking-wider font-mono">Telegram Webhook Engine (Two-Way Auto-Discovery)</h4>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-bold border ${telegramConfig.webhookEnabled ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" : "bg-neutral-800 text-neutral-400 border-white/10"}`}>{telegramConfig.webhookEnabled ? "Webhook Active 🟢" : "Direct Polling ⚪"}</span>
                    </div>
                    <p className="text-[11px] text-neutral-400">
                      Receives updates when partners send <code className="text-sky-300">/start</code> or <code className="text-sky-300">/confirm</code> to the bot and auto-replies
                    </p>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-neutral-300 block">Public Webhook Endpoint URL</label>
                  <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                    <input type="text" value={webhookInputUrl} onChange={(e) => setWebhookInputUrl(e.target.value)} placeholder="https://your-domain.app/api/telegram/webhook" className="w-full bg-neutral-900 border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white placeholder-neutral-500 font-mono focus:outline-none focus:border-indigo-500/60" />

                    <button type="button" disabled={isManagingWebhook || !telegramConfig.botToken || !webhookInputUrl} onClick={handleSetWebhook} className="px-3.5 py-2 bg-gradient-to-r from-indigo-600 to-sky-600 hover:from-indigo-500 hover:to-sky-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50 shrink-0 shadow-sm">
                      {isManagingWebhook ? <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                      <span>Activate Webhook</span>
                    </button>

                    <button type="button" disabled={isManagingWebhook || !telegramConfig.botToken} onClick={handleCheckWebhookInfo} className="px-3.5 py-2 bg-neutral-800 hover:bg-neutral-700 border border-white/10 text-neutral-300 hover:text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shrink-0">
                      <span>Inspect Info</span>
                    </button>

                    <button type="button" disabled={isManagingWebhook || !telegramConfig.botToken} onClick={handleDeleteWebhook} className="px-3 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/20 rounded-xl text-xs font-semibold transition-all cursor-pointer shrink-0" title="Remove webhook and return to polling">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {webhookStatusNotice && (
                  <div className={`p-3 rounded-xl text-xs flex items-center gap-2 ${webhookStatusNotice.success ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-300" : "bg-rose-500/10 border border-rose-500/20 text-rose-300"}`}>
                    {webhookStatusNotice.success ? <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" /> : <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />}
                    <span>{webhookStatusNotice.message}</span>
                  </div>
                )}

                {webhookInfoData && (
                  <div className="bg-black/50 p-3 rounded-xl border border-white/5 text-[11px] font-mono space-y-1 text-neutral-300">
                    <div>
                      <b>Active URL:</b> <span className="text-sky-300">{webhookInfoData.url || "None"}</span>
                    </div>
                    <div>
                      <b>Pending Updates:</b> {webhookInfoData.pending_update_count || 0}
                    </div>
                    {webhookInfoData.last_error_message && (
                      <div className="text-rose-400">
                        <b>Last Error:</b> {webhookInfoData.last_error_message}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Status Feedback */}
          {telegramTestStatus && (
            <div className={`p-3.5 rounded-2xl text-xs flex items-center gap-2.5 ${telegramTestStatus.success ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-300" : "bg-rose-500/10 border border-rose-500/20 text-rose-300"}`}>
              {telegramTestStatus.success ? <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" /> : <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />}
              <span className="leading-relaxed">{telegramTestStatus.message}</span>
            </div>
          )}

          {telegramSaveStatus && (
            <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl text-xs text-emerald-300 flex items-center gap-2.5">
              <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{telegramSaveStatus}</span>
            </div>
          )}

          {/* Bottom Primary Actions Bar */}
          <div className="flex items-center gap-3 pt-3 flex-wrap border-t border-white/5">
            {/* DIAGNOSTIC BUTTON: Sends test message & audits connection */}
            <button type="button" disabled={isDiagnosingTelegram || !telegramConfig.botToken.trim()} onClick={() => handleRunDiagnostics()} className="px-4 py-2.5 bg-gradient-to-r from-sky-600 via-indigo-600 to-purple-600 hover:from-sky-500 hover:to-purple-500 text-white rounded-xl text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50 shadow-md shadow-sky-500/20" title="Sends a test diagnostic message and audits Bot API connection, latency, and keys">
              {isDiagnosingTelegram ? <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Bug className="w-3.5 h-3.5" />}
              <span>🔍 Run Bot Diagnostics & API Ping</span>
            </button>

            <button type="button" disabled={isTestingTelegram || !telegramConfig.botToken.trim()} onClick={handleTestTelegramConnection} className="px-4 py-2.5 bg-neutral-800 hover:bg-neutral-700 border border-white/10 text-white rounded-xl text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50" title="Dispatches a test alert to all confirmed user chat IDs simultaneously">
              {isTestingTelegram ? <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Send className="w-3.5 h-3.5 text-sky-400" />}
              <span>📢 Broadcast Alert to All Users</span>
            </button>

            <button type="button" disabled={isResolvingChatIds || !telegramConfig.botToken.trim()} onClick={handleAutoResolveChatIds} className="px-4 py-2.5 bg-purple-950/60 hover:bg-purple-900/60 border border-purple-500/30 text-purple-200 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50" title="Auto-detects Chat IDs for all whitelisted usernames from Telegram bot updates">
              {isResolvingChatIds ? <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Sparkles className="w-3.5 h-3.5 text-purple-400" />}
              <span>⚡ Auto-Detect Chat IDs</span>
            </button>

            <button type="button" onClick={() => handleSaveTelegramConfig()} disabled={isSavingTelegram} className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer shadow-md shadow-emerald-500/15 ml-auto">
              {isSavingTelegram ? <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              <span>💾 Save Telegram Settings</span>
            </button>
          </div>

          {/* ========================================================================= */}
          {/* COMPREHENSIVE BOT DIAGNOSTIC & API TEST MODAL                             */}
          {/* ========================================================================= */}
          {showDiagnosticModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
              <div className="bg-neutral-900 border border-white/15 rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-5 shadow-2xl relative">
                {/* Modal Header */}
                <div className="flex items-center justify-between border-b border-white/10 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-sky-500/20 text-sky-400 rounded-2xl border border-sky-500/30">
                      <Bug className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-white font-serif">Telegram Bot Connection Diagnostics & Audit</h3>
                      <p className="text-xs text-neutral-400 font-mono">API key validation, latency check & live test message delivery</p>
                    </div>
                  </div>

                  <button type="button" onClick={() => setShowDiagnosticModal(false)} className="p-2 text-neutral-400 hover:text-white rounded-xl hover:bg-white/5 transition-colors cursor-pointer">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Execution Spinner if running */}
                {isDiagnosingTelegram && (
                  <div className="py-12 text-center space-y-3">
                    <div className="w-10 h-10 border-3 border-sky-500/30 border-t-sky-400 rounded-full animate-spin mx-auto" />
                    <p className="text-xs font-mono text-sky-300">Auditing Telegram API cloud connection & bot credentials...</p>
                  </div>
                )}

                {/* Diagnostic Results Report */}
                {!isDiagnosingTelegram && diagnosticReport && (
                  <div className="space-y-4">
                    {/* Overall Health Summary Banner */}
                    <div className={`p-4 rounded-2xl border flex items-center justify-between flex-wrap gap-3 ${diagnosticReport.success ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300" : "bg-rose-500/10 border-rose-500/30 text-rose-300"}`}>
                      <div className="flex items-center gap-3">
                        {diagnosticReport.success ? <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0" /> : <XCircle className="w-6 h-6 text-rose-400 shrink-0" />}
                        <div>
                          <h4 className="text-sm font-bold">{diagnosticReport.success ? "Diagnostic Passed: Telegram Bot Online 🟢" : "Diagnostic Alert: Connection Issue Detected 🔴"}</h4>
                          <p className="text-xs opacity-90 font-mono mt-0.5">{diagnosticReport.success ? `Bot @${diagnosticReport.bot?.username || "bot"} verified and responding normally.` : diagnosticReport.error || "Failed to authenticate with Telegram API."}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="px-3 py-1 bg-black/40 rounded-xl text-xs font-mono font-bold border border-white/10 text-white">⚡ {diagnosticReport.latencyMs} ms latency</span>
                      </div>
                    </div>

                    {/* Custom Chat ID or Username Input to Re-Test with specific recipient */}
                    <div className="bg-neutral-950 p-3.5 rounded-2xl border border-white/10 space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold text-neutral-300 block">Test Message Destination (Chat ID or @username)</label>
                        <span className="text-[10px] text-sky-400 font-mono">Supports Chat ID & @username</span>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                        <input type="text" value={diagnosticCustomChatId} onChange={(e) => setDiagnosticCustomChatId(e.target.value)} placeholder="Enter numeric Chat ID (e.g. -100...) or @username" className="flex-1 bg-neutral-900 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white placeholder-neutral-500 font-mono focus:outline-none focus:border-sky-500/60" />
                        <button type="button" onClick={() => handleRunDiagnostics(diagnosticCustomChatId)} className="px-3.5 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shrink-0">
                          <Send className="w-3.5 h-3.5" />
                          <span>Dispatch Diagnostic Ping</span>
                        </button>
                      </div>
                      <p className="text-[10px] text-neutral-400 font-mono">
                        ℹ️ If you enter a username (e.g. <code className="text-sky-300">@ebrahimayman</code>), the system automatically resolves its Chat ID from recent bot updates or cache.
                      </p>
                    </div>

                    {/* Diagnostic Checklist */}
                    <div className="bg-neutral-950 p-4 rounded-2xl border border-white/10 space-y-2.5">
                      <h4 className="text-xs font-bold text-neutral-300 uppercase tracking-wider font-mono">Verification Checklist</h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-mono">
                        <div className="flex items-center gap-2 p-2 bg-neutral-900/60 rounded-xl border border-white/5">
                          {diagnosticReport.checks.tokenProvided ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" /> : <XCircle className="w-4 h-4 text-rose-400 shrink-0" />}
                          <span className="text-neutral-300">Bot Token Configured</span>
                        </div>

                        <div className="flex items-center gap-2 p-2 bg-neutral-900/60 rounded-xl border border-white/5">
                          {diagnosticReport.checks.apiReachable ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" /> : <XCircle className="w-4 h-4 text-rose-400 shrink-0" />}
                          <span className="text-neutral-300">Telegram Cloud Reachable</span>
                        </div>

                        <div className="flex items-center gap-2 p-2 bg-neutral-900/60 rounded-xl border border-white/5">
                          {diagnosticReport.checks.botAuthenticated ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" /> : <XCircle className="w-4 h-4 text-rose-400 shrink-0" />}
                          <span className="text-neutral-300">Auth: @{diagnosticReport.bot?.username || "unknown"}</span>
                        </div>

                        <div className="flex items-center gap-2 p-2 bg-neutral-900/60 rounded-xl border border-white/5">
                          {diagnosticReport.checks.webhookHealthy ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" /> : <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />}
                          <span className="text-neutral-300">Webhook: {diagnosticReport.webhook?.url ? "Active" : "Polling Mode"}</span>
                        </div>

                        <div className="flex items-center gap-2 p-2 bg-neutral-900/60 rounded-xl border border-white/5 sm:col-span-2">
                          {diagnosticReport.testMessageSent ? diagnosticReport.testMessageDelivered ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" /> : <XCircle className="w-4 h-4 text-rose-400 shrink-0" /> : <div className="w-4 h-4 rounded-full border border-neutral-600 flex items-center justify-center text-[10px] text-neutral-400">⚪</div>}
                          <span className="text-neutral-300">{diagnosticReport.testMessageSent ? (diagnosticReport.testMessageDelivered ? "Test Message Delivered to Chat ID ✅" : `Delivery Failed: ${diagnosticReport.testMessageError || "Chat not found"}`) : "No Destination Chat ID entered (message test skipped)"}</span>
                        </div>
                      </div>
                    </div>

                    {/* Bot Details Card */}
                    {diagnosticReport.bot && (
                      <div className="bg-neutral-950 p-4 rounded-2xl border border-white/10 space-y-2 text-xs font-mono">
                        <h4 className="text-xs font-bold text-neutral-300 uppercase tracking-wider font-mono">Bot Identity & Permissions</h4>
                        <div className="grid grid-cols-2 gap-2 text-neutral-400">
                          <div>
                            <b>Bot ID:</b> <span className="text-white">{diagnosticReport.bot.id}</span>
                          </div>
                          <div>
                            <b>Username:</b> <span className="text-sky-300">@{diagnosticReport.bot.username}</span>
                          </div>
                          <div>
                            <b>Display Name:</b> <span className="text-white">{diagnosticReport.bot.firstName}</span>
                          </div>
                          <div>
                            <b>Join Groups:</b> <span className={diagnosticReport.bot.canJoinGroups ? "text-emerald-400" : "text-neutral-500"}>{diagnosticReport.bot.canJoinGroups ? "Allowed" : "Disabled"}</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Raw Telegram API Response Payload */}
                    {diagnosticReport.rawTelegramResponse && (
                      <div className="bg-neutral-950 p-4 rounded-2xl border border-white/10 space-y-2 text-xs font-mono">
                        <div className="flex items-center justify-between">
                          <h4 className="text-xs font-bold text-neutral-300 uppercase tracking-wider font-mono flex items-center gap-1.5">
                            <Terminal className="w-3.5 h-3.5 text-sky-400" />
                            <span>Raw Telegram Response Payload</span>
                          </h4>
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(JSON.stringify(diagnosticReport.rawTelegramResponse, null, 2));
                              setCopyDiagnosticJsonSuccess(true);
                              setTimeout(() => setCopyDiagnosticJsonSuccess(false), 2000);
                            }}
                            className="text-neutral-400 hover:text-white flex items-center gap-1 cursor-pointer"
                          >
                            {copyDiagnosticJsonSuccess ? (
                              <>
                                <Check className="w-3 h-3 text-emerald-400" />
                                <span className="text-emerald-400 text-[10px]">Copied!</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3" />
                                <span className="text-[10px]">Copy JSON</span>
                              </>
                            )}
                          </button>
                        </div>
                        <pre className="bg-black/60 p-3 rounded-xl border border-white/5 text-[10px] text-sky-300 overflow-x-auto max-h-48 leading-relaxed">{JSON.stringify(diagnosticReport.rawTelegramResponse, null, 2)}</pre>
                      </div>
                    )}
                  </div>
                )}

                {/* Modal Footer */}
                <div className="flex items-center justify-between pt-3 border-t border-white/10">
                  <button type="button" onClick={() => handleRunDiagnostics()} disabled={isDiagnosingTelegram} className="px-3.5 py-2 bg-neutral-800 hover:bg-neutral-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer">
                    <RefreshCw className={`w-3.5 h-3.5 ${isDiagnosingTelegram ? "animate-spin" : ""}`} />
                    <span>Re-Run Audit</span>
                  </button>

                  <button type="button" onClick={() => setShowDiagnosticModal(false)} className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-semibold transition-all cursor-pointer">
                    Close Diagnostics
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ========================================================= */}
        {/* GLOBAL MUSIC VAULT & PRESETS CONTROL                      */}
        {/* ========================================================= */}
        <div id="global_music_section" className="bg-neutral-900/60 border border-white/10 rounded-3xl p-6 sm:p-7 relative shadow-xl backdrop-blur-xl transition-all hover:border-white/15 scroll-mt-24 space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between flex-wrap gap-4 border-b border-white/5 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-rose-500/15 border border-rose-500/25 rounded-2xl text-rose-400 shadow-inner">
                <Music className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-serif font-bold text-white tracking-wide">Global Music Vault Controls</h2>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">{globalMusicTracks.length} Global Presets</span>
                </div>
                <p className="text-[11px] text-neutral-400 font-mono mt-0.5">Pre-seeded songs and romantic anthems broadcast to all couples across the entire platform</p>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2 flex-wrap">
              <button type="button" onClick={handleResetDefaultGlobalMusic} className="px-3 py-2 bg-neutral-800 hover:bg-neutral-700 border border-white/10 text-neutral-300 hover:text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer" title="Restore factory preset tracks (Hamaki, Amr Gaber, Birthday Anthem)">
                <RefreshCw className="w-3.5 h-3.5 text-neutral-400" />
                <span>Reset to Factory Presets</span>
              </button>

              <button type="button" onClick={handleOpenAddMusicModal} className="px-4 py-2 bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-md shadow-rose-500/20">
                <Plus className="w-4 h-4" />
                <span>Add Global Track</span>
              </button>
            </div>
          </div>

          {/* Success toast banner */}
          {musicSuccessStatus && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/25 rounded-xl text-xs text-emerald-300 flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{musicSuccessStatus}</span>
            </div>
          )}

          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            <div className="bg-black/40 p-3 rounded-2xl border border-white/5">
              <span className="text-[10px] text-neutral-400 uppercase tracking-wider block font-mono">Total Global Songs</span>
              <span className="text-xl font-bold font-serif text-white">{globalMusicTracks.length}</span>
            </div>
            <div className="bg-black/40 p-3 rounded-2xl border border-rose-500/10">
              <span className="text-[10px] text-rose-300/80 uppercase tracking-wider block font-mono">Romantic Ballads</span>
              <span className="text-xl font-bold font-serif text-rose-300">{globalMusicTracks.filter((t) => t.category !== "celebration").length}</span>
            </div>
            <div className="bg-black/40 p-3 rounded-2xl border border-amber-500/10">
              <span className="text-[10px] text-amber-300/80 uppercase tracking-wider block font-mono">Celebration Anthems</span>
              <span className="text-xl font-bold font-serif text-amber-300">{globalMusicTracks.filter((t) => t.category === "celebration").length}</span>
            </div>
            <div className="bg-black/40 p-3 rounded-2xl border border-sky-500/10">
              <span className="text-[10px] text-sky-300/80 uppercase tracking-wider block font-mono">Audience Scope</span>
              <span className="text-xs font-semibold font-mono text-sky-300 block mt-1.5">All Registered Couples 🌍</span>
            </div>
          </div>

          {/* Tracks List */}
          <div className="bg-black/40 border border-white/10 rounded-2xl overflow-hidden divide-y divide-white/5">
            {globalMusicTracks.map((track, idx) => {
              const isPlayingThis = previewTrackId === track.id && isPreviewPlaying;

              return (
                <div key={`global-track-${track.id}-${idx}`} className={`p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-colors ${isPlayingThis ? "bg-rose-950/20" : "hover:bg-white/[0.02]"}`}>
                  {/* Left: Play button, track info & audio wave */}
                  <div className="flex items-center gap-3.5 min-w-0">
                    <button type="button" onClick={() => handleTogglePreview(track)} className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-transform active:scale-95 cursor-pointer ${isPlayingThis ? "bg-rose-600 text-white shadow-md shadow-rose-600/30" : "bg-white/5 hover:bg-rose-600 text-neutral-300 hover:text-white border border-white/10"}`} title={isPlayingThis ? "Pause preview" : "Play preview in admin"}>
                      {isPlayingThis ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
                    </button>

                    <div className="min-w-0 space-y-0.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-serif font-bold text-sm text-white truncate">{track.title}</h4>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full border bg-rose-500/10 text-rose-300 border-rose-500/20">Preset</span>
                        {track.category === "celebration" ? <span className="text-[10px] font-mono px-2 py-0.5 rounded-full border bg-amber-500/10 text-amber-300 border-amber-500/20">🎉 Celebration</span> : <span className="text-[10px] font-mono px-2 py-0.5 rounded-full border bg-pink-500/10 text-pink-300 border-pink-500/20">💖 Romantic</span>}
                        {isPlayingThis && (
                          <span className="flex items-center gap-0.5 text-rose-400">
                            <span className="w-1 h-3 bg-rose-500 animate-pulse rounded-full" />
                            <span className="w-1 h-4 bg-rose-400 animate-pulse delay-75 rounded-full" />
                            <span className="w-1 h-2 bg-rose-500 animate-pulse delay-150 rounded-full" />
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 text-xs text-neutral-400">
                        <span className="font-semibold text-neutral-300">{track.artist || "Romantic Melody"}</span>
                        <span>•</span>
                        <span className="font-mono text-[11px]">{track.duration || "3:30"}</span>
                      </div>

                      {track.dedication && <p className="text-[11px] text-neutral-400 italic font-serif line-clamp-1">"{track.dedication}"</p>}
                    </div>
                  </div>

                  {/* Right: URL source preview & Actions */}
                  <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                    <span className="text-[10px] font-mono text-neutral-500 max-w-[140px] truncate hidden md:inline-block" title={track.url}>
                      {track.url}
                    </span>

                    <button type="button" onClick={() => handleOpenEditMusicModal(track)} className="p-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white rounded-xl transition-colors cursor-pointer border border-white/5" title="Edit global track">
                      <Edit3 className="w-4 h-4" />
                    </button>

                    <button type="button" onClick={() => setMusicToDelete(track)} className="p-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded-xl transition-colors cursor-pointer border border-rose-500/20" title="Delete global track">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}

            {globalMusicTracks.length === 0 && (
              <div className="p-8 text-center space-y-2">
                <Music className="w-8 h-8 text-neutral-600 mx-auto" />
                <p className="text-sm text-neutral-400 font-medium">No global tracks configured.</p>
                <button type="button" onClick={handleResetDefaultGlobalMusic} className="text-xs text-rose-400 underline hover:text-rose-300 font-semibold cursor-pointer">
                  Restore default factory presets
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ALL ADMIN CREDENTIALS & ACCESS CONTROL CARD */}
        <div id="credentials_section" className="bg-neutral-900/60 border border-white/10 rounded-3xl p-6 sm:p-7 relative shadow-xl backdrop-blur-xl transition-all hover:border-white/15 scroll-mt-24">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-indigo-500/15 border border-indigo-500/25 rounded-2xl text-indigo-400 shadow-inner">
                <KeyRound className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-serif font-bold text-white tracking-wide">Admin Portal Credentials</h2>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">{adminAccountsList.length} Active</span>
                </div>
                <p className="text-[11px] text-neutral-400 font-mono mt-0.5">Synchronized across Firestore & Supabase</p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button type="button" onClick={handleSyncAllAdmins} disabled={isSyncing} className="text-xs text-sky-300 hover:text-white font-mono flex items-center gap-1.5 bg-sky-500/10 hover:bg-sky-500/20 px-3 py-2 rounded-xl border border-sky-500/25 transition-all cursor-pointer disabled:opacity-50 shadow-sm" title="Sync all admin credentials across database tables">
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? "animate-spin" : ""}`} />
                <span>Sync All</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setNewAdminUser("");
                  setNewAdminPass("");
                  setNewAdminRole("Super Admin");
                  setNewAdminNotes("");
                  setIsAddingAdmin(true);
                }}
                className="text-xs text-white font-mono font-medium flex items-center gap-1.5 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 px-3.5 py-2 rounded-xl transition-all cursor-pointer shadow-md shadow-indigo-500/20 active:scale-[0.98]"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Add Admin</span>
              </button>
            </div>
          </div>

          <p className="text-xs text-neutral-400 leading-relaxed mb-5">Manage all administrator login accounts and permissions for the admin portal. All changes immediately sync across Firestore & Supabase databases.</p>

          <AnimatePresence>
            {adminSuccessMsg && (
              <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mb-4 p-3.5 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl text-xs text-emerald-300 flex items-center gap-2.5 shadow-sm">
                <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <span className="font-medium">{adminSuccessMsg}</span>
              </motion.div>
            )}
            {adminErrorMsg && (
              <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mb-4 p-3.5 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-xs text-rose-300 flex items-center gap-2.5 shadow-sm">
                <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
                <span className="font-medium">{adminErrorMsg}</span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* List of Admin Accounts */}
          <div className="space-y-3.5">
            <div className="flex items-center justify-between pb-1">
              <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest font-mono flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
                Registered Admin Accounts ({adminAccountsList.length})
              </span>
              <button
                type="button"
                onClick={() => {
                  const next = !showAllAdminPasswords;
                  setShowAllAdminPasswords(next);
                  if (!next) {
                    setShowAdminPasswordIds({});
                  }
                }}
                className="text-[11px] text-neutral-400 hover:text-white font-mono flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                {showAllAdminPasswords ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                <span>{showAllAdminPasswords ? "Hide Passwords" : "Show Passwords"}</span>
              </button>
            </div>

            {adminAccountsList.length === 0 ? (
              <div className="p-5 rounded-2xl bg-neutral-950/50 border border-white/5 text-center text-xs text-neutral-500 font-mono">No custom admin accounts configured. Default environment admin is active.</div>
            ) : (
              adminAccountsList.map((acc, index) => {
                const isPasswordShown = showAllAdminPasswords || !!showAdminPasswordIds[acc.id];
                const displayPass = acc.password ? (isPasswordShown ? (acc.password.startsWith("sha256_v1:") ? "🔒 [SHA-256 Hashed]" : acc.password) : "••••••••") : "(No password set)";

                return (
                  <div key={`acc-${acc.id}-${index}`} className="p-4 rounded-2xl bg-neutral-950/70 border border-white/10 hover:border-indigo-500/35 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 text-xs shadow-sm hover:shadow-md hover:bg-neutral-950/90 group">
                    <div className="flex items-start gap-3.5">
                      <div className="p-2.5 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-indigo-400 shrink-0 mt-0.5 group-hover:border-indigo-500/40 transition-colors">
                        <ShieldCheck className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-white text-sm font-serif tracking-wide">{acc.username}</span>
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">{acc.role || "Super Admin"}</span>
                          {index === 0 && (
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-mono uppercase font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                              Primary
                            </span>
                          )}
                          {acc.twoFactorEnabled ? (
                            <button type="button" onClick={() => handleOpen2FAModalForAdmin(acc)} className="px-2 py-0.5 rounded-full text-[9px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1 hover:bg-emerald-500/30 transition-colors cursor-pointer" title="2FA Active - Click to view recovery codes or reconfigure">
                              <ShieldCheck className="w-2.5 h-2.5 text-emerald-400" />
                              <span>2FA Active</span>
                            </button>
                          ) : (
                            <button type="button" onClick={() => handleOpen2FAModalForAdmin(acc)} className="px-2 py-0.5 rounded-full text-[9px] font-mono font-bold bg-amber-500/10 text-amber-300 border border-amber-500/20 flex items-center gap-1 hover:bg-amber-500/20 transition-colors cursor-pointer" title="Click to enable Google Authenticator 2FA">
                              <KeyRound className="w-2.5 h-2.5 text-amber-400" />
                              <span>Setup 2FA</span>
                            </button>
                          )}
                        </div>

                        <div className="flex items-center gap-2 text-[11px] text-neutral-400 font-mono mt-1.5">
                          <Lock className="w-3 h-3 text-neutral-500" />
                          <span className="tracking-wider">{displayPass}</span>
                          <button type="button" onClick={() => setShowAdminPasswordIds((prev) => ({ ...prev, [acc.id]: !prev[acc.id] }))} className="text-neutral-500 hover:text-neutral-200 transition-colors ml-1 p-0.5 rounded cursor-pointer" title={isPasswordShown ? "Hide password" : "Show password"}>
                            {isPasswordShown ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                          </button>
                        </div>

                        {acc.notes && <p className="text-[11px] text-neutral-500 mt-1 italic">{acc.notes}</p>}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                      <button type="button" onClick={() => handleOpen2FAModalForAdmin(acc)} className={`p-2 rounded-xl border transition-all cursor-pointer ${acc.twoFactorEnabled ? "border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300" : "border-white/10 hover:bg-white/10 text-neutral-400 hover:text-white"}`} title={acc.twoFactorEnabled ? "Manage Google Authenticator 2FA" : "Enable Google Authenticator 2FA"}>
                        <ShieldCheck className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handleSyncAdminAccount(acc)} disabled={isSyncing || syncingAdminId === acc.id} className="p-2 rounded-xl border border-sky-500/20 hover:bg-sky-500/15 text-sky-400 hover:text-sky-300 transition-all cursor-pointer disabled:opacity-50" title={`Sync "${acc.username}" credential to Firestore & Supabase`}>
                        <RefreshCw className={`w-3.5 h-3.5 ${syncingAdminId === acc.id ? "animate-spin text-sky-300" : ""}`} />
                      </button>
                      <button
                        onClick={() => {
                          setEditingAdmin(acc);
                          setEditAdminUser(acc.username);
                          setEditAdminPass("");
                          setEditAdminRole(acc.role || "Super Admin");
                          setEditAdminNotes(acc.notes || "");
                        }}
                        className="p-2 rounded-xl border border-indigo-500/20 hover:bg-indigo-500/15 text-indigo-400 hover:text-indigo-300 transition-all cursor-pointer"
                        title={`Edit "${acc.username}" admin account`}
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => setAdminToDelete(acc)} disabled={adminAccountsList.length <= 1} className="p-2 rounded-xl border border-rose-500/20 hover:bg-rose-500/15 text-rose-400 hover:text-rose-300 transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed" title={adminAccountsList.length <= 1 ? "Cannot delete last admin account" : `Delete "${acc.username}" admin account`}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="mt-6 pt-4 border-t border-white/5 flex items-start gap-2.5 text-[11px] text-neutral-500 leading-relaxed font-mono">
            <ShieldAlert className="w-4 h-4 text-neutral-500 flex-shrink-0 mt-0.5" />
            <span>All admin accounts grant full administrative access to the Our Home portal and activity logs.</span>
          </div>
        </div>

        {/* TAB VISIBILITY CONTROLS CARD */}
        <div id="visibility_overrides_section" className="bg-neutral-900/60 border border-white/10 rounded-3xl p-6 sm:p-7 relative shadow-xl backdrop-blur-xl transition-all hover:border-white/15 scroll-mt-24">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2.5 bg-indigo-500/15 border border-indigo-500/25 rounded-2xl text-indigo-400 shadow-inner">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-serif font-bold text-white tracking-wide">Tab Visibility Controls</h2>
              <p className="text-[11px] text-neutral-400 font-mono mt-0.5">Global defaults & user overrides</p>
            </div>
          </div>

          <p className="text-xs text-neutral-400 leading-relaxed mb-5">Enable or disable tabs instantly across the application. Manage global defaults or configure user-specific tab access overrides.</p>

          {/* Batch Action Toolbar */}
          <div className="flex items-center justify-between gap-2 mb-4 p-2 bg-neutral-950/60 rounded-2xl border border-white/5">
            <span className="text-[10px] text-neutral-400 font-mono uppercase tracking-wider pl-1">Quick Batch Actions:</span>
            <div className="flex items-center gap-1.5">
              <button type="button" onClick={() => handleBatchToggleTabs(true)} disabled={isSyncing} className="px-2.5 py-1 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 text-indigo-300 rounded-xl text-[11px] font-medium transition-all cursor-pointer flex items-center gap-1 shadow-sm disabled:opacity-50" title="Enable all tabs for current target">
                <Check className="w-3 h-3 text-indigo-400" />
                <span>Enable All</span>
              </button>
              <button type="button" onClick={() => handleBatchToggleTabs(false)} disabled={isSyncing} className="px-2.5 py-1 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-300 rounded-xl text-[11px] font-medium transition-all cursor-pointer flex items-center gap-1 shadow-sm disabled:opacity-50" title="Disable all tabs for current target">
                <EyeOff className="w-3 h-3 text-rose-400" />
                <span>Disable All</span>
              </button>
            </div>
          </div>

          {/* Target Selector Horizontal Scrollable Pills */}
          <div className="mb-4">
            <label className="text-[10px] text-neutral-500 font-mono uppercase tracking-wider block mb-1.5 pl-1">Select Configuration Scope:</label>
            <HorizontalScrollWrapper scrollContainerClassName="p-1 bg-neutral-950/80 border border-white/5 rounded-2xl gap-1.5 w-full">
              <button type="button" onClick={() => setSelectedTargetUser("all")} className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap cursor-pointer flex items-center gap-1.5 shrink-0 ${selectedTargetUser === "all" ? "bg-indigo-600 text-white shadow-md" : "text-neutral-400 hover:text-white hover:bg-white/5"}`}>
                <Sliders className="w-3.5 h-3.5" />
                <span>All Users (Global)</span>
              </button>
              {(() => {
                const seen = new Set<string>();
                const uniqueUsers = userAccounts.filter((u) => {
                  const key = (u.id || u.username || "").toLowerCase().trim();
                  if (!key || seen.has(key)) return false;
                  seen.add(key);
                  return true;
                });
                return uniqueUsers.map((user, idx) => {
                  const hasCustomOverrides =
                    user.visibleTabs &&
                    TABS_LIST.some((t) => {
                      if (user.visibleTabs && t.id in user.visibleTabs && user.visibleTabs[t.id] !== undefined) {
                        const uVis = user.visibleTabs[t.id] === true;
                        const gVis = visibleTabs[t.id] !== false;
                        return uVis !== gVis;
                      }
                      return false;
                    });
                  return (
                    <button key={`override-user-${user.id || user.username}-${idx}`} type="button" onClick={() => setSelectedTargetUser(user.id)} className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all whitespace-nowrap capitalize cursor-pointer flex items-center gap-1.5 shrink-0 ${selectedTargetUser === user.id ? "bg-indigo-600 text-white shadow-md" : "text-neutral-400 hover:text-white hover:bg-white/5"}`}>
                      <User className="w-3.5 h-3.5" />
                      <span>{user.username}</span>
                      {hasCustomOverrides && <span className="w-2 h-2 rounded-full bg-amber-400" title="Has custom overrides" />}
                    </button>
                  );
                });
              })()}
            </HorizontalScrollWrapper>
          </div>

          {/* Tab List */}
          <div className="space-y-3">
            {TABS_LIST.map((tab, idx) => {
              const TabIcon = tab.icon;
              const isGloballyVisible = visibleTabs[tab.id] !== false;

              let isVisible = isGloballyVisible;
              if (selectedTargetUser !== "all") {
                const targetUser = userAccounts.find((u) => u.id === selectedTargetUser);
                if (targetUser?.visibleTabs && tab.id in targetUser.visibleTabs && targetUser.visibleTabs[tab.id] !== undefined) {
                  isVisible = targetUser.visibleTabs[tab.id] === true;
                }
              }
              const isOverridden = selectedTargetUser !== "all" && isVisible !== isGloballyVisible;

              return (
                <div key={`tab-visibility-item-${tab.id}-${idx}`} className="flex items-center justify-between p-3 rounded-2xl bg-neutral-950/50 border border-white/5 hover:border-white/10 transition-all gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`p-2.5 rounded-xl border shrink-0 transition-all ${isVisible ? "bg-indigo-500/10 border-indigo-500/25 text-indigo-400 shadow-[0_0_12px_rgba(99,102,241,0.15)]" : "bg-neutral-900 border-white/5 text-neutral-500"}`}>
                      <TabIcon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <h4 className="text-xs font-bold text-white capitalize truncate">{tab.label}</h4>
                        {selectedTargetUser !== "all" && !isGloballyVisible && <span className="text-[8px] font-bold text-rose-400 bg-rose-500/10 border border-rose-500/20 px-1.5 py-0.5 rounded font-mono uppercase tracking-wider">Globally Disabled</span>}
                        {selectedTargetUser !== "all" && isOverridden && <span className="text-[8px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded font-mono uppercase tracking-wider">User Override</span>}
                      </div>
                      <p className="text-[10px] text-neutral-400 leading-normal line-clamp-1 mt-0.5">{tab.desc}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-[10px] font-mono hidden sm:inline ${isVisible ? "text-emerald-400 font-semibold" : "text-neutral-500"}`}>{isVisible ? "Visible" : "Hidden"}</span>
                    <button onClick={() => handleToggleTabVisibility(tab.id)} disabled={isSyncing} className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${isVisible ? "bg-indigo-600 shadow-[0_0_10px_rgba(79,70,229,0.4)]" : "bg-neutral-800"}`} title={`Click to ${isVisible ? "disable" : "enable"} ${tab.label}`}>
                      <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${isVisible ? "translate-x-5" : "translate-x-0"}`} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* SUBSCRIPTION PLANS & TAB LIMITATIONS SECTION (CRUD - FULL WIDTH) */}
        <div id="subscription_tiers_section" className="w-full bg-neutral-900/60 border border-amber-500/25 rounded-3xl p-6 sm:p-8 relative shadow-2xl backdrop-blur-xl transition-all hover:border-amber-500/40 overflow-hidden space-y-6 scroll-mt-24">
          {/* AMBIENT BACKGROUND GLOW */}
          <div className="absolute top-0 right-0 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

          {/* SECTION HEADER & ADD TIER BUTTON */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-5 border-b border-white/10 relative z-10">
            <div className="flex items-center gap-3.5">
              <div className="p-3 bg-amber-500/15 border border-amber-500/30 rounded-2xl text-amber-400 shrink-0 shadow-inner">
                <Crown className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-xl font-serif font-bold text-white tracking-wide">Subscription Tiers & Tab Limits</h2>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase font-mono tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/30">Monetization Engine</span>
                </div>
                <p className="text-xs text-neutral-400 mt-1 font-mono">Configure subscription tiers (Free, Pro, Custom), per-tab feature access locks & item quotas across all couple workspaces.</p>
              </div>
            </div>

            <button type="button" onClick={handleOpenAddPlanModal} className="px-4 py-2 bg-gradient-to-r from-amber-500 to-rose-500 hover:from-amber-400 hover:to-rose-400 text-neutral-950 font-bold text-xs rounded-xl shadow-lg shadow-amber-950/40 flex items-center gap-1.5 transition-all cursor-pointer shrink-0">
              <Plus className="w-4 h-4 stroke-[3]" />
              Add New Tier
            </button>
          </div>

          {/* Plan Switcher Pills */}
          <HorizontalScrollWrapper scrollContainerClassName="gap-2 py-1">
            {subscriptionPlans.map((plan, idx) => {
              const isActive = selectedPlanId === plan.id;
              return (
                <div key={`sub-plan-pill-${plan.id}-${idx}`} className={`flex items-center gap-2 px-3.5 py-2 rounded-xl border text-xs font-bold transition-all cursor-pointer shrink-0 ${isActive ? "bg-amber-500/20 border-amber-500/50 text-amber-300 shadow-md shadow-amber-950/50 ring-1 ring-amber-500/30" : "bg-neutral-950/60 border-white/5 text-neutral-400 hover:text-white hover:border-white/20"}`} onClick={() => setSelectedPlanId(plan.id)}>
                  <Crown className={`w-3.5 h-3.5 ${isActive ? "text-amber-400" : "text-neutral-500"}`} />
                  <span>{plan.name}</span>
                  <span className="text-[10px] font-mono opacity-80 bg-white/5 px-2 py-0.5 rounded">{plan.price}</span>
                  {plan.isDefault && <span className="text-[9px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-1.5 py-0.2 rounded font-mono">DEFAULT</span>}
                </div>
              );
            })}
          </HorizontalScrollWrapper>

          {/* Selected Plan Detail & Feature Limits Editor */}
          {(() => {
            const activePlan = subscriptionPlans.find((p) => p.id === selectedPlanId) || subscriptionPlans[0];
            if (!activePlan) return null;

            return (
              <div className="bg-neutral-950/80 border border-white/10 rounded-2xl p-4 sm:p-5 space-y-4">
                {/* Plan Overview & Actions */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 bg-neutral-900/80 border border-white/5 rounded-xl">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm sm:text-base font-bold text-white">{activePlan.name}</h3>
                      <span className="text-[11px] font-mono font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-lg">ID: {activePlan.id}</span>
                      <span className="text-[11px] font-mono text-emerald-400 font-bold bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 rounded-lg">{activePlan.price}</span>
                      <span className="text-[11px] font-mono text-cyan-300 font-bold bg-cyan-500/10 border border-cyan-500/20 px-2.5 py-0.5 rounded-lg">{activePlan.durationDays === -1 || activePlan.durationDays === undefined || activePlan.durationDays <= 0 ? "♾️ Lifetime" : `⏳ ${activePlan.durationDays} Days Duration`}</span>
                    </div>
                    <p className="text-xs text-neutral-400">{activePlan.description}</p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button type="button" onClick={() => handleOpenEditPlanModal(activePlan)} className="px-2.5 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-semibold rounded-lg border border-white/10 flex items-center gap-1.5 transition-colors cursor-pointer">
                      <Edit3 className="w-3.5 h-3.5 text-amber-400" />
                      Edit Plan
                    </button>
                    <button type="button" onClick={() => handleDeletePlan(activePlan.id)} className="px-2.5 py-1.5 bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 text-xs font-semibold rounded-lg border border-rose-500/20 flex items-center gap-1.5 transition-colors cursor-pointer">
                      <Trash2 className="w-3.5 h-3.5" />
                      Delete
                    </button>
                  </div>
                </div>

                {/* Tab Limitations Table */}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between flex-wrap gap-1">
                    <h4 className="text-xs font-bold text-neutral-300 uppercase tracking-wider font-mono flex items-center gap-2">
                      <Sliders className="w-3.5 h-3.5 text-amber-400" />
                      Tab Limitations Matrix for "{activePlan.name}"
                    </h4>
                    <span className="text-[10px] text-neutral-400 italic">Auto-saves & applies instantly</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5 w-full">
                    {TABS_LIST.map((tab, tIdx) => {
                      const TabIcon = tab.icon;
                      const tabLimit: TabLimitation = activePlan.tabLimits?.[tab.id] || { maxLimit: -1, isLocked: false };
                      const isLocked = !!tabLimit.isLocked;
                      const maxLimit = tabLimit.maxLimit ?? -1;

                      return (
                        <div key={`plan-tab-matrix-${activePlan.id}-${tab.id}-${tIdx}`} className={`p-3 rounded-xl border transition-all flex flex-col justify-between gap-2.5 ${isLocked ? "bg-rose-950/15 border-rose-500/30" : "bg-neutral-900/60 border-white/5 hover:border-white/15"}`}>
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <div className={`p-1.5 rounded-lg border shrink-0 ${isLocked ? "bg-rose-500/20 border-rose-500/40 text-rose-400" : "bg-amber-500/10 border-amber-500/20 text-amber-400"}`}>
                                <TabIcon className="w-3.5 h-3.5" />
                              </div>
                              <div className="min-w-0">
                                <h5 className="text-xs font-bold text-white capitalize truncate">{tab.label}</h5>
                                <p className="text-[10px] text-neutral-400 truncate">{tab.desc}</p>
                              </div>
                            </div>

                            {/* Locked / Unlocked Toggle */}
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className={`text-[9.5px] font-mono font-bold ${isLocked ? "text-rose-400" : "text-emerald-400"}`}>{isLocked ? "LOCKED" : "UNLOCKED"}</span>
                              <button type="button" onClick={() => handleTogglePlanTabLock(activePlan.id, tab.id)} className={`relative inline-flex h-4.5 w-8 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${isLocked ? "bg-rose-600" : "bg-emerald-600"}`} title={`Toggle lock status for ${tab.label}`}>
                                <span className={`pointer-events-none inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${isLocked ? "translate-x-0" : "translate-x-3.5"}`} />
                              </button>
                            </div>
                          </div>

                          {/* Limit Quota Selector */}
                          {!isLocked && (
                            <div className="space-y-1.5 pt-1.5 border-t border-white/5">
                              <div className="flex items-center justify-between text-[10px]">
                                <span className="text-neutral-400">Limit Quota:</span>
                                <span className="font-mono font-bold text-amber-300">{maxLimit === -1 ? "Unlimited (∞)" : `Max ${maxLimit}`}</span>
                              </div>

                              {/* Manual Numeric Input Box + Unlimited Button */}
                              <div className="flex items-center gap-1.5">
                                <div className="relative flex-1">
                                  <input
                                    type="number"
                                    min="-1"
                                    placeholder="Limit"
                                    value={maxLimit === -1 ? "" : maxLimit}
                                    onChange={(e) => {
                                      const rawVal = e.target.value;
                                      if (rawVal === "") {
                                        handleUpdatePlanTabLimit(activePlan.id, tab.id, -1);
                                      } else {
                                        const num = parseInt(rawVal, 10);
                                        handleUpdatePlanTabLimit(activePlan.id, tab.id, isNaN(num) ? -1 : num);
                                      }
                                    }}
                                    className="w-full bg-neutral-950 border border-white/10 rounded-lg px-2 py-1 text-xs font-mono text-amber-300 focus:outline-none focus:border-amber-500/80 placeholder:text-neutral-600"
                                  />
                                  {maxLimit === -1 && <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9.5px] text-emerald-400 font-bold pointer-events-none">∞</span>}
                                </div>

                                <button type="button" onClick={() => handleUpdatePlanTabLimit(activePlan.id, tab.id, maxLimit === -1 ? 5 : -1)} className={`px-2 py-1 rounded-lg text-[9.5px] font-bold border transition-all cursor-pointer shrink-0 ${maxLimit === -1 ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40" : "bg-neutral-800 text-neutral-300 border-white/10 hover:border-amber-500/40"}`}>
                                  {maxLimit === -1 ? "✓ ∞" : "Unlimited"}
                                </button>
                              </div>

                              {/* Quota Quick Presets */}
                              <div className="flex items-center gap-1 flex-wrap pt-0.5">
                                {[-1, 3, 5, 10, 25, 50].map((preset, pIdx) => (
                                  <button key={`preset-${activePlan.id}-${tab.id}-${preset}-${pIdx}`} type="button" onClick={() => handleUpdatePlanTabLimit(activePlan.id, tab.id, preset)} className={`px-1.5 py-0.5 rounded text-[9.5px] font-mono font-bold border transition-colors cursor-pointer ${maxLimit === preset ? "bg-amber-500 text-neutral-950 border-amber-400 shadow-sm" : "bg-neutral-800 text-neutral-300 border-white/10 hover:border-amber-500/40"}`}>
                                    {preset === -1 ? "∞" : preset}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Note / Description on Upgrade Modal */}
                          <div className="pt-0.5">
                            <input type="text" placeholder={`Label (e.g. Max ${maxLimit === -1 ? "unlimited" : maxLimit} items)`} value={tabLimit.description || ""} onChange={(e) => handleUpdatePlanTabDesc(activePlan.id, tab.id, e.target.value)} className="w-full bg-neutral-950 border border-white/10 rounded-lg px-2 py-0.5 text-[9.5px] text-neutral-300 focus:outline-none focus:border-amber-500/50" />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })()}
        </div>

        {/* PROMO CODES & SUBSCRIPTION COUPONS MANAGEMENT SECTION */}
        <div id="promo_coupons_section" className="w-full bg-neutral-900/60 border border-purple-500/20 rounded-3xl p-6 sm:p-7 relative shadow-2xl backdrop-blur-xl transition-all hover:border-purple-500/30 overflow-hidden space-y-6 scroll-mt-24">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-white/10">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-purple-500/15 border border-purple-500/30 rounded-2xl text-purple-400 shrink-0 shadow-inner">
                <Ticket className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-serif font-bold text-white tracking-wide">Promo Codes & Subscription Coupons</h2>
                  <span className="text-[10px] font-bold text-purple-300 bg-purple-500/15 border border-purple-500/30 px-2 py-0.5 rounded-full uppercase tracking-wider">Discounts & Promotions</span>
                </div>
                <p className="text-xs text-neutral-400 mt-0.5">Create, edit, and manage discount promo codes for subscription upgrades (e.g., 50% OFF, $2.00 OFF, or free VIP codes).</p>
              </div>
            </div>

            <button type="button" onClick={handleOpenAddPromoModal} className="px-4 py-2 bg-gradient-to-r from-purple-500 to-rose-500 hover:from-purple-400 hover:to-rose-400 text-white font-bold text-xs rounded-xl shadow-lg shadow-purple-950/40 flex items-center gap-1.5 transition-all cursor-pointer shrink-0">
              <Plus className="w-4 h-4 stroke-[3]" />
              Add New Promo Code
            </button>
          </div>

          {/* Promo Codes Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 w-full">
            {promoCodes.map((promo, idx) => {
              const isExpired = promo.expiresAt && new Date(promo.expiresAt) < new Date();
              const isMaxedOut = promo.maxUses !== undefined && promo.maxUses !== -1 && (promo.timesUsed || 0) >= promo.maxUses;

              return (
                <div key={`promo-card-${promo.id}-${idx}`} className={`p-4 rounded-2xl border bg-neutral-950/80 flex flex-col justify-between gap-3 relative transition-all ${!promo.isActive ? "border-white/5 opacity-60" : isExpired || isMaxedOut ? "border-amber-500/30 bg-amber-950/10" : "border-purple-500/30 hover:border-purple-500/50 shadow-md shadow-purple-950/20"}`}>
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="px-2.5 py-1 bg-purple-500/20 border border-purple-500/40 text-purple-300 rounded-lg font-mono font-bold text-xs tracking-wider uppercase inline-flex items-center gap-1">
                          <Tag className="w-3 h-3 text-purple-400" />
                          {promo.code}
                        </span>
                        <span className="text-[10px] font-mono font-bold text-amber-300 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded">{promo.discountType === "percentage" ? `${promo.discountValue}% OFF` : `$${promo.discountValue} OFF`}</span>
                      </div>

                      {/* Active Toggle Badge */}
                      <button type="button" onClick={() => handleTogglePromoActive(promo.id)} className={`text-[9px] font-mono font-bold uppercase px-2 py-0.5 rounded border cursor-pointer transition-all shrink-0 ${promo.isActive ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/30" : "bg-neutral-800 text-neutral-400 border-white/10 hover:bg-neutral-700"}`}>
                        {promo.isActive ? "Active" : "Inactive"}
                      </button>
                    </div>

                    <p className="text-xs text-neutral-300 line-clamp-2 mb-2">{promo.description || "No description provided."}</p>

                    <div className="space-y-1 text-[11px] font-mono text-neutral-400 bg-neutral-900/60 p-2.5 rounded-xl border border-white/5">
                      <div className="flex justify-between">
                        <span>Applies To:</span>
                        <span className="text-neutral-200 font-semibold truncate max-w-[140px]">{promo.applicablePlanIds?.includes("all") ? "All Subscription Tiers" : promo.applicablePlanIds?.join(", ").toUpperCase()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Redemptions:</span>
                        <span className={`font-semibold ${isMaxedOut ? "text-rose-400" : "text-neutral-200"}`}>
                          {promo.timesUsed || 0} / {promo.maxUses === -1 || !promo.maxUses ? "∞ Unlimited" : promo.maxUses}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Expiration:</span>
                        <span className={`font-semibold ${isExpired ? "text-rose-400" : "text-neutral-200"}`}>{promo.expiresAt ? promo.expiresAt : "Never (Lifetime)"}</span>
                      </div>
                    </div>
                  </div>

                  {/* Actions footer */}
                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/5">
                    <button type="button" onClick={() => handleOpenEditPromoModal(promo)} className="px-2.5 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer">
                      <Edit3 className="w-3.5 h-3.5 text-purple-400" />
                      Edit
                    </button>
                    <button type="button" onClick={() => handleDeletePromoCode(promo.id)} className="px-2.5 py-1 bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-500/20 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer">
                      <Trash2 className="w-3.5 h-3.5" />
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* SUPABASE SCHEMA & TABLE DIAGNOSTICS CARD */}
        <div id="db_diagnostics_section" className="w-full bg-neutral-900/60 border border-white/10 rounded-3xl p-6 sm:p-7 relative shadow-xl backdrop-blur-xl transition-all hover:border-white/15 overflow-hidden scroll-mt-24">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-sky-500/15 border border-sky-500/25 rounded-2xl text-sky-400 shrink-0 shadow-inner">
                <Database className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-serif font-bold text-white tracking-wide">Database Diagnostics & Sync</h2>
                <p className="text-[11px] text-neutral-400 font-mono mt-0.5">Automated table existence & sync checks</p>
              </div>
            </div>
            <button onClick={() => refreshTableDiagnostics()} disabled={isCheckingTables} className="p-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-xs text-neutral-300 transition-all cursor-pointer flex items-center gap-1.5 shrink-0" title="Re-check table status">
              <RefreshCw className={`w-3.5 h-3.5 ${isCheckingTables ? "animate-spin text-sky-400" : ""}`} />
              <span className="hidden sm:inline">Check Tables</span>
            </button>
          </div>

          <p className="text-xs text-neutral-400 leading-relaxed mb-4">Verifies if critical Supabase PostgreSQL tables exist in schema cache upon application load. Missing tables automatically trigger local fallback storage to guarantee zero downtime.</p>

          {/* Overall Status Banner */}
          {tableDiagnostics && (
            <div className={`p-3 rounded-2xl border mb-4 flex items-center justify-between gap-3 text-xs ${tableDiagnostics.allCriticalTablesExist ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-300" : tableDiagnostics.configured ? "bg-amber-500/10 border-amber-500/20 text-amber-300" : "bg-neutral-800/80 border-neutral-700 text-neutral-300"}`}>
              <div className="flex items-center gap-2">
                {tableDiagnostics.allCriticalTablesExist ? <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" /> : tableDiagnostics.configured ? <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" /> : <Database className="w-4 h-4 text-neutral-400 shrink-0" />}
                <span className="font-semibold">{tableDiagnostics.allCriticalTablesExist ? "All Critical Tables Active & Synchronized" : tableDiagnostics.configured ? "Synchronization Issue: Some Critical Tables Missing" : "Supabase Unconfigured (Local Storage Active)"}</span>
              </div>
              <span className="text-[10px] font-mono text-neutral-400 shrink-0">Checked: {tableDiagnostics.checkedAt}</span>
            </div>
          )}

          {/* Table Indicators Grid */}
          {tableDiagnostics && (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2.5 mb-4 w-full">
              {tableDiagnostics.tables.map((t, idx) => {
                const isActive = t.status === "active";
                const isMissing = t.status === "missing";
                const isError = t.status === "error";

                return (
                  <div key={`diag-table-${t.tableName}-${idx}`} className={`p-2.5 rounded-2xl border flex items-center justify-between transition-all ${isActive ? "bg-neutral-950/40 border-white/5 hover:border-emerald-500/30" : isMissing ? "bg-rose-500/10 border-rose-500/30 text-rose-300" : isError ? "bg-amber-500/10 border-amber-500/30 text-amber-300" : "bg-neutral-950/20 border-white/5 text-neutral-400"}`}>
                    <div className="min-w-0 pr-2">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-semibold text-white truncate block">{t.displayName}</span>
                      </div>
                      <span className="text-[10px] font-mono text-neutral-400 block truncate">public.{t.tableName}</span>
                    </div>

                    <div className="shrink-0 flex items-center gap-1.5">
                      {isActive && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> Active
                        </span>
                      )}
                      {isMissing && (
                        <div className="flex items-center gap-1">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/30 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse"></span> Missing
                          </span>
                          <button onClick={() => setShowSqlSetupModal(true)} className="px-2 py-0.5 rounded-lg text-[10px] font-semibold bg-rose-600/80 hover:bg-rose-500 text-white border border-rose-400/40 shadow-sm transition-all cursor-pointer flex items-center gap-1" title="Fix missing table schema">
                            <Wrench className="w-3 h-3" /> Fix
                          </button>
                        </div>
                      )}
                      {isError && (
                        <div className="flex items-center gap-1">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span> Error
                          </span>
                          <button onClick={() => setShowSqlSetupModal(true)} className="px-2 py-0.5 rounded-lg text-[10px] font-semibold bg-amber-600/80 hover:bg-amber-500 text-white border border-amber-400/40 shadow-sm transition-all cursor-pointer flex items-center gap-1" title="Fix database error">
                            <Wrench className="w-3 h-3" /> Fix
                          </button>
                        </div>
                      )}
                      {t.status === "unconfigured" && <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-neutral-800 text-neutral-400 border border-neutral-700">Offline</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Database Schema Repair & SQL Setup Action Banner */}
          <div className="p-4 bg-indigo-950/40 border border-indigo-500/30 rounded-2xl text-xs space-y-3 shadow-lg relative overflow-hidden">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-indigo-200 font-bold text-sm">
                <Wrench className="w-5 h-5 text-indigo-400 shrink-0" />
                <span>Supabase Schema Tools & SQL Migration Script</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={handleAutoFixDatabase} disabled={isFixingDb} className="px-3.5 py-1.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-xs font-semibold rounded-xl shadow transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50" title="Run automatic schema repair and sync routine">
                  <Wrench className={`w-3.5 h-3.5 ${isFixingDb ? "animate-spin" : ""}`} />
                  <span>{isFixingDb ? "Repairing Schema..." : "Fix DB / Auto-Repair"}</span>
                </button>
                <button onClick={() => setShowSqlSetupModal(true)} className="px-3.5 py-1.5 bg-indigo-500/30 hover:bg-indigo-500/40 border border-indigo-400/40 text-indigo-100 text-xs font-semibold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shadow-sm">
                  <Code className="w-3.5 h-3.5 text-indigo-300" />
                  <span>View SQL Fix Code</span>
                </button>
              </div>
            </div>
            <p className="text-xs text-indigo-200/90 leading-relaxed">
              If any Supabase PostgreSQL tables or columns (like <code className="text-white font-mono bg-black/50 px-1.5 py-0.5 rounded border border-indigo-500/30">public.user_accounts</code> or <code className="text-white font-mono bg-black/50 px-1.5 py-0.5 rounded border border-indigo-500/30">couple_tenants.animation_song_link</code>) are missing or not updated in remote Supabase, click <strong className="text-amber-200">Fix DB / Auto-Repair</strong> to automatically heal schema fields, or
              click <strong className="text-sky-200">View SQL Fix Code</strong> to copy and run the complete SQL script in your Supabase SQL Editor.
            </p>
            {autoFixMessage && (
              <div className={`p-2.5 rounded-xl text-xs font-mono flex items-center gap-2 ${autoFixMessage.type === "success" ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30" : "bg-rose-500/20 text-rose-300 border border-rose-500/30"}`}>
                {autoFixMessage.type === "success" ? <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" /> : <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />}
                <span>{autoFixMessage.text}</span>
              </div>
            )}
          </div>
        </div>

        {/* DATABASE MAINTENANCE & DEDUPLICATION MIGRATION ROUTINE CARD */}
        <div className="bg-neutral-900/50 border border-white/10 rounded-3xl p-6 relative overflow-hidden">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl text-indigo-400 shrink-0">
                <Database className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-serif font-bold text-white">Database Maintenance & Clean</h2>
                <p className="text-[10px] text-neutral-400 font-mono uppercase tracking-wider">Sync & Purge Firestore Data</p>
              </div>
            </div>
            <button onClick={() => refreshDbStatus()} disabled={isCheckingDb} className="p-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-xs text-neutral-300 transition-all cursor-pointer flex items-center gap-1.5 shrink-0" title="Ping connection health">
              <RefreshCw className={`w-3.5 h-3.5 ${isCheckingDb ? "animate-spin text-indigo-400" : ""}`} />
              <span className="hidden sm:inline">Ping</span>
            </button>
          </div>

          <p className="text-xs text-neutral-400 leading-relaxed mb-3">Check database health, verify connectivity, deduplicate activity logs & settings, and safely purge old Firestore documents to keep Firestore focused purely on realtime chat & presence.</p>

          {/* Connection latency details in compact row */}
          <div className="grid grid-cols-2 gap-2 mb-3">
            <div className="p-2.5 bg-neutral-950/50 border border-white/5 rounded-2xl flex items-center justify-between">
              <div>
                <span className="text-[9px] text-neutral-500 uppercase tracking-widest font-mono block">Firebase DB</span>
                <span className={`text-xs font-semibold ${dbStatus.firebase.online ? "text-emerald-400" : "text-rose-400"}`}>{dbStatus.firebase.online ? "Connected" : "Offline"}</span>
              </div>
              <span className="text-[10px] text-neutral-400 font-mono px-1.5 py-0.5 bg-white/5 rounded-md">{dbStatus.firebase.latencyMs}ms</span>
            </div>

            <div className="p-2.5 bg-neutral-950/50 border border-white/5 rounded-2xl flex items-center justify-between">
              <div>
                <span className="text-[9px] text-neutral-500 uppercase tracking-widest font-mono block">Supabase DB</span>
                <span className={`text-xs font-semibold ${dbStatus.supabase.online ? "text-emerald-400" : "text-amber-400"}`}>{dbStatus.supabase.online ? "Connected" : "Local Fallback"}</span>
              </div>
              <span className="text-[10px] text-neutral-400 font-mono px-1.5 py-0.5 bg-white/5 rounded-md">{dbStatus.supabase.latencyMs}ms</span>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2">
            <button onClick={handleRunMigration} disabled={isMigrating} className="w-full bg-gradient-to-r from-indigo-600 to-rose-600 hover:from-indigo-500 hover:to-rose-500 text-white font-semibold text-xs py-2.5 px-4 rounded-2xl transition-all cursor-pointer flex items-center justify-center gap-2 shadow-lg disabled:opacity-50">
              <RefreshCw className={`w-4 h-4 ${isMigrating ? "animate-spin" : ""}`} />
              {isMigrating ? "Processing Deduplication & Purge..." : "Run Migration & Purge Old Firestore Data"}
            </button>
          </div>

          {/* BULK & TABLE-BY-TABLE BIDIRECTIONAL SYNC SECTION */}
          <div className="mt-4 pt-4 border-t border-white/10 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <Database className="w-4 h-4 text-teal-400" />
                  Bidirectional Data Table Synchronization
                </h3>
                <p className="text-[11px] text-neutral-400 mt-0.5">Sync specific Firestore & Supabase tables individually in either direction.</p>
              </div>

              {/* Bulk Actions */}
              <div className="flex items-center gap-2">
                <button onClick={() => handleBulkSyncTables("firestore_to_supabase")} disabled={isSyncingAllData} className="px-3 py-1.5 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 text-white font-medium text-[11px] rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shadow disabled:opacity-50" title="Sync all Firestore & local tables to Supabase">
                  <Upload className={`w-3.5 h-3.5 ${bulkSyncDirection === "to_supabase" ? "animate-spin" : ""}`} />
                  <span>Sync All ➔ Supabase</span>
                </button>

                <button onClick={() => handleBulkSyncTables("supabase_to_firestore")} disabled={isSyncingAllData} className="px-3 py-1.5 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white font-medium text-[11px] rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shadow disabled:opacity-50" title="Sync all Supabase tables to Firestore & local state">
                  <Download className={`w-3.5 h-3.5 ${bulkSyncDirection === "to_firestore" ? "animate-spin" : ""}`} />
                  <span>Sync All ➔ Firestore</span>
                </button>
              </div>
            </div>

            {/* INDIVIDUAL TABLE CARDS GRID */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5 w-full">
              {SYNC_TABLES_LIST.map((table, idx) => {
                const isSyncingToSupa = syncingTableState[table.key] === "to_supabase";
                const isSyncingToFire = syncingTableState[table.key] === "to_firestore";
                const isBusy = isSyncingToSupa || isSyncingToFire || isSyncingAllData;
                const lastResult = tableSyncResults[table.key];
                const diagStatus = tableDiagnostics?.tables?.find((t) => t.tableName === table.supabaseTable);

                return (
                  <div key={`sync-table-box-${table.key}-${idx}`} className="p-3 bg-neutral-950/60 border border-white/5 rounded-2xl flex flex-col justify-between gap-2.5 hover:border-white/10 transition-all">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-neutral-200">{table.label}</span>
                          <span className="text-[9px] font-mono text-neutral-500 bg-white/5 px-1.5 py-0.5 rounded">{table.supabaseTable}</span>
                        </div>
                        <p className="text-[10px] text-neutral-400 mt-0.5 leading-tight">{table.description}</p>
                      </div>

                      {diagStatus && <div className="flex items-center gap-1 text-[10px] shrink-0">{diagStatus.status === "active" ? <span className="px-1.5 py-0.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-mono rounded-md">Active</span> : <span className="px-1.5 py-0.5 bg-rose-500/10 border border-rose-500/20 text-rose-400 font-mono rounded-md">{diagStatus.status}</span>}</div>}
                    </div>

                    {/* Sync Result Banner for Table */}
                    {lastResult && (
                      <div className={`p-1.5 rounded-lg text-[10px] font-mono flex items-center justify-between gap-2 ${lastResult.errors.length > 0 ? "bg-amber-500/10 border border-amber-500/20 text-amber-300" : "bg-teal-500/10 border border-teal-500/20 text-teal-300"}`}>
                        <div className="flex items-center gap-1.5 truncate">
                          <CheckCircle className="w-3 h-3 shrink-0 text-teal-400" />
                          <span className="truncate">
                            {lastResult.direction === "firestore_to_supabase" ? "FS ➔ Supa" : "Supa ➔ FS"}: {lastResult.syncedCount} synced / {lastResult.processedCount} processed
                          </span>
                        </div>
                        {lastResult.errors.length > 0 && <span className="text-amber-400 font-bold shrink-0">({lastResult.errors.length} notices)</span>}
                      </div>
                    )}

                    {/* Directional Action Buttons */}
                    <div className="grid grid-cols-2 gap-2">
                      <button onClick={() => handleSyncSingleTable(table.key, "firestore_to_supabase")} disabled={isBusy} className="w-full bg-teal-500/10 hover:bg-teal-500/20 border border-teal-500/30 text-teal-300 hover:text-teal-100 text-[11px] font-medium py-1.5 px-2 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-40" title={`Sync Firestore/Local ${table.label} to Supabase`}>
                        <Upload className={`w-3 h-3 ${isSyncingToSupa ? "animate-spin" : ""}`} />
                        <span>{isSyncingToSupa ? "Uploading..." : "FS ➔ Supabase"}</span>
                      </button>

                      <button onClick={() => handleSyncSingleTable(table.key, "supabase_to_firestore")} disabled={isBusy} className="w-full bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/30 text-sky-300 hover:text-sky-100 text-[11px] font-medium py-1.5 px-2 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-40" title={`Sync Supabase ${table.label} to Firestore & Local`}>
                        <Download className={`w-3.5 h-3.5 ${isSyncingToFire ? "animate-spin" : ""}`} />
                        <span>{isSyncingToFire ? "Downloading..." : "Supabase ➔ FS"}</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <AnimatePresence>
            {syncDataSummary && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="mt-3 p-3 bg-teal-500/10 border border-teal-500/20 rounded-2xl text-xs space-y-2 text-teal-200 overflow-hidden">
                <div className="flex items-center justify-between pb-2 border-b border-teal-500/20 gap-2">
                  <div className="flex items-center gap-1.5 text-teal-300 font-bold truncate">
                    <CheckCircle className="w-4 h-4 text-teal-400 shrink-0" />
                    <span className="truncate">Supabase Data Sync Completed</span>
                  </div>
                  <button onClick={() => setSyncDataSummary(null)} className="p-1 hover:bg-teal-500/20 rounded-md transition-all cursor-pointer text-neutral-400 hover:text-white shrink-0" title="Dismiss summary">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 text-[10px]">
                  <div className="bg-neutral-950/40 p-1.5 rounded-lg border border-teal-500/10 flex justify-between">
                    <span className="text-neutral-400">Questions:</span>
                    <strong className="text-teal-300">{syncDataSummary?.coupleQuestionsSynced ?? 0}</strong>
                  </div>
                  <div className="bg-neutral-950/40 p-1.5 rounded-lg border border-teal-500/10 flex justify-between">
                    <span className="text-neutral-400">Date Plans:</span>
                    <strong className="text-teal-300">{syncDataSummary?.datePlansSynced ?? 0}</strong>
                  </div>
                  <div className="bg-neutral-950/40 p-1.5 rounded-lg border border-teal-500/10 flex justify-between">
                    <span className="text-neutral-400">Letters:</span>
                    <strong className="text-teal-300">{syncDataSummary?.lettersSynced ?? 0}</strong>
                  </div>
                  <div className="bg-neutral-950/40 p-1.5 rounded-lg border border-teal-500/10 flex justify-between">
                    <span className="text-neutral-400">Memories:</span>
                    <strong className="text-teal-300">{syncDataSummary?.memoriesSynced ?? 0}</strong>
                  </div>
                  <div className="bg-neutral-950/40 p-1.5 rounded-lg border border-teal-500/10 flex justify-between">
                    <span className="text-neutral-400">Milestones:</span>
                    <strong className="text-teal-300">{syncDataSummary?.milestonesSynced ?? 0}</strong>
                  </div>
                  <div className="bg-neutral-950/40 p-1.5 rounded-lg border border-teal-500/10 flex justify-between">
                    <span className="text-neutral-400">User Accounts:</span>
                    <strong className="text-teal-300">{syncDataSummary?.userAccountsSynced ?? 0}</strong>
                  </div>
                </div>

                {syncDataSummary?.errors && syncDataSummary.errors.length > 0 && (
                  <div className="mt-1 pt-1 border-t border-teal-500/20 text-[9px] text-rose-300 space-y-0.5 max-h-16 overflow-y-auto">
                    <span className="font-semibold text-rose-400 block">Notices:</span>
                    {syncDataSummary.errors.map((err, idx) => (
                      <p key={`sync-data-err-${idx}`} className="truncate">
                        • {err}
                      </p>
                    ))}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {migrationError && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="mt-2 p-2.5 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs text-rose-300 flex items-center justify-between gap-2 overflow-hidden">
                <div className="flex items-center gap-2 truncate">
                  <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
                  <span className="truncate">{migrationError}</span>
                </div>
                <button onClick={() => setMigrationError(null)} className="p-1 hover:bg-white/10 rounded cursor-pointer shrink-0">
                  <X className="w-3.5 h-3.5 text-neutral-400" />
                </button>
              </motion.div>
            )}

            {migrationResult && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="mt-3 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl text-xs space-y-2 text-emerald-200 overflow-hidden">
                <div className="flex items-center justify-between pb-2 border-b border-emerald-500/20 gap-2">
                  <div className="flex items-center gap-1.5 text-emerald-300 font-bold truncate">
                    <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span className="truncate">Maintenance & Purge Complete</span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button onClick={handleDownloadReport} className="px-2 py-1 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/30 rounded-lg text-[10px] font-semibold text-emerald-200 transition-all cursor-pointer flex items-center gap-1 shadow-sm" title="Download report TXT file">
                      <Download className="w-3 h-3 text-emerald-300" />
                      <span>Report .TXT</span>
                    </button>
                    <button onClick={() => setMigrationResult(null)} className="p-1 hover:bg-emerald-500/20 rounded-md transition-all cursor-pointer text-neutral-400 hover:text-white" title="Dismiss summary">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Compact stats pill strip */}
                <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                  <div className="bg-neutral-950/40 p-1.5 rounded-lg border border-emerald-500/10 flex justify-between">
                    <span className="text-neutral-400">Logs Migrated:</span>
                    <strong className="text-emerald-300">{migrationResult?.logsMigrated ?? 0}</strong>
                  </div>
                  <div className="bg-neutral-950/40 p-1.5 rounded-lg border border-emerald-500/10 flex justify-between">
                    <span className="text-neutral-400">Logs Purged:</span>
                    <strong className="text-rose-300">{migrationResult?.logsPurgedFromFirestore ?? 0}</strong>
                  </div>
                  <div className="bg-neutral-950/40 p-1.5 rounded-lg border border-emerald-500/10 flex justify-between">
                    <span className="text-neutral-400">Settings Migrated:</span>
                    <strong className="text-emerald-300">{migrationResult?.settingsMigrated ?? 0}</strong>
                  </div>
                  <div className="bg-neutral-950/40 p-1.5 rounded-lg border border-emerald-500/10 flex justify-between">
                    <span className="text-neutral-400">Settings Purged:</span>
                    <strong className="text-rose-300">{migrationResult?.settingsPurgedFromFirestore ?? 0}</strong>
                  </div>
                </div>

                {migrationResult?.errors && migrationResult.errors.length > 0 && (
                  <div className="mt-1 pt-1 border-t border-emerald-500/20 text-[9px] text-rose-300 space-y-0.5 max-h-16 overflow-y-auto">
                    <span className="font-semibold text-rose-400 block">Notices:</span>
                    {migrationResult.errors.map((err, idx) => (
                      <p key={`mig-res-err-${idx}`} className="truncate">
                        • {err}
                      </p>
                    ))}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* AUTOMATED WEBSITE TEST REPORT SECTION */}
        <div id="test_report_section" className="w-full bg-neutral-900/60 border border-white/10 rounded-3xl p-6 sm:p-8 relative shadow-2xl backdrop-blur-xl transition-all hover:border-white/15 overflow-hidden scroll-mt-24">
          {/* BACKGROUND AMBIENT GLOW */}
          <div className="absolute top-0 right-0 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl pointer-events-none"></div>

          {/* CARD HEADER & CONTROLS */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 relative z-10 pb-6 border-b border-white/10">
            <div className="flex items-center gap-3.5">
              <div className="p-3 bg-purple-500/15 border border-purple-500/30 rounded-2xl text-purple-400 shadow-inner shrink-0">
                <Activity className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-xl font-serif font-bold text-white tracking-wide">Automated Website Test Report</h2>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] uppercase font-mono tracking-wider bg-purple-500/20 text-purple-300 border border-purple-500/30">Auto-Diagnostics Suite</span>
                </div>
                <p className="text-xs text-neutral-400 mt-1 font-mono">Full-stack diagnostic runner testing storage, database connectivity, data integrity & browser APIs</p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap shrink-0">
              {testReport && (testReport.warningCount > 0 || testReport.failedCount > 0) && (
                <button onClick={handleCopyErrors} className="px-3 py-2 bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 rounded-xl text-xs font-semibold text-rose-300 transition-all cursor-pointer flex items-center gap-1.5 shadow-sm" title="Copy error details to clipboard">
                  {copiedErrors ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-rose-400" />}
                  <span>{copiedErrors ? "Copied!" : "Copy Errors"}</span>
                </button>
              )}

              {testReport && (
                <button onClick={handleDownloadTestReport} className="px-3.5 py-2 bg-neutral-800 hover:bg-neutral-700 border border-white/10 rounded-xl text-xs font-semibold text-neutral-200 transition-all cursor-pointer flex items-center gap-1.5 shadow-sm" title="Download complete test report as TXT">
                  <Download className="w-3.5 h-3.5 text-purple-400" />
                  <span>Report .TXT</span>
                </button>
              )}

              <button onClick={handleRunAutoTests} disabled={isRunningAutoTests} className="px-4 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-semibold text-xs rounded-xl shadow-lg transition-all duration-200 flex items-center gap-2 cursor-pointer disabled:opacity-50">
                <RefreshCw className={`w-4 h-4 ${isRunningAutoTests ? "animate-spin" : ""}`} />
                <span>{isRunningAutoTests ? "Running Auto-Tests..." : "Run Auto-Test Suite"}</span>
              </button>
            </div>
          </div>

          {/* TEST REPORT RESULTS BODY */}
          {isRunningAutoTests && !testReport ? (
            <div className="py-12 flex flex-col items-center justify-center text-center space-y-3">
              <div className="relative">
                <div className="w-12 h-12 rounded-full border-2 border-purple-500/20 border-t-purple-500 animate-spin"></div>
                <Bug className="w-5 h-5 text-purple-400 absolute inset-0 m-auto" />
              </div>
              <p className="text-sm text-neutral-300 font-medium font-serif">Testing website modules & cloud connections...</p>
              <p className="text-xs text-neutral-500 font-mono">Running local storage, Firestore, Supabase & API checks</p>
            </div>
          ) : testReport ? (
            <div className="space-y-6 relative z-10">
              {/* SUMMARY STATS BANNER */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {/* OVERALL STATUS */}
                <div className={`col-span-2 sm:col-span-3 lg:col-span-2 p-4 rounded-2xl border flex items-center gap-3.5 ${testReport.overallStatus === "passed" ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-300" : testReport.overallStatus === "warning" ? "bg-amber-500/10 border-amber-500/25 text-amber-300" : "bg-rose-500/10 border-rose-500/25 text-rose-300"}`}>
                  <div className={`p-2.5 rounded-xl border shrink-0 ${testReport.overallStatus === "passed" ? "bg-emerald-500/20 border-emerald-500/30" : testReport.overallStatus === "warning" ? "bg-amber-500/20 border-amber-500/30" : "bg-rose-500/20 border-rose-500/30"}`}>
                    {testReport.overallStatus === "passed" ? <CheckCircle2 className="w-6 h-6 text-emerald-400" /> : testReport.overallStatus === "warning" ? <AlertTriangle className="w-6 h-6 text-amber-400" /> : <XCircle className="w-6 h-6 text-rose-400" />}
                  </div>
                  <div>
                    <span className="text-[10px] uppercase tracking-wider font-mono opacity-80">Overall Health</span>
                    <h3 className="text-base font-bold font-serif uppercase tracking-wide">{testReport.overallStatus === "passed" ? "System Healthy" : testReport.overallStatus === "warning" ? "Passed with Warnings" : "Critical Errors Detected"}</h3>
                    <p className="text-[10px] font-mono mt-0.5 opacity-80">
                      Completed in {testReport.durationMs}ms ({testReport.timestamp})
                    </p>
                  </div>
                </div>

                {/* STAT: PASSED */}
                <div className="p-3.5 bg-neutral-950/50 border border-emerald-500/20 rounded-2xl flex flex-col justify-between">
                  <span className="text-[10px] text-neutral-400 uppercase font-mono">Passed</span>
                  <div className="flex items-baseline justify-between mt-1">
                    <span className="text-xl font-bold text-emerald-400">{testReport.passedCount}</span>
                    <CheckCircle2 className="w-4 h-4 text-emerald-500/60" />
                  </div>
                </div>

                {/* STAT: WARNINGS */}
                <div className="p-3.5 bg-neutral-950/50 border border-amber-500/20 rounded-2xl flex flex-col justify-between">
                  <span className="text-[10px] text-neutral-400 uppercase font-mono">Warnings</span>
                  <div className="flex items-baseline justify-between mt-1">
                    <span className="text-xl font-bold text-amber-400">{testReport.warningCount}</span>
                    <AlertTriangle className="w-4 h-4 text-amber-500/60" />
                  </div>
                </div>

                {/* STAT: FAILURES */}
                <div className="p-3.5 bg-neutral-950/50 border border-rose-500/20 rounded-2xl flex flex-col justify-between">
                  <span className="text-[10px] text-neutral-400 uppercase font-mono">Failures</span>
                  <div className="flex items-baseline justify-between mt-1">
                    <span className="text-xl font-bold text-rose-400">{testReport.failedCount}</span>
                    <XCircle className="w-4 h-4 text-rose-500/60" />
                  </div>
                </div>

                {/* STAT: TOTAL TESTS */}
                <div className="p-3.5 bg-neutral-950/50 border border-white/10 rounded-2xl flex flex-col justify-between">
                  <span className="text-[10px] text-neutral-400 uppercase font-mono">Total Cases</span>
                  <div className="flex items-baseline justify-between mt-1">
                    <span className="text-xl font-bold text-purple-300">{testReport.totalTests}</span>
                    <FileCheck className="w-4 h-4 text-purple-400/60" />
                  </div>
                </div>
              </div>

              {/* SEARCH & FILTERS ROW */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-neutral-950/40 p-3 rounded-2xl border border-white/5">
                {/* Search Bar */}
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input type="text" value={testSearchQuery} onChange={(e) => setTestSearchQuery(e.target.value)} placeholder="Search test names, categories or messages..." className="w-full pl-9 pr-3 py-1.5 bg-neutral-900 border border-white/10 rounded-xl text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-purple-500/50 font-mono" />
                  {testSearchQuery && (
                    <button onClick={() => setTestSearchQuery("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-white">
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                {/* Status Filter */}
                <div className="flex items-center gap-1 bg-neutral-900 p-1 rounded-xl border border-white/10 overflow-x-auto">
                  {(["all", "passed", "warning", "failed"] as const).map((status, idx) => (
                    <button
                      key={`test-status-${status}-${idx}`}
                      onClick={() => setTestStatusFilter(status)}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap ${
                        testStatusFilter === status ? (status === "passed" ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30" : status === "warning" ? "bg-amber-500/20 text-amber-300 border border-amber-500/30" : status === "failed" ? "bg-rose-500/20 text-rose-300 border border-rose-500/30" : "bg-purple-500/20 text-purple-300 border border-purple-500/30") : "text-neutral-400 hover:text-neutral-200"
                      }`}
                    >
                      {status}
                    </button>
                  ))}
                </div>
              </div>

              {/* CATEGORY FILTER STRIP */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-[10px]">
                <span className="text-neutral-500 font-mono uppercase text-[9px] mr-1">Category:</span>
                {["all", "Storage & Local State", "Database & Cloud Services", "Data Schema & Integrity", "Browser & Runtime APIs", "Component & Navigation"].map((cat, idx) => (
                  <button key={`test-cat-${cat}-${idx}`} onClick={() => setTestCategoryFilter(cat)} className={`px-2.5 py-1 rounded-xl border font-mono transition-all cursor-pointer whitespace-nowrap ${testCategoryFilter === cat ? "bg-purple-500/20 text-purple-300 border-purple-500/40 font-semibold shadow-sm" : "bg-neutral-950/60 text-neutral-400 border-white/5 hover:border-white/15"}`}>
                    {cat === "all" ? "All Categories" : cat}
                  </button>
                ))}
              </div>

              {/* DETAILED TEST RESULTS LIST */}
              <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1 custom-scrollbar">
                {(() => {
                  const filtered = testReport.results.filter((test) => {
                    const matchesSearch = test.name.toLowerCase().includes(testSearchQuery.toLowerCase()) || test.message.toLowerCase().includes(testSearchQuery.toLowerCase()) || test.category.toLowerCase().includes(testSearchQuery.toLowerCase()) || (test.details && test.details.toLowerCase().includes(testSearchQuery.toLowerCase()));

                    const matchesStatus = testStatusFilter === "all" || test.status === testStatusFilter;
                    const matchesCategory = testCategoryFilter === "all" || test.category === testCategoryFilter;

                    return matchesSearch && matchesStatus && matchesCategory;
                  });

                  if (filtered.length === 0) {
                    return <div className="py-8 text-center bg-neutral-950/40 rounded-2xl border border-white/5 text-neutral-500 text-xs font-mono">No test results match the selected query or filters.</div>;
                  }

                  return filtered.map((test, idx) => {
                    const isExpanded = expandedTestId === test.id;
                    const isPassed = test.status === "passed";
                    const isWarning = test.status === "warning";

                    return (
                      <div key={`auto-test-row-${test.id}-${idx}`} className={`rounded-2xl border transition-all duration-200 overflow-hidden ${isPassed ? "bg-neutral-950/40 border-white/5 hover:border-emerald-500/30" : isWarning ? "bg-amber-500/5 border-amber-500/20 hover:border-amber-500/40" : "bg-rose-500/5 border-rose-500/20 hover:border-rose-500/40"}`}>
                        {/* MAIN TEST ROW */}
                        <div onClick={() => setExpandedTestId(isExpanded ? null : test.id)} className="p-3.5 flex items-center justify-between gap-3 cursor-pointer select-none">
                          <div className="flex items-center gap-3 min-w-0">
                            {/* Status Icon */}
                            <div className="shrink-0">{isPassed ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : isWarning ? <AlertTriangle className="w-4 h-4 text-amber-400" /> : <XCircle className="w-4 h-4 text-rose-400" />}</div>

                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-semibold text-xs text-white truncate font-sans">{test.name}</span>
                                <span className="px-2 py-0.2 rounded-md text-[9px] font-mono bg-white/5 text-neutral-400 border border-white/5">{test.category}</span>
                              </div>
                              <p className={`text-[11px] mt-0.5 font-mono truncate ${isPassed ? "text-neutral-400" : isWarning ? "text-amber-300" : "text-rose-300"}`}>{test.message}</p>
                            </div>
                          </div>

                          <div className="flex items-center gap-3 shrink-0">
                            <span className="text-[10px] font-mono text-neutral-500">{test.durationMs}ms</span>

                            <span className={`px-2 py-0.5 rounded-full text-[9px] uppercase font-mono font-bold tracking-wider ${isPassed ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/25" : isWarning ? "bg-amber-500/15 text-amber-400 border border-amber-500/25" : "bg-rose-500/15 text-rose-400 border border-rose-500/25"}`}>{test.status}</span>

                            {(test.details || test.remedy) && <div className="text-neutral-500 hover:text-white transition-colors">{isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}</div>}
                          </div>
                        </div>

                        {/* EXPANDED ACCORDION DETAILS */}
                        <AnimatePresence>
                          {isExpanded && (test.details || test.remedy) && (
                            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="px-3.5 pb-3.5 pt-1 border-t border-white/5 bg-black/40 text-xs space-y-2 overflow-hidden">
                              {test.details && (
                                <div>
                                  <span className="text-[10px] uppercase font-mono font-semibold text-neutral-400 block mb-0.5">Technical Diagnostics & Logs:</span>
                                  <pre className="p-2 bg-neutral-950 rounded-xl border border-white/5 text-[10px] font-mono text-purple-200 whitespace-pre-wrap overflow-x-auto">{test.details}</pre>
                                </div>
                              )}

                              {test.remedy && (
                                <div className="p-2.5 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-indigo-300 flex items-start gap-2 text-[11px]">
                                  <Bug className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                                  <div>
                                    <strong className="block font-semibold text-indigo-200">Suggested Action / Fix:</strong>
                                    <span>{test.remedy}</span>
                                  </div>
                                </div>
                              )}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          ) : null}
        </div>
      </main>

      {/* MOBILE FLOATING ACTION BUTTON (Section Index for Mobile Views) */}
      <div className="lg:hidden fixed bottom-6 right-6 z-50">
        <motion.button whileTap={{ scale: 0.95 }} onClick={() => setIsMobileNavOpen(true)} className="flex items-center gap-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-4 py-3 rounded-full shadow-2xl border border-white/20 backdrop-blur-xl cursor-pointer text-xs font-bold">
          <Compass className="w-4 h-4 text-white" />
          <span>Sections</span>
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
        </motion.button>
      </div>

      {/* MOBILE FLOATING SECTION INDEX DRAWER MODAL */}
      <AnimatePresence>
        {isMobileNavOpen && (
          <div className="fixed inset-0 z-50 lg:hidden flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-md">
            <motion.div initial={{ opacity: 0, y: 100 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 100 }} className="w-full sm:max-w-md bg-neutral-900 border border-white/15 rounded-t-3xl sm:rounded-3xl p-5 shadow-2xl space-y-4 max-h-[85vh] flex flex-col">
              <div className="flex items-center justify-between pb-3 border-b border-white/10 shrink-0">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-indigo-500/15 border border-indigo-500/30 rounded-xl text-indigo-400">
                    <Compass className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-serif font-bold text-white">Section Index Navigation</h3>
                    <p className="text-[10px] text-neutral-400 font-mono">Jump directly to any admin panel section</p>
                  </div>
                </div>
                <button type="button" onClick={() => setIsMobileNavOpen(false)} className="p-2 rounded-xl bg-white/5 text-neutral-400 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-1.5 overflow-y-auto flex-1 pr-1">
                {SECTION_LIST.map((sec, idx) => {
                  const SecIcon = sec.icon;
                  const isActive = activeSectionId === sec.id;
                  return (
                    <button
                      key={`mobile-drawer-sec-${sec.id}-${idx}`}
                      type="button"
                      onClick={() => {
                        setIsMobileNavOpen(false);
                        if (sec.id === "overview_section") {
                          window.scrollTo({ top: 0, behavior: "smooth" });
                          setActiveSectionId("overview_section");
                        } else {
                          const el = document.getElementById(sec.id);
                          if (el) {
                            el.scrollIntoView({ behavior: "smooth", block: "start" });
                            setActiveSectionId(sec.id);
                          }
                        }
                      }}
                      className={`w-full flex items-center justify-between p-3 rounded-2xl text-xs transition-all text-left cursor-pointer ${isActive ? "bg-gradient-to-r from-indigo-600/30 to-purple-600/20 border border-indigo-500/50 text-white font-bold" : "bg-neutral-950/40 text-neutral-300 hover:text-white border border-white/5"}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-xl border ${isActive ? "bg-indigo-500 text-white border-indigo-400" : "bg-neutral-900 border-white/10 text-indigo-400"}`}>
                          <SecIcon className="w-4 h-4" />
                        </div>
                        <span className="font-medium text-xs">{sec.label}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {isActive && <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">Active</span>}
                        <ChevronRight className="w-4 h-4 text-neutral-500" />
                      </div>
                    </button>
                  );
                })}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* FOOTER */}
      <footer className="relative z-10 border-t border-white/5 bg-neutral-950/40 py-4 px-4">
        <p className="text-center text-xs text-neutral-500 font-mono">&copy; {new Date().getFullYear()} Our Home ♥️. Admin Panel Console.</p>
      </footer>

      {/* CUSTOM CONFIRM DELETE MODAL */}
      <AnimatePresence>
        {userToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ duration: 0.2 }} className="bg-neutral-900 border border-white/10 rounded-3xl p-6 max-w-md w-full shadow-2xl relative overflow-hidden">
              {/* Decorative accent */}
              <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-rose-500 to-indigo-500"></div>

              <div className="flex items-center gap-3 mb-4">
                <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-rose-400">
                  <ShieldAlert className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-serif font-bold text-white">Delete User Account?</h3>
                  <p className="text-xs text-neutral-400 font-mono uppercase tracking-widest mt-0.5">Irreversible Action</p>
                </div>
              </div>

              <p className="text-sm text-neutral-300 leading-relaxed mb-6">
                Are you absolutely sure you want to delete <span className="text-indigo-300 font-semibold capitalize">"{userToDelete.username}"</span>? This will permanently remove their login access to Our Home.
              </p>

              <div className="flex gap-3 justify-end">
                <button onClick={() => setUserToDelete(null)} className="px-4 py-2 rounded-xl text-xs font-semibold uppercase tracking-wider text-neutral-400 hover:text-white bg-white/5 hover:bg-white/10 transition-all cursor-pointer border border-white/5">
                  Cancel
                </button>
                <button onClick={() => handleDeleteUser(userToDelete)} disabled={isSyncing} className="px-4 py-2 rounded-xl text-xs font-semibold uppercase tracking-wider bg-rose-600 hover:bg-rose-500 text-white shadow-md transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50">
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete Permanently
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* ADD ADMIN MODAL */}
        {isAddingAdmin && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-neutral-900 border border-white/10 rounded-3xl p-6 max-w-md w-full shadow-2xl relative overflow-hidden">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl text-indigo-400">
                    <UserPlus className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-serif font-bold text-white">Add New Admin Credential</h3>
                    <p className="text-[10px] text-neutral-400 font-mono">Create administrator login account</p>
                  </div>
                </div>
                <button onClick={() => setIsAddingAdmin(false)} className="p-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-neutral-400 hover:text-white transition-all cursor-pointer">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleAddAdminAccount} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] text-neutral-400 uppercase tracking-wider font-mono">Admin Username</label>
                  <input type="text" value={newAdminUser} onChange={(e) => setNewAdminUser(e.target.value)} placeholder="e.g. admin_manager" className="w-full bg-neutral-950/80 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500/60" required />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] text-neutral-400 uppercase tracking-wider font-mono">Admin Password</label>
                  <input type="password" value={newAdminPass} onChange={(e) => setNewAdminPass(e.target.value)} placeholder="Password for admin login" className="w-full bg-neutral-950/80 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500/60" required />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] text-neutral-400 uppercase tracking-wider font-mono">Role Title</label>
                  <select value={newAdminRole} onChange={(e) => setNewAdminRole(e.target.value)} className="w-full bg-neutral-950/80 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500/60">
                    <option value="Super Admin">Super Admin</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] text-neutral-400 uppercase tracking-wider font-mono">Notes / Label (Optional)</label>
                  <input type="text" value={newAdminNotes} onChange={(e) => setNewAdminNotes(e.target.value)} placeholder="e.g. Primary backup admin" className="w-full bg-neutral-950/80 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500/60" />
                </div>

                <div className="flex gap-3 justify-end pt-2">
                  <button type="button" onClick={() => setIsAddingAdmin(false)} className="px-4 py-2 rounded-xl text-xs font-semibold text-neutral-400 hover:text-white bg-white/5 hover:bg-white/10 transition-all cursor-pointer border border-white/5">
                    Cancel
                  </button>
                  <button type="submit" disabled={isSyncing} className="px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-md transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50">
                    <Check className="w-3.5 h-3.5" />
                    Save Admin Credential
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}

        {/* EDIT ADMIN MODAL */}
        {editingAdmin && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-neutral-900 border border-white/10 rounded-3xl p-6 max-w-md w-full shadow-2xl relative overflow-hidden">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl text-indigo-400">
                    <Edit3 className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-serif font-bold text-white">Edit Admin Account</h3>
                    <p className="text-[10px] text-neutral-400 font-mono">Update username, password, or role</p>
                  </div>
                </div>
                <button onClick={() => setEditingAdmin(null)} className="p-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-neutral-400 hover:text-white transition-all cursor-pointer">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleUpdateAdminAccount} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] text-neutral-400 uppercase tracking-wider font-mono">Admin Username</label>
                  <input type="text" value={editAdminUser} onChange={(e) => setEditAdminUser(e.target.value)} className="w-full bg-neutral-950/80 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500/60" required />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] text-neutral-400 uppercase tracking-wider font-mono">New Password (Leave empty to keep current)</label>
                  <input type="password" value={editAdminPass} onChange={(e) => setEditAdminPass(e.target.value)} placeholder="••••••••" className="w-full bg-neutral-950/80 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500/60" />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] text-neutral-400 uppercase tracking-wider font-mono">Role Title</label>
                  <select value={editAdminRole} onChange={(e) => setEditAdminRole(e.target.value)} className="w-full bg-neutral-950/80 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500/60">
                    <option value="Super Admin">Super Admin</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] text-neutral-400 uppercase tracking-wider font-mono">Notes / Label</label>
                  <input type="text" value={editAdminNotes} onChange={(e) => setEditAdminNotes(e.target.value)} placeholder="e.g. Primary admin account" className="w-full bg-neutral-950/80 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500/60" />
                </div>

                <div className="flex gap-3 justify-end pt-2">
                  <button type="button" onClick={() => setEditingAdmin(null)} className="px-4 py-2 rounded-xl text-xs font-semibold text-neutral-400 hover:text-white bg-white/5 hover:bg-white/10 transition-all cursor-pointer border border-white/5">
                    Cancel
                  </button>
                  <button type="submit" disabled={isSyncing} className="px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-md transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50">
                    <Check className="w-3.5 h-3.5" />
                    Update Admin
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}

        {/* DELETE ADMIN CONFIRMATION MODAL */}
        {adminToDelete && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-neutral-900 border border-white/10 rounded-3xl p-6 max-w-md w-full shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-rose-500 to-indigo-500"></div>

              <div className="flex items-center gap-3 mb-4">
                <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-rose-400">
                  <ShieldAlert className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-serif font-bold text-white">Delete Admin Credential?</h3>
                  <p className="text-xs text-neutral-400 font-mono uppercase tracking-widest mt-0.5">Revoke Portal Access</p>
                </div>
              </div>

              <p className="text-sm text-neutral-300 leading-relaxed mb-6">
                Are you sure you want to delete admin account <span className="text-indigo-300 font-semibold">"{adminToDelete.username}"</span>? They will no longer be able to log in to the admin portal.
              </p>

              <div className="flex gap-3 justify-end">
                <button onClick={() => setAdminToDelete(null)} className="px-4 py-2 rounded-xl text-xs font-semibold uppercase tracking-wider text-neutral-400 hover:text-white bg-white/5 hover:bg-white/10 transition-all cursor-pointer border border-white/5">
                  Cancel
                </button>
                <button onClick={() => handleDeleteAdminAccount(adminToDelete)} disabled={isSyncing} className="px-4 py-2 rounded-xl text-xs font-semibold uppercase tracking-wider bg-rose-600 hover:bg-rose-500 text-white shadow-md transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50">
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete Admin Account
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* SUPABASE SCHEMA FIX SQL MODAL */}
      <AnimatePresence>
        {showSqlSetupModal && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4 overflow-y-auto">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-neutral-900 border border-white/10 rounded-3xl max-w-2xl w-full p-6 shadow-2xl space-y-4 my-8">
              <div className="flex items-center justify-between pb-3 border-b border-white/10">
                <div className="flex items-center gap-2 text-white">
                  <Database className="w-5 h-5 text-indigo-400" />
                  <h3 className="font-serif font-bold text-lg">Supabase Schema Fix SQL</h3>
                </div>
                <button onClick={() => setShowSqlSetupModal(false)} className="p-1 rounded-xl bg-white/5 hover:bg-white/10 text-neutral-400 hover:text-white cursor-pointer">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <p className="text-xs text-neutral-300 leading-relaxed">
                Copy and execute this complete script in your <strong className="text-indigo-300">Supabase Dashboard → SQL Editor</strong> to create all critical tables (including <code className="text-indigo-200 bg-white/5 px-1 py-0.5 rounded font-mono">celebration_cards</code>, <code className="text-indigo-200 bg-white/5 px-1 py-0.5 rounded font-mono">user_accounts</code>, <code className="text-indigo-200 bg-white/5 px-1 py-0.5 rounded font-mono">letters</code>,{" "}
                <code className="text-indigo-200 bg-white/5 px-1 py-0.5 rounded font-mono">memories</code>, <code className="text-indigo-200 bg-white/5 px-1 py-0.5 rounded font-mono">date_plans</code>, etc.) and storage buckets in one click:
              </p>

              <div className="relative">
                <pre className="bg-neutral-950 p-4 rounded-2xl border border-white/10 text-[11px] font-mono text-emerald-300 overflow-x-auto max-h-80 leading-relaxed">{SUPABASE_SCHEMA_FIX_SQL}</pre>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(SUPABASE_SCHEMA_FIX_SQL);
                    setCopiedSql(true);
                    setTimeout(() => setCopiedSql(false), 2000);
                  }}
                  className="absolute top-3 right-3 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shadow-md"
                >
                  {copiedSql ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-300" />
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <FileText className="w-3.5 h-3.5" />
                      <span>Copy SQL</span>
                    </>
                  )}
                </button>
              </div>

              <div className="flex justify-end pt-2">
                <button onClick={() => setShowSqlSetupModal(false)} className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-xs font-semibold rounded-xl cursor-pointer">
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ADD / EDIT SUBSCRIPTION PLAN MODAL */}
      <AnimatePresence>
        {showPlanModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md overflow-y-auto" onClick={() => setShowPlanModal(false)}>
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} onClick={(e) => e.stopPropagation()} className="bg-neutral-900 border border-amber-500/30 rounded-2xl p-5 max-w-md w-full text-white shadow-2xl relative space-y-4 my-auto max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between pb-3 border-b border-white/10">
                <div className="flex items-center gap-2">
                  <Crown className="w-5 h-5 text-amber-400" />
                  <h3 className="text-base font-bold font-serif">{editingPlan ? "Edit Subscription Tier" : "Create New Subscription Tier"}</h3>
                </div>
                <button onClick={() => setShowPlanModal(false)} className="p-1 text-neutral-400 hover:text-white rounded-lg transition-colors cursor-pointer">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4 text-xs">
                <div>
                  <label className="block text-neutral-400 mb-1 font-semibold">Tier Unique ID (lowercase, e.g. 'free', 'pro', 'vip'):</label>
                  <input type="text" disabled={!!editingPlan} placeholder="e.g. pro_plus" value={planForm.id} onChange={(e) => setPlanForm({ ...planForm, id: e.target.value })} className="w-full bg-neutral-950 border border-white/10 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-amber-500 disabled:opacity-50" />
                </div>

                <div>
                  <label className="block text-neutral-400 mb-1 font-semibold">Display Plan Name:</label>
                  <input type="text" placeholder="e.g. Pro Lover Plan" value={planForm.name} onChange={(e) => setPlanForm({ ...planForm, name: e.target.value })} className="w-full bg-neutral-950 border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500" />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-neutral-400 mb-1 font-semibold">Price Badge Label:</label>
                    <input type="text" placeholder="e.g. $4.99/month" value={planForm.price} onChange={(e) => setPlanForm({ ...planForm, price: e.target.value })} className="w-full bg-neutral-950 border border-white/10 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-amber-500" />
                  </div>
                  <div>
                    <label className="block text-neutral-400 mb-1 font-semibold">Badge Theme Color:</label>
                    <select value={planForm.badgeColor} onChange={(e) => setPlanForm({ ...planForm, badgeColor: e.target.value })} className="w-full bg-neutral-950 border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500">
                      <option value="emerald">Emerald Green</option>
                      <option value="amber">Amber Gold</option>
                      <option value="pink">Romantic Pink</option>
                      <option value="purple">Royal Purple</option>
                      <option value="indigo">Deep Indigo</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-neutral-400 mb-1 font-semibold">Validity Period (Days):</label>
                    <input type="number" placeholder="-1 for infinite, 30 for monthly, 365 for annual" value={planForm.durationDays} onChange={(e) => setPlanForm({ ...planForm, durationDays: parseInt(e.target.value) || -1 })} className="w-full bg-neutral-950 border border-white/10 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-amber-500" />
                    <span className="text-[10px] text-neutral-500 mt-0.5 block">{planForm.durationDays === -1 || planForm.durationDays <= 0 ? "♾️ Unlimited Lifetime" : `⏳ Active for ${planForm.durationDays} days from date of subscription`}</span>
                  </div>
                  <div>
                    <label className="block text-neutral-400 mb-1 font-semibold">Billing Cycle Type:</label>
                    <select value={planForm.billingCycle} onChange={(e) => setPlanForm({ ...planForm, billingCycle: e.target.value as any })} className="w-full bg-neutral-950 border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500">
                      <option value="monthly">Monthly (30 Days)</option>
                      <option value="annual">Annual (365 Days)</option>
                      <option value="custom">Custom Duration</option>
                      <option value="lifetime">Lifetime Access</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-neutral-400 mb-1 font-semibold">Plan Description:</label>
                  <textarea rows={2} placeholder="Brief summary of what this tier unlocks for couples..." value={planForm.description} onChange={(e) => setPlanForm({ ...planForm, description: e.target.value })} className="w-full bg-neutral-950 border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500" />
                </div>

                {/* Per-Tab Item Limits & Access Configuration */}
                <div className="pt-2 border-t border-white/10 space-y-2">
                  <label className="block text-amber-300 font-bold text-xs uppercase font-mono tracking-wider">Tab Item Limits & Access Quotas:</label>
                  <p className="text-[10px] text-neutral-400">Manually enter the max item limit for each tab (-1 for Unlimited):</p>
                  <div className="grid grid-cols-2 gap-2 max-h-44 overflow-y-auto pr-1">
                    {TABS_LIST.map((tab, idx) => {
                      const limitObj = planForm.tabLimits?.[tab.id] || { maxLimit: -1, isLocked: false };
                      const maxLimit = limitObj.maxLimit ?? -1;
                      const isLocked = !!limitObj.isLocked;

                      return (
                        <div key={`tab-limit-box-${tab.id}-${idx}`} className="p-2 rounded-lg bg-neutral-950 border border-white/5 flex flex-col gap-1">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="font-semibold text-neutral-200 capitalize truncate">{tab.label}</span>
                            <button
                              type="button"
                              onClick={() => {
                                const current = planForm.tabLimits?.[tab.id] || { maxLimit: -1, isLocked: false };
                                setPlanForm({
                                  ...planForm,
                                  tabLimits: {
                                    ...planForm.tabLimits,
                                    [tab.id]: { ...current, isLocked: !current.isLocked },
                                  },
                                });
                              }}
                              className={`text-[9px] font-mono px-1.5 py-0.5 rounded border cursor-pointer ${isLocked ? "bg-rose-500/20 text-rose-300 border-rose-500/30" : "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"}`}
                            >
                              {isLocked ? "LOCKED" : "ACTIVE"}
                            </button>
                          </div>
                          {!isLocked && (
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                min="-1"
                                placeholder="-1 (Unlimited)"
                                value={maxLimit === -1 ? "" : maxLimit}
                                onChange={(e) => {
                                  const rawVal = e.target.value;
                                  const val = rawVal === "" ? -1 : parseInt(rawVal, 10);
                                  const current = planForm.tabLimits?.[tab.id] || { maxLimit: -1, isLocked: false };
                                  setPlanForm({
                                    ...planForm,
                                    tabLimits: {
                                      ...planForm.tabLimits,
                                      [tab.id]: { ...current, maxLimit: isNaN(val) ? -1 : val },
                                    },
                                  });
                                }}
                                className="w-full bg-neutral-900 border border-white/10 rounded px-2 py-0.5 text-xs font-mono text-amber-300 focus:outline-none focus:border-amber-500"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  const current = planForm.tabLimits?.[tab.id] || { maxLimit: -1, isLocked: false };
                                  setPlanForm({
                                    ...planForm,
                                    tabLimits: {
                                      ...planForm.tabLimits,
                                      [tab.id]: { ...current, maxLimit: maxLimit === -1 ? 5 : -1 },
                                    },
                                  });
                                }}
                                className="px-1.5 py-0.5 bg-neutral-800 hover:bg-neutral-700 text-[9px] font-mono text-neutral-300 rounded border border-white/10 shrink-0"
                              >
                                {maxLimit === -1 ? "∞" : "Set ∞"}
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <input type="checkbox" id="isDefaultPlan" checked={planForm.isDefault} onChange={(e) => setPlanForm({ ...planForm, isDefault: e.target.checked })} className="w-4 h-4 rounded text-amber-500 focus:ring-amber-500 bg-neutral-950 border-white/10 cursor-pointer" />
                  <label htmlFor="isDefaultPlan" className="text-neutral-300 cursor-pointer">
                    Set as default tier for newly registered couples
                  </label>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-white/10">
                <button type="button" onClick={() => setShowPlanModal(false)} className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-xs font-semibold rounded-xl transition-colors cursor-pointer">
                  Cancel
                </button>
                <button type="button" onClick={handleSavePlanFromModal} className="px-5 py-2 bg-gradient-to-r from-amber-500 to-rose-500 text-neutral-950 font-bold text-xs rounded-xl shadow-lg transition-all cursor-pointer">
                  {editingPlan ? "Save Plan Changes" : "Create Tier"}
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* PROMO CODE MODAL */}
        {showPromoModal && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 10 }} className="bg-neutral-900 border border-purple-500/30 rounded-3xl p-6 sm:p-7 max-w-lg w-full text-white shadow-2xl relative space-y-5">
              <div className="flex items-center justify-between pb-3 border-b border-white/10">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-purple-500/20 border border-purple-500/40 rounded-xl text-purple-300">
                    <Ticket className="w-5 h-5" />
                  </div>
                  <h3 className="text-base font-serif font-bold text-white">{editingPromo ? "Edit Promo Code" : "Create New Promo Code"}</h3>
                </div>
                <button type="button" onClick={() => setShowPromoModal(false)} className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors cursor-pointer">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSavePromoForm} className="space-y-4">
                <div>
                  <label className="block text-xs font-mono uppercase text-purple-300 mb-1">Coupon Code Name *</label>
                  <input type="text" required placeholder="e.g. LOVE50, VALENTINE100, PROMO20" value={promoForm.code} onChange={(e) => setPromoForm({ ...promoForm, code: e.target.value.toUpperCase() })} className="w-full bg-neutral-950 border border-purple-500/30 rounded-xl px-3 py-2 text-xs font-mono uppercase text-white focus:outline-none focus:border-purple-500 placeholder:text-neutral-600" />
                  <p className="text-[10px] text-neutral-500 mt-1">Codes will automatically convert to uppercase (e.g., LOVE50).</p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-mono uppercase text-purple-300 mb-1">Discount Type</label>
                    <select value={promoForm.discountType} onChange={(e) => setPromoForm({ ...promoForm, discountType: e.target.value as "percentage" | "fixed" })} className="w-full bg-neutral-950 border border-purple-500/30 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500">
                      <option value="percentage">Percentage (%) OFF</option>
                      <option value="fixed">Fixed Amount ($) OFF</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-mono uppercase text-purple-300 mb-1">Discount Value ({promoForm.discountType === "percentage" ? "%" : "$"})</label>
                    <input type="number" min="0" step={promoForm.discountType === "percentage" ? "1" : "0.01"} required value={promoForm.discountValue} onChange={(e) => setPromoForm({ ...promoForm, discountValue: parseFloat(e.target.value) || 0 })} className="w-full bg-neutral-950 border border-purple-500/30 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-purple-500" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-mono uppercase text-purple-300 mb-1">Applicable Subscription Tiers</label>
                  <select value={promoForm.applicablePlanIds[0] || "all"} onChange={(e) => setPromoForm({ ...promoForm, applicablePlanIds: [e.target.value] })} className="w-full bg-neutral-950 border border-purple-500/30 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500">
                    <option value="all">⭐ All Subscription Tiers</option>
                    {subscriptionPlans.map((plan, idx) => (
                      <option key={`promo-plan-opt-${plan.id}-${idx}`} value={plan.id}>
                        {plan.name} ({plan.price})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-mono uppercase text-purple-300 mb-1">Max Redemptions Limit</label>
                    <input type="number" min="-1" placeholder="-1 for Unlimited" value={promoForm.maxUses} onChange={(e) => setPromoForm({ ...promoForm, maxUses: parseInt(e.target.value, 10) || -1 })} className="w-full bg-neutral-950 border border-purple-500/30 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-purple-500" />
                    <p className="text-[9px] text-neutral-500 mt-0.5">-1 means unlimited redemptions.</p>
                  </div>

                  <div>
                    <label className="block text-xs font-mono uppercase text-purple-300 mb-1">Expiration Date (Optional)</label>
                    <input type="date" value={promoForm.expiresAt} onChange={(e) => setPromoForm({ ...promoForm, expiresAt: e.target.value })} className="w-full bg-neutral-950 border border-purple-500/30 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-mono uppercase text-purple-300 mb-1">Promo Description</label>
                  <input type="text" placeholder="e.g. 50% discount on Pro Plan for Valentine celebration" value={promoForm.description} onChange={(e) => setPromoForm({ ...promoForm, description: e.target.value })} className="w-full bg-neutral-950 border border-purple-500/30 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500 placeholder:text-neutral-600" />
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <input type="checkbox" id="promoIsActive" checked={promoForm.isActive} onChange={(e) => setPromoForm({ ...promoForm, isActive: e.target.checked })} className="rounded border-purple-500/40 text-purple-600 focus:ring-purple-500 bg-neutral-950 cursor-pointer" />
                  <label htmlFor="promoIsActive" className="text-xs text-neutral-300 cursor-pointer">
                    Enable & Activate this promo code immediately
                  </label>
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-white/10">
                  <button type="button" onClick={() => setShowPromoModal(false)} className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-xl text-xs font-semibold cursor-pointer">
                    Cancel
                  </button>
                  <button type="submit" className="px-5 py-2 bg-gradient-to-r from-purple-500 to-rose-500 hover:from-purple-400 hover:to-rose-400 text-white rounded-xl text-xs font-bold shadow-lg shadow-purple-950/40 cursor-pointer">
                    {editingPromo ? "Save Changes" : "Create Promo Code"}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* TWO-FACTOR AUTHENTICATION (TOTP) SETUP MODAL */}
      <AnimatePresence>
        {twoFactorModalAccount && <TwoFactorSetupModal isOpen={!!twoFactorModalAccount} onClose={() => setTwoFactorModalAccount(null)} username={twoFactorModalAccount.username} isAlreadyEnabled={twoFactorModalAccount.enabled} currentSecret={twoFactorModalAccount.secret} currentBackupCodes={twoFactorModalAccount.backupCodes} onSave2FA={handleSave2FA} onDisable2FA={handleDisable2FA} />}

        {/* MODAL: ADD / EDIT GLOBAL MUSIC TRACK */}
        {isAddMusicModalOpen && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="w-full max-w-lg bg-neutral-900 border border-white/15 rounded-3xl p-6 sm:p-7 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div className="flex items-center gap-2.5">
                  <div className="p-2.5 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400">
                    <Music className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-serif text-lg font-bold text-white">{editingMusicTrack ? "Edit Global Music Track" : "Add New Global Preset Track"}</h3>
                    <p className="text-xs text-neutral-400">Broadcast romantic melodies to all couples</p>
                  </div>
                </div>

                <button type="button" onClick={() => setIsAddMusicModalOpen(false)} className="p-2 text-neutral-400 hover:text-white rounded-xl hover:bg-white/5 transition-colors cursor-pointer">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {musicFormError && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs text-rose-300 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>{musicFormError}</span>
                </div>
              )}

              <form onSubmit={handleSaveGlobalMusicTrack} className="space-y-4 text-xs font-sans">
                {/* Title & Artist */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-neutral-400 font-semibold mb-1">
                      Track Title <span className="text-rose-400">*</span>
                    </label>
                    <input type="text" placeholder="e.g. قدام الناس (Odam El Nas)" value={musicTitle} onChange={(e) => setMusicTitle(e.target.value)} required className="w-full bg-neutral-950 border border-white/10 rounded-xl px-3 py-2.5 text-white placeholder-neutral-500 focus:outline-none focus:border-rose-500" />
                  </div>

                  <div>
                    <label className="block text-neutral-400 font-semibold mb-1">Artist / Singer</label>
                    <input type="text" placeholder="e.g. Mohamed Hamaki" value={musicArtist} onChange={(e) => setMusicArtist(e.target.value)} className="w-full bg-neutral-950 border border-white/10 rounded-xl px-3 py-2.5 text-white placeholder-neutral-500 focus:outline-none focus:border-rose-500" />
                  </div>
                </div>

                {/* Category & Duration */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-neutral-400 font-semibold mb-1">Category</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button type="button" onClick={() => setMusicCategory("romantic")} className={`py-2 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${musicCategory === "romantic" ? "bg-rose-500/20 border-rose-500 text-rose-300 shadow-sm" : "bg-neutral-950 border-white/10 text-neutral-400 hover:text-white"}`}>
                        <span>💖</span>
                        <span>Romantic</span>
                      </button>
                      <button type="button" onClick={() => setMusicCategory("celebration")} className={`py-2 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${musicCategory === "celebration" ? "bg-amber-500/20 border-amber-500 text-amber-300 shadow-sm" : "bg-neutral-950 border-white/10 text-neutral-400 hover:text-white"}`}>
                        <span>🎉</span>
                        <span>Celebration</span>
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-neutral-400 font-semibold mb-1">Duration (MM:SS)</label>
                    <input type="text" placeholder="3:45" value={musicDuration} onChange={(e) => setMusicDuration(e.target.value)} className="w-full bg-neutral-950 border border-white/10 rounded-xl px-3 py-2.5 text-white placeholder-neutral-500 font-mono focus:outline-none focus:border-rose-500" />
                  </div>
                </div>

                {/* Dedication */}
                <div>
                  <label className="block text-neutral-400 font-semibold mb-1">Dedication / Description Note</label>
                  <input type="text" placeholder="e.g. Our beautiful engagement & love anthem 💍💖" value={musicDedication} onChange={(e) => setMusicDedication(e.target.value)} className="w-full bg-neutral-950 border border-white/10 rounded-xl px-3 py-2.5 text-white placeholder-neutral-500 focus:outline-none focus:border-rose-500" />
                </div>

                {/* MP3 File Upload Dropzone */}
                <div className="space-y-1.5">
                  <label className="block text-neutral-400 font-semibold">Audio File Upload (.mp3, .m4a, .wav)</label>

                  <div className="relative border-2 border-dashed border-white/15 hover:border-rose-500/50 rounded-2xl p-4 text-center bg-neutral-950/60 transition-colors">
                    <input type="file" accept="audio/*,.mp3,.m4a,.wav,.ogg" onChange={handleAudioFileUpload} disabled={isUploadingAudio} className="absolute inset-0 opacity-0 w-full h-full cursor-pointer z-10" />
                    <div className="flex flex-col items-center gap-1.5">
                      <div className="p-2.5 rounded-full bg-rose-500/10 text-rose-400">{isUploadingAudio ? <div className="w-5 h-5 border-2 border-rose-500 border-t-transparent rounded-full animate-spin" /> : <Upload className="w-5 h-5" />}</div>
                      <p className="text-neutral-200 font-semibold text-xs">{isUploadingAudio ? "Uploading audio..." : "Click or drop MP3 audio file to upload"}</p>
                      <p className="text-[10px] text-neutral-500 font-mono">Max size 25MB • Saved permanently to server</p>
                    </div>
                  </div>

                  {musicUploadProgress && <p className="text-[11px] text-sky-400 font-mono animate-pulse">{musicUploadProgress}</p>}
                </div>

                {/* Audio URL Input (alternative or uploaded result) */}
                <div>
                  <label className="block text-neutral-400 font-semibold mb-1">
                    Audio File URL / Path <span className="text-rose-400">*</span>
                  </label>
                  <input type="text" placeholder="/audio/uploads/song.mp3 or https://..." value={musicUrl} onChange={(e) => setMusicUrl(e.target.value)} required className="w-full bg-neutral-950 border border-white/10 rounded-xl px-3 py-2.5 text-white placeholder-neutral-500 font-mono text-[11px] focus:outline-none focus:border-rose-500" />
                </div>

                {/* Test preview audio player */}
                {musicUrl && (
                  <div className="p-3 rounded-xl bg-black/40 border border-white/5 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <Headphones className="w-4 h-4 text-rose-400 shrink-0" />
                      <span className="text-xs text-neutral-300 font-medium truncate">Ready to preview audio</span>
                    </div>
                    <audio controls src={musicUrl} className="h-8 max-w-[200px]" />
                  </div>
                )}

                {/* Form Buttons */}
                <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-white/10">
                  <button type="button" onClick={() => setIsAddMusicModalOpen(false)} className="px-4 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-xl font-semibold transition-colors cursor-pointer">
                    Cancel
                  </button>

                  <button type="submit" disabled={isUploadingAudio || !musicTitle.trim() || !musicUrl.trim()} className="px-5 py-2.5 bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 text-white font-semibold rounded-xl shadow-md transition-all cursor-pointer disabled:opacity-50">
                    {editingMusicTrack ? "Update Global Song" : "Broadcast to All Couples 🌍"}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}

        {/* MODAL: DELETE CONFIRMATION */}
        {musicToDelete && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="w-full max-w-sm bg-neutral-900 border border-white/15 rounded-3xl p-6 shadow-2xl text-center space-y-4">
              <div className="w-12 h-12 bg-rose-500/10 rounded-2xl flex items-center justify-center mx-auto text-rose-400">
                <Trash2 className="w-6 h-6" />
              </div>

              <div>
                <h3 className="font-serif text-lg font-bold text-white">Delete Global Preset?</h3>
                <p className="text-xs text-neutral-400 mt-1">
                  Are you sure you want to remove <strong className="text-white">"{musicToDelete.title}"</strong> from the global music vault? All couples will no longer have access to this preset.
                </p>
              </div>

              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setMusicToDelete(null)} className="flex-1 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-bold rounded-xl cursor-pointer">
                  Cancel
                </button>
                <button type="button" onClick={handleConfirmDeleteMusicTrack} className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-xl shadow-md cursor-pointer">
                  Delete Global Track
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AdminPanel;
