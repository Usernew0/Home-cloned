import { 
  collection, 
  doc, 
  setDoc, 
  deleteDoc, 
  onSnapshot, 
  query,
  orderBy,
  limit,
  getDocs,
  where,
  getDocFromServer
} from 'firebase/firestore';
import { getFirebaseScope } from './firebaseScope';
import { db, isFirestoreOnline } from './firebase';
import { 
  ChatMessage, 
  ChatGroup,
  UserPresence, 
  UserActivityLog, 
  AdminSetting, 
  UserAccount, 
  Milestone, 
  DatePlan, 
  Memory, 
  LoveLetter, 
  CoupleQuestion,
  CoupleTenant,
  CelebrationCard,
  MusicTrack 
} from '../types';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errMessage = error instanceof Error ? error.message : String(error);
  const errCode = (error && typeof error === 'object' && 'code' in error) ? (error as any).code : '';
  
  const isPermissionError = 
    errCode === 'permission-denied' || 
    errMessage.toLowerCase().includes('permission-denied') || 
    errMessage.toLowerCase().includes('insufficient permissions');

  const errInfo: FirestoreErrorInfo = {
    error: errMessage,
    authInfo: {
      userId: null,
      email: null,
    },
    operationType,
    path
  };

  console.error('Firestore Realtime Error: ', JSON.stringify(errInfo));

  if (isPermissionError) {
    throw new Error(JSON.stringify(errInfo));
  }
}

// Recursively strips any undefined properties from an object so Firestore setDoc does not throw errors
export function cleanUndefined<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) {
    return obj.map(item => cleanUndefined(item)) as unknown as T;
  }
  if (typeof obj === 'object') {
    const cleaned = {} as any;
    Object.keys(obj as any).forEach(key => {
      const val = (obj as any)[key];
      if (val !== undefined) {
        cleaned[key] = cleanUndefined(val);
      }
    });
    return cleaned;
  }
  return obj;
}

// Helper to normalize couple_id and coupleId properties across all Firestore documents
export function normalizeCoupleId<T extends Record<string, any>>(item: T): T {
  if (!item) return item;
  const coupleIdVal = item.coupleId || item.couple_id || 'couple_default';
  return {
    ...item,
    coupleId: coupleIdVal,
    couple_id: coupleIdVal,
  };
}

/** Couple-scoped collection query. Admins read everything; everyone else only their own couple (rules enforce the same). */
function scopedCol(name: string) {
  const scope = getFirebaseScope();
  const base = collection(db, name);
  if (!scope || scope.role === 'admin') return base;
  return query(base, where('coupleId', '==', scope.coupleId));
}

// ==========================================
// REAL-TIME CHAT MESSAGES
// ==========================================

export function subscribeToChatMessages(callback: (data: ChatMessage[]) => void) {
  const scope = getFirebaseScope();
  const onErr = (error: unknown) => handleFirestoreError(error, OperationType.GET, 'chatMessages');
  const chats = collection(db, 'chatMessages');
  if (!scope || scope.role === 'admin') {
    // Query limited to 1000 chat messages to optimize reads and provide rich history across DMs and group chats
    return onSnapshot(query(chats, orderBy('timestamp', 'asc'), limit(1000)), (snapshot) => {
      const list: ChatMessage[] = [];
      snapshot.forEach((doc) => list.push(normalizeCoupleId(doc.data() as ChatMessage)));
      callback(list);
    }, onErr);
  }

  // Non-admins: union of (own couple) + (sent by me) + (sent to me) + (global lounge) + (groups I belong to).
  // Each is a separate constrained query so the security rules can prove access per query.
  const buckets = new Map<string, ChatMessage[]>();
  const emit = () => {
    const byId = new Map<string, ChatMessage>();
    buckets.forEach((arr) => arr.forEach((m) => byId.set(m.id, m)));
    callback(Array.from(byId.values()).sort((x, y) => (x.timestamp < y.timestamp ? -1 : x.timestamp > y.timestamp ? 1 : 0)).slice(-1000));
  };
  const listen = (key: string, field: string, value: string) =>
    onSnapshot(query(chats, where(field, '==', value), orderBy('timestamp', 'asc'), limit(500)), (snapshot) => {
      const arr: ChatMessage[] = [];
      snapshot.forEach((d) => arr.push(normalizeCoupleId(d.data() as ChatMessage)));
      buckets.set(key, arr);
      emit();
    }, onErr);
  const unsubs: Array<() => void> = [
    listen('couple', 'coupleId', scope.coupleId),
    listen('sent', 'sender', scope.username),
    listen('received', 'receiver', scope.username),
    listen('global', 'conversationId', 'global'),
  ];
  const groupUnsubs = new Map<string, () => void>();
  const unsubGroups = subscribeToChatGroups((groups) => {
    const ids = new Set(groups.filter((g) => (g.members || []).includes(scope.username)).map((g) => g.id));
    groupUnsubs.forEach((u, id) => { if (!ids.has(id)) { u(); groupUnsubs.delete(id); buckets.delete(`g:${id}`); } });
    ids.forEach((id) => { if (!groupUnsubs.has(id)) groupUnsubs.set(id, listen(`g:${id}`, 'conversationId', id)); });
  });
  return () => { unsubs.forEach((u) => u()); groupUnsubs.forEach((u) => u()); unsubGroups(); };
}

