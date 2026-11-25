import { bulkCopyAllowed, firestoreMirrorAllowed } from "./firebaseScope";
import { isCredentialSetting, redactCredentialRecord, saveCredentialSetting } from "./credentialSafety";
import { supabase, isSupabaseConfigured } from "./supabase";
import { uploadBase64Media, deleteMediaFile } from "./storageService";
import { Milestone, DatePlan, Memory, LoveLetter, CoupleQuestion, UserAccount, AdminSetting, AdminAccount, UserActivityLog, CoupleTenant, CelebrationCard } from "../types";
import { storage } from "../utils";
import { ownSpaceRowsFresh } from "./ownSpaceRows";
import {
  subscribeToFirestoreActivityLogs,
  saveActivityLogDoc,
  subscribeToFirestoreUserAccounts,
  saveFirestoreUserAccountDoc,
  deleteFirestoreUserAccountDoc,
  subscribeToFirestoreCoupleTenants,
  saveFirestoreCoupleTenantDoc,
  deleteFirestoreCoupleTenantDoc,
  subscribeToFirestoreAdminSettings,
  saveFirestoreAdminSettingDoc,
  subscribeToFirestoreMilestones,
  saveFirestoreMilestoneDoc,
  deleteFirestoreMilestoneDoc,
  subscribeToFirestoreDatePlans,
  saveFirestoreDatePlanDoc,
  deleteFirestoreDatePlanDoc,
  subscribeToFirestoreMemories,
  saveFirestoreMemoryDoc,
  deleteFirestoreMemoryDoc,
  subscribeToFirestoreLetters,
  saveFirestoreLetterDoc,
  deleteFirestoreLetterDoc,
  subscribeToFirestoreCoupleQuestions,
  saveFirestoreCoupleQuestionDoc,
  deleteFirestoreCoupleQuestionDoc,
  subscribeToFirestoreCelebrationCards,
  saveFirestoreCelebrationCardDoc,
  deleteFirestoreCelebrationCardDoc,
} from "./firebaseService";

export const DEFAULT_PRE_SEEDED_QUESTIONS: CoupleQuestion[] = [
  {
    id: "q-1",
    text: "What is a small habit of mine that makes you feel incredibly loved?",
    category: "romance",
    createdAt: new Date().toISOString(),
    answers: [],
  },
  {
    id: "q-2",
    text: "When did you first realize you were falling in love with me?",
    category: "romance",
    createdAt: new Date().toISOString(),
    answers: [],
  },
  {
    id: "q-3",
    text: "What does a perfect life together look like to you in our future home?",
    category: "future",
    createdAt: new Date().toISOString(),
    answers: [],
  },
  {
    id: "q-4",
    text: "What is my most hilarious quirk or silly habit that you secretly love?",
    category: "playful",
    createdAt: new Date().toISOString(),
    answers: [],
  },
  {
    id: "q-5",
    text: "If we won a trip to anywhere in the world tomorrow, where would we go and why?",
    category: "playful",
    createdAt: new Date().toISOString(),
    answers: [],
  },
  {
    id: "q-6",
    text: "What is your absolute favorite memory of us from our journey so far?",
    category: "memories",
    createdAt: new Date().toISOString(),
    answers: [],
  },
  {
    id: "q-7",
    text: "What are three things you want us to accomplish together in the next 5 years?",
    category: "future",
    createdAt: new Date().toISOString(),
    answers: [],
  },
  {
    id: "q-8",
    text: "How did you feel on our very first date? What were your first thoughts about me?",
    category: "memories",
    createdAt: new Date().toISOString(),
    answers: [],
  },
  {
    id: "q-9",
    text: "What song, movie, or food always reminds you of me?",
    category: "romance",
    createdAt: new Date().toISOString(),
    answers: [],
  },
  {
    id: "q-10",
    text: "If you could define our relationship in three beautiful words, what would they be?",
    category: "romance",
    createdAt: new Date().toISOString(),
    answers: [],
  },
];

// Helper to convert snake_case Supabase DB record to camelCase TS object
export function mapFromDb<T>(record: any): T {
  if (!record) return record;
  const result: any = {};
  Object.keys(record).forEach((key) => {
    const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    result[camelKey] = record[key];
  });
  return result as T;
}

// Helper to convert camelCase TS object to snake_case Supabase DB record
export function mapToDb(obj: any): any {
  if (!obj) return obj;
  const result: any = {};
  const transientKeys = ["isFromDatabase", "is_from_database", "isLocal", "is_local"];
  Object.keys(obj).forEach((key) => {
    if (transientKeys.includes(key)) return;
    const snakeKey = key.replace(/([A-Z])/g, "_$1").toLowerCase();
    result[snakeKey] = obj[key];
  });
  return result;
}

// Graceful handler for Supabase table/schema errors to prevent dev overlay popups & repeated log noise
const warnedContexts = new Set<string>();

function handleSupabaseError(context: string, error: any) {
  if (!error) return;
  const msg = typeof error === "string" ? error : error.message || String(error);
  if (msg.includes("schema cache") || msg.includes("Could not find the table") || msg.includes("PGRST301")) {
    if (!warnedContexts.has(context)) {
      warnedContexts.add(context);
      console.debug(`[Supabase] Table not initialized for ${context}, fallback active.`);
    }
  } else {
    console.debug(`[Supabase] ${context}:`, msg);
  }
}


/** Live list refetchers (one per mounted list). A failed strict write calls refetchAll() so the UI shows the database state at once, not at the next realtime event. */
const refetchers = new Set<() => void>();
export function refetchAll() { refetchers.forEach((f) => { try { f(); } catch { /* ignore */ } }); }

/** Test seam + single place for the Firestore legacy store of the six structured tables. */
export const fsSeam: any = {
  subAdminSettings: subscribeToFirestoreAdminSettings,
  subMilestones: subscribeToFirestoreMilestones, subDatePlans: subscribeToFirestoreDatePlans, subMemories: subscribeToFirestoreMemories, subLetters: subscribeToFirestoreLetters, subCoupleQuestions: subscribeToFirestoreCoupleQuestions, subCelebrationCards: subscribeToFirestoreCelebrationCards,
  subCoupleTenants: subscribeToFirestoreCoupleTenants, saveCoupleTenant: saveFirestoreCoupleTenantDoc, deleteCoupleTenant: deleteFirestoreCoupleTenantDoc, subActivityLogs: subscribeToFirestoreActivityLogs,
  saveMilestone: saveFirestoreMilestoneDoc, deleteMilestone: deleteFirestoreMilestoneDoc, saveDatePlan: saveFirestoreDatePlanDoc, deleteDatePlan: deleteFirestoreDatePlanDoc, saveMemory: saveFirestoreMemoryDoc, deleteMemory: deleteFirestoreMemoryDoc,
  saveLetter: saveFirestoreLetterDoc, deleteLetter: deleteFirestoreLetterDoc, saveCoupleQuestion: saveFirestoreCoupleQuestionDoc, deleteCoupleQuestion: deleteFirestoreCoupleQuestionDoc, saveCelebrationCard: saveFirestoreCelebrationCardDoc, deleteCelebrationCard: deleteFirestoreCelebrationCardDoc,
};
/** A failed strict write: the cache was reverted to its pre-edit snapshot; the app shows this message (App listens) and lists refetch from Supabase. */
function notifyWriteFailed(ctx: string) { try { refetchAll(); } catch { /* ignore */ } try { window.dispatchEvent(new CustomEvent("love-write-failed", { detail: { ctx } })); } catch { /* not in a browser */ } }
const isAdminSession = () => { try { return (JSON.parse(localStorage.getItem("love_firebase_scope") || "{}") as any).role === "admin"; } catch { return false; } };

export async function proxyCall(body: {
  table: string;
  /** "personal" (default for writes), "joint" (read-only legacy space) or "shared" (items my partner shared with me, read-only). */
  space?: "personal" | "joint" | "shared";
  action: "select" | "insert" | "upsert" | "update" | "delete";
  select?: string;
  filters?: { column: string; operator: string; value: any }[];
  order?: { column: string; ascending?: boolean };
  data?: any;
  options?: any;
  single?: boolean;
  count?: string;
  head?: boolean;
}) {
  const sessionToken = localStorage.getItem("love_server_session_token") || localStorage.getItem("love_app_session_token") || "";
  try {
    const res = await fetch("/api/proxy", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(sessionToken ? { "x-server-session": sessionToken } : {}),
      },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      return { data: null, error: json.error || `HTTP ${res.status}`, count: json.count };
    }
    return { data: json.data, error: null, count: json.count };
  } catch (err: any) {
    return { data: null, error: err.message || "Network error proxying request" };
  }
}

