import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Clock, MapPin, Sparkles, Navigation, Calendar, Heart, ArrowRight, BookOpen, ExternalLink, Compass } from 'lucide-react';
import { DatePlan } from '../types';
import { HorizontalScrollWrapper } from './HorizontalScrollWrapper';

export interface AlexandriaSpot {
  id: string;
  name: string;
  arabicName: string;
  area: string;
  vibe: 'cozy' | 'elegant' | 'thrilling' | 'playful' | 'dreamy';
  vibeLabel: string;
  description: string;
  romanticTip: string;
  emoji: string;
  mapsUrl: string;
  suggestedTitle: string;
  suggestedCategory: 'dinner' | 'adventure' | 'home' | 'budget' | 'other';
  suggestedTheme: string;
  suggestedChecklist: string[];
}

export const ALEXANDRIA_SPOTS: AlexandriaSpot[] = [
  {
    id: 'greek-club',
    name: 'White & Blue (The Greek Club)',
    arabicName: 'النادي اليوناني',
    area: 'Anfoushi (Eastern Harbour)',
    vibe: 'elegant',
    vibeLabel: 'Elegant Seafood & Citadel Night View 🍽️',
    description: 'Perched high above the historic Eastern Harbour with a premium, uninterrupted view of the lit-up Qaitbay Citadel. Share the freshest catch in Alexandria as the sea breeze rolls in.',
    romanticTip: 'Go during sunset to watch the citadel stones turn golden, and request a seafront table well in advance.',
    emoji: '🇬🇷',
    mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Greek+Club+Alexandria+White+and+Blue',
    suggestedTitle: 'Seafront Dining at The Greek Club',
    suggestedCategory: 'dinner',
    suggestedTheme: 'Elegant & Fancy 🌹',
    suggestedChecklist: ['Reserve a sea-view table', 'Dress in formal elegant style', 'Prepare a handwritten letter']
  },
  {
    id: 'san-giovanni',
    name: 'San Giovanni Restaurant & Lounge',
    arabicName: 'سان جيوفاني ستانلي',
    area: 'Stanley Bay',
    vibe: 'elegant',
    vibeLabel: 'Grand Piano & Historic Stanley View 🎹',
    description: 'An iconic classical beacon of Alexandrian elegance standing directly over Stanley\'s bay. Listen to a live classical pianist play beautiful melodies while waves crash beneath the windows.',
    romanticTip: 'Coordinate your dress colors, request a romantic tune from the pianist, and take a stroll across the Stanley Bridge under the warm lamps afterward.',
    emoji: '🎹',
    mapsUrl: 'https://www.google.com/maps/search/?api=1&query=San+Giovanni+Hotel+Restaurant+Stanley+Alexandria',
    suggestedTitle: 'Piano Dinner over Stanley Bay',
    suggestedCategory: 'dinner',
    suggestedTheme: 'Elegant & Fancy 🌹',
    suggestedChecklist: ['Book a window seat looking at Stanley Bridge', 'Request a romantic classical song', 'Walk on Stanley Bridge after dinner']
  },
  {
    id: 'montazah-gardens',
    name: 'Montazah Palace Gardens & Tea Island',
    arabicName: 'حدائق المنتزه وجزيرة الشاي',
    area: 'El-Montazah',
    vibe: 'dreamy',
    vibeLabel: 'Royal Pine Forests & Red Bridge Walk 🏰',
    description: 'Walk hand-in-hand through historic royal pine forests planted for kings, cross the iconic red El-Montazah Bridge to Tea Island, and enjoy warm mint tea surrounded by direct open-sea rocky coves.',
    romanticTip: 'Bring an instant camera for high-contrast photos under the royal palms, and visit the historic cove where the Mediterranean waves run highest.',
    emoji: '🏰',
    mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Montazah+Palace+Gardens+Alexandria',
    suggestedTitle: 'Royal Stroll on Montazah Tea Island',
    suggestedCategory: 'adventure',
    suggestedTheme: 'Dreamy & Celestial ✨',
    suggestedChecklist: ['Pack a light jacket for the sea bridge', 'Walk across the iconic Red Bridge', 'Order hot mint tea on Tea Island']
  },
  {
    id: 'gleem-bay',
    name: 'Gleem Bay & Latino Cafe',
    arabicName: 'جليم باي وكافيه لاتينو',
    area: 'Gleem',
    vibe: 'cozy',
    vibeLabel: 'Waves Crashing on the Glass 🌊',
    description: 'Enjoy a premium, close-up window view of the energetic Mediterranean waves crashing directly onto the protective glass. Sit cozy indoors, listening to soft classical music while eating warm soufflé.',
    romanticTip: 'Visit during a stormy winter day or a breezy summer evening, order warm chocolate fondue, and enjoy looking into each other\'s eyes.',
    emoji: '🌊',
    mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Latino+Cafe+Gleem+Bay+Alexandria',
    suggestedTitle: 'Wave-Watching & Dessert at Gleem Bay',
    suggestedCategory: 'dinner',
    suggestedTheme: 'Cozy & Warm ☕️',
    suggestedChecklist: ['Get a direct seaside window booth', 'Share a warm chocolate soufflé', 'Listen to classical music together']
  },
  {
    id: 'corniche-sunset',
    name: 'Corniche Sunset Promenade',
    arabicName: 'كورنيش الاسكندرية',
    area: 'Camp Shezar / Selsela',
    vibe: 'cozy',
    vibeLabel: 'Warm Corn, Sweet Potatoes & Mint Tea 🌅',
    description: 'The absolute staple of true Alexandrian love. Walk along the sea wall during the golden hour, buy roasted sweet potatoes from local street vendors, and sit close on a bench watching the sun sink into the infinite blue.',
    romanticTip: 'Keep your hands locked in theirs as the cool breeze picks up, and buy traditional hot mint tea served in tiny cups from wandering glass thermoses.',
    emoji: '🌅',
    mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Alexandria+Corniche+Selsela+Promenade',
    suggestedTitle: 'Corniche Sunset Batata & Tea Walk',
    suggestedCategory: 'budget',
    suggestedTheme: 'Cozy & Warm ☕️',
    suggestedChecklist: ['Buy hot freshly baked sweet potatoes', 'Sit on the Selsela sea wall', 'Watch the sunset together']
  },
  {
    id: 'nabi-daniel',
    name: 'Nabi Daniel Street Book Hunt & Vintage Tram',
    arabicName: 'شارع النبي دانيال والترام الاصفر',
    area: 'Raml Station (Downtown)',
    vibe: 'playful',
    vibeLabel: 'Retro Tram & Open-Air Book Hunt 📚',
    description: 'Browse the infinite, colorful open-air book stalls of Nabi Daniel Street. Hop onto the double-decker yellow tram, and ride through Alexandria\'s historical heart, enjoying a playful day of retro discovery.',
    romanticTip: 'Give each other a small budget and 10 minutes to hunt for a book or vintage postcard that represents the other. Write a secret romantic note on the inner cover.',
    emoji: '📚',
    mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Nabi+Daniel+Street+Alexandria',
    suggestedTitle: 'Nabi Daniel Street Retro Hunt',
    suggestedCategory: 'adventure',
    suggestedTheme: 'Playful & Creative 🎨',
    suggestedChecklist: ['Find a vintage book for each other', 'Write a custom secret message inside the cover', 'Ride the double-decker yellow tram']
  }
];