export async function saveChatMessageDoc(message: ChatMessage) {
  try {
    const payload = normalizeCoupleId(message);
    await setDoc(doc(db, 'chatMessages', message.id), cleanUndefined(payload));
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `chatMessages/${message.id}`);
  }
}

export async function deleteChatMessageDoc(id: string) {
  try {
    await deleteDoc(doc(db, 'chatMessages', id));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `chatMessages/${id}`);
  }
}

// ==========================================
// REAL-TIME CHAT GROUPS
// ==========================================

export function subscribeToChatGroups(callback: (data: ChatGroup[]) => void) {
  const scope = getFirebaseScope();
  const onErr = (error: unknown) => handleFirestoreError(error, OperationType.GET, 'chatGroups');
  if (!scope || scope.role === 'admin') {
    return onSnapshot(collection(db, 'chatGroups'), (snapshot) => {
      const list: ChatGroup[] = [];
      snapshot.forEach((doc) => list.push(doc.data() as ChatGroup));
      callback(list);
    }, onErr);
  }
  // Members and pending invitees only. Two listeners, merged by id.
  const member = new Map<string, ChatGroup>();
  const pending = new Map<string, ChatGroup>();
  const emit = () => callback(Array.from(new Map([...pending, ...member]).values()));
  const fill = (m: Map<string, ChatGroup>) => (snapshot: any) => {
    m.clear();
    snapshot.forEach((d: any) => m.set(d.id, d.data() as ChatGroup));
    emit();
  };
  const u1 = onSnapshot(query(collection(db, 'chatGroups'), where('members', 'array-contains', scope.username)), fill(member), onErr);
  const u2 = onSnapshot(query(collection(db, 'chatGroups'), where('pendingMembers', 'array-contains', scope.username)), fill(pending), onErr);
  return () => { u1(); u2(); };
}

export async function saveChatGroupDoc(group: ChatGroup) {
  try {
    await setDoc(doc(db, 'chatGroups', group.id), cleanUndefined(group));
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `chatGroups/${group.id}`);
  }
}

export async function deleteChatGroupDoc(id: string) {
  try {
    await deleteDoc(doc(db, 'chatGroups', id));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `chatGroups/${id}`);
  }
}

// ==========================================
// REAL-TIME USER PRESENCE & TYPING INDICATORS
// ==========================================