export async function verifySupabaseConnection(): Promise<{
  online: boolean;
  configured: boolean;
  latencyMs: number;
  details: string;
  error?: string;
}> {
  if (!isSupabaseConfigured) {
    return {
      online: false,
      configured: false,
      latencyMs: 0,
      details: "Not Configured (Local Fallback Mode)",
    };
  }

  const start = performance.now();
  try {
    const res = await proxyCall({
      table: "admin_settings",
      action: "select",
      select: "id",
      options: { limit: 1 },
    });
    const latencyMs = Math.round(performance.now() - start);

    if (res.error) {
      return {
        online: false,
        configured: true,
        latencyMs,
        details: "Network Unreachable or Auth Required",
        error: res.error,
      };
    }

    return {
      online: true,
      configured: true,
      latencyMs,
      details: `Connected (${latencyMs}ms)`,
    };
  } catch (err: any) {
    const latencyMs = Math.round(performance.now() - start);
    return {
      online: false,
      configured: true,
      latencyMs,
      details: "Connection Failed",
      error: err?.message || String(err),
    };
  }
}

export interface TableDiagnosticStatus {
  tableName: string;
  displayName: string;
  status: "active" | "missing" | "error" | "unconfigured";
  message: string;
}

export async function checkSupabaseTablesStatus(): Promise<{
  configured: boolean;
  tables: TableDiagnosticStatus[];
  allCriticalTablesExist: boolean;
  checkedAt: string;
}> {
  const criticalTables = [
    { tableName: "user_accounts", displayName: "User Accounts" },
    { tableName: "profiles", displayName: "User Profiles" },
    { tableName: "couple_tenants", displayName: "Couple Tenants (SaaS)" },
    { tableName: "milestones", displayName: "Milestones & Timeline" },
    { tableName: "date_plans", displayName: "Date Plans" },
    { tableName: "memories", displayName: "Scrapbook Memories" },
    { tableName: "letters", displayName: "Love Letters" },
    { tableName: "couple_questions", displayName: "Couple Questions" },
    { tableName: "activity_logs", displayName: "Activity Logs" },
    { tableName: "celebration_cards", displayName: "Celebration Cards (Choose Card)" },
    { tableName: "admin_settings", displayName: "Admin Settings" },
  ];

  if (!isSupabaseConfigured) {
    return {
      configured: false,
      tables: criticalTables.map((t) => ({
        tableName: t.tableName,
        displayName: t.displayName,
        status: "unconfigured" as const,
        message: "Supabase URL/Key not configured (using local fallback)",
      })),
      allCriticalTablesExist: false,
      checkedAt: new Date().toLocaleTimeString(),
    };
  }

  const results: TableDiagnosticStatus[] = await Promise.all(
    criticalTables.map(async ({ tableName, displayName }) => {
      try {
        const selectCol = tableName === "couple_tenants" ? "couple_id" : "id";
        const res = await proxyCall({
          table: tableName,
          action: "select",
          select: selectCol,
          options: { limit: 1 },
        });
        if (!res.error) {
          return {
            tableName,
            displayName,
            status: "active" as const,
            message: "Table active & synchronized",
          };
        }

        const msg = res.error;
        if (msg.includes("schema cache") || msg.includes("Could not find the table") || msg.includes("relation") || msg.includes("PGRST301") || msg.includes("42P01")) {
          return {
            tableName,
            displayName,
            status: "missing" as const,
            message: `Table missing in schema (public.${tableName})`,
          };
        }

        return {
          tableName,
          displayName,
          status: "error" as const,
          message: msg,
        };
      } catch (err: any) {
        return {
          tableName,
          displayName,
          status: "error" as const,
          message: err?.message || String(err),
        };
      }
    }),
  );

  const allExist = results.every((r) => r.status === "active");

  return {
    configured: true,
    tables: results,
    allCriticalTablesExist: allExist,
    checkedAt: new Date().toLocaleTimeString(),
  };
}

// ==========================================
// 1. MILESTONES & TIMELINE
// ==========================================

export function subscribeToMilestones(callback: (data: Milestone[]) => void) {
  let initialList = storage.getMilestones();
  callback(initialList);

  let unsubFirestore: (() => void) | undefined; let fsCancelled = false;
  // Legacy Firestore listener only after a LIVE server answer says the strict gate is off (unknown or failed refresh: never attached). Emissions re-check the gate.
  void bulkCopyAllowed().then((ok) => { if (!ok || fsCancelled) return;
    unsubFirestore = fsSeam.subMilestones((fsMilestones) => {
      if (!firestoreMirrorAllowed()) return;
    if (fsMilestones && fsMilestones.length >= 0) {
      storage.saveMilestones(fsMilestones);
      callback(fsMilestones);
    }
    });
  });

  if (isSupabaseConfigured && supabase) {
    const fetchMilestones = async () => {
      const { data: rawData, error } = await supabase.from("milestones").select("*").order("date", { ascending: false });

      if (!error && rawData) {
        const data = await ownSpaceRowsFresh(rawData); // never cache or call back rows of a partner share or any other space
        const mapped = data.map((item) => mapFromDb<Milestone>(item));
        storage.saveMilestones(mapped);
        callback(mapped);
      }
    };

    fetchMilestones(); refetchers.add(fetchMilestones);

    const channelName = `milestones_${Math.random().toString(36).substring(2, 9)}`;
    const channel = supabase
      .channel(channelName)
      .on("postgres_changes", { event: "*", schema: "public", table: "milestones" }, () => {
        fetchMilestones();
      })
      .subscribe();

    return () => {
      refetchers.delete(fetchMilestones); fsCancelled = true; if (unsubFirestore) unsubFirestore();
      supabase.removeChannel(channel);
    };
  }

  return () => {
    fsCancelled = true; if (unsubFirestore) unsubFirestore();
  };
}

export async function saveMilestoneDoc(milestone: Milestone) {
  const __snap = JSON.parse(JSON.stringify(storage.getMilestones()));
  // Ensure photo media is stored in Supabase Storage, not inline
  let photoUrls: string[] = [];
  if (milestone.photos && milestone.photos.length > 0) {
    photoUrls = await Promise.all(milestone.photos.map((p) => uploadBase64Media(p, "milestones")));
  }

  let videoUrl = milestone.videoUrl;
  if (videoUrl && videoUrl.startsWith("data:")) {
    videoUrl = await uploadBase64Media(videoUrl, "milestones_video");
  }

  const updatedMilestone: Milestone = {
    ...milestone,
    coupleId: milestone.coupleId || "couple_default",
    photos: photoUrls,
    videoUrl,
  };

  // Local storage update
  const current = storage.getMilestones();
  const existingIndex = current.findIndex((m) => m.id === updatedMilestone.id);
  if (existingIndex >= 0) {
    current[existingIndex] = updatedMilestone;
  } else {
    current.push(updatedMilestone);
  }
  storage.saveMilestones(current);

  // Firestore update
  if (await bulkCopyAllowed()) await fsSeam.saveMilestone(updatedMilestone);

  // Supabase update
  if (isSupabaseConfigured && supabase) {
    const dbPayload = mapToDb(updatedMilestone);
    const res = await safeUpsert("milestones", dbPayload, "id");
    if (!res.success) {
      handleSupabaseError("saveMilestoneDoc", res.error);
      if (!firestoreMirrorAllowed()) { storage.saveMilestones(__snap); notifyWriteFailed("saveMilestoneDoc"); throw new Error("saveMilestoneDoc failed: the server did not save the change"); } // strict: Supabase is the only store, a failed write is never reported as success
    }
  }
}

export async function deleteMilestoneDoc(id: string) {
  const __snap = JSON.parse(JSON.stringify(storage.getMilestones()));
  const current = storage.getMilestones();
  const milestone = current.find((m) => m.id === id);
  const filtered = current.filter((m) => m.id !== id);
  storage.saveMilestones(filtered);

  if (milestone) {
    milestone.photos?.forEach((url) => deleteMediaFile(url));
    if (milestone.videoUrl) deleteMediaFile(milestone.videoUrl);
  }

  // Firestore update
  if (await bulkCopyAllowed()) await fsSeam.deleteMilestone(id);

  if (isSupabaseConfigured && supabase) {
    const { error } = await proxyCall({ table: "milestones", action: "delete", filters: [{ column: "id", operator: "eq", value: id }] });

    if (error) {
      handleSupabaseError("deleteMilestoneDoc", error);
      if (!firestoreMirrorAllowed()) { storage.saveMilestones(__snap); notifyWriteFailed("deleteMilestoneDoc"); throw new Error("deleteMilestoneDoc failed: the server did not save the change"); } // strict: Supabase is the only store, a failed write is never reported as success
    }
  }
}

// ==========================================
// 2. DATE PLANNER
// ==========================================

