import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MessageSquareHeart, Sparkles, Heart, ChevronLeft, ChevronRight, Cake, Calendar, Gift } from 'lucide-react';
import { Milestone, CountdownConfig } from '../types';
import { formatMilestoneDateInEgypt, parseEventDateInEgypt, getEgyptCalendarComponents } from '../utils';

interface FlipUnitProps {
  value: number;
  label: string;
}

const FlipUnit: React.FC<FlipUnitProps> = ({ value, label }) => {
  const strValue = String(value).padStart(2, '0');

  return (
    <div className="flex flex-col items-center min-w-[65px] sm:min-w-[90px] shrink-0">
      <div className="relative flex gap-1.5 sm:gap-2 justify-center">
        {strValue.split('').map((char, index) => (
          <div
            key={`${label}-digit-${index}`}
            className="relative w-8 h-12 sm:w-11 sm:h-16 bg-neutral-950/95 border border-white/10 rounded-xl overflow-hidden shadow-xl flex items-center justify-center font-mono font-extrabold text-xl sm:text-3xl text-rose-400"
          >
            {/* Top half background split */}
            <div className="absolute top-0 left-0 right-0 h-[50%] bg-white/[0.04] border-b border-black/40" />

            {/* Flipped character */}
            <AnimatePresence mode="popLayout">
              <motion.span
                key={`${label}-${index}-${char}`}
                initial={{ y: -12, opacity: 0, rotateX: -70 }}
                animate={{ y: 0, opacity: 1, rotateX: 0 }}
                exit={{ y: 12, opacity: 0, rotateX: 70 }}
                transition={{ type: 'spring', stiffness: 220, damping: 15 }}
                className="inline-block relative z-10"
                style={{ transformOrigin: 'center', backfaceVisibility: 'hidden' }}
              >
                {char}
              </motion.span>
            </AnimatePresence>

            {/* Soft highlight */}
            <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/[0.01] to-white/[0.05] pointer-events-none" />

            {/* Horizontal divider line */}
            <div className="absolute top-[50%] left-0 right-0 h-[1px] bg-black/50 z-20" />
          </div>
        ))}
      </div>
      <span className="text-[10px] sm:text-xs uppercase font-extrabold tracking-widest text-neutral-400 mt-2.5 sm:mt-3 font-sans">
        {label}
      </span>
    </div>
  );
};

interface AnniversaryCountdownProps {
  milestones: Milestone[];
  selectedAnniversaryId?: string;
  onCycleAnniversary?: (direction: number) => void;
  countdownConfig?: CountdownConfig;
}

