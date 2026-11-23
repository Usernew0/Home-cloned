/**
 * Our Home - Hybrid Architecture Sync Service
 * Strategy A: Functional Data Partitioning
 * 
 * - Realtime Chat & Presence -> Firebase Firestore (firebaseService.ts)
 * - Structured App Data & Settings -> Supabase PostgreSQL (supabaseService.ts)
 * - Media & Attachments -> Supabase Storage (storageService.ts)
 */

export * from './firebaseService';
export * from './supabaseService';
export * from './storageService';

import { useState, useEffect, useCallback } from 'react';
import { uploadMedia } from './storageService';
import { 
  verifyFirestoreConnection, 
  getFirestoreActivityLogs, 
  deleteFirestoreActivityLogDoc, 
  getFirestoreAdminSettings, 
  deleteFirestoreAdminSettingDoc,
  getFirestoreMilestones,
  getFirestoreDatePlans,
  getFirestoreMemories,
  getFirestoreLetters,
  getFirestoreCoupleQuestions,
  getFirestoreUserAccounts,
  getFirestoreCoupleTenants,
  getFirestoreChatMessages,
  saveFirestoreMilestoneDoc,
  saveFirestoreDatePlanDoc,
  saveFirestoreMemoryDoc,
  saveFirestoreLetterDoc,
  saveFirestoreCoupleQuestionDoc,
  saveFirestoreUserAccountDoc,
  saveFirestoreCoupleTenantDoc,
  saveFirestoreAdminSettingDoc,
  saveChatMessageDoc,
  saveActivityLogDoc,
  saveFirestoreCelebrationCardDoc,
  getFirestoreCelebrationCards
} from './firebaseService';
import { 
  verifySupabaseConnection, 
  saveAdminSettingDoc,
  saveCelebrationCardDoc,
  checkSupabaseTablesStatus,
  TableDiagnosticStatus,
  mapToDb,
  mapFromDb,
  safeUpsert,
  DEFAULT_PRE_SEEDED_QUESTIONS,
  proxyCall
} from './supabaseService';
import { isSupabaseConfigured } from './supabase';
import { storage } from '../utils';
import { 
  Milestone, 
  DatePlan, 
  Memory, 
  LoveLetter, 
  CoupleQuestion, 
  UserAccount, 
  CoupleTenant, 
  CelebrationCard,
  AdminSetting, 
  SubscriptionPlan,
  ChatMessage, 
  UserActivityLog 
} from '../types';

export interface DatabaseConnectionStatus {
  firebase: {
    online: boolean;
    latencyMs: number;
    details: string;
    error?: string;
  };
  supabase: {
    online: boolean;
    configured: boolean;
    latencyMs: number;
    details: string;
    error?: string;
  };
  lastChecked: string;
}

export async function checkDatabaseStatuses(): Promise<DatabaseConnectionStatus> {
  const [fb, sb] = await Promise.all([
    verifyFirestoreConnection(),
    verifySupabaseConnection()
  ]);

  return {
    firebase: fb,
    supabase: sb,
    lastChecked: new Date().toLocaleTimeString()
  };
}

