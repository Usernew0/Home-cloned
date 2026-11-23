import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Heart, Sparkles, Mail, MailOpen, Play, Pause, 
  Volume2, VolumeX, Music, HeartHandshake, Hourglass, 
  Clock, Check, RefreshCw, Smartphone, Send
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { Milestone } from '../types';
import { saveMilestoneDoc } from '../lib/syncService';

interface ValentineSpecialProps {
  currentUser: string;
  milestones: Milestone[];
}

export const ValentineSpecial: React.FC<ValentineSpecialProps> = ({ currentUser, milestones }) => {
  const partnerName = 'Partner';

  // States
  const [gameState, setGameState] = useState<'proposal' | 'accepted'>(() => {
    return localStorage.getItem('valentine_proposal_accepted_2026') === 'true' ? 'accepted' : 'proposal';
  });
  const [noButtonPos, setNoButtonPos] = useState({ x: 0, y: 0 });
  const [noButtonClicks, setNoButtonClicks] = useState(0);
  const [isLetterOpen, setIsLetterOpen] = useState(false);
  const [isEnvelopePopped, setIsEnvelopePopped] = useState(false);
  
  // Music Player States
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const TRACKS = [
    {
      title: 'Hamaki - Odam El Nas 🎵',
      src: '/choose/music/odamelnas-hamaki.mp3',
    },
    {
      title: 'Amr Gaber - Habibi Da 💖',
      src: '/audio/Habibi Da - Amr Gaber  عمرو جابر - حبيبي دا (كله قالي اشمعنا هو).mp3',
    }
  ];

  // Love clock states
  const [timeTogether, setTimeTogether] = useState({
    years: 0,
    months: 0,
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0
  });

  // Real-time synchronization of the Valentine proposal status from Firestore
  const valentineMilestone = milestones?.find(m => m.id === 'valentine_2026');
  useEffect(() => {
    if (valentineMilestone) {
      if (valentineMilestone.description === 'accepted') {
        setGameState('accepted');
        localStorage.setItem('valentine_proposal_accepted_2026', 'true');
      } else if (valentineMilestone.description === 'proposal') {
        setGameState('proposal');
        localStorage.removeItem('valentine_proposal_accepted_2026');
      }
    }
  }, [valentineMilestone]);

  // Calculate live counter since Engagement (Nov 2, 2025 18:00:00 Cairo Time)
  useEffect(() => {
    const calculateTime = () => {
      const startDate = new Date('2025-11-02T18:00:00');
      const now = new Date();
      const diffMs = now.getTime() - startDate.getTime();

      if (diffMs <= 0) return;

      const totalSecs = Math.floor(diffMs / 1000);
      const totalMins = Math.floor(totalSecs / 60);
      const totalHours = Math.floor(totalMins / 60);
      const totalDays = Math.floor(totalHours / 24);

      // Simple calculation of years/months/days
      let years = now.getFullYear() - startDate.getFullYear();
      let months = now.getMonth() - startDate.getMonth();
      let days = now.getDate() - startDate.getDate();

      if (days < 0) {
        months -= 1;
        const previousMonth = new Date(now.getFullYear(), now.getMonth(), 0).getDate();
        days += previousMonth;
      }
      if (months < 0) {
        years -= 1;
        months += 12;
      }

      setTimeTogether({
        years,
        months,
        days,
        hours: now.getHours(),
        minutes: now.getMinutes(),
        seconds: now.getSeconds()
      });
    };

    calculateTime();
    const interval = setInterval(calculateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Music Player logic
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = 0.45;
      if (isPlaying) {
        audioRef.current.play().catch((e) => console.log('Audio error:', e));
      } else {
        audioRef.current.pause();
      }
    }
  }, [isPlaying, currentTrackIndex]);

  // Escape button logic
  const handleNoHover = () => {
    setNoButtonClicks((prev) => prev + 1);
    
    // Generate random safe coordinates bounded inside the card container
    const widthLimit = window.innerWidth > 640 ? 400 : 260;
    const heightLimit = 200;
    
    const randomX = (Math.random() - 0.5) * widthLimit;
    const randomY = (Math.random() - 0.5) * heightLimit;
    
    setNoButtonPos({ x: randomX, y: randomY });
  };

  const triggerGrandCelebration = () => {
    const duration = 5 * 1000;
    const end = Date.now() + duration;

    const frame = () => {
      confetti({
        particleCount: 5,
        angle: 60,
        spread: 55,
        origin: { x: 0 },
        colors: ['#f43f5e', '#ec4899', '#db2777', '#f472b6', '#fb7185']
      });
      confetti({
        particleCount: 5,
        angle: 120,
        spread: 55,
        origin: { x: 1 },
        colors: ['#f43f5e', '#ec4899', '#db2777', '#f472b6', '#fb7185']
      });

      if (Date.now() < end) {
        requestAnimationFrame(frame);
      }
    };
    frame();
  };

  const handleYes = () => {
    triggerGrandCelebration();
    setGameState('accepted');
    setIsPlaying(true); // Play Hamaki/Amr Gaber song immediately!
    localStorage.setItem('valentine_proposal_accepted_2026', 'true');

    // Also save to Firestore milestones collection so partner sees it!
    const newMilestone: Milestone = {
      id: 'valentine_2026',
      category: 'other',
      title: 'Valentine Special 2026',
      date: '2026-02-14',
      description: 'accepted',
      sweetMessage: 'My love, will you be my Valentine forever?',
      photos: [],
      themeColor: 'rose',
    };
    saveMilestoneDoc(newMilestone).catch(err => console.error("Failed to sync valentine milestone:", err));
  };

  const funNoTexts = [
    "No 😜",
    "No way! 💕",
    "Nice try! 🌸",
    "Oops, missed! 🏹",
    "Try harder! 😂",
    "Access Denied! 🔒",
    "Error 404: No option 💔",
    "Click Yes instead! 😉",
    "Always Yours! 👑"
  ];

  return (
    <div className="w-full max-w-4xl mx-auto px-4 py-6 font-sans select-none relative z-10">
      
      {/* Background Audio */}
      <audio 
        ref={audioRef} 
        src={TRACKS[currentTrackIndex].src} 
        loop 
        onEnded={() => {
          setCurrentTrackIndex((prev) => (prev + 1) % TRACKS.length);
        }}
      />

      {/* Main Valentine Banner */}
      <div className="text-center mb-10 relative">
        <span className="text-xs font-extrabold uppercase tracking-widest bg-rose-500/10 border border-rose-500/20 px-4 py-1.5 rounded-full text-rose-300 backdrop-blur-md inline-block mb-3 animate-pulse">
          💝 Valentine Special 2026 💝
        </span>
        <h2 className="font-serif text-3.5xl md:text-5xl text-white font-medium tracking-tight mb-2">
          Our Infinite Connection
        </h2>
        <p className="text-xs sm:text-sm text-neutral-400 max-w-lg mx-auto">
          Welcome to our private romantic getaway. Play our game, read the sacred love letter, and vibe to our music.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* LEFT COLUMN: THE PROPOSAL GAME & LETTERS */}
        <div className="lg:col-span-7 space-y-6">
          
          {/* THE ESCAPE GAME / PROPOSAL CARD */}
          <div className="bg-neutral-950/80 border border-rose-500/10 rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden min-h-[380px] flex flex-col justify-between">
            <div className="absolute top-0 right-0 w-48 h-48 bg-rose-500/5 rounded-full blur-3xl pointer-events-none" />
            
            {gameState === 'proposal' ? (
              <AnimatePresence mode="wait">
                <motion.div
                  key="proposal-flow"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="space-y-6 text-center my-auto"
                >
                  <div className="flex justify-center mb-3">
                    <div className="p-4 bg-rose-500/10 rounded-full border border-rose-500/20 text-rose-400 animate-bounce">
                      <Heart className="w-10 h-10 fill-rose-500 text-rose-500" />
                    </div>
                  </div>

                  <h3 className="font-cursive text-4xl sm:text-5xl text-rose-400 leading-tight">
                    My love, will you be my Valentine forever? 💕
                  </h3>
                  
                  <p className="text-xs sm:text-sm text-neutral-300 max-w-md mx-auto">
                    My heart only beats for you. Say YES to unlock the sacred parchment and our lifetime playlist! ❤️
                  </p>

                  <div className="flex flex-col sm:flex-row justify-center items-center gap-4 pt-4 relative min-h-[140px] w-full">
                    
                    {/* YES BUTTON */}
                    <button
                      onClick={handleYes}
                      className="bg-gradient-to-br from-rose-500 to-pink-600 hover:from-rose-600 hover:to-pink-700 text-white px-8 py-4 rounded-2xl text-xl font-bold shadow-xl shadow-rose-950/40 transform hover:scale-105 transition-all cursor-pointer inline-flex items-center gap-2 border border-rose-400/20 active:scale-95 z-20"
                    >
                      <Heart className="w-5 h-5 fill-white" />
                      YES, I DO! 💍❤️
                    </button>

                    {/* ESCAPING NO BUTTON */}
                    <button
                      onMouseEnter={handleNoHover}
                      onTouchStart={handleNoHover}
                      onClick={handleNoHover}
                      style={{
                        position: noButtonPos.x !== 0 || noButtonPos.y !== 0 ? 'absolute' : 'relative',
                        left: noButtonPos.x !== 0 || noButtonPos.y !== 0 ? `calc(50% + ${noButtonPos.x}px)` : 'auto',
                        top: noButtonPos.x !== 0 || noButtonPos.y !== 0 ? `calc(50% + ${noButtonPos.y}px)` : 'auto',
                        transform: noButtonPos.x !== 0 || noButtonPos.y !== 0 ? 'translate(-50%, -50%)' : 'none',
                      }}
                      className="bg-neutral-900 hover:bg-neutral-800 text-neutral-400 px-6 py-3 rounded-2xl text-md font-semibold border border-neutral-800 transition-all duration-100 ease-out z-20 cursor-pointer select-none"
                    >
                      {funNoTexts[noButtonClicks % funNoTexts.length]}
                    </button>

                  </div>
                </motion.div>
              </AnimatePresence>
            ) : (
              <AnimatePresence mode="wait">
                <motion.div
                  key="accepted-flow"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="space-y-6 text-center my-auto py-4"
                >
                  <div className="flex justify-center relative">
                    <div className="absolute inset-0 bg-rose-500/20 rounded-full blur-2xl animate-pulse" />
                    <div className="p-4 bg-gradient-to-tr from-rose-500 to-pink-600 rounded-full border border-rose-400/30 text-white animate-pulse z-10">
                      <HeartHandshake className="w-12 h-12" />
                    </div>
                  </div>

                  <h3 className="font-serif text-3xl font-extrabold text-white">
                    Our Forever is Sealed! 💍✨
                  </h3>

                  <p className="text-sm text-rose-200 font-light max-w-md mx-auto">
                    Thank you for saying YES, my love. I am the happiest person in the world to call you mine. Today, tomorrow, and until eternity. ❤️
                  </p>

                  <div className="inline-flex items-center gap-1.5 bg-rose-500/10 border border-rose-500/20 px-4 py-2 rounded-2xl text-rose-300 text-xs font-semibold">
                    <Check className="w-4 h-4 text-rose-400" />
                    Real-time Milestone Synced on Firestore
                  </div>

                  {/* Celebration trigger button */}
                  <div className="flex flex-wrap justify-center gap-3">
                    <button
                      onClick={triggerGrandCelebration}
                      className="bg-neutral-900 hover:bg-neutral-800 text-rose-300 px-5 py-2.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 border border-white/5 transition-colors cursor-pointer"
                    >
                      <Sparkles className="w-3.5 h-3.5 animate-spin" />
                      Trigger Hearts Storm
                    </button>
                    <button
                      onClick={() => {
                        localStorage.removeItem('valentine_proposal_accepted_2026');
                        setGameState('proposal');
                        setNoButtonClicks(0);
                        setNoButtonPos({ x: 0, y: 0 });

                        // Update in Firestore to reset the milestone state so it matches
                        const resetMilestone: Milestone = {
                          id: 'valentine_2026',
                          category: 'other',
                          title: 'Valentine Special 2026',
                          date: '2026-02-14',
                          description: 'proposal',
                          sweetMessage: 'My love, will you be my Valentine forever?',
                          photos: [],
                          themeColor: 'rose',
                        };
                        saveMilestoneDoc(resetMilestone).catch(err => console.error("Failed to reset valentine milestone:", err));
                      }}
                      className="bg-neutral-900 hover:bg-neutral-800 text-neutral-400 hover:text-rose-200 px-5 py-2.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 border border-white/5 transition-colors cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      Replay Proposal Game
                    </button>
                  </div>
                </motion.div>
              </AnimatePresence>
            )}
          </div>

          {/* THE WAX-SEALED LOVE LETTER */}
          <div className="bg-neutral-950/80 border border-rose-500/10 rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 left-0 w-32 h-32 bg-rose-500/5 rounded-full blur-2xl pointer-events-none" />
            
            <div className="flex items-center gap-2 mb-6">
              <Mail className="w-5 h-5 text-rose-400" />
              <h3 className="font-serif text-lg font-bold text-white">The Sacred Letter</h3>
            </div>

            <AnimatePresence mode="wait">
              {!isEnvelopePopped ? (
                <motion.div
                  key="closed-envelope"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="flex flex-col items-center justify-center py-8"
                >
                  <p className="text-xs text-neutral-400 text-center mb-6 max-w-sm">
                    A sacred Valentine letter sealed with a traditional gold wax seal. Tap the seal to break it and unroll the parchment.
                  </p>

                  {/* Envelope Graphics */}
                  <div className="relative w-64 h-44 bg-rose-900/40 rounded-2xl border-2 border-rose-800/60 shadow-inner flex items-center justify-center cursor-pointer group transition-transform hover:scale-[1.02]">
                    <div className="absolute inset-0 bg-gradient-to-t from-rose-950/40 to-transparent rounded-2xl" />
                    
                    {/* Golden Wax Seal */}
                    <button
                      onClick={() => {
                        setIsEnvelopePopped(true);
                        setTimeout(() => setIsLetterOpen(true), 600);
                      }}
                      className="relative w-16 h-16 rounded-full bg-gradient-to-br from-amber-400 via-yellow-500 to-amber-600 shadow-xl border-4 border-amber-300/60 flex items-center justify-center transform active:scale-90 transition-transform group-hover:scale-110 cursor-pointer animate-pulse z-10"
                    >
                      <Heart className="w-7 h-7 fill-amber-900 text-amber-900" />
                    </button>

                    {/* Flap lines */}
                    <div className="absolute top-0 left-0 right-0 h-1/2 border-b border-rose-800/40" style={{ clipPath: 'polygon(0 0, 50% 100%, 100% 0)' }} />
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="opened-envelope"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="space-y-6"
                >
                  <div className="bg-amber-50/5 text-amber-100/90 font-serif p-6 sm:p-8 rounded-2xl border border-amber-900/20 shadow-inner max-h-[400px] overflow-y-auto leading-relaxed relative bg-[radial-gradient(#2c1e1c_1px,transparent_1px)] [background-size:16px_16px]">
                    <div className="absolute top-2 right-4 text-xs font-mono text-amber-500/60">Alexandria, Egypt</div>
                    
                    <h4 className="font-cursive text-2xl text-rose-300 mb-4 border-b border-amber-500/10 pb-2">Dearest Love,</h4>
                    
                    <p className="text-sm sm:text-md mb-4 text-neutral-200">
                      I am writing this to you because my heart overflows with words that standard days can't contain. Loving you has been the single most natural, breathtakingly beautiful adventure of my entire life.
                    </p>
                    <p className="text-sm sm:text-md mb-4 text-neutral-200">
                      From the sweet moments we shared to every daily call, you have completed my soul. You are my safety, my laughter, and my absolute home.
                    </p>
                    <p className="text-sm sm:text-md mb-4 text-neutral-200">
                      On this Valentine's Day, I promise to cherish you, support you, tease you with silly jokes, and love you deeper with every single sunrise. Thank you for choosing me.
                    </p>

                    <div className="mt-8 pt-4 border-t border-amber-500/10 flex flex-col items-end">
                      <span className="text-xs uppercase font-bold tracking-widest text-rose-400">Yours Eternally,</span>
                      <span className="font-cursive text-xl text-rose-300 mt-1">Forever Yours ❤️</span>
                    </div>
                  </div>

                  <div className="flex justify-center">
                    <button
                      onClick={() => {
                        setIsEnvelopePopped(false);
                        setIsLetterOpen(false);
                      }}
                      className="bg-white/5 hover:bg-white/10 text-neutral-400 hover:text-white text-xs px-4 py-2 rounded-xl border border-white/5 transition-colors cursor-pointer"
                    >
                      Reseal Envelope 🔒
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

          </div>

        </div>

        {/* RIGHT COLUMN: REAL-TIME CLOCK & VIBE PLAYER */}
        <div className="lg:col-span-5 space-y-6">
          
          {/* RELATIONSHIP TICKING STOPWATCH */}
          <div className="bg-neutral-950/80 border border-rose-500/10 rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-rose-500/5 rounded-full blur-2xl pointer-events-none" />
            
            <div className="flex items-center gap-2 mb-6">
              <Hourglass className="w-5 h-5 text-rose-400 animate-spin" style={{ animationDuration: '6s' }} />
              <h3 className="font-serif text-lg font-bold text-white">Our Love Timer</h3>
            </div>

            <div className="space-y-4">
              <p className="text-xs text-neutral-400 text-center max-w-sm mx-auto mb-2">
                Time passed in pure bliss since we decided to be together forever:
              </p>

              {/* Grid of Clock Numbers */}
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-white/5 border border-white/5 p-3 rounded-2xl text-center">
                  <span className="block text-2xl font-extrabold text-white font-mono">{timeTogether.years}</span>
                  <span className="text-[10px] text-neutral-400 uppercase font-bold tracking-wide">Years</span>
                </div>
                <div className="bg-white/5 border border-white/5 p-3 rounded-2xl text-center">
                  <span className="block text-2xl font-extrabold text-white font-mono">{timeTogether.months}</span>
                  <span className="text-[10px] text-neutral-400 uppercase font-bold tracking-wide">Months</span>
                </div>
                <div className="bg-white/5 border border-white/5 p-3 rounded-2xl text-center">
                  <span className="block text-2xl font-extrabold text-white font-mono">{timeTogether.days}</span>
                  <span className="text-[10px] text-neutral-400 uppercase font-bold tracking-wide">Days</span>
                </div>
                <div className="bg-white/5 border border-white/5 p-3 rounded-2xl text-center">
                  <span className="block text-xl font-bold text-rose-300 font-mono">
                    {timeTogether.hours.toString().padStart(2, '0')}
                  </span>
                  <span className="text-[9px] text-neutral-400 uppercase tracking-wide">Hrs</span>
                </div>
                <div className="bg-white/5 border border-white/5 p-3 rounded-2xl text-center">
                  <span className="block text-xl font-bold text-rose-300 font-mono">
                    {timeTogether.minutes.toString().padStart(2, '0')}
                  </span>
                  <span className="text-[9px] text-neutral-400 uppercase tracking-wide">Mins</span>
                </div>
                <div className="bg-white/5 border border-white/5 p-3 rounded-2xl text-center">
                  <span className="block text-xl font-bold text-rose-300 font-mono">
                    {timeTogether.seconds.toString().padStart(2, '0')}
                  </span>
                  <span className="text-[9px] text-neutral-400 uppercase tracking-wide">Secs</span>
                </div>
              </div>

              <div className="text-center mt-4">
                <span className="text-[10px] text-neutral-500 font-semibold uppercase tracking-wider">و هفضل احبك لحد اخر العمر</span>
              </div>
            </div>
          </div>

          {/* PRIVATE ROMANTIC MUSIC PLAYER */}
          <div className="bg-neutral-950/80 border border-rose-500/10 rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 left-0 w-32 h-32 bg-rose-500/5 rounded-full blur-2xl pointer-events-none" />
            
            <div className="flex items-center gap-2 mb-6 justify-between">
              <div className="flex items-center gap-2">
                <Music className="w-5 h-5 text-rose-400 animate-pulse" />
                <h3 className="font-serif text-lg font-bold text-white">Private Vibe Station</h3>
              </div>
              <span className="text-[10px] uppercase font-bold bg-rose-500/10 border border-rose-500/20 text-rose-400 px-2 py-0.5 rounded-full">
                Active
              </span>
            </div>

            <div className="flex flex-col items-center space-y-6">
              
              {/* CD Disc Graphic */}
              <div className="relative">
                <div className="absolute inset-0 bg-rose-500/10 rounded-full blur-xl animate-pulse" />
                <div 
                  className={`w-32 h-32 rounded-full bg-neutral-900 border-4 border-neutral-800 shadow-2xl flex items-center justify-center relative overflow-hidden transition-transform ${
                    isPlaying ? 'animate-spin' : ''
                  }`}
                  style={{ animationDuration: '10s' }}
                >
                  {/* Vinyl grooves */}
                  <div className="absolute inset-2 border border-neutral-800 rounded-full opacity-40" />
                  <div className="absolute inset-4 border border-neutral-800 rounded-full opacity-40" />
                  <div className="absolute inset-6 border border-neutral-800 rounded-full opacity-40" />
                  
                  {/* Label Center */}
                  <div className="w-12 h-12 bg-gradient-to-tr from-rose-500 to-pink-600 rounded-full border border-neutral-950 flex items-center justify-center">
                    <Heart className="w-4 h-4 fill-white text-white" />
                  </div>
                </div>
              </div>

              {/* Track Info */}
              <div className="text-center w-full">
                <h4 className="text-sm font-semibold text-white truncate max-w-xs mx-auto">
                  {TRACKS[currentTrackIndex].title}
                </h4>
                <p className="text-[10px] text-neutral-400 mt-0.5 uppercase tracking-widest font-semibold font-mono">
                  Curated Love Playlist
                </p>
              </div>

              {/* Animated visualizer bar */}
              <div className="flex items-center justify-center gap-1 h-6">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((bar, idx) => {
                  const randomHeight = isPlaying 
                    ? [12, 24, 8, 18, 14, 20, 10, 22, 16, 12][bar - 1] 
                    : 4;
                  return (
                    <motion.div
                      key={`val-bar-${bar}-${idx}`}
                      animate={{ height: isPlaying ? [4, randomHeight, 4] : 4 }}
                      transition={{ 
                        repeat: Infinity, 
                        duration: 1 + Math.random(), 
                        ease: "easeInOut" 
                      }}
                      className="w-1 rounded-full bg-gradient-to-t from-rose-500 to-pink-500"
                    />
                  );
                })}
              </div>

              {/* Player Controllers */}
              <div className="flex items-center gap-4">
                <button
                  onClick={() => {
                    setCurrentTrackIndex((prev) => (prev - 1 + TRACKS.length) % TRACKS.length);
                  }}
                  className="p-2.5 bg-white/5 hover:bg-white/10 rounded-full border border-white/5 text-neutral-300 hover:text-white transition-colors cursor-pointer"
                  title="Previous Track"
                >
                  <Music className="w-4 h-4" />
                </button>

                <button
                  onClick={() => setIsPlaying(!isPlaying)}
                  className="p-4 bg-rose-600 hover:bg-rose-700 text-white rounded-full shadow-lg shadow-rose-950/30 transform active:scale-95 hover:scale-105 transition-all cursor-pointer"
                  title={isPlaying ? 'Pause' : 'Play'}
                >
                  {isPlaying ? <Pause className="w-6 h-6 fill-white text-white" /> : <Play className="w-6 h-6 fill-white text-white ml-0.5" />}
                </button>

                <button
                  onClick={() => {
                    setCurrentTrackIndex((prev) => (prev + 1) % TRACKS.length);
                  }}
                  className="p-2.5 bg-white/5 hover:bg-white/10 rounded-full border border-white/5 text-neutral-300 hover:text-white transition-colors cursor-pointer"
                  title="Next Track"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>

              {/* Instructions */}
              <p className="text-[10px] text-neutral-500 text-center italic">
                🎵 Featuring our curated romantic playlist.
              </p>

            </div>
          </div>

        </div>

      </div>

    </div>
  );
};