export async function updateUserPresenceDoc(
  username: string, 
  lastReadChatTime?: number, 
  typingIn?: string | null, 
  typingAt?: string | null
) {
  if (!username || !username.trim()) return;
  const cleanUsername = username.trim();
  const docId = cleanUsername;
  try {
    const scope = getFirebaseScope();
    const presenceDoc: UserPresence = {
      username: cleanUsername,
      lastActive: new Date().toISOString(),
      ...(scope ? { coupleId: scope.coupleId } : {}),
    };
    if (typeof lastReadChatTime === 'number') {
      presenceDoc.lastReadChatTime = lastReadChatTime;
    }
    if (typeof typingIn === 'string') {
      presenceDoc.typingIn = typingIn;
    } else if (typingIn === null) {
      presenceDoc.typingIn = null;
    }
    if (typeof typingAt === 'string') {
      presenceDoc.typingAt = typingAt;
    } else if (typingAt === null) {
      presenceDoc.typingAt = null;
    }

    await setDoc(doc(db, 'presence', docId), cleanUndefined(presenceDoc));
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `presence/${docId}`);
  }
}

export function subscribeToPresence(callback: (data: UserPresence[]) => void) {
  return onSnapshot(scopedCol('presence'), (snapshot) => {
    const list: UserPresence[] = [];
    snapshot.forEach((doc) => {
      list.push(doc.data() as UserPresence);
    });
    callback(list);
  }, (error) => {
    handleFirestoreError(error, OperationType.GET, 'presence');
  });
}

// ==========================================
// REAL-TIME FIRESTORE ACTIVITY LOGS
// ==========================================

export function subscribeToFirestoreActivityLogs(callback: (data: UserActivityLog[]) => void) {
  const logsQuery = query(scopedCol('activityLogs'), orderBy('timestamp', 'desc'), limit(200));

  return onSnapshot(logsQuery, (snapshot) => {
    const list: UserActivityLog[] = [];
    snapshot.forEach((doc) => {
      list.push(normalizeCoupleId(doc.data() as UserActivityLog));
    });
    callback(list);
  }, (error) => {
    console.warn("Firestore activityLogs subscription info:", error.message);
  });
}

export async function saveActivityLogDoc(log: UserActivityLog) {
  try {
    const payload = normalizeCoupleId(log);
    await setDoc(doc(db, 'activityLogs', log.id), cleanUndefined(payload));
  } catch (err) {
    console.warn("Firestore activityLog save error:", err);
  }
}

export async function getFirestoreActivityLogs(): Promise<UserActivityLog[]> {
  try {
    const snapshot = await getDocs(scopedCol('activityLogs'));
    const list: UserActivityLog[] = [];
    snapshot.forEach((d) => {
      list.push(normalizeCoupleId(d.data() as UserActivityLog));
    });
    return list;
  } catch (err) {
    console.warn("Failed to fetch Firestore activityLogs:", err);
    return [];
  }
}

export async function deleteFirestoreActivityLogDoc(id: string): Promise<boolean> {
  try {
    await deleteDoc(doc(db, 'activityLogs', id));
    return true;
  } catch (err) {
    console.warn(`Failed to purge Firestore activityLog ${id}:`, err);
    return false;
  }
}

export async function getFirestoreAdminSettings(): Promise<AdminSetting[]> {
  try {
    const snapshot = await getDocs(collection(db, 'adminSettings'));
    const list: AdminSetting[] = [];
    snapshot.forEach((d) => {
      list.push(d.data() as AdminSetting);
    });
    return list;
  } catch (err) {
    console.warn("Failed to fetch Firestore adminSettings:", err);
    return [];
  }
}

export async function deleteFirestoreAdminSettingDoc(id: string): Promise<boolean> {
  try {
    await deleteDoc(doc(db, 'adminSettings', id));
    return true;
  } catch (err) {
    console.warn(`Failed to purge Firestore adminSetting ${id}:`, err);
    return false;
  }
}

export async function verifyFirestoreConnection(): Promise<{
  online: boolean;
  latencyMs: number;
  details: string;
  error?: string;
}> {
  const start = performance.now();
  try {
    await getDocFromServer(doc(db, '_connection_test_metadata_', 'ping'));
    const latencyMs = Math.round(performance.now() - start);
    return {
      online: true,
      latencyMs,
      details: `Connected (${latencyMs}ms)`
    };
  } catch (err: any) {
    const latencyMs = Math.round(performance.now() - start);
    const msg = err?.message || String(err);
    if (msg.includes('offline') || msg.includes('reach') || msg.includes('respond')) {
      return {
        online: false,
        latencyMs,
        details: 'Server unreachable / Offline',
        error: msg
      };
    }
    // If it's a "doc does not exist" or permission/not found error, Firestore is connected!
    return {
      online: isFirestoreOnline,
      latencyMs,
      details: isFirestoreOnline ? `Connected (${latencyMs}ms)` : 'Offline mode'
    };
  }
}

