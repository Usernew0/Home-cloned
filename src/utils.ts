import { Milestone, DatePlan, Memory, LoveLetter, DateIdea, ChatMessage, CoupleQuestion, UserAccount, AdminSetting, UserActivityLog, CoupleTenant, CelebrationCard, CelebrationCardType, GalleryAlbum, MusicTrack } from './types';

// Pre-seeded milestones
export const PRE_SEEDED_MILESTONES: Milestone[] = [];

export const DEFAULT_CELEBRATION_CARDS: CelebrationCard[] = [];

export const DEFAULT_MUSIC_TRACKS: MusicTrack[] = [
  {
    id: 'preset-hamaki-odam-el-nas',
    title: 'قدام الناس (Odam El Nas)',
    artist: 'Mohamed Hamaki (محمد حماقي)',
    url: '/choose/music/odamelnas-hamaki.mp3',
    duration: '3:45',
    category: 'romantic',
    dedication: 'Our beautiful engagement & love anthem 💍💖',
    isPreset: true,
    createdAt: '2026-01-01T00:00:00.000Z'
  },
  {
    id: 'preset-habibi-da',
    title: 'حبيبي دا (كله قالي اشمعنا هو)',
    artist: 'Amr Gaber (عمرو جابر)',
    url: '/audio/Habibi Da - Amr Gaber  عمرو جابر - حبيبي دا (كله قالي اشمعنا هو).mp3',
    duration: '3:20',
    category: 'romantic',
    dedication: 'My heart chooses only you, always and forever 🤍',
    isPreset: true,
    createdAt: '2026-01-01T00:00:00.000Z'
  },
  {
    id: 'preset-birthday-song',
    title: 'Happy Birthday Celebration Anthem',
    artist: 'Sweet Birthday Beats',
    url: '/choose/music/birthdaysong.mp3',
    duration: '2:15',
    category: 'celebration',
    dedication: 'Joyous celebration for birthdays & special moments 🎂🎉',
    isPreset: true,
    createdAt: '2026-01-01T00:00:00.000Z'
  }
];

// Pre-seeded date ideas
export const PRE_SEEDED_DATE_IDEAS: DateIdea[] = [
  {
    id: 'idea-1',
    title: 'Alexandrian Seafood Feast at Home',
    category: 'home',
    occasion: 'casual',
    theme: 'Cozy & Savory',
    description: 'Procure fresh, local Mediterranean fish, shrimp, and calamari from El-Halaka Fish Market in Anfoushi, and cook a delicious homemade Alexandrian sayadeya rice and seafood meal together. Light warm candles and play classic Fayrouz songs.',
    duration: '3 hours',
    cost: '$$',
    activity: 'Seafood cooking & candlelit dining'
  },
  {
    id: 'idea-2',
    title: 'Qaitbay Citadel & Sunset Corniche Stroll',
    category: 'adventure',
    occasion: 'first_date',
    theme: 'Historic & Scenic',
    description: 'Explore the spectacular medieval halls, tunnels, and sea-view watchtowers of the Citadel of Qaitbay together. Afterward, walk down the Corniche, enjoy warm roasted peanuts, and watch the waves crash against the ancient rock breakwaters.',
    duration: '2.5 hours',
    cost: '$',
    activity: 'Historic fort exploration & coastal walk'
  },
  {
    id: 'idea-3',
    title: 'Greek Club Seafood Fine Dining',
    category: 'dinner',
    occasion: 'anniversary',
    theme: 'Elegant & Breathtaking',
    description: 'Reserve a seafront window table at the Greek Club (White & Blue). Savor premium Mediterranean seafood with a breathtaking panoramic view of Alexandria’s Eastern Harbour, colorful fishing boats, and the illuminated Qaitbay Citadel.',
    duration: '3 hours',
    cost: '$$$',
    activity: 'Romantic fine dining over the waves'
  },
  {
    id: 'idea-4',
    title: 'Fouad Street Architecture & Book Hunting',
    category: 'budget',
    occasion: 'casual',
    theme: 'Retro & Nostalgic',
    description: 'Walk hand-in-hand down historic Fouad Street, admiring its French neo-classical villas and vintage charm. Browse for old books or magazines at Nabi Daniel Street open-air book stalls, then get warm mint tea at a cozy café.',
    duration: '2 hours',
    cost: '$',
    activity: 'Architectural walk & book finding'
  },
  {
    id: 'idea-5',
    title: 'Royal Gardens of Montazah Picnic',
    category: 'adventure',
    occasion: 'birthday',
    theme: 'Dreamy & Whimsical',
    description: 'Pack a cozy picnic blanket and gourmet treats, and head to Montazah Palace Gardens. Walk through the lush royal pine forests, cross the iconic red El-Montazah Bridge to Tea Island, and watch the sunset over private rocky coves.',
    duration: '3.5 hours',
    cost: '$$',
    activity: 'Royal gardens walk & sea-cove picnic'
  },
  {
    id: 'idea-6',
    title: 'Royal Jewelry Museum Treasure Hunt',
    category: 'adventure',
    occasion: 'surprise',
    theme: 'Aesthetic & Playful',
    description: 'Visit the highly photogenic Royal Jewelry Museum in Zizinia. Take a playful walk through the grand Italianate halls and stained-glass galleries, choosing your favorite royal crown, necklace, or treasure that you would hypothetically gift to each other.',
    duration: '2 hours',
    cost: '$$',
    activity: 'Museum stroll & playful treasure choosing'
  },
  {
    id: 'idea-7',
    title: 'Seafront Ice Cream & Stanley Bridge Sunset',
    category: 'budget',
    occasion: 'casual',
    theme: 'Sweet & Panoramic',
    description: 'Grab legendary Alexandrian ice cream from Azza or El-Saeedy in Gleem, then walk over the majestic Stanley Bridge towers to take gorgeous selfie photos with the open Mediterranean sea and sunset backdrop.',
    duration: '1.5 hours',
    cost: '$',
    activity: 'Sweet treating & scenic photo session'
  },
  {
    id: 'idea-8',
    title: 'San Giovanni Piano & Waves Dinner',
    category: 'dinner',
    occasion: 'anniversary',
    theme: 'Classic Grand Romance',
    description: 'Book a classic window table at the legendary San Giovanni Restaurant right above Stanley’s sea bay. Savor gourmet continental dining while a live pianist plays romantic tunes and the soothing sound of crashing waves fills the air.',
    duration: '3 hours',
    cost: '$$$',
    activity: 'Seaside piano dinner'
  }
];