export function subscribeToDatePlans(callback: (data: DatePlan[]) => void) {
  let initialList = storage.getDatePlans();
  callback(initialList);

  let unsubFirestore: (() => void) | undefined; let fsCancelled = false;
  // Legacy Firestore listener only after a LIVE server answer says the strict gate is off (unknown or failed refresh: never attached). Emissions re-check the gate.
  void bulkCopyAllowed().then((ok) => { if (!ok || fsCancelled) return;
    unsubFirestore = fsSeam.subDatePlans((fsDatePlans) => {
      if (!firestoreMirrorAllowed()) return;
    if (fsDatePlans && fsDatePlans.length >= 0) {
      storage.saveDatePlans(fsDatePlans);
      callback(fsDatePlans);
    }
    });
  });

  if (isSupabaseConfigured && supabase) {
    const fetchPlans = async () => {
      const { data: rawData, error } = await supabase.from("date_plans").select("*").order("date_time", { ascending: true });

      if (!error && rawData) {
        const data = await ownSpaceRowsFresh(rawData); // never cache or call back rows of a partner share or any other space
        const mapped = data.map((item) => mapFromDb<DatePlan>(item));
        storage.saveDatePlans(mapped);
        callback(mapped);
      }
    };

    fetchPlans(); refetchers.add(fetchPlans);

    const channelName = `date_plans_${Math.random().toString(36).substring(2, 9)}`;
    const channel = supabase
      .channel(channelName)
      .on("postgres_changes", { event: "*", schema: "public", table: "date_plans" }, () => {
        fetchPlans();
      })
      .subscribe();

    return () => {
      refetchers.delete(fetchPlans); fsCancelled = true; if (unsubFirestore) unsubFirestore();
      supabase.removeChannel(channel);
    };
  }

  return () => {
    fsCancelled = true; if (unsubFirestore) unsubFirestore();
  };
}

export async function saveDatePlanDoc(plan: DatePlan) {
  const __snap = JSON.parse(JSON.stringify(storage.getDatePlans()));
  const planWithCouple: DatePlan = {
    ...plan,
    coupleId: plan.coupleId || "couple_default",
  };
  const current = storage.getDatePlans();
  const existingIndex = current.findIndex((p) => p.id === planWithCouple.id);
  if (existingIndex >= 0) {
    current[existingIndex] = planWithCouple;
  } else {
    current.push(planWithCouple);
  }
  storage.saveDatePlans(current);

  if (await bulkCopyAllowed()) await fsSeam.saveDatePlan(planWithCouple);

  if (isSupabaseConfigured && supabase) {
    const dbPayload = mapToDb(planWithCouple);
    const res = await safeUpsert("date_plans", dbPayload, "id");
    if (!res.success) {
      handleSupabaseError("saveDatePlanDoc", res.error);
      if (!firestoreMirrorAllowed()) { storage.saveDatePlans(__snap); notifyWriteFailed("saveDatePlanDoc"); throw new Error("saveDatePlanDoc failed: the server did not save the change"); } // strict: Supabase is the only store, a failed write is never reported as success
    }
  }
}

export async function deleteDatePlanDoc(id: string) {
  const __snap = JSON.parse(JSON.stringify(storage.getDatePlans()));
  const current = storage.getDatePlans();
  const filtered = current.filter((p) => p.id !== id);
  storage.saveDatePlans(filtered);

  if (await bulkCopyAllowed()) await fsSeam.deleteDatePlan(id);

  if (isSupabaseConfigured && supabase) {
    const { error } = await proxyCall({ table: "date_plans", action: "delete", filters: [{ column: "id", operator: "eq", value: id }] });

    if (error) {
      handleSupabaseError("deleteDatePlanDoc", error);
      if (!firestoreMirrorAllowed()) { storage.saveDatePlans(__snap); notifyWriteFailed("deleteDatePlanDoc"); throw new Error("deleteDatePlanDoc failed: the server did not save the change"); } // strict: Supabase is the only store, a failed write is never reported as success
    }
  }
}

// ==========================================
// 3. SHARED MEMORIES
// ==========================================

export function subscribeToMemories(callback: (data: Memory[]) => void) {
  let initialList = storage.getMemories();
  callback(initialList);

  let unsubFirestore: (() => void) | undefined; let fsCancelled = false;
  // Legacy Firestore listener only after a LIVE server answer says the strict gate is off (unknown or failed refresh: never attached). Emissions re-check the gate.
  void bulkCopyAllowed().then((ok) => { if (!ok || fsCancelled) return;
    unsubFirestore = fsSeam.subMemories((fsMemories) => {
      if (!firestoreMirrorAllowed()) return;
    if (fsMemories && fsMemories.length >= 0) {
      storage.saveMemories(fsMemories);
      callback(fsMemories);
    }
    });
  });

  if (isSupabaseConfigured && supabase) {
    const fetchMemories = async () => {
      const { data: rawData, error } = await supabase.from("memories").select("*").order("date", { ascending: false });

      if (!error && rawData) {
        const data = await ownSpaceRowsFresh(rawData); // never cache or call back rows of a partner share or any other space
        const mapped = data.map((item) => mapFromDb<Memory>(item));
        storage.saveMemories(mapped);
        callback(mapped);
      }
    };

    fetchMemories(); refetchers.add(fetchMemories);

    const channelName = `memories_${Math.random().toString(36).substring(2, 9)}`;
    const channel = supabase
      .channel(channelName)
      .on("postgres_changes", { event: "*", schema: "public", table: "memories" }, () => {
        fetchMemories();
      })
      .subscribe();

    return () => {
      refetchers.delete(fetchMemories); fsCancelled = true; if (unsubFirestore) unsubFirestore();
      supabase.removeChannel(channel);
    };
  }

  return () => {
    fsCancelled = true; if (unsubFirestore) unsubFirestore();
  };
}

export async function saveMemoryDoc(memory: Memory) {
  const __snap = JSON.parse(JSON.stringify(storage.getMemories()));
  // Store media URL in Supabase Storage if base64
  let mediaUrl = memory.url;
  if (mediaUrl && mediaUrl.startsWith("data:")) {
    mediaUrl = await uploadBase64Media(mediaUrl, "memories");
  }

  const updatedMemory: Memory = {
    ...memory,
    coupleId: memory.coupleId || "couple_default",
    url: mediaUrl,
  };

  const current = storage.getMemories();
  const existingIndex = current.findIndex((m) => m.id === updatedMemory.id);
  if (existingIndex >= 0) {
    current[existingIndex] = updatedMemory;
  } else {
    current.push(updatedMemory);
  }
  storage.saveMemories(current);

  if (await bulkCopyAllowed()) await fsSeam.saveMemory(updatedMemory);

  if (isSupabaseConfigured && supabase) {
    const dbPayload = mapToDb(updatedMemory);
    const res = await safeUpsert("memories", dbPayload, "id");
    if (!res.success) {
      handleSupabaseError("saveMemoryDoc", res.error);
      if (!firestoreMirrorAllowed()) { storage.saveMemories(__snap); notifyWriteFailed("saveMemoryDoc"); throw new Error("saveMemoryDoc failed: the server did not save the change"); } // strict: Supabase is the only store, a failed write is never reported as success
    }
  }
}

export async function deleteMemoryDoc(id: string) {
  const __snap = JSON.parse(JSON.stringify(storage.getMemories()));
  const current = storage.getMemories();
  const memory = current.find((m) => m.id === id);
  const filtered = current.filter((m) => m.id !== id);
  storage.saveMemories(filtered);

  if (memory?.url) {
    deleteMediaFile(memory.url);
  }

  if (await bulkCopyAllowed()) await fsSeam.deleteMemory(id);

  if (isSupabaseConfigured && supabase) {
    const { error } = await proxyCall({ table: "memories", action: "delete", filters: [{ column: "id", operator: "eq", value: id }] });

    if (error) {
      handleSupabaseError("deleteMemoryDoc", error);
      if (!firestoreMirrorAllowed()) { storage.saveMemories(__snap); notifyWriteFailed("deleteMemoryDoc"); throw new Error("deleteMemoryDoc failed: the server did not save the change"); } // strict: Supabase is the only store, a failed write is never reported as success
    }
  }
}

// ==========================================
// 4. NOTES & LOVE LETTERS
// ==========================================

export function subscribeToLetters(callback: (data: LoveLetter[]) => void) {
  let initialList = storage.getLetters();
  callback(initialList);

  let unsubFirestore: (() => void) | undefined; let fsCancelled = false;
  // Legacy Firestore listener only after a LIVE server answer says the strict gate is off (unknown or failed refresh: never attached). Emissions re-check the gate.
  void bulkCopyAllowed().then((ok) => { if (!ok || fsCancelled) return;
    unsubFirestore = fsSeam.subLetters((fsLetters) => {
      if (!firestoreMirrorAllowed()) return;
    if (fsLetters && fsLetters.length >= 0) {
      storage.saveLetters(fsLetters);
      callback(fsLetters);
    }
    });
  });

  if (isSupabaseConfigured && supabase) {
    const fetchLetters = async () => {
      const { data: rawData, error } = await supabase.from("letters").select("*").order("date", { ascending: false });

      if (!error && rawData) {
        const data = await ownSpaceRowsFresh(rawData); // never cache or call back rows of a partner share or any other space
        const mapped = data.map((item) => mapFromDb<LoveLetter>(item));
        storage.saveLetters(mapped);
        callback(mapped);
      } else if (error) {
        handleSupabaseError("subscribeToLetters", error);
      }
    };

    fetchLetters(); refetchers.add(fetchLetters);

    const channelName = `letters_${Math.random().toString(36).substring(2, 9)}`;
    const channel = supabase
      .channel(channelName)
      .on("postgres_changes", { event: "*", schema: "public", table: "letters" }, () => {
        fetchLetters();
      })
      .subscribe();

    return () => {
      refetchers.delete(fetchLetters); fsCancelled = true; if (unsubFirestore) unsubFirestore();
      supabase.removeChannel(channel);
    };
  }

  return () => {
    fsCancelled = true; if (unsubFirestore) unsubFirestore();
  };
}