export const AnniversaryCountdown: React.FC<AnniversaryCountdownProps> = ({ 
  milestones = [], 
  selectedAnniversaryId,
  onCycleAnniversary,
  countdownConfig
}) => {
  // Respect enabled setting from Admin Panel
  if (countdownConfig && countdownConfig.enabled === false) {
    return null;
  }

  const safeMilestones = Array.isArray(milestones) ? milestones : [];
  
  // Allowed categories configured in Admin Panel (or default to all categories)
  const allowedCategories = countdownConfig?.allowedCategories && countdownConfig.allowedCategories.length > 0
    ? countdownConfig.allowedCategories
    : ['anniversary', 'engagement', 'birthday', 'other'];

  const eligibleMilestones = safeMilestones.filter(
    (m) => m && !m.archived && allowedCategories.includes(m.category)
  );

  // If custom mode is selected in admin panel, use custom configuration
  const isCustomMode = countdownConfig?.mode === 'custom' && !!countdownConfig.customDate;
  
  // Determine active milestone
  let activeMilestone: Milestone | undefined;
  if (!isCustomMode) {
    // If admin designated a specific featured milestone
    if (countdownConfig?.featuredMilestoneId) {
      activeMilestone = safeMilestones.find(m => m && m.id === countdownConfig.featuredMilestoneId);
    }
    
    // Otherwise use selectedAnniversaryId or first eligible
    if (!activeMilestone && selectedAnniversaryId) {
      activeMilestone = eligibleMilestones.find((m) => m && m.id === selectedAnniversaryId);
    }
    
    if (!activeMilestone) {
      activeMilestone = eligibleMilestones[0] || safeMilestones[0];
    }
  }

  const rawDate = isCustomMode 
    ? (countdownConfig.customDate || '2026-12-31')
    : (activeMilestone?.date || '2025-01-31');

  const countdownTitle = isCustomMode
    ? (countdownConfig.customTitle || 'Our Special Day')
    : (activeMilestone ? activeMilestone.title : 'Our Next Milestone');

  const currentCategory = isCustomMode
    ? (countdownConfig.customCategory || 'anniversary')
    : (activeMilestone?.category || 'anniversary');

  const [timeLeft, setTimeLeft] = useState({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
    isToday: false,
  });

  useEffect(() => {
    const calculateTimeLeft = () => {
      let month = 0;
      let day = 1;
      let hours = 0;
      let minutes = 0;

      const hasT = rawDate.includes('T');
      const datePart = hasT ? rawDate.split('T')[0] : rawDate;
      const timePart = hasT ? rawDate.split('T')[1] : '';

      const dateParts = datePart.split('-');
      if (dateParts.length === 3) {
        month = parseInt(dateParts[1], 10) - 1; // 0-indexed
        day = parseInt(dateParts[2], 10);
      }

      if (timePart) {
        const timeParts = timePart.split(':');
        if (timeParts.length >= 2) {
          hours = parseInt(timeParts[0], 10);
          minutes = parseInt(timeParts[1], 10);
        }
      }

      const now = new Date();
      const egyptNowComp = getEgyptCalendarComponents(now);
      let targetYear = egyptNowComp.year;

      // Construct target date string for this year in Egypt
      const targetStrThisYear = `${targetYear}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
      let targetDate = parseEventDateInEgypt(targetStrThisYear);

      // If it has already passed this year, next target is next year
      if (targetDate.getTime() <= now.getTime()) {
        targetYear += 1;
        const targetStrNextYear = `${targetYear}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
        targetDate = parseEventDateInEgypt(targetStrNextYear);
      }

      const difference = targetDate.getTime() - now.getTime();

      if (difference <= 0) {
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0, isToday: true });
        return;
      }

      const d = Math.floor(difference / (1000 * 60 * 60 * 24));
      const h = Math.floor((difference / (1000 * 60 * 60)) % 24);
      const m = Math.floor((difference / 1000 / 60) % 60);
      const s = Math.floor((difference / 1000) % 60);

      const isToday = egyptNowComp.month === month && egyptNowComp.day === day;

      setTimeLeft({
        days: d,
        hours: h,
        minutes: m,
        seconds: s,
        isToday,
      });
    };

    calculateTimeLeft();
    const interval = setInterval(calculateTimeLeft, 1000);

    return () => clearInterval(interval);
  }, [rawDate]);

  const getNextOccurrenceDate = () => {
    let month = 0;
    let day = 1;
    let hours = 0;
    let minutes = 0;

    const hasT = rawDate.includes('T');
    const datePart = hasT ? rawDate.split('T')[0] : rawDate;
    const timePart = hasT ? rawDate.split('T')[1] : '';

    const dateParts = datePart.split('-');
    if (dateParts.length === 3) {
      month = parseInt(dateParts[1], 10) - 1; // 0-indexed
      day = parseInt(dateParts[2], 10);
    } else {
      return rawDate;
    }

    if (timePart) {
      const timeParts = timePart.split(':');
      if (timeParts.length >= 2) {
        hours = parseInt(timeParts[0], 10);
        minutes = parseInt(timeParts[1], 10);
      }
    }

    const now = new Date();
    const egyptNowComp = getEgyptCalendarComponents(now);
    let targetYear = egyptNowComp.year;

    const targetStrThisYear = `${targetYear}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    const targetDate = parseEventDateInEgypt(targetStrThisYear);

    if (targetDate.getTime() <= now.getTime()) {
      targetYear += 1;
    }

    const targetMonthStr = String(month + 1).padStart(2, '0');
    const targetDayStr = String(day).padStart(2, '0');
    const targetHourStr = String(hours).padStart(2, '0');
    const targetMinStr = String(minutes).padStart(2, '0');

    return `${targetYear}-${targetMonthStr}-${targetDayStr}T${targetHourStr}:${targetMinStr}`;
  };

  // Category badge & label styling
  const getCategoryDetails = () => {
    switch (currentCategory) {
      case 'birthday':
        return {
          label: 'Birthday Countdown',
          icon: Cake,
          badgeBg: 'bg-amber-500/10 border-amber-500/25 text-amber-300',
          celebrationText: countdownConfig?.customCelebrationMessage || '🎂 Happy Birthday, My Love! 🎂',
          celebrationSubtext: 'Today we celebrate the most wonderful soul in the world.'
        };
      case 'engagement':
        return {
          label: 'Engagement Countdown',
          icon: Sparkles,
          badgeBg: 'bg-purple-500/10 border-purple-500/25 text-purple-300',
          celebrationText: countdownConfig?.customCelebrationMessage || '💍 Happy Engagement Day! 💍',
          celebrationSubtext: 'The day we promised our hearts to each other forever.'
        };
      case 'other':
        return {
          label: 'Milestone Countdown',
          icon: Gift,
          badgeBg: 'bg-sky-500/10 border-sky-500/25 text-sky-300',
          celebrationText: countdownConfig?.customCelebrationMessage || '✨ Happy Celebration, My Love! ✨',
          celebrationSubtext: 'Another unforgettable chapter in our love story.'
        };
      case 'anniversary':
      default:
        return {
          label: 'Anniversary Countdown',
          icon: Sparkles,
          badgeBg: 'bg-rose-500/10 border-rose-500/25 text-rose-300',
          celebrationText: countdownConfig?.customCelebrationMessage || '🎉 Happy Anniversary, My Love! 🎉',
          celebrationSubtext: 'Today is our special promise day.'
        };
    }
  };

  const categoryDetails = getCategoryDetails();
  const CategoryIcon = categoryDetails.icon;
  const showSeconds = countdownConfig?.showFlipSeconds !== false;

  return (
    <div className="bg-gradient-to-br from-neutral-950/90 via-rose-950/15 to-neutral-950/90 backdrop-blur-md border border-white/10 rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden w-full flex flex-col items-center justify-center text-center">
      {/* Glow Effects */}
      <div className="absolute top-0 right-1/4 w-48 h-48 bg-rose-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-1/4 w-40 h-40 bg-purple-500/5 rounded-full blur-3xl pointer-events-none" />
      
      {/* Countdown Card Header */}
      <div className="relative z-10 flex flex-col items-center gap-2 mb-6 sm:mb-8">
        <div className="flex items-center gap-3">
          {!isCustomMode && onCycleAnniversary && eligibleMilestones.length > 1 && (
            <button 
              onClick={() => onCycleAnniversary(-1)}
              className="p-1 sm:p-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-neutral-300 hover:text-white transition-colors cursor-pointer"
              title="Previous Milestone"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
          )}

          <div className={`flex items-center gap-2 px-3 py-1 border rounded-full text-[10px] sm:text-xs font-bold uppercase tracking-wider animate-pulse ${categoryDetails.badgeBg}`}>
            <CategoryIcon className="w-3.5 h-3.5" />
            <span>{categoryDetails.label}</span>
          </div>

          {!isCustomMode && onCycleAnniversary && eligibleMilestones.length > 1 && (
            <button 
              onClick={() => onCycleAnniversary(1)}
              className="p-1 sm:p-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-neutral-300 hover:text-white transition-colors cursor-pointer"
              title="Next Milestone"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        
        <h2 className="font-serif text-xl sm:text-2xl font-bold text-white tracking-tight mt-1">
          Counting down to:{' '}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-rose-400 via-pink-300 to-purple-300 font-extrabold">
            {countdownTitle}
          </span>
        </h2>
        
        <p className="text-[11px] sm:text-xs text-neutral-400 max-w-md font-sans">
          The exact time remaining until {formatMilestoneDateInEgypt(getNextOccurrenceDate())}
        </p>
      </div>

      {/* The Flip Countdown digits */}
      <div className="relative z-10 w-full max-w-xl mx-auto flex justify-center">
        {timeLeft.isToday ? (
          <div className="text-center py-6">
            <motion.h3
              animate={{ scale: [1, 1.08, 1] }}
              transition={{ repeat: Infinity, duration: 2 }}
              className="font-serif text-xl sm:text-2xl font-extrabold text-rose-400 drop-shadow-[0_0_15px_rgba(244,63,94,0.4)]"
            >
              {categoryDetails.celebrationText}
            </motion.h3>
            <p className="text-sm text-neutral-300 mt-2">{categoryDetails.celebrationSubtext}</p>
          </div>
        ) : (
          <div className="flex justify-center items-center gap-4 sm:gap-6 md:gap-8 flex-wrap">
            <FlipUnit value={timeLeft.days} label="Days" />
            <FlipUnit value={timeLeft.hours} label="Hours" />
            <FlipUnit value={timeLeft.minutes} label="Mins" />
            {showSeconds && <FlipUnit value={timeLeft.seconds} label="Secs" />}
          </div>
        )}
      </div>
    </div>
  );
};

export default AnniversaryCountdown;


