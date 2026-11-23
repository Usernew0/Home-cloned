import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import confetti from 'canvas-confetti';
import { 
  Play, Pause, SkipForward, SkipBack, Volume2, VolumeX, Repeat, 
  Upload, Music, Disc, Sparkles, Heart, Trash2, Download, 
  Search, Check, AlertCircle, Headphones, Radio, ShieldCheck,
  Calendar, Flame, Share2, Plus, Info, Clock, ExternalLink, Gift, X, User
} from 'lucide-react';
import { MusicTrack, CoupleTenant, CelebrationCard } from '../types';
import { DEFAULT_MUSIC_TRACKS, storage } from '../utils';
import { 
  subscribeToFirestoreMusicTracks, 
  saveFirestoreMusicTrackDoc, 
  deleteFirestoreMusicTrackDoc,
  subscribeToCelebrationCards,
  saveCelebrationCardDoc
} from '../lib/syncService';

interface MusicLoungeProps {
  currentUser?: string;
  userId?: string;
  coupleTenant?: CoupleTenant;
  onUpdateSongLink?: (title: string, link: string) => Promise<void> | void;
  onLogActivity?: (action: string, details: string) => void;
  onNavigateTab?: (tabId: string) => void;
}

const CATEGORY_MAP: Record<string, { label: string; icon: string; color: string }> = {
  romantic: { label: 'Romantic Ballad', icon: '💖', color: 'from-rose-500/20 to-pink-500/20 text-rose-300 border-rose-500/30' },
  celebration: { label: 'Celebration & Party', icon: '🎉', color: 'from-amber-500/20 to-yellow-500/20 text-amber-300 border-amber-500/30' },
  birthday: { label: 'Birthday Anthem', icon: '🎂', color: 'from-purple-500/20 to-indigo-500/20 text-purple-300 border-purple-500/30' },
  slow_dance: { label: 'Slow Dance', icon: '💃', color: 'from-emerald-500/20 to-teal-500/20 text-emerald-300 border-emerald-500/30' },
  memory: { label: 'Cherished Memory', icon: '✨', color: 'from-blue-500/20 to-cyan-500/20 text-blue-300 border-blue-500/30' },
  other: { label: 'Special Melody', icon: '🎵', color: 'from-neutral-700 to-neutral-800 text-neutral-300 border-white/10' }
};