export async function saveLetterDoc(letter: LoveLetter) {
  const __snap = JSON.parse(JSON.stringify(storage.getLetters()));
  const letterWithCouple: LoveLetter = {
    ...letter,
    coupleId: letter.coupleId || "couple_default",
  };
  const current = storage.getLetters();
  const existingIndex = current.findIndex((l) => l.id === letterWithCouple.id);
  if (existingIndex >= 0) {
    current[existingIndex] = letterWithCouple;
  } else {
    current.push(letterWithCouple);
  }
  storage.saveLetters(current);

  if (await bulkCopyAllowed()) await fsSeam.saveLetter(letterWithCouple);

  if (isSupabaseConfigured && supabase) {
    const dbPayload = mapToDb(letterWithCouple);
    const res = await safeUpsert("letters", dbPayload, "id");
    if (!res.success) {
      handleSupabaseError("saveLetterDoc", res.error);
      if (!firestoreMirrorAllowed()) { storage.saveLetters(__snap); notifyWriteFailed("saveLetterDoc"); throw new Error("saveLetterDoc failed: the server did not save the change"); } // strict: Supabase is the only store, a failed write is never reported as success
    }
  }
}

export async function deleteLetterDoc(id: string) {
  const __snap = JSON.parse(JSON.stringify(storage.getLetters()));
  const current = storage.getLetters();
  const filtered = current.filter((l) => l.id !== id);
  storage.saveLetters(filtered);

  if (await bulkCopyAllowed()) await fsSeam.deleteLetter(id);

  if (isSupabaseConfigured && supabase) {
    const { error } = await proxyCall({ table: "letters", action: "delete", filters: [{ column: "id", operator: "eq", value: id }] });

    if (error) {
      handleSupabaseError("deleteLetterDoc", error);
      if (!firestoreMirrorAllowed()) { storage.saveLetters(__snap); notifyWriteFailed("deleteLetterDoc"); throw new Error("deleteLetterDoc failed: the server did not save the change"); } // strict: Supabase is the only store, a failed write is never reported as success
    }
  }
}

// ==========================================
// 5. COUPLE QUESTIONS
// ==========================================

export function subscribeToCoupleQuestions(callback: (data: CoupleQuestion[]) => void) {
  callback(DEFAULT_PRE_SEEDED_QUESTIONS);

  let unsubFirestore: (() => void) | undefined; let fsCancelled = false;
  // Legacy Firestore listener only after a LIVE server answer says the strict gate is off (unknown or failed refresh: never attached). Emissions re-check the gate.
  void bulkCopyAllowed().then((ok) => { if (!ok || fsCancelled) return;
    unsubFirestore = fsSeam.subCoupleQuestions((fsQuestions) => {
      if (!firestoreMirrorAllowed()) return;
    if (fsQuestions && fsQuestions.length > 0) {
      callback(fsQuestions);
    }
    });
  });

  if (isSupabaseConfigured && supabase) {
    const fetchQuestions = async () => {
      const { data: rawData, error } = await supabase.from("couple_questions").select("*").order("created_at", { ascending: false });
      const data = rawData ? await ownSpaceRowsFresh(rawData) : rawData; // never cache partner-shared or foreign rows

      if (!error && data && data.length > 0) {
        const mapped = data.map((item) => mapFromDb<CoupleQuestion>(item));
        // Preset questions are code constants shown alongside the account's own rows (own row wins by id). They are never written to the database at boot; answering one saves a row in the user's own space.
        const ownIds = new Set(mapped.map((q) => q.id));
        callback([...mapped, ...DEFAULT_PRE_SEEDED_QUESTIONS.filter((q) => !ownIds.has(q.id))]);
      }
    };

    fetchQuestions(); refetchers.add(fetchQuestions);

    const channelName = `questions_${Math.random().toString(36).substring(2, 9)}`;
    const channel = supabase
      .channel(channelName)
      .on("postgres_changes", { event: "*", schema: "public", table: "couple_questions" }, () => {
        fetchQuestions();
      })
      .subscribe();

    return () => {
      refetchers.delete(fetchQuestions); fsCancelled = true; if (unsubFirestore) unsubFirestore();
      supabase.removeChannel(channel);
    };
  }

  return () => {
    fsCancelled = true; if (unsubFirestore) unsubFirestore();
  };
}

export async function saveCoupleQuestionDoc(question: CoupleQuestion) {
  const __snap = JSON.parse(JSON.stringify(storage.getCoupleQuestions()));
  const questionWithCouple: CoupleQuestion = {
    ...question,
    coupleId: question.coupleId || "couple_default",
  };
  if (await bulkCopyAllowed()) await fsSeam.saveCoupleQuestion(questionWithCouple);

  if (isSupabaseConfigured && supabase) {
    const dbPayload = mapToDb(questionWithCouple);
    const res = await safeUpsert("couple_questions", dbPayload, "id");
    if (!res.success) {
      handleSupabaseError("saveCoupleQuestionDoc", res.error);
      if (!firestoreMirrorAllowed()) { storage.setCoupleQuestions(__snap); notifyWriteFailed("saveCoupleQuestionDoc"); throw new Error("saveCoupleQuestionDoc failed: the server did not save the change"); } // strict: Supabase is the only store, a failed write is never reported as success
    }
  }
}

export async function deleteCoupleQuestionDoc(id: string) {
  const __snap = JSON.parse(JSON.stringify(storage.getCoupleQuestions()));
  if (await bulkCopyAllowed()) await fsSeam.deleteCoupleQuestion(id);

  if (isSupabaseConfigured && supabase) {
    const { error } = await proxyCall({ table: "couple_questions", action: "delete", filters: [{ column: "id", operator: "eq", value: id }] });

    if (error) {
      handleSupabaseError("deleteCoupleQuestionDoc", error);
      if (!firestoreMirrorAllowed()) { storage.setCoupleQuestions(__snap); notifyWriteFailed("deleteCoupleQuestionDoc"); throw new Error("deleteCoupleQuestionDoc failed: the server did not save the change"); } // strict: Supabase is the only store, a failed write is never reported as success
    }
  }
}

// ==========================================
// 5.5. CELEBRATION CARDS (CHOOSE CARD)
// ==========================================

export function subscribeToCelebrationCards(callback: (data: CelebrationCard[]) => void, coupleId?: string) {
  const initialList = storage.getCelebrationCards(coupleId);
  callback(initialList);

  let unsubFirestore: (() => void) | undefined; let fsCancelled = false;
  // Legacy Firestore listener only after a LIVE server answer says the strict gate is off (unknown or failed refresh: never attached). Emissions re-check the gate.
  void bulkCopyAllowed().then((ok) => { if (!ok || fsCancelled) return;
    unsubFirestore = fsSeam.subCelebrationCards((fsCards) => {
      if (!firestoreMirrorAllowed()) return;
    if (fsCards && fsCards.length >= 0) {
      storage.saveCelebrationCards(fsCards);
      const filtered = coupleId ? fsCards.filter((c) => !c.coupleId || c.coupleId === coupleId) : fsCards;
      callback(filtered);
    }
    });
  });

  if (isSupabaseConfigured && supabase) {
    const fetchCards = async () => {
      try {
        let query = supabase.from("celebration_cards").select("*").order("created_at", { ascending: false });

        if (coupleId) {
          query = query.or(`couple_id.eq.${coupleId},couple_id.is.null,couple_id.eq.couple_default`);
        }

        const { data: rawCards, error } = await query;
        if (!error && rawCards) {
          const data = await ownSpaceRowsFresh(rawCards);
          const mapped = data.map((item) => mapFromDb<CelebrationCard>(item)).filter((c) => c && c.id && !c.id.startsWith("default-card-") && !c.id.startsWith("default-"));
          storage.saveCelebrationCards(mapped);
          const filtered = coupleId ? mapped.filter((c) => !c.coupleId || c.coupleId === coupleId) : mapped;
          callback(filtered);
        } else if (error) {
          handleSupabaseError("subscribeToCelebrationCards", error);
        }
      } catch (err) {
        handleSupabaseError("subscribeToCelebrationCards", err);
      }
    };

    fetchCards(); refetchers.add(fetchCards);

    const channelName = `celebration_cards_${Math.random().toString(36).substring(2, 9)}`;
    const channel = supabase
      .channel(channelName)
      .on("postgres_changes", { event: "*", schema: "public", table: "celebration_cards" }, () => {
        fetchCards();
      })
      .subscribe();

    return () => {
      refetchers.delete(fetchCards); fsCancelled = true; if (unsubFirestore) unsubFirestore();
      supabase.removeChannel(channel);
    };
  }

  return () => {
    fsCancelled = true; if (unsubFirestore) unsubFirestore();
  };
}

