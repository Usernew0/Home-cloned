import React, { useState, useEffect, useRef, useMemo, Suspense, lazy } from "react";
import { endFirebaseSession, ensureFirebaseRefresh, getFirebaseScope } from "./lib/firebaseScope";
import { resolveParticipantPid } from "./lib/participants";
import { motion, AnimatePresence } from "motion/react";
import { Heart, Calendar, Image as ImageIcon, Images, Mail, Sparkles, Clock, Gift, HeartHandshake, ChevronRight, MessageSquareHeart, Lock, LogOut, Bell, BellOff, X, ChevronLeft, Volume2, VolumeX, HelpCircle, Menu, Grid, ChevronDown, ChevronUp, Crown, User, Music, Headphones, Disc } from "lucide-react";

// Components required for initial unauthenticated login shell
import { HeartCanvas } from "./components/HeartCanvas";
import { Login } from "./components/Login";
import { ErrorBoundary } from "./components/ErrorBoundary";

// Resilient dynamic import helper with automatic retry and stale-chunk recovery
function lazyWithRetry<T extends React.ComponentType<any>>(factory: () => Promise<{ default: T } | { [key: string]: any }>, componentName?: string, retries = 3, interval = 800): React.LazyExoticComponent<T> {
  return lazy(() => {
    return new Promise<{ default: T }>((resolve, reject) => {
      const attempt = (remaining: number) => {
        factory()
          .then((module: any) => {
            if (module && module.default) {
              resolve({ default: module.default });
            } else if (componentName && module && module[componentName]) {
              resolve({ default: module[componentName] });
            } else if (module) {
              const namedExport = Object.values(module).find((exp) => typeof exp === "function") as T;
              if (namedExport) {
                resolve({ default: namedExport });
              } else {
                resolve({ default: module as unknown as T });
              }
            } else {
              reject(new Error(`Failed to resolve component export from module.`));
            }
          })
          .catch((error) => {
            console.warn(`[DynamicImport] Retry ${retries - remaining + 1}/${retries} for ${componentName || "component"}:`, error);
            if (remaining > 0) {
              setTimeout(() => attempt(remaining - 1), interval);
            } else {
              const isChunkOrFetchError = error?.message?.includes("dynamically imported module") || error?.message?.includes("Failed to fetch") || error?.name === "ChunkLoadError" || error?.name === "TypeError";

              const sessionKey = "app_chunk_retry_key";
              const hasAutoReloaded = sessionStorage.getItem(sessionKey);
              if (isChunkOrFetchError && !hasAutoReloaded) {
                sessionStorage.setItem(sessionKey, Date.now().toString());
                window.location.reload();
                return;
              }
              sessionStorage.removeItem(sessionKey);
              reject(error);
            }
          });
      };
      attempt(retries);
    });
  });
}

// High-performance code-split lazy imports with auto-retry resilience
const MilestoneCard = lazyWithRetry(() => import("./components/MilestoneCard"), "MilestoneCard");
const DatePlanner = lazyWithRetry(() => import("./components/DatePlanner"), "DatePlanner");
const MemoryVault = lazyWithRetry(() => import("./components/MemoryVault"), "MemoryVault");
const Gallery = lazyWithRetry(() => import("./components/Gallery"), "Gallery");
const LoveLetterBox = lazyWithRetry(() => import("./components/LoveLetterBox"), "LoveLetterBox");
const ChooseMoment = lazyWithRetry(() => import("./components/ChooseMoment"), "ChooseMoment");
const LoveAnimation = lazyWithRetry(() => import("./components/LoveAnimation"), "LoveAnimation");
const MusicLounge = lazyWithRetry(() => import("./components/MusicLounge"), "MusicLounge");
const DailyLoveQuote = lazyWithRetry(() => import("./components/DailyLoveQuote"), "DailyLoveQuote");
const AnniversaryCountdown = lazyWithRetry(() => import("./components/AnniversaryCountdown"), "AnniversaryCountdown");
const RomanticChat = lazyWithRetry(() => import("./components/RomanticChat"), "RomanticChat");
const Questions = lazyWithRetry(() => import("./components/Questions"), "Questions");
const AdminPanel = lazyWithRetry(() => import("./components/AdminPanel"), "AdminPanel");
const SubscriptionModal = lazyWithRetry(() => import("./components/SubscriptionModal"), "SubscriptionModal");
const UserProfileModal = lazyWithRetry(() => import("./components/UserProfileModal"), "UserProfileModal");
const NotificationsModal = lazyWithRetry(() => import("./components/NotificationsModal"), "NotificationsModal");

const ViewLoadingFallback = () => (
  <div className="w-full py-16 flex items-center justify-center">
    <div className="flex flex-col items-center gap-3">
      <div className="w-7 h-7 border-2 border-rose-500 border-t-transparent rounded-full animate-spin" />
      <span className="text-xs text-rose-300/80 font-sans tracking-wide">Loading space...</span>
    </div>
  </div>
);

// Telegram Bot & Alert Dispatchers
import { sendTelegramAlert, formatMilestoneTelegramMessage, formatDatePlanTelegramMessage, formatLoveLetterTelegramMessage, formatChatMessageTelegramMessage, formatSecurityAlertTelegramMessage, syncTelegramBotContext } from "./lib/telegramService";

// Utils and types
import { storage, getEgyptTimeString, formatMilestoneDateInEgypt, parseEventDateInEgypt, getEgyptCalendarComponents, getDaysTogetherInEgypt, getDaysUntilMilestoneInEgypt, getHoursUntilDatePlanInEgypt, calculateSubscriptionEndDate, getSubscriptionStatus } from "./utils";
import { Milestone, DatePlan, Memory, LoveLetter, MilestoneCategory, ChatMessage, UserPresence, CoupleQuestion, UserAccount, AdminSetting, CoupleTenant, SubscriptionPlan, DEFAULT_SUBSCRIPTION_PLANS, TabLimitation, APP_TABS, UserActivityLog, CountdownConfig, DEFAULT_COUNTDOWN_CONFIG, MilestoneQuotas, DEFAULT_MILESTONE_QUOTAS } from "./types";

import {
  seedIfEmpty,
  subscribeToMilestones,
  subscribeToDatePlans,
  subscribeToMemories,
  subscribeToLetters,
  subscribeToChatMessages,
  saveMilestoneDoc,
  deleteMilestoneDoc,
  saveDatePlanDoc,
  deleteDatePlanDoc,
  saveMemoryDoc,
  deleteMemoryDoc,
  saveLetterDoc,
  deleteLetterDoc,
  saveChatMessageDoc,
  deleteChatMessageDoc,
  updateUserPresenceDoc,
  subscribeToPresence,
  uploadChatImage,
  subscribeToCoupleQuestions,
  saveCoupleQuestionDoc,
  deleteCoupleQuestionDoc,
  subscribeToUserAccounts,
  saveUserAccountDoc,
  deleteUserAccountDoc,
  subscribeToAdminSettings,
  saveAdminSettingDoc,
  subscribeToCoupleTenants,
  saveCoupleTenantDoc,
  subscribeToFirestoreActivityLogs,
  logActivity,
} from "./lib/syncService";
import { createSessionToken, verifySessionToken, getClientIp } from "./utils/crypto";
import { supabase } from "./lib/supabase";

const playNotificationChime = () => {
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();

    // First note: A sweet bell tone (F5)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(698.46, ctx.currentTime);

    gain1.gain.setValueAtTime(0.12, ctx.currentTime);
    gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);

    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(ctx.currentTime);
    osc1.stop(ctx.currentTime + 0.35);

    // Second note: A higher complementary bell tone (C6) for a lovely chime
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(1046.5, ctx.currentTime + 0.08);

    gain2.gain.setValueAtTime(0, ctx.currentTime);
    gain2.gain.setValueAtTime(0.1, ctx.currentTime + 0.08);
    gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.55);

    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(ctx.currentTime + 0.08);
    osc2.stop(ctx.currentTime + 0.55);
  } catch (e) {
    console.warn("Could not play notification sound:", e);
  }
};

const playCustomNotificationSound = (type: string) => {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const playTone = (freq: number, start: number, duration: number, typeOfOsc: OscillatorType = "sine", volumeValue = 0.15) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = typeOfOsc;
      osc.frequency.setValueAtTime(freq, start);

      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(volumeValue, start + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, start + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(start);
      osc.stop(start + duration);
    };

    const now = ctx.currentTime;

    if (type === "harps") {
      const notes = [523.25, 659.25, 783.99, 987.77, 1046.5]; // C5, E5, G5, B5, C6
      notes.forEach((freq, idx) => {
        playTone(freq, now + idx * 0.08, 0.6, "triangle", 0.12);
      });
    } else if (type === "chime") {
      playTone(587.33, now, 0.8, "sine", 0.2); // D5
      playTone(880, now + 0.05, 1.0, "sine", 0.15); // A5
      playTone(1174.66, now + 0.1, 1.2, "sine", 0.1); // D6
    } else if (type === "spark") {
      const notes = [880, 1046.5, 1318.51, 1567.98]; // A5, C6, E6, G6
      notes.forEach((freq, idx) => {
        playTone(freq, now + idx * 0.04, 0.4, "sine", 0.1);
      });
    } else if (type === "waltz") {
      playTone(523.25, now, 0.25, "sine", 0.15);
      playTone(659.25, now + 0.15, 0.25, "sine", 0.15);
      playTone(783.99, now + 0.3, 0.4, "sine", 0.15);
      playTone(880, now + 0.45, 0.4, "sine", 0.12);
    } else if (type === "lullaby") {
      playTone(698.46, now, 0.3, "sine", 0.15); // F5
      playTone(783.99, now + 0.2, 0.3, "sine", 0.15); // G5
      playTone(880, now + 0.4, 0.5, "sine", 0.15); // A5
      playTone(659.25, now + 0.7, 0.6, "sine", 0.15); // E5
    } else {
      playNotificationChime();
    }
  } catch (err) {
    console.warn("Could not play synthesized audio notification:", err);
    playNotificationChime();
  }
};

