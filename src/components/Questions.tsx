import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Sparkles, Heart, HelpCircle, Send, Plus, Trash2, 
  Search, Lock, Unlock, Eye, EyeOff, MessageSquare, 
  Smile, Calendar, MapPin, CheckCircle2, AlertCircle, X,
  Compass, Gift, RefreshCw
} from 'lucide-react';
import { CoupleQuestion, CoupleQuestionAnswer } from '../types';
import { CupidGame } from './CupidGame';
import { HorizontalScrollWrapper } from './HorizontalScrollWrapper';

interface QuestionsProps {
  questions: CoupleQuestion[];
  onSaveQuestion: (question: CoupleQuestion) => Promise<void>;
  onDeleteQuestion: (id: string) => Promise<void>;
  currentUser: string;
}

const CATEGORY_COLORS = {
  romance: { bg: 'bg-rose-500/10', text: 'text-rose-400', border: 'border-rose-500/20', icon: '🌹' },
  playful: { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/20', icon: '😆' },
  future: { bg: 'bg-indigo-500/10', text: 'text-indigo-400', border: 'border-indigo-500/20', icon: '🌌' },
  memories: { bg: 'bg-teal-500/10', text: 'text-teal-400', border: 'border-teal-500/20', icon: '📸' },
  custom: { bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/20', icon: '✏️' }
};

const REACTION_EMOJIS = ['❤️', '😍', '😂', '🔥', '😮', '🎉'];

export function Questions({ questions, onSaveQuestion, onDeleteQuestion, currentUser }: QuestionsProps) {
  const partnerName = 'Partner';
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showGame, setShowGame] = useState(false);
  
  // Custom Question Form State
  const [isAddingQuestion, setIsAddingQuestion] = useState(false);
  const [newQuestionText, setNewQuestionText] = useState('');
  const [newQuestionCategory, setNewQuestionCategory] = useState<CoupleQuestion['category']>('romance');
  
  // Inline answering state
  const [answeringQuestionId, setAnsweringQuestionId] = useState<string | null>(null);
  const [answerTexts, setAnswerTexts] = useState<Record<string, string>>({});
  
  // Blind reveal override states (allows revealing answers before both reply, if desired)
  const [revealedIds, setRevealedIds] = useState<Record<string, boolean>>({});

  // Error/Success local states
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Play a local bubble/sparkle sound for interactions
  const playSfx = () => {
    try {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15); // A5
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.2);
    } catch {}
  };

  const handleCreateQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newQuestionText.trim()) return;

    const newQuestion: CoupleQuestion = {
      id: 'q-custom-' + Date.now(),
      text: newQuestionText.trim(),
      category: newQuestionCategory,
      createdAt: new Date().toISOString(),
      createdBy: currentUser,
      answers: []
    };

    try {
      await onSaveQuestion(newQuestion);
      setNewQuestionText('');
      setIsAddingQuestion(false);
      setFeedbackMsg({ type: 'success', text: 'Beautiful custom question added! ✨' });
      playSfx();
      setTimeout(() => setFeedbackMsg(null), 3500);
    } catch {
      setFeedbackMsg({ type: 'error', text: 'Failed to save question. Please try again.' });
      setTimeout(() => setFeedbackMsg(null), 4000);
    }
  };

  const handleAddAnswer = async (question: CoupleQuestion) => {
    const text = answerTexts[question.id];
    if (!text || !text.trim()) return;

    const newAnswer: CoupleQuestionAnswer = {
      username: currentUser.toLowerCase().trim(),
      answerText: text.trim(),
      timestamp: new Date().toISOString()
    };

    // Filter out existing answer by this user (if any) and append new
    const cleanAnswers = question.answers.filter(
      ans => ans.username.toLowerCase().trim() !== currentUser.toLowerCase().trim()
    );

    const updatedQuestion: CoupleQuestion = {
      ...question,
      answers: [...cleanAnswers, newAnswer]
    };

    try {
      await onSaveQuestion(updatedQuestion);
      setAnswerTexts(prev => ({ ...prev, [question.id]: '' }));
      setAnsweringQuestionId(null);
      playSfx();
      setFeedbackMsg({ type: 'success', text: 'Your heart-to-heart thoughts are saved! 💞' });
      setTimeout(() => setFeedbackMsg(null), 3000);
    } catch {
      setFeedbackMsg({ type: 'error', text: 'Failed to submit answer. Please try again.' });
      setTimeout(() => setFeedbackMsg(null), 4000);
    }
  };

  const handleToggleReaction = async (question: CoupleQuestion, answerIndex: number, emoji: string) => {
    const answer = question.answers[answerIndex];
    const isSameReaction = answer.reaction === emoji;
    
    const updatedAnswers = [...question.answers];
    updatedAnswers[answerIndex] = {
      ...answer,
      reaction: isSameReaction ? undefined : emoji
    };

    const updatedQuestion: CoupleQuestion = {
      ...question,
      answers: updatedAnswers
    };

    try {
      await onSaveQuestion(updatedQuestion);
      playSfx();
    } catch {}
  };

  // Spark a random unanswered question
  const handleSparkQuestion = () => {
    const unanswered = questions.filter(q => {
      const userHasAnswered = q.answers.some(
        ans => ans.username.toLowerCase().trim() === currentUser.toLowerCase().trim()
      );
      return !userHasAnswered;
    });

    const pool = unanswered.length > 0 ? unanswered : questions;
    if (pool.length === 0) return;

    const randomIndex = Math.floor(Math.random() * pool.length);
    const selected = pool[randomIndex];

    // Scroll to the question card
    const el = document.getElementById(`question-card-${selected.id}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Temporary pulse styling effect
      el.classList.add('ring-2', 'ring-rose-500/60');
      setTimeout(() => el.classList.remove('ring-2', 'ring-rose-500/60'), 2500);
      playSfx();
    }
  };

  const filteredQuestions = questions.filter(q => {
    const matchesCategory = activeCategory === 'all' || q.category === activeCategory;
    const matchesSearch = q.text.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  // Calculate statistics
  const totalCount = questions.length;
  const bothAnsweredCount = questions.filter(q => {
    const users = new Set(q.answers.map(a => a.username.toLowerCase().trim()));
    return users.size >= 2;
  }).length;
  const pendingAnswersCount = totalCount - bothAnsweredCount;

  if (showGame) {
    return <CupidGame onBack={() => setShowGame(false)} />;
  }

  return (
    <div id="questions-dashboard-view" className="w-full max-w-5xl mx-auto px-4 py-6 font-sans">
      
      {/* Top Header Banner */}
      <div className="relative overflow-hidden bg-gradient-to-br from-neutral-900/90 to-rose-950/20 backdrop-blur-md rounded-2xl border border-white/10 p-6 md:p-8 mb-8 text-center shadow-xl">
        <div className="absolute top-0 left-0 w-32 h-32 bg-rose-500/10 rounded-full blur-3xl -translate-y-12 -translate-x-12" />
        <div className="absolute bottom-0 right-0 w-48 h-48 bg-rose-500/5 rounded-full blur-3xl translate-y-12 translate-x-12" />
        
        <div className="relative z-10 flex flex-col items-center">
          <div className="p-3 bg-rose-500/10 rounded-2xl border border-rose-500/20 mb-4 inline-flex">
            <HelpCircle className="w-8 h-8 text-rose-400" />
          </div>
          <h1 className="font-serif text-3xl md:text-4xl font-bold text-white tracking-tight mb-2">
            Couple's Questions
          </h1>
          <p className="text-sm md:text-base text-neutral-300 max-w-xl mx-auto">
            Deepen your bond, share secrets, and explore memories together. Answers stay blurred until both of you reply! 🔒
          </p>

          {/* Quick Info Badges */}
          <div className="flex flex-wrap gap-3 items-center justify-center mt-6">
            <span className="px-3.5 py-1.5 rounded-full bg-neutral-900/60 border border-white/10 text-xs font-semibold text-neutral-300 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-rose-500 fill-rose-500/20" />
              {bothAnsweredCount} Completed
            </span>
            <span className="px-3.5 py-1.5 rounded-full bg-neutral-900/60 border border-white/10 text-xs font-semibold text-neutral-300 flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-amber-400" />
              {pendingAnswersCount} Open & Waiting
            </span>
            <button 
              onClick={() => setShowGame(true)}
              className="px-4 py-1.5 rounded-full bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-md shadow-amber-900/40 transition-all cursor-pointer active:scale-95"
            >
              <span className="animate-bounce">🏹</span>
              Play Cupid Game 🎮
            </button>
            <button 
              onClick={handleSparkQuestion}
              className="px-4 py-1.5 rounded-full bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-md shadow-rose-900/40 transition-all cursor-pointer active:scale-95"
            >
              <Sparkles className="w-3.5 h-3.5 animate-spin-slow" />
              Spark a Random Question ✨
            </button>
          </div>
        </div>
      </div>

      {/* Cupid's Destiny Unlocked Special Card */}
      {pendingAnswersCount === 0 && (
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="relative overflow-hidden bg-gradient-to-r from-purple-950/40 via-rose-950/45 to-pink-950/40 backdrop-blur-md rounded-2xl border border-rose-500/30 p-6 mb-8 text-center shadow-2xl"
        >
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <span className="text-8xl">🏹</span>
          </div>
          <h2 className="font-serif text-2xl md:text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-rose-300 via-pink-400 to-amber-300 tracking-tight mb-2">
            💝 Cupid's Destiny Unlocked! 💝
          </h2>
          <p className="text-sm md:text-base text-rose-100 max-w-2xl mx-auto mb-6 leading-relaxed">
            Congratulations! You and your partner have successfully answered every single heart-to-heart question. Your bond is deeper than ever! Now, protect your love from incoming doubts and the legendary Alexandria Sea Monster in this epic retro game!
          </p>
          <button
            onClick={() => setShowGame(true)}
            className="px-8 py-3.5 bg-gradient-to-r from-rose-500 via-pink-500 to-amber-500 hover:from-rose-600 hover:to-pink-600 hover:scale-105 active:scale-95 text-white font-extrabold text-sm rounded-full shadow-lg shadow-rose-950/50 flex items-center gap-2.5 mx-auto transition-all cursor-pointer animate-pulse"
          >
            <span>🎮</span> Play Cupid's Destiny Game 🏹
          </button>
        </motion.div>
      )}

      {/* Floating feedback alert */}
      <AnimatePresence>
        {feedbackMsg && (
          <motion.div 
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className={`fixed top-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-3 rounded-xl border shadow-lg backdrop-blur-md ${
              feedbackMsg.type === 'success' 
                ? 'bg-emerald-950/90 border-emerald-500/30 text-emerald-300' 
                : 'bg-rose-950/90 border-rose-500/30 text-rose-300'
            }`}
          >
            {feedbackMsg.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <AlertCircle className="w-4 h-4 text-rose-400" />}
            <span className="text-xs font-medium">{feedbackMsg.text}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Search and Category Filter Toolbar */}
      <div className="flex flex-col md:flex-row gap-4 justify-between items-stretch md:items-center mb-8 bg-neutral-950/40 p-4 rounded-xl border border-white/5 shadow-inner">
        {/* Category Pills */}
        <HorizontalScrollWrapper className="w-full md:w-auto" scrollContainerClassName="gap-1.5 py-0.5">
          {['all', 'romance', 'playful', 'future', 'memories', 'custom'].map((cat, idx) => (
            <button
              key={`q-filter-${cat}-${idx}`}
              onClick={() => setActiveCategory(cat)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold capitalize whitespace-nowrap transition-all cursor-pointer shrink-0 ${
                activeCategory === cat
                  ? 'bg-rose-600 text-white shadow-md shadow-rose-900/30'
                  : 'bg-neutral-900/80 hover:bg-neutral-800 text-neutral-400 hover:text-white border border-white/5'
              }`}
            >
              {cat === 'all' ? 'All Questions' : `${CATEGORY_COLORS[cat as CoupleQuestion['category']].icon} ${cat}`}
            </button>
          ))}
        </HorizontalScrollWrapper>

        {/* Search and Ask buttons */}
        <div className="flex gap-2 items-center">
          <div className="relative flex-1 md:w-56">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-neutral-500" />
            <input
              type="text"
              placeholder="Search questions..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-neutral-900 border border-white/10 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-neutral-500 focus:outline-none focus:ring-1 focus:ring-rose-500/40"
            />
          </div>

          <button
            onClick={() => setIsAddingQuestion(true)}
            className="px-3.5 py-2 rounded-xl bg-rose-600/15 hover:bg-rose-600/25 text-rose-400 hover:text-rose-300 text-xs font-semibold flex items-center gap-1 border border-rose-500/20 shadow-md transition-all cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Ask Question
          </button>
        </div>
      </div>

      {/* Adding Custom Question Dialog */}
      <AnimatePresence>
        {isAddingQuestion && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              className="w-full max-w-md bg-neutral-950 border border-white/15 rounded-2xl shadow-2xl overflow-hidden"
            >
              <div className="p-5 border-b border-white/10 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Plus className="w-5 h-5 text-rose-400" />
                  <h3 className="font-serif text-lg font-bold text-white">Ask custom question</h3>
                </div>
                <button 
                  onClick={() => setIsAddingQuestion(false)}
                  className="p-1 rounded-lg text-neutral-400 hover:text-white hover:bg-white/10 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleCreateQuestion} className="p-5 flex flex-col gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-1.5">
                    Category Vibe
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {['romance', 'playful', 'future', 'memories', 'custom'].map((cat, idx) => (
                      <button
                        key={`new-q-cat-${cat}-${idx}`}
                        type="button"
                        onClick={() => setNewQuestionCategory(cat as any)}
                        className={`py-2 rounded-xl text-xs font-semibold flex flex-col items-center justify-center gap-1 transition-all capitalize border ${
                          newQuestionCategory === cat
                            ? `${CATEGORY_COLORS[cat as CoupleQuestion['category']].bg} ${CATEGORY_COLORS[cat as CoupleQuestion['category']].border} border-rose-500 text-white`
                            : 'bg-neutral-900 border-white/5 text-neutral-400 hover:text-white'
                        }`}
                      >
                        <span className="text-lg">{CATEGORY_COLORS[cat as CoupleQuestion['category']].icon}</span>
                        <span>{cat}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-1.5">
                    Your Question Text
                  </label>
                  <textarea
                    rows={3}
                    placeholder="E.g., What is your favorite way to spend a rainy Sunday in Alexandria?"
                    value={newQuestionText}
                    onChange={(e) => setNewQuestionText(e.target.value)}
                    required
                    maxLength={500}
                    className="w-full bg-neutral-900 border border-white/10 rounded-xl p-3 text-sm text-white placeholder-neutral-500 focus:outline-none focus:ring-1 focus:ring-rose-500/40"
                  />
                </div>

                <div className="flex gap-2 justify-end mt-2">
                  <button
                    type="button"
                    onClick={() => setIsAddingQuestion(false)}
                    className="px-4 py-2 text-xs font-semibold text-neutral-400 hover:text-white transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 shadow-md shadow-rose-950/30 transition-colors"
                  >
                    <Send className="w-3.5 h-3.5" />
                    Publish Question
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Questions Grid/List */}
      <div className="flex flex-col gap-6">
        {filteredQuestions.length === 0 ? (
          <div className="text-center py-16 bg-neutral-950/20 rounded-2xl border border-white/5 border-dashed p-8">
            <MessageSquare className="w-12 h-12 text-neutral-600 mx-auto mb-3" />
            <p className="text-sm text-neutral-400">No questions found in this category.</p>
            <p className="text-xs text-neutral-500 mt-1">Try another category filter or ask your own question above!</p>
          </div>
        ) : (
          filteredQuestions.map((q, idx) => {
            const currentUserClean = currentUser.toLowerCase().trim();
            const currentUserAnswer = q.answers.find(ans => ans.username.toLowerCase().trim() === currentUserClean);
            const partnerAnswer = q.answers.find(ans => ans.username.toLowerCase().trim() !== currentUserClean);

            const bothReplied = q.answers.length >= 2;
            const hasCurrentUserReplied = !!currentUserAnswer;
            const hasPartnerReplied = !!partnerAnswer;

            // Is the answer list currently blinded (hidden)?
            // Hidden if: BOTH have not replied, AND it is not explicitly revealed by user's toggle state.
            const isBlinded = !bothReplied && !revealedIds[q.id];

            const catInfo = CATEGORY_COLORS[q.category];

            return (
              <motion.div
                key={`question-card-${q.id}-${idx}`}
                id={`question-card-${q.id}`}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="group relative bg-neutral-950/65 backdrop-blur-md border border-white/10 rounded-2xl p-5 md:p-6 shadow-lg hover:border-white/20 transition-all duration-300"
              >
                {/* Delete button for custom questions */}
                {q.id.startsWith('q-custom-') && q.createdBy === currentUser && (
                  <button
                    onClick={async () => {
                      if (confirm("Are you sure you want to delete this custom question?")) {
                        try {
                          await onDeleteQuestion(q.id);
                          playSfx();
                        } catch {}
                      }
                    }}
                    className="absolute top-4 right-4 p-1.5 rounded-lg text-neutral-500 hover:text-rose-400 hover:bg-rose-500/10 opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                    title="Delete Question"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}

                {/* Question Info / Tag */}
                <div className="flex items-center gap-2 mb-3">
                  <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 ${catInfo.bg} ${catInfo.text} ${catInfo.border} border`}>
                    <span>{catInfo.icon}</span>
                    <span>{q.category}</span>
                  </span>
                  
                  {/* Status Indicator */}
                  {bothReplied ? (
                    <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 rounded-lg flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3 text-emerald-400 fill-emerald-500/10" />
                      Shared & Revealed
                    </span>
                  ) : hasCurrentUserReplied ? (
                    <span className="text-[10px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-1 rounded-lg flex items-center gap-1">
                      <Lock className="w-3 h-3" />
                      Waiting for {partnerName}
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold text-rose-400 bg-rose-500/10 border border-rose-500/20 px-2 py-1 rounded-lg flex items-center gap-1">
                      <Lock className="w-3 h-3 animate-pulse" />
                      Unanswered
                    </span>
                  )}
                </div>

                {/* The Question Text */}
                <h3 className="font-serif text-lg md:text-xl font-semibold text-white leading-relaxed mb-4 pr-6">
                  {q.text}
                </h3>

                {/* Submitting/Answering Section */}
                {!hasCurrentUserReplied && (
                  <div className="mt-4 bg-neutral-900/60 p-4 rounded-xl border border-white/5">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-neutral-300">
                        Your Turn to Answer:
                      </span>
                      <span className="text-[10px] text-neutral-500 italic">
                        Answers are blurred until both reply 🔒
                      </span>
                    </div>

                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder={`Write your heart out, ${currentUser.substring(0, 1).toUpperCase() + currentUser.substring(1)}...`}
                        value={answerTexts[q.id] || ''}
                        onChange={(e) => setAnswerTexts(prev => ({ ...prev, [q.id]: e.target.value }))}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleAddAnswer(q);
                        }}
                        className="flex-grow bg-neutral-950 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-neutral-500 focus:outline-none focus:ring-1 focus:ring-rose-500/40"
                      />
                      <button
                        onClick={() => handleAddAnswer(q)}
                        disabled={!answerTexts[q.id]?.trim()}
                        className="px-4 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:bg-neutral-800 disabled:text-neutral-500 text-white flex items-center justify-center shadow-lg transition-all duration-150 active:scale-95 cursor-pointer"
                      >
                        <Send className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}

                {/* Shared answers display */}
                {(hasCurrentUserReplied || hasPartnerReplied) && (
                  <div className="mt-4 flex flex-col gap-4">
                    
                    {/* Blind controls */}
                    {!bothReplied && hasCurrentUserReplied && (
                      <div className="flex items-center justify-between text-xs border-b border-white/5 pb-2 mb-1">
                        <span className="text-neutral-400 italic">
                          Waiting for {partnerName}'s reply to reveal both answers.
                        </span>
                        <button
                          onClick={() => {
                            setRevealedIds(prev => ({ ...prev, [q.id]: !prev[q.id] }));
                            playSfx();
                          }}
                          className="text-rose-400 hover:text-rose-300 font-semibold flex items-center gap-1 cursor-pointer"
                        >
                          {revealedIds[q.id] ? (
                            <>
                              <EyeOff className="w-3.5 h-3.5" />
                              Re-blur Answer
                            </>
                          ) : (
                            <>
                              <Eye className="w-3.5 h-3.5" />
                              Reveal Anyway 🔓
                            </>
                          )}
                        </button>
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {/* Current User's Answer */}
                      {hasCurrentUserReplied && (
                        <div className="bg-neutral-900/45 p-4 rounded-xl border border-white/5 flex flex-col justify-between">
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs font-bold text-neutral-400 capitalize">
                                You ({currentUser})
                              </span>
                              <span className="text-[10px] text-neutral-500">
                                {new Date(currentUserAnswer!.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                              </span>
                            </div>
                            <p className="text-sm text-white leading-relaxed whitespace-pre-wrap">
                              {currentUserAnswer!.answerText}
                            </p>
                          </div>
                          
                          {/* Reactions block */}
                          <div className="mt-3 pt-2.5 border-t border-white/5 flex items-center gap-1.5 flex-wrap">
                            <span className="text-[10px] text-neutral-500 font-semibold uppercase tracking-wider mr-1">
                              Reaction:
                            </span>
                            {currentUserAnswer!.reaction && (
                              <span className="text-xs bg-rose-500/10 border border-rose-500/25 text-rose-300 px-2 py-0.5 rounded-full animate-heartbeat">
                                {currentUserAnswer!.reaction}
                              </span>
                            )}
                            
                            {/* Reaction selector if partner answered */}
                            {hasPartnerReplied && (
                              <div className="flex items-center gap-1">
                                {REACTION_EMOJIS.map((emoji, idx) => (
                                  <button
                                    key={`q-${q.id}-p1-react-${emoji}-${idx}`}
                                    onClick={() => handleToggleReaction(q, q.answers.indexOf(currentUserAnswer!), emoji)}
                                    className={`w-5.5 h-5.5 rounded-full hover:bg-white/10 flex items-center justify-center text-xs transition-transform hover:scale-125 cursor-pointer ${
                                      currentUserAnswer!.reaction === emoji ? 'bg-rose-500/20 border border-rose-500/40' : ''
                                    }`}
                                  >
                                    {emoji}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Partner's Answer */}
                      <div className="bg-neutral-900/45 p-4 rounded-xl border border-white/5 flex flex-col justify-between relative overflow-hidden">
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-bold text-neutral-400 capitalize">
                              {partnerName}
                            </span>
                            {hasPartnerReplied && !isBlinded && (
                              <span className="text-[10px] text-neutral-500">
                                {new Date(partnerAnswer!.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                              </span>
                            )}
                          </div>

                          {/* Blinded state vs real text */}
                          {!hasPartnerReplied ? (
                            <p className="text-sm text-neutral-500 italic mt-2 animate-pulse flex items-center gap-2">
                              <Lock className="w-3.5 h-3.5" />
                              Waiting for {partnerName} to reply...
                            </p>
                          ) : isBlinded ? (
                            <div className="relative py-4 px-2 select-none">
                              {/* Blur overlay */}
                              <div className="filter blur-md text-sm text-white/10 text-center font-mono select-none pointer-events-none">
                                This answer is super romantic and will blow you away when you read it here!
                              </div>
                              <div className="absolute inset-0 bg-neutral-900/80 rounded-lg flex flex-col items-center justify-center p-3 text-center border border-dashed border-rose-500/20">
                                <Lock className="w-5 h-5 text-rose-400 animate-pulse mb-1" />
                                <p className="text-[10px] font-semibold text-rose-300">Answer Locked</p>
                                <p className="text-[9px] text-neutral-400 leading-tight">Write your answer or click 'Reveal' to unlock</p>
                              </div>
                            </div>
                          ) : (
                            <p className="text-sm text-rose-100 leading-relaxed whitespace-pre-wrap">
                              {partnerAnswer!.answerText}
                            </p>
                          )}
                        </div>

                        {/* Partner reactions */}
                        {hasPartnerReplied && !isBlinded && (
                          <div className="mt-3 pt-2.5 border-t border-white/5 flex items-center gap-1.5 flex-wrap">
                            <span className="text-[10px] text-neutral-500 font-semibold uppercase tracking-wider mr-1">
                              Reaction:
                            </span>
                            {partnerAnswer!.reaction && (
                              <span className="text-xs bg-rose-500/10 border border-rose-500/25 text-rose-300 px-2 py-0.5 rounded-full animate-heartbeat">
                                {partnerAnswer!.reaction}
                              </span>
                            )}
                            
                            {/* Reaction selector for partner's answer */}
                            <div className="flex items-center gap-1">
                              {REACTION_EMOJIS.map((emoji, idx) => (
                                <button
                                  key={`q-${q.id}-p2-react-${emoji}-${idx}`}
                                  onClick={() => handleToggleReaction(q, q.answers.indexOf(partnerAnswer!), emoji)}
                                  className={`w-5.5 h-5.5 rounded-full hover:bg-white/10 flex items-center justify-center text-xs transition-transform hover:scale-125 cursor-pointer ${
                                    partnerAnswer!.reaction === emoji ? 'bg-rose-500/20 border border-rose-500/40' : ''
                                  }`}
                                >
                                  {emoji}
                                  </button>
                                ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                  </div>
                )}
              </motion.div>
            );
          })
        )}
      </div>

    </div>
  );
}

export default Questions;
