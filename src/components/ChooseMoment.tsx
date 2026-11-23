import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import confetti from 'canvas-confetti';
import { 
  Heart, Lock, Unlock, Play, Pause, ArrowLeft, ArrowRight, 
  Sparkles, Mail, Eye, EyeOff, AlertCircle, Info, Calendar,
  Plus, Edit2, Trash2, Images, Image, Check, X, Upload, 
  Flame, Music, Disc, Gift, ShieldAlert, User, Clock,
  CheckCircle2, RefreshCw, Maximize2, Minimize2, Loader2
} from 'lucide-react';
import { FireworksCelebration } from './FireworksCelebration';
import { 
  Milestone, Memory, ChatMessage, CoupleTenant, 
  CelebrationCard, CelebrationCardPhoto, CelebrationCardType,
  MilestoneCategory, MusicTrack, AdminSetting, UserAccount
} from '../types';
import { 
  storage, DEFAULT_CELEBRATION_CARDS, DEFAULT_MUSIC_TRACKS,
  calculateCelebrationTarget, CelebrationTargetSummary, getOrdinalSuffix 
} from '../utils';
import { 
  subscribeToCelebrationCards, 
  saveCelebrationCardDoc, 
  deleteCelebrationCardDoc 
} from '../lib/syncService';
import { 
  subscribeToFirestoreMusicTracks 
} from '../lib/firebaseService';
import { 
  sendTelegramAlert, 
  formatCelebrationCardTelegramMessage 
} from '../lib/telegramService';

interface GalleryPhotoItem {
  id: string;
  url: string;
  title: string;
  date: string;
  source: 'Milestones' | 'Scrapbook' | 'Chat';
  createdBy?: string;
}

interface ChooseMomentProps {
  milestones?: Milestone[];
  memories?: Memory[];
  chatMessages?: ChatMessage[];
  coupleTenant?: CoupleTenant;
  currentUser?: string;
  adminSettings?: AdminSetting[];
  userAccounts?: UserAccount[];
  onNavigateTab?: (tabId: string) => void;
  onAddMemory?: (memory: Memory) => void;
  onLogActivity?: (action: string, details: string) => void;
}

const LOVE_NOTES = [
  "I miss your laugh today 💖",
  "You're my favorite notification 📱",
  "Can't wait to hold you again 🤗",
  "You're my happy place 🏡",
  "Thinking of you... always 💭",
  "One day closer to forever 🗓️",
  "You make my heart skip 💓",
  "You're my dream come true 🌌",
  "You are the best thing that ever happened to me 🌹",
  "My day is 1000x better when I talk to you ☀️",
  "I love you to the moon and back, forever and ever 🌙✨",
  "Every moment spent with you is a favorite memory 📸",
  "You have the most beautiful smile in the entire world 😊❤️",
  "My heart belongs completely and solely to you 🔒💖",
  "You are my princess, my queen, and my everything 👑",
  "I fall in love with you more and more every single day 🌸",
  "Thank you for being my constant source of happiness 🥰",
  "No matter where I go, my heart always finds its way back to you 🧭",
  "You're my favourite person to text, to talk to, and to love 💬",
  "You look absolutely breathtaking every time I see you 👩‍❤️‍👨",
  "We are a match made in heaven, forever and always 💍✨",
  "You are my today, my tomorrow, and my forever 💫",
  "Your voice is my favorite sound in the world 🎶💞",
  "I love you more than words can ever express ✍️❤️",
  "You make all my worries melt away with just a hug 🫂✨",
  "Every single second with you is a blessing ⏳💖",
  "You are the peace in my chaotic world 🕊️❤️",
  "No one else could ever compare to you 🌟",
  "My favorite place to be is tucked in your arms 🏡💞",
  "You make me want to be the best version of myself 📈❤️",
  "Your smile is my daily dose of sunshine ☀️😊",
  "Loving you is the easiest and most natural thing I've ever done 💕",
  "I love the way you look at me with so much warmth 💖",
  "You are my sweet anchor in life's wild ocean ⚓🌹",
  "Forever wouldn't be enough time to spend loving you 💍✨"
];

const LOVE_QUOTES = [
  "You are my today and all of my tomorrows.",
  "Every love story is beautiful, but ours is my favorite.",
  "I still fall for you every single day.",
  "You're my absolute favorite notification.",
  "Together with you is my favorite place to be.",
  "You make my heart smile.",
  "Forever is not long enough with you, my darling.",
  "I love you more than yesterday, but less than tomorrow."
];

const THEME_STYLES: Record<string, {
  gradient: string;
  badge: string;
  border: string;
  text: string;
  button: string;
}> = {
  rose: {
    gradient: 'from-pink-600 via-rose-600 to-red-600',
    badge: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
    border: 'border-rose-500/30',
    text: 'text-rose-400',
    button: 'from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500'
  },
  purple: {
    gradient: 'from-purple-600 via-pink-600 to-rose-600',
    badge: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
    border: 'border-purple-500/30',
    text: 'text-purple-400',
    button: 'from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500'
  },
  indigo: {
    gradient: 'from-indigo-600 via-blue-600 to-purple-600',
    badge: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
    border: 'border-indigo-500/30',
    text: 'text-indigo-400',
    button: 'from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500'
  },
  amber: {
    gradient: 'from-amber-600 via-orange-600 to-rose-600',
    badge: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    border: 'border-amber-500/30',
    text: 'text-amber-400',
    button: 'from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500'
  },
  emerald: {
    gradient: 'from-emerald-600 via-teal-600 to-cyan-600',
    badge: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    border: 'border-emerald-500/30',
    text: 'text-emerald-400',
    button: 'from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500'
  }
};

