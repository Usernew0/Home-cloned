export type MilestoneCategory = 'birthday' | 'engagement' | 'anniversary' | 'other';

export type SubscriptionTier = string;

export interface CoupleTenant {
  coupleId: string;
  coupleName: string;
  partner1: string;
  partner2: string;
  plan: SubscriptionTier;
  stripeSubscriptionId?: string;
  subscriptionEndDate?: string;
  smsEnabled?: boolean;
  phoneNumber1?: string;
  phoneNumber2?: string;
  smsDailyTime?: string;
  smsAnniversaries?: boolean;
  pushNotificationsEnabled?: boolean;
  animationSongTitle?: string;
  animationSongLink?: string;
  created_at?: string;
}

export interface Milestone {
  id: string;
  coupleId?: string;
  category: MilestoneCategory;
  title: string;
  date: string; // YYYY-MM-DD
  description: string;
  sweetMessage: string;
  photos: string[]; // Base64 data URLs
  videoUrl?: string; // Base64 or object URL or placeholder
  loveNotes?: string[];
  themeColor: string; // Tailwind class name or custom hex
  password?: string;
  createdBy?: string;
  archived?: boolean;
}

export interface DatePlan {
  id: string;
  coupleId?: string;
  title: string;
  category: 'dinner' | 'adventure' | 'home' | 'budget' | 'other';
  occasion?: 'first_date' | 'anniversary' | 'birthday' | 'surprise' | 'double_date' | 'casual' | 'other';
  theme?: string;
  dateTime: string;
  location: string;
  description: string;
  checklist: { id: string; text: string; completed: boolean }[];
  notes?: string;
  status: 'planned' | 'completed' | 'cancelled';
  createdBy?: string;
  isAiGenerated?: boolean;
}

export interface Memory {
  id: string;
  coupleId?: string;
  title: string;
  type: 'image' | 'video' | 'audio';
  url: string; // Base64 data URL or beautiful fallback image URL
  description: string;
  date: string;
  category: MilestoneCategory;
  createdBy?: string;
  isProAsset?: boolean;
}

export interface LoveLetter {
  id: string;
  coupleId?: string;
  sender: string;
  recipient: string;
  subject: string;
  content: string;
  template: 'classic' | 'playful' | 'deep';
  isOpened: boolean;
  date: string;
  createdBy?: string;
  audioCapsuleUrl?: string;
  videoCapsuleUrl?: string;
}

export interface ChatMessage {
  id: string;
  coupleId?: string;
  sender: string;
  /** Permanent participant ids (server-minted); privacy is decided on these, never on the username strings. */
  senderId?: string;
  /** Global/group messages carry the author's permanent id here (never senderId/receiverId, which mark private 1:1 rows). */
  authorId?: string;
  receiverId?: string;
  receiver?: string;
  conversationId?: string;
  content: string;
  timestamp: string; // ISO String
  replyTo?: {
    id: string;
    sender: string;
    content: string;
  };
  reaction?: string;
  audioUrl?: string;
  audioDuration?: number;
  imageUrl?: string;
  pinned?: boolean;
  pinnedAt?: string;
  pinnedBy?: string;
  seen?: boolean;
  seenBy?: string[]; // Array of usernames who have seen this message
  seenByTime?: Record<string, string>; // Map of username -> ISO string when seen
  isSystem?: boolean;
}

export interface UserPresence {
  username: string;
  coupleId?: string; // tenant scope so partners see each other's presence without a global read
  lastActive: string; // ISO string
  lastReadChatTime?: number;
  typingIn?: string | null;
  typingAt?: string | null;
}

export interface ChatGroup {
  id: string; // e.g. "group_1722334455"
  name: string;
  description?: string;
  avatarUrl?: string;
  createdBy: string;
  createdAt: string;
  members: string[]; // usernames
  pendingMembers?: string[]; // array of usernames with pending group invitations
  admins?: string[]; // array of admin usernames
  onlyAdminsCanEditInfo?: boolean; // Restrict group name/description/avatar edits to admins
  onlyAdminsCanSend?: boolean; // Restrict message sending to admins (announcement mode)
  onlyAdminsCanAddMembers?: boolean; // Restrict adding new members to admins
  mutedBy?: string[]; // usernames who muted notifications for this group
  inviteCode?: string; // unique invite code for quick join
  isInviteLinkEnabled?: boolean; // Control whether joining via invite code/link is active (default true)
  historyVisibleToNewMembers?: boolean; // Admin-controlled setting to show or hide older history to new members
  memberJoinedAt?: Record<string, string>; // Map of lowercase username to ISO date string of when they joined
  memberCanSeePastHistory?: Record<string, boolean>; // Per-member snapshot of whether older messages were visible when they joined
  pinnedMessageId?: string; // ID of pinned message in group
}

