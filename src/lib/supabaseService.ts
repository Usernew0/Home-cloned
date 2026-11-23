import { supabase, isSupabaseConfigured } from "./supabase";
import { uploadBase64Media, deleteMediaFile } from "./storageService";
import { Milestone, DatePlan, Memory, LoveLetter, CoupleQuestion, UserAccount, AdminSetting, AdminAccount, UserActivityLog, CoupleTenant, CelebrationCard } from "../types";
import { storage } from "../utils";
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

export async function proxyCall(body: {
  table: string;
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

  const unsubFirestore = subscribeToFirestoreMilestones((fsMilestones) => {
    if (fsMilestones && fsMilestones.length >= 0) {
      storage.saveMilestones(fsMilestones);
      callback(fsMilestones);
    }
  });

  if (isSupabaseConfigured && supabase) {
    const fetchMilestones = async () => {
      const { data, error } = await supabase.from("milestones").select("*").order("date", { ascending: false });

      if (!error && data) {
        const mapped = data.map((item) => mapFromDb<Milestone>(item));
        storage.saveMilestones(mapped);
        callback(mapped);
      }
    };

    fetchMilestones();

    const channelName = `milestones_${Math.random().toString(36).substring(2, 9)}`;
    const channel = supabase
      .channel(channelName)
      .on("postgres_changes", { event: "*", schema: "public", table: "milestones" }, () => {
        fetchMilestones();
      })
      .subscribe();

    return () => {
      if (unsubFirestore) unsubFirestore();
      supabase.removeChannel(channel);
    };
  }

  return () => {
    if (unsubFirestore) unsubFirestore();
  };
}

export async function saveMilestoneDoc(milestone: Milestone) {
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
  await saveFirestoreMilestoneDoc(updatedMilestone);

  // Supabase update
  if (isSupabaseConfigured && supabase) {
    const dbPayload = mapToDb(updatedMilestone);
    const res = await safeUpsert("milestones", dbPayload, "id");
    if (!res.success) {
      handleSupabaseError("saveMilestoneDoc", res.error);
    }
  }
}

export async function deleteMilestoneDoc(id: string) {
  const current = storage.getMilestones();
  const milestone = current.find((m) => m.id === id);
  const filtered = current.filter((m) => m.id !== id);
  storage.saveMilestones(filtered);

  if (milestone) {
    milestone.photos?.forEach((url) => deleteMediaFile(url));
    if (milestone.videoUrl) deleteMediaFile(milestone.videoUrl);
  }

  // Firestore update
  await deleteFirestoreMilestoneDoc(id);

  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase.from("milestones").delete().eq("id", id);

    if (error) {
      handleSupabaseError("deleteMilestoneDoc", error);
    }
  }
}

// ==========================================
// 2. DATE PLANNER
// ==========================================

export function subscribeToDatePlans(callback: (data: DatePlan[]) => void) {
  let initialList = storage.getDatePlans();
  callback(initialList);

  const unsubFirestore = subscribeToFirestoreDatePlans((fsDatePlans) => {
    if (fsDatePlans && fsDatePlans.length >= 0) {
      storage.saveDatePlans(fsDatePlans);
      callback(fsDatePlans);
    }
  });

  if (isSupabaseConfigured && supabase) {
    const fetchPlans = async () => {
      const { data, error } = await supabase.from("date_plans").select("*").order("date_time", { ascending: true });

      if (!error && data) {
        const mapped = data.map((item) => mapFromDb<DatePlan>(item));
        storage.saveDatePlans(mapped);
        callback(mapped);
      }
    };

    fetchPlans();

    const channelName = `date_plans_${Math.random().toString(36).substring(2, 9)}`;
    const channel = supabase
      .channel(channelName)
      .on("postgres_changes", { event: "*", schema: "public", table: "date_plans" }, () => {
        fetchPlans();
      })
      .subscribe();

    return () => {
      if (unsubFirestore) unsubFirestore();
      supabase.removeChannel(channel);
    };
  }

  return () => {
    if (unsubFirestore) unsubFirestore();
  };
}

export async function saveDatePlanDoc(plan: DatePlan) {
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

  await saveFirestoreDatePlanDoc(planWithCouple);

  if (isSupabaseConfigured && supabase) {
    const dbPayload = mapToDb(planWithCouple);
    const res = await safeUpsert("date_plans", dbPayload, "id");
    if (!res.success) {
      handleSupabaseError("saveDatePlanDoc", res.error);
    }
  }
}

