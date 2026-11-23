import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Play, Pause, Sparkles, Volume2, VolumeX, Maximize2, Minimize2, Trash2, 
  Music, Link as LinkIcon, Edit3, Check, Disc, Radio
} from 'lucide-react';
import { CoupleTenant } from '../types';

const MESSAGES = [
  "I Miss You 🤍",
  "I Love You 🤍",
  "Thinking of You 🤍",
  "You're My Star 🤍",
  "I'm So Lucky to Have You 🤍",
  "You're The Best 🤍",
  "Love You Always 🤍",
  "You're My Everything 🤍",
  "You're My Best Friend 🤍",
  "You're My Soulmate 🤍",
  "My Queen 🤍",
  "My Princess 🤍",
  "My Love 🤍",
  "My Heart 🤍",
  "My Soul 🤍",
  "My Life 🤍",
  "My Everything 🤍",
  "My Best Friend 🤍",
  "My Soulmate 🤍",
  "بحبك ❤️"
];

const COLORS = ["#ffffff", "#add8e6", "#ffb6c1"]; // white, lightblue, pink

const DEFAULT_SONG_TITLE = "";
const DEFAULT_SONG_LINK = "";

// Helper to parse YouTube Video ID from any YouTube URL
function getYouTubeId(url: string): string | null {
  if (!url) return null;
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=|shorts\/)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : null;
}

// Helper to determine media type
function getMediaType(url: string): 'youtube' | 'soundcloud' | 'audio' | 'iframe' {
  if (!url) return 'iframe';
  if (getYouTubeId(url)) return 'youtube';
  if (url.includes('soundcloud.com')) return 'soundcloud';
  if (url.match(/\.(mp3|wav|ogg|m4a|aac)(\?.*)?$/i)) return 'audio';
  return 'iframe';
}

interface LoveAnimationProps {
  coupleTenant?: CoupleTenant;
  onUpdateSongLink?: (title: string, link: string) => Promise<void> | void;
}