export interface DateIdea {
  id: string;
  title: string;
  category: 'dinner' | 'adventure' | 'home' | 'budget' | 'other';
  occasion?: 'first_date' | 'anniversary' | 'birthday' | 'surprise' | 'double_date' | 'casual' | 'other';
  theme?: string;
  description: string;
  duration: string;
  cost: '$' | '$$' | '$$$' | 'Free';
  activity: string;
}

export interface CoupleQuestionAnswer {
  username: string;
  answerText: string;
  timestamp: string;
  reaction?: string;
}

export interface CoupleQuestion {
  id: string;
  coupleId?: string;
  text: string;
  category: 'romance' | 'playful' | 'future' | 'memories' | 'custom';
  createdAt: string;
  createdBy?: string;
  isSystemPreset?: boolean;
  answers: CoupleQuestionAnswer[];
}

export interface UserAccount {
  id: string;
  coupleId?: string;
  username: string;
  password?: string;
  role?: string;
  gender?: 'male' | 'female' | 'other' | string;
  partnerUsername?: string;
  plan?: string;
  visibleTabs?: { [tabId: string]: boolean };
  enableGlobalChat?: boolean;
  twoFactorEnabled?: boolean;
  twoFactorSecret?: string;
  twoFactorBackupCodes?: string[];
  twoFactorCreatedAt?: string;
  telegramUsername?: string;
  telegramChatId?: string;
}

export interface AdminAccount {
  id: string;
  username: string;
  password?: string;
  role?: string;
  createdAt?: string;
  lastLogin?: string;
  notes?: string;
  twoFactorEnabled?: boolean;
  twoFactorSecret?: string;
  twoFactorBackupCodes?: string[];
  twoFactorCreatedAt?: string;
}

export interface TabLimitation {
  maxLimit?: number; // e.g., 10 for Free, -1 for Unlimited
  isLocked?: boolean; // true if tab is completely locked for this tier
  description?: string;
}

export interface SubscriptionPlan {
  id: string; // 'free' | 'pro' | custom ID
  name: string; // e.g. 'Free Tier', 'Pro Lover Plan'
  price: string; // e.g. '$0/month', '$4.99/month'
  badgeColor?: string; // e.g. 'emerald', 'amber', 'pink', 'purple', 'indigo'
  description: string;
  durationDays?: number; // Validity period in days: -1 for lifetime/unlimited, 30 for monthly, 365 for annual, or custom
  billingCycle?: 'monthly' | 'annual' | 'custom' | 'lifetime';
  isDefault?: boolean;
  tabLimits: {
    [tabId: string]: TabLimitation;
  };
}

export const DEFAULT_SUBSCRIPTION_PLANS: SubscriptionPlan[] = [];

export interface PromoCode {
  id: string; // unique ID or code e.g. "LOVE50"
  code: string; // Uppercase coupon code string
  discountType: 'percentage' | 'fixed'; // 'percentage' (e.g. 50%) or 'fixed' (e.g. $2.00 off)
  discountValue: number; // e.g. 50 or 2.00
  applicablePlanIds?: string[]; // e.g. ['all'] or specific plan IDs like ['pro']
  maxUses?: number; // -1 for unlimited
  timesUsed?: number; // Counter of redemptions
  expiresAt?: string; // YYYY-MM-DD or ISO string, empty if never
  isActive: boolean; // toggle active/inactive status
  description?: string;
  createdAt?: string;
}

