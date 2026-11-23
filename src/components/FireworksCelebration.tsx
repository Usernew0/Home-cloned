import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Heart, Sparkles, ArrowLeft, Image as ImageIcon, Volume2, VolumeX, Maximize2, Minimize2, Edit2, Images } from 'lucide-react';
import confetti from 'canvas-confetti';

// TypeScript definitions for fireworks simulation
class Firework {
  x: number;
  y: number;
  sx: number;
  sy: number;
  tx: number;
  ty: number;
  distanceToTarget: number;
  distanceTraveled: number;
  coordinates: [number, number][];
  coordinateCount: number;
  angle: number;
  speed: number;
  acceleration: number;
  brightness: number;
  targetRadius: number;

  constructor(sx: number, sy: number, tx: number, ty: number) {
    this.x = sx;
    this.y = sy;
    this.sx = sx;
    this.sy = sy;
    this.tx = tx;
    this.ty = ty;
    const xDistance = sx - tx;
    const yDistance = sy - ty;
    this.distanceToTarget = Math.sqrt(Math.pow(xDistance, 2) + Math.pow(yDistance, 2));
    this.distanceTraveled = 0;
    this.coordinates = [];
    this.coordinateCount = 3;
    while (this.coordinateCount--) {
      this.coordinates.push([this.x, this.y]);
    }
    this.angle = Math.atan2(ty - sy, tx - sx);
    this.speed = 2;
    this.acceleration = 1.04;
    this.brightness = Math.random() * 20 + 55; // 55 to 75
    this.targetRadius = 1;
  }

  update(index: number, fireworks: Firework[], createParticles: (x: number, y: number) => void) {
    this.coordinates.pop();
    this.coordinates.unshift([this.x, this.y]);

    if (this.targetRadius < 8) {
      this.targetRadius += 0.3;
    } else {
      this.targetRadius = 1;
    }

    this.speed *= this.acceleration;

    const vx = Math.cos(this.angle) * this.speed;
    const vy = Math.sin(this.angle) * this.speed;
    const dx = this.x + vx - this.sx;
    const dy = this.y + vy - this.sy;
    this.distanceTraveled = Math.sqrt(Math.pow(dx, 2) + Math.pow(dy, 2));

    if (this.distanceTraveled >= this.distanceToTarget) {
      createParticles(this.tx, this.ty);
      fireworks.splice(index, 1);
    } else {
      this.x += vx;
      this.y += vy;
    }
  }