export async function saveCelebrationCardDoc(card: CelebrationCard) {
  const __snap = JSON.parse(JSON.stringify(storage.getCelebrationCards()));
  const cardWithCouple: CelebrationCard = {
    ...card,
    coupleId: card.coupleId || "couple_default",
    updatedAt: new Date().toISOString(),
  };

  // Local storage update
  storage.saveCelebrationCard(cardWithCouple);

  // Firestore update
  if (await bulkCopyAllowed()) await fsSeam.saveCelebrationCard(cardWithCouple);

  // Supabase update
  if (isSupabaseConfigured && supabase) {
    const dbPayload = mapToDb(cardWithCouple);
    const res = await safeUpsert("celebration_cards", dbPayload, "id");
    if (!res.success) {
      handleSupabaseError("saveCelebrationCardDoc", res.error);
      if (!firestoreMirrorAllowed()) { storage.setCelebrationCards(__snap); notifyWriteFailed("saveCelebrationCardDoc"); throw new Error("saveCelebrationCardDoc failed: the server did not save the change"); } // strict: Supabase is the only store, a failed write is never reported as success
    }
  }
}

export async function deleteCelebrationCardDoc(id: string) {
  const __snap = JSON.parse(JSON.stringify(storage.getCelebrationCards()));
  // Local storage update
  storage.deleteCelebrationCard(id);

  // Firestore update
  if (await bulkCopyAllowed()) await fsSeam.deleteCelebrationCard(id);

  // Supabase update
  if (isSupabaseConfigured && supabase) {
    const { error } = await proxyCall({ table: "celebration_cards", action: "delete", filters: [{ column: "id", operator: "eq", value: id }] });

    if (error) {
      handleSupabaseError("deleteCelebrationCardDoc", error);
      if (!firestoreMirrorAllowed()) { storage.setCelebrationCards(__snap); notifyWriteFailed("deleteCelebrationCardDoc"); throw new Error("deleteCelebrationCardDoc failed: the server did not save the change"); } // strict: Supabase is the only store, a failed write is never reported as success
    }
  }
}

// ==========================================
// 6. USER ACCOUNTS & PROFILES
// ==========================================

export const DEFAULT_COUPLE_ACCOUNTS: UserAccount[] = [];

const userAccountListeners: Array<(data: UserAccount[], fromServer?: boolean) => void> = [];

function notifyUserAccountListeners(accounts: UserAccount[], fromServer = false) {
  userAccountListeners.forEach((cb) => {
    try {
      cb(accounts, fromServer);
    } catch (e) {
      console.warn("Listener error:", e);
    }
  });
}

export function subscribeToUserAccounts(callback: (data: UserAccount[], fromServer?: boolean) => void) {
  const initial = storage.getUserAccounts();
  callback(initial);
  userAccountListeners.push(callback);

  const unsubFirestore = () => {}; // Credentials are read only through the authenticated server.


  if (isSupabaseConfigured && supabase) {
    const fetchAccounts = async () => {
      // Read through the server so password hashes and 2FA secrets are never sent to non-admin browsers.
      const { data, error } = await proxyCall({ table: "user_accounts", action: "select", select: "*" });

      if (!error && data) {
        const mapped = data.map((item) => mapFromDb<UserAccount>(item));
        storage.setUserAccounts(mapped);
        notifyUserAccountListeners(mapped, true);
      } else if (error) {
        handleSupabaseError("subscribeToUserAccounts", error);
      }
    };

    fetchAccounts();

    const channelName = `accounts_${Math.random().toString(36).substring(2, 9)}`;
    const channel = supabase
      .channel(channelName)
      .on("postgres_changes", { event: "*", schema: "public", table: "user_accounts" }, () => {
        fetchAccounts();
      })
      .subscribe();

    return () => {
      const idx = userAccountListeners.indexOf(callback);
      if (idx !== -1) userAccountListeners.splice(idx, 1);
      if (unsubFirestore) unsubFirestore();
      supabase.removeChannel(channel);
    };
  }

  return () => {
    const idx = userAccountListeners.indexOf(callback);
    if (idx !== -1) userAccountListeners.splice(idx, 1);
    if (unsubFirestore) unsubFirestore();
  };
}

export async function saveUserAccountDoc(user: UserAccount) {
  const userWithCouple: UserAccount = {
    ...user,
    coupleId: user.coupleId || `couple_${Date.now()}`,
  };
  const current = storage.getUserAccounts();
  const existingIdx = current.findIndex((u) => u.id === userWithCouple.id || u.username.toLowerCase() === userWithCouple.username.toLowerCase());
  let updatedList: UserAccount[];

  if (existingIdx >= 0) {
    updatedList = [...current];
    updatedList[existingIdx] = userWithCouple;
  } else {
    updatedList = [...current, userWithCouple];
  }

  if (!isSupabaseConfigured || !supabase) throw new Error("Account changes require the server database.");
  const res = await safeUpsert("user_accounts", mapToDb(userWithCouple), "id");
  if (!res.success) throw new Error(res.error || "Account save failed.");
  const safeList = updatedList.map(redactCredentialRecord);
  storage.setUserAccounts(safeList);
  notifyUserAccountListeners(safeList);
  const profileResult = await safeUpsert("profiles", {id:userWithCouple.id, username:userWithCouple.username, display_name:userWithCouple.username}, "id");
  if (!profileResult.success) throw new Error("Account saved, but profile save failed: " + profileResult.error);

}

export async function deleteUserAccountDoc(id: string) {
  if (!isSupabaseConfigured || !supabase) throw new Error("Account deletion requires the server database.");
  const result = await proxyCall({table:"user_accounts", action:"delete", filters:[{column:"id",operator:"eq",value:id}]});
  if (result.error) throw new Error(result.error);
  const profile = await proxyCall({table:"profiles", action:"delete", filters:[{column:"id",operator:"eq",value:id}]});
  const updated = storage.getUserAccounts().filter(u => u.id !== id);
  storage.setUserAccounts(updated);
  notifyUserAccountListeners(updated);
  if (profile.error) throw new Error("Account deleted, but profile cleanup failed: " + profile.error);
}

// ==========================================
// 6.5. COUPLE TENANTS
// ==========================================

const coupleTenantListeners: Array<(data: CoupleTenant[]) => void> = [];

function notifyCoupleTenantListeners(tenants: CoupleTenant[]) {
  coupleTenantListeners.forEach((cb) => {
    try {
      cb(tenants);
    } catch (e) {
      console.warn("Listener error:", e);
    }
  });
}

export function subscribeToCoupleTenants(callback: (data: CoupleTenant[]) => void) {
  const initial = storage.getCoupleTenants();
  callback(initial);
  coupleTenantListeners.push(callback);

  // Tenants carry current membership (linked pair, plan): under strict or unknown gate the saga's Supabase state is the only authority; a stale Firestore copy never overwrites it.
  let unsubFirestore: (() => void) | undefined; let fsCancelled = false;
  void bulkCopyAllowed().then((ok) => { if (!ok || fsCancelled) return;
    unsubFirestore = fsSeam.subCoupleTenants((fsTenants: any) => {
      if (!firestoreMirrorAllowed()) return;
      if (fsTenants && fsTenants.length >= 0) {
        storage.setCoupleTenants(fsTenants);
        notifyCoupleTenantListeners(fsTenants);
      }
    });
  });

  if (isSupabaseConfigured && supabase) {
    const fetchTenants = async () => {
      const { data, error } = isAdminSession() ? await proxyCall({ table: "couple_tenants", action: "select" }) : await supabase.from("couple_tenants").select("*"); // admin pid has no personal space: RLS no longer lists tenants to it, the verified-admin proxy does

      if (!error && data) {
        const mapped = data.map((item) => mapFromDb<CoupleTenant>(item));
        storage.setCoupleTenants(mapped);
        notifyCoupleTenantListeners(mapped);
      } else if (error) {
        handleSupabaseError("subscribeToCoupleTenants", error);
      }
    };

    fetchTenants(); refetchers.add(fetchTenants);

    const channelName = `tenants_${Math.random().toString(36).substring(2, 9)}`;
    const channel = supabase
      .channel(channelName)
      .on("postgres_changes", { event: "*", schema: "public", table: "couple_tenants" }, () => {
        fetchTenants();
      })
      .subscribe();

    return () => {
      const idx = coupleTenantListeners.indexOf(callback);
      if (idx !== -1) coupleTenantListeners.splice(idx, 1);
      refetchers.delete(fetchTenants); fsCancelled = true; if (unsubFirestore) unsubFirestore();
      supabase.removeChannel(channel);
    };
  }

  return () => {
    const idx = coupleTenantListeners.indexOf(callback);
    if (idx !== -1) coupleTenantListeners.splice(idx, 1);
    if (unsubFirestore) unsubFirestore();
  };
}