export default function App() {
  const [activeTab, setActiveTab] = useState<"dashboard" | "milestones" | "planner" | "album" | "letters" | "choose" | "animation" | "chat" | "questions" | "gallery" | "music">("dashboard");
  const [plannerSubTab, setPlannerSubTab] = useState<"scheduler" | "ideas">("scheduler");
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Auth states
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentUser, setCurrentUser] = useState("");
  const [logoutMessage, setLogoutMessage] = useState<string | null>(null);

  // Multi-Tenancy & SaaS Subscription States
  const [coupleTenant, setCoupleTenant] = useState<CoupleTenant>({
    coupleId: "",
    coupleName: "Our Space",
    partner1: "",
    partner2: "",
    plan: "free",
    smsEnabled: false,
  });
  const [isSubscriptionModalOpen, setIsSubscriptionModalOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isNotificationsModalOpen, setIsNotificationsModalOpen] = useState(false);
  const [subscriptionNotice, setSubscriptionNotice] = useState<{ lockedTabLabel?: string; quotaReason?: string } | null>(null);

  // App States - initialized offline-first using local storage / pre-seeded fallbacks

  const [milestones, setMilestones] = useState<Milestone[]>(() => storage.getMilestones());
  const [datePlans, setDatePlans] = useState<DatePlan[]>(() => storage.getDatePlans());
  const [memories, setMemories] = useState<Memory[]>(() => storage.getMemories());
  const [letters, setLetters] = useState<LoveLetter[]>(() => storage.getLetters());
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(() => storage.getChatMessages());
  const [coupleQuestions, setCoupleQuestions] = useState<CoupleQuestion[]>(() => storage.getCoupleQuestions());
  const [userPresences, setUserPresences] = useState<UserPresence[]>([]);
  const [userAccounts, setUserAccounts] = useState<UserAccount[]>(() => storage.getUserAccounts());
  // False until a server fetch (not the local cache or a local save) has delivered the list, so the panel never reports "no accounts linked" from a stale cache.
  const [userAccountsFetched, setUserAccountsFetched] = useState(false);
  const [adminSettings, setAdminSettings] = useState<AdminSetting[]>(() => storage.getAdminSettings());
  const [activityLogs, setActivityLogs] = useState<UserActivityLog[]>([]);

  // Notifications read/cleared persistence
  const [readNotificationIds, setReadNotificationIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem("love_read_notification_ids");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [clearedNotificationIds, setClearedNotificationIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem("love_cleared_notification_ids");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const handleMarkNotificationAsRead = (id: string) => {
    setReadNotificationIds((prev) => {
      if (prev.includes(id)) return prev;
      const updated = [...prev, id];
      localStorage.setItem("love_read_notification_ids", JSON.stringify(updated));
      return updated;
    });
  };

  const handleMarkAllNotificationsAsRead = (ids: string[]) => {
    setReadNotificationIds((prev) => {
      const set = new Set([...prev, ...ids]);
      const updated = Array.from(set);
      localStorage.setItem("love_read_notification_ids", JSON.stringify(updated));
      return updated;
    });
  };

  const handleClearAllNotifications = (ids: string[]) => {
    setClearedNotificationIds((prev) => {
      const set = new Set([...prev, ...ids]);
      const updated = Array.from(set);
      localStorage.setItem("love_cleared_notification_ids", JSON.stringify(updated));
      return updated;
    });
  };

  // Real-time calculated unread notifications count strictly scoped to user and couple space
  const unreadNotificationsCount = useMemo(() => {
    if (!isLoggedIn || !currentUser) return 0;
    const cleanUser = currentUser.toLowerCase().trim();
    const currentCoupleId = (coupleTenant.coupleId || "").trim();
    let count = 0;

    const isSameCoupleSpace = (itemCoupleId?: string) => {
      if (!itemCoupleId || !itemCoupleId.trim()) return true;
      if (!currentCoupleId) return true;
      return itemCoupleId.trim() === currentCoupleId;
    };

    if (Array.isArray(chatMessages)) {
      chatMessages.forEach((msg) => {
        if (msg && isSameCoupleSpace(msg.coupleId) && msg.sender?.toLowerCase().trim() !== cleanUser) {
          const id = `msg_${msg.id}`;
          if (!msg.seen && !readNotificationIds.includes(id) && !clearedNotificationIds.includes(id)) {
            count++;
          }
        }
      });
    }

    if (Array.isArray(letters)) {
      letters.forEach((letter) => {
        if (letter && isSameCoupleSpace(letter.coupleId) && letter.sender?.toLowerCase().trim() !== cleanUser) {
          const id = `letter_${letter.id}`;
          if (!letter.isOpened && !readNotificationIds.includes(id) && !clearedNotificationIds.includes(id)) {
            count++;
          }
        }
      });
    }

    if (Array.isArray(datePlans)) {
      datePlans.forEach((plan) => {
        if (plan && isSameCoupleSpace(plan.coupleId) && plan.createdBy?.toLowerCase().trim() !== cleanUser) {
          const id = `plan_${plan.id}`;
          if (!readNotificationIds.includes(id) && !clearedNotificationIds.includes(id)) {
            count++;
          }
        }
      });
    }

    if (Array.isArray(milestones)) {
      milestones.forEach((m) => {
        if (m && isSameCoupleSpace(m.coupleId) && m.createdBy?.toLowerCase().trim() !== cleanUser) {
          const id = `milestone_${m.id}`;
          if (!readNotificationIds.includes(id) && !clearedNotificationIds.includes(id)) {
            count++;
          }
        }
      });
    }

    if (Array.isArray(coupleQuestions)) {
      coupleQuestions.forEach((q) => {
        if (q && isSameCoupleSpace(q.coupleId) && Array.isArray(q.answers)) {
          q.answers.forEach((ans) => {
            if (ans.username && ans.username.toLowerCase().trim() !== cleanUser) {
              const id = `q_ans_${q.id}_${ans.username}`;
              if (!readNotificationIds.includes(id) && !clearedNotificationIds.includes(id)) {
                count++;
              }
            }
          });
        }
      });
    }

    return count;
  }, [currentUser, isLoggedIn, coupleTenant.coupleId, chatMessages, letters, datePlans, milestones, coupleQuestions, readNotificationIds, clearedNotificationIds]);

  // Get current logged in user account doc
  const currentUserAccount = useMemo<UserAccount | null>(() => {
    if (!currentUser) return null;
    const cleanUser = currentUser.toLowerCase().trim();
    return userAccounts.find((u) => u.username?.toLowerCase().trim() === cleanUser) || null;
  }, [currentUser, userAccounts]);

  // Subscription Plans configuration resolved from Admin Settings
  const subscriptionPlans = useMemo<SubscriptionPlan[]>(() => {
    const setting = adminSettings.find((s) => s.id === "subscriptionPlans");
    return setting?.subscriptionPlans && Array.isArray(setting.subscriptionPlans) ? setting.subscriptionPlans : [];
  }, [adminSettings]);

  // Synchronize global preset music tracks from Admin Settings
  useEffect(() => { if (getFirebaseScope()) ensureFirebaseRefresh(); }, []);

  useEffect(() => {
    const globalMusicDoc = adminSettings.find((s) => s.id === "globalMusicTracks");
    if (globalMusicDoc?.globalMusicTracks && Array.isArray(globalMusicDoc.globalMusicTracks)) {
      storage.saveGlobalMusicTracks(globalMusicDoc.globalMusicTracks);
    }
  }, [adminSettings]);

  // Synchronize dynamic context to Telegram Bot engine (letters, milestones, date plans for /letters, /milestones, /dates commands)
  useEffect(() => {
    if ((letters && letters.length > 0) || (milestones && milestones.length > 0) || (datePlans && datePlans.length > 0)) {
      syncTelegramBotContext({
        letters: letters.map((l) => ({ id: l.id, subject: l.subject, content: l.content, sender: l.sender, recipient: l.recipient, date: l.date })),
        milestones: milestones.map((m) => ({ id: m.id, title: m.title, category: m.category, date: m.date, description: m.description })),
        datePlans: datePlans.map((d) => ({ id: d.id, title: d.title, dateTime: d.dateTime, location: d.location, description: d.description })),
      });
    }
  }, [letters, milestones, datePlans]);

  // Active Subscription Plan for current couple tenant
  const activeSubscriptionPlan = useMemo<SubscriptionPlan | null>(() => {
    if (!subscriptionPlans || subscriptionPlans.length === 0) return null;
    const userPlanId = coupleTenant?.plan || "free";
    return subscriptionPlans.find((p) => p.id === userPlanId) || subscriptionPlans.find((p) => p.isDefault) || subscriptionPlans[0] || null;
  }, [subscriptionPlans, coupleTenant]);

  // Handle Tab Selection with Tier Enforcement
  const handleTabSelect = (tabId: string) => {
    const tabLimit = activeSubscriptionPlan?.tabLimits?.[tabId] || { maxLimit: -1, isLocked: false };
    if (tabLimit.isLocked) {
      const tabObj = APP_TABS.find((t) => t.id === tabId);
      setSubscriptionNotice({
        lockedTabLabel: tabObj?.label || tabId,
        quotaReason: tabLimit.description || `The ${tabObj?.label || tabId} tab is locked on your current ${activeSubscriptionPlan?.name || "Plan"}. Upgrade to Pro Plan to unlock access!`,
      });
      setIsSubscriptionModalOpen(true);
      return;
    }

    setActiveTab(tabId as any);
    if (tabId === "planner") {
      setPlannerSubTab("scheduler");
    }
    if (tabId === "chat") {
      const now = Date.now();
      setLastReadChatTime(now);
      setSessionLastReadTime(now);
      localStorage.setItem("love_last_read_chat_time", now.toString());
    }
    if (tabId !== "milestones") {
      setSelectedMilestoneCategory(null);
    }
  };

  // Keep coupleTenant aligned with the logged-in user account's coupleId
  useEffect(() => {
    if (!currentUser) return;
    const cleanUser = currentUser.toLowerCase().trim();
    const userDoc = userAccounts.find((u) => u.username?.toLowerCase().trim() === cleanUser);

    const targetCoupleId = userDoc?.coupleId || `couple_${cleanUser}`;

    const allTenants = storage.getCoupleTenants();
    const matchingTenant = allTenants.find((t) => t.coupleId === targetCoupleId);

    if (matchingTenant) {
      setCoupleTenant(matchingTenant);
    } else {
      setCoupleTenant({
        coupleId: targetCoupleId,
        coupleName: userDoc ? `${userDoc.username}'s Space` : `${currentUser}'s Space`,
        partner1: currentUser,
        partner2: userDoc?.partnerUsername || "",
        plan: userDoc?.plan || "free",
        smsEnabled: false,
      });
    }
  }, [currentUser, userAccounts]);

  // Handler for updating romantic canvas animation song per couple tenant
  const handleUpdateAnimationSong = async (title: string, link: string) => {
    const targetCoupleId = coupleTenant.coupleId || `couple_${currentUser.toLowerCase().trim()}`;
    const updatedTenant: CoupleTenant = {
      ...coupleTenant,
      coupleId: targetCoupleId,
      animationSongTitle: title,
      animationSongLink: link,
    };

    setCoupleTenant(updatedTenant);

    // Update local cache
    const allTenants = storage.getCoupleTenants();
    const existingIdx = allTenants.findIndex((t) => t.coupleId === updatedTenant.coupleId);
    let newTenantsList: CoupleTenant[];
    if (existingIdx >= 0) {
      newTenantsList = [...allTenants];
      newTenantsList[existingIdx] = updatedTenant;
    } else {
      newTenantsList = [...allTenants, updatedTenant];
    }
    storage.setCoupleTenants(newTenantsList);

    // Save to Firestore and Supabase via syncService
    try {
      await saveCoupleTenantDoc(updatedTenant);
    } catch (err) {
      console.error("Failed to save couple tenant song configuration:", err);
    }
  };

  // Active tenant filtered data lists - isolates user/couple spaces and prevents data leakage across different user accounts
  const cleanUser = currentUser.toLowerCase().trim();
  const currentCoupleId = coupleTenant.coupleId || `couple_${cleanUser}`;

  const activeMilestones = useMemo(() => {
    if (!Array.isArray(milestones)) return [];
    const seen = new Set<string>();
    return milestones.filter((m) => {
      if (!m || !m.id || seen.has(m.id)) return false;
      const mCoupleId = m.coupleId;
      const creator = m.createdBy?.toLowerCase().trim();

      if ((mCoupleId && mCoupleId === currentCoupleId) || (creator && creator === cleanUser)) {
        seen.add(m.id);
        return true;
      }
      return false;
    });
  }, [milestones, currentCoupleId, cleanUser]);

  const activeDatePlans = useMemo(() => {
    if (!Array.isArray(datePlans)) return [];
    const seen = new Set<string>();
    return datePlans.filter((p) => {
      if (!p || !p.id || seen.has(p.id)) return false;
      const pCoupleId = p.coupleId;
      const creator = p.createdBy?.toLowerCase().trim();

      if ((pCoupleId && pCoupleId === currentCoupleId) || (creator && creator === cleanUser)) {
        seen.add(p.id);
        return true;
      }
      return false;
    });
  }, [datePlans, currentCoupleId, cleanUser]);

  const activeMemories = useMemo(() => {
    if (!Array.isArray(memories)) return [];
    const seen = new Set<string>();
    return memories.filter((m) => {
      if (!m || !m.id || seen.has(m.id)) return false;
      const mCoupleId = m.coupleId;
      const creator = m.createdBy?.toLowerCase().trim();

      if ((mCoupleId && mCoupleId === currentCoupleId) || (creator && creator === cleanUser)) {
        seen.add(m.id);
        return true;
      }
      return false;
    });
  }, [memories, currentCoupleId, cleanUser]);

  const activeLetters = useMemo(() => {
    if (!Array.isArray(letters)) return [];
    const seen = new Set<string>();
    return letters.filter((l) => {
      if (!l || !l.id || seen.has(l.id)) return false;
      const lCoupleId = l.coupleId;
      const sender = l.sender?.toLowerCase().trim();
      const recipient = l.recipient?.toLowerCase().trim();
      const creator = l.createdBy?.toLowerCase().trim();

      if (sender === cleanUser || recipient === cleanUser || creator === cleanUser || (lCoupleId && lCoupleId === currentCoupleId)) {
        seen.add(l.id);
        return true;
      }
      return false;
    });
  }, [letters, currentCoupleId, cleanUser]);

  const activeCoupleQuestions = useMemo(() => {
    if (!Array.isArray(coupleQuestions)) return [];
    const seen = new Set<string>();
    return coupleQuestions.filter((q) => {
      if (!q || !q.id || seen.has(q.id)) return false;
      const qCoupleId = q.coupleId;
      const creator = q.createdBy?.toLowerCase().trim();

      if ((qCoupleId && qCoupleId === currentCoupleId) || (creator && creator === cleanUser) || q.isSystemPreset || q.id?.startsWith("default_") || q.id?.startsWith("preset_")) {
        seen.add(q.id);
        return true;
      }
      return false;
    });
  }, [coupleQuestions, currentCoupleId, cleanUser]);

  const activeChatMessages = useMemo(() => {
    if (!Array.isArray(chatMessages)) return [];
    const seen = new Set<string>();
    return chatMessages.filter((m) => {
      if (!m || !m.id || seen.has(m.id)) return false;
      const mCoupleId = m.coupleId;
      const sender = m.sender?.toLowerCase().trim();
      const receiver = (m.receiver || "").toLowerCase().trim();
      const conversationId = (m.conversationId || "").toLowerCase().trim();

      if (sender === cleanUser || receiver === cleanUser || receiver.startsWith("group_") || conversationId.startsWith("group_") || receiver === "global" || conversationId === "global" || (!receiver && !conversationId && mCoupleId && mCoupleId === currentCoupleId)) {
        seen.add(m.id);
        return true;
      }
      return false;
    });
  }, [chatMessages, currentCoupleId, cleanUser]);

  // Get visible tabs based on admin settings & individual user overrides
  const getVisibleTabs = () => {
    const tabVisibilityDoc = adminSettings.find((s) => s.id === "tabVisibility");
    const visibleTabsMap = tabVisibilityDoc?.visibleTabs || {};

    const currentUserDoc = userAccounts.find((u) => u.username?.toLowerCase() === currentUser.toLowerCase());
    const userTabsMap = currentUserDoc?.visibleTabs || {};

    const allTabs = [
      { id: "dashboard", label: "Home", icon: HeartHandshake },
      { id: "choose", label: "Choose Card", icon: Sparkles },
      { id: "milestones", label: "Milestones", icon: Gift },
      { id: "planner", label: "Date Planner", icon: Calendar },
      { id: "album", label: "Scrapbook", icon: ImageIcon },
      { id: "gallery", label: "Gallery", icon: Images },
      { id: "music", label: "Music", icon: Music },
      { id: "letters", label: "Letters", icon: Mail },
      { id: "chat", label: "Chat", icon: MessageSquareHeart },
      { id: "questions", label: "Questions", icon: HelpCircle },
      { id: "animation", label: "Animation", icon: Heart },
    ];

    return allTabs.filter((tab) => {
      // 1. Explicit user-specific override has highest priority
      if (userTabsMap && tab.id in userTabsMap && userTabsMap[tab.id] !== undefined) {
        return userTabsMap[tab.id] === true;
      }
      // 2. Otherwise fallback to global admin setting
      return visibleTabsMap[tab.id] !== false;
    });
  };

  // Redirect to dashboard if the active tab is hidden by global admin or user-specific overrides
  useEffect(() => {
    const tabVisibilityDoc = adminSettings.find((s) => s.id === "tabVisibility");
    const visibleTabsMap = tabVisibilityDoc?.visibleTabs || {};

    const currentUserDoc = userAccounts.find((u) => u.username?.toLowerCase() === currentUser.toLowerCase());
    const userTabsMap = currentUserDoc?.visibleTabs || {};

    if (activeTab !== "dashboard") {
      const hasUserOverride = userTabsMap && activeTab in userTabsMap && userTabsMap[activeTab] !== undefined;
      const isVisible = hasUserOverride ? userTabsMap[activeTab] === true : visibleTabsMap[activeTab] !== false;

      if (!isVisible) {
        setActiveTab("dashboard");
      }
    }
  }, [adminSettings, userAccounts, currentUser, activeTab]);

  // Dynamic favicon update
  useEffect(() => {
    const faviconDoc = adminSettings.find((s) => s.id === "websiteFavicon");
    // Default to a beautiful red heart emoji SVG data URL if no custom favicon exists
    const faviconUrl = faviconDoc?.favicon || "data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>❤️</text></svg>";

    // Remove any existing favicons in the document head
    const links = document.querySelectorAll("link[rel*='icon']");
    links.forEach((el) => el.parentNode?.removeChild(el));

    // Create and append the new favicon elements for maximum cross-browser support
    const linkIcon = document.createElement("link");
    linkIcon.rel = "icon";
    linkIcon.href = faviconUrl;
    document.getElementsByTagName("head")[0].appendChild(linkIcon);

    const linkShortcut = document.createElement("link");
    linkShortcut.rel = "shortcut icon";
    linkShortcut.href = faviconUrl;
    document.getElementsByTagName("head")[0].appendChild(linkShortcut);
  }, [adminSettings]);

  // Last read chat timestamp for notification/glow state
  const [lastReadChatTime, setLastReadChatTime] = useState<number>(() => {
    const stored = localStorage.getItem("love_last_read_chat_time");
    return stored ? parseInt(stored, 10) : Date.now();
  });
  const [sessionLastReadTime, setSessionLastReadTime] = useState<number | null>(null);

  const hasUnreadMessages =
    isLoggedIn &&
    activeChatMessages.some((msg) => {
      const sender = msg.sender.toLowerCase().trim();
      const receiver = (msg.receiver || "").toLowerCase().trim();
      const me = currentUser.toLowerCase().trim();

      // Ignore my own messages
      if (sender === me) return false;

      // Check if the message is actually addressed to me
      if (receiver) {
        if (receiver !== me) return false;
      } else {
        // Legacy message fallback: only for the first regular user / admin chat
        const adminCreds = adminSettings.find((s) => s.id === "credentials");
        const adminName = (adminCreds?.username || (import.meta as any).env.VITE_APP_USERNAME || "home").toLowerCase().trim();
        const firstRegularUser = userAccounts[0]?.username?.toLowerCase().trim() || "";

        const isLegacyChatForMe = (me === adminName && sender === firstRegularUser) || (me === firstRegularUser && sender === adminName);
        if (!isLegacyChatForMe) return false;
      }

      return new Date(msg.timestamp).getTime() > lastReadChatTime;
    });

  // Real-time unread counts per tab for high-contrast badge indicators
  const tabUnreadCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    if (!isLoggedIn || !currentUser) return counts;
    const me = currentUser.toLowerCase().trim();

    if (hasUnreadMessages) {
      counts.chat = activeChatMessages.filter((msg) => msg.sender.toLowerCase().trim() !== me && !msg.seen).length || 1;
    }

    if (Array.isArray(activeLetters)) {
      counts.letters = activeLetters.filter((l) => l && l.sender?.toLowerCase().trim() !== me && !l.isOpened).length;
    }

    if (Array.isArray(activeDatePlans)) {
      const now = Date.now();
      counts.planner = activeDatePlans.filter((p) => p && p.status === "planned" && new Date(p.dateTime).getTime() > now && p.createdBy?.toLowerCase().trim() !== me).length;
    }

    if (Array.isArray(activeCoupleQuestions)) {
      counts.questions = activeCoupleQuestions.filter((q) => q && Array.isArray(q.answers) && !q.answers.some((a) => a.username?.toLowerCase().trim() === me)).length;
    }

    return counts;
  }, [isLoggedIn, currentUser, hasUnreadMessages, activeChatMessages, activeLetters, activeDatePlans, activeCoupleQuestions]);

  const isUserOnline = (username: string) => {
    const presence = userPresences.find((p) => p.username.toLowerCase().trim() === username.toLowerCase().trim());
    if (!presence) return false;
    const diffMs = new Date().getTime() - new Date(presence.lastActive).getTime();
    return Math.abs(diffMs) < 60000; // Tolerant 60s window
  };

  const isPartnerOnline = () => {
    if (!currentUser) return false;
    const adminCreds = adminSettings.find((s) => s.id === "credentials");
    const adminUsername = adminCreds?.username || (import.meta as any).env?.VITE_APP_USERNAME || "Admin";
    const usernames = [adminUsername, ...userAccounts.map((u) => u.username)];
    const seen = new Set<string>();
    const unique: string[] = [];
    for (const u of usernames) {
      if (u && !seen.has(u.toLowerCase().trim())) {
        seen.add(u.toLowerCase().trim());
        unique.push(u.trim());
      }
    }
    const partners = unique.filter((u) => u.toLowerCase().trim() !== currentUser.toLowerCase().trim());
    return partners.some((partner) => isUserOnline(partner));
  };

  // Specific milestone sub-navigation state
  const [selectedMilestoneCategory, setSelectedMilestoneCategory] = useState<string | null>(null);

  // Selected anniversary milestone for dashboard cards
  const [selectedAnniversaryId, setSelectedAnniversaryId] = useState<string>("anniversary");

  // Upcoming milestone alert states
  const [dismissedAlerts, setDismissedAlerts] = useState<string[]>([]);

  // Egypt Cairo timezone real-time clock state
  const [egyptTime, setEgyptTime] = useState(getEgyptTimeString());

  useEffect(() => {
    const timer = setInterval(() => {
      setEgyptTime(getEgyptTimeString());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Chat sound notification toggle state
  const [isSoundEnabled, setIsSoundEnabled] = useState<boolean>(() => {
    const saved = localStorage.getItem("love_chat_sound_enabled");
    return saved !== "false"; // default is true
  });

  const [notificationPermission, setNotificationPermission] = useState<string>("Notification" in window ? Notification.permission : "denied");

  // Helper to show native Web Notifications with sound and permission checks
  const showWebNotification = (title: string, options?: NotificationOptions) => {
    if (!("Notification" in window)) return;
    if (Notification.permission === "granted") {
      try {
        new Notification(title, options);
      } catch (e) {
        console.warn("Failed to show HTML5 notification:", e);
      }
    } else if (Notification.permission === "default") {
      Notification.requestPermission().then((permission) => {
        setNotificationPermission(permission);
        if (permission === "granted") {
          try {
            new Notification(title, options);
          } catch (e) {
            console.warn("Failed to show HTML5 notification:", e);
          }
        }
      });
    }
  };

  // Auto-request browser Notification permission upon logging in
  useEffect(() => {
    if (isLoggedIn && "Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().then((permission) => {
        setNotificationPermission(permission);
        if (permission === "granted") {
          showWebNotification("Notifications Enabled! 🔔", {
            body: "You will now receive automatic real-time updates for new messages and milestones!",
          });
        }
      });
    }
  }, [isLoggedIn]);

  const prevMessageIdsRef = useRef<Set<string>>(new Set((chatMessages || []).map((m) => m.id)));
  const prevMilestoneIdsRef = useRef<Set<string>>(new Set((milestones || []).map((m) => m.id)));

  // Play notification chime and trigger browser push notifications on new chat messages from partner
  useEffect(() => {
    const safeMessages = Array.isArray(chatMessages) ? chatMessages : [];
    if (!isLoggedIn || !currentUser) {
      // If not logged in, keep the ref synchronized to current messages without sound
      prevMessageIdsRef.current = new Set(safeMessages.map((m) => m.id));
      return;
    }

    const currentIds = new Set(safeMessages.map((m) => m.id));
    const newMessages = safeMessages.filter((msg) => !prevMessageIdsRef.current.has(msg.id));

    if (newMessages.length > 0 && prevMessageIdsRef.current.size > 0) {
      const partnerMessages = newMessages.filter((msg) => msg.sender.toLowerCase().trim() !== currentUser.toLowerCase().trim());

      if (partnerMessages.length > 0) {
        if (isSoundEnabled) {
          const firstMsg = partnerMessages[0];
          const partnerName = firstMsg.sender.toLowerCase().trim();
          const soundKey = `chat_notification_sound_${currentUser.toLowerCase().trim()}_${partnerName}`;
          const customSound = localStorage.getItem(soundKey);
          if (customSound) {
            playCustomNotificationSound(customSound);
          } else {
            playNotificationChime();
          }
        }

        partnerMessages.forEach((msg) => {
          showWebNotification(`New message from ${msg.sender} 💬`, {
            body: msg.content || "Sent an attachment",
            tag: msg.id,
          });
          // Dispatch Telegram Bot Alert (scoped to couple, excluding sender)
          sendTelegramAlert(formatChatMessageTelegramMessage(msg.sender, msg.content), "chat", {
            coupleId: currentCoupleId,
            excludeUsername: msg.sender,
            adminSettings,
            userAccounts,
          }).catch(() => {});
        });
      }
    }

    // Keep ref updated
    prevMessageIdsRef.current = currentIds;
  }, [chatMessages, currentUser, isLoggedIn, isSoundEnabled, adminSettings]);

  // Handle incoming real-time new milestones created by partner
  useEffect(() => {
    const safeMilestones = Array.isArray(milestones) ? milestones : [];
    if (!isLoggedIn || !currentUser) {
      prevMilestoneIdsRef.current = new Set(safeMilestones.map((m) => m.id));
      return;
    }

    const currentIds = new Set(safeMilestones.map((m) => m.id));
    const newMilestones = safeMilestones.filter((m) => !prevMilestoneIdsRef.current.has(m.id));

    if (newMilestones.length > 0 && prevMilestoneIdsRef.current.size > 0) {
      const partnerMilestones = newMilestones.filter((m) => m.createdBy && m.createdBy.toLowerCase().trim() !== currentUser.toLowerCase().trim());

      partnerMilestones.forEach((m) => {
        showWebNotification(`New Milestone Added! 💖`, {
          body: `"${m.title}" was added to our story!`,
          tag: m.id,
        });
        const days = getDaysUntilMilestone(m.date);
        sendTelegramAlert(formatMilestoneTelegramMessage(m.title, m.category, formatMilestoneDateInEgypt(m.date), days), "milestone", {
          coupleId: m.coupleId || currentCoupleId,
          excludeUsername: m.createdBy || currentUser,
          adminSettings,
          userAccounts,
        }).catch(() => {});
      });
    }

    prevMilestoneIdsRef.current = currentIds;
  }, [milestones, currentUser, isLoggedIn, adminSettings]);

  // Helper to compute days left until a milestone (supports annual recurring and future one-offs, using Egypt Standard Time)
  const getDaysUntilMilestone = (dateStr: string): number => {
    return getDaysUntilMilestoneInEgypt(dateStr);
  };

  // Browser Notifications handler for upcoming milestones (reminders)
  useEffect(() => {
    const safeMilestones = Array.isArray(milestones) ? milestones : [];
    if (safeMilestones.length === 0) return;

    // Check if notifications are supported
    if ("Notification" in window) {
      if (Notification.permission === "default") {
        Notification.requestPermission();
      }
    }

    const nearMilestones = safeMilestones.filter((m) => {
      const days = getDaysUntilMilestone(m.date);
      return days >= 0 && days <= 3;
    });

    if (nearMilestones.length > 0) {
      nearMilestones.forEach((m) => {
        const days = getDaysUntilMilestone(m.date);
        const daysText = days === 0 ? "is today! 🎉" : days === 1 ? "is tomorrow! 💖" : `is in ${days} days! 💕`;

        // Use sessionStorage to ensure the notification only fires once per browser session per milestone
        const sessionKey = `notified_love_app_${m.id}_${m.date}`;
        if (!sessionStorage.getItem(sessionKey)) {
          showWebNotification("Milestone Alert! ❤️", {
            body: `"${m.title}" ${daysText} Let's celebrate!`,
            tag: m.id,
          });
          // Dispatch Telegram Reminder (scoped to couple)
          sendTelegramAlert(formatMilestoneTelegramMessage(m.title, m.category, formatMilestoneDateInEgypt(m.date), days), "milestone", {
            coupleId: m.coupleId || currentCoupleId,
            adminSettings,
            userAccounts,
          }).catch(() => {});
          sessionStorage.setItem(sessionKey, "true");
        }
      });
    }
  }, [milestones, adminSettings]);

  // Browser Notifications handler for Date Plans
  useEffect(() => {
    if (datePlans.length === 0) return;

    // Check if notifications are supported
    if ("Notification" in window) {
      if (Notification.permission === "default") {
        Notification.requestPermission();
      }
    }

    const nearDatePlans = activeDatePlans.filter((p) => {
      if (p.status !== "planned") return false;
      const hours = getHoursUntilDatePlanInEgypt(p.dateTime);
      return hours > 0 && hours <= 96;
    });

    if (nearDatePlans.length > 0) {
      nearDatePlans.forEach((p) => {
        const hours = getHoursUntilDatePlanInEgypt(p.dateTime);
        const days = Math.floor(hours / 24);
        const remainingHours = Math.round(hours % 24);

        let timeLeftText = "";
        if (days > 0) {
          timeLeftText = `is in ${days}d ${remainingHours}h! 💖`;
        } else {
          timeLeftText = `is in ${remainingHours} hours! 💖`;
        }

        // Use sessionStorage to ensure the notification only fires once per browser session per date plan
        const sessionKey = `notified_date_plan_${p.id}_${p.dateTime}`;
        if (!sessionStorage.getItem(sessionKey)) {
          if ("Notification" in window && Notification.permission === "granted") {
            try {
              new Notification("Date Plan Reminder! 🗓️", {
                body: `"${p.title}" ${timeLeftText} Get ready for our special moment!`,
                tag: p.id,
              });
            } catch (e) {
              console.warn("Failed to show HTML5 notification:", e);
            }
          }
          // Dispatch Telegram Reminder (scoped to couple)
          sendTelegramAlert(formatDatePlanTelegramMessage(p.title, p.dateTime, p.location, hours), "date", {
            coupleId: p.coupleId || currentCoupleId,
            adminSettings,
            userAccounts,
          }).catch(() => {});
          sessionStorage.setItem(sessionKey, "true");
        }
      });
    }
  }, [datePlans, activeDatePlans, adminSettings]);

  // Load from local storage and check auth on mount, and sync with Firestore in real-time
  useEffect(() => {
    // Secure session token check to prevent DevTools console bypass
    const checkSession = async () => {
      const savedLogin = localStorage.getItem("love_app_is_logged_in");
      const sessionToken = localStorage.getItem("love_app_session_token");

      if (savedLogin === "true") {
        const verifyResult = await verifySessionToken(sessionToken);
        if (verifyResult.valid && verifyResult.username) {
          setIsLoggedIn(true);
          setCurrentUser(verifyResult.username);
        } else {
          // Detected DevTools console tampering or expired token
          console.warn("[Security Alert] Session token check failed:", verifyResult.reason);
          setIsLoggedIn(false);
          setCurrentUser("");
          localStorage.removeItem("love_app_is_logged_in");
          localStorage.removeItem("love_app_session_token");
          localStorage.removeItem("love_app_username");
          setLogoutMessage("Session expired or unauthorized token detected. Please sign in securely.");

          getClientIp().then((ip) => {
            const detailMsg = `Attempted unauthorized session bypass via modified browser storage. IP: ${ip} | Reason: ${verifyResult.reason}`;
            logActivity("Unauthorized Client", "security_tamper_attempt", detailMsg).catch(() => {});
            sendTelegramAlert(formatSecurityAlertTelegramMessage("Unauthorized Client", "security_tamper_attempt", detailMsg), "security", adminSettings).catch(() => {});
          });
        }
      }
    };
    checkSession();

    // Authenticated data & system configuration subscriptions: ONLY attach when successfully logged in
    let unsubUserAccounts = () => {};
    let unsubAdminSettings = () => {};
    let unsubCoupleTenants = () => {};
    let unsubMilestones: () => void = () => {};
    let unsubDatePlans: () => void = () => {};
    let unsubMemories: () => void = () => {};
    let unsubLetters: () => void = () => {};
    let unsubChatMessages: () => void = () => {};
    let unsubPresence: () => void = () => {};
    let unsubCoupleQuestions: () => void = () => {};
    let unsubActivityLogs: () => void = () => {};

    if (!isLoggedIn) {
      return;
    }

    const timer = setTimeout(() => {
      setUserAccountsFetched(false); // every (re)subscribe starts from the cache again
      unsubUserAccounts = subscribeToUserAccounts((data, fromServer) => {
        setUserAccounts(data);
        if (fromServer) setUserAccountsFetched(true);
      });

      unsubAdminSettings = subscribeToAdminSettings((data) => {
        setAdminSettings(data);
      });

      unsubCoupleTenants = subscribeToCoupleTenants((data) => {
        if (data && data.length > 0) {
          const currentClean = (currentUser || localStorage.getItem("love_app_username") || "").toLowerCase().trim();
          const accounts = storage.getUserAccounts();
          const userDoc = accounts.find((u) => u.username?.toLowerCase().trim() === currentClean);
          const userCoupleId = userDoc?.coupleId || "couple_default";

          const tenant = data.find((t) => t.coupleId === userCoupleId) || data.find((t) => t.coupleId === "couple_default") || data[0];
          if (tenant) {
            setCoupleTenant(tenant);
          }
        }
      });

      seedIfEmpty()
        .catch((err) => {
          console.warn("Firestore seeding bypassed or operating offline:", err);
        })
        .finally(() => {
          unsubMilestones = subscribeToMilestones((data) => {
            const list = Array.isArray(data) ? data : [];
            setMilestones(list);
            storage.setMilestones(list);
          });

          unsubDatePlans = subscribeToDatePlans((data) => {
            const list = Array.isArray(data) ? data : [];
            setDatePlans(list);
            storage.setDatePlans(list);
          });

          unsubMemories = subscribeToMemories((data) => {
            const list = Array.isArray(data) ? data : [];
            setMemories(list);
            storage.setMemories(list);
          });

          unsubLetters = subscribeToLetters((data) => {
            const list = Array.isArray(data) ? data : [];
            setLetters(list);
            storage.setLetters(list);
          });

          unsubChatMessages = subscribeToChatMessages((data) => {
            const list = Array.isArray(data) ? data : [];
            setChatMessages(list);
            storage.setChatMessages(list);
          });

          unsubPresence = subscribeToPresence((data) => {
            setUserPresences(data);
          });

          unsubCoupleQuestions = subscribeToCoupleQuestions((data) => {
            setCoupleQuestions(data);
            storage.setCoupleQuestions(data);
          });

          unsubActivityLogs = subscribeToFirestoreActivityLogs((data) => {
            setActivityLogs(Array.isArray(data) ? data : []);
          });
        });
    }, 50);

    return () => {
      clearTimeout(timer);
      unsubUserAccounts();
      unsubAdminSettings();
      unsubCoupleTenants();
      unsubMilestones();
      unsubDatePlans();
      unsubMemories();
      unsubLetters();
      unsubChatMessages();
      unsubPresence();
      unsubCoupleQuestions();
      unsubActivityLogs();
    };
  }, [isLoggedIn, currentUser]);

  // Heartbeat effect for tracking online status
  useEffect(() => {
    if (!isLoggedIn || !currentUser) return;

    // Send immediate heartbeat on login/mount
    updateUserPresenceDoc(currentUser, lastReadChatTime).catch((err) => console.error("Error setting presence:", err));

    // Update presence every 10 seconds
    const interval = setInterval(() => {
      updateUserPresenceDoc(currentUser, lastReadChatTime).catch((err) => console.error("Error setting presence:", err));
    }, 10000);

    return () => {
      clearInterval(interval);
    };
  }, [isLoggedIn, currentUser, lastReadChatTime]);

  // Inactivity auto-logout effect
  useEffect(() => {
    const securityDoc = adminSettings.find((s) => s.id === "securityConfig");
    const autoLogoutEnabled = securityDoc?.autoLogoutEnabled ?? false;
    const autoLogoutMinutes = securityDoc?.autoLogoutMinutes ?? 15;

    if (!isLoggedIn || !currentUser || !autoLogoutEnabled) return;

    let timeoutId: any;

    const performAutoLogout = () => {
      // Set the friendly notification reason
      setLogoutMessage(`You have been automatically logged out due to ${autoLogoutMinutes} minutes of inactivity for your privacy.`);

      // Perform regular logout
      handleLogout();

      // Log the auto-logout activity
      logActivity(currentUser, "auto_logout", `Logged out automatically due to ${autoLogoutMinutes} minutes of inactivity.`);

      // Send a system-wide web notification
      showWebNotification("Auto-Logged Out 🔒", {
        body: `Your session was terminated after ${autoLogoutMinutes} minutes of inactivity.`,
      });
    };

    const resetTimer = () => {
      if (timeoutId) clearTimeout(timeoutId);
      const delayMs = autoLogoutMinutes * 60 * 1000;
      timeoutId = setTimeout(performAutoLogout, delayMs);
    };

    // User activity events to listen to
    const events = ["mousedown", "mousemove", "keypress", "scroll", "touchstart", "click"];

    // Initialize timer
    resetTimer();

    // Register event listeners
    events.forEach((event) => {
      window.addEventListener(event, resetTimer);
    });

    // Cleanup
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      events.forEach((event) => {
        window.removeEventListener(event, resetTimer);
      });
    };
  }, [isLoggedIn, currentUser, adminSettings]);

  // Manage last read chat timestamp for notification/glow state and unread markers
  useEffect(() => {
    if (isChatOpen || activeTab === "chat") {
      if (sessionLastReadTime === null) {
        setSessionLastReadTime(lastReadChatTime);
      }
      const now = Date.now();
      setLastReadChatTime(now);
      localStorage.setItem("love_last_read_chat_time", now.toString());
      if (currentUser) {
        updateUserPresenceDoc(currentUser, now).catch((err) => console.error("Error setting presence with read time:", err));
      }
    } else {
      setSessionLastReadTime(null);
    }
  }, [isChatOpen, activeTab, chatMessages.length, currentUser]);

  // Background migration for legacy chat messages
  useEffect(() => {
    if (!isLoggedIn || chatMessages.length === 0) return;

    const legacyMsgs = chatMessages.filter((msg) => !msg.conversationId || !msg.receiver);
    if (legacyMsgs.length === 0) return;

    const adminCreds = adminSettings.find((s) => s.id === "credentials");
    const adminName = (adminCreds?.username || (import.meta as any).env.VITE_APP_USERNAME || "home").toLowerCase().trim();
    const firstRegularUser = (userAccounts[0]?.username || "").toLowerCase().trim();

    const getInferredReceiverAndConvId = (msg: ChatMessage) => {
      const sender = msg.sender.toLowerCase().trim();
      let receiver = (msg.receiver || "").toLowerCase().trim();

      if (!receiver) {
        if (sender === adminName && firstRegularUser) receiver = firstRegularUser;
        else if (sender === firstRegularUser && adminName) receiver = adminName;
      }

      if (receiver) {
        const conversationId = [sender, receiver].sort().join("_");
        return { receiver, conversationId };
      }
      return null;
    };

    // Process up to 5 legacy messages per tick to prevent firestore write rate limits
    const batch = legacyMsgs.slice(0, 5);
    batch.forEach((msg) => {
      const info = getInferredReceiverAndConvId(msg);
      if (info) {
        const updated: ChatMessage = {
          ...msg,
          receiver: msg.receiver || info.receiver,
          conversationId: msg.conversationId || info.conversationId,
        };
        console.log(`[Migration] Migrating legacy message ${msg.id}: receiver=${updated.receiver}, conversationId=${updated.conversationId}`);
        saveChatMessageDoc(updated).catch((err) => {
          console.error(`[Migration] Failed to migrate message ${msg.id}:`, err);
        });
      }
    });
  }, [chatMessages, isLoggedIn, adminSettings, userAccounts]);

  const handleLoginSuccess = async (username: string) => {
    setLogoutMessage(null);
    setIsLoggedIn(true);
    setCurrentUser(username);
    const token = await createSessionToken(username);
    localStorage.setItem("love_app_session_token", token);
    localStorage.setItem("love_app_is_logged_in", "true");
    localStorage.setItem("love_app_username", username);
    logActivity(username, "login", "Logged into the website successfully.");
  };

  const handleLogout = () => {
    const userBeforeLogout = currentUser;
    supabase?.auth.signOut().catch(() => {});
    localStorage.removeItem("love_server_session_token");
    void endFirebaseSession();
    setIsLoggedIn(false);
    setCurrentUser("");
    localStorage.removeItem("love_app_is_logged_in");
    localStorage.removeItem("love_app_session_token");
    localStorage.removeItem("love_app_username");
    if (userBeforeLogout) {
      logActivity(userBeforeLogout, "logout", "Logged out of the website.");
    }
  };

  // Save changes to Firestore
  const handleUpdateMilestone = (updated: Milestone) => {
    const existing = milestones.find((m) => m.id === updated.id);

    // If restoring an archived milestone, enforce total and category quotas
    if (existing?.archived && !updated.archived) {
      const activeQuotas = adminSettings.find((s) => s.id === "milestoneQuotas")?.milestoneQuotas || DEFAULT_MILESTONE_QUOTAS;
      const nonArchived = activeMilestones.filter((m) => !m.archived && m.id !== updated.id);

      // Total quota check
      if (activeQuotas.maxTotalMilestones !== undefined && activeQuotas.maxTotalMilestones !== -1) {
        if (nonArchived.length >= activeQuotas.maxTotalMilestones) {
          setSubscriptionNotice({
            lockedTabLabel: "Milestones Capacity",
            quotaReason: `Cannot unarchive milestone: Total milestone capacity quota of ${activeQuotas.maxTotalMilestones} has been reached. Please adjust your quota in Admin Settings or delete an existing milestone.`,
          });
          setIsSubscriptionModalOpen(true);
          return;
        }
      }

      // Category quota check
      const cat = updated.category;
      if (cat === "anniversary" || cat === "engagement") {
        if (activeQuotas.maxAnniversaries !== undefined && activeQuotas.maxAnniversaries !== -1) {
          const catCount = nonArchived.filter((m) => m.category === "anniversary" || m.category === "engagement").length;
          if (catCount >= activeQuotas.maxAnniversaries) {
            setSubscriptionNotice({
              lockedTabLabel: "Anniversary Capacity",
              quotaReason: `Cannot unarchive milestone: Anniversaries & Engagements capacity quota of ${activeQuotas.maxAnniversaries} has been reached.`,
            });
            setIsSubscriptionModalOpen(true);
            return;
          }
        }
      } else if (cat === "birthday") {
        if (activeQuotas.maxBirthdays !== undefined && activeQuotas.maxBirthdays !== -1) {
          const catCount = nonArchived.filter((m) => m.category === "birthday").length;
          if (catCount >= activeQuotas.maxBirthdays) {
            setSubscriptionNotice({
              lockedTabLabel: "Birthday Capacity",
              quotaReason: `Cannot unarchive milestone: Birthdays capacity quota of ${activeQuotas.maxBirthdays} has been reached.`,
            });
            setIsSubscriptionModalOpen(true);
            return;
          }
        }
      } else {
        if (activeQuotas.maxOtherMilestones !== undefined && activeQuotas.maxOtherMilestones !== -1) {
          const catCount = nonArchived.filter((m) => !["anniversary", "engagement", "birthday"].includes(m.category)).length;
          if (catCount >= activeQuotas.maxOtherMilestones) {
            setSubscriptionNotice({
              lockedTabLabel: "Other Events Capacity",
              quotaReason: `Cannot unarchive milestone: Other events capacity quota of ${activeQuotas.maxOtherMilestones} has been reached.`,
            });
            setIsSubscriptionModalOpen(true);
            return;
          }
        }
      }
    }

    const createdBy = existing?.createdBy || updated.createdBy || currentUser;
    const coupleId = existing?.coupleId || updated.coupleId || currentCoupleId;
    saveMilestoneDoc({ ...updated, createdBy, coupleId }).catch((err) => console.error("Error saving milestone:", err));
    if (currentUser) {
      logActivity(currentUser, "milestone_updated", `Updated milestone "${updated.title}"`);
    }
  };

  const handleAddMilestone = (newMilestone: Milestone) => {
    // 1. Subscription Plan Level Check
    const maxMilestones = activeSubscriptionPlan?.tabLimits?.milestones?.maxLimit ?? -1;
    if (maxMilestones !== -1 && activeMilestones.length >= maxMilestones) {
      setSubscriptionNotice({
        lockedTabLabel: "Milestones",
        quotaReason: `You've reached the maximum limit of ${maxMilestones} milestones on the ${activeSubscriptionPlan?.name || "Current Plan"}. Upgrade your plan for unlimited milestones!`,
      });
      setIsSubscriptionModalOpen(true);
      return;
    }

    // 2. Platform SaaS Milestone Count Capacity Quotas (configured via Admin Panel)
    const activeQuotas = adminSettings.find((s) => s.id === "milestoneQuotas")?.milestoneQuotas || DEFAULT_MILESTONE_QUOTAS;
    const nonArchivedMilestones = activeMilestones.filter((m) => !m.archived);

    // 2a. Total Milestone Capacity Quota Check
    if (activeQuotas.maxTotalMilestones !== undefined && activeQuotas.maxTotalMilestones !== -1) {
      if (nonArchivedMilestones.length >= activeQuotas.maxTotalMilestones) {
        setSubscriptionNotice({
          lockedTabLabel: "Milestones Capacity",
          quotaReason: `Total milestone capacity quota reached (${activeQuotas.maxTotalMilestones} milestones max). Please archive or remove existing milestones, or increase capacity in Admin Settings.`,
        });
        setIsSubscriptionModalOpen(true);
        return;
      }
    }

    // 2b. Category-Specific Capacity Quotas Check
    const category = newMilestone.category;
    if (category === "anniversary" || category === "engagement") {
      if (activeQuotas.maxAnniversaries !== undefined && activeQuotas.maxAnniversaries !== -1) {
        const count = nonArchivedMilestones.filter((m) => m.category === "anniversary" || m.category === "engagement").length;
        if (count >= activeQuotas.maxAnniversaries) {
          setSubscriptionNotice({
            lockedTabLabel: "Anniversaries Capacity",
            quotaReason: `Anniversaries & Engagements capacity quota reached (${activeQuotas.maxAnniversaries} max allowed). You cannot add more anniversary cards without archiving existing ones.`,
          });
          setIsSubscriptionModalOpen(true);
          return;
        }
      }
    } else if (category === "birthday") {
      if (activeQuotas.maxBirthdays !== undefined && activeQuotas.maxBirthdays !== -1) {
        const count = nonArchivedMilestones.filter((m) => m.category === "birthday").length;
        if (count >= activeQuotas.maxBirthdays) {
          setSubscriptionNotice({
            lockedTabLabel: "Birthdays Capacity",
            quotaReason: `Birthdays capacity quota reached (${activeQuotas.maxBirthdays} max allowed). You cannot add more birthday cards without archiving existing ones.`,
          });
          setIsSubscriptionModalOpen(true);
          return;
        }
      }
    } else {
      // 'other', 'custom', or others
      if (activeQuotas.maxOtherMilestones !== undefined && activeQuotas.maxOtherMilestones !== -1) {
        const count = nonArchivedMilestones.filter((m) => !["anniversary", "engagement", "birthday"].includes(m.category)).length;
        if (count >= activeQuotas.maxOtherMilestones) {
          setSubscriptionNotice({
            lockedTabLabel: "Other Events Capacity",
            quotaReason: `Other special events capacity quota reached (${activeQuotas.maxOtherMilestones} max allowed). You cannot add more custom/other cards without archiving existing ones.`,
          });
          setIsSubscriptionModalOpen(true);
          return;
        }
      }
    }

    saveMilestoneDoc({ ...newMilestone, createdBy: currentUser, coupleId: currentCoupleId }).catch((err) => console.error("Error adding milestone:", err));
    if (currentUser) {
      logActivity(currentUser, "milestone_created", `Added a new milestone "${newMilestone.title}"`);
    }
  };

  const handleDeleteMilestone = (id: string) => {
    const item = milestones.find((m) => m.id === id);
    deleteMilestoneDoc(id).catch((err) => console.error("Error deleting milestone:", err));
    if (selectedMilestoneCategory === id) {
      setSelectedMilestoneCategory(null);
    }
    if (currentUser && item) {
      logActivity(currentUser, "milestone_deleted", `Deleted milestone "${item.title}"`);
    }
  };

  const handleAddDatePlan = (newPlan: DatePlan) => {
    const maxPlanner = activeSubscriptionPlan?.tabLimits?.planner?.maxLimit ?? -1;
    if (maxPlanner !== -1 && activeDatePlans.length >= maxPlanner) {
      setSubscriptionNotice({
        lockedTabLabel: "Date Planner",
        quotaReason: `You've reached the maximum limit of ${maxPlanner} date plans on the ${activeSubscriptionPlan?.name || "Current Plan"}. Upgrade your plan for unlimited date plans!`,
      });
      setIsSubscriptionModalOpen(true);
      return;
    }
    saveDatePlanDoc({ ...newPlan, createdBy: currentUser, coupleId: currentCoupleId }).catch((err) => console.error("Error adding date plan:", err));
    if (currentUser) {
      logActivity(currentUser, "date_plan_created", `Created date plan "${newPlan.title}"`);
    }
  };

  const handleUpdateDatePlan = (updated: DatePlan) => {
    const existing = datePlans.find((p) => p.id === updated.id);
    const createdBy = existing?.createdBy || updated.createdBy || currentUser;
    const coupleId = existing?.coupleId || updated.coupleId || currentCoupleId;
    saveDatePlanDoc({ ...updated, createdBy, coupleId }).catch((err) => console.error("Error updating date plan:", err));
    if (currentUser) {
      logActivity(currentUser, "date_plan_updated", `Updated date plan "${updated.title}" details/status`);
    }
  };

  const handleDeleteDatePlan = (id: string) => {
    const item = datePlans.find((p) => p.id === id);
    deleteDatePlanDoc(id).catch((err) => console.error("Error deleting date plan:", err));
    if (currentUser && item) {
      logActivity(currentUser, "date_plan_deleted", `Deleted date plan "${item.title}"`);
    }
  };

  const handleAddMemory = (newMemory: Memory) => {
    const maxAlbum = activeSubscriptionPlan?.tabLimits?.album?.maxLimit ?? -1;
    if (maxAlbum !== -1 && activeMemories.length >= maxAlbum) {
      setSubscriptionNotice({
        lockedTabLabel: "Love Scrapbook",
        quotaReason: `You've reached the maximum limit of ${maxAlbum} memories on the ${activeSubscriptionPlan?.name || "Current Plan"}. Upgrade your plan for unlimited photo and video storage!`,
      });
      setIsSubscriptionModalOpen(true);
      return;
    }
    saveMemoryDoc({ ...newMemory, createdBy: currentUser, coupleId: currentCoupleId }).catch((err) => console.error("Error adding memory:", err));
    if (currentUser) {
      logActivity(currentUser, "memory_created", `Added new scrapbook memory: "${newMemory.title}"`);
    }
  };

  const handleDeleteMemory = (id: string) => {
    const item = memories.find((m) => m.id === id);
    deleteMemoryDoc(id).catch((err) => console.error("Error deleting memory:", err));
    if (currentUser && item) {
      logActivity(currentUser, "memory_deleted", `Deleted scrapbook memory "${item.title}"`);
    }
  };

  const handleUpdateMemory = (updated: Memory) => {
    const existing = memories.find((m) => m.id === updated.id);
    const createdBy = existing?.createdBy || updated.createdBy || currentUser;
    const coupleId = existing?.coupleId || updated.coupleId || currentCoupleId;
    saveMemoryDoc({ ...updated, createdBy, coupleId }).catch((err) => console.error("Error updating memory:", err));
    if (currentUser) {
      logActivity(currentUser, "memory_updated", `Updated memory details: "${updated.title}"`);
    }
  };

  const handleAddLetter = (newLetter: LoveLetter) => {
    const maxLetters = activeSubscriptionPlan?.tabLimits?.letters?.maxLimit ?? -1;
    if (maxLetters !== -1 && activeLetters.length >= maxLetters) {
      setSubscriptionNotice({
        lockedTabLabel: "Love Letters",
        quotaReason: `You've reached the maximum limit of ${maxLetters} love letters on the ${activeSubscriptionPlan?.name || "Current Plan"}. Upgrade your plan for unlimited love letters!`,
      });
      setIsSubscriptionModalOpen(true);
      return;
    }
    saveLetterDoc({ ...newLetter, createdBy: currentUser, sender: newLetter.sender || currentUser, coupleId: currentCoupleId }).catch((err) => console.error("Error adding letter:", err));
    if (currentUser) {
      logActivity(currentUser, "letter_sent", `Sent love letter: "${newLetter.subject}"`);
      sendTelegramAlert(formatLoveLetterTelegramMessage(currentUser, newLetter.subject), "letter", {
        coupleId: currentCoupleId,
        excludeUsername: currentUser,
        adminSettings,
        userAccounts,
      }).catch(() => {});
    }
  };

  const handleUpdateLetter = (updated: LoveLetter) => {
    const existing = letters.find((l) => l.id === updated.id);
    const createdBy = existing?.createdBy || updated.createdBy || currentUser;
    const coupleId = existing?.coupleId || updated.coupleId || currentCoupleId;
    saveLetterDoc({ ...updated, createdBy, coupleId }).catch((err) => console.error("Error updating letter:", err));
    if (currentUser) {
      logActivity(currentUser, "letter_updated", `Updated love letter details: "${updated.subject}"`);
    }
  };

  const handleDeleteLetter = (id: string) => {
    const item = letters.find((l) => l.id === id);
    deleteLetterDoc(id).catch((err) => console.error("Error deleting letter:", err));
    if (currentUser && item) {
      logActivity(currentUser, "letter_deleted", `Deleted love letter: "${item.subject}"`);
    }
  };

  // Couple questions handlers
  const handleSaveCoupleQuestion = async (question: CoupleQuestion) => {
    const isNew = !coupleQuestions.some((q) => q.id === question.id);
    const questionWithTenant = {
      ...question,
      createdBy: question.createdBy || currentUser,
      coupleId: question.coupleId || currentCoupleId,
    };
    const updated = isNew ? [questionWithTenant, ...coupleQuestions] : coupleQuestions.map((q) => (q.id === question.id ? questionWithTenant : q));
    setCoupleQuestions(updated);
    storage.setCoupleQuestions(updated);
    await saveCoupleQuestionDoc(questionWithTenant);
    if (currentUser) {
      logActivity(currentUser, "question_updated", `${isNew ? "Added" : "Answered/Updated"} couple question: "${question.text}"`);
    }
  };

  const handleDeleteCoupleQuestion = async (id: string) => {
    const item = coupleQuestions.find((q) => q.id === id);
    const updated = coupleQuestions.filter((q) => q.id !== id);
    setCoupleQuestions(updated);
    storage.setCoupleQuestions(updated);
    await deleteCoupleQuestionDoc(id);
    if (currentUser && item) {
      logActivity(currentUser, "question_deleted", `Deleted couple question: "${item.text}"`);
    }
  };

  // Chat message handlers
  const handleSendChatMessage = async (content: string, replyTo?: ChatMessage, audioUrl?: string, audioDuration?: number, imageUrl?: string, imageFile?: File, receiver?: string) => {
    const msgId = "chat-" + Date.now() + "-" + Math.random().toString(36).substr(2, 9);

    // Private messages are bound to permanent account ids: mine from the signed-in session, the recipient's resolved by the server.
    const senderId = getFirebaseScope()?.pid || "";
    if (!senderId) { alert("Please sign out and sign in again to use chat."); return; }
    const isDirectSend = !!receiver && receiver !== "global" && !receiver.startsWith("group_");
    let receiverId: string | undefined;
    if (isDirectSend) {
      const resolved = await resolveParticipantPid(receiver!);
      if (!resolved) { alert("Could not verify the recipient's account, so the message was not sent."); return; }
      receiverId = resolved;
    }

    let initialImageUrl = imageUrl;
    if (imageFile) {
      try {
        const localUrl = URL.createObjectURL(imageFile);
        initialImageUrl = `uploading_blob:${localUrl}`;
      } catch (e) {
        console.warn("Failed to create object URL:", e);
      }
    }

    const conversationId = receiver === "global" ? "global" : receiver && receiver.startsWith("group_") ? receiver : receiver ? [currentUser.toLowerCase().trim(), receiver.toLowerCase().trim()].sort().join("_") : undefined;

    const newMsg: ChatMessage = {
      id: msgId,
      sender: currentUser,
      ...(isDirectSend ? { senderId, receiverId } : { authorId: senderId }),
      receiver,
      conversationId,
      content,
      timestamp: new Date().toISOString(),
      coupleId: currentCoupleId,
      replyTo: replyTo
        ? {
            id: replyTo.id,
            sender: replyTo.sender,
            content: replyTo.content,
          }
        : undefined,
      audioUrl,
      audioDuration,
      imageUrl: initialImageUrl,
      seen: false,
    };

    // 1. Save the message immediately to Firestore
    saveChatMessageDoc(newMsg).catch((err) => console.error("Error sending chat message:", err));
    if (currentUser) {
      logActivity(currentUser, "chat_sent", content ? `Sent chat message: "${content.substring(0, 60)}${content.length > 60 ? "..." : ""}"` : "Sent a chat attachment");
    }

    // 2. Dispatch Telegram Bot Alert directly on message send so partner receives it even if their browser is closed
    const chatPreviewText = content?.trim() || (imageFile ? "Shared a photo 📸" : audioUrl ? "Sent a voice message 🎙️" : "Sent an attachment");

    sendTelegramAlert(formatChatMessageTelegramMessage(currentUser, chatPreviewText), "chat", {
      coupleId: currentCoupleId,
      excludeUsername: currentUser,
      targetUsername: receiver && receiver !== "global" && !receiver.startsWith("group_") ? receiver : undefined,
      adminSettings,
      userAccounts,
    }).catch(() => {});

    // 3. If there is an image file, upload in background and update Firestore
    if (imageFile) {
      uploadChatImage(imageFile)
        .then((realUrl) => {
          const updatedMsg: ChatMessage = {
            ...newMsg,
            imageUrl: realUrl,
          };
          return saveChatMessageDoc(updatedMsg);
        })
        .catch((err) => {
          console.error("Background image upload failed:", err);
        });
    }
  };

  const handleDeleteChatMessage = (id: string) => {
    const item = chatMessages.find((m) => m.id === id);
    deleteChatMessageDoc(id).catch((err) => console.error("Error deleting chat message:", err));
    if (currentUser && item) {
      logActivity(currentUser, "chat_deleted", `Deleted a chat message: "${item.content ? item.content.substring(0, 60) : "attachment"}"`);
    }
  };

  const handleReactToChatMessage = (id: string, reaction: string) => {
    const msg = chatMessages.find((m) => m.id === id);
    if (msg) {
      const updated = { ...msg, reaction };
      saveChatMessageDoc(updated).catch((err) => console.error("Error reacting to chat message:", err));
      if (currentUser) {
        logActivity(currentUser, "chat_reacted", `Reacted with ${reaction} to a chat message.`);
      }
    }
  };

  const handleTogglePinChatMessage = (id: string) => {
    const msg = chatMessages.find((m) => m.id === id);
    if (msg) {
      const updated = {
        ...msg,
        pinned: !msg.pinned,
        pinnedAt: !msg.pinned ? new Date().toISOString() : undefined,
        pinnedBy: !msg.pinned ? currentUser : undefined,
      };
      saveChatMessageDoc(updated).catch((err) => console.error("Error pinning/unpinning chat message:", err));
    }
  };

  // Compute days together
  const getDaysTogether = () => {
    const list = activeMilestones.filter((m) => m.category === "anniversary" || m.category === "engagement");
    const active = list.find((m) => m.id === selectedAnniversaryId) || list[0] || activeMilestones.find((m) => m.category === "anniversary");
    if (!active) return 0;
    return getDaysTogetherInEgypt(active.date);
  };

  // Active milestone for Our Infinite Love Story banner & dashboard countdown
  const getActiveStoryMilestone = (): (Milestone & { isCustom?: boolean }) | null => {
    const isCustom = countdownConfig?.mode === "custom" && !!countdownConfig.customDate;
    if (isCustom) {
      return {
        id: "custom_countdown",
        title: countdownConfig.customTitle || "Our Special Day",
        date: countdownConfig.customDate!,
        category: (countdownConfig.customCategory || "anniversary") as MilestoneCategory,
        description: countdownConfig.customCelebrationMessage || "",
        sweetMessage: countdownConfig.customCelebrationMessage || "",
        photos: [],
        themeColor: "rose",
        isCustom: true,
      };
    }
    const allowed = countdownConfig?.allowedCategories && countdownConfig.allowedCategories.length > 0 ? countdownConfig.allowedCategories : ["anniversary", "engagement", "birthday", "other"];
    const list = activeMilestones.filter((m) => !m.archived && allowed.includes(m.category));
    let active = list.find((m) => m.id === selectedAnniversaryId);
    if (!active && countdownConfig?.featuredMilestoneId) {
      active = list.find((m) => m.id === countdownConfig.featuredMilestoneId);
    }
    if (!active) {
      active = list[0] || activeMilestones[0];
    }
    return active || null;
  };

  const getNextDatePlan = () => {
    return activeDatePlans.filter((p) => p.status === "planned").sort((a, b) => parseEventDateInEgypt(a.dateTime).getTime() - parseEventDateInEgypt(b.dateTime).getTime())[0];
  };

  const getUnopenedLettersCount = () => {
    return activeLetters.filter((l) => !l.isOpened).length;
  };

  const handleDashboardMilestoneClick = (idOrCategory: string) => {
    setSelectedMilestoneCategory(idOrCategory);
    setActiveTab("milestones");
  };

  const countdownDoc = adminSettings.find((s) => s.id === "countdownConfig");
  const countdownConfig: CountdownConfig = countdownDoc?.countdownConfig || DEFAULT_COUNTDOWN_CONFIG;
  const milestoneQuotasDoc = adminSettings.find((s) => s.id === "milestoneQuotas");
  const milestoneQuotas: MilestoneQuotas = milestoneQuotasDoc?.milestoneQuotas || DEFAULT_MILESTONE_QUOTAS;

  const handleCycleAnniversary = (direction: number) => {
    const allowedCategories = countdownConfig?.allowedCategories && countdownConfig.allowedCategories.length > 0 ? countdownConfig.allowedCategories : ["anniversary", "engagement", "birthday", "other"];
    const list = activeMilestones.filter((m) => !m.archived && allowedCategories.includes(m.category));
    if (list.length === 0) return;

    const currentId = selectedAnniversaryId || list[0].id;
    const currentIndex = list.findIndex((m) => m.id === currentId);

    let nextIndex = currentIndex + direction;
    if (nextIndex < 0) {
      nextIndex = list.length - 1;
    } else if (nextIndex >= list.length) {
      nextIndex = 0;
    }

    setSelectedAnniversaryId(list[nextIndex].id);
  };

  if (!isLoggedIn) {
    return <Login onLoginSuccess={handleLoginSuccess} userAccounts={userAccounts} adminSettings={adminSettings} logoutMessage={logoutMessage} />;
  }

  // Intercept and render AdminPanel if user matches any admin username from database
  const adminAccountsDoc = adminSettings.find((s) => s.id === "adminAccounts");
  const adminAccounts = adminAccountsDoc?.adminAccounts || [];
  const adminCreds = adminSettings.find((s) => s.id === "credentials");
  const currentCleanUser = (currentUser || "").toLowerCase().trim();

  const isAdmin = adminAccounts.some((a) => a.username.toLowerCase().trim() === currentCleanUser) || (adminCreds?.username && adminCreds.username.toLowerCase().trim() === currentCleanUser);
  if (isAdmin) {
    return (
      <ErrorBoundary fallbackTitle="Admin Panel Error">
        <Suspense
          fallback={
            <div className="min-h-screen bg-neutral-950 flex items-center justify-center text-white">
              <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 border-2 border-rose-500 border-t-transparent rounded-full animate-spin" />
                <p className="text-xs text-neutral-400 font-sans">Loading Administrator Space...</p>
              </div>
            </div>
          }
        >
          <AdminPanel userAccounts={userAccounts} accountsLoaded={userAccountsFetched} adminSettings={adminSettings} onLogout={handleLogout} />
        </Suspense>
      </ErrorBoundary>
    );
  }

  return (
    <div className="h-screen bg-neutral-950 text-white relative flex flex-col overflow-hidden selection:bg-rose-950 selection:text-rose-100 font-sans">
      {/* ATMOSPHERIC BACKGROUND BUBBLES */}
      <div className="absolute top-[-100px] left-[-100px] w-[500px] h-[500px] bg-rose-900/15 rounded-full blur-[120px] pointer-events-none z-0"></div>
      <div className="absolute bottom-[-50px] right-[-50px] w-[400px] h-[400px] bg-purple-900/10 rounded-full blur-[100px] pointer-events-none z-0"></div>
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] bg-rose-500/5 rounded-full blur-[150px] pointer-events-none z-0"></div>

      {/* HEART PARTICLES BACKDROP */}
      <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
        <HeartCanvas active={true} />
      </div>

      <div className="relative z-10 flex-1 flex flex-col h-full overflow-hidden">
        {/* PREMIUM ROMANTIC HEADER - FIXED STICKY NAVIGATION */}
        <header className="border-b border-white/10 bg-neutral-950/95 backdrop-blur-2xl sticky top-0 z-50 px-3 py-2 sm:py-2.5 sm:px-6 w-full transition-all shadow-xl shrink-0">
          <div className="max-w-7xl mx-auto flex flex-col gap-2 w-full">
            {/* Top Row: Logo, Active Space Selector Pill, Menu Launcher & Action Controls */}
            <div className="flex items-center justify-between gap-1 sm:gap-4 w-full min-h-[42px]">
              {/* Left: Logo & Couple Name Space */}
              <div
                onClick={() => {
                  setActiveTab("dashboard");
                  setIsMobileMenuOpen(false);
                }}
                className="flex items-center gap-1.5 sm:gap-2.5 cursor-pointer group select-none shrink-0"
              >
                <div className="p-1.5 sm:p-2 bg-gradient-to-tr from-rose-600 via-pink-600 to-rose-500 rounded-xl sm:rounded-2xl text-white shadow-lg shadow-rose-950/50 group-hover:scale-105 group-hover:rotate-3 transition-all duration-300 ring-1 ring-rose-400/30">
                  <Heart className="w-3.5 h-3.5 sm:w-5 sm:h-5 fill-white animate-pulse" />
                </div>
                <div className="flex flex-col justify-center">
                  <span className="font-serif text-xs sm:text-lg md:text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-white via-rose-100 to-rose-200 tracking-tight leading-tight">Our Home</span>
                  <span className="text-[9px] font-sans uppercase tracking-widest text-rose-400/70 font-semibold hidden sm:inline max-w-[120px] md:max-w-[180px] truncate">{coupleTenant.coupleName || "Love Story Space"}</span>
                </div>
              </div>

              {/* Center: Active Space Capsule & Spaces Menu Trigger */}
              <div className="flex items-center gap-1 shrink-0">
                {/* Active Space Pill Button (Icon + Chevron on mobile, full label on sm+) */}
                {(() => {
                  const currentTabObj = getVisibleTabs().find((t) => t.id === activeTab) || getVisibleTabs()[0];
                  const IconComp = currentTabObj?.icon || Heart;
                  const totalUnreadAll = Object.values(tabUnreadCounts).reduce((a, b) => a + b, 0);

                  return (
                    <button
                      onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                      className={`px-2 sm:px-3 py-1.5 rounded-xl sm:rounded-2xl text-[10px] sm:text-xs font-bold uppercase tracking-wider inline-flex items-center gap-1 sm:gap-2 transition-all cursor-pointer shadow-md select-none active:scale-95 border ${isMobileMenuOpen ? "bg-gradient-to-r from-rose-600 via-pink-600 to-rose-500 text-white border-rose-400/40 ring-2 ring-rose-500/30" : "bg-neutral-900/90 text-white hover:bg-neutral-800 border-white/15 shadow-rose-950/30"}`}
                      title="Click to Open Spaces Navigation Menu"
                    >
                      <div className="p-0.5 sm:p-1 rounded-lg bg-rose-500/20 text-rose-300 shrink-0">
                        <IconComp className="w-3.5 h-3.5" />
                      </div>
                      <span className="hidden sm:inline truncate max-w-[140px] font-extrabold text-xs">{currentTabObj?.label || "Spaces"}</span>
                      <ChevronDown className={`w-3.5 h-3.5 text-rose-300 transition-transform duration-300 shrink-0 ${isMobileMenuOpen ? "rotate-180" : ""}`} />

                      {totalUnreadAll > 0 && !isMobileMenuOpen && (
                        <span className="flex h-2 w-2 relative ml-0.5 shrink-0">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
                        </span>
                      )}
                    </button>
                  );
                })()}

                {/* Main Spaces Menu Drawer Trigger Button (Visible on sm+ viewports) */}
                <button
                  type="button"
                  onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                  className={`hidden sm:inline-flex px-2.5 sm:px-3 py-1.5 rounded-2xl text-[11px] sm:text-xs font-bold uppercase tracking-wider items-center gap-1.5 transition-all border active:scale-95 cursor-pointer relative shadow-md ${
                    isMobileMenuOpen ? "bg-gradient-to-r from-rose-600 to-pink-600 text-white border-rose-400/30 shadow-md shadow-rose-950/50" : hasUnreadMessages ? "bg-rose-950/70 text-rose-300 border-rose-500/50 shadow-[0_0_12px_rgba(244,63,94,0.5)] animate-pulse" : "bg-white/5 text-neutral-200 border-white/10 hover:bg-white/10"
                  }`}
                  title="Toggle Navigation Menu"
                >
                  <Grid className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                  <span>{isMobileMenuOpen ? "Close" : "Spaces Menu"}</span>
                  {hasUnreadMessages && !isMobileMenuOpen && (
                    <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500 border border-neutral-950"></span>
                    </span>
                  )}
                </button>
              </div>

              {/* Right: Header Action Controls (Icons only on mobile view, text added on sm+) */}
              <div className="flex items-center gap-1 sm:gap-2 shrink-0">
                {/* Subscription Plan Button */}
                <button
                  onClick={() => setIsSubscriptionModalOpen(true)}
                  className={`p-2 sm:px-2.5 sm:py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider inline-flex items-center gap-1.5 transition-all cursor-pointer shadow-sm active:scale-95 hover:scale-105 border shrink-0 ${activeSubscriptionPlan?.id && activeSubscriptionPlan.id !== "free" ? "bg-gradient-to-r from-amber-500/20 via-amber-500/30 to-rose-600/30 text-amber-300 border-amber-500/40" : "bg-white/5 text-neutral-200 border-white/10 hover:bg-white/10"}`}
                  title="Manage Subscription Plan"
                >
                  <Crown className="w-3.5 h-3.5 text-amber-300 fill-amber-300 shrink-0" />
                  <span className="hidden sm:inline">{activeSubscriptionPlan?.name || "Free Plan"}</span>
                </button>

                {/* Profile & Account Settings Button */}
                <button onClick={() => setIsProfileModalOpen(true)} className="p-1.5 sm:px-2.5 sm:py-1.5 rounded-xl text-xs font-semibold tracking-wider inline-flex items-center gap-1.5 transition-all cursor-pointer bg-gradient-to-r from-purple-900/40 via-rose-950/50 to-pink-950/40 text-rose-200 hover:text-white border border-rose-500/30 hover:border-rose-400/60 shadow-sm active:scale-95 hover:scale-[1.02] shrink-0" title="My Account Profile & Settings">
                  <div className="w-5 h-5 rounded-full bg-rose-500/20 border border-rose-400/40 flex items-center justify-center text-[10px] shrink-0">{currentUserAccount?.gender === "male" ? "👨" : currentUserAccount?.gender === "female" ? "👩" : "🧑"}</div>
                  <span className="hidden sm:inline capitalize font-bold text-white max-w-[100px] truncate text-xs">{currentUser}</span>
                </button>

                {/* Real-time Notifications Bell Button */}
                <button onClick={() => setIsNotificationsModalOpen(true)} className="p-2 sm:px-2.5 sm:py-1.5 rounded-xl text-xs font-semibold tracking-wider inline-flex items-center gap-1.5 transition-all cursor-pointer bg-gradient-to-r from-rose-950/50 via-purple-950/40 to-neutral-900 text-rose-200 hover:text-white border border-rose-500/30 hover:border-rose-400/60 shadow-sm active:scale-95 hover:scale-[1.02] relative shrink-0" title="Real-time Notifications">
                  <Bell className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                  <span className="hidden md:inline font-bold text-xs">Notifications</span>
                  {unreadNotificationsCount > 0 && <span className="absolute -top-1 -right-1 px-1 min-w-[15px] h-[15px] flex items-center justify-center rounded-full text-[9px] font-bold font-mono bg-rose-500 text-white shadow-sm shadow-rose-950/50 animate-pulse">{unreadNotificationsCount > 9 ? "9+" : unreadNotificationsCount}</span>}
                </button>

                {/* Logout / Lock Button */}
                <button onClick={handleLogout} className="p-2 sm:px-2.5 sm:py-1.5 rounded-xl text-xs font-semibold uppercase tracking-wider inline-flex items-center gap-1.5 transition-all cursor-pointer text-rose-400 hover:text-rose-300 hover:bg-rose-950/30 border border-rose-500/20 hover:border-rose-500/40 shadow-sm active:scale-95 shrink-0" title="Lock Space / Log Out">
                  <Lock className="w-3.5 h-3.5 shrink-0" />
                  <span className="hidden md:inline text-xs">Lock</span>
                </button>
              </div>
            </div>

            {/* Expanded Glassmorphic Spaces Launcher Drawer Sheet */}
            <AnimatePresence>
              {isMobileMenuOpen && (
                <motion.div initial={{ opacity: 0, height: 0, marginTop: 0 }} animate={{ opacity: 1, height: "auto", marginTop: 6 }} exit={{ opacity: 0, height: 0, marginTop: 0 }} transition={{ duration: 0.25, ease: "easeInOut" }} className="w-full overflow-hidden border-t border-white/10 pt-3 pb-2">
                  <div className="flex items-center justify-between mb-2.5 px-1">
                    <p className="text-[11px] uppercase font-bold tracking-widest text-rose-400 flex items-center gap-1.5 font-sans">
                      <Sparkles className="w-3.5 h-3.5 text-rose-400 animate-spin" />
                      <span>Explore Our Couple Spaces</span>
                    </p>
                    <span className="text-[10px] text-neutral-300 uppercase font-semibold bg-white/10 px-2.5 py-0.5 rounded-full border border-white/10">{getVisibleTabs().length} Active Spaces</span>
                  </div>

                  {/* Glassmorphic Grid Cards for easily tapping any space */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 p-3 bg-neutral-900/95 backdrop-blur-3xl rounded-3xl border border-white/10 shadow-2xl">
                    {getVisibleTabs().map((tab, idx) => {
                      const IconComp = tab.icon;
                      const isActive = activeTab === tab.id;
                      const unreadCount = tabUnreadCounts[tab.id] || 0;

                      const spaceDescriptions: Record<string, string> = {
                        dashboard: "Love Countdown, Daily Quotes & Relationship Stats",
                        choose: "Fun Romantic Decision Spinner & Wheel",
                        milestones: "Special Days, Anniversaries & Timeline",
                        planner: "Outings, Trips & Wishlist Activities",
                        album: "Photo Memories, Captions & Shared Moments",
                        gallery: "Dedicated Couple Photo Vault & Wallpapers",
                        music: "Romantic Jukebox, MP3 Uploads & Soundtracks",
                        letters: "Heartfelt Notes & Sealed Time Capsules",
                        chat: "Real-Time Private Messaging & Voice Notes",
                        questions: "Daily Bonding Prompts & Deep Reflections",
                        animation: "Heart Canvas & Romantic Effects",
                      };

                      return (
                        <button
                          key={`nav-space-tab-${tab.id}-${idx}`}
                          onClick={() => {
                            setIsMobileMenuOpen(false);
                            handleTabSelect(tab.id);
                          }}
                          className={`flex flex-col text-left p-3.5 rounded-2xl transition-all duration-300 cursor-pointer relative group active:scale-95 ${
                            isActive ? "bg-gradient-to-br from-rose-600 via-pink-600 to-rose-500 text-white shadow-xl shadow-rose-950/80 border border-rose-400/50 ring-2 ring-rose-400/30 scale-[1.02]" : unreadCount > 0 ? "bg-rose-950/40 text-rose-100 hover:text-white border border-rose-500/40 shadow-md hover:bg-rose-900/50" : "bg-neutral-950/80 text-neutral-300 hover:text-white hover:bg-white/10 border border-white/10 shadow-sm"
                          }`}
                        >
                          <div className="flex items-center justify-between w-full mb-2">
                            <div className={`p-2.5 rounded-2xl transition-all duration-300 group-hover:scale-110 ${isActive ? "bg-white/20 text-white shadow-inner" : "bg-white/5 text-rose-400 group-hover:bg-rose-500/20 group-hover:text-rose-300"}`}>
                              <IconComp className="w-5 h-5" />
                            </div>

                            {/* Active Badge / Unread Count */}
                            {isActive ? <span className="text-[9px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-white text-rose-600 shadow-sm">Active</span> : unreadCount > 0 ? <span className="min-w-[18px] h-4 px-1 rounded-full text-[9px] font-mono font-bold bg-rose-500 text-white shadow-md shadow-rose-950/80 flex items-center justify-center animate-pulse">{unreadCount > 9 ? "9+" : unreadCount}</span> : null}
                          </div>

                          <span className="text-xs font-extrabold tracking-tight font-sans mb-1 text-white group-hover:text-rose-200">{tab.label}</span>

                          <p className={`text-[10px] leading-snug line-clamp-2 ${isActive ? "text-rose-100/90" : "text-neutral-400 group-hover:text-neutral-300"}`}>{spaceDescriptions[tab.id] || "Interactive Couple Space"}</p>
                        </button>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </header>

        {/* MAIN DISPLAY AREA & FOOTER UNIFIED SCROLL CONTAINER */}
        <div className="flex-1 overflow-y-auto h-[calc(100dvh-58px)] sm:h-[calc(100vh-64px)] flex flex-col justify-between">
          <main className="flex-1 max-w-6xl w-full mx-auto p-3 sm:p-6 pb-24 sm:pb-6">
            <ErrorBoundary fallbackTitle="Could Not Load Workspace">
              <Suspense fallback={<ViewLoadingFallback />}>
                {/* UPCOMING MILESTONE BANNER ALERT */}
                <AnimatePresence>
                  {activeMilestones
                    .filter((m) => {
                      const days = getDaysUntilMilestone(m.date);
                      return days >= 0 && days <= 3 && !dismissedAlerts.includes(m.id);
                    })
                    .map((m, idx) => {
                      const days = getDaysUntilMilestone(m.date);
                      const daysText = days === 0 ? "is TODAY! 🎉 Happy Celebration!" : days === 1 ? "is TOMORROW! 💖" : `is in ${days} days! 💕`;

                      return (
                        <motion.div key={`alert-banner-${m.id}-${idx}`} initial={{ opacity: 0, scale: 0.95, y: -10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: -10 }} className="mb-6 bg-gradient-to-r from-rose-950/40 to-neutral-900/60 border border-rose-500/30 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xl shadow-rose-950/15 backdrop-blur-md relative overflow-hidden text-white">
                          <div className="absolute top-0 right-0 w-24 h-24 bg-rose-500/5 rounded-full blur-2xl pointer-events-none" />

                          <div className="flex items-center gap-3">
                            <div className="p-2.5 bg-rose-500/15 rounded-xl border border-rose-500/30 text-rose-400 shrink-0">
                              <Bell className="w-5 h-5 animate-bounce" />
                            </div>
                            <div>
                              <h4 className="text-sm font-semibold text-white flex items-center gap-1.5 font-sans">
                                Upcoming Milestone Reminder! <Sparkles className="w-3.5 h-3.5 text-rose-300 animate-pulse" />
                              </h4>
                              <p className="text-xs text-neutral-300 mt-0.5">
                                Your special chapter <span className="font-semibold text-rose-300">"{m.title}"</span> {daysText}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                            <button onClick={() => handleDashboardMilestoneClick(m.id)} className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-semibold transition-all shadow-md shadow-rose-950/20 cursor-pointer">
                              Open Card
                            </button>
                            <button onClick={() => setDismissedAlerts((prev) => [...prev, m.id])} className="p-1.5 hover:bg-white/10 rounded-lg text-neutral-400 hover:text-white transition-colors cursor-pointer" title="Dismiss Alert">
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        </motion.div>
                      );
                    })}
                </AnimatePresence>

                {/* UPCOMING DATE PLAN BANNER ALERT */}
                <AnimatePresence>
                  {activeDatePlans
                    .filter((p) => {
                      if (p.status !== "planned") return false;
                      const hours = getHoursUntilDatePlanInEgypt(p.dateTime);
                      return hours > 0 && hours <= 96 && !dismissedAlerts.includes(p.id);
                    })
                    .map((p, idx) => {
                      const hours = getHoursUntilDatePlanInEgypt(p.dateTime);
                      const days = Math.floor(hours / 24);
                      const remainingHours = Math.round(hours % 24);

                      let timeLeftText = "";
                      if (days > 0) {
                        timeLeftText = `in ${days} days and ${remainingHours} hours! 💖`;
                      } else {
                        timeLeftText = `in ${remainingHours} hours! 💖`;
                      }

                      return (
                        <motion.div key={`alert-banner-date-plan-${p.id}-${idx}`} initial={{ opacity: 0, scale: 0.95, y: -10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: -10 }} className="mb-6 bg-gradient-to-r from-purple-950/40 to-neutral-900/60 border border-purple-500/30 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xl shadow-purple-950/15 backdrop-blur-md relative overflow-hidden text-white">
                          <div className="absolute top-0 right-0 w-24 h-24 bg-purple-500/5 rounded-full blur-2xl pointer-events-none" />

                          <div className="flex items-center gap-3">
                            <div className="p-2.5 bg-purple-500/15 rounded-xl border border-purple-500/30 text-purple-400 shrink-0">
                              <Calendar className="w-5 h-5 animate-bounce" />
                            </div>
                            <div>
                              <h4 className="text-sm font-semibold text-white flex items-center gap-1.5 font-sans">
                                Upcoming Date Plan Reminder! <Sparkles className="w-3.5 h-3.5 text-purple-300 animate-pulse" />
                              </h4>
                              <p className="text-xs text-neutral-300 mt-0.5">
                                Our scheduled date <span className="font-semibold text-purple-300">"{p.title}"</span> is starting {timeLeftText}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                            <button onClick={() => handleTabSelect("planner")} className="px-3.5 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-semibold transition-all shadow-md shadow-purple-950/20 cursor-pointer">
                              Check Checklist
                            </button>
                            <button onClick={() => setDismissedAlerts((prev) => [...prev, p.id])} className="p-1.5 hover:bg-white/10 rounded-lg text-neutral-400 hover:text-white transition-colors cursor-pointer" title="Dismiss Alert">
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        </motion.div>
                      );
                    })}
                </AnimatePresence>

                <AnimatePresence mode="wait">
                  {activeTab === "dashboard" && (
                    /* DASHBOARD SCREEN */
                    <motion.div key="dashboard-tab" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -15 }} className="space-y-8">
                      {/* Banner & Days Counter and Anniversary Countdown - only rendered when milestones exist */}
                      {activeMilestones && activeMilestones.length > 0 && (
                        <>
                          <div className="bg-gradient-to-r from-rose-950/40 via-purple-950/35 to-neutral-900/60 rounded-3xl p-6 sm:p-8 text-white relative overflow-hidden border border-white/10 shadow-xl shadow-rose-950/10">
                            <div className="absolute top-0 right-0 w-64 h-64 bg-rose-500/5 rounded-full blur-3xl -mr-16 -mt-16" />

                            <div className="relative z-10 flex flex-col lg:flex-row justify-between items-stretch lg:items-center gap-6 sm:gap-8">
                              <div className="space-y-3 text-center lg:text-left flex-1">
                                <div className="flex flex-wrap items-center gap-2 justify-center lg:justify-start">
                                  <span className="text-xs uppercase font-bold tracking-widest bg-white/10 border border-white/10 px-3 py-1 rounded-full backdrop-blur-sm inline-block">Our Infinite Love Story</span>
                                  {(() => {
                                    const active = getActiveStoryMilestone();
                                    if (!active) return null;
                                    const formattedDate = formatMilestoneDateInEgypt(active.date);
                                    return (
                                      <span className="text-[11px] font-sans font-medium bg-rose-500/20 text-rose-300 border border-rose-500/30 px-2.5 py-0.5 rounded-full backdrop-blur-sm inline-flex items-center gap-1.5 shadow-sm">
                                        <Sparkles className="w-3 h-3 text-rose-300 animate-pulse" />
                                        <span className="font-bold">{active.title}</span>
                                        <span className="text-rose-400/60">•</span>
                                        <span className="font-mono text-[10px] text-neutral-300">{formattedDate}</span>
                                      </span>
                                    );
                                  })()}
                                </div>

                                <h1 className="font-serif text-3xl md:text-4xl lg:text-5xl font-medium tracking-tight mt-1 leading-tight">
                                  {(() => {
                                    const active = getActiveStoryMilestone();
                                    if (!active) {
                                      return (
                                        <>
                                          Holding hands for <span className="font-extrabold underline decoration-rose-500">{getDaysTogether()} Days</span> and counting!
                                        </>
                                      );
                                    }

                                    const activeDateObj = parseEventDateInEgypt(active.date);
                                    const nowComp = getEgyptCalendarComponents(new Date());
                                    const eventComp = getEgyptCalendarComponents(activeDateObj);
                                    const todayUtc = Date.UTC(nowComp.year, nowComp.month, nowComp.day);
                                    const eventUtc = Date.UTC(eventComp.year, eventComp.month, eventComp.day);
                                    const diffDays = Math.floor((todayUtc - eventUtc) / (1000 * 60 * 60 * 24));

                                    if (diffDays > 0) {
                                      const label = active.category === "engagement" ? "Engaged for" : active.category === "birthday" ? "Celebrating" : active.category === "other" ? "Cherishing" : "Holding hands for";
                                      return (
                                        <>
                                          {label} <span className="font-extrabold underline decoration-rose-500">{diffDays} Days</span> and counting!
                                        </>
                                      );
                                    } else if (diffDays === 0) {
                                      return (
                                        <>
                                          Today is our special day! <span className="font-extrabold underline decoration-rose-500">{active.title}</span> is here!
                                        </>
                                      );
                                    } else {
                                      const daysUntil = Math.abs(diffDays);
                                      return (
                                        <>
                                          Counting down:{" "}
                                          <span className="font-extrabold underline decoration-rose-500">
                                            {daysUntil} {daysUntil === 1 ? "Day" : "Days"}
                                          </span>{" "}
                                          until {active.title}!
                                        </>
                                      );
                                    }
                                  })()}
                                </h1>

                                {/* Auto-updated dynamic caption mentioning the specific milestone and date */}
                                <div className="text-xs sm:text-sm text-neutral-300 font-light max-w-3xl space-y-1.5">
                                  {(() => {
                                    const active = getActiveStoryMilestone();
                                    if (!active) {
                                      return <p>Every single moment with you is etched forever in my soul. Click anywhere on the screen to trigger romantic heart bursts for my love!</p>;
                                    }

                                    const formattedDate = formatMilestoneDateInEgypt(active.date);
                                    const activeDateObj = parseEventDateInEgypt(active.date);
                                    const nowComp = getEgyptCalendarComponents(new Date());
                                    const eventComp = getEgyptCalendarComponents(activeDateObj);
                                    const todayUtc = Date.UTC(nowComp.year, nowComp.month, nowComp.day);
                                    const eventUtc = Date.UTC(eventComp.year, eventComp.month, eventComp.day);
                                    const diffDays = Math.floor((todayUtc - eventUtc) / (1000 * 60 * 60 * 24));

                                    const categoryLabel = active.category === "anniversary" ? "Anniversary" : active.category === "birthday" ? "Birthday" : active.category === "engagement" ? "Engagement" : "Special Milestone";

                                    const categoryEmoji = active.category === "anniversary" ? "💍" : active.category === "birthday" ? "🎂" : active.category === "engagement" ? "💎" : "✨";

                                    return (
                                      <>
                                        <p className="text-white/95 font-normal leading-relaxed">
                                          {diffDays > 0 ? (
                                            <>
                                              Commemorating our {categoryLabel} <span className="font-serif font-bold text-rose-300">"{active.title}"</span> {categoryEmoji} celebrated on <span className="font-medium text-white underline decoration-rose-500/50 font-mono text-xs sm:text-sm">{formattedDate}</span> —{" "}
                                              <span className="font-bold text-rose-400">
                                                {diffDays} cherished {diffDays === 1 ? "day" : "days"}
                                              </span>{" "}
                                              together.
                                            </>
                                          ) : diffDays === 0 ? (
                                            <>
                                              Today is our magical milestone! Celebrating our {categoryLabel} <span className="font-serif font-bold text-rose-300">"{active.title}"</span> {categoryEmoji} (<span className="font-medium text-white font-mono text-xs sm:text-sm">{formattedDate}</span>). Every single moment with you is etched forever in our story.
                                            </>
                                          ) : (
                                            <>
                                              Counting down to our {categoryLabel} <span className="font-serif font-bold text-rose-300">"{active.title}"</span> {categoryEmoji} set for <span className="font-medium text-white underline decoration-rose-500/50 font-mono text-xs sm:text-sm">{formattedDate}</span> — only{" "}
                                              <span className="font-bold text-amber-300">
                                                {Math.abs(diffDays)} {Math.abs(diffDays) === 1 ? "day" : "days"} remaining
                                              </span>
                                              !
                                            </>
                                          )}
                                        </p>

                                        {active.sweetMessage && <p className="text-rose-200/90 italic text-xs pl-3 border-l-2 border-rose-500/60 font-serif">"{active.sweetMessage}"</p>}

                                        <p className="text-neutral-400 text-[11px] sm:text-xs">Every single moment with you is etched forever in my soul. Click anywhere on the screen to trigger romantic heart bursts for my love!</p>
                                      </>
                                    );
                                  })()}
                                </div>
                              </div>

                              {/* Integrated Anniversary Info block */}
                              <div className="bg-white/5 backdrop-blur-md rounded-2xl p-5 border border-white/10 text-center lg:text-left min-w-[280px] shadow-lg flex flex-col justify-center items-center lg:items-start shrink-0 relative overflow-hidden">
                                {/* Subtly animated glow behind card */}
                                <div className="absolute -top-10 -right-10 w-24 h-24 bg-rose-500/20 rounded-full blur-xl pointer-events-none" />

                                <div className="flex items-center justify-between w-full mb-2 relative z-10 gap-2">
                                  <div className="flex items-center gap-1.5">
                                    <MessageSquareHeart className="w-4.5 h-4.5 text-rose-400 animate-pulse" />
                                    <span className="text-[10px] uppercase font-bold tracking-widest text-rose-300 font-sans">
                                      {(() => {
                                        const isCustom = countdownConfig?.mode === "custom" && !!countdownConfig.customDate;
                                        if (isCustom) {
                                          const cat = countdownConfig.customCategory;
                                          return cat === "birthday" ? "Birthday Date" : cat === "engagement" ? "Engagement Date" : cat === "other" ? "Milestone Date" : "Anniversary Date";
                                        }
                                        const allowed = countdownConfig?.allowedCategories || ["anniversary", "engagement", "birthday", "other"];
                                        const list = activeMilestones.filter((m) => !m.archived && allowed.includes(m.category));
                                        let active = list.find((m) => m.id === selectedAnniversaryId);
                                        if (!active && countdownConfig?.featuredMilestoneId) {
                                          active = list.find((m) => m.id === countdownConfig.featuredMilestoneId);
                                        }
                                        if (!active) active = list[0] || activeMilestones[0];
                                        if (active?.category === "birthday") return "Birthday Date";
                                        if (active?.category === "engagement") return "Engagement Date";
                                        if (active?.category === "other") return "Milestone Date";
                                        return "Anniversary Date";
                                      })()}
                                    </span>
                                  </div>
                                  {/* Interactive Switch Buttons */}
                                  {(() => {
                                    const isCustom = countdownConfig?.mode === "custom" && !!countdownConfig.customDate;
                                    if (isCustom) return null;
                                    const allowed = countdownConfig?.allowedCategories || ["anniversary", "engagement", "birthday", "other"];
                                    const list = activeMilestones.filter((m) => !m.archived && allowed.includes(m.category));
                                    if (list.length <= 1) return null;
                                    const active = list.find((m) => m.id === selectedAnniversaryId) || list[0];
                                    const activeIndex = list.findIndex((m) => m.id === active.id);
                                    return (
                                      <div className="flex items-center gap-1 bg-white/5 p-1 rounded-lg border border-white/10 shrink-0">
                                        <button onClick={() => handleCycleAnniversary(-1)} className="p-1 hover:bg-white/10 rounded text-neutral-300 hover:text-white transition-colors cursor-pointer" title="Previous Milestone">
                                          <ChevronLeft className="w-3 h-3" />
                                        </button>
                                        <span className="text-[8.5px] font-bold text-neutral-300 px-0.5 font-mono">
                                          {activeIndex + 1}/{list.length}
                                        </span>
                                        <button onClick={() => handleCycleAnniversary(1)} className="p-1 hover:bg-white/10 rounded text-neutral-300 hover:text-white transition-colors cursor-pointer" title="Next Milestone">
                                          <ChevronRight className="w-3 h-3" />
                                        </button>
                                      </div>
                                    );
                                  })()}
                                </div>

                                <span className="font-serif text-xl sm:text-2xl font-bold text-white relative z-10">
                                  {(() => {
                                    const isCustom = countdownConfig?.mode === "custom" && !!countdownConfig.customDate;
                                    if (isCustom) {
                                      return formatMilestoneDateInEgypt(countdownConfig.customDate);
                                    }
                                    const allowed = countdownConfig?.allowedCategories || ["anniversary", "engagement", "birthday", "other"];
                                    const list = activeMilestones.filter((m) => !m.archived && allowed.includes(m.category));
                                    let active = list.find((m) => m.id === selectedAnniversaryId);
                                    if (!active && countdownConfig?.featuredMilestoneId) {
                                      active = list.find((m) => m.id === countdownConfig.featuredMilestoneId);
                                    }
                                    if (!active) active = list[0] || activeMilestones[0];
                                    return active?.date ? formatMilestoneDateInEgypt(active.date) : "January 31, 2025";
                                  })()}
                                </span>

                                <div className="flex items-center justify-center lg:justify-start gap-1.5 text-[10.5px] text-neutral-300 font-sans mt-3.5 pt-3 border-t border-white/10 w-full relative z-10 font-sans">
                                  <Sparkles className="w-3.5 h-3.5 text-rose-300 animate-pulse shrink-0" />
                                  <span className="font-medium text-neutral-400">Next Milestone:</span>
                                  <span className="font-serif font-bold text-rose-300 truncate max-w-[130px]">
                                    {(() => {
                                      const isCustom = countdownConfig?.mode === "custom" && !!countdownConfig.customDate;
                                      if (isCustom) {
                                        return countdownConfig.customTitle || "Our Special Day";
                                      }
                                      const allowed = countdownConfig?.allowedCategories || ["anniversary", "engagement", "birthday", "other"];
                                      const list = activeMilestones.filter((m) => !m.archived && allowed.includes(m.category));
                                      let active = list.find((m) => m.id === selectedAnniversaryId);
                                      if (!active && countdownConfig?.featuredMilestoneId) {
                                        active = list.find((m) => m.id === countdownConfig.featuredMilestoneId);
                                      }
                                      if (!active) active = list[0] || activeMilestones[0];
                                      return active?.title || "Our Promise Day";
                                    })()}{" "}
                                    ❤️
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Anniversary Countdown Widget */}
                          <AnniversaryCountdown milestones={activeMilestones} selectedAnniversaryId={selectedAnniversaryId} onCycleAnniversary={handleCycleAnniversary} countdownConfig={countdownConfig} />
                        </>
                      )}

                      {/* Daily Love Quote */}
                      <DailyLoveQuote />

                      {/* Notifications & Alert Cards */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Next scheduled date card */}
                        {getNextDatePlan() ? (
                          <div className="bg-white/5 backdrop-blur-md rounded-2xl border border-white/10 p-6 shadow-md shadow-black/20 flex flex-col justify-between">
                            <div>
                              <div className="flex justify-between items-center mb-4">
                                <span className="text-xs uppercase font-bold text-rose-400 font-sans tracking-wider">Next Planned Date</span>
                                <Calendar className="w-4 h-4 text-rose-400" />
                              </div>
                              <h3 className="font-serif text-xl font-semibold text-white mb-1">{getNextDatePlan().title}</h3>
                              <p className="text-xs text-neutral-400 font-sans truncate mb-4">Meeting at: {getNextDatePlan().location}</p>
                            </div>

                            <button onClick={() => handleTabSelect("planner")} className="inline-flex items-center gap-1.5 text-rose-300 hover:text-rose-100 font-semibold text-xs transition-colors group cursor-pointer">
                              Open Planner to check checklist
                              <ChevronRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="bg-white/5 backdrop-blur-md rounded-2xl border border-white/10 p-6 shadow-md shadow-black/20 flex flex-col justify-between">
                            <div>
                              <div className="flex justify-between items-center mb-4">
                                <span className="text-xs uppercase font-bold text-rose-400 font-sans tracking-wider">Date Planner Status</span>
                                <Calendar className="w-4 h-4 text-rose-400" />
                              </div>
                              <h3 className="font-serif text-lg font-semibold text-white mb-1">No dates scheduled currently</h3>
                              <p className="text-xs text-neutral-400 font-sans mb-4">Let's browse date ideas or schedule an adventure together!</p>
                            </div>

                            <button onClick={() => handleTabSelect("planner")} className="inline-flex items-center gap-1.5 text-rose-300 hover:text-rose-100 font-semibold text-xs transition-colors group cursor-pointer">
                              Schedule a Date Now
                              <ChevronRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
                            </button>
                          </div>
                        )}

                        {/* Mailbox notification card */}
                        <div className="bg-white/5 backdrop-blur-md rounded-2xl border border-white/10 p-6 shadow-md shadow-black/20 flex flex-col justify-between">
                          <div>
                            <div className="flex justify-between items-center mb-4">
                              <span className="text-xs uppercase font-bold text-rose-400 font-sans tracking-wider">Love Mailbox Status</span>
                              <Mail className="w-4 h-4 text-rose-400" />
                            </div>
                            <h3 className="font-serif text-lg font-semibold text-white mb-1">{getUnopenedLettersCount() > 0 ? `You have ${getUnopenedLettersCount()} sealed letter(s)` : "No unread letters"}</h3>
                            <p className="text-xs text-neutral-400 font-sans mb-4">{getUnopenedLettersCount() > 0 ? "Click below to unfold digital envelopes and read sweet romantic letters!" : "Write a quick romantic letter and seal it inside the letter box."}</p>
                          </div>

                          <button onClick={() => handleTabSelect("letters")} className="inline-flex items-center gap-1.5 text-rose-300 hover:text-rose-100 font-semibold text-xs transition-colors group cursor-pointer">
                            {getUnopenedLettersCount() > 0 ? "Open Envelopes" : "Write a Letter"}
                            <ChevronRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
                          </button>
                        </div>
                      </div>

                      {/* Categories cards selection shortcuts */}
                      <div>
                        <h2 className="font-serif text-2xl text-white font-medium tracking-tight mb-4">Our Chapter Cards</h2>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          {activeMilestones
                            .filter((m) => !m.archived)
                            .map((m, idx) => {
                              let tagColor = "from-rose-500 to-pink-600";
                              if (m.category === "engagement") tagColor = "from-amber-500 to-rose-600";
                              if (m.category === "birthday") tagColor = "from-pink-500 to-purple-600";
                              if (m.category === "other") tagColor = "from-emerald-500 to-teal-600";

                              return (
                                <button id={`dash-milestone-shortcut-${m.id}`} key={`dash-milestone-${m.id}-${idx}`} onClick={() => handleDashboardMilestoneClick(m.id)} className="bg-white/5 backdrop-blur-md rounded-2xl p-4 text-left border border-white/10 hover:bg-white/10 hover:border-white/20 transition-all group flex flex-col justify-between h-36 relative overflow-hidden cursor-pointer">
                                  <div className={`w-1.5 h-full absolute left-0 top-0 bg-gradient-to-b ${tagColor}`} />

                                  <div className="flex justify-between items-start pl-2">
                                    <span className="text-[10px] uppercase font-bold text-neutral-400 tracking-wider">{m.category}</span>
                                    <span className="text-xs text-rose-400 font-medium">→</span>
                                  </div>

                                  <div className="pl-2">
                                    <h3 className="font-serif text-sm font-semibold text-rose-100 leading-tight mb-1 group-hover:text-rose-300 transition-colors">{m.title}</h3>
                                    <p className="text-[10px] text-neutral-400 font-sans line-clamp-1">{m.description}</p>
                                  </div>
                                </button>
                              );
                            })}
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {activeTab === "milestones" && (
                    /* MILESTONES WORKSPACE */
                    <motion.div key="milestones-tab" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -15 }}>
                      <MilestoneCard milestones={activeMilestones} onUpdateMilestone={handleUpdateMilestone} onAddMilestone={handleAddMilestone} onDeleteMilestone={handleDeleteMilestone} selectedCategoryId={selectedMilestoneCategory} onSelectCategory={setSelectedMilestoneCategory} milestoneQuotas={milestoneQuotas} />
                    </motion.div>
                  )}

                  {activeTab === "planner" && (
                    /* DATING PLANNER */
                    <motion.div key="planner-tab" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -15 }}>
                      <DatePlanner datePlans={activeDatePlans} onAddDatePlan={handleAddDatePlan} onUpdateDatePlan={handleUpdateDatePlan} onDeleteDatePlan={handleDeleteDatePlan} currentUser={currentUser} milestones={activeMilestones} activeSubTab={plannerSubTab} onSubTabChange={setPlannerSubTab} userPlan={coupleTenant.plan} onOpenUpgradeModal={() => setIsSubscriptionModalOpen(true)} />
                    </motion.div>
                  )}

                  {activeTab === "album" && (
                    /* LOVE SCRAPBOOK ALBUM */
                    <motion.div key="album-tab" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -15 }}>
                      <MemoryVault memories={activeMemories} milestones={activeMilestones} chatMessages={activeChatMessages} onAddMemory={handleAddMemory} onDeleteMemory={handleDeleteMemory} onUpdateMemory={handleUpdateMemory} userPlan={coupleTenant.plan} onOpenUpgradeModal={() => setIsSubscriptionModalOpen(true)} />
                    </motion.div>
                  )}

                  {activeTab === "gallery" && (
                    /* UNIFIED MEDIA GALLERY TAB */
                    <motion.div key="gallery-tab" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -15 }}>
                      <Gallery milestones={activeMilestones} memories={activeMemories} chatMessages={activeChatMessages} onNavigateTab={handleTabSelect} onAddMemory={handleAddMemory} onDeleteMemory={handleDeleteMemory} onUpdateMilestone={handleUpdateMilestone} onDeleteChatMessage={handleDeleteChatMessage} currentUser={currentUser} coupleTenant={coupleTenant} />
                    </motion.div>
                  )}

                  {activeTab === "letters" && (
                    /* DIGITAL ENVELOPES & LETTER BOX */
                    <motion.div key="letters-tab" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -15 }}>
                      <LoveLetterBox letters={activeLetters} onAddLetter={handleAddLetter} onUpdateLetter={handleUpdateLetter} onDeleteLetter={handleDeleteLetter} currentUser={currentUser} />
                    </motion.div>
                  )}

                  {activeTab === "questions" && (
                    /* INTERACTIVE COUPLE QUESTIONS TAB */
                    <motion.div key="questions-tab" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -15 }}>
                      <Questions questions={activeCoupleQuestions} onSaveQuestion={handleSaveCoupleQuestion} onDeleteQuestion={handleDeleteCoupleQuestion} currentUser={currentUser} />
                    </motion.div>
                  )}

                  {activeTab === "choose" && (
                    /* CHOOSE YOUR MOMENT CARD */
                    <motion.div key="choose-tab" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -15 }}>
                      <ChooseMoment
                        milestones={activeMilestones}
                        memories={activeMemories}
                        chatMessages={activeChatMessages}
                        coupleTenant={coupleTenant}
                        currentUser={currentUser}
                        adminSettings={adminSettings}
                        userAccounts={userAccounts}
                        onNavigateTab={handleTabSelect}
                        onAddMemory={handleAddMemory}
                        onLogActivity={(action, details) => {
                          if (currentUser) {
                            logActivity(currentUser, action, details);
                          }
                        }}
                      />
                    </motion.div>
                  )}

                  {activeTab === "animation" && (
                    /* ROMANTIC LOVE POPUP ANIMATION CARD */
                    <motion.div key="animation-tab" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -15 }}>
                      <LoveAnimation coupleTenant={coupleTenant} onUpdateSongLink={handleUpdateAnimationSong} />
                    </motion.div>
                  )}

                  {activeTab === "music" && (
                    /* ROMANTIC MUSIC LOUNGE & MP3 UPLOADER */
                    <motion.div key="music-tab" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -15 }}>
                      <MusicLounge
                        currentUser={currentUser}
                        userId={userAccounts.find((u) => u.username?.toLowerCase() === currentUser.toLowerCase())?.id || currentUser}
                        coupleTenant={coupleTenant}
                        onUpdateSongLink={handleUpdateAnimationSong}
                        onLogActivity={(action, details) => {
                          if (currentUser) {
                            logActivity(currentUser, action, details);
                          }
                        }}
                        onNavigateTab={handleTabSelect}
                      />
                    </motion.div>
                  )}

                  {activeTab === "chat" && (
                    /* FULL SCREEN ROMANTIC CHAT TAB */
                    <motion.div key="chat-tab" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -15 }} className="w-full h-[calc(100vh-130px)] min-h-[500px] max-h-[750px] bg-neutral-950/95 backdrop-blur-md rounded-2xl border border-white/15 shadow-2xl overflow-hidden flex flex-col">
                      <RomanticChat
                        currentUser={currentUser}
                        messages={activeChatMessages}
                        onSendMessage={handleSendChatMessage}
                        onDeleteMessage={handleDeleteChatMessage}
                        onReactToMessage={handleReactToChatMessage}
                        onTogglePinMessage={handleTogglePinChatMessage}
                        userPresences={userPresences}
                        lastReadChatTime={lastReadChatTime}
                        isFloating={false}
                        isSoundEnabled={isSoundEnabled}
                        onToggleSound={() => {
                          setIsSoundEnabled((prev) => {
                            const next = !prev;
                            localStorage.setItem("love_chat_sound_enabled", next ? "true" : "false");
                            return next;
                          });
                        }}
                        userAccounts={userAccounts}
                        adminSettings={adminSettings}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </Suspense>
            </ErrorBoundary>
          </main>

          {/* COMPREHENSIVE FOOTER */}
          <footer className="border-t border-white/10 bg-neutral-950/40 backdrop-blur-sm py-4 text-center text-xs text-neutral-500 font-sans z-30 relative pb-20 sm:pb-4">
            <p>© {new Date().getFullYear()} Our Home ❤️. All details made with love.</p>
            <p className="mt-1 flex items-center justify-center gap-1">
              Made with <Heart className="w-3.5 h-3.5 text-rose-500 fill-rose-500" /> for our forever love story.
            </p>
          </footer>
        </div>

        {/* STICKY MOBILE BOTTOM NAVIGATION BAR */}
        {isLoggedIn && (
          <div className="fixed bottom-0 left-0 right-0 z-40 bg-neutral-950/95 backdrop-blur-2xl border-t border-white/10 sm:hidden px-2 py-1.5 flex items-center justify-around shadow-2xl shadow-rose-950/50">
            <button
              onClick={() => {
                handleTabSelect("dashboard");
                setIsMobileMenuOpen(false);
              }}
              className={`flex flex-col items-center justify-center gap-0.5 px-2.5 py-1 rounded-xl transition-all cursor-pointer min-h-[44px] active:scale-95 ${activeTab === "dashboard" ? "text-rose-400 font-bold" : "text-neutral-400 hover:text-white"}`}
            >
              <Heart className={`w-5 h-5 ${activeTab === "dashboard" ? "fill-rose-500 text-rose-500 scale-110" : ""}`} />
              <span className="text-[10px] tracking-tight">Home</span>
            </button>

            <button
              onClick={() => {
                handleTabSelect("milestones");
                setIsMobileMenuOpen(false);
              }}
              className={`flex flex-col items-center justify-center gap-0.5 px-2.5 py-1 rounded-xl transition-all cursor-pointer min-h-[44px] active:scale-95 ${activeTab === "milestones" ? "text-pink-400 font-bold" : "text-neutral-400 hover:text-white"}`}
            >
              <Gift className={`w-5 h-5 ${activeTab === "milestones" ? "text-pink-400 scale-110" : ""}`} />
              <span className="text-[10px] tracking-tight">Story</span>
            </button>

            <button
              onClick={() => {
                handleTabSelect("album");
                setIsMobileMenuOpen(false);
              }}
              className={`flex flex-col items-center justify-center gap-0.5 px-2.5 py-1 rounded-xl transition-all cursor-pointer min-h-[44px] active:scale-95 ${activeTab === "album" ? "text-amber-400 font-bold" : "text-neutral-400 hover:text-white"}`}
            >
              <ImageIcon className={`w-5 h-5 ${activeTab === "album" ? "text-amber-400 scale-110" : ""}`} />
              <span className="text-[10px] tracking-tight">Scrapbook</span>
            </button>

            <button
              onClick={() => {
                handleTabSelect("gallery");
                setIsMobileMenuOpen(false);
              }}
              className={`flex flex-col items-center justify-center gap-0.5 px-2.5 py-1 rounded-xl transition-all cursor-pointer min-h-[44px] active:scale-95 ${activeTab === "gallery" ? "text-purple-400 font-bold" : "text-neutral-400 hover:text-white"}`}
            >
              <Images className={`w-5 h-5 ${activeTab === "gallery" ? "text-purple-400 scale-110" : ""}`} />
              <span className="text-[10px] tracking-tight">Gallery</span>
            </button>

            <button
              onClick={() => {
                handleTabSelect("chat");
                setIsMobileMenuOpen(false);
              }}
              className={`flex flex-col items-center justify-center gap-0.5 px-2.5 py-1 rounded-xl transition-all cursor-pointer min-h-[44px] relative active:scale-95 ${activeTab === "chat" ? "text-rose-400 font-bold" : "text-neutral-400 hover:text-white"}`}
            >
              <MessageSquareHeart className={`w-5 h-5 ${activeTab === "chat" ? "text-rose-400 scale-110" : ""}`} />
              <span className="text-[10px] tracking-tight">Chat</span>
              {hasUnreadMessages && activeTab !== "chat" && (
                <span className="absolute top-1 right-2 flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
                </span>
              )}
            </button>

            <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className={`flex flex-col items-center justify-center gap-0.5 px-2.5 py-1 rounded-xl transition-all cursor-pointer min-h-[44px] active:scale-95 ${isMobileMenuOpen ? "text-rose-400 font-bold" : "text-neutral-400 hover:text-white"}`}>
              <Grid className="w-5 h-5" />
              <span className="text-[10px] tracking-tight">{isMobileMenuOpen ? "Close" : "More"}</span>
            </button>
          </div>
        )}

        <Suspense fallback={null}>
          {/* Floating DM Chat Widget */}
          {isLoggedIn && activeTab !== "chat" && (
            <div className={isChatOpen ? "fixed top-[52px] bottom-[52px] left-0 right-0 sm:top-auto sm:bottom-6 sm:left-auto sm:right-6 z-40 flex flex-col sm:items-end w-full sm:w-auto h-[calc(100dvh-104px)] sm:h-auto max-w-none sm:max-w-[calc(100vw-2rem)]" : "fixed bottom-20 right-3.5 sm:bottom-6 sm:right-6 z-40 flex flex-col items-end gap-3 max-w-[calc(100vw-2rem)]"}>
              <AnimatePresence>
                {isChatOpen ? (
                  /* Expanded Floating DM Chat Window */
                  <motion.div initial={{ opacity: 0, scale: 0.95, y: 30 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 30 }} transition={{ type: "spring", damping: 25, stiffness: 350 }} className="w-full h-full sm:w-[410px] sm:h-[620px] bg-neutral-950/95 backdrop-blur-md rounded-none sm:rounded-2xl border-0 sm:border border-white/15 shadow-2xl overflow-hidden flex flex-col">
                    <RomanticChat
                      currentUser={currentUser}
                      messages={activeChatMessages}
                      onSendMessage={handleSendChatMessage}
                      onDeleteMessage={handleDeleteChatMessage}
                      onReactToMessage={handleReactToChatMessage}
                      onTogglePinMessage={handleTogglePinChatMessage}
                      userPresences={userPresences}
                      lastReadChatTime={sessionLastReadTime ?? undefined}
                      isFloating={true}
                      onCloseToggle={() => setIsChatOpen(false)}
                      isSoundEnabled={isSoundEnabled}
                      onToggleSound={() => {
                        setIsSoundEnabled((prev) => {
                          const next = !prev;
                          localStorage.setItem("love_chat_sound_enabled", next ? "true" : "false");
                          return next;
                        });
                      }}
                      userAccounts={userAccounts}
                      adminSettings={adminSettings}
                    />
                  </motion.div>
                ) : (
                  /* Docked / Closed Floating DM Badge (like social media DM) */
                  <motion.button
                    type="button"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    onClick={() => {
                      setIsChatOpen(true);
                      const now = Date.now();
                      setLastReadChatTime(now);
                      setSessionLastReadTime(now);
                      localStorage.setItem("love_last_read_chat_time", now.toString());
                    }}
                    className="flex items-center gap-2.5 px-4 py-3 bg-neutral-900 border border-white/10 hover:border-rose-500/40 text-white rounded-full shadow-lg hover:shadow-rose-500/10 cursor-pointer group transition-all duration-300"
                  >
                    <div className="relative">
                      <div className="p-1.5 bg-rose-500/15 border border-rose-500/30 rounded-full text-rose-500 group-hover:scale-110 transition-transform">
                        <Heart className="w-4 h-4 fill-rose-500 animate-pulse" />
                      </div>
                      {/* Active Presence Indicator */}
                      <span className="absolute -bottom-0.5 -right-0.5 flex h-2.5 w-2.5">
                        <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isPartnerOnline() ? "bg-emerald-400" : "bg-neutral-400"}`}></span>
                        <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${isPartnerOnline() ? "bg-emerald-500" : "bg-neutral-500"}`}></span>
                      </span>
                    </div>

                    <div className="flex flex-col items-start pr-1 text-left">
                      <span className="text-xs font-bold font-sans tracking-wide">Our Sweet Chat</span>
                      <span className="text-[10px] text-rose-300/60 font-mono">{isPartnerOnline() ? "Partner Active 💖" : "Click to DM 💬"}</span>
                    </div>

                    {hasUnreadMessages && <span className="flex h-5 w-5 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white shadow-md animate-bounce">{activeChatMessages.filter((msg) => msg.sender.toLowerCase().trim() !== currentUser.toLowerCase().trim() && new Date(msg.timestamp).getTime() > lastReadChatTime).length}</span>}
                  </motion.button>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* SaaS Subscription Modal */}
          <SubscriptionModal
            isOpen={isSubscriptionModalOpen}
            onClose={() => {
              setIsSubscriptionModalOpen(false);
              setSubscriptionNotice(null);
            }}
            currentPlan={coupleTenant.plan}
            memoriesCount={activeMemories.length}
            subscriptionPlans={subscriptionPlans}
            adminSettings={adminSettings}
            lockedTabLabel={subscriptionNotice?.lockedTabLabel}
            quotaReason={subscriptionNotice?.quotaReason}
            onUpgradeSuccess={(newTier) => {
              const updatedTenant: CoupleTenant = { ...coupleTenant, plan: newTier };
              setCoupleTenant(updatedTenant);
              saveCoupleTenantDoc(updatedTenant).catch((err) => console.error("Error saving upgraded plan:", err));
            }}
          />

          {/* User Profile & Settings Modal */}
          <UserProfileModal
            isOpen={isProfileModalOpen}
            onClose={() => setIsProfileModalOpen(false)}
            currentUsername={currentUser}
            userAccounts={userAccounts}
            coupleTenant={coupleTenant}
            allCoupleTenants={storage.getCoupleTenants()}
            adminSettings={adminSettings}
            onUserUpdated={() => {
              const accounts = storage.getUserAccounts();
              setUserAccounts(accounts);
            }}
          />

          {/* Notifications Center Modal */}
          <NotificationsModal
            isOpen={isNotificationsModalOpen}
            onClose={() => setIsNotificationsModalOpen(false)}
            currentUser={currentUser}
            coupleTenant={coupleTenant}
            chatMessages={chatMessages}
            letters={letters}
            datePlans={datePlans}
            milestones={milestones}
            coupleQuestions={coupleQuestions}
            userAccounts={userAccounts}
            activityLogs={activityLogs}
            onNavigateToTab={(tabId) => handleTabSelect(tabId)}
            readNotificationIds={readNotificationIds}
            clearedNotificationIds={clearedNotificationIds}
            onMarkAsRead={handleMarkNotificationAsRead}
            onMarkAllAsRead={handleMarkAllNotificationsAsRead}
            onClearAllNotifications={handleClearAllNotifications}
          />
        </Suspense>
      </div>
    </div>
  );
}
