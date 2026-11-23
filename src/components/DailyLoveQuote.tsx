import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Heart, Quote, Sparkles, Copy, Check } from 'lucide-react';
import { loveQuotes } from '../data/loveQuotes';
import { getEgyptCalendarComponents } from '../utils';

export const DailyLoveQuote: React.FC = () => {
  const [copied, setCopied] = useState(false);
  const [quoteIndex, setQuoteIndex] = useState(0);
  const [currentDateString, setCurrentDateString] = useState('');

  // Calculate the deterministic index for the current date in Egypt timezone
  const updateDailyQuote = () => {
    const now = new Date();
    const { year, month, day } = getEgyptCalendarComponents(now);
    
    // Create a stable daily seed based on the Egypt date
    const seed = year * 367 + month * 31 + day;
    const index = Math.abs(seed) % loveQuotes.length;
    
    setQuoteIndex(index);
    
    // Format a beautiful date label in Egypt style
    try {
      const dateLabel = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Africa/Cairo',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      }).format(now);
      setCurrentDateString(dateLabel);
    } catch {
      setCurrentDateString(now.toLocaleDateString());
    }
  };

  useEffect(() => {
    updateDailyQuote();

    // Check periodically (every 10 seconds) to see if the date has rolled over in Egypt timezone
    const timer = setInterval(() => {
      updateDailyQuote();
    }, 10000);

    return () => clearInterval(timer);
  }, []);

  const activeQuote = loveQuotes[quoteIndex] || loveQuotes[0];

  const handleCopy = () => {
    navigator.clipboard.writeText(`"${activeQuote.quote}" — ${activeQuote.author}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
      className="bg-gradient-to-br from-rose-950/20 via-purple-950/25 to-neutral-900/40 border border-rose-500/10 rounded-3xl p-6 md:p-8 relative overflow-hidden shadow-lg hover:border-rose-500/20 transition-all group"
    >
      {/* Decorative ambient background light */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-rose-500/5 rounded-full blur-2xl pointer-events-none -mr-8 -mt-8" />
      <div className="absolute bottom-0 left-0 w-32 h-32 bg-purple-500/5 rounded-full blur-2xl pointer-events-none -ml-8 -mb-8" />

      <div className="relative z-10 flex flex-col justify-between h-full gap-6">
        
        {/* Header */}
        <div className="flex justify-between items-center border-b border-white/5 pb-4">
          <div className="flex items-center gap-2">
            <span className="p-1.5 bg-rose-500/10 rounded-lg text-rose-400">
              <Sparkles className="w-4 h-4 animate-pulse" />
            </span>
            <span className="text-xs uppercase font-bold tracking-wider text-rose-300 font-sans">
              Daily Love Quote
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[10px] text-neutral-400 font-sans tracking-wide">
              🇪🇬 Egypt Local Date: {currentDateString}
            </span>
            <button
              onClick={handleCopy}
              className="text-neutral-400 hover:text-white p-1.5 hover:bg-white/5 rounded-lg transition-colors"
              title="Copy quote"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {/* Quote Content */}
        <div className="py-2 flex flex-col gap-4 relative">
          <Quote className="absolute -top-3 -left-4 w-12 h-12 text-rose-500/5 pointer-events-none transform -scale-x-100" />
          <AnimatePresence mode="wait">
            <motion.div
              key={`quote-slide-${quoteIndex}`}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              transition={{ duration: 0.4 }}
              className="space-y-4"
            >
              <p className="font-serif italic text-lg sm:text-xl md:text-2xl text-rose-100 leading-relaxed tracking-wide">
                "{activeQuote.quote}"
              </p>
              <div className="flex justify-end items-center gap-2">
                <span className="w-6 h-px bg-rose-500/30" />
                <span className="font-sans text-xs sm:text-sm font-medium text-rose-300/90 tracking-wide">
                  {activeQuote.author}
                </span>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Footer info banner */}
        <div className="border-t border-white/5 pt-3 flex justify-between items-center text-[10px] text-neutral-400 font-sans">
          <span className="flex items-center gap-1">
            <Heart className="w-3 h-3 text-rose-500 fill-rose-500 animate-pulse" /> 
            Sent with infinite love
          </span>
         {/* <span className="font-light italic text-neutral-500">
            Automatically refreshes at 12:00 AM (Egypt time)
          </span>*/}
        </div>

      </div>
    </motion.div>
  );
};

export default DailyLoveQuote;