// ==========================================
// REAL-TIME FIRESTORE USER ACCOUNTS
// ==========================================

export function subscribeToFirestoreUserAccounts(callback: (data: UserAccount[]) => void) {
  return onSnapshot(collection(db, 'userAccounts'), (snapshot) => {
    const list: UserAccount[] = [];
    snapshot.forEach((doc) => {
      list.push(normalizeCoupleId(doc.data() as UserAccount));
    });
    callback(list);
  }, (error) => {
    console.warn("Firestore userAccounts subscription info:", error.message);
  });
}

export async function saveFirestoreUserAccountDoc(user: UserAccount) {
  try {
    const payload = normalizeCoupleId(user);
    await setDoc(doc(db, 'userAccounts', user.id), cleanUndefined(payload));
  } catch (err) {
    console.warn("Firestore saveUserAccountDoc error:", err);
  }
}

export async function deleteFirestoreUserAccountDoc(id: string) {
  try {
    await deleteDoc(doc(db, 'userAccounts', id));
  } catch (err) {
    console.warn("Firestore deleteUserAccountDoc error:", err);
  }
}

// ==========================================
// REAL-TIME FIRESTORE COUPLE TENANTS
// ==========================================

export function subscribeToFirestoreCoupleTenants(callback: (data: CoupleTenant[]) => void) {
  return onSnapshot(collection(db, 'coupleTenants'), (snapshot) => {
    const list: CoupleTenant[] = [];
    snapshot.forEach((doc) => {
      list.push(normalizeCoupleId(doc.data() as CoupleTenant));
    });
    callback(list);
  }, (error) => {
    console.warn("Firestore coupleTenants subscription info:", error.message);
  });
}

export async function saveFirestoreCoupleTenantDoc(tenant: CoupleTenant) {
  try {
    const payload = normalizeCoupleId(tenant);
    await setDoc(doc(db, 'coupleTenants', tenant.coupleId), cleanUndefined(payload));
  } catch (err) {
    console.warn("Firestore saveCoupleTenantDoc error:", err);
  }
}

export async function deleteFirestoreCoupleTenantDoc(coupleId: string) {
  try {
    await deleteDoc(doc(db, 'coupleTenants', coupleId));
  } catch (err) {
    console.warn("Firestore deleteCoupleTenantDoc error:", err);
  }
}

// ==========================================
// REAL-TIME FIRESTORE ADMIN SETTINGS
// ==========================================

export function subscribeToFirestoreAdminSettings(callback: (data: AdminSetting[]) => void) {
  return onSnapshot(collection(db, 'adminSettings'), (snapshot) => {
    const list: AdminSetting[] = [];
    snapshot.forEach((doc) => {
      list.push(doc.data() as AdminSetting);
    });
    callback(list);
  }, (error) => {
    console.warn("Firestore adminSettings subscription info:", error.message);
  });
}

export async function saveFirestoreAdminSettingDoc(setting: AdminSetting) {
  try {
    await setDoc(doc(db, 'adminSettings', setting.id), cleanUndefined(setting));
  } catch (err) {
    console.warn("Firestore saveAdminSettingDoc error:", err);
  }
}

// ==========================================
// REAL-TIME FIRESTORE MILESTONES
// ==========================================

export function subscribeToFirestoreMilestones(callback: (data: Milestone[]) => void) {
  return onSnapshot(scopedCol('milestones'), (snapshot) => {
    const list: Milestone[] = [];
    snapshot.forEach((doc) => {
      list.push(normalizeCoupleId(doc.data() as Milestone));
    });
    callback(list);
  }, (error) => {
    console.warn("Firestore milestones subscription info:", error.message);
  });
}

export async function saveFirestoreMilestoneDoc(milestone: Milestone) {
  try {
    const payload = normalizeCoupleId(milestone);
    await setDoc(doc(db, 'milestones', milestone.id), cleanUndefined(payload));
  } catch (err) {
    console.warn("Firestore saveMilestoneDoc error:", err);
  }
}