export async function saveCoupleTenantDoc(tenant: CoupleTenant) {
  const current = storage.getCoupleTenants();
  const existingIdx = current.findIndex((t) => t.coupleId === tenant.coupleId);
  let updatedList: CoupleTenant[];

  if (existingIdx >= 0) {
    updatedList = [...current];
    updatedList[existingIdx] = tenant;
  } else {
    updatedList = [...current, tenant];
  }

  storage.setCoupleTenants(updatedList);
  notifyCoupleTenantListeners(updatedList);

  if (await bulkCopyAllowed()) await fsSeam.saveCoupleTenant(tenant);

  if (isSupabaseConfigured && supabase) {
    const dbPayload = mapToDb(tenant);
    if (!dbPayload.couple_id && tenant.coupleId) dbPayload.couple_id = tenant.coupleId;
    const res = await safeUpsert("couple_tenants", dbPayload, "couple_id");
    if (!res.success) {
      handleSupabaseError("saveCoupleTenantDoc", res.error);
    }
  }
}

export async function deleteCoupleTenantDoc(coupleId: string) {
  const current = storage.getCoupleTenants();
  const updatedList = current.filter((t) => t.coupleId !== coupleId);

  storage.setCoupleTenants(updatedList);
  notifyCoupleTenantListeners(updatedList);

  if (await bulkCopyAllowed()) await fsSeam.deleteCoupleTenant(coupleId);

  if (isSupabaseConfigured && supabase) {
    const { error } = await proxyCall({ table: "couple_tenants", action: "delete", filters: [{ column: "couple_id", operator: "eq", value: coupleId }] });

    if (error) {
      handleSupabaseError("deleteCoupleTenantDoc", error);
    }
  }
}

// ==========================================
// 7. ADMIN SETTINGS
// ==========================================

const adminSettingListeners: Array<(data: AdminSetting[]) => void> = [];

function notifyAdminSettingListeners(settings: AdminSetting[]) {
  adminSettingListeners.forEach((cb) => {
    try {
      cb(settings);
    } catch (e) {
      console.warn("Listener error:", e);
    }
  });
}

/**
 * Intelligently merges admin settings from multiple sources (LocalStorage, Firestore, Supabase)
 * ensuring credentials, admin accounts, and configuration documents are never lost or overwritten by empty states.
 */
export function mergeAdminSettings(sources: (AdminSetting[] | null | undefined)[]): AdminSetting[] {
  const map = new Map<string, AdminSetting>();

  for (const list of sources) {
    if (!list) continue;
    for (const original of list) {
      const doc = isCredentialSetting(original) ? redactCredentialRecord(original) : original;
      if (!doc || !doc.id) continue;
      // Server credential lists replace stale cache lists, never union removed admins back in.
      if (isCredentialSetting(doc)) {
        map.set(doc.id, JSON.parse(JSON.stringify(doc)));
        continue;
      }
      const existing = map.get(doc.id);
      if (!existing) {
        map.set(doc.id, JSON.parse(JSON.stringify(doc)));
      } else {
        if (doc.id === "adminAccounts") {
          const accs1 = existing.adminAccounts || [];
          const accs2 = doc.adminAccounts || [];
          const accsMap = new Map<string, AdminAccount>();

          [...accs1, ...accs2].forEach((acc) => {
            if (acc && acc.username) {
              const key = acc.username.toLowerCase().trim();
              const prev = accsMap.get(key);
              if (!prev) {
                accsMap.set(key, { ...acc });
              } else {
                accsMap.set(key, {
                  ...prev,
                  ...acc,
                  password: acc.password || prev.password,
                  role: acc.role || prev.role,
                });
              }
            }
          });

          map.set(doc.id, {
            ...existing,
            ...doc,
            adminAccounts: Array.from(accsMap.values()),
          });
        } else if (doc.id === "credentials") {
          map.set(doc.id, {
            ...existing,
            ...doc,
            username: doc.username || existing.username,
            password: doc.password || existing.password,
          });
        } else if (doc.id === "tabVisibility") {
          map.set(doc.id, {
            ...existing,
            ...doc,
            visibleTabs: {
              ...(existing.visibleTabs || {}),
              ...(doc.visibleTabs || {}),
            },
          });
        } else {
          map.set(doc.id, {
            ...existing,
            ...doc,
          });
        }
      }
    }
  }

  return Array.from(map.values());
}

let cachedFirestoreAdminSettings: AdminSetting[] = [];
let cachedSupabaseAdminSettings: AdminSetting[] = [];

export function subscribeToAdminSettings(callback: (data: AdminSetting[]) => void) {
  const initial = storage.getAdminSettings();
  const mergedInitial = mergeAdminSettings([initial, cachedFirestoreAdminSettings, cachedSupabaseAdminSettings]);
  callback(mergedInitial);
  adminSettingListeners.push(callback);

  const updateAndSync = () => {
    const local = storage.getAdminSettings();
    const merged = mergeAdminSettings([local, cachedFirestoreAdminSettings, cachedSupabaseAdminSettings]);
    storage.setAdminSettings(merged);
    notifyAdminSettingListeners(merged);
  };

  // With the server database configured, the server is the settings authority: the Firestore copy is attached only when the page-fresh gate says legacy (false), and each emission re-checks it. Without a server database (dev) it stays as before.
  let unsubFirestoreInner: (() => void) | undefined; let fsAdminCancelled = false;
  const attachFsSettings = () => { unsubFirestoreInner = fsSeam.subAdminSettings((fsSettings: any) => {
    if (isSupabaseConfigured && !firestoreMirrorAllowed()) return;
    if (fsSettings) {
      cachedFirestoreAdminSettings = fsSettings.filter((row: any) => !isCredentialSetting(row));
      updateAndSync();
    }
  }); };
  if (isSupabaseConfigured) { void bulkCopyAllowed().then((ok) => { if (ok && !fsAdminCancelled) attachFsSettings(); }); } else attachFsSettings();
  const unsubFirestore = () => { fsAdminCancelled = true; if (unsubFirestoreInner) unsubFirestoreInner(); };

  if (isSupabaseConfigured) {
    const fetchSettings = async () => {
      try {
        const serverSession = localStorage.getItem("love_server_session_token");
        const res = await fetch("/api/admin-settings", {
          headers: serverSession ? { "x-server-session": serverSession } : {},
        });
        const json = await res.json();
        if (json.success && json.settings) {
          const data = json.settings;
          const mapped = data.map((item: any) => {
            const parsed = mapFromDb<AdminSetting>(item);
            if (parsed.id === "adminAccounts" && (!parsed.adminAccounts || parsed.adminAccounts.length === 0)) {
              if (parsed.visibleTabs && (parsed.visibleTabs as any).adminAccounts) {
                parsed.adminAccounts = (parsed.visibleTabs as any).adminAccounts;
              } else if (parsed.password) {
                try {
                  parsed.adminAccounts = JSON.parse(parsed.password);
                } catch (e) {
                  // Ignore json parse error
                }
              }
            }
            if (parsed.id === "promoCodes" && (!parsed.promoCodes || parsed.promoCodes.length === 0)) {
              if (parsed.visibleTabs && (parsed.visibleTabs as any).promoCodes) {
                parsed.promoCodes = (parsed.visibleTabs as any).promoCodes;
              } else if (parsed.password) {
                try {
                  parsed.promoCodes = JSON.parse(parsed.password);
                } catch (e) {
                  // Ignore json parse error
                }
              }
            }
            return parsed;
          });
          cachedSupabaseAdminSettings = mapped;
          updateAndSync();
        }
      } catch (err) {
        handleSupabaseError("subscribeToAdminSettings proxy", err);
      }
    };

    fetchSettings();

    // Poll periodically for admin settings updates
    const pollInterval = setInterval(fetchSettings, 10000);

    return () => {
      const idx = adminSettingListeners.indexOf(callback);
      if (idx !== -1) adminSettingListeners.splice(idx, 1);
      if (unsubFirestore) unsubFirestore();
      clearInterval(pollInterval);
    };
  }

  return () => {
    const idx = adminSettingListeners.indexOf(callback);
    if (idx !== -1) adminSettingListeners.splice(idx, 1);
    if (unsubFirestore) unsubFirestore();
  };
}