export const DEFAULT_PROMO_CODES: PromoCode[] = [
  {
    id: 'LOVE50',
    code: 'LOVE50',
    discountType: 'percentage',
    discountValue: 50,
    applicablePlanIds: ['all'],
    maxUses: -1,
    timesUsed: 0,
    expiresAt: '',
    isActive: true,
    description: '50% off romantic discount on any subscription tier',
    createdAt: new Date().toISOString()
  },
  {
    id: 'PROMO50',
    code: 'PROMO50',
    discountType: 'percentage',
    discountValue: 50,
    applicablePlanIds: ['pro'],
    maxUses: 100,
    timesUsed: 12,
    expiresAt: '',
    isActive: true,
    description: '50% off Pro Plan subscription',
    createdAt: new Date().toISOString()
  },
  {
    id: 'VALENTINE100',
    code: 'VALENTINE100',
    discountType: 'percentage',
    discountValue: 100,
    applicablePlanIds: ['all'],
    maxUses: 50,
    timesUsed: 5,
    expiresAt: '',
    isActive: true,
    description: '100% FREE VIP subscription access',
    createdAt: new Date().toISOString()
  }
];

export interface CountdownConfig {
  enabled: boolean;
  mode: 'milestone' | 'custom' | 'auto_nearest';
  featuredMilestoneId?: string;
  customTitle?: string;
  customDate?: string; // YYYY-MM-DD or YYYY-MM-DDTHH:mm
  customCategory?: MilestoneCategory;
  customCelebrationMessage?: string;
  allowedCategories?: MilestoneCategory[]; // ['anniversary', 'birthday', 'engagement', 'other']
  showFlipSeconds?: boolean;
}

export const DEFAULT_COUNTDOWN_CONFIG: CountdownConfig = {
  enabled: true,
  mode: 'auto_nearest',
  featuredMilestoneId: '',
  customTitle: '',
  customDate: '',
  customCategory: 'anniversary',
  customCelebrationMessage: '🎉 Happy Anniversary & Special Day, My Love! 🎉',
  allowedCategories: ['anniversary', 'engagement', 'birthday', 'other'],
  showFlipSeconds: true
};

export interface MilestoneQuotas {
  maxTotalMilestones?: number; // -1 for unlimited, or numeric e.g. 10
  maxAnniversaries?: number;
  maxBirthdays?: number;
  maxOtherMilestones?: number;
}

export const DEFAULT_MILESTONE_QUOTAS: MilestoneQuotas = {
  maxTotalMilestones: -1,
  maxAnniversaries: -1,
  maxBirthdays: -1,
  maxOtherMilestones: -1
};

export interface TelegramCapturedSender {
  chatId: string;
  username: string; // e.g. '@ebrahimayman' or ''
  firstName: string;
  lastName?: string;
  text: string;
  date: number;
  timestamp: string;
  isConfirmedCommand?: boolean;
}

export interface TelegramAuthorizedUser {
  id: string;
  telegramUsername: string; // e.g. '@ebrahimayman'
  chatId?: string; // numeric chat ID
  appUsername?: string; // e.g. 'mariem' or 'ebrahim'
  coupleId?: string; // specific couple space partition
  confirmed: boolean; // true once user has confirmed via the bot
  confirmedAt?: string;
  lastNotifiedAt?: string;
  isActive: boolean; // toggle delivery for this specific user
  role?: 'partner' | 'admin' | 'guest';
}

export interface TelegramAlertOptions {
  coupleId?: string; // Scopes delivery to partners of this couple space
  targetUsername?: string; // Delivers specifically to this single user account / telegram handle
  excludeUsername?: string; // Excludes sender from receiving their own alert (e.g. sender of chat or letter)
  adminSettings?: AdminSetting[];
  customConfig?: TelegramConfig;
  userAccounts?: UserAccount[];
}


export interface TelegramConfig {
  botToken: string;
  chatId: string;
  enabled: boolean;
  notifyMilestones: boolean;
  notifyDates: boolean;
  notifyChat: boolean;
  notifyLetters: boolean;
  notifySecurity: boolean;
  notifyCards?: boolean;
  lastTestedAt?: string;
  whitelistedUsernames?: string[]; // e.g. ['@ebrahimayman', '@mariem']
  authorizedUsers?: TelegramAuthorizedUser[]; // Multi-user confirmed access registry
  capturedSenders?: TelegramCapturedSender[]; // Recent senders & messages detected from bot
  autoSyncProfiles?: boolean; // automatically sync telegram usernames from user profiles into whitelist
  webhookUrl?: string; // e.g. https://domain.vercel.app/api/telegram/webhook
  webhookEnabled?: boolean;
  webhookLastCheckedAt?: string;
  webhookStatusMessage?: string;
}