export async function deleteFirestoreMilestoneDoc(id: string) {
  try {
    await deleteDoc(doc(db, 'milestones', id));
  } catch (err) {
    console.warn("Firestore deleteMilestoneDoc error:", err);
  }
}

// ==========================================
// REAL-TIME FIRESTORE DATE PLANS
// ==========================================

export function subscribeToFirestoreDatePlans(callback: (data: DatePlan[]) => void) {
  return onSnapshot(scopedCol('datePlans'), (snapshot) => {
    const list: DatePlan[] = [];
    snapshot.forEach((doc) => {
      list.push(normalizeCoupleId(doc.data() as DatePlan));
    });
    callback(list);
  }, (error) => {
    console.warn("Firestore datePlans subscription info:", error.message);
  });
}

export async function saveFirestoreDatePlanDoc(plan: DatePlan) {
  try {
    const payload = normalizeCoupleId(plan);
    await setDoc(doc(db, 'datePlans', plan.id), cleanUndefined(payload));
  } catch (err) {
    console.warn("Firestore saveDatePlanDoc error:", err);
  }
}

export async function deleteFirestoreDatePlanDoc(id: string) {
  try {
    await deleteDoc(doc(db, 'datePlans', id));
  } catch (err) {
    console.warn("Firestore deleteDatePlanDoc error:", err);
  }
}

// ==========================================
// REAL-TIME FIRESTORE MEMORIES
// ==========================================

export function subscribeToFirestoreMemories(callback: (data: Memory[]) => void) {
  return onSnapshot(scopedCol('memories'), (snapshot) => {
    const list: Memory[] = [];
    snapshot.forEach((doc) => {
      list.push(normalizeCoupleId(doc.data() as Memory));
    });
    callback(list);
  }, (error) => {
    console.warn("Firestore memories subscription info:", error.message);
  });
}

export async function saveFirestoreMemoryDoc(memory: Memory) {
  try {
    const payload = normalizeCoupleId(memory);
    await setDoc(doc(db, 'memories', memory.id), cleanUndefined(payload));
  } catch (err) {
    console.warn("Firestore saveMemoryDoc error:", err);
  }
}

export async function deleteFirestoreMemoryDoc(id: string) {
  try {
    await deleteDoc(doc(db, 'memories', id));
  } catch (err) {
    console.warn("Firestore deleteMemoryDoc error:", err);
  }
}

// ==========================================
// REAL-TIME FIRESTORE LOVE LETTERS
// ==========================================

export function subscribeToFirestoreLetters(callback: (data: LoveLetter[]) => void) {
  return onSnapshot(scopedCol('letters'), (snapshot) => {
    const list: LoveLetter[] = [];
    snapshot.forEach((doc) => {
      list.push(normalizeCoupleId(doc.data() as LoveLetter));
    });
    callback(list);
  }, (error) => {
    console.warn("Firestore letters subscription info:", error.message);
  });
}

export async function saveFirestoreLetterDoc(letter: LoveLetter) {
  try {
    const payload = normalizeCoupleId(letter);
    await setDoc(doc(db, 'letters', letter.id), cleanUndefined(payload));
  } catch (err) {
    console.warn("Firestore saveLetterDoc error:", err);
  }
}

export async function deleteFirestoreLetterDoc(id: string) {
  try {
    await deleteDoc(doc(db, 'letters', id));
  } catch (err) {
    console.warn("Firestore deleteLetterDoc error:", err);
  }
}

// ==========================================
// REAL-TIME FIRESTORE COUPLE QUESTIONS
// ==========================================

export function subscribeToFirestoreCoupleQuestions(callback: (data: CoupleQuestion[]) => void) {
  return onSnapshot(scopedCol('coupleQuestions'), (snapshot) => {
    const list: CoupleQuestion[] = [];
    snapshot.forEach((doc) => {
      list.push(normalizeCoupleId(doc.data() as CoupleQuestion));
    });
    callback(list);
  }, (error) => {
    console.warn("Firestore coupleQuestions subscription info:", error.message);
  });
}