export async function saveAdminSettingDoc(setting: AdminSetting) {
  if (isCredentialSetting(setting)) {
    if (!isSupabaseConfigured) throw new Error("Credential changes require the server database.");
    await saveCredentialSetting(mapToDb(setting), {
      fetch: (input, init) => window.fetch(input, init), token: localStorage.getItem("love_server_session_token") || "",
      commit: (rows) => {
        const safe = rows.map((row) => mapFromDb<AdminSetting>(row));
        cachedSupabaseAdminSettings = safe;
        cachedFirestoreAdminSettings = cachedFirestoreAdminSettings.filter(row => !isCredentialSetting(row));
        storage.setAdminSettings(safe);
        notifyAdminSettingListeners(safe);
      }
    });
    return;
  }
  const current = storage.getAdminSettings();
  const existingIdx = current.findIndex((s) => s.id === setting.id);
  let updatedList: AdminSetting[];

  if (existingIdx >= 0) {
    updatedList = [...current];
    updatedList[existingIdx] = setting;
  } else {
    updatedList = [...current, setting];
  }


  // Settings have one server authority. Never mirror credential-bearing legacy collections.

  if (!isSupabaseConfigured) throw new Error("Settings changes require the server database.");
  if (isSupabaseConfigured) {
    try {
      const dbPayload = mapToDb(setting);
      if (setting.id === "telegramConfig" && dbPayload.telegram_config) {
        dbPayload.telegram_config.bot_token = "";
        dbPayload.telegram_config.botToken = "";
      }
      const serverSession = localStorage.getItem("love_server_session_token");
      const response = await fetch("/api/admin-settings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(serverSession ? { "x-server-session": serverSession } : {}),
        },
        body: JSON.stringify(dbPayload),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || "Settings save failed.");
      storage.setAdminSettings(updatedList);
      notifyAdminSettingListeners(updatedList);
    } catch (err) {
      throw err;
    }
  }
}

// ==========================================
// 8. ACTIVITY LOGS
// ==========================================

const activityLogListeners: Array<(data: UserActivityLog[]) => void> = [];

function notifyActivityLogListeners(logs: UserActivityLog[]) {
  activityLogListeners.forEach((cb) => {
    try {
      cb(logs);
    } catch (e) {
      console.warn("Listener error:", e);
    }
  });
}

export function subscribeToActivityLogs(callback: (data: UserActivityLog[]) => void) {
  let firestoreLogs: UserActivityLog[] = [];
  let supabaseLogs: UserActivityLog[] = [];
  let localLogs: UserActivityLog[] = storage.getActivityLogs();

  const emitCombinedLogs = () => {
    const map = new Map<string, UserActivityLog>();
    // Merge local, firestore, and supabase logs by ID
    localLogs.forEach((l) => {
      if (l && l.id) map.set(l.id, l);
    });
    firestoreLogs.forEach((l) => {
      if (l && l.id) map.set(l.id, l);
    });
    supabaseLogs.forEach((l) => {
      if (l && l.id) map.set(l.id, l);
    });

    const merged = Array.from(map.values()).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    storage.setActivityLogs(merged);
    notifyActivityLogListeners(merged);
  };

  callback(localLogs);
  activityLogListeners.push(callback);

  // Subscribe to Firestore Activity Logs (for retrieving existing/historical logs)
  let unsubscribeFirestore: (() => void) | undefined; let fsLogsCancelled = false;
  void bulkCopyAllowed().then((ok) => { if (!ok || fsLogsCancelled) return; // strict/unknown gate: historical Firestore logs are not merged into the list
    unsubscribeFirestore = fsSeam.subActivityLogs((fLogs: any) => { if (!firestoreMirrorAllowed()) return; firestoreLogs = fLogs; emitCombinedLogs(); });
  });

  // Subscribe to Supabase Activity Logs if configured
  let unsubscribeSupabase = () => {};
  if (isSupabaseConfigured && supabase) {
    const fetchSupabaseLogs = async () => {
      try {
        const { data, error } = isAdminSession() ? await proxyCall({ table: "activity_logs", action: "select", order: { column: "timestamp", ascending: false } }) : await supabase.from("activity_logs").select("*").order("timestamp", { ascending: false });

        if (!error && data) {
          const scoped = isAdminSession() ? data : await ownSpaceRowsFresh(data); // a member sees only their own space's logs (partner/joint/foreign rows are dropped under the strict gate)
          supabaseLogs = scoped.map((item) => mapFromDb<UserActivityLog>(item));
          emitCombinedLogs();
        } else if (error) {
          handleSupabaseError("fetchSupabaseLogs", error);
        }
      } catch (err) {
        handleSupabaseError("fetchSupabaseLogs", err);
      }
    };

    fetchSupabaseLogs();

    try {
      const channelName = `logs_${Math.random().toString(36).substring(2, 9)}`;
      const channel = supabase
        .channel(channelName)
        .on("postgres_changes", { event: "*", schema: "public", table: "activity_logs" }, () => {
          fetchSupabaseLogs();
        })
        .subscribe();

      unsubscribeSupabase = () => {
        supabase.removeChannel(channel);
      };
    } catch (err) {
      handleSupabaseError("subscribeToActivityLogs channel", err);
    }
  }

  return () => {
    const idx = activityLogListeners.indexOf(callback);
    if (idx !== -1) activityLogListeners.splice(idx, 1);
    fsLogsCancelled = true; if (typeof unsubscribeFirestore === "function") unsubscribeFirestore();
    if (typeof unsubscribeSupabase === "function") unsubscribeSupabase();
  };
}