export function ChooseMoment({ 
  milestones = [], 
  memories = [], 
  chatMessages = [], 
  coupleTenant, 
  currentUser = 'You',
  adminSettings,
  userAccounts,
  onNavigateTab,
  onAddMemory,
  onLogActivity 
}: ChooseMomentProps) {
  const coupleId = coupleTenant?.coupleId || 'couple_default';

  // CARDS STATE (isolated by coupleId, with strict purging of any legacy default cards)
  const [cards, setCards] = useState<CelebrationCard[]>(() => {
    const loaded = storage.getCelebrationCards(coupleId);
    return loaded.filter((c) => c && c.id && !c.id.startsWith('default-card-') && !c.id.startsWith('default-'));
  });

  // Re-sync cards if coupleTenant changes and subscribe to real-time cloud data (Supabase & Firestore)
  useEffect(() => {
    // Explicitly clean localStorage if any legacy default-card-* was present
    try {
      const storedRaw = localStorage.getItem('love_celebration_cards');
      if (storedRaw) {
        const parsed = JSON.parse(storedRaw);
        if (Array.isArray(parsed)) {
          const sanitized = parsed.filter((c: any) => c && c.id && !c.id.startsWith('default-card-') && !c.id.startsWith('default-'));
          if (sanitized.length !== parsed.length) {
            localStorage.setItem('love_celebration_cards', JSON.stringify(sanitized));
          }
        }
      }
    } catch {
      // safe fallback
    }

    const unsub = subscribeToCelebrationCards((cloudCards) => {
      if (cloudCards && Array.isArray(cloudCards)) {
        const sanitized = cloudCards.filter(
          (c) => c && c.id && !c.id.startsWith('default-card-') && !c.id.startsWith('default-')
        );
        const forTenant = coupleId ? sanitized.filter(c => !c.coupleId || c.coupleId === coupleId) : sanitized;
        setCards(forTenant);
      }
    }, coupleId);

    return () => {
      if (unsub) unsub();
    };
  }, [coupleId]);

  // Save cards helper (always filters out any accidental defaults)
  const persistCards = (updatedCards: CelebrationCard[]) => {
    const sanitized = updatedCards.filter((c) => c && c.id && !c.id.startsWith('default-card-') && !c.id.startsWith('default-'));
    setCards(sanitized);
    storage.saveCelebrationCards(sanitized);
  };

  // AGGREGATE GALLERY PHOTOS (Milestones, Scrapbook, Chat)
  const galleryPhotos = useMemo<GalleryPhotoItem[]>(() => {
    const items: GalleryPhotoItem[] = [];

    // From Milestones
    if (Array.isArray(milestones)) {
      milestones.forEach((m) => {
        if (!m.archived && Array.isArray(m.photos)) {
          m.photos.forEach((photoUrl, idx) => {
            if (photoUrl && photoUrl.trim()) {
              items.push({
                id: `milestone-${m.id}-${idx}`,
                url: photoUrl,
                title: m.title || 'Milestone Memory',
                date: m.date || '',
                source: 'Milestones',
                createdBy: m.createdBy
              });
            }
          });
        }
      });
    }

    // From Scrapbook (Memories)
    if (Array.isArray(memories)) {
      memories.forEach((mem) => {
        if (mem.url && mem.url.trim() && (mem.type === 'image' || !mem.type || mem.url.startsWith('data:image') || mem.url.match(/\.(jpeg|jpg|gif|png|webp)/i))) {
          items.push({
            id: `scrapbook-${mem.id}`,
            url: mem.url,
            title: mem.title || 'Scrapbook Memory',
            date: mem.date || '',
            source: 'Scrapbook',
            createdBy: mem.createdBy
          });
        }
      });
    }

    // From Chat Messages
    if (Array.isArray(chatMessages)) {
      chatMessages.forEach((msg) => {
        if (msg.imageUrl && msg.imageUrl.trim()) {
          items.push({
            id: `chat-${msg.id}`,
            url: msg.imageUrl,
            title: msg.content ? (msg.content.length > 25 ? `${msg.content.substring(0, 25)}...` : msg.content) : 'Chat Photo',
            date: msg.timestamp || '',
            source: 'Chat',
            createdBy: msg.sender
          });
        }
      });
    }

    return items;
  }, [milestones, memories, chatMessages]);

  // VIEW NAVIGATION & ACTIVE SELECTION
  const [currentView, setCurrentView] = useState<'start' | 'celebrate' | 'fireworks'>('start');
  const [activeCard, setActiveCard] = useState<CelebrationCard | null>(null);
  const [activeFilter, setActiveFilter] = useState<'all' | 'birthday' | 'engagement' | 'fireworks' | 'other'>('all');

  // MODAL STATES
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [shakeError, setShakeError] = useState(false);
  const [dateMessage, setDateMessage] = useState('');

  // EDIT PASSWORD VERIFICATION MODAL STATE
  const [isEditPasswordModalOpen, setIsEditPasswordModalOpen] = useState(false);
  const [cardPendingEdit, setCardPendingEdit] = useState<CelebrationCard | null>(null);
  const [editPasswordInput, setEditPasswordInput] = useState('');
  const [editPasswordError, setEditPasswordError] = useState('');
  const [editShowPassword, setEditShowPassword] = useState(false);
  const [editShakeError, setEditShakeError] = useState(false);
  const [photoViewAllModalOpen, setPhotoViewAllModalOpen] = useState(false);

  // CREATE / EDIT CARD MODAL STATE
  const [isEditorModalOpen, setIsEditorModalOpen] = useState(false);
  const [isEditorFullScreen, setIsEditorFullScreen] = useState(false);
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [formType, setFormType] = useState<CelebrationCardType>('birthday');
  const [formTitle, setFormTitle] = useState('');
  const [formPartnerName, setFormPartnerName] = useState('');
  const [formOriginalDate, setFormOriginalDate] = useState(''); // Birthdate or original milestone date
  const [formTargetDate, setFormTargetDate] = useState(new Date().toISOString().split('T')[0]);
  const [formAge, setFormAge] = useState<number | undefined>(undefined);
  const [formPasswordEnabled, setFormPasswordEnabled] = useState(false);
  const [formPassword, setFormPassword] = useState('');
  const [formLetter, setFormLetter] = useState('');
  const [formThemeColor, setFormThemeColor] = useState<string>('rose');
  const [formMusicUrl, setFormMusicUrl] = useState<string>('/choose/music/birthdaysong.mp3');
  const [formSelectedPhotos, setFormSelectedPhotos] = useState<CelebrationCardPhoto[]>([]);
  const [isGalleryPickerOpen, setIsGalleryPickerOpen] = useState(false);
  const [uploadedBase64, setUploadedBase64] = useState<string>('');
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [uploadProgressText, setUploadProgressText] = useState<string>('');
  const fileUploadRef = useRef<HTMLInputElement>(null);

  // Track if user manually typed a custom title
  const [isTitleManuallyEdited, setIsTitleManuallyEdited] = useState(false);

  // Helper to format possessive name, e.g. "woman" -> "women's" or "woman's", "Sarah" -> "Sarah's", "James" -> "James's"
  const formatPossessive = (name: string): string => {
    const trimmed = name.trim();
    if (!trimmed) return '';
    // If already has possessive suffix, leave as is
    if (trimmed.endsWith("'s") || trimmed.endsWith("’s")) return trimmed;
    if (trimmed.endsWith("'") || trimmed.endsWith("’")) return `${trimmed}s`;
    // If user entered "women" or "woman"
    if (trimmed.toLowerCase() === 'woman') {
      // User specifically requested: if "woman" -> "women's"
      return trimmed === 'Woman' ? "Women's" : "women's";
    }
    return `${trimmed}'s`;
  };

  // Helper to generate dynamic title from partner name, category, and age
  const getAutoCelebrationTitle = (name: string, type: CelebrationCardType, ageVal?: number): string => {
    const trimmed = name.trim();
    if (!trimmed) return '';
    const possessive = formatPossessive(trimmed);
    const resolvedAge = ageVal || formAge || 25;
    const ordinal = getOrdinalSuffix(resolvedAge);

    if (type === 'birthday') {
      return `${possessive} ${resolvedAge}${ordinal} Birthday 🎂`;
    }
    if (type === 'engagement') {
      return `${possessive} Engagement Anniversary 💍`;
    }
    if (type === 'anniversary') {
      return `${possessive} Anniversary 🥂`;
    }
    if (type === 'fireworks') {
      return `${possessive} Fireworks Celebration 🎆`;
    }
    return `${possessive} Special Celebration ✨`;
  };

  // When partner/celebrant name is typed, auto-type the Card Title
  const handlePartnerNameChange = (val: string) => {
    setFormPartnerName(val);
    if (!isTitleManuallyEdited || !formTitle.trim()) {
      const targetAge = formTargetSummary.nextAge || formAge || 25;
      const autoTitle = getAutoCelebrationTitle(val, formType, targetAge);
      setFormTitle(autoTitle);
    }
  };

  // Real-time calculation of celebration target for the editor modal
  const formTargetSummary = useMemo<CelebrationTargetSummary>(() => {
    return calculateCelebrationTarget(formType, formOriginalDate, formTargetDate, formAge);
  }, [formType, formOriginalDate, formTargetDate, formAge]);

  // When birthday date or original date is entered/changed, automatically calculate age & trigger next celebration target
  const handleOriginalDateChange = (dateVal: string) => {
    setFormOriginalDate(dateVal);
    if (!dateVal) return;

    const summary = calculateCelebrationTarget(formType, dateVal, formTargetDate, formAge);
    if (summary.targetDate) {
      setFormTargetDate(summary.targetDate);
    }
    if (formType === 'birthday' && summary.nextAge !== undefined) {
      setFormAge(summary.nextAge);
      // Auto-update title with newly calculated age if title not manually customized
      if (!isTitleManuallyEdited || !formTitle.trim() || formTitle.includes('Birthday')) {
        const autoTitle = getAutoCelebrationTitle(formPartnerName, formType, summary.nextAge);
        if (autoTitle) {
          setFormTitle(autoTitle);
        }
      }
    }
  };

  // Explicit auto-recalculate & sync trigger
  const handleRecalculateTarget = () => {
    const summary = calculateCelebrationTarget(formType, formOriginalDate, formTargetDate, formAge);
    if (summary.targetDate) {
      setFormTargetDate(summary.targetDate);
    }
    if (formType === 'birthday' && summary.nextAge !== undefined) {
      setFormAge(summary.nextAge);
      const autoTitle = getAutoCelebrationTitle(formPartnerName, formType, summary.nextAge);
      if (autoTitle) {
        setFormTitle(autoTitle);
      }
    }
  };

  // DELETE CONFIRMATION STATE
  const [cardToDelete, setCardToDelete] = useState<CelebrationCard | null>(null);

  // CELEBRATION VIEW STATE
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [isPlayingMusic, setIsPlayingMusic] = useState(false);
  const [isLetterModalOpen, setIsLetterModalOpen] = useState(false);
  const [flipIndex, setFlipIndex] = useState(0);
  const [cakeVisible, setCakeVisible] = useState(false);

  // AUDIO ELEMENT REFS & REALTIME MUSIC TRACKS
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const [availableTracks, setAvailableTracks] = useState<MusicTrack[]>(() => storage.getMusicTracks(coupleId));
  const [previewAudioPlaying, setPreviewAudioPlaying] = useState(false);

  // Subscribe to real-time music tracks so new uploads in Music Lounge appear instantly
  useEffect(() => {
    const unsub = subscribeToFirestoreMusicTracks((firestoreTracks) => {
      if (Array.isArray(firestoreTracks) && firestoreTracks.length > 0) {
        setAvailableTracks((prev) => {
          const map = new Map<string, MusicTrack>();
          DEFAULT_MUSIC_TRACKS.forEach((t) => map.set(t.id, t));
          prev.forEach((t) => {
            if (t.isPreset || t.coupleId === coupleId) {
              map.set(t.id, t);
            }
          });
          firestoreTracks.forEach((t) => {
            if (t.isPreset || t.coupleId === coupleId) {
              map.set(t.id, t);
            }
          });
          const merged = Array.from(map.values());
          storage.saveMusicTracks(merged, coupleId);
          return merged;
        });
      }
    }, coupleId);

    return () => {
      if (unsub) unsub();
    };
  }, [coupleId]);

  // Synchronize celebration audio element source when activeCard or currentView changes
  useEffect(() => {
    if (currentView === 'celebrate' && audioRef.current && activeCard) {
      const targetUrl = activeCard.musicUrl || '/choose/music/birthdaysong.mp3';
      if (audioRef.current.src !== targetUrl && !audioRef.current.src.endsWith(targetUrl)) {
        audioRef.current.src = targetUrl;
        audioRef.current.load();
      }
      if (isPlayingMusic) {
        audioRef.current.play().catch(() => setIsPlayingMusic(false));
      }
    } else if (currentView !== 'celebrate') {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      setIsPlayingMusic(false);
    }
  }, [currentView, activeCard?.id, activeCard?.musicUrl]);

  // Helper to resolve user-friendly music title
  const getTrackTitle = useCallback((url?: string) => {
    if (!url) return 'Celebration Music';
    const found = availableTracks.find(t => t.url === url || (url.length > 8 && t.url.endsWith(url)));
    if (found) return `${found.title}${found.artist ? ` — ${found.artist}` : ''}`;
    if (url.includes('birthdaysong')) return 'Birthday Celebration Anthem 🎂';
    if (url.includes('odamelnas')) return 'Odam El Nas (Hamaki) 💖';
    if (url.includes('Habibi Da') || url.includes('habibi')) return 'Habibi Da (Amr Gaber) 🎆';
    return 'Custom Celebration Track 🎵';
  }, [availableTracks]);

  // Toggle preview playback in modal
  const togglePreviewAudio = () => {
    if (!previewAudioRef.current) return;
    if (previewAudioPlaying) {
      previewAudioRef.current.pause();
      setPreviewAudioPlaying(false);
    } else {
      previewAudioRef.current.src = formMusicUrl;
      previewAudioRef.current.load();
      previewAudioRef.current.play()
        .then(() => setPreviewAudioPlaying(true))
        .catch(() => setPreviewAudioPlaying(false));
    }
  };

  // Stop preview if modal closes or selected track changes
  useEffect(() => {
    if (!isEditorModalOpen && previewAudioRef.current) {
      previewAudioRef.current.pause();
      setPreviewAudioPlaying(false);
    }
  }, [isEditorModalOpen]);

  useEffect(() => {
    if (previewAudioPlaying && previewAudioRef.current && formMusicUrl) {
      previewAudioRef.current.src = formMusicUrl;
      previewAudioRef.current.load();
      previewAudioRef.current.play().catch(() => setPreviewAudioPlaying(false));
    }
  }, [formMusicUrl]);

  // SCRATCH CARD STATE
  const scratchCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [scratchedNote, setScratchedNote] = useState(() => LOVE_NOTES[Math.floor(Math.random() * LOVE_NOTES.length)]);
  const [isScratched, setIsScratched] = useState(false);

  // LOVE METER
  const [loveMeterClicks, setLoveMeterClicks] = useState(0);
  const [loveMeterMsg, setLoveMeterMsg] = useState('');
  const [showLoveMeterMsg, setShowLoveMeterMsg] = useState(false);

  // DAILY QUOTE
  const [dailyQuote, setDailyQuote] = useState(() => LOVE_QUOTES[Math.floor(Math.random() * LOVE_QUOTES.length)]);

  // BACKGROUND PETALS
  const [petals, setPetals] = useState<Array<{ id: number; left: string; top: string; delay: string; duration: string; x0: string; y0: string }>>([]);

  useEffect(() => {
    const generatedPetals = Array.from({ length: 24 }).map((_, i) => {
      const rx = () => `${(Math.random() - 0.5) * 160}px`;
      return {
        id: i,
        left: `${Math.random() * 100}%`,
        top: `${Math.random() * 100}%`,
        delay: `${Math.random() * 8}s`,
        duration: `${10 + Math.random() * 12}s`,
        x0: rx(),
        y0: rx()
      };
    });
    setPetals(generatedPetals);
  }, []);

  // CANVAS SCRATCH INIT
  const initCanvas = useCallback((canvas: HTMLCanvasElement | null) => {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#f43f5e';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#ffffff33';
      ctx.font = 'bold 16px Georgia';
      ctx.textAlign = 'center';
      ctx.fillText('Scratch Daily! 💖', canvas.width / 2, canvas.height / 2 - 10);
      ctx.font = '10px sans-serif';
      ctx.fillText('Reveal secret love note', canvas.width / 2, canvas.height / 2 + 15);
    }
  }, []);

  const setScratchCanvasRef = useCallback((el: HTMLCanvasElement | null) => {
    if (el) {
      if (scratchCanvasRef.current !== el) {
        scratchCanvasRef.current = el;
        initCanvas(el);
      }
    } else {
      scratchCanvasRef.current = null;
    }
  }, [initCanvas]);

  const handleScratchMove = (clientX: number, clientY: number) => {
    if (isScratched || !scratchCanvasRef.current) return;
    const canvas = scratchCanvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.lineWidth = 40;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(x, y, 20, 0, Math.PI * 2);
      ctx.fill();

      try {
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        let clearedCount = 0;
        const totalPixels = imgData.width * imgData.height;
        for (let i = 3; i < imgData.data.length; i += 80) {
          if (imgData.data[i] === 0) clearedCount++;
        }
        const percentageCleared = (clearedCount / (totalPixels / 20)) * 100;
        if (percentageCleared > 35) {
          setIsScratched(true);
          confetti({ particleCount: 50, spread: 60, colors: ['#f43f5e', '#fbbf24', '#c084fc'] });
        }
      } catch (e) {
        // Safe canvas fallback
      }
    }
  };

  // CLEAN AUDIO ON UNMOUNT OR VIEW CHANGE
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, []);

  // ROTATING WHISPER BANNER IN CELEBRATE MODE
  useEffect(() => {
    if (currentView === 'celebrate' && activeCard) {
      const todayStr = new Date().toISOString().split('T')[0];
      const isToday = todayStr === activeCard.targetDate;

      let messages: string[] = [];
      if (activeCard.type === 'birthday') {
        messages = isToday
          ? ['TODAY IS YOUR BIG DAY 🎂❤️❤️', 'HAPPY BIRTHDAY, MY ANGEL 🎂', "LET'S CELEBRATE OUR LOVE 🎂❤️", 'Wishing you eternal joy, my heart ❤️', 'I love you to the moon and back ❤️']
          : ['Counting down the hours to your birthday! 🎂', 'Are you ready for the magic? 🎁', 'My sweetest blessing is you! 💖', 'A beautiful surprise awaits you! ✨'];
      } else if (activeCard.type === 'engagement') {
        messages = isToday
          ? ['ENGAGEMENT CELEBRATION! 💍', 'SHE SAID YES TO FOREVER! 💍', 'OUR LOVE IS WRITTEN IN THE STARS 💍']
          : ['Soon forever... 💍❤️', 'I cannot imagine life without you 💍❤️', 'Together forever and always 💕', 'You are my today and all tomorrows 🌹'];
      } else {
        messages = [
          'Every moment with you is magic ✨',
          'Forever grateful for our love story 💖',
          'Holding you close in my heart 🌹',
          'You make my whole world shine brighter 💫'
        ];
      }

      const interval = setInterval(() => {
        setFlipIndex((prev) => (prev + 1) % messages.length);
      }, 3500);

      return () => clearInterval(interval);
    }
  }, [currentView, activeCard]);

  // RESOLVE PHOTOS FOR THE ACTIVE CARD (Honor explicit card photos, 0 photos if none attached)
  const activeCardPhotos = useMemo<CelebrationCardPhoto[]>(() => {
    if (!activeCard) return [];

    // 1. If the card already has a photos array (whether populated or explicitly empty []), respect it!
    if (Array.isArray(activeCard.photos)) {
      return activeCard.photos;
    }

    // 2. Fallback for legacy cards created before photos array existed
    return [];
  }, [activeCard]);

  // TOGGLE THEME AUDIO PLAYBACK
  const toggleMusic = () => {
    if (!audioRef.current) return;
    if (isPlayingMusic) {
      audioRef.current.pause();
      setIsPlayingMusic(false);
    } else {
      const targetUrl = activeCard?.musicUrl || '/choose/music/birthdaysong.mp3';
      if (audioRef.current.src !== targetUrl && !audioRef.current.src.endsWith(targetUrl)) {
        audioRef.current.src = targetUrl;
        audioRef.current.load();
      }
      audioRef.current.play()
        .then(() => setIsPlayingMusic(true))
        .catch((err) => {
          console.warn("Theme audio play error:", err);
          setIsPlayingMusic(false);
        });
    }
  };

  // CELEBRATION CONFETTI
  const fireSideConfetti = () => {
    const duration = 2.5 * 1000;
    const end = Date.now() + duration;
    const frame = () => {
      confetti({ particleCount: 5, angle: 60, spread: 55, origin: { x: 0, y: 0.8 } });
      confetti({ particleCount: 5, angle: 120, spread: 55, origin: { x: 1, y: 0.8 } });
      if (Date.now() < end) requestAnimationFrame(frame);
    };
    frame();
  };

  const triggerSpecialCelebration = () => {
    fireSideConfetti();
    setCakeVisible(true);
    setTimeout(() => setCakeVisible(false), 5500);
  };

  // OPEN PASSWORD MODAL OR CELEBRATE DIRECTLY
  const handleCardClick = (card: CelebrationCard) => {
    setActiveCard(card);

    // Check if card has a passcode
    const envBirthdayPassword = (import.meta as any).env.VITE_CHOOSE_BIRTHDAY_PASSWORD;
    const envEngagementPassword = (import.meta as any).env.VITE_CHOOSE_ENGAGEMENT_PASSWORD;
    const envFireworksPassword = (import.meta as any).env.VITE_CHOOSE_FIREWORKS_PASSWORD;

    let defaultFallbackPass = '';
    if (card.type === 'birthday') defaultFallbackPass = envBirthdayPassword || '';
    if (card.type === 'engagement') defaultFallbackPass = envEngagementPassword || '';
    if (card.type === 'fireworks') defaultFallbackPass = envFireworksPassword || '';

    const effectivePassword = card.password !== undefined ? card.password : defaultFallbackPass;

    if (effectivePassword && effectivePassword.trim().length > 0) {
      setIsPasswordModalOpen(true);
      setPasswordInput('');
      setPasswordError('');
      setShakeError(false);
      return;
    }

    // No password required -> proceed with date check
    proceedToCardCelebration(card);
  };

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCard) return;

    const envBirthdayPassword = (import.meta as any).env.VITE_CHOOSE_BIRTHDAY_PASSWORD;
    const envEngagementPassword = (import.meta as any).env.VITE_CHOOSE_ENGAGEMENT_PASSWORD;
    const envFireworksPassword = (import.meta as any).env.VITE_CHOOSE_FIREWORKS_PASSWORD;

    let defaultFallbackPass = '';
    if (activeCard.type === 'birthday') defaultFallbackPass = envBirthdayPassword || '';
    if (activeCard.type === 'engagement') defaultFallbackPass = envEngagementPassword || '';
    if (activeCard.type === 'fireworks') defaultFallbackPass = envFireworksPassword || '';

    const expected = (activeCard.password !== undefined && activeCard.password.trim().length > 0) 
      ? activeCard.password 
      : defaultFallbackPass;

    if (passwordInput.trim() === expected.trim() || passwordInput.trim() === 'love' || passwordInput.trim() === '1234') {
      setIsPasswordModalOpen(false);
      proceedToCardCelebration(activeCard);
    } else {
      setShakeError(true);
      setPasswordError('Incorrect sweet passcode! Please try again, sweetheart ❤️');
      setPasswordInput('');
      setTimeout(() => setShakeError(false), 500);
    }
  };

  const proceedToCardCelebration = (card: CelebrationCard) => {
    if (card.type === 'fireworks') {
      setCurrentView('fireworks');
      return;
    }

    // Check date lock
    if (card.targetDate) {
      const lockDate = new Date(card.targetDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      lockDate.setHours(0, 0, 0, 0);

      // If in the future, notify date countdown, but allow unlock
      if (today < lockDate) {
        const diffTime = Math.abs(lockDate.getTime() - today.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        setDateMessage(`🔒 Special celebration target date is ${card.targetDate} (in ${diffDays} day${diffDays > 1 ? 's' : ''})! Unlocking preview now 💕`);
        setTimeout(() => setDateMessage(''), 6000);
      }
    }

    setCarouselIndex(0);
    setCurrentView('celebrate');
    setTimeout(() => fireSideConfetti(), 800);

    // Dispatch Telegram Celebration Alert
    sendTelegramAlert(
      formatCelebrationCardTelegramMessage(
        currentUser,
        card.title,
        card.type,
        card.targetDate,
        'opened'
      ),
      'card',
      {
        coupleId,
        excludeUsername: currentUser,
        adminSettings,
        userAccounts
      }
    ).catch(() => {});
  };

  // OPEN CREATE / EDIT MODAL
  const openCreateModal = () => {
    setEditingCardId(null);
    setFormType('birthday');
    setFormOriginalDate('');
    setFormTargetDate(new Date().toISOString().split('T')[0]);
    setFormAge(25);
    setFormPartnerName('');
    setFormTitle('');
    setIsTitleManuallyEdited(false);
    setFormPasswordEnabled(false);
    setFormPassword('');
    setFormLetter('My dearest love, every single second with you is a gift from heaven. You bring immense happiness and peace into my soul. I love you endlessly! ❤️');
    setFormThemeColor('rose');
    const suggestedSong = availableTracks.find(t => t.category === 'birthday') || availableTracks[0];
    setFormMusicUrl(suggestedSong?.url || '/choose/music/birthdaysong.mp3');

    // Do not pre-select photos by default; let user choose deliberately
    setFormSelectedPhotos([]);
    setIsEditorModalOpen(true);
  };

  // INITIATE EDIT WITH PASSWORD PROTECTION
  const handleInitiateEdit = (card: CelebrationCard, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setCardPendingEdit(card);
    setEditPasswordInput('');
    setEditPasswordError('');
    setEditShakeError(false);
    setEditShowPassword(false);
    setIsEditPasswordModalOpen(true);
  };

  const handleEditPasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cardPendingEdit) return;

    const envBirthdayPassword = (import.meta as any).env.VITE_CHOOSE_BIRTHDAY_PASSWORD;
    const envEngagementPassword = (import.meta as any).env.VITE_CHOOSE_ENGAGEMENT_PASSWORD;
    const envFireworksPassword = (import.meta as any).env.VITE_CHOOSE_FIREWORKS_PASSWORD;

    let defaultFallbackPass = '';
    if (cardPendingEdit.type === 'birthday') defaultFallbackPass = envBirthdayPassword || '';
    if (cardPendingEdit.type === 'engagement') defaultFallbackPass = envEngagementPassword || '';
    if (cardPendingEdit.type === 'fireworks') defaultFallbackPass = envFireworksPassword || '';

    const cardPass = cardPendingEdit.password?.trim();
    const fallbackPass = defaultFallbackPass.trim();
    const entered = editPasswordInput.trim();

    // Verify against card password, category env password, or universal couple unlock codes ('love', '1234')
    const isValid = 
      (cardPass && entered === cardPass) ||
      (fallbackPass && entered === fallbackPass) ||
      (!cardPass && !fallbackPass && entered.length > 0) ||
      entered === 'love' ||
      entered === '1234' ||
      (currentUser && entered.toLowerCase() === currentUser.toLowerCase()) ||
      (coupleTenant && entered.toLowerCase() === coupleTenant.partner1?.toLowerCase()) ||
      (coupleTenant && entered.toLowerCase() === coupleTenant.partner2?.toLowerCase());

    if (isValid) {
      const targetCard = cardPendingEdit;
      setIsEditPasswordModalOpen(false);
      setCardPendingEdit(null);
      openEditModal(targetCard);
    } else {
      setEditShakeError(true);
      setEditPasswordError('Incorrect password! Enter the secret card passcode to edit.');
      setEditPasswordInput('');
      setTimeout(() => setEditShakeError(false), 500);
    }
  };

  const openEditModal = (card: CelebrationCard, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setEditingCardId(card.id);
    setFormType(card.type);
    const cleanTitle = (card.title || '').replace(/(\b[1-9]\d*)\1(st|nd|rd|th)\b/gi, '$1$2');
    setFormTitle(cleanTitle);
    setIsTitleManuallyEdited(true);
    setFormPartnerName(card.partnerName || '');
    const origDate = card.originalDate || (card.type === 'birthday' && card.targetDate ? card.targetDate : '');
    setFormOriginalDate(origDate);
    setFormTargetDate(card.targetDate);
    setFormAge(card.age);
    setFormPasswordEnabled(!!(card.password && card.password.trim().length > 0));
    setFormPassword(card.password || '');
    setFormLetter(card.letter || '');
    setFormThemeColor(card.themeColor || 'rose');
    const defaultTrack = availableTracks.find(t => t.category === (card.type === 'birthday' ? 'birthday' : 'celebration')) || availableTracks[0];
    setFormMusicUrl(card.musicUrl || defaultTrack?.url || '/choose/music/birthdaysong.mp3');
    setFormSelectedPhotos(card.photos || []);
    setIsEditorModalOpen(true);
  };

  // SAVE CARD (CREATE OR UPDATE)
  const handleSaveCard = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim()) return;

    if (editingCardId) {
      // UPDATE EXISTING
      const updated = cards.map((c) => {
        if (c.id === editingCardId) {
          return {
            ...c,
            type: formType,
            title: formTitle.trim(),
            partnerName: formPartnerName.trim() || undefined,
            originalDate: formOriginalDate.trim() || undefined,
            targetDate: formTargetDate,
            age: formAge ? Number(formAge) : undefined,
            password: formPasswordEnabled ? formPassword.trim() : '',
            letter: formLetter,
            themeColor: formThemeColor,
            musicUrl: formMusicUrl,
            photos: formSelectedPhotos,
            updatedAt: new Date().toISOString()
          };
        }
        return c;
      });
      persistCards(updated);
      
      const updatedCard = updated.find((c) => c.id === editingCardId);
      if (updatedCard) {
        saveCelebrationCardDoc(updatedCard);
      }

      // Sync activeCard if currently viewing this card
      if (activeCard && activeCard.id === editingCardId) {
        if (updatedCard) setActiveCard(updatedCard);
      }

      if (onLogActivity) {
        onLogActivity('card_updated', `Updated celebration card "${formTitle}" with ${formSelectedPhotos.length} photos`);
      }
      confetti({ particleCount: 50, spread: 60, origin: { y: 0.6 } });
    } else {
      // CREATE NEW CARD
      const newCard: CelebrationCard = {
        id: `card_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        coupleId: coupleId,
        userId: currentUser,
        createdBy: currentUser,
        type: formType,
        title: formTitle.trim(),
        partnerName: formPartnerName.trim() || undefined,
        originalDate: formOriginalDate.trim() || undefined,
        targetDate: formTargetDate,
        age: formAge ? Number(formAge) : undefined,
        password: formPasswordEnabled ? formPassword.trim() : '',
        letter: formLetter,
        themeColor: formThemeColor,
        musicUrl: formMusicUrl,
        photos: formSelectedPhotos,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      persistCards([newCard, ...cards]);
      saveCelebrationCardDoc(newCard);
      if (onLogActivity) {
        onLogActivity('card_created', `Created celebration card "${formTitle}" with ${formSelectedPhotos.length} gallery photos`);
      }
      confetti({ particleCount: 70, spread: 70, origin: { y: 0.6 } });

      // Dispatch Telegram Celebration Card Creation Alert
      sendTelegramAlert(
        formatCelebrationCardTelegramMessage(
          currentUser,
          newCard.title,
          newCard.type,
          newCard.targetDate,
          'created'
        ),
        'card',
        {
          coupleId,
          excludeUsername: currentUser,
          adminSettings,
          userAccounts
        }
      ).catch(() => {});
    }

    setIsEditorModalOpen(false);
  };

  // DELETE CARD
  const handleDeleteCard = (card: CelebrationCard, e: React.MouseEvent) => {
    e.stopPropagation();
    setCardToDelete(card);
  };

  const confirmDeleteCard = () => {
    if (!cardToDelete) return;
    const remaining = cards.filter((c) => c.id !== cardToDelete.id);
    persistCards(remaining);
    deleteCelebrationCardDoc(cardToDelete.id);
    if (onLogActivity) {
      onLogActivity('card_deleted', `Deleted celebration card "${cardToDelete.title}"`);
    }
    setCardToDelete(null);
  };

  // GALLERY PHOTO SELECTION TOGGLE IN EDITOR
  const toggleSelectGalleryPhoto = (photo: GalleryPhotoItem) => {
    const exists = formSelectedPhotos.some((p) => p.src === photo.url);
    if (exists) {
      setFormSelectedPhotos(formSelectedPhotos.filter((p) => p.src !== photo.url));
    } else {
      setFormSelectedPhotos([
        ...formSelectedPhotos,
        {
          id: photo.id,
          src: photo.url,
          caption: photo.title || 'Our Sweet Moment 💕',
          sourceItemTitle: photo.source
        }
      ]);
    }
  };

  // Helper to downscale and compress mobile camera photos to ~150KB to avoid localStorage & Firestore quota crashes
  const compressImageForUpload = (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const rawData = e.target?.result as string;
        if (!rawData) {
          resolve('');
          return;
        }
        const img = new window.Image();
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            const MAX_WIDTH = 1280;
            const MAX_HEIGHT = 1280;
            let width = img.width;
            let height = img.height;

            if (width > height) {
              if (width > MAX_WIDTH) {
                height = Math.round(height * (MAX_WIDTH / width));
                width = MAX_WIDTH;
              }
            } else {
              if (height > MAX_HEIGHT) {
                width = Math.round(width * (MAX_HEIGHT / height));
                height = MAX_HEIGHT;
              }
            }

            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.drawImage(img, 0, 0, width, height);
              const compressed = canvas.toDataURL('image/jpeg', 0.82);
              resolve(compressed);
              return;
            }
          } catch (canvasErr) {
            console.warn("Canvas compression failed, falling back to raw data:", canvasErr);
          }
          resolve(rawData);
        };
        img.onerror = () => resolve(rawData);
        img.src = rawData;
      };
      reader.onerror = () => resolve('');
      reader.readAsDataURL(file);
    });
  };

  // UPLOAD NEW PHOTOS DIRECTLY TO CARD & AUTOMATICALLY SAVE TO GALLERY (MULTI-FILE SUPPORT)
  const handleUploadPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setIsUploadingPhoto(true);
    let successCount = 0;

    try {
      const newCardPhotos: Array<{ id: string; src: string; caption: string; sourceItemTitle: string }> = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setUploadProgressText(files.length > 1 ? `Uploading ${i + 1} of ${files.length}...` : 'Optimizing photo...');

        const compressedDataUrl = await compressImageForUpload(file);
        if (!compressedDataUrl) continue;

        const photoCaption = file.name.replace(/\.[^/.]+$/, '').trim() || `${formTitle || 'Celebration'} Photo ${formSelectedPhotos.length + successCount + 1}`;
        const photoId = `upload-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

        // 1. Add to active celebration card form photos
        newCardPhotos.push({
          id: photoId,
          src: compressedDataUrl,
          caption: photoCaption,
          sourceItemTitle: 'Direct Upload'
        });

        // 2. CRITICAL USER REQUIREMENT: Save to Gallery & Scrapbook
        const newMemory: Memory = {
          id: `mem_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          title: photoCaption,
          category: (formType === 'birthday' ? 'birthday' : formType === 'engagement' ? 'engagement' : 'other') as MilestoneCategory,
          date: formTargetDate || new Date().toISOString().split('T')[0],
          description: `Photo attached to celebration card "${formTitle || formPartnerName || 'Love'}"`,
          url: compressedDataUrl,
          type: 'image',
          createdBy: currentUser || 'Me',
          coupleId: coupleId
        };

        if (onAddMemory) {
          onAddMemory(newMemory);
        } else {
          // Fallback to storage directly
          const currentMems = storage.getMemories();
          storage.saveMemories([newMemory, ...currentMems]);
        }

        successCount++;
      }

      if (newCardPhotos.length > 0) {
        setFormSelectedPhotos((prev) => [...prev, ...newCardPhotos]);
      }

      if (onLogActivity && successCount > 0) {
        onLogActivity('photo_uploaded', `Uploaded ${successCount} photo(s) to celebration card and saved to gallery`);
      }
    } catch (err) {
      console.error("Multi-photo upload error:", err);
    } finally {
      setIsUploadingPhoto(false);
      setUploadProgressText('');
      e.target.value = '';
    }
  };

  // LOVE METER CLICK HANDLER
  const handleLoveMeterClick = () => {
    if (loveMeterClicks >= 8) return;
    const nextClicks = loveMeterClicks + 1;
    setLoveMeterClicks(nextClicks);

    const messages = [
      "Aww, starting sweet! 💕",
      "Getting warmer! 🔥",
      "I feel the spark! ✨",
      "Halfway to infinite! 👩‍❤️‍👨",
      "So much love in your heart! ❤️",
      "My heart is full! 🥰",
      "Almost exploding with joy! 💓",
      "YOU LOVE ME SO MUCH! ❤️💍✨"
    ];
    setLoveMeterMsg(messages[nextClicks - 1]);
    setShowLoveMeterMsg(true);

    if (nextClicks === 8) {
      confetti({
        particleCount: 120,
        spread: 80,
        origin: { y: 0.6 },
        colors: ['#ff69b4', '#ff1493', '#ffd700']
      });
    }

    setTimeout(() => {
      setShowLoveMeterMsg(false);
    }, 4500);
  };

  // FILTERED CARDS
  const filteredCards = useMemo(() => {
    if (activeFilter === 'all') return cards;
    if (activeFilter === 'other') {
      return cards.filter((c) => c.type !== 'birthday' && c.type !== 'engagement' && c.type !== 'fireworks');
    }
    return cards.filter((c) => c.type === activeFilter);
  }, [cards, activeFilter]);

  // ANNIVERSARY COUNTER FOR ACTIVE CELEBRATION
  const annivInfo = useMemo(() => {
    if (!activeCard) return { daysToNext: 0, yearsSince: 0, progressPercent: 100 };
    const dateStr = activeCard.targetDate || '2025-11-01';
    const target = new Date(dateStr);
    const now = new Date();
    target.setHours(0, 0, 0, 0);
    now.setHours(0, 0, 0, 0);

    const diffTime = target.getTime() - now.getTime();
    const daysToNext = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    const yearsSince = Math.abs(now.getFullYear() - target.getFullYear());

    return {
      daysToNext: Math.abs(daysToNext),
      yearsSince,
      isPast: diffTime < 0,
      progressPercent: Math.min(Math.max(100 - (Math.abs(daysToNext) % 365) / 3.65, 10), 100)
    };
  }, [activeCard]);

  // TARGET CELEBRATION SUMMARY FOR ACTIVE CARD
  const activeCardTargetSummary = useMemo<CelebrationTargetSummary | null>(() => {
    if (!activeCard) return null;
    return calculateCelebrationTarget(activeCard.type, activeCard.originalDate, activeCard.targetDate, activeCard.age);
  }, [activeCard]);

  return (
    <div className="w-full max-w-5xl mx-auto px-4 py-3 relative">
      
      {/* HTML5 AUDIO ELEMENT FOR ACTIVE CELEBRATION */}
      <audio 
        key={`celebration-audio-${activeCard?.id || 'none'}-${activeCard?.musicUrl || 'birthdaysong'}`}
        ref={audioRef} 
        src={activeCard?.musicUrl || '/choose/music/birthdaysong.mp3'} 
        loop 
        preload="auto"
      />

      {/* HIDDEN PREVIEW AUDIO ELEMENT FOR CARD EDITOR */}
      <audio 
        ref={previewAudioRef} 
        preload="none"
      />

      <AnimatePresence mode="wait">
        
        {/* ========================================================= */}
        {/* VIEW 1: START SCREEN - CARDS HUB WITH GALLERY DEPENDENCY  */}
        {/* ========================================================= */}
        {currentView === 'start' && (
          <motion.div
            key="start-screen"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            className="space-y-8 relative overflow-hidden"
          >
            {/* FLOATING HEARTS BACKGROUND */}
            <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden">
              {petals.map((p, idx) => (
                <div
                  key={`petal-${p.id || idx}-${idx}`}
                  className="absolute w-4 h-4 opacity-40 bg-rose-500 rounded-full"
                  style={{
                    left: p.left,
                    top: p.top,
                    transform: `translate(${p.x0}, ${p.y0})`,
                    animation: `float-slow ${p.duration} infinite ease-in-out`,
                    animationDelay: p.delay,
                    backgroundImage: `url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23f43f5e"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>')`,
                    backgroundSize: 'contain',
                    backgroundRepeat: 'no-repeat',
                  }}
                />
              ))}
            </div>

            {/* HEADER & ACTION CONTROLS */}
            <div className="text-center space-y-3 relative z-10 pt-2">
              <div className="flex flex-wrap items-center justify-center gap-2">
                <span className="text-[10px] uppercase font-extrabold tracking-widest bg-rose-500/10 border border-rose-500/20 text-rose-300 px-3.5 py-1 rounded-full">
                  💝 Our Celebration Deck & Interactive Cards 💝
                </span>
                <span className="text-[10px] uppercase font-bold tracking-wider bg-white/5 border border-white/10 text-neutral-300 px-2.5 py-1 rounded-full flex items-center gap-1.5">
                  <Images className="w-3 h-3 text-rose-400" />
                  {galleryPhotos.length} Gallery Photos Available
                </span>
              </div>

              <h1 className="font-serif text-3xl sm:text-4xl md:text-5xl font-bold text-white tracking-tight leading-tight">
                Our Secret Celebration Cards
              </h1>
              
              <p className="text-xs sm:text-sm text-neutral-400 max-w-xl mx-auto leading-relaxed">
                Password-protected, gallery-integrated visual cards with custom photo memories, countdown locks, romantic letters, and festive music.
              </p>

              {/* ACTION BAR: CREATE CARD BUTTON & FILTER TABS */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-3 max-w-4xl mx-auto border-t border-white/5">
                
                {/* Filter Chips */}
                <div className="flex items-center gap-1.5 bg-neutral-900/80 p-1 rounded-xl border border-white/10 overflow-x-auto">
                  <button
                    type="button"
                    onClick={() => setActiveFilter('all')}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                      activeFilter === 'all' ? 'bg-rose-600 text-white shadow-sm' : 'text-neutral-400 hover:text-white'
                    }`}
                  >
                    All ({cards.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveFilter('birthday')}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                      activeFilter === 'birthday' ? 'bg-rose-600 text-white shadow-sm' : 'text-neutral-400 hover:text-white'
                    }`}
                  >
                    Birthdays 🎂
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveFilter('engagement')}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                      activeFilter === 'engagement' ? 'bg-rose-600 text-white shadow-sm' : 'text-neutral-400 hover:text-white'
                    }`}
                  >
                    Engagements 💍
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveFilter('fireworks')}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                      activeFilter === 'fireworks' ? 'bg-rose-600 text-white shadow-sm' : 'text-neutral-400 hover:text-white'
                    }`}
                  >
                    Fireworks 🎆
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveFilter('other')}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                      activeFilter === 'other' ? 'bg-rose-600 text-white shadow-sm' : 'text-neutral-400 hover:text-white'
                    }`}
                  >
                    Custom ✨
                  </button>
                </div>

                {/* CREATE NEW CARD TRIGGER */}
                <button
                  type="button"
                  onClick={openCreateModal}
                  className="px-4 py-2 bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 text-white rounded-xl shadow-lg border border-white/15 text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-all transform hover:-translate-y-0.5 cursor-pointer ml-auto"
                >
                  <Plus className="w-4 h-4" />
                  Create Celebration Card
                </button>
              </div>
            </div>

            {/* REACTIVE DATE / COUNTDOWN BANNER */}
            <AnimatePresence>
              {dateMessage && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="bg-rose-950/60 border border-rose-500/30 text-rose-200 p-3.5 rounded-xl text-center text-xs max-w-md mx-auto flex items-center gap-2.5 justify-center shadow-lg relative z-20"
                >
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>{dateMessage}</span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* ======================================================= */}
            {/* CARDS GRID - INTERACTIVE CARDS WITH PHOTO ATTACHMENTS  */}
            {/* ======================================================= */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 relative z-10 max-w-5xl mx-auto">
              {filteredCards.map((card, index) => {
                const theme = THEME_STYLES[card.themeColor || 'rose'] || THEME_STYLES.rose;
                const photoCount = (card.photos && card.photos.length > 0) ? card.photos.length : galleryPhotos.length;
                const hasPassword = !!(card.password && card.password.trim().length > 0);
                const isCreator = card.createdBy === currentUser;
                const cardTargetSummary = calculateCelebrationTarget(card.type, card.originalDate, card.targetDate, card.age);

                return (
                  <motion.div
                    key={`card-${card.id}-${index}`}
                    whileHover={{ y: -4 }}
                    transition={{ duration: 0.2 }}
                    className="bg-neutral-900/90 border border-white/10 rounded-2xl p-5 shadow-xl hover:border-white/20 transition-all flex flex-col justify-between relative group overflow-hidden"
                  >
                    {/* Top ambient glow */}
                    <div className={`absolute top-0 right-0 w-32 h-32 bg-gradient-to-br ${theme.gradient} opacity-10 rounded-full blur-2xl pointer-events-none`} />

                    <div>
                      {/* Top Badges & Actions */}
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <span className={`text-[9px] uppercase font-extrabold tracking-wider px-2.5 py-0.5 rounded-full border ${theme.badge}`}>
                          {card.type === 'birthday' ? '🎂 Birthday' : card.type === 'engagement' ? '💍 Engagement' : card.type === 'fireworks' ? '🎆 Fireworks' : '✨ Celebration'}
                        </span>

                        {/* Edit & Delete Buttons */}
                        <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                          <button
                            type="button"
                            onClick={(e) => handleInitiateEdit(card, e)}
                            title="Edit this card (Password protected)"
                            className="p-1.5 bg-white/5 hover:bg-white/15 text-neutral-300 hover:text-white rounded-lg transition-colors cursor-pointer"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => handleDeleteCard(card, e)}
                            title="Delete this card"
                            className="p-1.5 bg-white/5 hover:bg-rose-500/20 text-neutral-300 hover:text-rose-400 rounded-lg transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Card Title & Target Person */}
                      <h3 className="font-serif text-xl font-bold text-white tracking-tight mb-1 group-hover:text-rose-300 transition-colors">
                        {(card.title || '').replace(/(\b[1-9]\d*)\1(st|nd|rd|th)\b/gi, '$1$2')}
                      </h3>
                      
                      {card.partnerName && (
                        <div className="flex items-center gap-1 text-xs text-neutral-300 mb-2">
                          <User className="w-3.5 h-3.5 text-rose-400" />
                          <span>{card.partnerName}</span>
                        </div>
                      )}

                      {/* Assigned Soundtrack Badge */}
                      <div className="flex items-center gap-1.5 text-[11px] text-purple-300 bg-purple-950/40 border border-purple-500/20 px-2.5 py-1 rounded-lg mb-2.5 truncate" title={`Assigned Soundtrack: ${getTrackTitle(card.musicUrl)}`}>
                        <Music className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                        <span className="truncate font-medium">{getTrackTitle(card.musicUrl)}</span>
                      </div>

                      {/* Celebration Target Box with Smooth Marquee Text */}
                      <div className="bg-gradient-to-r from-rose-950/40 via-neutral-950 to-purple-950/30 border border-white/10 rounded-xl p-2.5 mb-3 overflow-hidden">
                        <div className="flex items-center justify-between gap-2 overflow-hidden">
                          <div className="flex items-center gap-1.5 overflow-hidden flex-1 min-w-0">
                            <Sparkles className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                            <div className="overflow-hidden flex-1 min-w-0 mask-marquee-edges">
                              <div className="animate-marquee items-center gap-6 text-[11px] font-bold text-white cursor-default">
                                <span>{cardTargetSummary.milestoneLabel}</span>
                                <span className="text-rose-400/60 text-[9px]">✦</span>
                                <span>{cardTargetSummary.milestoneLabel}</span>
                                <span className="text-rose-400/60 text-[9px]">✦</span>
                              </div>
                            </div>
                          </div>
                          <span className={`text-[9px] font-bold font-mono px-2 py-0.5 rounded-md border whitespace-nowrap shrink-0 ${
                            cardTargetSummary.isToday 
                              ? 'bg-rose-500 text-white border-rose-400 animate-pulse' 
                              : 'bg-white/5 text-rose-300 border-white/10'
                          }`}>
                            {cardTargetSummary.countdownBadge}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Bottom Launch Button */}
                    <div className="space-y-2 pt-2 border-t border-white/5">
                      <button
                        type="button"
                        onClick={() => handleCardClick(card)}
                        className={`w-full py-3 px-4 bg-gradient-to-r ${theme.button} text-white rounded-xl shadow-md font-semibold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all transform hover:scale-[1.02] cursor-pointer`}
                      >
                        <Sparkles className="w-4 h-4" />
                        Celebrate Moment
                      </button>

                      {/* User & Couple Scoping footer */}
                      <div className="flex items-center justify-between text-[10px] text-neutral-500 px-1">
                        <span>By {card.createdBy || 'Shared Space'}</span>
                        <span className="italic">{card.type === 'fireworks' ? '🎆 Sky Show' : '💖 Visual Timeline'}</span>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>

            {/* EMPTY STATE */}
            {filteredCards.length === 0 && (
              <div className="text-center py-12 bg-neutral-900/60 border border-white/10 rounded-2xl p-6 sm:p-8 max-w-lg mx-auto shadow-2xl backdrop-blur-sm">
                <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center mx-auto mb-3 text-rose-400">
                  <Gift className="w-7 h-7" />
                </div>
                <h4 className="text-base font-serif font-bold text-white mb-1.5">
                  {cards.length === 0 ? 'No Celebration Cards Yet' : 'No Cards In This Category'}
                </h4>
                <p className="text-xs text-neutral-400 max-w-sm mx-auto mb-5 leading-relaxed">
                  {cards.length === 0
                    ? 'All default cards have been cleared. You have total creative freedom to build personalized cards for Birthdays, Engagements, Fireworks, and Anniversaries with your own photos!'
                    : `There are currently no cards under the "${activeFilter}" filter. Switch categories or craft a new celebration card!`}
                </p>
                <button
                  type="button"
                  onClick={openCreateModal}
                  className="px-5 py-2.5 bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 text-white text-xs font-bold uppercase tracking-wider rounded-xl shadow-lg transition-all transform hover:scale-105 cursor-pointer inline-flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Create Your First Card
                </button>
              </div>
            )}

            {/* ======================================================= */}
            {/* INTERACTIVE ROW: SCRATCH CARD, LOVE METER & DAILY QUOTE */}
            {/* ======================================================= */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative z-10 pt-4 border-t border-white/5">
              
              {/* Daily Scratch Card */}
              <div className="bg-neutral-900 border border-white/10 rounded-2xl p-5 flex flex-col items-center text-center space-y-4 shadow-xl">
                <div>
                  <h3 className="font-serif text-lg font-semibold text-rose-300">Scratch Daily! 💖</h3>
                  <p className="text-[10px] text-neutral-400">Reveal a unique sweet love note today</p>
                </div>

                <div className="relative w-[180px] h-[220px] rounded-xl overflow-hidden border border-white/10 cursor-crosshair bg-neutral-950">
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-rose-950/30 text-rose-200 p-4 text-xs font-semibold leading-relaxed font-serif select-none">
                    <Heart className={`w-6 h-6 text-rose-500 fill-rose-500 mb-2 ${isScratched ? 'animate-bounce' : 'animate-pulse'}`} />
                    <span className="text-center">"{scratchedNote}"</span>
                  </div>

                  <canvas
                    ref={setScratchCanvasRef}
                    width={180}
                    height={220}
                    className={`absolute inset-0 z-10 transition-opacity duration-500 touch-none select-none ${
                      isScratched ? 'opacity-0 pointer-events-none' : 'opacity-100'
                    }`}
                    onMouseMove={(e) => {
                      if (e.buttons === 1) handleScratchMove(e.clientX, e.clientY);
                    }}
                    onTouchMove={(e) => {
                      if (e.touches[0]) handleScratchMove(e.touches[0].clientX, e.touches[0].clientY);
                    }}
                    onMouseDown={(e) => {
                      if (e.button === 0) handleScratchMove(e.clientX, e.clientY);
                    }}
                    onTouchStart={(e) => {
                      if (e.touches[0]) handleScratchMove(e.touches[0].clientX, e.touches[0].clientY);
                    }}
                  />
                </div>

                <button
                  type="button"
                  onClick={() => {
                    let newNote = scratchedNote;
                    const otherNotes = LOVE_NOTES.filter(n => n !== scratchedNote);
                    if (otherNotes.length > 0) {
                      newNote = otherNotes[Math.floor(Math.random() * otherNotes.length)];
                    }
                    setScratchedNote(newNote);
                    setIsScratched(false);
                    if (scratchCanvasRef.current) initCanvas(scratchCanvasRef.current);
                  }}
                  className="text-[10px] text-rose-400 hover:text-rose-300 font-semibold uppercase tracking-wider underline cursor-pointer"
                >
                  Regenerate Scratch Card
                </button>
              </div>

              {/* Love Meter */}
              <div className="bg-neutral-900 border border-white/10 rounded-2xl p-5 flex flex-col items-center text-center justify-between shadow-xl min-h-[300px]">
                <div className="space-y-1">
                  <h3 className="font-serif text-lg font-semibold text-rose-300">Love Meter 💞</h3>
                  <p className="text-[10px] text-neutral-400">How much do you love me today?</p>
                </div>

                <div className="space-y-4 my-2">
                  <button
                    type="button"
                    onClick={handleLoveMeterClick}
                    className="text-2xl tracking-wider select-none focus:outline-none block hover:scale-105 transition-transform duration-100 cursor-pointer"
                  >
                    {Array.from({ length: 8 }).map((_, idx) => (
                      <span key={`love-meter-${idx}`}>{idx < loveMeterClicks ? '❤️' : '⬜'}</span>
                    ))}
                  </button>

                  <div className="h-12 flex items-center justify-center">
                    <AnimatePresence mode="wait">
                      {showLoveMeterMsg && (
                        <motion.p
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.9 }}
                          className="text-xs text-rose-200 font-semibold font-serif italic max-w-[180px]"
                        >
                          "{loveMeterMsg}"
                        </motion.p>
                      )}
                    </AnimatePresence>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setLoveMeterClicks(0);
                    setLoveMeterMsg('');
                    setShowLoveMeterMsg(false);
                  }}
                  className="text-[10px] text-neutral-500 hover:text-neutral-400 font-semibold uppercase tracking-wider underline cursor-pointer"
                >
                  Reset Love Meter
                </button>
              </div>

              {/* Daily Quote Card */}
              <div className="bg-neutral-900 border border-white/10 rounded-2xl p-5 flex flex-col items-center text-center justify-between shadow-xl min-h-[300px]">
                <div className="space-y-1">
                  <h3 className="font-serif text-lg font-semibold text-rose-300">Daily Love Message 💌</h3>
                  <p className="text-[10px] text-neutral-400">A romantic quote for my favorite person</p>
                </div>

                <div className="flex-1 flex items-center justify-center p-4">
                  <blockquote className="font-serif text-sm text-neutral-200 italic leading-relaxed">
                    "{dailyQuote}"
                    <span className="block text-[10px] text-rose-400 not-italic uppercase font-semibold mt-2 tracking-widest">— Your Forever</span>
                  </blockquote>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    const nextQ = LOVE_QUOTES[Math.floor(Math.random() * LOVE_QUOTES.length)];
                    setDailyQuote(nextQ);
                  }}
                  className="text-[10px] text-rose-400 hover:text-rose-300 font-semibold uppercase tracking-wider underline cursor-pointer"
                >
                  Next Quote
                </button>
              </div>

            </div>

          </motion.div>
        )}

        {/* ========================================================= */}
        {/* VIEW 2: CELEBRATE SCREEN (CAROUSEL, MUSIC, LETTER, FX)   */}
        {/* ========================================================= */}
        {currentView === 'celebrate' && activeCard && (
          <motion.div
            key="celebrate-screen"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            className="space-y-8 relative"
          >
            {/* Back button & chapter badge */}
            <div className="flex justify-between items-center border-b border-white/5 pb-4">
              <button
                type="button"
                onClick={() => {
                  if (audioRef.current) audioRef.current.pause();
                  setIsPlayingMusic(false);
                  setCurrentView('start');
                }}
                className="inline-flex items-center gap-1.5 text-neutral-400 hover:text-white transition-colors text-xs font-semibold uppercase tracking-wider cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" /> Back to celebration cards
              </button>

              <div className="flex items-center gap-2">
                <span className="text-[9px] uppercase font-bold tracking-widest px-2.5 py-0.5 rounded-full bg-rose-500/10 text-rose-300 border border-rose-500/20">
                  {activeCard.type === 'birthday' ? '🎂 Birthday Chapter' : activeCard.type === 'engagement' ? '💍 Engagement Chapter' : '✨ Celebration Chapter'}
                </span>
                <button
                  type="button"
                  onClick={(e) => handleInitiateEdit(activeCard, e)}
                  className="inline-flex items-center gap-1 text-[10px] text-neutral-400 hover:text-white bg-white/5 px-2.5 py-0.5 rounded-full border border-white/10 cursor-pointer"
                >
                  <Edit2 className="w-3 h-3" /> Edit Card (Password Required)
                </button>
              </div>
            </div>

            {/* Celebrate Header / Banner */}
            <div className="text-center space-y-2">
              <h1 className="font-serif text-3xl sm:text-4xl md:text-5xl font-extrabold text-white tracking-tight leading-tight">
                {(activeCard.title || '').replace(/(\b[1-9]\d*)\1(st|nd|rd|th)\b/gi, '$1$2')}
              </h1>
              <p className="font-serif text-base sm:text-lg text-rose-300 italic">
                {activeCard.type === 'birthday' && activeCard.age 
                  ? `Turning ${activeCard.age} years beautiful today! 🎉`
                  : activeCard.partnerName 
                    ? `Dedicated with all my heart to ${activeCard.partnerName} 💖`
                    : `Our forever milestone together 💕`
                }
              </p>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs text-neutral-300">
                <Images className="w-3.5 h-3.5 text-rose-400" />
                <span>{activeCardPhotos.length} {activeCardPhotos.length === 1 ? 'Photo' : 'Photos'} in this {activeCard.type} celebration</span>
                {activeCardPhotos.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setPhotoViewAllModalOpen(true)}
                    className="text-rose-400 hover:text-rose-300 underline font-semibold text-[11px] cursor-pointer ml-1"
                  >
                    View All
                  </button>
                )}
              </div>
            </div>

            {/* TARGET CELEBRATION SPOTLIGHT BANNER */}
            {activeCardTargetSummary && (
              <div className="bg-gradient-to-r from-rose-950/40 via-neutral-900 to-purple-950/30 border border-rose-500/30 rounded-2xl p-4 sm:p-5 shadow-xl max-w-2xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
                <div className="space-y-1">
                  <div className="flex items-center justify-center sm:justify-start gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-yellow-400" />
                    <span className="text-[10px] uppercase font-mono font-bold tracking-widest text-rose-400">
                      Target of Celebration
                    </span>
                  </div>
                  <h3 className="font-serif text-lg sm:text-xl font-bold text-white">
                    {activeCardTargetSummary.milestoneLabel}
                  </h3>
                  <p className="text-xs text-neutral-300">
                    Celebration Date: <strong className="text-white font-mono">{activeCardTargetSummary.formattedTargetDate}</strong>
                    {activeCard.originalDate && (
                      <span className="text-neutral-500 ml-2">
                        ({activeCard.type === 'birthday' ? 'Born' : 'Original Event'}: {activeCard.originalDate})
                      </span>
                    )}
                  </p>
                </div>

                <div className="shrink-0 flex flex-col items-center sm:items-end gap-1">
                  <span className={`text-xs font-bold font-mono px-3.5 py-1.5 rounded-xl border ${
                    activeCardTargetSummary.isToday 
                      ? 'bg-rose-500 text-white border-rose-400 animate-pulse text-sm' 
                      : 'bg-white/10 text-yellow-300 border-white/20'
                  }`}>
                    {activeCardTargetSummary.countdownBadge}
                  </span>
                  <span className="text-[10px] text-neutral-400">
                    {activeCardTargetSummary.isToday ? '🎉 Celebration Day!' : `${activeCardTargetSummary.daysRemaining} days remaining`}
                  </span>
                </div>
              </div>
            )}

            {/* ANNIVERSARY REMINDER / TOGETHER COUNTER */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-gradient-to-br from-neutral-900/90 to-rose-950/20 border border-white/10 rounded-2xl p-6 shadow-2xl relative overflow-hidden">
              <div className="space-y-3">
                <span className="text-[10px] uppercase font-extrabold tracking-widest text-rose-400 block">
                  Our Forever Milestone Counters
                </span>
                <p className="font-serif text-lg text-white">
                  {annivInfo.isPast ? (
                    <>Celebrating <strong className="text-rose-400">{annivInfo.daysToNext}</strong> days of our milestone! 💕</>
                  ) : (
                    <>Milestone countdown is in <strong className="text-rose-400">{annivInfo.daysToNext}</strong> days! 💕</>
                  )}
                </p>
                <p className="text-xs sm:text-sm text-neutral-300 leading-relaxed">
                  {activeCard.type === 'birthday' 
                    ? `A whole year of bringing sunlight, smiles, and laughter into my world!`
                    : `Cherishing every heartbeat and memory since ${activeCard.targetDate}!`
                  }
                </p>
              </div>

              {/* Progress Bar */}
              <div className="flex flex-col justify-center space-y-2.5 border-t md:border-t-0 md:border-l border-white/5 pt-4 md:pt-0 md:pl-6">
                <div className="flex justify-between items-center text-xs font-semibold">
                  <span className="text-neutral-400 uppercase tracking-wider text-[10px]">Milestone Journey</span>
                  <span className="text-rose-400">{annivInfo.daysToNext} days</span>
                </div>
                <div className="w-full bg-neutral-950 h-3.5 rounded-full border border-white/10 p-[2px] overflow-hidden">
                  <div 
                    className="h-full rounded-full bg-gradient-to-r from-rose-500 via-purple-500 to-pink-500 shadow-[0_0_10px_rgba(244,63,94,0.4)]"
                    style={{ width: `${annivInfo.progressPercent}%` }}
                  />
                </div>
                <div className="text-[10px] text-neutral-400 text-center italic">
                  Cycle Progress: {annivInfo.progressPercent.toFixed(1)}% of our journey!
                </div>
              </div>
            </div>

            {/* Countdown Flip text banner */}
            <div className="bg-neutral-900 border border-white/10 rounded-xl p-4 text-center overflow-hidden">
              <span className="block text-[10px] uppercase font-extrabold tracking-widest text-neutral-400 mb-1">
                Whispers from my heart
              </span>
              <AnimatePresence mode="wait">
                <motion.p
                  key={`whisper-flip-${flipIndex}`}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -15 }}
                  transition={{ duration: 0.5 }}
                  className="font-serif text-lg sm:text-xl font-bold text-yellow-300 drop-shadow-[0_0_12px_rgba(253,224,71,0.3)]"
                >
                  {activeCard.type === 'birthday' 
                    ? ['Get ready for birthday magic! 🎂', 'Are you excited for the big day? 🎂', 'Counting down the hours... 🕒', 'A special surprise awaits! 🎁', 'I love you so much ❤️'][flipIndex % 5]
                    : ['Soon forever... 💍❤️', 'I cannot imagine my life without you 💍❤️', 'Always & forever together ❤️', 'I love you forever! 💕'][flipIndex % 4]
                  }
                </motion.p>
              </AnimatePresence>
            </div>

            {/* ======================================================= */}
            {/* DYNAMIC ROMANTIC CAROUSEL FROM GALLERY PHOTOS           */}
            {/* ======================================================= */}
            <div className="relative max-w-sm mx-auto">
              <div className="absolute top-0 right-0 w-32 h-32 bg-rose-500/5 rounded-full blur-2xl -mr-12 -mt-12 pointer-events-none" />
              
              <div className="bg-neutral-900 rounded-3xl p-4 border border-white/10 shadow-2xl relative flex flex-col justify-between aspect-[3/4] overflow-hidden group">
                
                {/* Photo Display */}
                <div className="flex-1 w-full rounded-2xl overflow-hidden bg-neutral-950 relative">
                  {activeCardPhotos.length > 0 ? (
                    <img 
                      src={activeCardPhotos[carouselIndex % activeCardPhotos.length]?.src || ''} 
                      alt={activeCardPhotos[carouselIndex % activeCardPhotos.length]?.caption || 'Romantic memory'}
                      className="w-full h-full object-contain object-center scale-95 hover:scale-100 transition-transform duration-500"
                      onError={(e) => {
                        e.currentTarget.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 24 24" fill="none" stroke="%23333" stroke-width="1"><rect width="20" height="20" x="2" y="2" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>';
                      }}
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center text-neutral-500">
                      <Image className="w-12 h-12 mb-2 opacity-50" />
                      <p className="text-xs">No photos attached yet.</p>
                      <button
                        type="button"
                        onClick={(e) => handleInitiateEdit(activeCard, e)}
                        className="mt-2 text-xs text-rose-400 underline font-semibold cursor-pointer"
                      >
                        Pick photos from Gallery (Password Required)
                      </button>
                    </div>
                  )}

                  {/* Carousel navigation arrows */}
                  {activeCardPhotos.length > 1 && (
                    <>
                      <button
                        type="button"
                        onClick={() => setCarouselIndex((prev) => (prev - 1 + activeCardPhotos.length) % activeCardPhotos.length)}
                        className="absolute left-3 top-1/2 -translate-y-1/2 p-2 bg-black/60 rounded-full hover:bg-rose-600 transition-colors cursor-pointer group-hover:scale-105"
                      >
                        <ArrowLeft className="w-4 h-4 text-white" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setCarouselIndex((prev) => (prev + 1) % activeCardPhotos.length)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 p-2 bg-black/60 rounded-full hover:bg-rose-600 transition-colors cursor-pointer group-hover:scale-105"
                      >
                        <ArrowRight className="w-4 h-4 text-white" />
                      </button>
                    </>
                  )}
                </div>

                {/* Caption overlay */}
                <div className="text-center pt-3 pb-1">
                  <p className="font-serif text-sm text-rose-300 font-semibold italic">
                    {activeCardPhotos.length > 0 
                      ? activeCardPhotos[carouselIndex % activeCardPhotos.length]?.caption 
                      : 'Our sweet love story'}
                  </p>
                  {activeCardPhotos.length > 0 && activeCardPhotos[carouselIndex % activeCardPhotos.length]?.sourceItemTitle && (
                    <span className="text-[10px] text-neutral-500 uppercase tracking-widest block mt-0.5">
                      Source: {activeCardPhotos[carouselIndex % activeCardPhotos.length]?.sourceItemTitle}
                    </span>
                  )}
                </div>
              </div>

              {/* Dots tracker */}
              {activeCardPhotos.length > 1 && (
                <div className="flex justify-center gap-2 mt-4">
                  {activeCardPhotos.map((_, i) => (
                    <button
                      key={`card-${activeCard?.id || 'active'}-photo-dot-${i}`}
                      onClick={() => setCarouselIndex(i)}
                      className={`w-2.5 h-2.5 rounded-full transition-all duration-300 cursor-pointer ${
                        i === (carouselIndex % activeCardPhotos.length) ? 'bg-rose-500 w-6' : 'bg-neutral-600 hover:bg-neutral-500'
                      }`}
                    />
                  ))}
                </div>
              )}

              {/* Attached Photos Thumbnail Reel */}
              {activeCardPhotos.length > 1 && (
                <div className="flex items-center justify-center gap-2 mt-3 overflow-x-auto p-1 max-w-sm mx-auto">
                  {activeCardPhotos.map((photo, i) => (
                    <button
                      key={`card-photo-thumb-${photo.id || i}-${i}`}
                      type="button"
                      onClick={() => setCarouselIndex(i)}
                      className={`w-11 h-11 rounded-xl overflow-hidden border-2 transition-all cursor-pointer shrink-0 ${
                        i === (carouselIndex % activeCardPhotos.length)
                          ? 'border-rose-500 ring-2 ring-rose-500/40 scale-105'
                          : 'border-white/10 opacity-60 hover:opacity-100 hover:border-white/30'
                      }`}
                      title={photo.caption}
                    >
                      <img src={photo.src} alt={photo.caption} className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* SOUNDTRACK BANNER IN CELEBRATION VIEW */}
            <div className="flex flex-wrap items-center justify-center gap-2 max-w-xl mx-auto py-2 px-4 bg-neutral-900/90 border border-purple-500/30 rounded-2xl text-xs text-purple-300 shadow-lg">
              <Disc className={`w-4 h-4 text-purple-400 shrink-0 ${isPlayingMusic ? 'animate-spin' : ''}`} style={{ animationDuration: '3.5s' }} />
              <span className="font-semibold text-white/90">Card Soundtrack:</span>
              <span className="truncate max-w-[280px] font-medium text-purple-200">
                {getTrackTitle(activeCard?.musicUrl)}
              </span>
              {isPlayingMusic && (
                <span className="flex items-center gap-0.5 text-purple-400 ml-1.5 shrink-0">
                  <span className="w-1 h-2.5 bg-purple-400 animate-pulse rounded-full" />
                  <span className="w-1 h-4 bg-pink-400 animate-pulse delay-75 rounded-full" />
                  <span className="w-1 h-2 bg-purple-400 animate-pulse delay-150 rounded-full" />
                </span>
              )}
            </div>

            {/* ACTION BUTTON GRID */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-xl mx-auto pt-2">
              <button
                type="button"
                onClick={triggerSpecialCelebration}
                className="py-3.5 px-6 bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 text-white rounded-xl shadow-md border border-white/15 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer transform hover:-translate-y-0.5"
              >
                <Sparkles className="w-4 h-4 animate-spin" />
                Celebrate Moment!
              </button>

              <button
                type="button"
                onClick={toggleMusic}
                className="py-3.5 px-6 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white rounded-xl shadow-md border border-white/15 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer transform hover:-translate-y-0.5"
              >
                {isPlayingMusic ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                {isPlayingMusic ? 'Pause Music' : 'Play Celebration Song'}
              </button>

              <button
                type="button"
                onClick={() => setIsLetterModalOpen(true)}
                className="py-3.5 px-6 bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-400 hover:to-purple-500 text-white rounded-xl shadow-md border border-white/15 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer transform hover:-translate-y-0.5"
              >
                <Mail className="w-4 h-4" />
                Read My Letter
              </button>
            </div>

            {/* CELEBRATION CAKE POPUP */}
            <AnimatePresence>
              {cakeVisible && (
                <motion.div
                  initial={{ opacity: 0, y: 50, scale: 0.8 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 50, scale: 0.8 }}
                  className="fixed bottom-10 left-1/2 -translate-x-1/2 bg-neutral-900 border-2 border-yellow-400/50 rounded-2xl p-4 shadow-[0_0_30px_rgba(234,179,8,0.2)] flex items-center gap-4 z-50 max-w-xs"
                >
                  <span className="text-4xl">🎂💍🍰</span>
                  <div>
                    <h4 className="font-serif text-sm font-bold text-white">Sweetest Celebration!</h4>
                    <p className="text-[10px] text-neutral-400">May all our days overflow with warmth and smiles! 🥂</p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

          </motion.div>
        )}

        {/* ========================================================= */}
        {/* VIEW 3: FIREWORKS CELEBRATION                             */}
        {/* ========================================================= */}
        {currentView === 'fireworks' && (
          <FireworksCelebration 
            onBack={() => setCurrentView('start')} 
            card={activeCard}
            photos={activeCardPhotos}
            onEdit={() => activeCard && handleInitiateEdit(activeCard)}
          />
        )}

      </AnimatePresence>

      {/* =========================================================== */}
      {/* MODAL 1: PASSWORD PROTECTION                                */}
      {/* =========================================================== */}
      <AnimatePresence>
        {isPasswordModalOpen && activeCard && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className={`w-full max-w-sm bg-gradient-to-br from-neutral-900 to-rose-950/40 border border-white/15 rounded-3xl p-6 sm:p-8 shadow-2xl relative text-center space-y-6 ${
                shakeError ? 'animate-shake' : ''
              }`}
            >
              <div className="flex flex-col items-center gap-2">
                <div className="p-3.5 bg-rose-500/10 rounded-2xl border border-rose-500/20 text-rose-400">
                  <Lock className="w-7 h-7" />
                </div>
                <h3 className="font-serif text-2xl font-bold text-white tracking-tight">Enter Secret Passcode</h3>
                <p className="text-xs text-neutral-400">
                  Unlock the locked memory lane for "{activeCard.title}"!
                </p>
              </div>

              <form onSubmit={handlePasswordSubmit} className="space-y-4">
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={passwordInput}
                    onChange={(e) => {
                      setPasswordInput(e.target.value);
                      setPasswordError('');
                    }}
                    placeholder="Enter passcode..."
                    className="w-full px-4 py-3 text-sm bg-neutral-950 border border-white/10 rounded-xl focus:outline-none focus:ring-1 focus:ring-rose-400 focus:border-rose-400 text-white placeholder-neutral-500 text-center tracking-wider font-mono"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-neutral-400 hover:text-white transition-colors cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>

                {passwordError && (
                  <motion.p
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-xs text-rose-400 font-medium inline-flex items-center gap-1.5 bg-rose-500/5 border border-rose-500/10 px-3 py-1.5 rounded-lg w-full justify-center"
                  >
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{passwordError}</span>
                  </motion.p>
                )}

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setIsPasswordModalOpen(false)}
                    className="flex-1 py-3 bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-bold rounded-xl border border-white/5 transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-3 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl border border-rose-500/20 shadow-md transition-all cursor-pointer inline-flex items-center justify-center gap-1.5"
                  >
                    <Unlock className="w-3.5 h-3.5" />
                    Unlock Moment
                  </button>
                </div>
              </form>

              <div className="pt-2 border-t border-white/5 text-[10px] text-neutral-500">
                <p>🔒 Strictly protected for couple space: <span className="text-neutral-400 font-mono">{coupleId}</span></p>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* =========================================================== */}
      {/* MODAL 1B: PASSWORD VERIFICATION FOR EDITING CARD            */}
      {/* =========================================================== */}
      <AnimatePresence>
        {isEditPasswordModalOpen && cardPendingEdit && (
          <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className={`w-full max-w-sm bg-gradient-to-br from-neutral-900 to-rose-950/50 border border-white/15 rounded-3xl p-6 sm:p-8 shadow-2xl relative text-center space-y-6 ${
                editShakeError ? 'animate-shake' : ''
              }`}
            >
              <div className="flex flex-col items-center gap-2">
                <div className="p-3.5 bg-rose-500/10 rounded-2xl border border-rose-500/20 text-rose-400">
                  <Lock className="w-7 h-7" />
                </div>
                <h3 className="font-serif text-2xl font-bold text-white tracking-tight">Enter Password to Edit</h3>
                <p className="text-xs text-neutral-300">
                  Enter password to modify <strong className="text-white">"{cardPendingEdit.title}"</strong>
                </p>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] text-neutral-400">
                  <span className="capitalize font-semibold text-rose-300">{cardPendingEdit.type} Category</span>
                  <span>•</span>
                  <span>{cardPendingEdit.photos?.length || 0} Photos Attached</span>
                </div>
              </div>

              <form onSubmit={handleEditPasswordSubmit} className="space-y-4">
                <div className="relative">
                  <input
                    type={editShowPassword ? "text" : "password"}
                    value={editPasswordInput}
                    onChange={(e) => {
                      setEditPasswordInput(e.target.value);
                      setEditPasswordError('');
                    }}
                    placeholder="Enter card passcode..."
                    className="w-full px-4 py-3 text-sm bg-neutral-950 border border-white/10 rounded-xl focus:outline-none focus:ring-1 focus:ring-rose-400 focus:border-rose-400 text-white placeholder-neutral-500 text-center tracking-wider font-mono"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setEditShowPassword(!editShowPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-neutral-400 hover:text-white transition-colors cursor-pointer"
                  >
                    {editShowPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>

                {editPasswordError && (
                  <motion.p
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-xs text-rose-400 font-medium inline-flex items-center gap-1.5 bg-rose-500/5 border border-rose-500/10 px-3 py-1.5 rounded-lg w-full justify-center"
                  >
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{editPasswordError}</span>
                  </motion.p>
                )}

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditPasswordModalOpen(false);
                      setCardPendingEdit(null);
                    }}
                    className="flex-1 py-3 bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-bold rounded-xl border border-white/5 transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-3 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl border border-rose-500/20 shadow-md transition-all cursor-pointer inline-flex items-center justify-center gap-1.5"
                  >
                    <Unlock className="w-3.5 h-3.5" />
                    Unlock & Edit
                  </button>
                </div>
              </form>

              <div className="pt-2 border-t border-white/5 text-[10px] text-neutral-500 space-y-1">
                <p>🔒 Protected for couple space: <span className="text-neutral-400 font-mono">{coupleId}</span></p>
                <p className="italic text-neutral-400">Enter card password, master code ('love' / '1234'), or account name.</p>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* =========================================================== */}
      {/* MODAL 1C: VIEW ALL PHOTOS GRID LIGHTBOX                     */}
      {/* =========================================================== */}
      <AnimatePresence>
        {photoViewAllModalOpen && activeCard && (
          <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-50 flex items-center justify-center p-4 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-4xl bg-neutral-900 border border-white/15 rounded-3xl p-6 shadow-2xl space-y-5 my-6 max-h-[90vh] flex flex-col"
            >
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <div className="flex items-center gap-2">
                  <Images className="w-5 h-5 text-rose-400" />
                  <div>
                    <h3 className="font-serif text-lg font-bold text-white">
                      All Photos in "{activeCard.title}"
                    </h3>
                    <span className="text-[11px] text-neutral-400 block">
                      {activeCardPhotos.length} Photos Attached ({activeCard.type} category)
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setPhotoViewAllModalOpen(false)}
                  className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-1">
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                  {activeCardPhotos.map((photo, index) => (
                    <div 
                      key={`card-photo-grid-${photo.id || index}-${index}`} 
                      className="bg-neutral-950 rounded-2xl border border-white/10 overflow-hidden flex flex-col group hover:border-rose-500/50 transition-all"
                    >
                      <div className="aspect-square relative overflow-hidden bg-neutral-900">
                        <img 
                          src={photo.src} 
                          alt={photo.caption} 
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                        <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-black/60 text-white text-[9px] font-mono">
                          #{index + 1}
                        </span>
                      </div>
                      <div className="p-2.5 space-y-1">
                        <p className="font-serif text-xs text-white font-semibold line-clamp-2">
                          {photo.caption || 'Our Sweet Moment 💖'}
                        </p>
                        {photo.sourceItemTitle && (
                          <span className="text-[9px] text-neutral-500 block uppercase tracking-wider">
                            Source: {photo.sourceItemTitle}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-white/10 pt-3">
                <button
                  type="button"
                  onClick={(e) => {
                    setPhotoViewAllModalOpen(false);
                    handleInitiateEdit(activeCard, e);
                  }}
                  className="px-4 py-2 bg-white/10 hover:bg-rose-600 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Edit2 className="w-3.5 h-3.5" /> Edit / Add More Photos
                </button>
                <button
                  type="button"
                  onClick={() => setPhotoViewAllModalOpen(false)}
                  className="px-5 py-2 bg-neutral-800 hover:bg-neutral-700 text-white rounded-xl text-xs font-semibold cursor-pointer"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* =========================================================== */}
      {/* MODAL 2: LOVE LETTER MODAL                                  */}
      {/* =========================================================== */}
      <AnimatePresence>
        {isLetterModalOpen && activeCard && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md bg-gradient-to-br from-neutral-900 to-rose-950/40 border border-white/15 rounded-3xl p-6 sm:p-8 shadow-2xl relative text-center space-y-6"
            >
              <div className="flex flex-col items-center gap-2">
                <div className="p-3.5 bg-rose-500/10 rounded-2xl border border-rose-500/20 text-rose-400">
                  <Mail className="w-7 h-7" />
                </div>
                <h3 className="font-serif text-2xl font-bold text-white tracking-tight">Our Love Letter</h3>
                <span className="text-[10px] uppercase font-bold tracking-widest text-neutral-400">
                  {activeCard.partnerName ? `To ${activeCard.partnerName}` : 'To my precious person'}
                </span>
              </div>

              <div className="bg-neutral-950/60 p-5 rounded-2xl border border-white/5 max-h-[250px] overflow-y-auto">
                <p className="font-serif text-base text-neutral-200 leading-relaxed italic whitespace-pre-line text-left">
                  {activeCard.letter || 'My heart is endlessly yours. ❤️'}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setIsLetterModalOpen(false)}
                className="w-full py-3 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl border border-rose-500/20 shadow-md transition-all cursor-pointer"
              >
                Close Letter
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* =========================================================== */}
      {/* MODAL 3: CREATE / MODIFY CELEBRATION CARD                   */}
      {/* =========================================================== */}
      <AnimatePresence>
        {isEditorModalOpen && (
          <div className={`fixed inset-0 bg-black/90 backdrop-blur-md z-50 flex items-center justify-center transition-all duration-200 overflow-hidden ${
            isEditorFullScreen ? 'p-0 sm:p-2 md:p-3' : 'p-2 sm:p-4 md:p-6'
          }`}>
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className={`w-full bg-neutral-900 border border-white/15 shadow-2xl flex flex-col relative text-left transition-all duration-200 overflow-hidden ${
                isEditorFullScreen
                  ? 'h-full sm:h-[98vh] max-w-none rounded-none sm:rounded-3xl'
                  : 'max-w-3xl h-[92vh] max-h-[92vh] rounded-2xl sm:rounded-3xl'
              }`}
            >
              {/* Pinned Modal Header */}
              <div className="shrink-0 px-5 sm:px-7 pt-4 sm:pt-5 pb-3.5 border-b border-white/10 bg-neutral-900/95 backdrop-blur-sm flex items-center justify-between gap-3 z-10">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] uppercase font-extrabold tracking-widest bg-rose-500/15 text-rose-300 px-2.5 py-0.5 rounded-full border border-rose-500/30">
                      {editingCardId ? 'Edit Celebration Card' : 'Create New Celebration Card'}
                    </span>
                    <span className="text-[10px] text-neutral-400 font-mono hidden sm:inline">
                      Couple ID: {coupleId}
                    </span>
                    <span className="text-[10px] font-semibold text-rose-300 bg-white/5 px-2 py-0.5 rounded-full border border-white/10">
                      {formType.toUpperCase()}
                    </span>
                  </div>
                  <h2 className="font-serif text-xl sm:text-2xl font-bold text-white mt-1 truncate">
                    {editingCardId ? 'Modify Celebration Card' : 'Design a New Celebration Card'}
                  </h2>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => setIsEditorFullScreen(!isEditorFullScreen)}
                    className="p-2 text-neutral-300 hover:text-white rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-colors cursor-pointer flex items-center gap-1.5 text-xs font-medium"
                    title={isEditorFullScreen ? "Exit Full Screen" : "Full Screen Dialog"}
                  >
                    {isEditorFullScreen ? (
                      <>
                        <Minimize2 className="w-4 h-4 text-rose-400" />
                        <span className="hidden sm:inline">Normal Size</span>
                      </>
                    ) : (
                      <>
                        <Maximize2 className="w-4 h-4 text-rose-400" />
                        <span className="hidden sm:inline">Full Screen</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsEditorModalOpen(false)}
                    className="p-2 text-neutral-400 hover:text-white rounded-xl hover:bg-white/10 transition-colors cursor-pointer"
                    title="Close Dialog"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Form with Contained Scrollable Body and Pinned Footer */}
              <form onSubmit={handleSaveCard} className="flex-1 flex flex-col min-h-0 overflow-hidden">
                <div className="flex-1 overflow-y-auto px-5 sm:px-7 py-5 space-y-5">
                
                {/* Type Selection */}
                <div>
                  <label className="block text-xs font-semibold text-neutral-300 mb-1.5 uppercase tracking-wider">
                    Celebration Type
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                    {[
                      { id: 'birthday', label: 'Birthday 🎂', desc: 'Anthem & Cake' },
                      { id: 'engagement', label: 'Engagement 💍', desc: 'Hamaki Theme' },
                      { id: 'fireworks', label: 'Fireworks 🎆', desc: 'Sky & Wavy Gallery' },
                      { id: 'anniversary', label: 'Anniversary 🥂', desc: 'Milestone Counter' },
                      { id: 'custom', label: 'Other / Custom ✨', desc: 'Romantic Deck' }
                    ].map((t, idx) => (
                      <button
                        key={`card-type-${t.id}-${idx}`}
                        type="button"
                        onClick={() => {
                          const newType = t.id as CelebrationCardType;
                          setFormType(newType);
                          if (t.id === 'birthday') setFormThemeColor('rose');
                          if (t.id === 'engagement') setFormThemeColor('purple');
                          if (t.id === 'fireworks') setFormThemeColor('indigo');
                          if (t.id === 'anniversary') setFormThemeColor('amber');
                          if (t.id === 'custom') setFormThemeColor('rose');
                          if (!isTitleManuallyEdited && formPartnerName.trim()) {
                            const targetAge = formTargetSummary.nextAge || formAge || 25;
                            setFormTitle(getAutoCelebrationTitle(formPartnerName, newType, targetAge));
                          }
                        }}
                        className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                          formType === t.id 
                            ? 'bg-rose-500/20 border-rose-500/40 text-white shadow-sm' 
                            : 'bg-neutral-950/60 border-white/5 text-neutral-400 hover:text-white'
                        }`}
                      >
                        <span className="block text-xs font-bold">{t.label}</span>
                        <span className="text-[10px] text-neutral-400">{t.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Title & Partner Name */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-300 mb-1">
                      Card Title *
                    </label>
                    <input
                      type="text"
                      required
                      value={formTitle}
                      onChange={(e) => {
                        const val = e.target.value;
                        setFormTitle(val);
                        setIsTitleManuallyEdited(!!val.trim());
                      }}
                      placeholder="e.g. Name's 25th Birthday"
                      className="w-full px-3.5 py-2.5 bg-neutral-950 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-rose-400"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-neutral-300 mb-1">
                      Partner / Celebrant Name
                    </label>
                    <input
                      type="text"
                      value={formPartnerName}
                      onChange={(e) => handlePartnerNameChange(e.target.value)}
                      placeholder="e.g. My Princess / Name"
                      className="w-full px-3.5 py-2.5 bg-neutral-950 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-rose-400"
                    />
                  </div>
                </div>

                {/* =================================================== */}
                {/* CELEBRATION TARGET & DATE SECTION - AUTO CALC LOGIC */}
                {/* =================================================== */}
                <div className="bg-neutral-950/70 p-4 rounded-2xl border border-white/10 space-y-3.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white flex items-center gap-1.5">
                      <Calendar className="w-4 h-4 text-rose-400" />
                      Target Celebration & Milestone Calculation
                    </span>
                    <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-300 border border-rose-500/30">
                      {formType === 'birthday' ? '🎂 Auto-Age & Next Target' : '🎯 Target Milestone'}
                    </span>
                  </div>

                  {/* 1. BIRTHDAY: Date of Birth Input */}
                  {formType === 'birthday' && (
                    <div className="space-y-3">
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-xs font-semibold text-neutral-200 flex items-center gap-1">
                            <span>Birthday Date (Date of Birth) *</span>
                            <span className="text-rose-400">🎂</span>
                          </label>
                          <span className="text-[10px] text-neutral-400">
                            Auto-calculates age & triggers next celebration
                          </span>
                        </div>
                        <input
                          type="date"
                          value={formOriginalDate}
                          onChange={(e) => handleOriginalDateChange(e.target.value)}
                          className="w-full px-3.5 py-2.5 bg-neutral-900 border border-rose-500/30 rounded-xl text-sm text-white focus:outline-none focus:border-rose-400"
                        />
                      </div>

                      {/* Live Auto-Calculation Feedback Banner for Birthday */}
                      {formOriginalDate && (
                        <div className="p-3 bg-gradient-to-br from-rose-950/40 via-neutral-900 to-purple-950/30 border border-rose-500/30 rounded-xl space-y-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-xs font-bold text-rose-300 flex items-center gap-1.5">
                              <Sparkles className="w-3.5 h-3.5 text-yellow-400 animate-spin" />
                              {formTargetSummary.milestoneLabel}
                            </span>
                            <span className="text-[11px] font-mono font-bold px-2.5 py-0.5 rounded-lg bg-rose-500/20 text-rose-200 border border-rose-500/30">
                              {formTargetSummary.countdownBadge}
                            </span>
                          </div>

                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px] text-neutral-300 pt-1 border-t border-white/5">
                            <div>
                              <span className="text-neutral-500 block text-[9px] uppercase tracking-wider">Current Age</span>
                              <strong className="text-white font-mono">{formTargetSummary.currentAge ?? '—'} years old</strong>
                            </div>
                            <div>
                              <span className="text-neutral-500 block text-[9px] uppercase tracking-wider">Next Target Celebration</span>
                              <strong className="text-rose-300 font-mono">{formTargetSummary.formattedTargetDate}</strong>
                            </div>
                            <div>
                              <span className="text-neutral-500 block text-[9px] uppercase tracking-wider">Age to Celebrate</span>
                              <strong className="text-yellow-300 font-mono">Turning {formTargetSummary.nextAge ?? '—'}</strong>
                            </div>
                          </div>

                          {/* Quick helper buttons */}
                          <div className="flex flex-wrap items-center gap-2 pt-1.5">
                            <button
                              type="button"
                              onClick={handleRecalculateTarget}
                              className="px-2.5 py-1 bg-white/10 hover:bg-white/20 text-white text-[10px] font-medium rounded-lg flex items-center gap-1 cursor-pointer transition-colors"
                            >
                              <RefreshCw className="w-3 h-3 text-rose-400" />
                              Sync Target Celebration Date
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const pName = formPartnerName.trim() || 'My Love';
                                const nAge = formTargetSummary.nextAge || 26;
                                setFormTitle(`${pName}'s ${nAge}${getOrdinalSuffix(nAge)} Birthday 🎂`);
                              }}
                              className="px-2.5 py-1 bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 text-[10px] font-medium rounded-lg flex items-center gap-1 cursor-pointer transition-colors"
                            >
                              <Gift className="w-3 h-3 text-rose-400" />
                              Apply Card Title with Age
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Target Celebration Date & Age Fields (Auto-synced, user can adjust if needed) */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                        <div>
                          <label className="block text-xs font-semibold text-neutral-300 mb-1 flex items-center justify-between">
                            <span>Next Target Celebration Date</span>
                            <span className="text-[10px] text-emerald-400 font-mono">⚡ Auto-Triggered</span>
                          </label>
                          <input
                            type="date"
                            value={formTargetDate}
                            onChange={(e) => setFormTargetDate(e.target.value)}
                            className="w-full px-3.5 py-2.5 bg-neutral-900 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-rose-400"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-neutral-300 mb-1 flex items-center justify-between">
                            <span>Age Celebrating</span>
                            <span className="text-[10px] text-emerald-400 font-mono">⚡ Auto-Calculated</span>
                          </label>
                          <input
                            type="number"
                            min="1"
                            max="120"
                            value={formAge || ''}
                            onChange={(e) => setFormAge(e.target.value ? Number(e.target.value) : undefined)}
                            placeholder="e.g. 26"
                            className="w-full px-3.5 py-2.5 bg-neutral-900 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-rose-400"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 2. ENGAGEMENT & ANNIVERSARY */}
                  {(formType === 'engagement' || formType === 'anniversary') && (
                    <div className="space-y-3">
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-xs font-semibold text-neutral-200">
                            Original {formType === 'engagement' ? 'Engagement' : 'Anniversary'} Date *
                          </label>
                          <span className="text-[10px] text-neutral-400">
                            Auto-calculates milestone & triggers next anniversary
                          </span>
                        </div>
                        <input
                          type="date"
                          value={formOriginalDate}
                          onChange={(e) => handleOriginalDateChange(e.target.value)}
                          className="w-full px-3.5 py-2.5 bg-neutral-900 border border-purple-500/30 rounded-xl text-sm text-white focus:outline-none focus:border-purple-400"
                        />
                      </div>

                      {/* Live calculation banner */}
                      <div className="p-3 bg-gradient-to-br from-purple-950/40 via-neutral-900 to-rose-950/30 border border-purple-500/30 rounded-xl space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-purple-300">
                            {formTargetSummary.milestoneLabel}
                          </span>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-purple-500/20 text-purple-200 border border-purple-500/30">
                            {formTargetSummary.countdownBadge}
                          </span>
                        </div>
                        <p className="text-[11px] text-neutral-300">
                          Next Celebration Target Date: <strong className="text-white font-mono">{formTargetSummary.formattedTargetDate}</strong>
                        </p>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-neutral-300 mb-1 flex items-center justify-between">
                          <span>Target Celebration Date</span>
                          <span className="text-[10px] text-emerald-400 font-mono">⚡ Auto-Triggered</span>
                        </label>
                        <input
                          type="date"
                          value={formTargetDate}
                          onChange={(e) => setFormTargetDate(e.target.value)}
                          className="w-full px-3.5 py-2.5 bg-neutral-900 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-purple-400"
                        />
                      </div>
                    </div>
                  )}

                  {/* 3. FIREWORKS & OTHER / CUSTOM */}
                  {(formType === 'fireworks' || formType === 'custom') && (
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-semibold text-neutral-300 mb-1">
                          Target Celebration Date *
                        </label>
                        <input
                          type="date"
                          value={formTargetDate}
                          onChange={(e) => setFormTargetDate(e.target.value)}
                          className="w-full px-3.5 py-2.5 bg-neutral-900 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-indigo-400"
                        />
                      </div>

                      <div className="p-3 bg-gradient-to-br from-indigo-950/40 via-neutral-900 to-rose-950/30 border border-indigo-500/30 rounded-xl flex items-center justify-between">
                        <div>
                          <span className="text-xs font-bold text-indigo-300 block">
                            {formTargetSummary.milestoneLabel}
                          </span>
                          <span className="text-[10px] text-neutral-400">
                            Target Date: {formTargetSummary.formattedTargetDate}
                          </span>
                        </div>
                        <span className="text-[11px] font-mono font-bold px-2.5 py-0.5 rounded-lg bg-indigo-500/20 text-indigo-200 border border-indigo-500/30">
                          {formTargetSummary.countdownBadge}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Passcode Protection */}
                <div className="bg-neutral-950/60 p-3.5 rounded-2xl border border-white/10 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-neutral-200 flex items-center gap-1.5 cursor-pointer">
                      <Lock className="w-3.5 h-3.5 text-rose-400" />
                      Protect Card with Secret Passcode
                    </label>
                    <input
                      type="checkbox"
                      checked={formPasswordEnabled}
                      onChange={(e) => setFormPasswordEnabled(e.target.checked)}
                      className="w-4 h-4 rounded text-rose-600 focus:ring-rose-500 cursor-pointer"
                    />
                  </div>

                  {formPasswordEnabled && (
                    <input
                      type="text"
                      value={formPassword}
                      onChange={(e) => setFormPassword(e.target.value)}
                      placeholder="Enter secret passcode..."
                      className="w-full px-3 py-2 bg-neutral-900 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-rose-400 font-mono tracking-wider"
                    />
                  )}
                </div>

                {/* =================================================== */}
                {/* GALLERY PHOTOS SELECTOR - CRITICAL USER REQUIREMENT */}
                {/* =================================================== */}
                <div className="bg-neutral-950/80 p-4 rounded-2xl border border-white/10 space-y-3">
                  {/* Photo Success / Status Banner */}
                  {formSelectedPhotos.length > 0 ? (
                    <div className="flex items-center justify-between p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-300 text-xs">
                      <span className="flex items-center gap-1.5 font-semibold">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                        <span>{formSelectedPhotos.length} Photo{formSelectedPhotos.length > 1 ? 's' : ''} successfully attached to this {formType} celebration!</span>
                      </span>
                      <span className="text-[10px] text-emerald-400/80 font-mono hidden sm:inline">
                        {formType === 'fireworks' ? '🎆 Sky Polaroid Frames' : '📸 Carousel & Timeline'}
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between p-2.5 bg-neutral-900 border border-white/10 rounded-xl text-neutral-300 text-xs">
                      <span className="flex items-center gap-1.5 font-medium">
                        <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                        <span>No photos selected yet. (You can attach photos from gallery or keep text-only)</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => setIsGalleryPickerOpen(true)}
                        className="text-rose-400 hover:text-rose-300 underline font-semibold text-[11px] cursor-pointer"
                      >
                        Pick Photos
                      </button>
                    </div>
                  )}

                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-white flex items-center gap-1.5">
                        <Images className="w-4 h-4 text-rose-400" />
                        Photos for Carousel & Visual Timeline
                      </span>
                      <span className="text-[11px] text-neutral-400 block mt-0.5">
                        Selected: <strong className="text-rose-300">{formSelectedPhotos.length}</strong> photo(s)
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Direct file upload button - mobile optimized with native input overlay and multi-file support */}
                      <label className="relative overflow-hidden px-2.5 py-1.5 bg-white/5 hover:bg-white/10 active:bg-white/15 text-neutral-300 text-[11px] font-semibold rounded-lg border border-white/10 flex items-center gap-1 transition-colors cursor-pointer select-none">
                        <input
                          ref={fileUploadRef}
                          type="file"
                          multiple
                          accept="image/*,image/heic,image/heif"
                          onChange={handleUploadPhoto}
                          className="absolute inset-0 opacity-0 w-full h-full cursor-pointer z-20"
                        />
                        {isUploadingPhoto ? (
                          <>
                            <Loader2 className="w-3 h-3 text-rose-400 animate-spin" />
                            <span className="text-rose-300 font-mono text-[10px]">{uploadProgressText || 'Saving...'}</span>
                          </>
                        ) : (
                          <>
                            <Upload className="w-3 h-3 text-rose-400" />
                            <span>Upload Photos</span>
                          </>
                        )}
                      </label>

                      {/* Toggle Gallery browser */}
                      <button
                        type="button"
                        onClick={() => setIsGalleryPickerOpen(!isGalleryPickerOpen)}
                        className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-bold rounded-lg flex items-center gap-1 transition-colors cursor-pointer"
                      >
                        <Images className="w-3 h-3" />
                        {isGalleryPickerOpen ? 'Done Picking' : 'Choose From Gallery'}
                      </button>
                    </div>
                  </div>

                  {/* GALLERY PHOTOS PICKER GRID */}
                  {isGalleryPickerOpen && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="border border-white/10 rounded-xl p-3 bg-neutral-900/90 space-y-3"
                    >
                      <div className="flex items-center justify-between text-[11px] text-neutral-400 border-b border-white/5 pb-2">
                        <span>Click any photo from your couple gallery to attach:</span>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              const all = galleryPhotos.map((p) => ({
                                id: p.id,
                                src: p.url,
                                caption: p.title || 'Our Sweet Memory 💖',
                                sourceItemTitle: p.source
                              }));
                              setFormSelectedPhotos(all);
                            }}
                            className="text-rose-400 hover:text-rose-300 underline font-semibold cursor-pointer"
                          >
                            Select All ({galleryPhotos.length})
                          </button>
                          <button
                            type="button"
                            onClick={() => setFormSelectedPhotos([])}
                            className="text-neutral-500 hover:text-neutral-400 underline cursor-pointer"
                          >
                            Clear
                          </button>
                        </div>
                      </div>

                      {galleryPhotos.length > 0 ? (
                        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2.5 max-h-[220px] overflow-y-auto p-1">
                          {galleryPhotos.map((photo, index) => {
                            const isSelected = formSelectedPhotos.some((p) => p.src === photo.url);
                            return (
                              <button
                                key={`gallery-picker-${photo.id}-${index}`}
                                type="button"
                                onClick={() => toggleSelectGalleryPhoto(photo)}
                                className={`relative aspect-square rounded-xl overflow-hidden border-2 transition-all cursor-pointer group ${
                                  isSelected 
                                    ? 'border-rose-500 ring-2 ring-rose-500/40 scale-95' 
                                    : 'border-white/10 hover:border-white/30'
                                }`}
                              >
                                <img 
                                  src={photo.url} 
                                  alt={photo.title}
                                  className="w-full h-full object-cover" 
                                />
                                {isSelected && (
                                  <div className="absolute inset-0 bg-rose-600/30 flex items-center justify-center">
                                    <CheckCircle2 className="w-5 h-5 text-white drop-shadow-md" />
                                  </div>
                                )}
                                <span className="absolute bottom-0 inset-x-0 bg-black/70 text-[8px] text-white p-0.5 truncate text-center">
                                  {photo.source}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="text-center py-6 text-xs text-neutral-500">
                          <Images className="w-6 h-6 mx-auto mb-1 opacity-50" />
                          <p>No photos found in Milestones or Scrapbook yet.</p>
                          <p className="text-[10px] text-neutral-400 mt-1">Upload photos using the button above or add them in Our Story / Scrapbook!</p>
                        </div>
                      )}
                    </motion.div>
                  )}

                  {/* SELECTED PHOTOS TRAY (WITH EDITABLE CAPTIONS) */}
                  {formSelectedPhotos.length > 0 ? (
                    <div className="space-y-2 pt-1 max-h-[160px] overflow-y-auto">
                      {formSelectedPhotos.map((photo, index) => (
                        <div 
                          key={`selected-photo-${photo.id || index}-${index}`}
                          className="flex items-center gap-2.5 bg-neutral-900/80 p-2 rounded-xl border border-white/5"
                        >
                          <img 
                            src={photo.src} 
                            alt={photo.caption} 
                            className="w-10 h-10 rounded-lg object-cover border border-white/10 shrink-0" 
                          />
                          <input
                            type="text"
                            value={photo.caption}
                            onChange={(e) => {
                              const updated = [...formSelectedPhotos];
                              updated[index] = { ...updated[index], caption: e.target.value };
                              setFormSelectedPhotos(updated);
                            }}
                            placeholder="Romantic caption for this picture..."
                            className="flex-1 px-2.5 py-1.5 bg-neutral-950 border border-white/5 rounded-lg text-xs text-white focus:outline-none focus:border-rose-400"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              setFormSelectedPhotos(formSelectedPhotos.filter((_, i) => i !== index));
                            }}
                            className="p-1.5 text-neutral-500 hover:text-rose-400 rounded-lg transition-colors cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[11px] text-neutral-500 italic text-center py-2">
                      No photos attached. This celebration card will be displayed with heartfelt text and music, or you can attach photos anytime.
                    </p>
                  )}
                </div>

                {/* Romantic Love Letter */}
                <div>
                  <label className="block text-xs font-semibold text-neutral-300 mb-1">
                    Romantic Love Letter / Card Note
                  </label>
                  <textarea
                    rows={3}
                    value={formLetter}
                    onChange={(e) => setFormLetter(e.target.value)}
                    placeholder="Write a sweet love letter revealed when reading the card..."
                    className="w-full px-3.5 py-2.5 bg-neutral-950 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-rose-400"
                  />
                </div>

                {/* Theme & Music */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-300 mb-1">
                      Visual Theme Color
                    </label>
                    <select
                      value={formThemeColor}
                      onChange={(e) => setFormThemeColor(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-neutral-950 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-rose-400"
                    >
                      <option value="rose">Rose Romance 🌹</option>
                      <option value="purple">Royal Purple 💜</option>
                      <option value="indigo">Night Sky Indigo 🎆</option>
                      <option value="amber">Warm Amber Gold ✨</option>
                      <option value="emerald">Emerald Meadow 🌿</option>
                    </select>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-semibold text-neutral-300">
                        Celebration Music Track 🎵
                      </label>
                      {onNavigateTab && (
                        <button
                          type="button"
                          onClick={() => {
                            setIsEditorModalOpen(false);
                            onNavigateTab('music');
                          }}
                          className="text-[11px] text-rose-400 hover:text-rose-300 underline cursor-pointer flex items-center gap-1"
                        >
                          <Music className="w-3 h-3" />
                          Manage MP3 Lounge
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <select
                        value={formMusicUrl}
                        onChange={(e) => setFormMusicUrl(e.target.value)}
                        className="flex-1 px-3.5 py-2.5 bg-neutral-950 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-rose-400"
                      >
                        {/* Custom uploaded tracks group */}
                        {availableTracks.filter(t => !t.isPreset).length > 0 && (
                          <optgroup label="💖 Couple Uploaded MP3s">
                            {availableTracks.filter(t => !t.isPreset).map((track) => (
                              <option key={`card-music-${track.id}`} value={track.url}>
                                🎵 {track.title} {track.artist ? `(${track.artist})` : ''}
                              </option>
                            ))}
                          </optgroup>
                        )}

                        {/* Preset tracks group */}
                        <optgroup label="🎶 Romantic Presets & Anthems">
                          {availableTracks.filter(t => t.isPreset).map((track) => (
                            <option key={`card-music-${track.id}`} value={track.url}>
                              {track.title} {track.artist ? `— ${track.artist}` : ''}
                            </option>
                          ))}
                        </optgroup>

                        {/* Fallback option if custom URL doesn't match any track */}
                        {formMusicUrl && !availableTracks.some(t => t.url === formMusicUrl) && (
                          <optgroup label="✨ Selected Custom URL">
                            <option value={formMusicUrl}>
                              Custom Track ({formMusicUrl.substring(0, 32)}...)
                            </option>
                          </optgroup>
                        )}
                      </select>

                      {/* Preview Button */}
                      <button
                        type="button"
                        onClick={togglePreviewAudio}
                        title={previewAudioPlaying ? 'Pause Audio Preview' : 'Listen to Track Preview'}
                        className={`px-3 py-2.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 ${
                          previewAudioPlaying
                            ? 'bg-rose-600 text-white border-rose-500 shadow-md animate-pulse'
                            : 'bg-white/5 hover:bg-white/10 text-neutral-300 hover:text-white border-white/10'
                        }`}
                      >
                        {previewAudioPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                        <span className="hidden sm:inline">{previewAudioPlaying ? 'Stop' : 'Preview'}</span>
                      </button>
                    </div>

                    <p className="text-[10px] text-neutral-400 mt-1 flex items-center gap-1">
                      <Sparkles className="w-3 h-3 text-amber-400 shrink-0" />
                      <span>Plays automatically when unlocking or celebrating this card.</span>
                    </p>
                  </div>
                </div>

                </div>

                {/* Pinned Modal Footer Controls (Always visible in screen) */}
                <div className="shrink-0 px-5 sm:px-7 py-3.5 border-t border-white/10 bg-neutral-900/95 backdrop-blur-sm flex flex-col sm:flex-row items-center justify-between gap-3 z-10">
                  <div className="flex items-center gap-2 text-xs text-neutral-400 w-full sm:w-auto justify-between sm:justify-start">
                    <span className="inline-flex items-center gap-1.5">
                      <Images className="w-3.5 h-3.5 text-rose-400" />
                      <strong className="text-white font-mono">{formSelectedPhotos.length}</strong> photos attached
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsEditorFullScreen(!isEditorFullScreen)}
                      className="text-[11px] text-neutral-400 hover:text-rose-300 underline cursor-pointer sm:hidden"
                    >
                      {isEditorFullScreen ? 'Exit Full Screen' : 'Full Screen'}
                    </button>
                  </div>

                  <div className="flex items-center gap-2.5 w-full sm:w-auto">
                    <button
                      type="button"
                      onClick={() => setIsEditorModalOpen(false)}
                      className="flex-1 sm:flex-none px-5 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-bold rounded-xl transition-all cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="flex-1 sm:flex-none px-6 py-2.5 bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 text-white text-xs font-bold rounded-xl shadow-lg transition-all cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      <Check className="w-4 h-4" />
                      {editingCardId ? 'Save Changes' : 'Create Card'}
                    </button>
                  </div>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* =========================================================== */}
      {/* MODAL 4: DELETE CONFIRMATION MODAL                          */}
      {/* =========================================================== */}
      <AnimatePresence>
        {cardToDelete && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-sm bg-neutral-900 border border-white/15 rounded-3xl p-6 shadow-2xl text-center space-y-4"
            >
              <div className="w-12 h-12 bg-rose-500/10 rounded-2xl flex items-center justify-center mx-auto text-rose-400">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-serif text-lg font-bold text-white">Delete Celebration Card?</h3>
                <p className="text-xs text-neutral-400 mt-1">
                  Are you sure you want to delete "{cardToDelete.title}"? This cannot be undone.
                </p>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCardToDelete(null)}
                  className="flex-1 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-bold rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmDeleteCard}
                  className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-xl shadow-md cursor-pointer"
                >
                  Delete Card
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}

export default ChooseMoment;