interface DateCountdownProps {
  datePlans: DatePlan[];
  onQuickPlan: (spot: AlexandriaSpot) => void;
}

export const DateCountdown: React.FC<DateCountdownProps> = ({ datePlans, onQuickPlan }) => {
  const [nextDate, setNextDate] = useState<DatePlan | null>(null);
  const [timeLeft, setTimeLeft] = useState<{
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
    isOver: boolean;
  }>({ days: 0, hours: 0, minutes: 0, seconds: 0, isOver: true });

  const [matchedSpot, setMatchedSpot] = useState<AlexandriaSpot | null>(null);

  // Find the next upcoming scheduled date plan
  useEffect(() => {
    const now = new Date();
    const upcoming = datePlans
      .filter((plan) => plan.status === 'planned' && new Date(plan.dateTime) > now)
      .sort((a, b) => new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime());

    if (upcoming.length > 0) {
      const closestPlan = upcoming[0];
      setNextDate(closestPlan);

      // Match the location to one of our pre-seeded Alexandria spots
      const locLower = closestPlan.location.toLowerCase();
      const match = ALEXANDRIA_SPOTS.find(
        (spot) =>
          locLower.includes(spot.name.toLowerCase().split('(')[0].trim()) ||
          locLower.includes(spot.id.replace('-', ' ')) ||
          locLower.includes(spot.area.toLowerCase().split('(')[0].trim()) ||
          locLower.includes('greek club') && spot.id === 'greek-club' ||
          locLower.includes('san giovanni') && spot.id === 'san-giovanni' ||
          locLower.includes('montazah') && spot.id === 'montazah-gardens' ||
          locLower.includes('gleem') && spot.id === 'gleem-bay' ||
          locLower.includes('corniche') && spot.id === 'corniche-sunset' ||
          locLower.includes('nabi daniel') && spot.id === 'nabi-daniel'
      );
      setMatchedSpot(match || null);
    } else {
      setNextDate(null);
      setMatchedSpot(null);
    }
  }, [datePlans]);

  // Handle the live countdown timer ticking
  useEffect(() => {
    if (!nextDate) return;

    const calculateTimeLeft = () => {
      const now = new Date().getTime();
      const target = new Date(nextDate.dateTime).getTime();
      const difference = target - now;

      if (difference <= 0) {
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0, isOver: true });
        return;
      }

      const days = Math.floor(difference / (1000 * 60 * 60 * 24));
      const hours = Math.floor((difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((difference % (1000 * 60)) / 1000);

      setTimeLeft({ days, hours, minutes, seconds, isOver: false });
    };

    calculateTimeLeft();
    const intervalId = setInterval(calculateTimeLeft, 1000);

    return () => clearInterval(intervalId);
  }, [nextDate]);

  return (
    <div className="w-full space-y-6 mb-8 select-none">
      <AnimatePresence mode="wait">
        {nextDate ? (
          /* COUNTDOWN ACTIVE VIEW */
          <motion.div
            key="countdown-active"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.4 }}
            className="relative bg-gradient-to-br from-rose-950/35 via-neutral-900/80 to-rose-950/20 rounded-3xl p-6 sm:p-8 border border-rose-500/15 shadow-2xl overflow-hidden"
          >
            {/* Ambient glows */}
            <div className="absolute top-0 right-0 w-44 h-44 bg-rose-500/5 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-10 -left-10 w-44 h-44 bg-pink-500/5 rounded-full blur-3xl pointer-events-none" />

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
              {/* Left Column: Clock icon & Details */}
              <div className="lg:col-span-4 space-y-3 text-center lg:text-left">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/10 text-rose-300 text-[10px] uppercase font-extrabold tracking-widest border border-rose-500/20">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
                  </span>
                  Magical Countdown
                </span>
                
                <h3 className="font-serif text-xl sm:text-2xl font-bold text-white tracking-tight leading-tight">
                  {nextDate.title}
                </h3>
                
                <div className="flex flex-col gap-1.5 justify-center lg:justify-start text-xs text-neutral-400">
                  <div className="inline-flex items-center justify-center lg:justify-start gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                    <span>
                      {new Date(nextDate.dateTime).toLocaleDateString('en-US', {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric'
                      })} at {new Date(nextDate.dateTime).toLocaleTimeString('en-US', {
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </span>
                  </div>
                  <div className="inline-flex items-center justify-center lg:justify-start gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                    <span className="truncate">{nextDate.location}</span>
                  </div>
                </div>
              </div>

              {/* Middle Column: The beautiful Countdown Stopwatch */}
              <div className="lg:col-span-5 flex flex-col items-center justify-center space-y-2 py-4 lg:py-0 border-y lg:border-y-0 lg:border-x border-white/5 px-2">
                <div className="flex items-center gap-2 sm:gap-3">
                  {/* Days */}
                  <div className="flex flex-col items-center">
                    <div className="min-w-[56px] sm:min-w-[64px] h-14 sm:h-16 bg-neutral-950/60 rounded-2xl border border-white/10 flex items-center justify-center shadow-inner relative overflow-hidden">
                      <div className="absolute top-0 left-0 w-full h-[1px] bg-white/15" />
                      <span className="font-serif text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                        {String(timeLeft.days).padStart(2, '0')}
                      </span>
                    </div>
                    <span className="text-[10px] uppercase font-bold tracking-wider text-rose-300 mt-1.5">Days</span>
                  </div>

                  <span className="text-xl sm:text-2xl font-serif text-neutral-500 animate-pulse pb-5">:</span>

                  {/* Hours */}
                  <div className="flex flex-col items-center">
                    <div className="min-w-[56px] sm:min-w-[64px] h-14 sm:h-16 bg-neutral-950/60 rounded-2xl border border-white/10 flex items-center justify-center shadow-inner relative overflow-hidden">
                      <div className="absolute top-0 left-0 w-full h-[1px] bg-white/15" />
                      <span className="font-serif text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                        {String(timeLeft.hours).padStart(2, '0')}
                      </span>
                    </div>
                    <span className="text-[10px] uppercase font-bold tracking-wider text-rose-300 mt-1.5">Hours</span>
                  </div>

                  <span className="text-xl sm:text-2xl font-serif text-neutral-500 animate-pulse pb-5">:</span>

                  {/* Minutes */}
                  <div className="flex flex-col items-center">
                    <div className="min-w-[56px] sm:min-w-[64px] h-14 sm:h-16 bg-neutral-950/60 rounded-2xl border border-white/10 flex items-center justify-center shadow-inner relative overflow-hidden">
                      <div className="absolute top-0 left-0 w-full h-[1px] bg-white/15" />
                      <span className="font-serif text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                        {String(timeLeft.minutes).padStart(2, '0')}
                      </span>
                    </div>
                    <span className="text-[10px] uppercase font-bold tracking-wider text-rose-300 mt-1.5">Mins</span>
                  </div>

                  <span className="text-xl sm:text-2xl font-serif text-neutral-500 animate-pulse pb-5">:</span>

                  {/* Seconds */}
                  <div className="flex flex-col items-center">
                    <div className="min-w-[56px] sm:min-w-[64px] h-14 sm:h-16 bg-neutral-950/60 rounded-2xl border border-rose-500/25 flex items-center justify-center shadow-inner relative overflow-hidden bg-rose-950/20">
                      <div className="absolute top-0 left-0 w-full h-[1px] bg-rose-400/20" />
                      <span className="font-serif text-2xl sm:text-3xl font-extrabold text-rose-400 tracking-tight">
                        {String(timeLeft.seconds).padStart(2, '0')}
                      </span>
                    </div>
                    <span className="text-[10px] uppercase font-bold tracking-wider text-rose-400 mt-1.5">Secs</span>
                  </div>
                </div>

                <div className="flex items-center gap-1 text-[11px] text-neutral-400 italic">
                  <Heart className="w-3 h-3 text-rose-500 fill-rose-500 animate-pulse" />
                  <span>ticking closer to your next dream encounter</span>
                </div>
              </div>

              {/* Right Column: Visual Matching Alexandria Spot Card */}
              <div className="lg:col-span-3">
                {matchedSpot ? (
                  <motion.div 
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="p-3.5 bg-rose-500/5 rounded-2xl border border-rose-500/15 text-xs space-y-2 hover:bg-rose-500/10 transition-colors"
                  >
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] uppercase font-extrabold tracking-wider text-rose-300">Alexandria Spot Match</span>
                      <span className="text-base">{matchedSpot.emoji}</span>
                    </div>
                    <div>
                      <h4 className="font-serif font-bold text-white leading-snug">{matchedSpot.name}</h4>
                      <p className="text-[10px] text-neutral-400 font-sans mt-0.5">{matchedSpot.area}</p>
                    </div>
                    <p className="text-[11px] text-rose-200 leading-relaxed font-serif italic line-clamp-2">
                      💡 "{matchedSpot.romanticTip}"
                    </p>
                    <a
                      href={matchedSpot.mapsUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="w-full py-1.5 rounded-lg bg-white/5 hover:bg-rose-500/20 text-rose-300 hover:text-white border border-rose-500/10 hover:border-rose-500/30 font-semibold text-[10px] transition-all inline-flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Navigation className="w-3 h-3" />
                      Open Map Guide
                    </a>
                  </motion.div>
                ) : (
                  <div className="p-3.5 bg-white/5 rounded-2xl border border-white/10 text-xs text-center text-neutral-400 italic space-y-1">
                    <p>No verified Alexandrian spot matches this location name.</p>
                    <p className="text-[10px] text-neutral-500">Add a favorite spot to unlock special maps & tips!</p>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        ) : (
          /* NO SCHEDULED DATES: PRE-SEEDED ALEXANDRIA SPOTS INTERACTIVE GUIDE */
          <motion.div
            key="no-countdown"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.4 }}
            className="bg-gradient-to-br from-neutral-900/90 to-neutral-950/80 rounded-3xl p-6 border border-white/10 shadow-xl space-y-5"
          >
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 border-b border-white/5 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 bg-rose-500/10 rounded-xl border border-rose-500/20 text-rose-400">
                  <Compass className="w-5 h-5 animate-spin-slow" />
                </div>
                <div>
                  <h3 className="font-serif text-lg font-bold text-white">No Date Currently Scheduled</h3>
                  <p className="text-xs text-neutral-400">Explore Alexandria's most romantic meeting spots to schedule our next memory!</p>
                </div>
              </div>
              <span className="text-[10px] uppercase font-bold tracking-widest bg-white/5 border border-white/10 px-2.5 py-1 rounded-lg text-neutral-400 self-start sm:self-auto">
                Alexandria Guide
              </span>
            </div>

            {/* Horizontal scroll of famous romantic Alexandria meeting spots */}
            <div className="relative pt-1">
              <HorizontalScrollWrapper scrollAmount={280} scrollContainerClassName="gap-4 pb-3 pt-1">
                {ALEXANDRIA_SPOTS.map((spot, idx) => (
                  <motion.div
                    key={`spot-${spot.id}-${idx}`}
                    whileHover={{ y: -3 }}
                    className="min-w-[260px] sm:min-w-[290px] max-w-[300px] bg-white/5 rounded-2xl border border-white/10 p-4.5 flex flex-col justify-between space-y-3 shrink-0 hover:bg-white/10 hover:border-rose-500/20 transition-all shadow-md"
                  >
                    <div className="space-y-2">
                      <div className="flex justify-between items-start gap-1">
                        <div>
                          <span className="text-xs uppercase font-extrabold tracking-wider text-rose-400">{spot.vibe}</span>
                          <h4 className="font-serif text-sm font-bold text-white leading-snug mt-0.5">{spot.name}</h4>
                          <p className="text-[10px] text-neutral-400">{spot.arabicName} • {spot.area}</p>
                        </div>
                        <span className="text-2xl p-1 bg-white/5 rounded-xl border border-white/15 shadow-sm shrink-0">{spot.emoji}</span>
                      </div>

                      <p className="text-xs text-neutral-300 leading-relaxed font-sans line-clamp-3">
                        {spot.description}
                      </p>

                      <div className="p-2.5 bg-rose-950/30 rounded-xl border border-rose-500/10 text-[11px] text-rose-200 leading-normal italic">
                        <strong>Romantic Tip:</strong> {spot.romanticTip}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-1 border-t border-white/5">
                      <a
                        href={spot.mapsUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="py-2 px-2 rounded-xl bg-white/5 hover:bg-rose-500/10 text-neutral-300 hover:text-white border border-white/10 hover:border-rose-500/30 text-[10px] font-bold transition-all inline-flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <Navigation className="w-3.5 h-3.5 text-neutral-400" />
                        Map View
                      </a>
                      <button
                        type="button"
                        onClick={() => onQuickPlan(spot)}
                        className="py-2 px-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-bold border border-rose-500/20 transition-all inline-flex items-center justify-center gap-1 cursor-pointer shadow-sm"
                      >
                        <Calendar className="w-3.5 h-3.5" />
                        Schedule 📅
                      </button>
                    </div>
                  </motion.div>
                ))}
              </HorizontalScrollWrapper>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