export async function deleteDatePlanDoc(id: string) {
  const current = storage.getDatePlans();
  const filtered = current.filter((p) => p.id !== id);
  storage.saveDatePlans(filtered);

  await deleteFirestoreDatePlanDoc(id);

  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase.from("date_plans").delete().eq("id", id);

    if (error) {
      handleSupabaseError("deleteDatePlanDoc", error);
    }
  }
}

// ==========================================
// 3. SHARED MEMORIES
// ==========================================

export function subscribeToMemories(callback: (data: Memory[]) => void) {
  let initialList = storage.getMemories();
  callback(initialList);

  const unsubFirestore = subscribeToFirestoreMemories((fsMemories) => {
    if (fsMemories && fsMemories.length >= 0) {
      storage.saveMemories(fsMemories);
      callback(fsMemories);
    }
  });

  if (isSupabaseConfigured && supabase) {
    const fetchMemories = async () => {
      const { data, error } = await supabase.from("memories").select("*").order("date", { ascending: false });

      if (!error && data) {
        const mapped = data.map((item) => mapFromDb<Memory>(item));
        storage.saveMemories(mapped);
        callback(mapped);
      }
    };

    fetchMemories();

    const channelName = `memories_${Math.random().toString(36).substring(2, 9)}`;
    const channel = supabase
      .channel(channelName)
      .on("postgres_changes", { event: "*", schema: "public", table: "memories" }, () => {
        fetchMemories();
      })
      .subscribe();

    return () => {
      if (unsubFirestore) unsubFirestore();
      supabase.removeChannel(channel);
    };
  }

  return () => {
    if (unsubFirestore) unsubFirestore();
  };
}

export async function saveMemoryDoc(memory: Memory) {
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

  await saveFirestoreMemoryDoc(updatedMemory);

  if (isSupabaseConfigured && supabase) {
    const dbPayload = mapToDb(updatedMemory);
    const res = await safeUpsert("memories", dbPayload, "id");
    if (!res.success) {
      handleSupabaseError("saveMemoryDoc", res.error);
    }
  }
}

export async function deleteMemoryDoc(id: string) {
  const current = storage.getMemories();
  const memory = current.find((m) => m.id === id);
  const filtered = current.filter((m) => m.id !== id);
  storage.saveMemories(filtered);

  if (memory?.url) {
    deleteMediaFile(memory.url);
  }

  await deleteFirestoreMemoryDoc(id);

  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase.from("memories").delete().eq("id", id);

    if (error) {
      handleSupabaseError("deleteMemoryDoc", error);
    }
  }
}

// ==========================================
// 4. NOTES & LOVE LETTERS
// ==========================================

export function subscribeToLetters(callback: (data: LoveLetter[]) => void) {
  let initialList = storage.getLetters();
  callback(initialList);

  const unsubFirestore = subscribeToFirestoreLetters((fsLetters) => {
    if (fsLetters && fsLetters.length >= 0) {
      storage.saveLetters(fsLetters);
      callback(fsLetters);
    }
  });

  if (isSupabaseConfigured && supabase) {
    const fetchLetters = async () => {
      const { data, error } = await supabase.from("letters").select("*").order("date", { ascending: false });

      if (!error && data) {
        const mapped = data.map((item) => mapFromDb<LoveLetter>(item));
        storage.saveLetters(mapped);
        callback(mapped);
      } else if (error) {
        handleSupabaseError("subscribeToLetters", error);
      }
    };

    fetchLetters();

    const channelName = `letters_${Math.random().toString(36).substring(2, 9)}`;
    const channel = supabase
      .channel(channelName)
      .on("postgres_changes", { event: "*", schema: "public", table: "letters" }, () => {
        fetchLetters();
      })
      .subscribe();

    return () => {
      if (unsubFirestore) unsubFirestore();
      supabase.removeChannel(channel);
    };
  }

  return () => {
    if (unsubFirestore) unsubFirestore();
  };
}

export async function saveLetterDoc(letter: LoveLetter) {
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

  await saveFirestoreLetterDoc(letterWithCouple);

  if (isSupabaseConfigured && supabase) {
    const dbPayload = mapToDb(letterWithCouple);
    const res = await safeUpsert("letters", dbPayload, "id");
    if (!res.success) {
      handleSupabaseError("saveLetterDoc", res.error);
    }
  }
}