// Pre-seeded memories
export const PRE_SEEDED_MEMORIES: Memory[] = [];

// Pre-seeded letters
export const PRE_SEEDED_LETTERS: LoveLetter[] = [];

// LocalStorage helpers with type safety
export const storage = {
  getMilestones: (): Milestone[] => {
    try {
      const data = localStorage.getItem('love_milestones_v4');
      if (!data) return [];
      const parsed = JSON.parse(data);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  },
  setMilestones: (data: Milestone[]) => {
    localStorage.setItem('love_milestones_v4', JSON.stringify(Array.isArray(data) ? data : []));
  },
  saveMilestones: (data: Milestone[]) => {
    localStorage.setItem('love_milestones_v4', JSON.stringify(Array.isArray(data) ? data : []));
  },

  getDatePlans: (): DatePlan[] => {
    try {
      const data = localStorage.getItem('love_date_plans');
      if (!data) return [];
      const parsed = JSON.parse(data);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  },
  setDatePlans: (data: DatePlan[]) => {
    localStorage.setItem('love_date_plans', JSON.stringify(Array.isArray(data) ? data : []));
  },
  saveDatePlans: (data: DatePlan[]) => {
    localStorage.setItem('love_date_plans', JSON.stringify(Array.isArray(data) ? data : []));
  },

  getMemories: (): Memory[] => {
    try {
      const data = localStorage.getItem('love_memories');
      if (!data) return [];
      const parsed = JSON.parse(data);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  },
  setMemories: (data: Memory[]) => {
    localStorage.setItem('love_memories', JSON.stringify(Array.isArray(data) ? data : []));
  },
  saveMemories: (data: Memory[]) => {
    localStorage.setItem('love_memories', JSON.stringify(Array.isArray(data) ? data : []));
  },

  getLetters: (): LoveLetter[] => {
    try {
      const data = localStorage.getItem('love_letters');
      if (!data) return [];
      const parsed = JSON.parse(data);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  },
  setLetters: (data: LoveLetter[]) => {
    localStorage.setItem('love_letters', JSON.stringify(Array.isArray(data) ? data : []));
  },
  saveLetters: (data: LoveLetter[]) => {
    localStorage.setItem('love_letters', JSON.stringify(Array.isArray(data) ? data : []));
  },

  getChatMessages: (): ChatMessage[] => {
    try {
      const data = localStorage.getItem('love_chat_messages');
      if (!data) return [];
      const parsed = JSON.parse(data);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  },
  setChatMessages: (data: ChatMessage[]) => {
    localStorage.setItem('love_chat_messages', JSON.stringify(Array.isArray(data) ? data : []));
  },

  getCoupleQuestions: (): CoupleQuestion[] => {
    try {
      const data = localStorage.getItem('love_couple_questions');
      if (!data) return [];
      const parsed = JSON.parse(data);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  },
  setCoupleQuestions: (data: CoupleQuestion[]) => {
    localStorage.setItem('love_couple_questions', JSON.stringify(Array.isArray(data) ? data : []));
  },

  getUserAccounts: (): UserAccount[] => {
    try {
      const data = localStorage.getItem('love_user_accounts');
      if (!data) return [];
      const parsed = JSON.parse(data);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  },
  setUserAccounts: (data: UserAccount[]) => {
    localStorage.setItem('love_user_accounts', JSON.stringify(Array.isArray(data) ? data : []));
  },

  getAdminSettings: (): AdminSetting[] => {
    try {
      const data = localStorage.getItem('love_admin_settings');
      if (!data) return [];
      const parsed = JSON.parse(data);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  },
  setAdminSettings: (data: AdminSetting[]) => {
    localStorage.setItem('love_admin_settings', JSON.stringify(Array.isArray(data) ? data : []));
  },

  getActivityLogs: (): UserActivityLog[] => {
    try {
      const data = localStorage.getItem('love_activity_logs');
      if (!data) return [];
      const parsed = JSON.parse(data);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  },
  setActivityLogs: (data: UserActivityLog[]) => {
    localStorage.setItem('love_activity_logs', JSON.stringify(Array.isArray(data) ? data : []));
  },

  getCoupleTenants: (): CoupleTenant[] => {
    try {
      const data = localStorage.getItem('love_couple_tenants');
      if (!data) return [];
      const parsed = JSON.parse(data);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  },
  setCoupleTenants: (data: CoupleTenant[]) => {
    localStorage.setItem('love_couple_tenants', JSON.stringify(Array.isArray(data) ? data : []));
  },

  getCelebrationCards: (coupleId?: string): CelebrationCard[] => {
    try {
      const data = localStorage.getItem('love_celebration_cards');
      if (!data) {
        localStorage.setItem('love_celebration_cards', JSON.stringify([]));
        return [];
      }
      const parsed = JSON.parse(data);
      const rawList: CelebrationCard[] = Array.isArray(parsed) ? parsed : [];
      // Automatically purge any default celebration cards (e.g. default-card-*)
      const list = rawList.filter(c => c && c.id && !c.id.startsWith('default-card-') && !c.id.startsWith('default-'));
      // Synchronize back to localStorage if default cards were purged
      if (list.length !== rawList.length) {
        localStorage.setItem('love_celebration_cards', JSON.stringify(list));
      }
      if (coupleId) {
        return list.filter(c => !c.coupleId || c.coupleId === coupleId);
      }
      return list;
    } catch {
      return [];
    }
  },
  setCelebrationCards: (data: CelebrationCard[]) => {
    localStorage.setItem('love_celebration_cards', JSON.stringify(Array.isArray(data) ? data : []));
  },
  saveCelebrationCards: (data: CelebrationCard[]) => {
    localStorage.setItem('love_celebration_cards', JSON.stringify(Array.isArray(data) ? data : []));
  },
  saveCelebrationCard: (card: CelebrationCard) => {
    try {
      const current = storage.getCelebrationCards();
      const filtered = current.filter(c => c && c.id && !c.id.startsWith('default-card-') && !c.id.startsWith('default-'));
      const idx = filtered.findIndex(c => c.id === card.id);
      let updated: CelebrationCard[];
      if (idx >= 0) {
        updated = [...filtered];
        updated[idx] = card;
      } else {
        updated = [card, ...filtered];
      }
      storage.saveCelebrationCards(updated);
    } catch {
      // safe fallback
    }
  },
  deleteCelebrationCard: (id: string) => {
    try {
      const current = storage.getCelebrationCards();
      const updated = current.filter(c => c.id !== id && !c.id.startsWith('default-card-') && !c.id.startsWith('default-'));
      storage.saveCelebrationCards(updated);
    } catch {
      // safe fallback
    }
  },

  getGalleryAlbums: (coupleId?: string): GalleryAlbum[] => {
    try {
      const data = localStorage.getItem('love_gallery_albums');
      let list: GalleryAlbum[] = [];
      if (data) {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed)) list = parsed;
      }
      
      const defaultAlbum: GalleryAlbum = {
        id: 'default-total-photos',
        name: 'Total Photos',
        description: 'All photos and media across your shared relationship vault',
        photoIds: [],
        isDefault: true,
        createdAt: '2026-01-01T00:00:00.000Z',
        coupleId: coupleId || undefined
      };

      const hasDefault = list.some(a => a.isDefault || a.id === 'default-total-photos');
      if (!hasDefault) {
        list = [defaultAlbum, ...list];
        localStorage.setItem('love_gallery_albums', JSON.stringify(list));
      } else {
        list = list.map(a => (a.isDefault || a.id === 'default-total-photos') ? { ...defaultAlbum, ...a, name: 'Total Photos', isDefault: true } : a);
      }

      if (coupleId) {
        return list.filter(a => !a.coupleId || a.coupleId === coupleId);
      }
      return list;
    } catch {
      return [{
        id: 'default-total-photos',
        name: 'Total Photos',
        description: 'All photos and media across your shared relationship vault',
        photoIds: [],
        isDefault: true,
        createdAt: '2026-01-01T00:00:00.000Z'
      }];
    }
  },
  saveGalleryAlbums: (data: GalleryAlbum[]) => {
    const list = Array.isArray(data) ? data : [];
    const defaultAlbum: GalleryAlbum = {
      id: 'default-total-photos',
      name: 'Total Photos',
      description: 'All photos and media across your shared relationship vault',
      photoIds: [],
      isDefault: true,
      createdAt: '2026-01-01T00:00:00.000Z'
    };
    const hasDefault = list.some(a => a.isDefault || a.id === 'default-total-photos');
    const finalList = hasDefault ? list : [defaultAlbum, ...list];
    localStorage.setItem('love_gallery_albums', JSON.stringify(finalList));
  },

  getGlobalMusicTracks: (): MusicTrack[] => {
    try {
      const stored = localStorage.getItem('love_global_music_tracks');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch {}
    return DEFAULT_MUSIC_TRACKS;
  },

  saveGlobalMusicTracks: (tracks: MusicTrack[]) => {
    try {
      localStorage.setItem('love_global_music_tracks', JSON.stringify(tracks));
    } catch (e) {
      console.warn("Failed to save global music tracks locally:", e);
    }
  },

  getMusicTracks: (coupleId?: string, userId?: string): MusicTrack[] => {
    try {
      // 1. Check couple-scoped local storage if coupleId is provided
      const coupleKey = coupleId ? `love_custom_music_tracks_${coupleId}` : 'love_custom_music_tracks';
      const scopedData = localStorage.getItem(coupleKey);
      let customTracks: MusicTrack[] = [];
      if (scopedData) {
        const parsed = JSON.parse(scopedData);
        if (Array.isArray(parsed)) customTracks = parsed;
      } else {
        // Fallback: check legacy shared storage and filter to this couple
        const legacyData = localStorage.getItem('love_custom_music_tracks');
        if (legacyData) {
          const parsed = JSON.parse(legacyData);
          if (Array.isArray(parsed)) {
            customTracks = parsed.filter(t => !coupleId || t.coupleId === coupleId);
            if (coupleId && customTracks.length > 0) {
              localStorage.setItem(coupleKey, JSON.stringify(customTracks));
            }
          }
        }
      }
      
      const globalPresets = storage.getGlobalMusicTracks();
      const all = [...globalPresets, ...customTracks];
      return all.filter(t => {
        // Presets are always accessible unless explicitly filtering by user uploads only
        if (t.isPreset) {
          return !userId || userId === 'all';
        }
        // Custom tracks MUST belong to this coupleId
        if (coupleId && t.coupleId && t.coupleId !== coupleId) {
          return false;
        }
        // If userId is provided for user-specific filtering
        if (userId && userId !== 'all') {
          return t.userId === userId || t.uploadedBy === userId;
        }
        return true;
      });
    } catch {
      return storage.getGlobalMusicTracks();
    }
  },
  saveMusicTracks: (data: MusicTrack[], coupleId?: string) => {
    try {
      const customs = (Array.isArray(data) ? data : []).filter(t => !t.isPreset);
      if (coupleId) {
        localStorage.setItem(`love_custom_music_tracks_${coupleId}`, JSON.stringify(customs));
      } else {
        localStorage.setItem('love_custom_music_tracks', JSON.stringify(customs));
      }
    } catch {
      // safe fallback
    }
  },
  saveMusicTrack: (track: MusicTrack, coupleId?: string) => {
    try {
      const targetCouple = coupleId || track.coupleId;
      const current = storage.getMusicTracks(targetCouple);
      const customs = current.filter(t => !t.isPreset);
      const idx = customs.findIndex(t => t.id === track.id);
      let updated: MusicTrack[];
      if (idx >= 0) {
        updated = [...customs];
        updated[idx] = track;
      } else {
        updated = [track, ...customs];
      }
      storage.saveMusicTracks(updated, targetCouple);
    } catch {
      // safe fallback
    }
  },
  deleteMusicTrack: (id: string, coupleId?: string) => {
    try {
      const current = storage.getMusicTracks(coupleId);
      const updated = current.filter(t => !t.isPreset && t.id !== id);
      storage.saveMusicTracks(updated, coupleId);
    } catch {
      // safe fallback
    }
  }
};

/**
 * Egypt Cairo Timezone Helper Functions
 */

// Parses a date-time string as an absolute Date object, assuming the input was entered in Egypt (Africa/Cairo) local time
export const parseEventDateInEgypt = (dateStr: string): Date => {
  if (!dateStr) return new Date();

  // If the date string has a timezone offset already (ends with Z or +/- offset), parse it natively
  if (dateStr.includes('Z') || /[-+]\d{2}:\d{2}$/.test(dateStr)) {
    return new Date(dateStr);
  }

  let year = 2026, month = 0, day = 1, hours = 0, minutes = 0, seconds = 0;

  const hasT = dateStr.includes('T');
  const datePart = hasT ? dateStr.split('T')[0] : dateStr;
  const timePart = hasT ? dateStr.split('T')[1] : '';

  const dateParts = datePart.split('-');
  if (dateParts.length === 3) {
    year = parseInt(dateParts[0], 10);
    month = parseInt(dateParts[1], 10) - 1; // 0-indexed
    day = parseInt(dateParts[2], 10);
  } else {
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? new Date() : d;
  }

  if (timePart) {
    const timeParts = timePart.split(':');
    if (timeParts.length >= 2) {
      hours = parseInt(timeParts[0], 10);
      minutes = parseInt(timeParts[1], 10);
      if (timeParts.length >= 3) {
        seconds = parseInt(timeParts[2], 10);
      }
    }
  }

  try {
    // Construct a UTC date roughly around that time to query the timezone formatter
    const testDate = new Date(Date.UTC(year, month, day, hours, minutes, seconds));
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Africa/Cairo',
      year: 'numeric', month: 'numeric', day: 'numeric',
      hour: 'numeric', minute: 'numeric', second: 'numeric',
      hour12: false
    });

    const parts = formatter.formatToParts(testDate);
    const getPart = (type: string) => parseInt(parts.find(p => p.type === type)?.value || '0', 10);

    const fYear = getPart('year');
    const fMonth = getPart('month') - 1;
    const fDay = getPart('day');
    const fHour = getPart('hour') === 24 ? 0 : getPart('hour'); // handle 24:00 formatting
    const fMin = getPart('minute');
    const fSec = getPart('second');

    const formattedDateUTC = Date.UTC(fYear, fMonth, fDay, fHour, fMin, fSec);
    const offsetMs = testDate.getTime() - formattedDateUTC;

    const targetUTC = Date.UTC(year, month, day, hours, minutes, seconds);
    return new Date(targetUTC + offsetMs);
  } catch (e) {
    console.warn("Intl timezone parsing failed, falling back to local offset:", e);
    return new Date(year, month, day, hours, minutes, seconds);
  }
};

// Formats any date into a beautiful, human-readable string in Egypt (Africa/Cairo) timezone
export const formatMilestoneDateInEgypt = (dateStr: string): string => {
  if (!dateStr) return '';
  const d = parseEventDateInEgypt(dateStr);

  const hasTime = dateStr.includes('T') || dateStr.includes(':');
  if (hasTime) {
    return d.toLocaleString('en-US', {
      timeZone: 'Africa/Cairo',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  }

  return d.toLocaleDateString('en-US', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
};

// Formats the current time in Egypt timezone for the live dashboard clock
export const getEgyptTimeString = (): { date: string; time: string; period: string } => {
  const now = new Date();
  try {
    const timeOptions: Intl.DateTimeFormatOptions = {
      timeZone: 'Africa/Cairo',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    };
    const dateOptions: Intl.DateTimeFormatOptions = {
      timeZone: 'Africa/Cairo',
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    };

    const timeStr = new Intl.DateTimeFormat('en-US', timeOptions).format(now); // e.g. "02:30:15 PM"
    const dateStr = new Intl.DateTimeFormat('en-US', dateOptions).format(now);

    const parts = timeStr.split(' ');
    const time = parts[0];
    const period = parts[1] || '';

    return {
      date: dateStr,
      time: time,
      period: period
    };
  } catch {
    return {
      date: now.toLocaleDateString(),
      time: now.toLocaleTimeString(),
      period: ''
    };
  }
};

// Gets the Year, Month (0-11), and Day components of any Date in Egypt timezone
export const getEgyptCalendarComponents = (date: Date): { year: number; month: number; day: number } => {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Africa/Cairo',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric'
    });
    const parts = formatter.formatToParts(date);
    const getPart = (type: string) => parseInt(parts.find(p => p.type === type)?.value || '0', 10);
    return {
      year: getPart('year'),
      month: getPart('month') - 1, // 0-indexed
      day: getPart('day')
    };
  } catch (e) {
    // Fallback to local browser timezone components
    return {
      year: date.getFullYear(),
      month: date.getMonth(),
      day: date.getDate()
    };
  }
};

// Calculates exact calendar days between a stored event date string and the current date, rolling over exactly at midnight local Egypt time
export const getDaysTogetherInEgypt = (anniversaryDateStr: string): number => {
  if (!anniversaryDateStr) return 0;
  
  // 1. Parse the anniversary string into its Egypt timezone calendar components
  const annDate = parseEventDateInEgypt(anniversaryDateStr);
  const annComp = getEgyptCalendarComponents(annDate);
  
  // 2. Get current Egypt timezone calendar components
  const nowComp = getEgyptCalendarComponents(new Date());
  
  // 3. Create UTC dates with these exact components to do standard day subtraction without any DST/timezone shifts
  const annUtc = Date.UTC(annComp.year, annComp.month, annComp.day);
  const nowUtc = Date.UTC(nowComp.year, nowComp.month, nowComp.day);
  
  const diffMs = nowUtc - annUtc;
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  return Math.max(0, days);
};

// Calculates calendar days until a milestone, rolling over exactly at midnight local Egypt time
export const getDaysUntilMilestoneInEgypt = (dateStr: string): number => {
  if (!dateStr) return 999;
  
  // Stored date components in Egypt timezone
  const storedDate = parseEventDateInEgypt(dateStr);
  if (isNaN(storedDate.getTime())) return 999;
  const storedComp = getEgyptCalendarComponents(storedDate);
  
  // Current date components in Egypt timezone
  const nowComp = getEgyptCalendarComponents(new Date());
  
  // Construct UTC dates to compare
  const todayUtc = Date.UTC(nowComp.year, nowComp.month, nowComp.day);
  const storedUtc = Date.UTC(storedComp.year, storedComp.month, storedComp.day);
  
  // 1. If storedDate is in the future, check days until then
  if (storedUtc >= todayUtc) {
    const diffTime = storedUtc - todayUtc;
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }
  
  // 2. If storedDate is in the past, it's likely an annual recurring milestone (like a birthday or anniversary).
  // Check the occurrence for the current year
  const currentYearOccurrenceUtc = Date.UTC(nowComp.year, storedComp.month, storedComp.day);
  
  if (currentYearOccurrenceUtc >= todayUtc) {
    const diffTime = currentYearOccurrenceUtc - todayUtc;
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  } else {
    // If it already passed this year, check next year
    const nextYearOccurrenceUtc = Date.UTC(nowComp.year + 1, storedComp.month, storedComp.day);
    const diffTime = nextYearOccurrenceUtc - todayUtc;
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }
};

// Calculates real-world hours left until a planned date in Egypt timezone
export const getHoursUntilDatePlanInEgypt = (dateTimeStr: string): number => {
  if (!dateTimeStr) return -1;
  const planDate = parseEventDateInEgypt(dateTimeStr);
  if (isNaN(planDate.getTime())) return -1;
  const now = new Date();
  const diffMs = planDate.getTime() - now.getTime();
  return diffMs / (1000 * 60 * 60);
};

/**
 * Calculates end date based on start date and duration in days.
 * If durationDays is -1 or <= 0, returns undefined (lifetime/unlimited).
 */
export const calculateSubscriptionEndDate = (startDate: Date = new Date(), durationDays: number = 30): string | undefined => {
  if (durationDays === -1 || durationDays <= 0) return undefined;
  const endDate = new Date(startDate.getTime());
  endDate.setDate(endDate.getDate() + durationDays);
  return endDate.toISOString();
};

/**
 * Evaluates subscription status and remaining days for a tenant
 */
export const getSubscriptionStatus = (tenant?: CoupleTenant) => {
  if (!tenant || !tenant.subscriptionEndDate) {
    return {
      isExpired: false,
      isLifetime: true,
      daysRemaining: -1,
      formattedEndDate: 'Lifetime Access',
      statusText: 'Active Lifetime'
    };
  }

  const endDate = new Date(tenant.subscriptionEndDate);
  const now = new Date();
  const diffMs = endDate.getTime() - now.getTime();
  const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (isNaN(endDate.getTime())) {
    return {
      isExpired: false,
      isLifetime: true,
      daysRemaining: -1,
      formattedEndDate: 'Lifetime Access',
      statusText: 'Active Lifetime'
    };
  }

  const isExpired = daysRemaining <= 0;
  const formattedEndDate = endDate.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });

  return {
    isExpired,
    isLifetime: false,
    daysRemaining: isExpired ? 0 : daysRemaining,
    formattedEndDate,
    statusText: isExpired ? 'Subscription Expired' : `${daysRemaining} Day${daysRemaining === 1 ? '' : 's'} Remaining`
  };
};

/**
 * Celebration Target Calculation Helpers
 */
export interface CelebrationTargetSummary {
  targetDate: string; // YYYY-MM-DD
  daysRemaining: number;
  isToday: boolean;
  isPast: boolean;
  currentAge?: number;
  nextAge?: number;
  anniversaryNumber?: number;
  milestoneLabel: string;
  countdownBadge: string;
  formattedTargetDate: string;
}

export const getOrdinalSuffix = (n: number): string => {
  const abs = Math.abs(Math.floor(n));
  const mod100 = abs % 100;
  if (mod100 >= 11 && mod100 <= 13) {
    return 'th';
  }
  const mod10 = abs % 10;
  if (mod10 === 1) return 'st';
  if (mod10 === 2) return 'nd';
  if (mod10 === 3) return 'rd';
  return 'th';
};

export const calculateCelebrationTarget = (
  type: CelebrationCardType,
  originalDate?: string,
  targetDate?: string,
  age?: number
): CelebrationTargetSummary => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // 1. BIRTHDAY CALCULATION
  if (type === 'birthday') {
    // If birthdate (originalDate) is provided:
    if (originalDate && /^\d{4}-\d{2}-\d{2}/.test(originalDate)) {
      const [bYear, bMonth, bDay] = originalDate.split('-').map(Number);
      
      // Calculate current age
      let currentAge = today.getFullYear() - bYear;
      const bdayThisYear = new Date(today.getFullYear(), bMonth - 1, bDay);
      bdayThisYear.setHours(0, 0, 0, 0);

      const hasHadBdayThisYear = today.getTime() > bdayThisYear.getTime();
      const isTodayBday = today.getTime() === bdayThisYear.getTime();

      if (!hasHadBdayThisYear && !isTodayBday) {
        currentAge -= 1;
      }
      currentAge = Math.max(0, currentAge);

      // Next celebration target date
      let nextCelebrationDate: Date;
      let nextAge: number;

      if (isTodayBday) {
        nextCelebrationDate = bdayThisYear;
        nextAge = currentAge;
      } else if (today.getTime() < bdayThisYear.getTime()) {
        nextCelebrationDate = bdayThisYear;
        nextAge = currentAge + 1;
      } else {
        // Birthday already passed this calendar year, so next is next year
        nextCelebrationDate = new Date(today.getFullYear() + 1, bMonth - 1, bDay);
        nextAge = currentAge + 1;
      }

      const diffMs = nextCelebrationDate.getTime() - today.getTime();
      const daysRemaining = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));

      const yyyy = nextCelebrationDate.getFullYear();
      const mm = String(nextCelebrationDate.getMonth() + 1).padStart(2, '0');
      const dd = String(nextCelebrationDate.getDate()).padStart(2, '0');
      const formattedIso = `${yyyy}-${mm}-${dd}`;

      const formattedReadable = nextCelebrationDate.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });

      const ordinal = getOrdinalSuffix(nextAge);
      const milestoneLabel = isTodayBday 
        ? `Celebrating ${nextAge}${ordinal} Birthday Today! 🎉🎂` 
        : `Target: Turning ${nextAge} (${nextAge}${ordinal} Birthday 🎂)`;

      const countdownBadge = isTodayBday
        ? '🎉 Today is Birthday!'
        : daysRemaining === 1
          ? '🎂 Tomorrow!'
          : `🎂 In ${daysRemaining} days`;

      return {
        targetDate: formattedIso,
        daysRemaining,
        isToday: isTodayBday,
        isPast: false,
        currentAge,
        nextAge,
        milestoneLabel,
        countdownBadge,
        formattedTargetDate: formattedReadable
      };
    }

    // Fallback if only targetDate or age is known
    const target = targetDate ? new Date(targetDate + 'T00:00:00') : new Date();
    target.setHours(0, 0, 0, 0);
    const diffMs = target.getTime() - today.getTime();
    const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    const isToday = daysRemaining === 0;
    const isPast = daysRemaining < 0;

    const displayAge = age || 25;
    const ordinal = getOrdinalSuffix(displayAge);
    const milestoneLabel = isToday 
      ? `Celebrating ${displayAge}${ordinal} Birthday Today! 🎉` 
      : `Target: Turning ${displayAge}`;

    return {
      targetDate: targetDate || today.toISOString().split('T')[0],
      daysRemaining: Math.abs(daysRemaining),
      isToday,
      isPast,
      nextAge: displayAge,
      milestoneLabel,
      countdownBadge: isToday ? '🎉 Today!' : isPast ? `🎂 Passed (${Math.abs(daysRemaining)}d ago)` : `🎂 In ${daysRemaining} days`,
      formattedTargetDate: target.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    };
  }

  // 2. ENGAGEMENT & ANNIVERSARY CALCULATION
  if (type === 'engagement' || type === 'anniversary') {
    const origStr = originalDate || targetDate;
    if (origStr && /^\d{4}-\d{2}-\d{2}/.test(origStr)) {
      const [eYear, eMonth, eDay] = origStr.split('-').map(Number);
      const annivThisYear = new Date(today.getFullYear(), eMonth - 1, eDay);
      annivThisYear.setHours(0, 0, 0, 0);

      const isTodayAnniv = today.getTime() === annivThisYear.getTime();
      let nextAnnivDate: Date;
      let annivNum: number;

      if (isTodayAnniv) {
        nextAnnivDate = annivThisYear;
        annivNum = today.getFullYear() - eYear;
      } else if (today.getTime() < annivThisYear.getTime()) {
        nextAnnivDate = annivThisYear;
        annivNum = today.getFullYear() - eYear;
      } else {
        nextAnnivDate = new Date(today.getFullYear() + 1, eMonth - 1, eDay);
        annivNum = (today.getFullYear() + 1) - eYear;
      }
      annivNum = Math.max(1, annivNum);

      const diffMs = nextAnnivDate.getTime() - today.getTime();
      const daysRemaining = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));

      const yyyy = nextAnnivDate.getFullYear();
      const mm = String(nextAnnivDate.getMonth() + 1).padStart(2, '0');
      const dd = String(nextAnnivDate.getDate()).padStart(2, '0');
      const formattedIso = `${yyyy}-${mm}-${dd}`;

      const icon = type === 'engagement' ? '💍' : '🥂';
      const term = type === 'engagement' ? 'Engagement Anniversary' : 'Anniversary';
      const ordinal = getOrdinalSuffix(annivNum);

      return {
        targetDate: formattedIso,
        daysRemaining,
        isToday: isTodayAnniv,
        isPast: false,
        anniversaryNumber: annivNum,
        milestoneLabel: isTodayAnniv 
          ? `Happy ${annivNum}${ordinal} ${term} Today! ${icon}` 
          : `Target: ${annivNum}${ordinal} ${term} ${icon}`,
        countdownBadge: isTodayAnniv 
          ? `🎉 Today is Anniversary!` 
          : `${icon} In ${daysRemaining} days`,
        formattedTargetDate: nextAnnivDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      };
    }
  }

  // 3. FIREWORKS / CUSTOM / DEFAULT TARGET
  const target = targetDate ? new Date(targetDate + 'T00:00:00') : new Date();
  target.setHours(0, 0, 0, 0);
  const diffMs = target.getTime() - today.getTime();
  const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  const isToday = daysRemaining === 0;
  const isPast = daysRemaining < 0;

  const icon = type === 'fireworks' ? '🎆' : '✨';
  return {
    targetDate: targetDate || today.toISOString().split('T')[0],
    daysRemaining: Math.abs(daysRemaining),
    isToday,
    isPast,
    milestoneLabel: isToday 
      ? `Celebration Day! ${icon}` 
      : isPast 
        ? `Celebrated Milestone ${icon}` 
        : `Target Celebration: ${target.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`,
    countdownBadge: isToday 
      ? `🎉 Today!` 
      : isPast 
        ? `${icon} ${Math.abs(daysRemaining)}d ago` 
        : `${icon} In ${daysRemaining} days`,
    formattedTargetDate: target.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  };
};