export async function saveFirestoreCoupleQuestionDoc(question: CoupleQuestion) {
  try {
    const payload = normalizeCoupleId(question);
    await setDoc(doc(db, 'coupleQuestions', question.id), cleanUndefined(payload));
  } catch (err) {
    console.warn("Firestore saveCoupleQuestionDoc error:", err);
  }
}

export async function deleteFirestoreCoupleQuestionDoc(id: string) {
  try {
    await deleteDoc(doc(db, 'coupleQuestions', id));
  } catch (err) {
    console.warn("Firestore deleteCoupleQuestionDoc error:", err);
  }
}

export async function getFirestoreMilestones(): Promise<Milestone[]> {
  try {
    const snapshot = await getDocs(scopedCol('milestones'));
    const list: Milestone[] = [];
    snapshot.forEach(d => list.push(normalizeCoupleId(d.data() as Milestone)));
    return list;
  } catch (err) {
    console.warn("Failed to fetch Firestore milestones:", err);
    return [];
  }
}

export async function getFirestoreDatePlans(): Promise<DatePlan[]> {
  try {
    const snapshot = await getDocs(scopedCol('datePlans'));
    const list: DatePlan[] = [];
    snapshot.forEach(d => list.push(normalizeCoupleId(d.data() as DatePlan)));
    return list;
  } catch (err) {
    console.warn("Failed to fetch Firestore datePlans:", err);
    return [];
  }
}

export async function getFirestoreMemories(): Promise<Memory[]> {
  try {
    const snapshot = await getDocs(scopedCol('memories'));
    const list: Memory[] = [];
    snapshot.forEach(d => list.push(normalizeCoupleId(d.data() as Memory)));
    return list;
  } catch (err) {
    console.warn("Failed to fetch Firestore memories:", err);
    return [];
  }
}

export async function getFirestoreLetters(): Promise<LoveLetter[]> {
  try {
    const snapshot = await getDocs(scopedCol('letters'));
    const list: LoveLetter[] = [];
    snapshot.forEach(d => list.push(normalizeCoupleId(d.data() as LoveLetter)));
    return list;
  } catch (err) {
    console.warn("Failed to fetch Firestore letters:", err);
    return [];
  }
}

export async function getFirestoreCoupleQuestions(): Promise<CoupleQuestion[]> {
  try {
    const snapshot = await getDocs(scopedCol('coupleQuestions'));
    const list: CoupleQuestion[] = [];
    snapshot.forEach(d => list.push(normalizeCoupleId(d.data() as CoupleQuestion)));
    return list;
  } catch (err) {
    console.warn("Failed to fetch Firestore coupleQuestions:", err);
    return [];
  }
}

export async function getFirestoreUserAccounts(): Promise<UserAccount[]> {
  try {
    const snapshot = await getDocs(collection(db, 'userAccounts'));
    const list: UserAccount[] = [];
    snapshot.forEach(d => list.push(normalizeCoupleId(d.data() as UserAccount)));
    return list;
  } catch (err) {
    console.warn("Failed to fetch Firestore userAccounts:", err);
    return [];
  }
}

export async function getFirestoreCoupleTenants(): Promise<CoupleTenant[]> {
  try {
    const snapshot = await getDocs(collection(db, 'coupleTenants'));
    const list: CoupleTenant[] = [];
    snapshot.forEach(d => list.push(d.data() as CoupleTenant));
    return list;
  } catch (err) {
    console.warn("Failed to fetch Firestore coupleTenants:", err);
    return [];
  }
}

export async function getFirestoreChatMessages(): Promise<ChatMessage[]> {
  try {
    const snapshot = await getDocs(scopedCol('chatMessages'));
    const list: ChatMessage[] = [];
    snapshot.forEach(d => list.push(normalizeCoupleId(d.data() as ChatMessage)));
    return list;
  } catch (err) {
    console.warn("Failed to fetch Firestore chatMessages:", err);
    return [];
  }
}

// ==========================================
// REAL-TIME FIRESTORE CELEBRATION CARDS (CHOOSE CARD)
// ==========================================