export function useDatabaseStatus(intervalMs = 30000) {
  const [status, setStatus] = useState<DatabaseConnectionStatus>({
    firebase: { online: true, latencyMs: 0, details: 'Checking...' },
    supabase: { online: isSupabaseConfigured, configured: isSupabaseConfigured, latencyMs: 0, details: 'Checking...' },
    lastChecked: 'Initializing...'
  });
  const [isChecking, setIsChecking] = useState<boolean>(false);

  const refresh = useCallback(async () => {
    setIsChecking(true);
    try {
      const res = await checkDatabaseStatuses();
      setStatus(res);
    } catch (err) {
      console.warn("Failed to check database connection status:", err);
    } finally {
      setIsChecking(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, intervalMs);
    return () => clearInterval(interval);
  }, [refresh, intervalMs]);

  return { status, isChecking, refresh };
}

export function useSupabaseTableDiagnostics(autoCheckOnMount = true) {
  const [diagnostics, setDiagnostics] = useState<{
    configured: boolean;
    tables: TableDiagnosticStatus[];
    allCriticalTablesExist: boolean;
    checkedAt: string;
  } | null>(null);
  const [isChecking, setIsChecking] = useState<boolean>(false);

  const runDiagnostics = useCallback(async () => {
    setIsChecking(true);
    try {
      const res = await checkSupabaseTablesStatus();
      setDiagnostics(res);
    } catch (err) {
      console.warn("Table diagnostics check failed:", err);
    } finally {
      setIsChecking(false);
    }
  }, []);

  useEffect(() => {
    if (autoCheckOnMount) {
      runDiagnostics();
    }
  }, [autoCheckOnMount, runDiagnostics]);

  return { diagnostics, isChecking, runDiagnostics };
}

export interface MigrationResult {
  logsProcessed: number;
  logsMigrated: number;
  logsPurgedFromFirestore: number;
  settingsProcessed: number;
  settingsMigrated: number;
  settingsPurgedFromFirestore: number;
  errors: string[];
  timestamp: string;
}

/**
 * Migration & Deduplication Routine:
 * Checks for duplicated logs or settings between Firestore and Supabase.
 * Ensures old Firestore data is safely migrated to Supabase tables and then purged from Firestore.
 */
export async function migrateAndDeduplicateFirestoreToSupabase(): Promise<MigrationResult> {
  const result: MigrationResult = {
    logsProcessed: 0,
    logsMigrated: 0,
    logsPurgedFromFirestore: 0,
    settingsProcessed: 0,
    settingsMigrated: 0,
    settingsPurgedFromFirestore: 0,
    errors: [],
    timestamp: new Date().toLocaleString()
  };

  try {
    // 1. Fetch old items from Firestore
    const [fsLogs, fsSettings] = await Promise.all([
      getFirestoreActivityLogs(),
      getFirestoreAdminSettings()
    ]);

    result.logsProcessed = fsLogs.length;
    result.settingsProcessed = fsSettings.length;

    // 2. Process Activity Logs Migration & Deduplication
    if (fsLogs.length > 0) {
      let existingSupabaseLogIds = new Set<string>();
      if (isSupabaseConfigured) {
        try {
          const res = await proxyCall({ table: 'activity_logs', action: 'select', select: 'id' });
          if (!res.error && res.data) {
            res.data.forEach((row: any) => existingSupabaseLogIds.add(row.id));
          }
        } catch (e: any) {
          result.errors.push(`Supabase fetch activity_logs check: ${e?.message || String(e)}`);
        }
      }

      for (const log of fsLogs) {
        let migratedSuccessfully = false;

        // If log is not yet in Supabase, insert it
        if (!existingSupabaseLogIds.has(log.id)) {
          if (isSupabaseConfigured) {
            try {
              const snakeLog = {
                id: log.id,
                username: log.username,
                action: log.action,
                details: log.details,
                timestamp: log.timestamp
              };
              const res = await proxyCall({ table: 'activity_logs', action: 'insert', data: snakeLog });
              if (!res.error) {
                migratedSuccessfully = true;
                result.logsMigrated++;
              } else {
                result.errors.push(`Log ${log.id} insert info: ${res.error}`);
              }
            } catch (err: any) {
              result.errors.push(`Log ${log.id} exception: ${err?.message || String(err)}`);
            }
          } else {
            // Local fallback caching
            const currentLocal = storage.getActivityLogs();
            if (!currentLocal.some(l => l.id === log.id)) {
              storage.setActivityLogs([log, ...currentLocal]);
            }
            migratedSuccessfully = true;
            result.logsMigrated++;
          }
        } else {
          // Log was already present / duplicated in Supabase
          migratedSuccessfully = true;
        }

        // Purge old Firestore doc after verifying it is in Supabase / migrated
        if (migratedSuccessfully) {
          const purged = await deleteFirestoreActivityLogDoc(log.id);
          if (purged) {
            result.logsPurgedFromFirestore++;
          }
        }
      }
    }

    // 3. Process Admin Settings Synchronization (Keep credentials preserved in both Firestore & Supabase)
    if (fsSettings.length > 0) {
      for (const setting of fsSettings) {
        await saveAdminSettingDoc(setting);
        result.settingsMigrated++;
      }
    }

    // 4. Deduplicate local storage Activity Logs cache
    const localLogs = storage.getActivityLogs();
    const uniqueLocalLogsMap = new Map<string, UserActivityLog>();
    localLogs.forEach(l => {
      if (l && l.id) uniqueLocalLogsMap.set(l.id, l);
    });
    const cleanLocal = Array.from(uniqueLocalLogsMap.values()).sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
    storage.setActivityLogs(cleanLocal);

  } catch (globalErr: any) {
    result.errors.push(`Migration routine error: ${globalErr?.message || String(globalErr)}`);
  }

  return result;
}

// Backwards compatibility alias for uploadChatImage -> uploads via storageService
export async function uploadChatImage(file: File): Promise<string> {
  const result = await uploadMedia(file, 'chat');
  return result.url;
}

export async function seedIfEmpty() {
  const { seedSupabaseIfEmpty } = await import('./supabaseService');
  await seedSupabaseIfEmpty();
}

// ==========================================
// SEPARATE TABLE-BY-TABLE BIDIRECTIONAL SYNC
// ==========================================

export type SyncTableKey =
  | 'milestones'
  | 'date_plans'
  | 'memories'
  | 'letters'
  | 'couple_questions'
  | 'user_accounts'
  | 'couple_tenants'
  | 'celebration_cards'
  | 'admin_settings'
  | 'chat_messages'
  | 'activity_logs';

export interface TableSyncMeta {
  key: SyncTableKey;
  label: string;
  supabaseTable: string;
  firestoreCollection: string;
  description: string;
}

export const SYNC_TABLES_LIST: TableSyncMeta[] = [
  { key: 'milestones', label: 'Milestones & Timeline', supabaseTable: 'milestones', firestoreCollection: 'milestones', description: 'Relationship milestones, dates, and badges' },
  { key: 'date_plans', label: 'Date Bucket List', supabaseTable: 'date_plans', firestoreCollection: 'datePlans', description: 'Planned date ideas, status, and notes' },
  { key: 'memories', label: 'Memory Vault', supabaseTable: 'memories', firestoreCollection: 'memories', description: 'Photo memories, captions, and favorite tags' },
  { key: 'letters', label: 'Love Letters', supabaseTable: 'letters', firestoreCollection: 'letters', description: 'Sent love letters, read receipts, and favorite flags' },
  { key: 'couple_questions', label: 'Cupid / Daily Questions', supabaseTable: 'couple_questions', firestoreCollection: 'coupleQuestions', description: 'Daily questions and partner answers' },
  { key: 'user_accounts', label: 'User Accounts', supabaseTable: 'user_accounts', firestoreCollection: 'userAccounts', description: 'Registered account credentials and profiles' },
  { key: 'couple_tenants', label: 'Couple Tenants (SaaS)', supabaseTable: 'couple_tenants', firestoreCollection: 'coupleTenants', description: 'Tenants, plan subscriptions, and SMS settings' },
  { key: 'celebration_cards', label: 'Celebration Cards (Choose Card)', supabaseTable: 'celebration_cards', firestoreCollection: 'celebrationCards', description: 'Celebration moments, customized birthday/anniversary cards, photos, letters, and themes' },
  { key: 'admin_settings', label: 'Admin Settings', supabaseTable: 'admin_settings', firestoreCollection: 'adminSettings', description: 'Admin panel configs, subscription plans, and access permissions' },
  { key: 'chat_messages', label: 'Chat Messages', supabaseTable: 'chat_messages', firestoreCollection: 'chatMessages', description: 'Real-time message history and media attachments' },
  { key: 'activity_logs', label: 'Activity Logs', supabaseTable: 'activity_logs', firestoreCollection: 'activityLogs', description: 'System audit logs and user activity tracking' },
];

export interface TableSyncResult {
  tableKey: SyncTableKey;
  direction: 'firestore_to_supabase' | 'supabase_to_firestore';
  processedCount: number;
  syncedCount: number;
  errors: string[];
}

export async function syncSingleTableFirestoreToSupabase(tableKey: SyncTableKey): Promise<TableSyncResult> {
  const result: TableSyncResult = {
    tableKey,
    direction: 'firestore_to_supabase',
    processedCount: 0,
    syncedCount: 0,
    errors: []
  };

  if (!isSupabaseConfigured) {
    result.errors.push('Supabase is not configured or offline.');
    return result;
  }

  try {
    switch (tableKey) {
      case 'milestones': {
        const local = storage.getMilestones();
        const fs = await getFirestoreMilestones();
        const map = new Map<string, Milestone>();
        local.forEach(item => map.set(item.id, item));
        fs.forEach(item => map.set(item.id, item));
        const combined = Array.from(map.values());
        result.processedCount = combined.length;
        for (const ms of combined) {
          const dbPayload = mapToDb({ ...ms, coupleId: ms.coupleId || 'couple_default' });
          const res = await safeUpsert('milestones', dbPayload, 'id');
          if (res.success) result.syncedCount++;
          else result.errors.push(`milestone (${ms.id}): ${res.error}`);
        }
        break;
      }
      case 'date_plans': {
        const local = storage.getDatePlans();
        const fs = await getFirestoreDatePlans();
        const map = new Map<string, DatePlan>();
        local.forEach(item => map.set(item.id, item));
        fs.forEach(item => map.set(item.id, item));
        const combined = Array.from(map.values());
        result.processedCount = combined.length;
        for (const p of combined) {
          const dbPayload = mapToDb({ ...p, coupleId: p.coupleId || 'couple_default' });
          const res = await safeUpsert('date_plans', dbPayload, 'id');
          if (res.success) result.syncedCount++;
          else result.errors.push(`date_plan (${p.id}): ${res.error}`);
        }
        break;
      }
      case 'memories': {
        const local = storage.getMemories();
        const fs = await getFirestoreMemories();
        const map = new Map<string, Memory>();
        local.forEach(item => map.set(item.id, item));
        fs.forEach(item => map.set(item.id, item));
        const combined = Array.from(map.values());
        result.processedCount = combined.length;
        for (const m of combined) {
          const dbPayload = mapToDb({ ...m, coupleId: m.coupleId || 'couple_default' });
          const res = await safeUpsert('memories', dbPayload, 'id');
          if (res.success) result.syncedCount++;
          else result.errors.push(`memory (${m.id}): ${res.error}`);
        }
        break;
      }
      case 'letters': {
        const local = storage.getLetters();
        const fs = await getFirestoreLetters();
        const map = new Map<string, LoveLetter>();
        local.forEach(item => map.set(item.id, item));
        fs.forEach(item => map.set(item.id, item));
        const combined = Array.from(map.values());
        result.processedCount = combined.length;
        for (const l of combined) {
          const dbPayload = mapToDb({ ...l, coupleId: l.coupleId || 'couple_default' });
          const res = await safeUpsert('letters', dbPayload, 'id');
          if (res.success) result.syncedCount++;
          else result.errors.push(`letter (${l.id}): ${res.error}`);
        }
        break;
      }
      case 'couple_questions': {
        let local = storage.getCoupleQuestions();
        if (local.length === 0) local = DEFAULT_PRE_SEEDED_QUESTIONS;
        const fs = await getFirestoreCoupleQuestions();
        const map = new Map<string, CoupleQuestion>();
        local.forEach(item => map.set(item.id, item));
        fs.forEach(item => map.set(item.id, item));
        const combined = Array.from(map.values());
        result.processedCount = combined.length;
        for (const q of combined) {
          const dbPayload = mapToDb({ ...q, coupleId: q.coupleId || 'couple_default' });
          const res = await safeUpsert('couple_questions', dbPayload, 'id');
          if (res.success) result.syncedCount++;
          else result.errors.push(`couple_question (${q.id}): ${res.error}`);
        }
        break;
      }
      case 'user_accounts': {
        const local = storage.getUserAccounts();
        const fs = await getFirestoreUserAccounts();
        const map = new Map<string, UserAccount>();
        local.forEach(item => map.set(item.id, item));
        fs.forEach(item => map.set(item.id, item));
        const combined = Array.from(map.values());
        result.processedCount = combined.length;
        for (const u of combined) {
          const dbPayload = mapToDb({ ...u, coupleId: u.coupleId || 'couple_default' });
          const res = await safeUpsert('user_accounts', dbPayload, 'id');
          if (res.success) result.syncedCount++;
          else result.errors.push(`user_account (${u.id}): ${res.error}`);
        }
        break;
      }
      case 'couple_tenants': {
        const local = storage.getCoupleTenants();
        const fs = await getFirestoreCoupleTenants();
        const map = new Map<string, CoupleTenant>();
        local.forEach(item => map.set(item.coupleId, item));
        fs.forEach(item => map.set(item.coupleId, item));
        const combined = Array.from(map.values());
        result.processedCount = combined.length;
        for (const t of combined) {
          const dbPayload = mapToDb(t);
          if (!dbPayload.couple_id && t.coupleId) dbPayload.couple_id = t.coupleId;
          const res = await safeUpsert('couple_tenants', dbPayload, 'couple_id');
          if (res.success) result.syncedCount++;
          else result.errors.push(`couple_tenant (${t.coupleId}): ${res.error}`);
        }
        break;
      }
      case 'celebration_cards': {
        const local = storage.getCelebrationCards().filter(c => c && c.id && !c.id.startsWith('default-card-') && !c.id.startsWith('default-'));
        const fs = await getFirestoreCelebrationCards();
        const map = new Map<string, CelebrationCard>();
        local.forEach(item => map.set(item.id, item));
        fs.forEach(item => map.set(item.id, item));
        const combined = Array.from(map.values());
        result.processedCount = combined.length;
        for (const card of combined) {
          const dbPayload = mapToDb({ ...card, coupleId: card.coupleId || 'couple_default' });
          const res = await safeUpsert('celebration_cards', dbPayload, 'id');
          if (res.success) {
            result.syncedCount++;
          } else {
            if (res.error?.includes('does not exist in Supabase') || res.error?.includes('schema cache')) {
              result.errors.push(`Table 'public.celebration_cards' is not created in Supabase yet. Run the SQL script from Admin Panel → "Fix DB / SQL Script" in your Supabase SQL Editor to create it.`);
              break;
            } else {
              result.errors.push(`celebration_card (${card.id}): ${res.error}`);
            }
          }
        }
        break;
      }
      case 'admin_settings': {
        const local = storage.getAdminSettings();
        const fs = await getFirestoreAdminSettings();
        const map = new Map<string, AdminSetting>();
        local.forEach(item => map.set(item.id, item));
        fs.forEach(item => map.set(item.id, item));
        const combined = Array.from(map.values());
        result.processedCount = combined.length;
        for (const s of combined) {
          let dbPayload = mapToDb(s);
          let res = await safeUpsert('admin_settings', dbPayload, 'id');
          if (!res.success) {
            if (s.id === 'promoCodes' || res.error?.includes('promo_codes')) {
              const fallbackPayload: any = {
                id: s.id,
                password: s.promoCodes ? JSON.stringify(s.promoCodes) : (s.password || null),
                username: s.username || null,
                visible_tabs: s.visibleTabs || (s.promoCodes ? { promoCodes: s.promoCodes } : null)
              };
              res = await safeUpsert('admin_settings', fallbackPayload, 'id');
            } else if (s.id === 'subscriptionPlans' || res.error?.includes('subscription_plans')) {
              const fallbackPayload: any = {
                id: s.id,
                password: s.subscriptionPlans ? JSON.stringify(s.subscriptionPlans) : (s.password || null),
                username: s.username || null,
                visible_tabs: s.visibleTabs || (s.subscriptionPlans ? { subscriptionPlans: s.subscriptionPlans } : null)
              };
              res = await safeUpsert('admin_settings', fallbackPayload, 'id');
            } else if (res.error?.includes('admin_accounts') || s.id === 'adminAccounts') {
              const fallbackPayload: any = {
                id: s.id,
                password: s.adminAccounts ? JSON.stringify(s.adminAccounts) : (s.password || null),
                username: s.username || null,
                visible_tabs: s.visibleTabs || (s.adminAccounts ? { adminAccounts: s.adminAccounts } : null)
              };
              res = await safeUpsert('admin_settings', fallbackPayload, 'id');
            }
          }
          if (res.success) result.syncedCount++;
          else result.errors.push(`admin_setting (${s.id}): ${res.error}`);
        }
        break;
      }
      case 'chat_messages': {
        const fs = await getFirestoreChatMessages();
        result.processedCount = fs.length;
        for (const msg of fs) {
          const dbPayload = mapToDb({ ...msg, coupleId: msg.coupleId || 'couple_default' });
          const res = await safeUpsert('chat_messages', dbPayload, 'id');
          if (res.success) result.syncedCount++;
          else result.errors.push(`chat_message (${msg.id}): ${res.error}`);
        }
        break;
      }
      case 'activity_logs': {
        const local = storage.getActivityLogs();
        const fs = await getFirestoreActivityLogs();
        const map = new Map<string, UserActivityLog>();
        local.forEach(item => map.set(item.id, item));
        fs.forEach(item => map.set(item.id, item));
        const combined = Array.from(map.values());
        result.processedCount = combined.length;
        for (const log of combined) {
          const dbPayload = mapToDb({ ...log, coupleId: log.coupleId || 'couple_default' });
          const res = await safeUpsert('activity_logs', dbPayload, 'id');
          if (res.success) result.syncedCount++;
          else result.errors.push(`activity_log (${log.id}): ${res.error}`);
        }
        break;
      }
    }
  } catch (err: any) {
    result.errors.push(`Sync ${tableKey} error: ${err?.message || String(err)}`);
  }

  return result;
}

export async function syncSingleTableSupabaseToFirestore(tableKey: SyncTableKey): Promise<TableSyncResult> {
  const result: TableSyncResult = {
    tableKey,
    direction: 'supabase_to_firestore',
    processedCount: 0,
    syncedCount: 0,
    errors: []
  };

  if (!isSupabaseConfigured) {
    result.errors.push('Supabase is not configured or offline.');
    return result;
  }

  try {
    const meta = SYNC_TABLES_LIST.find(t => t.key === tableKey);
    const tableName = meta ? meta.supabaseTable : tableKey;

    const res = await proxyCall({ table: tableName, action: 'select' });
    if (res.error) {
      result.errors.push(`Supabase query ${tableName} error: ${res.error}`);
      return result;
    }

    const data = res.data;

    if (!data || data.length === 0) {
      result.processedCount = 0;
      result.syncedCount = 0;
      return result;
    }

    result.processedCount = data.length;

    switch (tableKey) {
      case 'milestones': {
        const items = data.map(row => mapFromDb<Milestone>(row));
        const currentLocal = storage.getMilestones();
        const map = new Map<string, Milestone>();
        currentLocal.forEach(i => map.set(i.id, i));

        for (const item of items) {
          await saveFirestoreMilestoneDoc(item);
          map.set(item.id, item);
          result.syncedCount++;
        }
        storage.setMilestones(Array.from(map.values()));
        break;
      }
      case 'date_plans': {
        const items = data.map(row => mapFromDb<DatePlan>(row));
        const currentLocal = storage.getDatePlans();
        const map = new Map<string, DatePlan>();
        currentLocal.forEach(i => map.set(i.id, i));

        for (const item of items) {
          await saveFirestoreDatePlanDoc(item);
          map.set(item.id, item);
          result.syncedCount++;
        }
        storage.setDatePlans(Array.from(map.values()));
        break;
      }
      case 'memories': {
        const items = data.map(row => mapFromDb<Memory>(row));
        const currentLocal = storage.getMemories();
        const map = new Map<string, Memory>();
        currentLocal.forEach(i => map.set(i.id, i));

        for (const item of items) {
          await saveFirestoreMemoryDoc(item);
          map.set(item.id, item);
          result.syncedCount++;
        }
        storage.setMemories(Array.from(map.values()));
        break;
      }
      case 'letters': {
        const items = data.map(row => mapFromDb<LoveLetter>(row));
        const currentLocal = storage.getLetters();
        const map = new Map<string, LoveLetter>();
        currentLocal.forEach(i => map.set(i.id, i));

        for (const item of items) {
          await saveFirestoreLetterDoc(item);
          map.set(item.id, item);
          result.syncedCount++;
        }
        storage.setLetters(Array.from(map.values()));
        break;
      }
      case 'couple_questions': {
        const items = data.map(row => mapFromDb<CoupleQuestion>(row));
        const currentLocal = storage.getCoupleQuestions();
        const map = new Map<string, CoupleQuestion>();
        currentLocal.forEach(i => map.set(i.id, i));

        for (const item of items) {
          await saveFirestoreCoupleQuestionDoc(item);
          map.set(item.id, item);
          result.syncedCount++;
        }
        storage.setCoupleQuestions(Array.from(map.values()));
        break;
      }
      case 'user_accounts': {
        const items = data.map(row => mapFromDb<UserAccount>(row));
        const currentLocal = storage.getUserAccounts();
        const map = new Map<string, UserAccount>();
        currentLocal.forEach(i => map.set(i.id, i));

        for (const item of items) {
          await saveFirestoreUserAccountDoc(item);
          map.set(item.id, item);
          result.syncedCount++;
        }
        storage.setUserAccounts(Array.from(map.values()));
        break;
      }
      case 'couple_tenants': {
        const items = data.map(row => mapFromDb<CoupleTenant>(row));
        const currentLocal = storage.getCoupleTenants();
        const map = new Map<string, CoupleTenant>();
        currentLocal.forEach(i => map.set(i.coupleId, i));

        for (const item of items) {
          await saveFirestoreCoupleTenantDoc(item);
          map.set(item.coupleId, item);
          result.syncedCount++;
        }
        storage.setCoupleTenants(Array.from(map.values()));
        break;
      }
      case 'celebration_cards': {
        const items = data.map(row => mapFromDb<CelebrationCard>(row)).filter(c => c && c.id && !c.id.startsWith('default-card-') && !c.id.startsWith('default-'));
        const currentLocal = storage.getCelebrationCards().filter(c => c && c.id && !c.id.startsWith('default-card-') && !c.id.startsWith('default-'));
        const map = new Map<string, CelebrationCard>();
        currentLocal.forEach(i => map.set(i.id, i));

        for (const item of items) {
          await saveFirestoreCelebrationCardDoc(item);
          map.set(item.id, item);
          result.syncedCount++;
        }
        storage.saveCelebrationCards(Array.from(map.values()));
        break;
      }
      case 'admin_settings': {
        const items = data.map(row => mapFromDb<AdminSetting>(row));
        const currentLocal = storage.getAdminSettings();
        const map = new Map<string, AdminSetting>();
        currentLocal.forEach(i => map.set(i.id, i));

        for (const item of items) {
          await saveFirestoreAdminSettingDoc(item);
          map.set(item.id, item);
          result.syncedCount++;
        }
        storage.setAdminSettings(Array.from(map.values()));
        break;
      }
      case 'chat_messages': {
        const items = data.map(row => mapFromDb<ChatMessage>(row));
        for (const item of items) {
          await saveChatMessageDoc(item);
          result.syncedCount++;
        }
        break;
      }
      case 'activity_logs': {
        const items = data.map(row => mapFromDb<UserActivityLog>(row));
        const currentLocal = storage.getActivityLogs();
        const map = new Map<string, UserActivityLog>();
        currentLocal.forEach(i => map.set(i.id, i));

        for (const item of items) {
          await saveActivityLogDoc(item);
          map.set(item.id, item);
          result.syncedCount++;
        }
        storage.setActivityLogs(Array.from(map.values()));
        break;
      }
    }
  } catch (err: any) {
    result.errors.push(`Sync ${tableKey} from Supabase error: ${err?.message || String(err)}`);
  }

  return result;
}

export async function syncAllTablesFirestoreToSupabase(): Promise<{ totalSynced: number; results: TableSyncResult[]; errors: string[] }> {
  const results: TableSyncResult[] = [];
  const errors: string[] = [];
  let totalSynced = 0;

  for (const table of SYNC_TABLES_LIST) {
    const res = await syncSingleTableFirestoreToSupabase(table.key);
    results.push(res);
    totalSynced += res.syncedCount;
    if (res.errors.length > 0) {
      errors.push(...res.errors);
    }
  }

  return { totalSynced, results, errors };
}

export async function syncAllTablesSupabaseToFirestore(): Promise<{ totalSynced: number; results: TableSyncResult[]; errors: string[] }> {
  const results: TableSyncResult[] = [];
  const errors: string[] = [];
  let totalSynced = 0;

  for (const table of SYNC_TABLES_LIST) {
    const res = await syncSingleTableSupabaseToFirestore(table.key);
    results.push(res);
    totalSynced += res.syncedCount;
    if (res.errors.length > 0) {
      errors.push(...res.errors);
    }
  }

  return { totalSynced, results, errors };
}