export async function deleteLetterDoc(id: string) {
  const current = storage.getLetters();
  const filtered = current.filter((l) => l.id !== id);
  storage.saveLetters(filtered);

  await deleteFirestoreLetterDoc(id);

  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase.from("letters").delete().eq("id", id);

    if (error) {
      handleSupabaseError("deleteLetterDoc", error);
    }
  }
}

// ==========================================
// 5. COUPLE QUESTIONS
// ==========================================

export function subscribeToCoupleQuestions(callback: (data: CoupleQuestion[]) => void) {
  callback(DEFAULT_PRE_SEEDED_QUESTIONS);

  const unsubFirestore = subscribeToFirestoreCoupleQuestions((fsQuestions) => {
    if (fsQuestions && fsQuestions.length > 0) {
      callback(fsQuestions);
    }
  });

  if (isSupabaseConfigured && supabase) {
    const fetchQuestions = async () => {
      const { data, error } = await supabase.from("couple_questions").select("*").order("created_at", { ascending: false });

      if (!error && data && data.length > 0) {
        const mapped = data.map((item) => mapFromDb<CoupleQuestion>(item));
        callback(mapped);
      }
    };

    fetchQuestions();

    const channelName = `questions_${Math.random().toString(36).substring(2, 9)}`;
    const channel = supabase
      .channel(channelName)
      .on("postgres_changes", { event: "*", schema: "public", table: "couple_questions" }, () => {
        fetchQuestions();
      })
      .subscribe();

    return () => {
      if (unsubFirestore) unsubFirestore();
      supabase.removeChannel(channel);
    };
  }

  return () => {
    if (unsubFirestore) unsubFirestore();
  };
}

export async function saveCoupleQuestionDoc(question: CoupleQuestion) {
  const questionWithCouple: CoupleQuestion = {
    ...question,
    coupleId: question.coupleId || "couple_default",
  };
  await saveFirestoreCoupleQuestionDoc(questionWithCouple);

  if (isSupabaseConfigured && supabase) {
    const dbPayload = mapToDb(questionWithCouple);
    const res = await safeUpsert("couple_questions", dbPayload, "id");
    if (!res.success) {
      handleSupabaseError("saveCoupleQuestionDoc", res.error);
    }
  }
}

export async function deleteCoupleQuestionDoc(id: string) {
  await deleteFirestoreCoupleQuestionDoc(id);

  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase.from("couple_questions").delete().eq("id", id);

    if (error) {
      handleSupabaseError("deleteCoupleQuestionDoc", error);
    }
  }
}

// ==========================================
// 5.5. CELEBRATION CARDS (CHOOSE CARD)
// ==========================================