export function subscribeToFirestoreCelebrationCards(callback: (data: CelebrationCard[]) => void) {
  return onSnapshot(scopedCol('celebrationCards'), (snapshot) => {
    const list: CelebrationCard[] = [];
    snapshot.forEach((doc) => {
      const card = normalizeCoupleId(doc.data() as CelebrationCard);
      if (card && card.id && !card.id.startsWith('default-card-') && !card.id.startsWith('default-')) {
        list.push(card);
      }
    });
    callback(list);
  }, (error) => {
    console.warn("Firestore celebrationCards subscription info:", error.message);
  });
}

export async function saveFirestoreCelebrationCardDoc(card: CelebrationCard) {
  try {
    const payload = normalizeCoupleId(card);
    await setDoc(doc(db, 'celebrationCards', card.id), cleanUndefined(payload));
  } catch (err) {
    console.warn("Firestore saveCelebrationCardDoc error:", err);
  }
}

export async function deleteFirestoreCelebrationCardDoc(id: string) {
  try {
    await deleteDoc(doc(db, 'celebrationCards', id));
  } catch (err) {
    console.warn("Firestore deleteCelebrationCardDoc error:", err);
  }
}

export async function getFirestoreCelebrationCards(): Promise<CelebrationCard[]> {
  try {
    const snapshot = await getDocs(scopedCol('celebrationCards'));
    const list: CelebrationCard[] = [];
    snapshot.forEach((d) => {
      const card = normalizeCoupleId(d.data() as CelebrationCard);
      if (card && card.id && !card.id.startsWith('default-card-') && !card.id.startsWith('default-')) {
        list.push(card);
      }
    });
    return list;
  } catch (err) {
    console.warn("Failed to fetch Firestore celebrationCards:", err);
    return [];
  }
}

// ==========================================
// REAL-TIME FIRESTORE MUSIC TRACKS (JUKEBOX)
// ==========================================

export function subscribeToFirestoreMusicTracks(
  callback: (data: MusicTrack[]) => void, 
  coupleId?: string, 
  userId?: string
) {
  return onSnapshot(scopedCol('musicTracks'), (snapshot) => {
    const list: MusicTrack[] = [];
    snapshot.forEach((doc) => {
      const track = normalizeCoupleId(doc.data() as MusicTrack);
      if (track && track.id) {
        // Enforce coupleId boundary: only return tracks for this couple space
        if (coupleId) {
          const trackCouple = track.coupleId || (track as any).couple_id;
          if (trackCouple !== coupleId) {
            return;
          }
        }
        // If specific userId filtering requested
        if (userId && userId !== 'all') {
          const trackUser = track.userId || track.uploadedBy;
          if (trackUser !== userId) {
            return;
          }
        }
        list.push(track);
      }
    });
    callback(list);
  }, (error) => {
    handleFirestoreError(error, OperationType.GET, 'musicTracks');
  });
}

export async function saveFirestoreMusicTrackDoc(track: MusicTrack) {
  try {
    const payload = normalizeCoupleId(track);
    await setDoc(doc(db, 'musicTracks', track.id), cleanUndefined(payload));
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `musicTracks/${track.id}`);
  }
}

export async function deleteFirestoreMusicTrackDoc(id: string) {
  try {
    await deleteDoc(doc(db, 'musicTracks', id));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `musicTracks/${id}`);
  }
}

export async function getFirestoreMusicTracks(coupleId?: string, userId?: string): Promise<MusicTrack[]> {
  try {
    const snapshot = await getDocs(scopedCol('musicTracks'));
    const list: MusicTrack[] = [];
    snapshot.forEach((d) => {
      const track = normalizeCoupleId(d.data() as MusicTrack);
      if (track && track.id) {
        if (coupleId) {
          const trackCouple = track.coupleId || (track as any).couple_id;
          if (trackCouple !== coupleId) return;
        }
        if (userId && userId !== 'all') {
          const trackUser = track.userId || track.uploadedBy;
          if (trackUser !== userId) return;
        }
        list.push(track);
      }
    });
    return list;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, 'musicTracks');
    return [];
  }
}