export async function logActivity(username: string, action: string, details: string) {
  const id = `log_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

  const users = storage.getUserAccounts();
  const matchedUser = users.find((u) => u.username?.toLowerCase().trim() === (username || "").toLowerCase().trim());
  const coupleId = matchedUser?.coupleId || "couple_default";

  const newLog: UserActivityLog = {
    id,
    username: username || "Unknown User",
    action,
    details,
    timestamp: new Date().toISOString(),
    coupleId,
  };

  // 1. Immediate local state + cache update
  const current = storage.getActivityLogs();
  const updated = [newLog, ...current.filter((l) => l.id !== id)].slice(0, 100);
  storage.setActivityLogs(updated);
  notifyActivityLogListeners(updated);

  let savedInSupabase = false;

  // 2. Save exclusively to Supabase when active
  if (isSupabaseConfigured && supabase) {
    try {
      const dbPayload = mapToDb(newLog);
      const { error } = await proxyCall({ table: "activity_logs", action: "insert", data: dbPayload });

      if (!error) {
        savedInSupabase = true;
      } else {
        handleSupabaseError("logActivity Supabase insert", error);
      }
    } catch (err) {
      handleSupabaseError("logActivity Supabase exception", err);
    }
  }

  // 3. Fallback to Firestore ONLY if Supabase is NOT active/configured or Supabase insert failed
  if (!savedInSupabase) {
    await saveActivityLogDoc(newLog);
  }
}

/**
 * Updates couple ID across all database records when a couple ID is modified or assigned.
 */
export async function updateDataCoupleId(oldCoupleId: string, newCoupleId: string, usernames: string[] = []) {
  // Retired. Rewriting couple_id across the data tables merged private data into a shared space and bypassed per-item consent. Linking and
  // unlinking now go through the server membership operations (link-couple / unlink-couple); data stays in each person's personal space.
  console.warn("updateDataCoupleId is retired; data is not moved on link or unlink.", { oldCoupleId, newCoupleId, count: usernames.length });
}

/**
 * Helper to upsert a record with safe foreign key fallback and couple_id schema cache handling
 */
export async function safeUpsert(table: string, payload: any, onConflict: string = "id"): Promise<{ success: boolean; error?: string }> {
  try {
    if (table === "admin_settings") {
      if (isCredentialSetting(payload)) return {success:false, error:"Credential settings are excluded from bulk sync. Edit them in account management."};
      await saveAdminSettingDoc(mapFromDb<AdminSetting>(payload));
      return {success:true};
    }
    let currentPayload = { ...payload };

    // Intelligent retry loop: strips missing schema cache columns or foreign key constraints automatically
    for (let attempt = 0; attempt < 6; attempt++) {
      const res = await proxyCall({
        table,
        action: "upsert",
        data: currentPayload,
        options: { onConflict },
      });
      if (!res.error) return { success: true };

      const msg = res.error;

      // 1. Check if a specific column is missing in Supabase schema cache (e.g. animation_song_link, animation_song_title, etc.)
      const colMatch = msg.match(/Could not find the '([^']+)' column/i);
      if (colMatch && colMatch[1] && colMatch[1] in currentPayload) {
        delete currentPayload[colMatch[1]];
        continue;
      }

      // 2. Foreign key constraint fallback (e.g. created_by missing in public.profiles)
      if ((msg.includes("foreign key constraint") || msg.includes("fkey")) && "created_by" in currentPayload && currentPayload.created_by !== null) {
        currentPayload.created_by = null;
        continue;
      }

      // 3. Fallback for missing couple_id column or schema cache issue
      if (msg.includes("couple_id") && "couple_id" in currentPayload) {
        delete currentPayload.couple_id;
        continue;
      }

      // 4. Fallback for unique constraint conflicts on username or profiles_username_key
      if (msg.includes("profiles_username_key") || msg.includes("username_key") || (msg.includes("duplicate key") && msg.includes("username"))) {
        const retryRes = await proxyCall({
          table,
          action: "upsert",
          data: currentPayload,
          options: { onConflict: "username" },
        });
        if (!retryRes.error) return { success: true };
      }

      // 5. Friendly, actionable message for uncreated tables in Supabase schema cache
      if (msg.includes("schema cache") && (msg.includes("Could not find the table") || msg.includes("relation") || msg.includes("PGRST301"))) {
        return {
          success: false,
          error: `Table 'public.${table}' does not exist in Supabase yet. Please execute the SQL setup script from Admin Panel → "Fix DB / SQL Script" in your Supabase SQL Editor.`,
        };
      }

      // If no recognizable strip rule matched, break and return the error
      return { success: false, error: msg };
    }

    return { success: false, error: "Max upsert retries exceeded" };
  } catch (err: any) {
    return { success: false, error: err?.message || String(err) };
  }
}

export interface SupabaseSyncSummary {
  coupleQuestionsSynced: number;
  datePlansSynced: number;
  lettersSynced: number;
  memoriesSynced: number;
  milestonesSynced: number;
  userAccountsSynced: number;
  coupleTenantsSynced: number;
  celebrationCardsSynced: number;
  adminSettingsSynced: number;
  errors: string[];
}

/**
 * Explicitly syncs all local & pre-seeded data across all tables to Supabase
 */
export async function syncAllDataToSupabase(): Promise<SupabaseSyncSummary> {
  const summary: SupabaseSyncSummary = {
    coupleQuestionsSynced: 0,
    datePlansSynced: 0,
    lettersSynced: 0,
    memoriesSynced: 0,
    milestonesSynced: 0,
    userAccountsSynced: 0,
    coupleTenantsSynced: 0,
    celebrationCardsSynced: 0,
    adminSettingsSynced: 0,
    errors: [],
  };

  if (!(await bulkCopyAllowed())) { summary.errors.push("Bulk copy of cached data is disabled in the per-account space release."); return summary; }
  if (!isSupabaseConfigured || !supabase) {
    summary.errors.push("Supabase is not configured or offline.");
    return summary;
  }

  try {
    // 1. Couple Questions
    let questions = storage.getCoupleQuestions();
    if (questions.length === 0) {
      questions = DEFAULT_PRE_SEEDED_QUESTIONS;
      storage.setCoupleQuestions(questions);
    }
    for (const q of questions) {
      const dbPayload = mapToDb({ ...q, coupleId: q.coupleId || "couple_default" });
      const res = await safeUpsert("couple_questions", dbPayload, "id");
      if (res.success) summary.coupleQuestionsSynced++;
      else summary.errors.push(`couple_questions (${q.id}): ${res.error}`);
    }

    // 2. Date Plans
    const plans = storage.getDatePlans();
    for (const p of plans) {
      const dbPayload = mapToDb({ ...p, coupleId: p.coupleId || "couple_default" });
      const res = await safeUpsert("date_plans", dbPayload, "id");
      if (res.success) summary.datePlansSynced++;
      else summary.errors.push(`date_plans (${p.id}): ${res.error}`);
    }

    // 3. Letters
    const letters = storage.getLetters();
    for (const l of letters) {
      const dbPayload = mapToDb({ ...l, coupleId: l.coupleId || "couple_default" });
      const res = await safeUpsert("letters", dbPayload, "id");
      if (res.success) summary.lettersSynced++;
      else summary.errors.push(`letters (${l.id}): ${res.error}`);
    }

    // 4. Memories
    const memories = storage.getMemories();
    for (const m of memories) {
      const dbPayload = mapToDb({ ...m, coupleId: m.coupleId || "couple_default" });
      const res = await safeUpsert("memories", dbPayload, "id");
      if (res.success) summary.memoriesSynced++;
      else summary.errors.push(`memories (${m.id}): ${res.error}`);
    }

    // 5. Milestones
    const milestones = storage.getMilestones();
    for (const ms of milestones) {
      const dbPayload = mapToDb({ ...ms, coupleId: ms.coupleId || "couple_default" });
      const res = await safeUpsert("milestones", dbPayload, "id");
      if (res.success) summary.milestonesSynced++;
      else summary.errors.push(`milestones (${ms.id}): ${res.error}`);
    }

    // Account records are intentionally excluded from stale-cache bulk sync.
    summary.errors.push("Account records are server-only; use account management instead of bulk sync.");

    // 6.5. Couple Tenants
    const tenants = storage.getCoupleTenants();
    for (const t of tenants) {
      const dbPayload = mapToDb(t);
      // Ensure couple_id is set as primary key column
      if (!dbPayload.couple_id && t.coupleId) dbPayload.couple_id = t.coupleId;
      const res = await safeUpsert("couple_tenants", dbPayload, "couple_id");
      if (res.success) summary.coupleTenantsSynced++;
      else summary.errors.push(`couple_tenants (${t.coupleId}): ${res.error}`);
    }

    // 6.6. Celebration Cards (Choose Card)
    const celebrationCards = storage.getCelebrationCards().filter((c) => c && c.id && !c.id.startsWith("default-card-") && !c.id.startsWith("default-"));
    let celebrationCardsTableMissing = false;
    for (const card of celebrationCards) {
      const dbPayload = mapToDb({ ...card, coupleId: card.coupleId || "couple_default" });
      const res = await safeUpsert("celebration_cards", dbPayload, "id");
      if (res.success) {
        summary.celebrationCardsSynced++;
      } else {
        if (res.error?.includes("does not exist in Supabase") || res.error?.includes("schema cache")) {
          if (!celebrationCardsTableMissing) {
            celebrationCardsTableMissing = true;
            summary.errors.push(`celebration_cards: Table 'public.celebration_cards' is not created in Supabase yet. Run the SQL script from Admin Panel → "Fix DB / SQL Script" to create it.`);
          }
          break;
        } else {
          summary.errors.push(`celebration_cards (${card.id}): ${res.error}`);
        }
      }
    }

    // 7. Admin Settings
    const settings = storage.getAdminSettings();
    for (const s of settings) {
      if (isCredentialSetting(s)) {
        summary.errors.push("Credential settings are excluded from bulk sync.");
        continue;
      }
      let dbPayload = mapToDb(s);
      let res = await safeUpsert("admin_settings", dbPayload);
      if (!res.success) {
        if (s.id === "promoCodes" || res.error?.includes("promo_codes")) {
          const fallbackPayload: any = {
            id: s.id,
            password: s.promoCodes ? JSON.stringify(s.promoCodes) : s.password || null,
            username: s.username || null,
            visible_tabs: s.visibleTabs || (s.promoCodes ? { promoCodes: s.promoCodes } : null),
          };
          res = await safeUpsert("admin_settings", fallbackPayload);
        } else if (s.id === "subscriptionPlans" || res.error?.includes("subscription_plans")) {
          const fallbackPayload: any = {
            id: s.id,
            password: s.subscriptionPlans ? JSON.stringify(s.subscriptionPlans) : s.password || null,
            username: s.username || null,
            visible_tabs: s.visibleTabs || (s.subscriptionPlans ? { subscriptionPlans: s.subscriptionPlans } : null),
          };
          res = await safeUpsert("admin_settings", fallbackPayload);
        } else if (res.error?.includes("admin_accounts") || s.id === "adminAccounts") {
          const fallbackPayload: any = {
            id: s.id,
            password: s.adminAccounts ? JSON.stringify(s.adminAccounts) : s.password || null,
            username: s.username || null,
            visible_tabs: s.visibleTabs || (s.adminAccounts ? { adminAccounts: s.adminAccounts } : null),
          };
          res = await safeUpsert("admin_settings", fallbackPayload);
        }
      }
      if (res.success) summary.adminSettingsSynced++;
      else summary.errors.push(`admin_settings (${s.id}): ${res.error}`);
    }
  } catch (err: any) {
    summary.errors.push(`Global sync error: ${err?.message || String(err)}`);
  }

  return summary;
}

/**
 * Seed initial data to Supabase if empty
 */
/** Automatic cache-to-database seeding was REMOVED. It copied whatever this browser had cached (possibly another account's or a former partner's data)
 *  into any account whose table looked empty, and "empty" can also mean an error or a different space. Nothing is written at boot now.
 *  Items enter a space only through an explicit user action, stamped with that user's own space id. */
export async function seedSupabaseIfEmpty(): Promise<void> {
  return;
}