export function subscribeToCelebrationCards(callback: (data: CelebrationCard[]) => void, coupleId?: string) {
  const initialList = storage.getCelebrationCards(coupleId);
  callback(initialList);

  const unsubFirestore = subscribeToFirestoreCelebrationCards((fsCards) => {
    if (fsCards && fsCards.length >= 0) {
      storage.saveCelebrationCards(fsCards);
      const filtered = coupleId ? fsCards.filter((c) => !c.coupleId || c.coupleId === coupleId) : fsCards;
      callback(filtered);
    }
  });

  if (isSupabaseConfigured && supabase) {
    const fetchCards = async () => {
      try {
        let query = supabase.from("celebration_cards").select("*").order("created_at", { ascending: false });

        if (coupleId) {
          query = query.or(`couple_id.eq.${coupleId},couple_id.is.null,couple_id.eq.couple_default`);
        }

        const { data, error } = await query;
        if (!error && data) {
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

    fetchCards();

    const channelName = `celebration_cards_${Math.random().toString(36).substring(2, 9)}`;
    const channel = supabase
      .channel(channelName)
      .on("postgres_changes", { event: "*", schema: "public", table: "celebration_cards" }, () => {
        fetchCards();
      })
      .subscribe();

    return () => {
      if (unsubFirestore) unsubFirestore();
      supabase.removeChannel(channel);
    };
  }

  return () => {
    if (unsubFirestore) unsubFirestore();
  };
}

export async function saveCelebrationCardDoc(card: CelebrationCard) {
  const cardWithCouple: CelebrationCard = {
    ...card,
    coupleId: card.coupleId || "couple_default",
    updatedAt: new Date().toISOString(),
  };

  // Local storage update
  storage.saveCelebrationCard(cardWithCouple);

  // Firestore update
  await saveFirestoreCelebrationCardDoc(cardWithCouple);

  // Supabase update
  if (isSupabaseConfigured && supabase) {
    const dbPayload = mapToDb(cardWithCouple);
    const res = await safeUpsert("celebration_cards", dbPayload, "id");
    if (!res.success) {
      handleSupabaseError("saveCelebrationCardDoc", res.error);
    }
  }
}

export async function deleteCelebrationCardDoc(id: string) {
  // Local storage update
  storage.deleteCelebrationCard(id);

  // Firestore update
  await deleteFirestoreCelebrationCardDoc(id);

  // Supabase update
  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase.from("celebration_cards").delete().eq("id", id);

    if (error) {
      handleSupabaseError("deleteCelebrationCardDoc", error);
    }
  }
}

// ==========================================
// 6. USER ACCOUNTS & PROFILES
// ==========================================

export const DEFAULT_COUPLE_ACCOUNTS: UserAccount[] = [];

const userAccountListeners: Array<(data: UserAccount[]) => void> = [];

function notifyUserAccountListeners(accounts: UserAccount[]) {
  userAccountListeners.forEach((cb) => {
    try {
      cb(accounts);
    } catch (e) {
      console.warn("Listener error:", e);
    }
  });
}

export function subscribeToUserAccounts(callback: (data: UserAccount[]) => void) {
  const initial = storage.getUserAccounts();
  callback(initial);
  userAccountListeners.push(callback);

  const unsubFirestore = subscribeToFirestoreUserAccounts((fsAccounts) => {
    if (fsAccounts && fsAccounts.length >= 0) {
      storage.setUserAccounts(fsAccounts);
      notifyUserAccountListeners(fsAccounts);
    }
  });

  if (isSupabaseConfigured && supabase) {
    const fetchAccounts = async () => {
      // Read through the server so password hashes and 2FA secrets are never sent to non-admin browsers.
      const { data, error } = await proxyCall({ table: "user_accounts", action: "select", select: "*" });

      if (!error && data) {
        const mapped = data.map((item) => mapFromDb<UserAccount>(item));
        storage.setUserAccounts(mapped);
        notifyUserAccountListeners(mapped);
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

  // Never keep a plaintext password in the browser. The server hashes it on write.
  const localSafe = (list: UserAccount[]) => list.map((u) => (u.id === userWithCouple.id ? { ...u, password: current[existingIdx]?.password || "" } : u));
  const safeList = localSafe(updatedList);
  storage.setUserAccounts(safeList);
  notifyUserAccountListeners(safeList);

  await saveFirestoreUserAccountDoc({ ...userWithCouple, password: "" });

  if (isSupabaseConfigured && supabase) {
    const dbPayload = mapToDb(userWithCouple);
    const res = await safeUpsert("user_accounts", dbPayload, "id");
    if (!res.success) {
      handleSupabaseError("saveUserAccountDoc", res.error);
    }

    // Automatically sync profiles table as well so foreign key references work seamlessly
    const profilePayload = {
      id: userWithCouple.id,
      username: userWithCouple.username,
      display_name: userWithCouple.username,
    };
    await safeUpsert("profiles", profilePayload, "id");
  }
}

export async function deleteUserAccountDoc(id: string) {
  const current = storage.getUserAccounts();
  const updatedList = current.filter((u) => u.id !== id && u.username.toLowerCase() !== id.toLowerCase());

  storage.setUserAccounts(updatedList);
  notifyUserAccountListeners(updatedList);

  await deleteFirestoreUserAccountDoc(id);

  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase.from("user_accounts").delete().eq("id", id);

    await supabase.from("profiles").delete().eq("id", id);

    if (error) {
      handleSupabaseError("deleteUserAccountDoc", error);
    }
  }
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

  const unsubFirestore = subscribeToFirestoreCoupleTenants((fsTenants) => {
    if (fsTenants && fsTenants.length >= 0) {
      storage.setCoupleTenants(fsTenants);
      notifyCoupleTenantListeners(fsTenants);
    }
  });

  if (isSupabaseConfigured && supabase) {
    const fetchTenants = async () => {
      const { data, error } = await supabase.from("couple_tenants").select("*");

      if (!error && data) {
        const mapped = data.map((item) => mapFromDb<CoupleTenant>(item));
        storage.setCoupleTenants(mapped);
        notifyCoupleTenantListeners(mapped);
      } else if (error) {
        handleSupabaseError("subscribeToCoupleTenants", error);
      }
    };

    fetchTenants();

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
      if (unsubFirestore) unsubFirestore();
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

  await saveFirestoreCoupleTenantDoc(tenant);

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

  await deleteFirestoreCoupleTenantDoc(coupleId);

  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase.from("couple_tenants").delete().eq("couple_id", coupleId);

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
    for (const doc of list) {
      if (!doc || !doc.id) continue;
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

  const unsubFirestore = subscribeToFirestoreAdminSettings((fsSettings) => {
    if (fsSettings) {
      cachedFirestoreAdminSettings = fsSettings;
      updateAndSync();
    }
  });

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
  const current = storage.getAdminSettings();
  const existingIdx = current.findIndex((s) => s.id === setting.id);
  let updatedList: AdminSetting[];

  if (existingIdx >= 0) {
    updatedList = [...current];
    updatedList[existingIdx] = setting;
  } else {
    updatedList = [...current, setting];
  }

  storage.setAdminSettings(updatedList);
  notifyAdminSettingListeners(updatedList);

  // ALWAYS save to Firestore
  await saveFirestoreAdminSettingDoc(setting);

  // ALWAYS save via secure backend proxy
  if (isSupabaseConfigured) {
    try {
      const dbPayload = mapToDb(setting);
      if (setting.id === "telegramConfig" && dbPayload.telegram_config) {
        dbPayload.telegram_config.bot_token = "";
        dbPayload.telegram_config.botToken = "";
      }
      const serverSession = localStorage.getItem("love_server_session_token");
      await fetch("/api/admin-settings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(serverSession ? { "x-server-session": serverSession } : {}),
        },
        body: JSON.stringify(dbPayload),
      });
    } catch (err) {
      handleSupabaseError("saveAdminSettingDoc proxy", err);
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
  const unsubscribeFirestore = subscribeToFirestoreActivityLogs((fLogs) => {
    firestoreLogs = fLogs;
    emitCombinedLogs();
  });

  // Subscribe to Supabase Activity Logs if configured
  let unsubscribeSupabase = () => {};
  if (isSupabaseConfigured && supabase) {
    const fetchSupabaseLogs = async () => {
      try {
        const { data, error } = await supabase.from("activity_logs").select("*").order("timestamp", { ascending: false });

        if (!error && data) {
          supabaseLogs = data.map((item) => mapFromDb<UserActivityLog>(item));
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
    if (typeof unsubscribeFirestore === "function") unsubscribeFirestore();
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
      const { error } = await supabase.from("activity_logs").insert(dbPayload);

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
  if (!newCoupleId) return;

  const userLower = usernames.map((u) => u.toLowerCase());

  // 1. Milestones
  const milestones = storage.getMilestones();
  for (const ms of milestones) {
    const isMatch = (oldCoupleId && ms.coupleId === oldCoupleId) || (ms.createdBy && userLower.includes(ms.createdBy.toLowerCase()));
    if (isMatch && ms.coupleId !== newCoupleId) {
      await saveMilestoneDoc({ ...ms, coupleId: newCoupleId });
    }
  }

  // 2. Date Plans
  const plans = storage.getDatePlans();
  for (const p of plans) {
    const isMatch = (oldCoupleId && p.coupleId === oldCoupleId) || (p.createdBy && userLower.includes(p.createdBy.toLowerCase()));
    if (isMatch && p.coupleId !== newCoupleId) {
      await saveDatePlanDoc({ ...p, coupleId: newCoupleId });
    }
  }

  // 3. Memories
  const memories = storage.getMemories();
  for (const m of memories) {
    const isMatch = (oldCoupleId && m.coupleId === oldCoupleId) || (m.createdBy && userLower.includes(m.createdBy.toLowerCase()));
    if (isMatch && m.coupleId !== newCoupleId) {
      await saveMemoryDoc({ ...m, coupleId: newCoupleId });
    }
  }

  // 4. Letters
  const letters = storage.getLetters();
  for (const l of letters) {
    const isMatch = (oldCoupleId && l.coupleId === oldCoupleId) || (l.sender && userLower.includes(l.sender.toLowerCase()));
    if (isMatch && l.coupleId !== newCoupleId) {
      await saveLetterDoc({ ...l, coupleId: newCoupleId });
    }
  }

  // 5. Questions
  const questions = storage.getCoupleQuestions();
  for (const q of questions) {
    const isMatch = (oldCoupleId && q.coupleId === oldCoupleId) || (q.createdBy && userLower.includes(q.createdBy.toLowerCase()));
    if (isMatch && q.coupleId !== newCoupleId) {
      await saveCoupleQuestionDoc({ ...q, coupleId: newCoupleId });
    }
  }

  // 5.5 Celebration Cards
  const celebrationCards = storage.getCelebrationCards();
  for (const c of celebrationCards) {
    const isMatch = (oldCoupleId && c.coupleId === oldCoupleId) || (c.createdBy && userLower.includes(c.createdBy.toLowerCase())) || (c.userId && userLower.includes(c.userId.toLowerCase()));
    if (isMatch && c.coupleId !== newCoupleId) {
      await saveCelebrationCardDoc({ ...c, coupleId: newCoupleId });
    }
  }

  // 6. Direct Supabase updates
  if (isSupabaseConfigured && supabase) {
    const tables = ["milestones", "date_plans", "memories", "letters", "couple_questions", "celebration_cards", "user_accounts", "activity_logs", "chat_messages"];
    for (const table of tables) {
      try {
        if (oldCoupleId) {
          await supabase.from(table).update({ couple_id: newCoupleId }).eq("couple_id", oldCoupleId);
        }
        for (const uname of usernames) {
          const col = table === "letters" ? "sender" : table === "user_accounts" ? "username" : "created_by";
          await supabase.from(table).update({ couple_id: newCoupleId }).ilike(col, uname);
        }
      } catch (e) {
        // Silently handle if column missing in Supabase cache
      }
    }
  }
}

/**
 * Helper to upsert a record with safe foreign key fallback and couple_id schema cache handling
 */
export async function safeUpsert(table: string, payload: any, onConflict: string = "id"): Promise<{ success: boolean; error?: string }> {
  try {
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

    // 6. User Accounts
    const users = storage.getUserAccounts();
    for (const u of users) {
      const dbPayload = mapToDb({ ...u, coupleId: u.coupleId || "couple_default" });
      const res = await safeUpsert("user_accounts", dbPayload, "id");
      if (res.success) summary.userAccountsSynced++;
      else summary.errors.push(`user_accounts (${u.id}): ${res.error}`);
    }

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
export async function seedSupabaseIfEmpty() {
  if (!isSupabaseConfigured || !supabase) return;

  try {
    // 1. Couple Questions
    const { count: questionsCount, error: qErr } = await supabase.from("couple_questions").select("*", { count: "exact", head: true });

    if (!qErr && questionsCount === 0) {
      let questions = storage.getCoupleQuestions();
      if (questions.length === 0) {
        questions = DEFAULT_PRE_SEEDED_QUESTIONS;
        storage.setCoupleQuestions(questions);
      }
      for (const q of questions) {
        await safeUpsert("couple_questions", mapToDb(q));
      }
    }

    // 2. Milestones
    const { count: milestonesCount, error: msErr } = await supabase.from("milestones").select("*", { count: "exact", head: true });

    if (!msErr && milestonesCount === 0) {
      const localMilestones = storage.getMilestones();
      for (const m of localMilestones) {
        await safeUpsert("milestones", mapToDb(m));
      }
    }

    // 3. Date Plans
    const { count: plansCount, error: pErr } = await supabase.from("date_plans").select("*", { count: "exact", head: true });

    if (!pErr && plansCount === 0) {
      const localPlans = storage.getDatePlans();
      for (const p of localPlans) {
        await safeUpsert("date_plans", mapToDb(p));
      }
    }

    // 4. Memories
    const { count: memoriesCount, error: memErr } = await supabase.from("memories").select("*", { count: "exact", head: true });

    if (!memErr && memoriesCount === 0) {
      const localMemories = storage.getMemories();
      for (const m of localMemories) {
        await safeUpsert("memories", mapToDb(m));
      }
    }

    // 5. Letters
    const { count: lettersCount, error: lErr } = await supabase.from("letters").select("*", { count: "exact", head: true });

    if (!lErr && lettersCount === 0) {
      const localLetters = storage.getLetters();
      for (const l of localLetters) {
        await safeUpsert("letters", mapToDb(l));
      }
    }

    // 6. Celebration Cards (Choose Card)
    const { count: cardsCount, error: cErr } = await supabase.from("celebration_cards").select("*", { count: "exact", head: true });

    if (!cErr && cardsCount === 0) {
      const localCards = storage.getCelebrationCards().filter((c) => c && c.id && !c.id.startsWith("default-card-") && !c.id.startsWith("default-"));
      for (const c of localCards) {
        await safeUpsert("celebration_cards", mapToDb(c));
      }
    }
  } catch (err) {
    handleSupabaseError("seedSupabaseIfEmpty exception", err);
  }
}