export function MusicLounge({
  currentUser = 'You',
  userId,
  coupleTenant,
  onUpdateSongLink,
  onLogActivity,
  onNavigateTab
}: MusicLoungeProps) {
  const coupleId = coupleTenant?.coupleId || 'shared-couple-space';
  const effectiveUserId = userId || currentUser;

  // State: Tracks & Active playback
  const [tracks, setTracks] = useState<MusicTrack[]>(() => storage.getMusicTracks(coupleId));
  const [activeTrackIndex, setActiveTrackIndex] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [volume, setVolume] = useState<number>(0.85);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isLooping, setIsLooping] = useState<boolean>(false);
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [userScopeFilter, setUserScopeFilter] = useState<'all' | 'mine' | 'partner' | 'presets'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [themeSuccessMsg, setThemeSuccessMsg] = useState<string>('');

  // State: Assign track to Celebration Card modal
  const [isAssignCardModalOpen, setIsAssignCardModalOpen] = useState<boolean>(false);
  const [trackToAssign, setTrackToAssign] = useState<MusicTrack | null>(null);
  const [celebrationCards, setCelebrationCards] = useState<CelebrationCard[]>(() => storage.getCelebrationCards(coupleId));

  // State: MP3 Upload form modal / section
  const [isUploadModalOpen, setIsUploadModalOpen] = useState<boolean>(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileBase64, setFileBase64] = useState<string>('');
  const [formTitle, setFormTitle] = useState<string>('');
  const [formArtist, setFormArtist] = useState<string>('');
  const [formDedication, setFormDedication] = useState<string>('');
  const [formCategory, setFormCategory] = useState<MusicTrack['category']>('romantic');
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadError, setUploadError] = useState<string>('');
  const [uploadProgress, setUploadProgress] = useState<number>(0);

  // Audio element reference
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Real-time synchronization strictly scoped by coupleId
  useEffect(() => {
    const unsub = subscribeToFirestoreMusicTracks((firestoreTracks) => {
      if (Array.isArray(firestoreTracks)) {
        setTracks((prev) => {
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

  // Real-time synchronization for celebration cards
  useEffect(() => {
    const unsub = subscribeToCelebrationCards((cards) => {
      if (Array.isArray(cards)) {
        setCelebrationCards(cards);
      }
    }, coupleId);

    return () => {
      if (unsub) unsub();
    };
  }, [coupleId]);

  // Ownership counts calculation for quick filters
  const counts = useMemo(() => {
    const coupleCustoms = tracks.filter((t) => !t.isPreset && (!t.coupleId || t.coupleId === coupleId));
    const mineCount = coupleCustoms.filter(
      (t) => (t.userId && t.userId === effectiveUserId) || (t.uploadedBy && t.uploadedBy.toLowerCase() === currentUser.toLowerCase())
    ).length;
    const partnerCount = Math.max(0, coupleCustoms.length - mineCount);
    const presetsCount = tracks.filter((t) => t.isPreset).length;
    return {
      all: tracks.length,
      mine: mineCount,
      partner: partnerCount,
      presets: presetsCount
    };
  }, [tracks, coupleId, effectiveUserId, currentUser]);

  // Filtered tracks with coupleId and userId isolation
  const filteredTracks = useMemo(() => {
    return tracks.filter((t) => {
      // 1. Enforce strict couple isolation on non-presets
      if (!t.isPreset && t.coupleId && t.coupleId !== coupleId) {
        return false;
      }

      // 2. User scope filtering
      if (userScopeFilter === 'mine') {
        if (t.isPreset) return false;
        const isMine = (t.userId && t.userId === effectiveUserId) || 
                       (t.uploadedBy && t.uploadedBy.toLowerCase() === currentUser.toLowerCase());
        if (!isMine) return false;
      } else if (userScopeFilter === 'partner') {
        if (t.isPreset) return false;
        const isMine = (t.userId && t.userId === effectiveUserId) || 
                       (t.uploadedBy && t.uploadedBy.toLowerCase() === currentUser.toLowerCase());
        if (isMine) return false;
      } else if (userScopeFilter === 'presets') {
        if (!t.isPreset) return false;
      }

      // 3. Search query
      const matchesSearch = 
        t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (t.artist || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (t.dedication || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (t.uploadedBy || '').toLowerCase().includes(searchQuery.toLowerCase());

      if (!matchesSearch) return false;

      // 4. Category filter
      if (filterCategory === 'all') return true;
      if (filterCategory === 'custom') return !t.isPreset;
      if (filterCategory === 'presets') return !!t.isPreset;
      return t.category === filterCategory;
    });
  }, [tracks, searchQuery, filterCategory, userScopeFilter, coupleId, effectiveUserId, currentUser]);

  const currentTrack = filteredTracks[activeTrackIndex] || tracks[0] || DEFAULT_MUSIC_TRACKS[0];

  // Sync audio source when track changes
  useEffect(() => {
    if (!audioRef.current || !currentTrack) return;
    const wasPlaying = isPlaying;
    audioRef.current.src = currentTrack.url;
    audioRef.current.load();
    if (wasPlaying) {
      audioRef.current.play().catch(() => setIsPlaying(false));
    }
  }, [currentTrack]);

  // Volume & Mute handling
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
    }
  }, [volume, isMuted]);

  // Audio event listeners
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleLoadedMetadata = () => setDuration(audio.duration || 0);
    const handleEnded = () => {
      if (isLooping) {
        audio.currentTime = 0;
        audio.play().catch(() => {});
      } else {
        handleNextTrack();
      }
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [isLooping, filteredTracks, activeTrackIndex]);

  // Play / Pause toggle
  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play()
        .then(() => setIsPlaying(true))
        .catch((err) => {
          console.warn("Audio playback prevented:", err);
          setIsPlaying(false);
        });
    }
  };

  const handleNextTrack = () => {
    if (filteredTracks.length === 0) return;
    setActiveTrackIndex((prev) => (prev + 1) % filteredTracks.length);
  };

  const handlePrevTrack = () => {
    if (filteredTracks.length === 0) return;
    setActiveTrackIndex((prev) => (prev - 1 + filteredTracks.length) % filteredTracks.length);
  };

  const handleSelectTrack = (index: number) => {
    setActiveTrackIndex(index);
    if (!isPlaying) {
      setTimeout(() => {
        if (audioRef.current) {
          audioRef.current.play()
            .then(() => setIsPlaying(true))
            .catch(() => {});
        }
      }, 50);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(e.target.value);
    setCurrentTime(newTime);
    if (audioRef.current) {
      audioRef.current.currentTime = newTime;
    }
  };

  const formatSeconds = (sec: number) => {
    if (isNaN(sec) || sec <= 0) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  // Set as Couple Theme Song
  const handleSetThemeSong = async (track: MusicTrack) => {
    try {
      if (onUpdateSongLink) {
        await onUpdateSongLink(track.title, track.url);
      }
      setThemeSuccessMsg(`Set "${track.title}" as your couple theme song! 💖`);
      confetti({ particleCount: 50, spread: 60, origin: { y: 0.7 } });
      setTimeout(() => setThemeSuccessMsg(''), 4500);

      if (onLogActivity) {
        onLogActivity('theme_song_updated', `Set couple theme song to "${track.title}" by ${track.artist || 'Unknown'}`);
      }
    } catch (err: any) {
      console.warn("Failed to set theme song:", err);
    }
  };

  // Assign track to a celebration card
  const handleAssignTrackToCard = async (card: CelebrationCard, track: MusicTrack) => {
    try {
      const updatedCard: CelebrationCard = {
        ...card,
        musicUrl: track.url,
        updatedAt: new Date().toISOString()
      };

      const updatedList = celebrationCards.map((c) => (c.id === card.id ? updatedCard : c));
      setCelebrationCards(updatedList);
      storage.saveCelebrationCard(updatedCard);
      await saveCelebrationCardDoc(updatedCard);

      confetti({ particleCount: 65, spread: 70, origin: { y: 0.6 } });
      setThemeSuccessMsg(`Assigned "${track.title}" to "${card.title}" celebration card! 💌`);
      setTimeout(() => setThemeSuccessMsg(''), 5000);

      if (onLogActivity) {
        onLogActivity('card_music_assigned', `Assigned track "${track.title}" to celebration card "${card.title}"`);
      }

      setIsAssignCardModalOpen(false);
      setTrackToAssign(null);
    } catch (err: any) {
      console.error("Failed to assign track to celebration card:", err);
    }
  };

  // Handle file picker selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('audio/') && !file.name.match(/\.(mp3|wav|m4a|ogg|aac|flac)$/i)) {
      setUploadError('Please select a valid audio file (.mp3, .wav, .m4a, .ogg, .aac).');
      return;
    }

    setUploadError('');
    setSelectedFile(file);

    // Auto-fill title from filename
    const cleanName = file.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, ' ');
    setFormTitle(cleanName);

    // Read audio duration & base64
    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      setFileBase64(result);
    };
    reader.readAsDataURL(file);
  };

  // Save/Upload track handler
  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile || !fileBase64) {
      setUploadError('Please select an audio file to upload.');
      return;
    }

    if (!formTitle.trim()) {
      setUploadError('Please enter a song title.');
      return;
    }

    setIsUploading(true);
    setUploadProgress(20);
    setUploadError('');

    try {
      let finalAudioUrl = fileBase64;
      setUploadProgress(50);

      // Attempt to post to Express backend
      try {
        const response = await fetch('/api/upload-audio', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileName: selectedFile.name,
            dataUrl: fileBase64,
            title: formTitle.trim(),
            artist: formArtist.trim() || undefined
          })
        });

        if (response.ok) {
          const resData = await response.json();
          if (resData.success && resData.url) {
            finalAudioUrl = resData.url;
          }
        }
      } catch (backendErr) {
        console.warn("Backend audio upload fallback to data URL:", backendErr);
      }

      setUploadProgress(85);

      const newTrack: MusicTrack = {
        id: `track_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        coupleId: coupleId,
        userId: effectiveUserId,
        uploadedBy: currentUser,
        title: formTitle.trim(),
        artist: formArtist.trim() || 'Romantic Memories',
        url: finalAudioUrl,
        duration: formatSeconds(duration || 180),
        category: formCategory,
        dedication: formDedication.trim() || undefined,
        fileName: selectedFile.name,
        fileSize: `${(selectedFile.size / (1024 * 1024)).toFixed(1)} MB`,
        isPreset: false,
        createdAt: new Date().toISOString()
      };

      // Save locally & to Firestore scoped to this couple
      const updatedTracks = [newTrack, ...tracks];
      setTracks(updatedTracks);
      storage.saveMusicTracks(updatedTracks, coupleId);
      await saveFirestoreMusicTrackDoc(newTrack);

      if (onLogActivity) {
        onLogActivity('audio_uploaded', `Uploaded romantic MP3 track "${newTrack.title}" (${newTrack.fileSize})`);
      }

      setUploadProgress(100);
      confetti({ particleCount: 75, spread: 70, origin: { y: 0.6 } });

      // Reset modal state
      setTimeout(() => {
        setIsUploading(false);
        setIsUploadModalOpen(false);
        setSelectedFile(null);
        setFileBase64('');
        setFormTitle('');
        setFormArtist('');
        setFormDedication('');
        setUploadProgress(0);
        // Play the newly uploaded track
        setActiveTrackIndex(0);
      }, 500);

    } catch (err: any) {
      console.error("Upload error:", err);
      setUploadError(err.message || 'Failed to process audio upload.');
      setIsUploading(false);
    }
  };

  // Delete custom track with ownership protection
  const handleDeleteTrack = async (track: MusicTrack, e: React.MouseEvent) => {
    e.stopPropagation();
    const isOwner = (track.userId && track.userId === effectiveUserId) || 
                    (track.uploadedBy && track.uploadedBy.toLowerCase() === currentUser.toLowerCase());

    const confirmPrompt = isOwner
      ? `Remove "${track.title}" from your couple jukebox?`
      : `This track was added by ${track.uploadedBy || 'your partner'}. Are you sure you want to remove it from your shared couple jukebox?`;

    if (!window.confirm(confirmPrompt)) return;

    const updated = tracks.filter((t) => t.id !== track.id);
    setTracks(updated);
    storage.saveMusicTracks(updated, coupleId);
    await deleteFirestoreMusicTrackDoc(track.id);

    if (activeTrackIndex >= updated.length) {
      setActiveTrackIndex(Math.max(0, updated.length - 1));
    }

    if (onLogActivity) {
      onLogActivity('audio_deleted', `Deleted audio track "${track.title}"`);
    }
  };

  return (
    <div className="w-full max-w-6xl mx-auto space-y-8 pb-16 px-3 sm:px-6">
      
      {/* Hidden audio element */}
      <audio ref={audioRef} preload="metadata" />

      {/* ========================================================= */}
      {/* SECTION 1: HERO HEADER & QUICK CONTROLS                   */}
      {/* ========================================================= */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-6">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="p-2 rounded-xl bg-gradient-to-br from-rose-500/20 to-purple-500/20 text-rose-400 border border-rose-500/30">
              <Headphones className="w-5 h-5" />
            </span>
            <span className="text-[10px] uppercase font-mono font-bold tracking-widest text-rose-400 bg-rose-500/10 px-2.5 py-0.5 rounded-full border border-rose-500/20">
              Couple Soundtracks & MP3 Lounge
            </span>
          </div>
          <h1 className="font-serif text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            Our Romantic Jukebox 🎵
          </h1>
          <p className="text-xs sm:text-sm text-neutral-400 mt-1">
            Listen to your songs together, upload custom MP3s, and select celebration themes.
          </p>
          <div className="flex flex-wrap items-center gap-2 mt-2.5">
            <span className="text-[11px] font-mono px-2.5 py-1 rounded-xl bg-white/5 border border-white/10 text-neutral-300 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-rose-400" />
              Couple Space: <strong className="text-white">{coupleTenant?.coupleName || 'Our Space'}</strong> ({coupleId})
            </span>
            <span className="text-[11px] font-mono px-2.5 py-1 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-300 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-rose-400" />
              Active User: <strong className="text-white">{currentUser}</strong>
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setIsUploadModalOpen(true)}
            className="px-4 py-2.5 bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-rose-600/20 border border-rose-400/30 flex items-center gap-2 transition-all transform hover:scale-[1.02] active:scale-95 cursor-pointer"
          >
            <Upload className="w-4 h-4" />
            Upload MP3 Track
          </button>

          {onNavigateTab && (
            <button
              type="button"
              onClick={() => onNavigateTab('choose')}
              className="px-3.5 py-2.5 bg-white/5 hover:bg-white/10 text-neutral-300 hover:text-white text-xs font-semibold rounded-xl border border-white/10 flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Use songs in celebration cards"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              Celebration Cards
            </button>
          )}
        </div>
      </div>

      {/* Success notification banner */}
      <AnimatePresence>
        {themeSuccessMsg && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl flex items-center gap-2.5 text-xs text-emerald-300 shadow-lg"
          >
            <Check className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="font-semibold">{themeSuccessMsg}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ========================================================= */}
      {/* SECTION 2: JUKEBOX PLAYER (NOW PLAYING)                   */}
      {/* ========================================================= */}
      <div className="bg-gradient-to-br from-neutral-900 via-neutral-950 to-rose-950/30 border border-white/10 rounded-3xl p-5 sm:p-8 shadow-2xl relative overflow-hidden">
        {/* Ambient glow backdrop */}
        <div className="absolute top-0 right-0 w-80 h-80 bg-rose-500/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />
        <div className="absolute bottom-0 left-0 w-80 h-80 bg-purple-500/10 rounded-full blur-3xl pointer-events-none -ml-20 -mb-20" />

        <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          
          {/* Left Column: Rotating Vinyl Record & Visualizer */}
          <div className="lg:col-span-5 flex flex-col items-center text-center space-y-4">
            <div className="relative w-48 h-48 sm:w-56 sm:h-56 flex items-center justify-center">
              {/* Spinning Vinyl */}
              <div 
                className={`w-full h-full rounded-full bg-gradient-to-tr from-neutral-950 via-neutral-900 to-neutral-950 border-4 border-neutral-800 shadow-[0_0_35px_rgba(0,0,0,0.8)] relative flex items-center justify-center transition-transform ${
                  isPlaying ? 'animate-spin' : ''
                }`}
                style={{ animationDuration: '6s', animationTimingFunction: 'linear' }}
              >
                {/* Vinyl grooved circles */}
                <div className="absolute inset-4 rounded-full border border-white/5 pointer-events-none" />
                <div className="absolute inset-8 rounded-full border border-white/5 pointer-events-none" />
                <div className="absolute inset-12 rounded-full border border-white/5 pointer-events-none" />

                {/* Center Record Label */}
                <div className="w-20 h-20 rounded-full bg-gradient-to-br from-rose-600 via-pink-600 to-purple-700 flex flex-col items-center justify-center text-white shadow-inner p-2 border-2 border-white/20">
                  <Disc className="w-6 h-6 animate-pulse" />
                  <span className="text-[7px] font-mono uppercase tracking-widest font-bold mt-1 text-rose-100">Our Home</span>
                </div>
              </div>

              {/* Tonearm needle indicator */}
              <div 
                className={`absolute -top-3 right-4 w-16 h-20 origin-top-right transition-transform duration-500 pointer-events-none ${
                  isPlaying ? 'rotate-12' : '-rotate-12 opacity-60'
                }`}
              >
                <div className="w-1.5 h-16 bg-neutral-400 rounded-full shadow-md ml-auto" />
                <div className="w-4 h-3 bg-rose-400 rounded-sm shadow ml-auto mr-0 -mt-1" />
              </div>
            </div>

            {/* Audio Wave Equalizer Bars */}
            <div className="flex items-center justify-center gap-1.5 h-8">
              {[40, 70, 30, 90, 60, 100, 50, 85, 45, 95, 65, 30, 80].map((h, i) => (
                <span
                  key={`eq-${i}`}
                  className={`w-1 rounded-full bg-gradient-to-t from-rose-500 to-purple-400 transition-all duration-300 ${
                    isPlaying ? 'opacity-100' : 'opacity-25'
                  }`}
                  style={{
                    height: isPlaying ? `${Math.max(15, (h * (i % 2 === 0 ? 0.9 : 1.1)) % 100)}%` : '15%',
                    animation: isPlaying ? `pulse 1.${i}s infinite alternate` : 'none'
                  }}
                />
              ))}
            </div>

            {/* Dedication Quote */}
            {currentTrack.dedication && (
              <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-2 max-w-sm text-center">
                <p className="text-xs text-rose-300 italic font-serif">
                  "{currentTrack.dedication}"
                </p>
              </div>
            )}
          </div>

          {/* Right Column: Track Details, Timeline, & Main Player Controls */}
          <div className="lg:col-span-7 space-y-6">
            
            {/* Track Info Badges & Title */}
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`text-[10px] font-bold font-mono px-3 py-1 rounded-full border bg-gradient-to-r ${CATEGORY_MAP[currentTrack.category || 'romantic']?.color || CATEGORY_MAP.romantic.color}`}>
                  {CATEGORY_MAP[currentTrack.category || 'romantic']?.icon} {CATEGORY_MAP[currentTrack.category || 'romantic']?.label}
                </span>

                {currentTrack.isPreset ? (
                  <span className="text-[10px] font-semibold text-neutral-400 bg-white/5 px-2.5 py-0.5 rounded-full border border-white/10">
                    Couple Vault Preset
                  </span>
                ) : (
                  <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20">
                    Uploaded by {currentTrack.uploadedBy || 'Us'}
                  </span>
                )}

                {coupleTenant?.animationSongTitle === currentTrack.title && (
                  <span className="text-[10px] font-bold text-amber-300 bg-amber-500/10 px-2.5 py-0.5 rounded-full border border-amber-500/30 flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-amber-400" /> Current Couple Theme
                  </span>
                )}
              </div>

              <h2 className="font-serif text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                {currentTrack.title}
              </h2>
              
              <p className="text-sm font-semibold text-rose-400">
                {currentTrack.artist || 'Romantic Melody'}
              </p>
            </div>

            {/* Timeline Progress Bar */}
            <div className="space-y-1.5">
              <input
                type="range"
                min={0}
                max={duration || 100}
                step={0.1}
                value={currentTime}
                onChange={handleSeek}
                className="w-full h-2 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-rose-500 hover:accent-rose-400 transition-all"
              />
              <div className="flex justify-between text-[11px] font-mono text-neutral-400">
                <span>{formatSeconds(currentTime)}</span>
                <span>{formatSeconds(duration)}</span>
              </div>
            </div>

            {/* Main Playback Buttons */}
            <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
              
              {/* Left playback controls: Loop, Prev, Play/Pause, Next */}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setIsLooping(!isLooping)}
                  className={`p-2.5 rounded-xl border transition-all cursor-pointer ${
                    isLooping ? 'bg-rose-500/20 border-rose-500/40 text-rose-300' : 'bg-white/5 border-white/10 text-neutral-400 hover:text-white'
                  }`}
                  title={isLooping ? "Repeat On" : "Repeat Off"}
                >
                  <Repeat className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={handlePrevTrack}
                  className="p-3 bg-white/5 hover:bg-white/10 text-neutral-300 hover:text-white rounded-2xl border border-white/10 transition-colors cursor-pointer"
                  title="Previous Track"
                >
                  <SkipBack className="w-5 h-5" />
                </button>

                <button
                  type="button"
                  onClick={togglePlay}
                  className="w-14 h-14 bg-gradient-to-r from-rose-500 to-pink-600 hover:from-rose-600 hover:to-pink-700 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-rose-600/30 transition-transform active:scale-95 cursor-pointer"
                  title={isPlaying ? "Pause" : "Play"}
                >
                  {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 ml-0.5" />}
                </button>

                <button
                  type="button"
                  onClick={handleNextTrack}
                  className="p-3 bg-white/5 hover:bg-white/10 text-neutral-300 hover:text-white rounded-2xl border border-white/10 transition-colors cursor-pointer"
                  title="Next Track"
                >
                  <SkipForward className="w-5 h-5" />
                </button>
              </div>

              {/* Volume Slider & Mute */}
              <div className="flex items-center gap-2 bg-neutral-900/80 px-3.5 py-2 rounded-2xl border border-white/10">
                <button
                  type="button"
                  onClick={() => setIsMuted(!isMuted)}
                  className="text-neutral-400 hover:text-white transition-colors cursor-pointer"
                  title={isMuted ? "Unmute" : "Mute"}
                >
                  {isMuted || volume === 0 ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 text-neutral-300" />}
                </button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={isMuted ? 0 : volume}
                  onChange={(e) => {
                    setVolume(parseFloat(e.target.value));
                    if (isMuted) setIsMuted(false);
                  }}
                  className="w-20 sm:w-24 h-1.5 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-rose-500"
                />
              </div>

            </div>

            {/* Quick Action Footer: Set as Couple Theme Song & Download */}
            <div className="pt-4 border-t border-white/10 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => handleSetThemeSong(currentTrack)}
                className="px-4 py-2 bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 hover:text-white text-xs font-semibold rounded-xl border border-rose-500/30 flex items-center gap-2 transition-all cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5 text-rose-400" />
                Set as Couple Theme Song
              </button>

              <button
                type="button"
                onClick={() => {
                  setTrackToAssign(currentTrack);
                  setIsAssignCardModalOpen(true);
                }}
                className="px-4 py-2 bg-gradient-to-r from-amber-500/20 to-rose-500/20 hover:from-amber-500/30 hover:to-rose-500/30 text-amber-200 hover:text-white text-xs font-semibold rounded-xl border border-amber-500/30 flex items-center gap-2 transition-all cursor-pointer"
                title="Assign this track to a Celebration / Choose Card"
              >
                <Gift className="w-3.5 h-3.5 text-amber-400" />
                Assign to Card 💌
              </button>

              <a
                href={currentTrack.url}
                download={`${currentTrack.title}.mp3`}
                target="_blank"
                rel="noreferrer"
                className="px-3.5 py-2 bg-white/5 hover:bg-white/10 text-neutral-300 hover:text-white text-xs font-semibold rounded-xl border border-white/10 flex items-center gap-1.5 transition-colors cursor-pointer"
                title="Download this MP3 file"
              >
                <Download className="w-3.5 h-3.5" />
                Download MP3
              </a>

              {onNavigateTab && (
                <button
                  type="button"
                  onClick={() => onNavigateTab('animation')}
                  className="px-3.5 py-2 bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 text-xs font-semibold rounded-xl border border-purple-500/30 flex items-center gap-1.5 transition-colors cursor-pointer ml-auto"
                >
                  <Flame className="w-3.5 h-3.5 text-purple-400" />
                  View in Heart FX
                </button>
              )}
            </div>

          </div>

        </div>
      </div>

      {/* ========================================================= */}
      {/* SECTION 3: SOUNDTRACK LIBRARY & PLAYLIST                  */}
      {/* ========================================================= */}
      <div className="space-y-4">
        
        {/* User Scope Tabs (All, Mine, Partner, Presets) */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 pb-3">
          <div className="flex items-center gap-1.5 overflow-x-auto">
            {[
              { id: 'all' as const, label: 'All Couple Songs', count: counts.all, icon: '💑' },
              { id: 'mine' as const, label: 'My Uploads', count: counts.mine, icon: '👤' },
              { id: 'partner' as const, label: "Partner's Songs", count: counts.partner, icon: '💕' },
              { id: 'presets' as const, label: 'Vault Presets', count: counts.presets, icon: '🎶' },
            ].map((scope) => (
              <button
                key={`scope-${scope.id}`}
                type="button"
                onClick={() => setUserScopeFilter(scope.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                  userScopeFilter === scope.id
                    ? 'bg-rose-500 text-white shadow-md shadow-rose-500/25'
                    : 'bg-white/5 text-neutral-400 hover:text-white hover:bg-white/10'
                }`}
              >
                <span>{scope.icon}</span>
                <span>{scope.label}</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                  userScopeFilter === scope.id ? 'bg-white/20 text-white' : 'bg-white/5 text-neutral-400'
                }`}>
                  {scope.count}
                </span>
              </button>
            ))}
          </div>

          <div className="text-[11px] text-neutral-400 flex items-center gap-2">
            <span>Couple: <strong className="text-rose-300 font-mono">{coupleId || 'shared-space'}</strong></span>
            <span>•</span>
            <span>User: <strong className="text-white">{currentUser}</strong></span>
          </div>
        </div>

        {/* Search bar & Category Filter Chips */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          
          {/* Search Input */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by title, singer, or dedication..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-neutral-900 border border-white/10 rounded-xl text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-rose-400"
            />
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            {[
              { id: 'all', label: 'All Tracks' },
              { id: 'romantic', label: '💖 Romantic' },
              { id: 'celebration', label: '🎉 Celebrations' },
              { id: 'custom', label: 'Uploaded by Us' },
              { id: 'presets', label: 'Vault Presets' }
            ].map((f) => (
              <button
                key={`cat-${f.id}`}
                type="button"
                onClick={() => setFilterCategory(f.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                  filterCategory === f.id
                    ? 'bg-rose-600 text-white shadow-md'
                    : 'bg-neutral-900 text-neutral-400 hover:text-white border border-white/5 hover:border-white/15'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

        </div>

        {/* Tracks List */}
        <div className="bg-neutral-900/60 border border-white/10 rounded-2xl overflow-hidden shadow-xl divide-y divide-white/5">
          {filteredTracks.map((track, idx) => {
            const isThisTrackPlaying = isPlaying && currentTrack.id === track.id;
            const isThisTrackSelected = currentTrack.id === track.id;
            const isMyUpload = !track.isPreset && (
              track.userId === effectiveUserId || 
              (track.uploadedBy && track.uploadedBy.toLowerCase() === currentUser.toLowerCase())
            );

            return (
              <div
                key={`track-row-${track.id}-${idx}`}
                onClick={() => handleSelectTrack(idx)}
                className={`p-4 sm:p-5 flex items-center justify-between gap-4 transition-all cursor-pointer group ${
                  isThisTrackSelected 
                    ? 'bg-rose-950/20 border-l-4 border-l-rose-500' 
                    : 'hover:bg-white/[0.03]'
                }`}
              >
                {/* Left: Play button & Track Info */}
                <div className="flex items-center gap-3.5 min-w-0">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (isThisTrackSelected) {
                        togglePlay();
                      } else {
                        handleSelectTrack(idx);
                      }
                    }}
                    className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-transform active:scale-95 cursor-pointer ${
                      isThisTrackSelected
                        ? 'bg-rose-600 text-white shadow-md shadow-rose-600/30'
                        : 'bg-white/5 group-hover:bg-rose-600 text-neutral-300 group-hover:text-white border border-white/10'
                    }`}
                  >
                    {isThisTrackPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
                  </button>

                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <h4 className={`font-serif text-sm sm:text-base font-bold truncate ${
                        isThisTrackSelected ? 'text-rose-300' : 'text-white group-hover:text-rose-200'
                      }`}>
                        {track.title}
                      </h4>
                      {isThisTrackPlaying && (
                        <span className="flex items-center gap-0.5 text-rose-400">
                          <span className="w-1 h-3 bg-rose-500 animate-pulse rounded-full" />
                          <span className="w-1 h-4 bg-rose-400 animate-pulse delay-75 rounded-full" />
                          <span className="w-1 h-2 bg-rose-500 animate-pulse delay-150 rounded-full" />
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-400">
                      <span className="font-semibold text-neutral-300">{track.artist || 'Romantic Melody'}</span>
                      <span>•</span>
                      <span className="font-mono text-[11px]">{track.duration || '3:30'}</span>
                      {track.fileSize && (
                        <>
                          <span>•</span>
                          <span className="text-[10px] text-neutral-500 font-mono">{track.fileSize}</span>
                        </>
                      )}
                      {!track.isPreset && (
                        <>
                          <span>•</span>
                          {isMyUpload ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-rose-500/15 text-rose-300 border border-rose-500/30 px-2 py-0.5 rounded-full">
                              👤 Added by You
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-purple-500/15 text-purple-300 border border-purple-500/30 px-2 py-0.5 rounded-full">
                              💕 Added by {track.uploadedBy || 'Partner'}
                            </span>
                          )}
                        </>
                      )}
                    </div>

                    {track.dedication && (
                      <p className="text-[11px] text-neutral-400 italic font-serif line-clamp-1">
                        "{track.dedication}"
                      </p>
                    )}
                  </div>
                </div>

                {/* Right: Category badge & Actions */}
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`hidden sm:inline-flex text-[10px] font-bold font-mono px-2.5 py-0.5 rounded-full border bg-gradient-to-r ${CATEGORY_MAP[track.category || 'romantic']?.color || CATEGORY_MAP.romantic.color}`}>
                    {CATEGORY_MAP[track.category || 'romantic']?.icon} {CATEGORY_MAP[track.category || 'romantic']?.label}
                  </span>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSetThemeSong(track);
                    }}
                    title="Set as Couple Theme Song"
                    className="p-2 bg-white/5 hover:bg-rose-500/20 text-neutral-400 hover:text-rose-300 rounded-xl transition-colors cursor-pointer"
                  >
                    <Sparkles className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setTrackToAssign(track);
                      setIsAssignCardModalOpen(true);
                    }}
                    title="Assign to a Celebration Card 💌"
                    className="p-2 bg-white/5 hover:bg-amber-500/20 text-neutral-400 hover:text-amber-300 rounded-xl transition-colors cursor-pointer"
                  >
                    <Gift className="w-4 h-4" />
                  </button>

                  <a
                    href={track.url}
                    download={`${track.title}.mp3`}
                    onClick={(e) => e.stopPropagation()}
                    target="_blank"
                    rel="noreferrer"
                    title="Download Track"
                    className="p-2 bg-white/5 hover:bg-white/10 text-neutral-400 hover:text-white rounded-xl transition-colors cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                  </a>

                  {!track.isPreset && (
                    <button
                      type="button"
                      onClick={(e) => handleDeleteTrack(track, e)}
                      title="Delete Track"
                      className="p-2 bg-white/5 hover:bg-rose-500/20 text-neutral-400 hover:text-rose-400 rounded-xl transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>

              </div>
            );
          })}

          {filteredTracks.length === 0 && (
            <div className="text-center py-12 px-4 space-y-3">
              <Music className="w-10 h-10 text-neutral-600 mx-auto" />
              <h4 className="text-white font-serif text-base font-bold">No tracks found</h4>
              <p className="text-xs text-neutral-400">Try adjusting your search query or upload a new romantic MP3 track.</p>
              <button
                type="button"
                onClick={() => setIsUploadModalOpen(true)}
                className="mt-2 px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer"
              >
                Upload First Track
              </button>
            </div>
          )}
        </div>

      </div>

      {/* ========================================================= */}
      {/* MODAL: UPLOAD MP3 AUDIO TRACK                             */}
      {/* ========================================================= */}
      <AnimatePresence>
        {isUploadModalOpen && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-lg bg-neutral-900 border border-white/15 rounded-3xl p-6 sm:p-8 shadow-2xl relative space-y-6 max-h-[92vh] overflow-y-auto"
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div className="flex items-center gap-2.5">
                  <div className="p-2.5 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400">
                    <Upload className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-serif text-xl font-bold text-white">Upload Romantic MP3 Track</h3>
                    <p className="text-xs text-neutral-400">Add songs to your shared couple jukebox</p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setIsUploadModalOpen(false)}
                  className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-neutral-400 hover:text-white transition-colors cursor-pointer"
                >
                  ✕
                </button>
              </div>

              {/* Form */}
              <form onSubmit={handleUploadSubmit} className="space-y-4">
                
                {/* File picker area */}
                <div>
                  <label className="block text-xs font-semibold text-neutral-300 mb-1.5">
                    Select Audio File (.mp3, .wav, .m4a, .ogg) *
                  </label>
                  
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="audio/*,.mp3,.wav,.m4a,.ogg,.aac"
                    onChange={handleFileChange}
                    className="hidden"
                  />

                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all ${
                      selectedFile 
                        ? 'border-rose-500/50 bg-rose-950/20' 
                        : 'border-white/15 hover:border-rose-400/50 bg-neutral-950/50 hover:bg-neutral-950'
                    }`}
                  >
                    <Music className={`w-10 h-10 mx-auto mb-2 ${selectedFile ? 'text-rose-400 animate-bounce' : 'text-neutral-500'}`} />
                    
                    {selectedFile ? (
                      <div className="space-y-1">
                        <p className="text-xs font-bold text-white truncate max-w-xs mx-auto">
                          {selectedFile.name}
                        </p>
                        <p className="text-[11px] text-emerald-400 font-mono">
                          ✓ Ready ({(selectedFile.size / (1024 * 1024)).toFixed(2)} MB)
                        </p>
                        <span className="text-[10px] text-neutral-400 underline block pt-1">
                          Click to choose a different file
                        </span>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <p className="text-xs font-bold text-neutral-200">
                          Click or drag & drop your MP3 here
                        </p>
                        <p className="text-[11px] text-neutral-500">
                          Supports MP3, WAV, M4A, OGG up to 50 MB
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Song Title */}
                <div>
                  <label className="block text-xs font-semibold text-neutral-300 mb-1">
                    Song Title *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Perfect, Odam El Nas, Our First Dance"
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-neutral-950 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-rose-400"
                  />
                </div>

                {/* Singer / Artist */}
                <div>
                  <label className="block text-xs font-semibold text-neutral-300 mb-1">
                    Artist / Singer Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Mohamed Hamaki, Ed Sheeran, Amr Diab"
                    value={formArtist}
                    onChange={(e) => setFormArtist(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-neutral-950 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-rose-400"
                  />
                </div>

                {/* Category */}
                <div>
                  <label className="block text-xs font-semibold text-neutral-300 mb-1">
                    Track Category
                  </label>
                  <select
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value as any)}
                    className="w-full px-3.5 py-2.5 bg-neutral-950 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-rose-400"
                  >
                    <option value="romantic">💖 Romantic Ballad</option>
                    <option value="celebration">🎉 Celebration & Party</option>
                    <option value="birthday">🎂 Birthday Anthem</option>
                    <option value="slow_dance">💃 Slow Dance</option>
                    <option value="memory">✨ Cherished Memory</option>
                    <option value="other">🎵 Special Melody</option>
                  </select>
                </div>

                {/* Dedication Note */}
                <div>
                  <label className="block text-xs font-semibold text-neutral-300 mb-1">
                    Sweet Dedication / Romantic Memory Note
                  </label>
                  <textarea
                    rows={2}
                    placeholder="e.g. The song we listened to while watching the sunset over the sea..."
                    value={formDedication}
                    onChange={(e) => setFormDedication(e.target.value)}
                    className="w-full px-3.5 py-2 bg-neutral-950 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-rose-400"
                  />
                </div>

                {/* Error message */}
                {uploadError && (
                  <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                    <span>{uploadError}</span>
                  </div>
                )}

                {/* Progress bar */}
                {isUploading && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px] text-neutral-400">
                      <span>Uploading & Processing...</span>
                      <span>{uploadProgress}%</span>
                    </div>
                    <div className="w-full h-2 bg-neutral-800 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-rose-500 to-pink-500 transition-all duration-300"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Submit & Cancel */}
                <div className="flex gap-2 pt-2 border-t border-white/10">
                  <button
                    type="button"
                    onClick={() => setIsUploadModalOpen(false)}
                    disabled={isUploading}
                    className="flex-1 py-3 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white text-xs font-bold rounded-xl transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    disabled={isUploading || !selectedFile}
                    className="flex-1 py-3 bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-rose-600/30 transition-all disabled:opacity-50 cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    {isUploading ? (
                      <>
                        <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Saving Track...
                      </>
                    ) : (
                      <>
                        <Upload className="w-4 h-4" />
                        Save to Jukebox
                      </>
                    )}
                  </button>
                </div>

              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ========================================================= */}
      {/* MODAL: ASSIGN TRACK TO CELEBRATION CARD                   */}
      {/* ========================================================= */}
      <AnimatePresence>
        {isAssignCardModalOpen && trackToAssign && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="w-full max-w-lg bg-neutral-900 border border-white/10 rounded-3xl p-6 shadow-2xl relative overflow-hidden space-y-5"
            >
              {/* Header */}
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="p-1.5 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      <Gift className="w-4 h-4" />
                    </span>
                    <span className="text-[10px] uppercase font-mono font-bold tracking-widest text-amber-400">
                      Celebration Card Soundtrack
                    </span>
                  </div>
                  <h3 className="font-serif text-xl font-bold text-white">
                    Assign Song to Celebration Card 💌
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsAssignCardModalOpen(false);
                    setTrackToAssign(null);
                  }}
                  className="p-1.5 text-neutral-400 hover:text-white rounded-xl hover:bg-white/5 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Selected Track Pill */}
              <div className="p-3.5 bg-neutral-950/80 border border-white/10 rounded-2xl flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-rose-500/20 to-purple-500/20 border border-rose-500/30 flex items-center justify-center text-rose-400 shrink-0">
                  <Music className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="text-sm font-bold text-white truncate font-serif">
                    {trackToAssign.title}
                  </h4>
                  <p className="text-xs text-neutral-400 truncate">
                    {trackToAssign.artist || 'Romantic Soundtrack'} • {trackToAssign.duration || '3:30'}
                  </p>
                </div>
                <span className={`text-[10px] font-bold font-mono px-2.5 py-1 rounded-full border bg-gradient-to-r ${CATEGORY_MAP[trackToAssign.category || 'romantic']?.color || CATEGORY_MAP.romantic.color}`}>
                  {CATEGORY_MAP[trackToAssign.category || 'romantic']?.icon} {CATEGORY_MAP[trackToAssign.category || 'romantic']?.label}
                </span>
              </div>

              {/* Cards List to Pick From */}
              <div className="space-y-2.5 max-h-[320px] overflow-y-auto pr-1">
                <div className="text-xs font-semibold text-neutral-300 flex items-center justify-between">
                  <span>Select which celebration card should play this song:</span>
                  <span className="text-[10px] text-neutral-400 font-mono">
                    {celebrationCards.length} available
                  </span>
                </div>

                {celebrationCards.length === 0 ? (
                  <div className="text-center py-8 px-4 bg-neutral-950/50 rounded-2xl border border-white/5 space-y-3">
                    <Sparkles className="w-8 h-8 text-neutral-500 mx-auto" />
                    <p className="text-xs text-neutral-400">
                      No celebration cards created yet. Create a birthday, engagement, anniversary, or fireworks card first!
                    </p>
                    {onNavigateTab && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsAssignCardModalOpen(false);
                          onNavigateTab('choose');
                        }}
                        className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer"
                      >
                        Go to Celebration Cards
                      </button>
                    )}
                  </div>
                ) : (
                  celebrationCards.map((card) => {
                    const isAlreadyAssigned = card.musicUrl === trackToAssign.url;
                    return (
                      <div
                        key={`assign-card-${card.id}`}
                        className={`p-3.5 rounded-2xl border transition-all flex items-center justify-between gap-3 ${
                          isAlreadyAssigned
                            ? 'bg-rose-500/10 border-rose-500/30'
                            : 'bg-neutral-950/60 hover:bg-white/5 border-white/10'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-[9px] uppercase font-bold px-2 py-0.5 rounded-md bg-white/10 text-rose-300 font-mono border border-white/10">
                              {card.type === 'birthday' ? '🎂 Birthday' : card.type === 'engagement' ? '💍 Engagement' : card.type === 'fireworks' ? '🎆 Fireworks' : '✨ Celebration'}
                            </span>
                            {card.partnerName && (
                              <span className="text-[11px] text-neutral-400 truncate">
                                For {card.partnerName}
                              </span>
                            )}
                          </div>
                          <h5 className="text-sm font-bold text-white font-serif truncate">
                            {card.title}
                          </h5>
                          <p className="text-[11px] text-neutral-400 truncate flex items-center gap-1 mt-0.5">
                            <Headphones className="w-3 h-3 text-neutral-500 shrink-0" />
                            <span>
                              {card.musicUrl ? (
                                isAlreadyAssigned ? 'Currently assigned to this song' : 'Has different soundtrack assigned'
                              ) : 'Using default card song'}
                            </span>
                          </p>
                        </div>

                        <div className="shrink-0">
                          {isAlreadyAssigned ? (
                            <span className="px-3 py-1.5 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-bold flex items-center gap-1.5">
                              <Check className="w-3.5 h-3.5" />
                              Assigned
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleAssignTrackToCard(card, trackToAssign)}
                              className="px-3.5 py-1.5 bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 text-white text-xs font-bold rounded-xl shadow-md transition-all transform hover:scale-[1.02] active:scale-95 cursor-pointer flex items-center gap-1.5"
                            >
                              <Gift className="w-3.5 h-3.5" />
                              Assign Song
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Modal Footer */}
              <div className="pt-3 border-t border-white/10 flex items-center justify-between">
                <span className="text-[11px] text-neutral-400 flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  Card will play this soundtrack instantly when opened
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setIsAssignCardModalOpen(false);
                    setTrackToAssign(null);
                  }}
                  className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white text-xs font-bold rounded-xl transition-colors cursor-pointer"
                >
                  Close
                </button>
              </div>

            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}

export default MusicLounge;