export const DEFAULT_TELEGRAM_CONFIG: TelegramConfig = {
  botToken: '',
  chatId: '',
  enabled: false,
  notifyMilestones: true,
  notifyDates: true,
  notifyChat: true,
  notifyLetters: true,
  notifySecurity: true,
  notifyCards: true,
  whitelistedUsernames: [],
  authorizedUsers: [],
  capturedSenders: [],
  autoSyncProfiles: true,
  webhookUrl: '',
  webhookEnabled: false
};


export interface AdminSetting {
  id: string;
  password?: string;
  username?: string;
  adminAccounts?: AdminAccount[];
  visibleTabs?: { [tabId: string]: boolean };
  subscriptionPlans?: SubscriptionPlan[];
  promoCodes?: PromoCode[];
  favicon?: string;
  autoLogoutMinutes?: number;
  autoLogoutEnabled?: boolean;
  loginLockoutSeconds?: number;
  loginMaxAttempts?: number;
  countdownConfig?: CountdownConfig;
  milestoneQuotas?: MilestoneQuotas;
  telegramConfig?: TelegramConfig;
  twoFactorEnabled?: boolean;
  twoFactorSecret?: string;
  twoFactorBackupCodes?: string[];
  twoFactorCreatedAt?: string;
  globalMusicTracks?: MusicTrack[];
}

export interface UserActivityLog {
  id: string;
  coupleId?: string;
  username: string;
  action: string;
  details: string;
  timestamp: string;
}

export const APP_TABS = [
  { id: 'dashboard', label: 'Home', desc: 'Main couple dashboard' },
  { id: 'choose', label: 'Choose Moment', desc: 'Interactive decision spinner' },
  { id: 'milestones', label: 'Our Story', desc: 'Relationship timeline & milestones' },
  { id: 'planner', label: 'Date Planner', desc: 'Romantic date plans & AI itineraries' },
  { id: 'album', label: 'Our Scrapbook', desc: 'Shared photos & video vault' },
  { id: 'gallery', label: 'Gallery', desc: 'Unified media gallery for Milestones, Scrapbook & Chat photos' },
  { id: 'letters', label: 'Love Letters', desc: 'Time capsule love notes' },
  { id: 'chat', label: 'Sweet Chat', desc: 'Real-time private messaging' },
  { id: 'questions', label: 'Couples Q&A', desc: 'Daily romantic questions' },
  { id: 'animation', label: 'Heart FX', desc: 'Romantic interactive canvas' },
  { id: 'music', label: 'Soundtrack & MP3s', desc: 'Couple music lounge, MP3 player & audio uploads' },
] as const;

export interface MusicTrack {
  id: string;
  coupleId?: string;
  userId?: string;
  title: string;
  artist?: string;
  url: string; // File URL path (e.g. /audio/uploads/...) or data URL / blob URL
  duration?: string;
  category?: 'romantic' | 'celebration' | 'birthday' | 'slow_dance' | 'memory' | 'other';
  dedication?: string;
  uploadedBy?: string;
  fileName?: string;
  fileSize?: string;
  isPreset?: boolean;
  createdAt: string;
}

export type CelebrationCardType = 'birthday' | 'engagement' | 'fireworks' | 'anniversary' | 'custom';

export interface CelebrationCardPhoto {
  id?: string;
  src: string; // URL / Base64 from Gallery or direct upload
  caption: string;
  sourceItemTitle?: string;
}

export interface CelebrationCard {
  id: string;
  coupleId?: string;
  userId?: string;
  createdBy?: string;
  type: CelebrationCardType;
  title: string;
  partnerName?: string;
  targetDate: string; // YYYY-MM-DD
  originalDate?: string; // YYYY-MM-DD
  age?: number;
  photos: CelebrationCardPhoto[];
  letter: string;
  password?: string;
  musicUrl?: string;
  themeColor?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface GalleryAlbum {
  id: string;
  coupleId?: string;
  name: string;
  description?: string;
  coverUrl?: string;
  photoIds: string[]; // List of gallery item IDs included in this album
  isDefault?: boolean; // Default "Total Photos" album
  createdBy?: string;
  createdAt: string;
  updatedAt?: string;
}