export function LoveAnimation({ coupleTenant, onUpdateSongLink }: LoveAnimationProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [createdCount, setCreatedCount] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  // Custom Song Link state with persistence (scoped strictly per coupleId with empty default)
  const getInitialTitle = () => {
    if (coupleTenant?.animationSongTitle !== undefined) return coupleTenant.animationSongTitle;
    const cId = coupleTenant?.coupleId;
    if (cId) {
      const scoped = localStorage.getItem(`love_anim_song_title_${cId}`);
      if (scoped !== null) return scoped;
    }
    return "";
  };

  const getInitialLink = () => {
    if (coupleTenant?.animationSongLink !== undefined) return coupleTenant.animationSongLink;
    const cId = coupleTenant?.coupleId;
    if (cId) {
      const scoped = localStorage.getItem(`love_anim_song_link_${cId}`);
      if (scoped !== null) return scoped;
    }
    return "";
  };

  const [songTitle, setSongTitle] = useState(getInitialTitle);
  const [songLink, setSongLink] = useState(getInitialLink);

  // React to real-time couple tenant updates from Firestore
  useEffect(() => {
    setSongTitle(coupleTenant?.animationSongTitle || "");
    setSongLink(coupleTenant?.animationSongLink || "");
  }, [coupleTenant?.animationSongTitle, coupleTenant?.animationSongLink, coupleTenant?.coupleId]);

  const [isEditingSong, setIsEditingSong] = useState(false);
  const [tempTitle, setTempTitle] = useState(songTitle);
  const [tempLink, setTempLink] = useState(songLink);
  const [linkSavedSuccess, setLinkSavedSuccess] = useState(false);

  // Synchronize temp inputs when song state changes
  useEffect(() => {
    setTempTitle(songTitle);
    setTempLink(songLink);
  }, [songTitle, songLink]);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const popupIntervalRef = useRef<any>(null);
  const cleanupTimerRef = useRef<any>(null);

  const TOTAL_POPUPS = 1000;
  const mediaType = getMediaType(songLink);
  const ytId = getYouTubeId(songLink);

  // Sync state with browser fullscreen changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopPopups();
      if (cleanupTimerRef.current) clearTimeout(cleanupTimerRef.current);
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, []);

  // Handle direct HTML5 audio playback when mediaType === 'audio'
  useEffect(() => {
    if (mediaType === 'audio' && audioRef.current && songLink.trim() !== "") {
      if (isPlaying && hasStarted) {
        audioRef.current.src = songLink;
        audioRef.current.muted = isMuted;
        audioRef.current.play().catch(err => console.log("Audio play prevented:", err));
      } else {
        audioRef.current.pause();
      }
    }
  }, [isPlaying, hasStarted, songLink, mediaType, isMuted]);

  // Save song link per couple and persist to Firestore
  const handleSaveSongLink = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const finalLink = tempLink.trim();
    const finalTitle = tempTitle.trim() || (finalLink ? "Custom Song" : "");
    
    setSongTitle(finalTitle);
    setSongLink(finalLink);

    // Save to local storage for quick offline access scoped by coupleId
    const cId = coupleTenant?.coupleId || 'default';
    if (cId) {
      localStorage.setItem(`love_anim_song_title_${cId}`, finalTitle);
      localStorage.setItem(`love_anim_song_link_${cId}`, finalLink);
    }

    if (onUpdateSongLink) {
      await onUpdateSongLink(finalTitle, finalLink);
    }
    
    setIsEditingSong(false);
    setLinkSavedSuccess(true);
    setTimeout(() => setLinkSavedSuccess(false), 3000);
  };

  const startExperience = () => {
    setHasStarted(true);
    setIsPlaying(true);
    setCreatedCount(0);

    // Try full screen if supported
    try {
      const elem = containerRef.current;
      if (elem && elem.requestFullscreen) {
        elem.requestFullscreen();
      }
    } catch (e) {
      console.warn("Fullscreen request ignored or failed:", e);
    }

    startPopups();

    // Start 5-minute auto stop
    if (cleanupTimerRef.current) clearTimeout(cleanupTimerRef.current);
    cleanupTimerRef.current = setTimeout(() => {
      stopPopups();
    }, 5 * 60 * 1000);
  };

  const createSinglePopup = () => {
    if (!containerRef.current) return;
    const container = containerRef.current;

    const popup = document.createElement("div");
    popup.className = "love-popup";
    popup.textContent = MESSAGES[Math.floor(Math.random() * MESSAGES.length)];
    popup.style.color = COLORS[Math.floor(Math.random() * COLORS.length)];

    const rect = container.getBoundingClientRect();
    const screenWidth = rect.width || window.innerWidth;
    const screenHeight = rect.height || window.innerHeight;

    // Safety margins
    const maxWidth = screenWidth - 180;
    const maxHeight = screenHeight - 60;
    const x = Math.floor(Math.random() * (maxWidth < 20 ? 20 : maxWidth));
    const y = Math.floor(Math.random() * (maxHeight < 20 ? 20 : maxHeight));

    popup.style.left = `${x}px`;
    popup.style.top = `${y}px`;

    container.appendChild(popup);

    setCreatedCount(prev => {
      const next = prev + 1;
      if (next >= TOTAL_POPUPS) {
        stopPopups();
      }
      return next;
    });

    setTimeout(() => {
      if (popup && popup.parentElement) {
        popup.remove();
      }
    }, 12000);
  };

  const startPopups = () => {
    if (popupIntervalRef.current) clearInterval(popupIntervalRef.current);
    popupIntervalRef.current = setInterval(() => {
      createSinglePopup();
    }, 60);
  };

  const stopPopups = () => {
    if (popupIntervalRef.current) {
      clearInterval(popupIntervalRef.current);
      popupIntervalRef.current = null;
    }
    setIsPlaying(false);
  };

  const resumePopups = () => {
    setIsPlaying(true);
    startPopups();
  };

  const clearAllPopups = () => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    const popups = container.querySelectorAll('.love-popup');
    popups.forEach(p => p.remove());
    setCreatedCount(0);
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto px-4 py-2 space-y-6 relative text-white">
      {/* Styles for dynamic popups */}
      <style>{`
        .love-popup {
          position: absolute;
          padding: 8px 16px;
          background-color: #e20228;
          font-family: 'Comic Sans MS', cursive, sans-serif;
          font-weight: bold;
          font-size: 16px;
          border-radius: 8px;
          box-shadow: 0 0 10px #e20228;
          z-index: 25;
          pointer-events: auto;
          animation: fadeScaleOut 10s ease forwards;
          white-space: nowrap;
          text-shadow: 0 1px 2px rgba(0,0,0,0.5);
        }

        @keyframes fadeScaleOut {
          0% { opacity: 1; transform: scale(1); }
          100% { opacity: 0; transform: scale(0.5); }
        }

        @media screen and (max-width: 600px) {
          .love-popup {
            padding: 6px 10px;
            font-size: 12px;
          }
        }
      `}</style>

      {/* HTML5 Audio Element for direct stream audio links */}
      {mediaType === 'audio' && (
        <audio ref={audioRef} loop id="love-animation-audio-stream" />
      )}

      {/* Hidden Audio Player Container (plays music without video) */}
      <div className="hidden aria-hidden opacity-0 w-0 h-0 overflow-hidden pointer-events-none absolute">
        {hasStarted && isPlaying && !isMuted && songLink.trim() !== "" && (
          <>
            {mediaType === 'youtube' && ytId ? (
              <iframe
                src={`https://www.youtube.com/embed/${ytId}?autoplay=1&enablejsapi=1&loop=1&playlist=${ytId}`}
                title="Hidden Audio Stream"
                allow="autoplay"
              />
            ) : mediaType === 'soundcloud' ? (
              <iframe
                src={`https://w.soundcloud.com/player/?url=${encodeURIComponent(songLink)}&auto_play=true`}
                title="Hidden SoundCloud Stream"
                allow="autoplay"
              />
            ) : mediaType === 'iframe' ? (
              <iframe
                src={songLink}
                title="Hidden Stream"
                allow="autoplay"
              />
            ) : null}
          </>
        )}
      </div>

      {/* Navigation and Top Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-center border-b border-white/10 pb-4 gap-3">
        <div className="space-y-1 text-center sm:text-left">
          <h2 className="font-serif text-2xl font-bold text-white flex items-center justify-center sm:justify-start gap-2">
            <Sparkles className="w-5 h-5 text-rose-500 animate-pulse" />
            Animation Card 🤍
          </h2>
          <p className="text-xs text-neutral-400">
            A romantic stream of floating love messages with background music streaming right when you touch the heart.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 flex-wrap justify-center">
          {/* Audio Mute/Unmute toggle */}
          <button
            onClick={() => setIsMuted(!isMuted)}
            className={`px-3 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 transition-all shadow-md cursor-pointer border ${
              isMuted 
                ? 'bg-rose-500/20 text-rose-300 border-rose-500/30' 
                : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
            }`}
            title={isMuted ? "Unmute Music" : "Mute Music"}
          >
            {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
            <span>{isMuted ? "Muted" : "Audio On"}</span>
          </button>

          {/* Live Controller Panel (When started) */}
          {hasStarted && (
            <div className="flex items-center gap-1.5 bg-neutral-900/80 border border-white/10 px-2.5 py-1.5 rounded-2xl">
              <button
                onClick={isPlaying ? stopPopups : resumePopups}
                className={`p-2 rounded-xl text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer ${
                  isPlaying ? 'bg-amber-600/20 hover:bg-amber-600/30 text-amber-300' : 'bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300'
                }`}
                title={isPlaying ? "Pause Stream" : "Play Stream"}
              >
                {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                <span className="hidden sm:inline">{isPlaying ? 'Pause' : 'Resume'}</span>
              </button>

              <button
                onClick={clearAllPopups}
                className="p-2 bg-white/5 hover:bg-white/10 rounded-xl text-neutral-300 hover:text-rose-400 transition-colors cursor-pointer"
                title="Clear Popups"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={toggleFullscreen}
                className="p-2 bg-white/5 hover:bg-white/10 rounded-xl text-neutral-300 transition-colors cursor-pointer"
                title="Toggle Fullscreen"
              >
                {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main Canvas Stage */}
      <div 
        ref={containerRef}
        className="w-full h-[520px] bg-neutral-950 border border-white/10 rounded-3xl relative overflow-hidden flex flex-col items-center justify-center shadow-2xl transition-all"
        id="animation-stage-box"
      >
        {/* Floating background grids or lights */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(226,2,40,0.12),transparent_75%)] pointer-events-none z-0" />

        {/* Music Playing Badge Indicator overlay inside Canvas */}
        {hasStarted && (
          <div className="absolute top-4 left-4 right-4 z-10 flex items-center justify-between pointer-events-none">
            <div className="inline-flex items-center gap-2.5 bg-neutral-900/80 border border-rose-500/30 px-3.5 py-2 rounded-2xl backdrop-blur-md shadow-lg pointer-events-auto">
              <Disc className={`w-4 h-4 text-rose-400 ${isPlaying && !isMuted && songLink.trim() !== "" ? 'animate-spin' : ''}`} style={{ animationDuration: '3s' }} />
              <div className="text-left">
                <p className="text-[11px] font-bold text-white max-w-[200px] sm:max-w-xs truncate">
                  {songTitle || (songLink.trim() ? "Custom Song" : "No Music Link Added")}
                </p>
                <p className="text-[9px] text-rose-300 font-mono flex items-center gap-1">
                  {songLink.trim() ? (
                    isPlaying && !isMuted ? (
                      <>
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                        Music Playing 🎵
                      </>
                    ) : isMuted ? (
                      <>
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                        Muted 🔇
                      </>
                    ) : (
                      <>
                        <span className="w-1.5 h-1.5 rounded-full bg-neutral-500" />
                        Paused ⏸️
                      </>
                    )
                  ) : (
                    <>
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                      Add music link below 🎵
                    </>
                  )}
                </p>
              </div>
            </div>

            {/* Mute button on stage */}
            {songLink.trim() ? (
              <button
                onClick={() => setIsMuted(!isMuted)}
                className="p-2.5 bg-neutral-900/80 border border-white/15 rounded-2xl text-neutral-200 hover:text-white backdrop-blur-md cursor-pointer pointer-events-auto shadow-lg hover:border-rose-400/40"
                title={isMuted ? "Unmute Audio" : "Mute Audio"}
              >
                {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
              </button>
            ) : null}
          </div>
        )}

        <AnimatePresence mode="wait">
          {!hasStarted ? (
            /* START OVERLAY SCREEN */
            <motion.div
              key="start-screen"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="z-30 text-center space-y-6 max-w-md px-6 relative bg-neutral-950/85 backdrop-blur-md p-8 rounded-3xl border border-rose-500/30 shadow-2xl"
            >
              <motion.button
                onClick={startExperience}
                className="w-24 h-24 bg-rose-600 rounded-full flex items-center justify-center text-white shadow-[0_0_35px_#e20228] border-2 border-rose-400 focus:outline-none hover:bg-rose-500 cursor-pointer mx-auto group"
                animate={{
                  scale: [1, 1.06, 1],
                  boxShadow: ["0 0 20px #e20228", "0 0 40px #e20228", "0 0 20px #e20228"]
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: "easeInOut"
                }}
              >
                <HeartIcon className="w-10 h-10 fill-white group-hover:scale-110 transition-transform" />
              </motion.button>

              <div className="space-y-3">
                <h3 className="font-serif text-2xl font-bold text-white tracking-tight">
                  Touch the heart to start 🎵
                </h3>
                <p className="text-xs text-neutral-300 leading-relaxed max-w-xs mx-auto">
                  Launches the love message stream and automatically plays your music audio in the background.
                </p>

                {/* Song Badge */}
                <div className="pt-1">
                  <div className="inline-flex items-center gap-2 bg-white/10 border border-white/15 px-4 py-2 rounded-2xl text-xs text-rose-200 font-medium backdrop-blur-md shadow-md">
                    <Radio className="w-4 h-4 text-amber-400 animate-pulse" />
                    <span className="truncate max-w-[220px]">
                      {songTitle || (songLink.trim() ? "Custom Song" : "No song added yet (Add below 🎵)")}
                    </span>
                  </div>
                </div>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        {/* Progress Tracker (Floating bottom) */}
        {hasStarted && (
          <div className="absolute bottom-4 left-4 z-30 bg-black/80 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-white/10 text-[10px] font-mono text-neutral-300 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping" />
            <span>Spawning Popups: {createdCount} / {TOTAL_POPUPS}</span>
          </div>
        )}
      </div>

      {/* Music Link Editor Card */}
      <div className="bg-neutral-900/80 border border-white/10 rounded-2xl p-4 sm:p-5 text-xs text-neutral-300 space-y-3 shadow-xl backdrop-blur-md">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/30">
              <Music className="w-4 h-4" />
            </div>
            <div>
              <h4 className="font-bold text-white text-sm">Background Music Song Link</h4>
              <p className="text-[11px] text-neutral-400">Set YouTube link, SoundCloud link, or MP3 link to play audio when touching the heart</p>
            </div>
          </div>

          {!isEditingSong ? (
            <button
              onClick={() => {
                setTempTitle(songTitle);
                setTempLink(songLink);
                setIsEditingSong(true);
              }}
              className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs inline-flex items-center gap-1.5 transition-all cursor-pointer shadow-md active:scale-95"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>{songLink.trim() ? "Change Music Link" : "Add Music Link"}</span>
            </button>
          ) : null}
        </div>

        {/* Display Current Song or Edit Form */}
        {!isEditingSong ? (
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-neutral-950/60 p-3.5 rounded-2xl border border-white/10">
            {songLink.trim() ? (
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <p className="font-bold text-rose-200 text-xs">{songTitle || "Custom Song"}</p>
                  <span className="text-[10px] uppercase font-bold text-amber-300 bg-amber-500/20 border border-amber-500/30 px-2 py-0.5 rounded-full">
                    {mediaType} audio
                  </span>
                </div>
                <p className="text-[11px] text-neutral-400 font-mono truncate max-w-md">{songLink}</p>
              </div>
            ) : (
              <div className="space-y-0.5">
                <p className="font-bold text-amber-300 text-xs flex items-center gap-1.5">
                  <Radio className="w-3.5 h-3.5" /> No background song set for your couple space
                </p>
                <p className="text-[11px] text-neutral-400">
                  Click &quot;Add Music Link&quot; to set a YouTube URL, SoundCloud link, or MP3 audio stream!
                </p>
              </div>
            )}

            {linkSavedSuccess && (
              <span className="text-emerald-400 text-xs font-bold inline-flex items-center gap-1 bg-emerald-950/50 border border-emerald-500/30 px-3 py-1.5 rounded-xl">
                <Check className="w-3.5 h-3.5" /> Music Link Saved!
              </span>
            )}
          </div>
        ) : (
          <form onSubmit={handleSaveSongLink} className="space-y-3 bg-neutral-950/90 p-4 rounded-2xl border border-rose-500/30">
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-rose-300">Song Title / Description</label>
              <input
                type="text"
                value={tempTitle}
                onChange={(e) => setTempTitle(e.target.value)}
                placeholder="e.g. Habibi Da - Amr Gaber"
                className="w-full bg-neutral-900 border border-white/15 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-rose-400"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-bold text-rose-300">Song Link (YouTube URL, SoundCloud, or MP3 Audio Stream)</label>
              <div className="relative">
                <input
                  type="url"
                  value={tempLink}
                  onChange={(e) => setTempLink(e.target.value)}
                  placeholder="https://www.youtube.com/watch?v=..."
                  className="w-full bg-neutral-900 border border-white/15 rounded-xl pl-8 pr-3 py-2 text-xs text-white focus:outline-none focus:border-rose-400 font-mono"
                />
                <LinkIcon className="w-3.5 h-3.5 text-neutral-500 absolute left-2.5 top-2.5" />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setIsEditingSong(false)}
                className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-neutral-300 text-xs font-medium cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold inline-flex items-center gap-1 cursor-pointer shadow-md"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Save Music Link</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function HeartIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
    </svg>
  );
}

export default LoveAnimation;