  draw(ctx: CanvasRenderingContext2D, hue: number) {
    ctx.beginPath();
    const lastCoord = this.coordinates[this.coordinates.length - 1];
    ctx.moveTo(lastCoord[0], lastCoord[1]);
    ctx.lineTo(this.x, this.y);
    ctx.strokeStyle = `hsl(${hue}, 100%, ${this.brightness}%)`;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(this.tx, this.ty, this.targetRadius, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255, 255, 255, 0.4)`;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

class Particle {
  x: number;
  y: number;
  coordinates: [number, number][];
  coordinateCount: number;
  angle: number;
  speed: number;
  friction: number;
  gravity: number;
  hue: number;
  brightness: number;
  alpha: number;
  decay: number;

  constructor(x: number, y: number, overallHue: number) {
    this.x = x;
    this.y = y;
    this.coordinates = [];
    this.coordinateCount = 5;
    while (this.coordinateCount--) {
      this.coordinates.push([this.x, this.y]);
    }
    this.angle = Math.random() * Math.PI * 2;
    this.speed = Math.random() * 9 + 1; // 1 to 10
    this.friction = 0.95;
    this.gravity = 0.8;
    this.hue = Math.random() * 100 - 50 + overallHue; // overallHue +- 50
    this.brightness = Math.random() * 30 + 55; // 55 to 85
    this.alpha = 1;
    this.decay = Math.random() * 0.015 + 0.015; // 0.015 to 0.03
  }

  update(index: number, particles: Particle[]) {
    this.coordinates.pop();
    this.coordinates.unshift([this.x, this.y]);
    this.speed *= this.friction;
    this.x += Math.cos(this.angle) * this.speed;
    this.y += Math.sin(this.angle) * this.speed + this.gravity;
    this.alpha -= this.decay;

    if (this.alpha <= this.decay) {
      particles.splice(index, 1);
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.beginPath();
    const lastCoord = this.coordinates[this.coordinates.length - 1];
    ctx.moveTo(lastCoord[0], lastCoord[1]);
    ctx.lineTo(this.x, this.y);
    ctx.strokeStyle = `hsla(${this.hue}, 100%, ${this.brightness}%, ${this.alpha})`;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}

const DEFAULT_FIREWORKS_GALLERY_CARDS = [
  { id: 1, src: '/choose/images/1.jpg', text: 'she like it (14)', date: '3/6/2024', filterId: 'wavy1', rotate: 'rotate-3', coverEmoji: '💖', coverName: 'Heart Cover' },
  { id: 2, src: '/choose/images/2.jpg', text: 'one of fav', date: '3/6/2024', filterId: 'wavy2', rotate: '-rotate-6', coverEmoji: '✨', coverName: 'Sparkle Cover' },
  { id: 3, src: '/choose/images/3.jpg', text: 'my sweet heart', date: '20/5/2024', filterId: 'wavy3', rotate: '-rotate-2', coverEmoji: '🦜', coverName: 'Parrot Cover' },
  { id: 4, src: '/choose/images/4.jpg', text: 'my cubcake', date: '22/4/2024', filterId: 'wavy1', rotate: 'rotate-6', coverEmoji: '🐼', coverName: 'Panda Cover' },
  { id: 5, src: '/choose/images/5.jpg', text: 'my soulmate', date: '18/09/2023', filterId: 'wavy2', rotate: '-rotate-3', coverEmoji: '🦊', coverName: 'Fox Cover' },
  { id: 6, src: '/choose/images/6.jpg', text: 'my special girl', date: '14/5/2024', filterId: 'wavy3', rotate: 'rotate-4', coverEmoji: '🐨', coverName: 'Koala Cover' },
  { id: 7, src: '/choose/images/7.jpg', text: 'miss you babe', date: 'Idk took from ur IG', filterId: 'wavy1', rotate: '-rotate-4', coverEmoji: '🐯', coverName: 'Tiger Cover' },
  { id: 8, src: '/choose/images/8.jpg', text: "i adore you", date: 'same idk', filterId: 'wavy2', rotate: 'rotate-2', coverEmoji: '🦁', coverName: 'Lion Cover' },
  { id: 9, src: '/choose/images/10.jpg', text: 'best moment together', date: '21/4/2024', filterId: 'wavy3', rotate: '-rotate-3', coverEmoji: '🐻', coverName: 'Bear Cover' },
  { id: 10, src: '/choose/images/11.jpg', text: 'always and forever', date: '21/4/2024', filterId: 'wavy1', rotate: 'rotate-5', coverEmoji: '🦄', coverName: 'Unicorn Cover' },
  { id: 11, src: '/choose/images/12.jpg', text: 'my homiee', date: '21/4/2024', filterId: 'wavy2', rotate: '-rotate-5', coverEmoji: '💍', coverName: 'Ring Cover' },
  { id: 12, src: '/choose/images/13.jpg', text: 'mwaaah', date: '21/4/2024', filterId: 'wavy3', rotate: 'rotate-3', coverEmoji: '🦖', coverName: 'Dino Cover' },
  { id: 13, src: '/choose/images/14.jpg', text: 'beautiful girl', date: '21/4/2024', filterId: 'wavy1', rotate: '-rotate-2', coverEmoji: '🦉', coverName: 'Owl Cover' },
];

import { CelebrationCard, CelebrationCardPhoto } from '../types';
import { calculateCelebrationTarget } from '../utils';

interface FireworksCelebrationProps {
  onBack: () => void;
  card?: CelebrationCard | null;
  photos?: CelebrationCardPhoto[];
  onEdit?: () => void;
}

export function FireworksCelebration({ onBack, card, photos = [], onEdit }: FireworksCelebrationProps) {
  const [subView, setSubView] = useState<'main' | 'gallery'>('main');
  const [previewPhoto, setPreviewPhoto] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlayingMusic, setIsPlayingMusic] = useState(false);
  const [revealedCards, setRevealedCards] = useState<Record<number, boolean>>({});

  // Celebration Target Calculation for fireworks view
  const targetSummary = React.useMemo(() => {
    return calculateCelebrationTarget(card?.type || 'fireworks', card?.originalDate, card?.targetDate, card?.age);
  }, [card]);

  // Dynamic gallery cards mapped from custom card photos or fallback
  const effectiveCards = React.useMemo(() => {
    if (photos && photos.length > 0) {
      const filters = ['wavy1', 'wavy2', 'wavy3'];
      const rotations = ['rotate-3', '-rotate-3', 'rotate-5', '-rotate-5', 'rotate-2', '-rotate-2', 'rotate-6', '-rotate-4'];
      const emojis = ['💖', '✨', '💍', '🐼', '🦊', '🐨', '🦄', '🦁', '🐻', '🦉', '🎂', '💌'];
      const names = ['Sweet Memory', 'Love Spark', 'Forever Soulmate', 'Magic Hug', 'Special Smile', 'Our Golden Hour'];

      return photos.map((p, idx) => ({
        id: idx + 1,
        src: p.src,
        text: p.caption || 'Our Sweet Memory 💖',
        date: card?.targetDate || 'Always & Forever',
        filterId: filters[idx % filters.length],
        rotate: rotations[idx % rotations.length],
        coverEmoji: emojis[idx % emojis.length],
        coverName: p.sourceItemTitle || names[idx % names.length],
      }));
    }
    // If card exists and has an explicit photos array, respect 0 photos choice!
    if (card && Array.isArray(card.photos)) {
      return [];
    }
    return DEFAULT_FIREWORKS_GALLERY_CARDS;
  }, [photos, card]);

  const toggleCardReveal = (id: number) => {
    setRevealedCards(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  // Fireworks collection arrays
  const fireworksRef = useRef<Firework[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const hueRef = useRef<number>(120);
  const timerTickRef = useRef<number>(0);
  const timerTotal = 60;
  const limiterTickRef = useRef<number>(0);
  const limiterTotal = 5;
  const mousedownRef = useRef<boolean>(false);
  const pointerCoordsRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Calculate distance utility
  const calculateDistance = (p1x: number, p1y: number, p2x: number, p2y: number) => {
    const xDistance = p1x - p2x;
    const yDistance = p1y - p2y;
    return Math.sqrt(Math.pow(xDistance, 2) + Math.pow(yDistance, 2));
  };

  // Create explosion particles group
  const createParticles = (x: number, y: number) => {
    const count = 35;
    for (let i = 0; i < count; i++) {
      particlesRef.current.push(new Particle(x, y, hueRef.current));
    }
  };

  // Launch initial confetti burst on entering
  useEffect(() => {
    confetti({
      particleCount: 150,
      spread: 80,
      origin: { y: 0.6 },
      colors: ['#e6612c', '#761a63', '#1d45b3', '#ffffff']
    });

    // Try to auto-start music if possible
    if (audioRef.current) {
      audioRef.current.play()
        .then(() => setIsPlayingMusic(true))
        .catch(() => console.log("Autoplay blocked, user interaction required for music."));
    }

    return () => {
      // Clean up audio
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, []);

  // Dynamically sync and load assigned card audio track if changed
  useEffect(() => {
    if (audioRef.current && card?.musicUrl) {
      const targetUrl = card.musicUrl;
      if (audioRef.current.src !== targetUrl && !audioRef.current.src.endsWith(targetUrl)) {
        audioRef.current.src = targetUrl;
        audioRef.current.load();
        if (isPlayingMusic) {
          audioRef.current.play().catch(() => setIsPlayingMusic(false));
        }
      }
    }
  }, [card?.musicUrl, isPlayingMusic]);

  // Set up and run the Canvas loop
  useEffect(() => {
    if (subView !== 'main' || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;

    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Main animation loop
    const renderLoop = () => {
      animationFrameId = requestAnimationFrame(renderLoop);

      // Gradient background or destination-out for trails
      hueRef.current += 0.5;

      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = 'rgba(8, 8, 38, 0.25)'; // deep night sky color
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.globalCompositeOperation = 'lighter';

      // Update and draw fireworks
      const fireworks = fireworksRef.current;
      let i = fireworks.length;
      while (i--) {
        fireworks[i].draw(ctx, hueRef.current);
        fireworks[i].update(i, fireworks, createParticles);
      }

      // Update and draw particles
      const particles = particlesRef.current;
      let j = particles.length;
      while (j--) {
        particles[j].draw(ctx);
        particles[j].update(j, particles);
      }

      // Auto-launch fireworks when mouse/touch is not pressed
      if (timerTickRef.current >= timerTotal) {
        if (!mousedownRef.current) {
          fireworks.push(
            new Firework(
              canvas.width / 2,
              canvas.height,
              Math.random() * canvas.width,
              Math.random() * (canvas.height / 2)
            )
          );
          timerTickRef.current = 0;
        }
      } else {
        timerTickRef.current++;
      }

      // Limiter when mouse/touch is pressed
      if (limiterTickRef.current >= limiterTotal) {
        if (mousedownRef.current) {
          fireworks.push(
            new Firework(
              canvas.width / 2,
              canvas.height,
              pointerCoordsRef.current.x,
              pointerCoordsRef.current.y
            )
          );
          limiterTickRef.current = 0;
        }
      } else {
        limiterTickRef.current++;
      }
    };

    renderLoop();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', resizeCanvas);
    };
  }, [subView]);

  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen()
        .then(() => setIsFullscreen(true))
        .catch((err) => {
          console.warn("Fullscreen request rejected, using state-based pseudo-fullscreen fallback:", err);
          setIsFullscreen(!isFullscreen);
        });
    } else {
      document.exitFullscreen()
        .then(() => setIsFullscreen(false))
        .catch(() => setIsFullscreen(false));
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  const handlePointerDown = (clientX: number, clientY: number) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    pointerCoordsRef.current = {
      x,
      y,
    };
    mousedownRef.current = true;

    // Immediately launch a firework when clicked/pressed
    fireworksRef.current.push(
      new Firework(
        canvasRef.current.width / 2,
        canvasRef.current.height,
        x,
        y
      )
    );
  };

  const handlePointerMove = (clientX: number, clientY: number) => {
    if (!mousedownRef.current || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    pointerCoordsRef.current = {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  };

  const toggleMusic = () => {
    if (!audioRef.current) return;
    if (isPlayingMusic) {
      audioRef.current.pause();
      setIsPlayingMusic(false);
    } else {
      audioRef.current.play()
        .then(() => setIsPlayingMusic(true))
        .catch((err) => console.warn("Failed to play audio:", err));
    }
  };

  return (
    <div
      ref={containerRef}
      className={`${
        isFullscreen
          ? "fixed inset-0 w-screen h-screen z-50 rounded-none overflow-y-auto"
          : "relative min-h-[85vh] w-full rounded-3xl overflow-hidden"
      } flex flex-col items-center ${
        subView === 'main' ? 'justify-center' : 'justify-start'
      } bg-gradient-to-b from-[#080826] via-[#16062a] to-[#2c0f1e] shadow-2xl border border-white/10 text-white font-sans transition-all duration-300`}
    >
      
      {/* HTML5 AUDIO PLAYER FOR AMBIENT CELEBRATION MUSIC */}
      <audio
        key={`fireworks-audio-${card?.id || 'default'}-${card?.musicUrl || 'habibi'}`}
        ref={audioRef}
        src={card?.musicUrl || "/audio/Habibi Da - Amr Gaber  عمرو جابر - حبيبي دا (كله قالي اشمعنا هو).mp3"}
        loop
        preload="auto"
      />

      {/* ALWAYS MOUNTED INTERACTIVE CANVAS FOR ROCK-SOLID STABILITY */}
      <canvas
        ref={canvasRef}
        style={{ display: subView === 'main' ? 'block' : 'none' }}
        className="absolute inset-0 w-full h-full cursor-crosshair z-0"
        onMouseDown={(e) => handlePointerDown(e.clientX, e.clientY)}
        onMouseMove={(e) => handlePointerMove(e.clientX, e.clientY)}
        onMouseUp={() => { mousedownRef.current = false; }}
        onMouseLeave={() => { mousedownRef.current = false; }}
        onTouchStart={(e) => {
          if (e.touches[0]) handlePointerDown(e.touches[0].clientX, e.touches[0].clientY);
        }}
        onTouchMove={(e) => {
          if (e.touches[0]) handlePointerMove(e.touches[0].clientX, e.touches[0].clientY);
        }}
        onTouchEnd={() => { mousedownRef.current = false; }}
      />

      {/* FLOATING AUDIO & VIEW CONTROLS */}
      <div className="absolute top-4 right-4 z-40 flex items-center gap-2">
        {onEdit && (
          <button
            onClick={onEdit}
            className="p-3 rounded-full bg-white/10 hover:bg-rose-600/80 border border-white/10 hover:border-rose-400/40 text-white shadow-lg transition-all scale-95 hover:scale-105 active:scale-95 cursor-pointer flex items-center justify-center gap-1.5"
            title="Edit this Fireworks Card (Password Protected)"
          >
            <Edit2 className="w-4 h-4 text-rose-300" />
            <span className="text-[11px] font-semibold pr-1 hidden sm:inline">Edit Card</span>
          </button>
        )}

        <button
          onClick={toggleFullscreen}
          className="p-3 rounded-full bg-white/10 hover:bg-rose-600/80 border border-white/10 hover:border-rose-400/40 text-white shadow-lg transition-all scale-95 hover:scale-105 active:scale-95 cursor-pointer flex items-center justify-center"
          title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
        >
          {isFullscreen ? <Minimize2 className="w-4 h-4 text-rose-300 animate-pulse" /> : <Maximize2 className="w-4 h-4 text-rose-300" />}
        </button>

        <button
          onClick={toggleMusic}
          className="p-3 rounded-full bg-white/10 hover:bg-rose-600/80 border border-white/10 hover:border-rose-400/40 text-white shadow-lg transition-all scale-95 hover:scale-105 active:scale-95 cursor-pointer flex items-center justify-center"
          title={isPlayingMusic ? "Mute Music" : "Play Theme Music"}
        >
          {isPlayingMusic ? <Volume2 className="w-4 h-4 text-rose-300 animate-pulse" /> : <VolumeX className="w-4 h-4 text-neutral-400" />}
        </button>
      </div>

      <AnimatePresence mode="wait">
        {subView === 'main' ? (
          /* VIEW 1: INTERACTIVE FIREWORKS CELEBRATION */
          <motion.div
            key="fireworks-canvas"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 w-full h-full flex flex-col justify-center items-center select-none pointer-events-none"
          >
            {/* Content overlay container */}
            <div className="relative z-10 px-6 py-8 text-center max-w-2xl mx-auto space-y-6 pointer-events-auto bg-black/45 backdrop-blur-[4px] rounded-3xl border border-white/10 p-8 m-4 max-h-[85%] overflow-y-auto shadow-2xl">
              <div className="flex flex-wrap items-center justify-center gap-2">
                <span className="text-[10px] uppercase font-extrabold tracking-widest bg-yellow-500/10 border border-yellow-500/25 text-yellow-300 px-3.5 py-1.5 rounded-full inline-flex items-center gap-1.5 animate-pulse">
                  🎆 {card?.title ? card.title.toUpperCase() : 'HAPPY CELEBRATION'} 🎆
                </span>
                <span className="text-[10px] font-bold font-mono px-3 py-1 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 inline-flex items-center gap-1">
                  🎯 {targetSummary.milestoneLabel} • {targetSummary.countdownBadge}
                </span>
              </div>
              
              <h1 className="font-serif text-2xl sm:text-3xl md:text-4xl font-extrabold text-white tracking-tight leading-snug drop-shadow-lg">
                {card?.title || 'Happy 27st Mariomty!! stay happier, stay motivated, stay healthiestttt.'}
                <span className="text-rose-500 ml-1">💖</span>
              </h1>
              
              <div className="space-y-4 font-serif text-neutral-300 leading-relaxed text-sm sm:text-base text-center max-w-lg mx-auto">
                <p className="font-bold text-yellow-300 drop-shadow-[0_0_8px_rgba(253,224,71,0.25)] uppercase tracking-wider text-xs">
                  {card?.partnerName ? `Dedicated to ${card.partnerName} • I LOVE YOU BABE.` : 'I LOVE YOU BABE.'}
                </p>
                <p className="italic font-light whitespace-pre-line">
                  "{card?.letter || 'Just wanna say, so grateful to have you!! You are such a pretty human being both inside out. And this is just to express how grateful I am to have you as my fiancee, friend, soulmate and home. And wish you great success ahead!'}"
                </p>
              </div>

              {/* Photos Attached Indicator / Quick Reel */}
              {effectiveCards.length > 0 && (
                <div className="bg-white/5 border border-white/10 rounded-2xl p-3 max-w-md mx-auto">
                  <div className="flex items-center justify-between text-xs text-neutral-300 mb-2 px-1">
                    <span className="font-semibold flex items-center gap-1.5">
                      <Images className="w-3.5 h-3.5 text-rose-400" />
                      {effectiveCards.length} Celebration Photos Attached
                    </span>
                    <span className="text-[10px] text-yellow-300 font-mono">
                      Category: Fireworks 🎆
                    </span>
                  </div>
                  <div className="flex items-center gap-2 overflow-x-auto pb-1 px-1">
                    {effectiveCards.slice(0, 6).map((c, i) => (
                      <button
                        key={`fw-thumb-${c.id}-${i}`}
                        type="button"
                        onClick={() => {
                          setPreviewPhoto(c.src);
                        }}
                        className="w-12 h-12 rounded-lg overflow-hidden border border-white/20 shrink-0 hover:scale-110 transition-transform cursor-pointer"
                        title={c.text}
                      >
                        <img src={c.src} alt={c.text} className="w-full h-full object-cover" />
                      </button>
                    ))}
                    {effectiveCards.length > 6 && (
                      <span className="text-[11px] text-neutral-400 font-semibold px-2">
                        +{effectiveCards.length - 6} more
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Action Buttons inside the overlay */}
              <div className="pt-2 flex flex-col sm:flex-row gap-4 justify-center items-center">
                {effectiveCards.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => {
                      confetti({ particleCount: 80, spread: 60, colors: ['#ff007f', '#ffd700', '#00e1ff'] });
                      setSubView('gallery');
                    }}
                    className="py-3 px-6 bg-gradient-to-r from-rose-500 to-pink-600 hover:from-rose-600 hover:to-pink-700 text-white rounded-xl shadow-lg border border-rose-400/20 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all transform hover:-translate-y-0.5 active:scale-95 cursor-pointer"
                  >
                    <ImageIcon className="w-4 h-4 animate-bounce" />
                    👉 Recall Our {effectiveCards.length} Moments ✨
                  </button>
                ) : onEdit ? (
                  <button
                    type="button"
                    onClick={onEdit}
                    className="py-3 px-6 bg-gradient-to-r from-rose-600/80 to-purple-600/80 hover:from-rose-600 hover:to-purple-600 text-white rounded-xl shadow-lg border border-rose-400/20 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all transform hover:-translate-y-0.5 active:scale-95 cursor-pointer"
                  >
                    <ImageIcon className="w-4 h-4" />
                    📸 Attach Photos (Optional)
                  </button>
                ) : null}

                <button
                  type="button"
                  onClick={onBack}
                  className="py-3 px-6 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white rounded-xl text-xs font-bold uppercase tracking-wider border border-white/5 transition-all active:scale-95 cursor-pointer"
                >
                  ⬅ Back to Cards
                </button>
              </div>

              <p className="text-[10px] text-neutral-400 font-sans tracking-wide">
                💡 Tip: Click or tap anywhere on the night sky to blast sparkling colored fireworks!
              </p>
            </div>
          </motion.div>
        ) : (
          /* VIEW 2: WAVY MEMORY GALLERY */
          <motion.div
            key="wavy-gallery"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ type: 'spring', damping: 25 }}
            className="w-full min-h-full py-8 px-4 flex flex-col items-center justify-start space-y-8 z-10"
          >
            {/* Gallery Header */}
            <div className="text-center space-y-2 max-w-xl mx-auto">
              <h1 className="font-serif text-3xl sm:text-4xl font-extrabold text-white tracking-tight leading-tight">
                Hover or tap on each frame to see the magic hehe ✨
              </h1>
              <p className="text-xs text-rose-300 uppercase tracking-widest font-bold">
                💍 Recall our {effectiveCards.length} sweet memories 💍
              </p>
              
              <div className="flex items-center justify-center gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setSubView('main')}
                  className="inline-flex items-center gap-2 py-2 px-4 rounded-xl bg-white/10 hover:bg-rose-600 border border-white/10 text-xs font-bold uppercase tracking-wider transition-all scale-95 hover:scale-100 active:scale-95 cursor-pointer text-white shadow-md"
                >
                  ⬅ Back to Fireworks
                </button>
                {onEdit && (
                  <button
                    type="button"
                    onClick={onEdit}
                    className="inline-flex items-center gap-1.5 py-2 px-4 rounded-xl bg-rose-600/30 hover:bg-rose-600 border border-rose-500/30 text-xs font-bold uppercase tracking-wider transition-all scale-95 hover:scale-100 active:scale-95 cursor-pointer text-white shadow-md"
                  >
                    <Edit2 className="w-3.5 h-3.5" /> Edit Card Photos
                  </button>
                )}
              </div>
            </div>

            {/* Cards Grid container */}
            <div className="w-full max-w-6xl mx-auto flex flex-wrap justify-center items-center gap-6 sm:gap-8 pt-4">
              {effectiveCards.length === 0 ? (
                <div className="text-center py-12 px-6 bg-neutral-900/80 border border-white/10 rounded-2xl max-w-md mx-auto space-y-3">
                  <ImageIcon className="w-10 h-10 text-neutral-500 mx-auto opacity-60" />
                  <h3 className="text-white font-serif text-lg font-bold">No Photos Attached Yet</h3>
                  <p className="text-xs text-neutral-400">This celebration was created without photos. You can attach photos from your gallery at any time.</p>
                  {onEdit && (
                    <button
                      type="button"
                      onClick={onEdit}
                      className="mt-2 py-2 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-all cursor-pointer"
                    >
                      Add Photos (Password Required)
                    </button>
                  )}
                </div>
              ) : (
                effectiveCards.map((cardItem, idx) => (
                <div
                  key={`fireworks-card-${cardItem.id}-${idx}`}
                  className={`group relative w-[285px] h-[450px] transition-all duration-500 hover:scale-[1.05] active:scale-98 relative z-10 ${cardItem.rotate} cursor-pointer`}
                  onClick={() => toggleCardReveal(cardItem.id)}
                >
                  {/* Polaroid Outliner Layer using SVG Filter */}
                  <div 
                    className="absolute inset-x-0 top-5 bottom-0 border-[20px] border-white/90 rounded-xl bg-neutral-900 overflow-hidden shadow-2xl transition-all duration-300"
                    style={{ filter: `url(#${cardItem.filterId})` }}
                  />

                  {/* Underlay / initial illustration picture view */}
                  <div className={`absolute inset-x-5 top-10 bottom-16 rounded-lg overflow-hidden bg-gradient-to-br from-neutral-800 to-rose-950/20 border border-white/5 flex flex-col justify-center items-center text-center p-6 space-y-4 transition-opacity duration-500 pointer-events-none ${
                    revealedCards[cardItem.id] ? 'opacity-0' : 'opacity-100 group-hover:opacity-0'
                  }`}>
                    <span className="text-6xl animate-pulse block drop-shadow-md select-none">{cardItem.coverEmoji}</span>
                    <div>
                      <h4 className="font-serif text-base font-bold text-rose-300">{cardItem.coverName}</h4>
                      <p className="text-[10px] text-neutral-400 font-sans tracking-wide mt-1 uppercase">Tap or hover to reveal memory</p>
                    </div>
                  </div>

                  {/* Polaroid memory reveal on Hover/Click */}
                  <div className={`absolute inset-x-5 top-10 bottom-0 flex flex-col items-center justify-between text-center transition-opacity duration-700 pointer-events-none p-2 pt-0 ${
                    revealedCards[cardItem.id] ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                  }`}>
                    <div className="w-full aspect-[4/3] rounded-lg overflow-hidden bg-neutral-950 border border-black/10">
                      <img
                        src={cardItem.src}
                        alt={cardItem.text}
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    </div>
                    
                    <div className="flex-1 flex flex-col justify-center items-center pb-8 px-2 space-y-1">
                      <p className="font-serif text-sm sm:text-base font-extrabold text-white tracking-tight leading-tight">
                        {cardItem.text}
                      </p>
                      <p className="font-sans text-[10px] text-neutral-300 font-semibold tracking-widest uppercase">
                        Date: {cardItem.date}
                      </p>
                    </div>
                  </div>

                </div>
              )))}
            </div>

            {/* SVG WAVINESS FILTERS AS REUSABLE DEFINITIONS */}
            <svg className="absolute w-0 h-0 pointer-events-none" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <filter id="wavy1">
                  <feTurbulence x="0" y="0" baseFrequency="0.2" numOctaves={5} seed="1" />
                  <feDisplacementMap in="SourceGraphic" scale={20} />
                </filter>
                <filter id="wavy2">
                  <feTurbulence x="0" y="0" baseFrequency="0.02" numOctaves={5} seed="1" />
                  <feDisplacementMap in="SourceGraphic" scale={20} />
                </filter>
                <filter id="wavy3">
                  <feTurbulence x="0" y="0" baseFrequency="0.1" numOctaves={5} seed="1" />
                  <feDisplacementMap in="SourceGraphic" scale={20} />
                </filter>
              </defs>
            </svg>
          </motion.div>
        )}
      </AnimatePresence>

      {/* LIGHTBOX PREVIEW MODAL */}
      <AnimatePresence>
        {previewPhoto && (
          <div 
            className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4 backdrop-blur-sm cursor-zoom-out"
            onClick={() => setPreviewPhoto(null)}
          >
            <div className="relative max-w-2xl max-h-[90vh] rounded-2xl overflow-hidden border border-white/20 shadow-2xl">
              <img src={previewPhoto} alt="Memory Preview" className="w-full h-full object-contain max-h-[85vh]" />
              <button
                type="button"
                onClick={() => setPreviewPhoto(null)}
                className="absolute top-3 right-3 p-2 bg-black/70 hover:bg-rose-600 text-white rounded-full transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
