import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Heart, Calendar, Clock, Plus, Trash2, Edit3, Save, 
  Upload, ChevronLeft, Image as ImageIcon, Sparkles, 
  Gift, CheckCircle2, AlertCircle, Lock, Unlock, Eye, EyeOff,
  SlidersHorizontal, Archive, ArchiveRestore, Search, X,
  LayoutGrid, List, Layers, ShieldAlert
} from 'lucide-react';
import { Milestone, MilestoneCategory, MilestoneQuotas } from '../types';
import { HorizontalScrollWrapper } from './HorizontalScrollWrapper';

import { parseEventDateInEgypt, formatMilestoneDateInEgypt, getDaysUntilMilestoneInEgypt } from '../utils';

const getMilestonePassword = (milestone: Milestone): string => {
  const env = (import.meta as any).env;
  // Convert custom ID to uppercase env-friendly format
  const cleanId = milestone.id.toUpperCase().replace(/[^A-Z0-9]/g, '_');
  const envVarName = `VITE_PASSWORD_${cleanId}`;
  if (env[envVarName]) {
    return env[envVarName];
  }

  if (milestone.password !== undefined) {
    return milestone.password;
  }
  return env.VITE_MILESTONES_PASSWORD || '';
};

const parseEventDate = (dateStr: string): Date => {
  return parseEventDateInEgypt(dateStr);
};

const formatForDatetimeLocal = (dateStr: string): string => {
  if (!dateStr) return '';
  try {
    const d = parseEventDateInEgypt(dateStr);
    
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Africa/Cairo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
    
    const parts = formatter.formatToParts(d);
    const getPart = (type: string): string => {
      const p = parts.find(x => x.type === type);
      if (!p) return '00';
      // Strip any non-digit chars (e.g. invisible unicode marks)
      return p.value.replace(/\D/g, '');
    };
    
    const year = getPart('year');
    const month = getPart('month').padStart(2, '0');
    const day = getPart('day').padStart(2, '0');
    let hour = getPart('hour');
    if (hour === '24') hour = '00';
    hour = hour.padStart(2, '0');
    const minute = getPart('minute').padStart(2, '0');
    
    return `${year}-${month}-${day}T${hour}:${minute}`;
  } catch (e) {
    try {
      const d = parseEventDateInEgypt(dateStr);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const hours = String(d.getHours()).padStart(2, '0');
      const minutes = String(d.getMinutes()).padStart(2, '0');
      return `${year}-${month}-${day}T${hours}:${minutes}`;
    } catch {
      return '';
    }
  }
};

const formatMilestoneDate = (dateStr: string): string => {
  return formatMilestoneDateInEgypt(dateStr);
};

interface MilestoneCardProps {
  milestones: Milestone[];
  onUpdateMilestone: (updated: Milestone) => void;
  onAddMilestone: (newMilestone: Milestone) => void;
  onDeleteMilestone: (id: string) => void;
  selectedCategoryId: string | null;
  onSelectCategory: (categoryOrId: string | null) => void;
  milestoneQuotas?: MilestoneQuotas;
}

export const MilestoneCard: React.FC<MilestoneCardProps> = ({
  milestones = [],
  onUpdateMilestone,
  onAddMilestone,
  onDeleteMilestone,
  selectedCategoryId,
  onSelectCategory,
  milestoneQuotas
}) => {
  const safeMilestones = Array.isArray(milestones) ? milestones : [];

  // Capacity count quotas tracking and enforcement
  const quotaStats = React.useMemo(() => {
    const active = safeMilestones.filter(m => !m.archived);
    const totalUsed = active.length;
    const annivUsed = active.filter(m => m.category === 'anniversary' || m.category === 'engagement').length;
    const bdayUsed = active.filter(m => m.category === 'birthday').length;
    const otherUsed = active.filter(m => !['anniversary', 'engagement', 'birthday'].includes(m.category)).length;

    const totalMax = milestoneQuotas?.maxTotalMilestones ?? -1;
    const annivMax = milestoneQuotas?.maxAnniversaries ?? -1;
    const bdayMax = milestoneQuotas?.maxBirthdays ?? -1;
    const otherMax = milestoneQuotas?.maxOtherMilestones ?? -1;

    const isTotalFull = totalMax !== -1 && totalUsed >= totalMax;
    const isAnnivFull = annivMax !== -1 && annivUsed >= annivMax;
    const isBdayFull = bdayMax !== -1 && bdayUsed >= bdayMax;
    const isOtherFull = otherMax !== -1 && otherUsed >= otherMax;

    return {
      totalUsed,
      totalMax,
      isTotalFull,
      annivUsed,
      annivMax,
      isAnnivFull,
      bdayUsed,
      bdayMax,
      isBdayFull,
      otherUsed,
      otherMax,
      isOtherFull,
      hasAnyQuotaConfigured: totalMax !== -1 || annivMax !== -1 || bdayMax !== -1 || otherMax !== -1
    };
  }, [safeMilestones, milestoneQuotas]);
  const [sortBy, setSortBy] = useState<'default' | 'date' | 'category'>('default');
  const [filterCategory, setFilterCategory] = useState<'all' | 'archived' | MilestoneCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [mobileLayout, setMobileLayout] = useState<'grid' | 'list'>('grid');

  const filteredAndSortedMilestones = React.useMemo(() => {
    let list = [...safeMilestones];

    // 1. Filter by category and archive state
    if (filterCategory === 'archived') {
      list = list.filter((m) => m.archived);
    } else {
      list = list.filter((m) => !m.archived);
      if (filterCategory !== 'all') {
        list = list.filter((m) => m.category === filterCategory);
      }
    }

    // 1.5 Filter by search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((m) => 
        (m.title && m.title.toLowerCase().includes(q)) || 
        (m.description && m.description.toLowerCase().includes(q))
      );
    }

    // 2. Apply sorting
    if (sortBy === 'date') {
      return list.sort((a, b) => {
        const daysA = getDaysUntilMilestoneInEgypt(a.date);
        const daysB = getDaysUntilMilestoneInEgypt(b.date);
        return daysA - daysB; // nearest coming date first
      });
    }
    if (sortBy === 'category') {
      return list.sort((a, b) => {
        const catA = a.category || 'other';
        const catB = b.category || 'other';
        const comp = catA.localeCompare(catB);
        if (comp !== 0) return comp;
        // Secondary sort: nearest coming date first
        const daysA = getDaysUntilMilestoneInEgypt(a.date);
        const daysB = getDaysUntilMilestoneInEgypt(b.date);
        return daysA - daysB;
      });
    }
    return list;
  }, [milestones, sortBy, filterCategory, searchQuery]);

  const [isEditingMessage, setIsEditingMessage] = useState(false);
  const [editedMessage, setEditedMessage] = useState('');
  const [editedTitle, setEditedTitle] = useState('');
  const [editedDate, setEditedDate] = useState('');
  const [editedDesc, setEditedDesc] = useState('');
  const [editedPassword, setEditedPassword] = useState('');
  const [editedCategory, setEditedCategory] = useState<MilestoneCategory>('other');
  const [saveEditError, setSaveEditError] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isConfirmingPhotoDelete, setIsConfirmingPhotoDelete] = useState(false);
  
  // Password unlocking states
  const [unlockedMilestones, setUnlockedMilestones] = useState<Record<string, boolean>>({});
  const [enteredPassword, setEnteredPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  
  const [newLoveNote, setNewLoveNote] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [activePhotoIndex, setActivePhotoIndex] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Create milestone state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] = useState('custom');
  const [newDate, setNewDate] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newSweetMessage, setNewSweetMessage] = useState('');
  const [newThemeColor, setNewThemeColor] = useState('from-rose-500 to-pink-600');
  const [newPassword, setNewPassword] = useState('');
  const [createFormError, setCreateFormError] = useState('');

  const handleCreateMilestone = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) {
      setCreateFormError("Please enter a title, sweetheart! 💕");
      return;
    }
    if (!newDate) {
      setCreateFormError("Please select a date! 📅");
      return;
    }
    if (!newDescription.trim()) {
      setCreateFormError("Please write a short description! ✍️");
      return;
    }
    if (!newSweetMessage.trim()) {
      setCreateFormError("Please add a sweet message for your partner! 💌");
      return;
    }

    // Quota capacity validation
    if (quotaStats.isTotalFull) {
      setCreateFormError(`Total milestone capacity quota reached (${quotaStats.totalMax} max). Archive an existing milestone to free up space or adjust quota in Admin Settings.`);
      return;
    }

    if (newCategory === 'anniversary' || newCategory === 'engagement') {
      if (quotaStats.isAnnivFull) {
        setCreateFormError(`Anniversaries & Engagements capacity quota reached (${quotaStats.annivMax} max). Archive an old milestone to free up space or adjust quota in Admin Settings.`);
        return;
      }
    } else if (newCategory === 'birthday') {
      if (quotaStats.isBdayFull) {
        setCreateFormError(`Birthdays capacity quota reached (${quotaStats.bdayMax} max). Archive an old birthday card to free up space or adjust quota in Admin Settings.`);
        return;
      }
    } else {
      if (quotaStats.isOtherFull) {
        setCreateFormError(`Other special events capacity quota reached (${quotaStats.otherMax} max). Archive an existing milestone to free up space or adjust quota in Admin Settings.`);
        return;
      }
    }

    const generatedId = `milestone-${Date.now()}`;
    const newMilestone: Milestone = {
      id: generatedId,
      title: newTitle.trim(),
      category: newCategory as MilestoneCategory,
      date: newDate,
      description: newDescription.trim(),
      sweetMessage: newSweetMessage.trim(),
      photos: [],
      loveNotes: [],
      themeColor: newThemeColor,
      password: newPassword.trim()
    };

    onAddMilestone(newMilestone);
    
    // Reset form states
    setNewTitle('');
    setNewCategory('custom');
    setNewDate('');
    setNewDescription('');
    setNewSweetMessage('');
    setNewThemeColor('from-rose-500 to-pink-600');
    setNewPassword('');
    setCreateFormError('');
    setShowCreateForm(false);
  };

  // Find active milestone by ID first, then fallback to category
  const activeMilestone = safeMilestones.find(m => m.id === selectedCategoryId) || safeMilestones.find(m => m.category === selectedCategoryId);

  // Keep track of previously active milestone ID to detect card switches
  const prevMilestoneIdRef = useRef<string | null>(null);

  // Initialize fields when milestone changes
  useEffect(() => {
    if (activeMilestone) {
      const hasSwitchedCard = prevMilestoneIdRef.current !== activeMilestone.id;
      prevMilestoneIdRef.current = activeMilestone.id;

      if (hasSwitchedCard || !isEditingMessage) {
        setEditedMessage(activeMilestone.sweetMessage);
        setEditedTitle(activeMilestone.title);
        setEditedDate(formatForDatetimeLocal(activeMilestone.date));
        setEditedDesc(activeMilestone.description);
        setEditedPassword(activeMilestone.password || '');
        setEditedCategory(activeMilestone.category);
        setIsEditingMessage(false);
        setEnteredPassword('');
        setPasswordError('');
        setActivePhotoIndex(null);
        setIsConfirmingPhotoDelete(false);
      }
    } else {
      prevMilestoneIdRef.current = null;
    }
  }, [activeMilestone]);

  useEffect(() => {
    setIsConfirmingPhotoDelete(false);
  }, [activePhotoIndex]);

  // Keyboard navigation for the lightbox
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (activePhotoIndex === null || !activeMilestone || !activeMilestone.photos) return;
      if (e.key === 'Escape') {
        setActivePhotoIndex(null);
      } else if (e.key === 'ArrowRight' || e.key === 'Right') {
        setActivePhotoIndex((prev) => 
          prev !== null && activeMilestone.photos.length > 0
            ? (prev + 1) % activeMilestone.photos.length 
            : prev
        );
      } else if (e.key === 'ArrowLeft' || e.key === 'Left') {
        setActivePhotoIndex((prev) => 
          prev !== null && activeMilestone.photos.length > 0
            ? (prev - 1 + activeMilestone.photos.length) % activeMilestone.photos.length 
            : prev
        );
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activePhotoIndex, activeMilestone]);

  // Calculate live days since or until date
  const [timeDiffText, setTimeDiffText] = useState({ days: 0, hours: 0, mins: 0, secs: 0, prefix: '', suffix: '' });
  const [previewDiff, setPreviewDiff] = useState<{ days: number, hours: number, mins: number, secs: number, prefix: string, suffix: string } | null>(null);
  const [editPreviewDiff, setEditPreviewDiff] = useState<{ days: number, hours: number, mins: number, secs: number, prefix: string, suffix: string } | null>(null);

  useEffect(() => {
    if (!activeMilestone) return;

    const calculateTime = () => {
      const eventDate = parseEventDate(activeMilestone.date);
      const now = new Date();
      const diffMs = now.getTime() - eventDate.getTime();
      const absoluteDiff = Math.abs(diffMs);

      const days = Math.floor(absoluteDiff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((absoluteDiff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const mins = Math.floor((absoluteDiff % (1000 * 60 * 60)) / (1000 * 60));
      const secs = Math.floor((absoluteDiff % (1000 * 60)) / 1000);

      const isPast = diffMs >= 0;

      setTimeDiffText({
        days,
        hours,
        mins,
        secs,
        prefix: isPast ? '' : 'In ',
        suffix: isPast ? 'Ago' : 'To Go'
      });
    };

    calculateTime();
    const interval = setInterval(calculateTime, 1000);
    return () => clearInterval(interval);
  }, [activeMilestone, activeMilestone?.date]);

  // Live Preview countdown for Create form
  useEffect(() => {
    if (!newDate) {
      setPreviewDiff(null);
      return;
    }
    const updatePreview = () => {
      const eventDate = parseEventDate(newDate);
      const now = new Date();
      const diffMs = now.getTime() - eventDate.getTime();
      const absoluteDiff = Math.abs(diffMs);
      
      const days = Math.floor(absoluteDiff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((absoluteDiff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const mins = Math.floor((absoluteDiff % (1000 * 60 * 60)) / (1000 * 60));
      const secs = Math.floor((absoluteDiff % (1000 * 60)) / 1000);
      
      const isPast = diffMs >= 0;
      setPreviewDiff({
        days,
        hours,
        mins,
        secs,
        prefix: isPast ? '' : 'In ',
        suffix: isPast ? 'Ago' : 'To Go'
      });
    };
    updatePreview();
    const interval = setInterval(updatePreview, 1000);
    return () => clearInterval(interval);
  }, [newDate]);

  // Live Preview countdown for Edit form
  useEffect(() => {
    if (!editedDate) {
      setEditPreviewDiff(null);
      return;
    }
    const updatePreview = () => {
      const eventDate = parseEventDate(editedDate);
      const now = new Date();
      const diffMs = now.getTime() - eventDate.getTime();
      const absoluteDiff = Math.abs(diffMs);
      
      const days = Math.floor(absoluteDiff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((absoluteDiff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const mins = Math.floor((absoluteDiff % (1000 * 60 * 60)) / (1000 * 60));
      const secs = Math.floor((absoluteDiff % (1000 * 60)) / 1000);
      
      const isPast = diffMs >= 0;
      setEditPreviewDiff({
        days,
        hours,
        mins,
        secs,
        prefix: isPast ? '' : 'In ',
        suffix: isPast ? 'Ago' : 'To Go'
      });
    };
    updatePreview();
    const interval = setInterval(updatePreview, 1000);
    return () => clearInterval(interval);
  }, [editedDate]);

  if (showCreateForm) {
    return (
      <div className="w-full max-w-2xl mx-auto px-4 py-6">
        <button
          onClick={() => {
            setShowCreateForm(false);
            setCreateFormError('');
          }}
          className="inline-flex items-center gap-1.5 text-rose-400 hover:text-rose-300 font-sans font-medium text-sm mb-6 transition-colors group cursor-pointer"
        >
          <ChevronLeft className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" />
          Back to all milestones
        </button>

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-neutral-900 border border-white/10 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6 relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-rose-500/5 rounded-full blur-2xl -mr-10 -mt-10" />

          <div>
            <h2 className="font-serif text-2xl md:text-3xl text-white tracking-tight">
              Create a New Milestone Card 💖
            </h2>
            <p className="text-xs text-neutral-400 mt-1">
              Add another beautiful chapter to our relationship timeline and keep track of it forever.
            </p>
          </div>

          {createFormError && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-xl text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              <span>{createFormError}</span>
            </div>
          )}

          <form onSubmit={handleCreateMilestone} className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-neutral-300 mb-1.5">Milestone Title *</label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => {
                    setNewTitle(e.target.value);
                    setCreateFormError('');
                  }}
                  placeholder="e.g. Our First Trip Together 🎒"
                  className="w-full px-4 py-2.5 text-sm bg-neutral-950 border border-white/10 rounded-xl focus:outline-none focus:ring-1 focus:ring-rose-400 focus:border-rose-400 text-white placeholder-neutral-500"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-neutral-300">Category *</label>
                  {/* Category Quota Badge */}
                  {(() => {
                    const isAnniv = newCategory === 'anniversary' || newCategory === 'engagement';
                    const isBday = newCategory === 'birthday';
                    const used = isAnniv ? quotaStats.annivUsed : isBday ? quotaStats.bdayUsed : quotaStats.otherUsed;
                    const max = isAnniv ? quotaStats.annivMax : isBday ? quotaStats.bdayMax : quotaStats.otherMax;
                    const isFull = isAnniv ? quotaStats.isAnnivFull : isBday ? quotaStats.isBdayFull : quotaStats.isOtherFull;
                    
                    return (
                      <span className={`text-[10px] font-mono px-2 py-0.5 rounded-md border flex items-center gap-1 ${
                        isFull 
                          ? 'bg-rose-500/20 text-rose-300 border-rose-500/40' 
                          : max !== -1 
                          ? 'bg-white/5 text-neutral-400 border-white/10' 
                          : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                      }`}>
                        {isFull && <ShieldAlert className="w-2.5 h-2.5 text-rose-400" />}
                        Quota: {used} / {max === -1 ? '∞' : max} {isFull ? '(Full)' : ''}
                      </span>
                    );
                  })()}
                </div>
                <select
                  value={newCategory}
                  onChange={(e) => {
                    setNewCategory(e.target.value);
                    setCreateFormError('');
                  }}
                  className="w-full px-4 py-2.5 text-sm bg-neutral-950 border border-white/10 rounded-xl focus:outline-none focus:ring-1 focus:ring-rose-400 focus:border-rose-400 text-white"
                >
                  <option value="custom">Custom Chapter ✨</option>
                  <option value="anniversary">Anniversary 💍</option>
                  <option value="engagement">Engagement 💍</option>
                  <option value="birthday">Birthday 🎂</option>
                  <option value="vacation">Vacation ✈️</option>
                  <option value="firsts">Relationship Firsts 🌟</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-neutral-300 mb-1.5 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-rose-400" />
                  Date &amp; Time *
                </label>
                <div className="relative">
                  <input
                    type="datetime-local"
                    value={newDate}
                    onChange={(e) => {
                      setNewDate(e.target.value);
                      setCreateFormError('');
                    }}
                    style={{ colorScheme: 'dark' }}
                    className="w-full px-4 py-2.5 pl-10 text-sm bg-neutral-950 border border-white/10 rounded-xl focus:outline-none focus:ring-1 focus:ring-rose-400 focus:border-rose-400 text-white font-sans transition-all hover:border-white/25"
                  />
                  <Clock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-rose-400/80 w-4 h-4 pointer-events-none" />
                </div>
                
                {/* Beautiful romantic quick presets for couples */}
                <div className="flex flex-wrap gap-1.5 mt-2">
                  <button
                    type="button"
                    onClick={() => {
                      const now = new Date();
                      setNewDate(formatForDatetimeLocal(now.toISOString()));
                      setCreateFormError('');
                    }}
                    className="px-2 py-1 bg-white/5 hover:bg-rose-500/10 border border-white/5 hover:border-rose-500/25 rounded-lg text-[10px] font-medium transition-all text-neutral-300 hover:text-rose-300 cursor-pointer"
                  >
                    ⏰ Right Now
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const oneYearAgo = new Date();
                      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
                      setNewDate(formatForDatetimeLocal(oneYearAgo.toISOString()));
                      setCreateFormError('');
                    }}
                    className="px-2 py-1 bg-white/5 hover:bg-rose-500/10 border border-white/5 hover:border-rose-500/25 rounded-lg text-[10px] font-medium transition-all text-neutral-300 hover:text-rose-300 cursor-pointer"
                  >
                    🎒 1 Year Ago
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const annDate = new Date(2026, 10, 2, 0, 0, 0, 0); // Nov 2, 2026
                      setNewDate(formatForDatetimeLocal(annDate.toISOString()));
                      setCreateFormError('');
                    }}
                    className="px-2 py-1 bg-white/5 hover:bg-rose-500/10 border border-white/5 hover:border-rose-500/25 rounded-lg text-[10px] font-medium transition-all text-neutral-300 hover:text-rose-300 cursor-pointer"
                  >
                    💍 Anniversary
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-300 mb-1.5">Secret Password (Optional)</label>
                <input
                  type="text"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Leave empty for public, or enter to lock"
                  className="w-full px-4 py-2.5 text-sm bg-neutral-950 border border-white/10 rounded-xl focus:outline-none focus:ring-1 focus:ring-rose-400 focus:border-rose-400 text-white placeholder-neutral-500"
                />
              </div>
            </div>

            {/* Live Countdown/Countup Preview */}
            {newDate && (
              <motion.div
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-3.5 bg-rose-500/5 rounded-2xl border border-rose-500/15 flex flex-col items-center justify-center text-center relative overflow-hidden"
              >
                <div className="absolute top-0 right-0 w-16 h-16 bg-rose-500/10 rounded-full blur-xl pointer-events-none" />
                <span className="text-[10px] uppercase tracking-wider text-rose-400 font-semibold mb-1.5 flex items-center gap-1">
                  <Clock className="w-3 h-3 animate-spin" style={{ animationDuration: '4s' }} /> Live Counter Preview
                </span>
                {previewDiff ? (
                  <div className="flex flex-wrap items-center justify-center gap-1.5 font-serif text-white text-sm sm:text-base">
                    <span className="text-rose-300 font-semibold">{previewDiff.days}d</span>
                    <span className="text-neutral-500">:</span>
                    <span className="text-rose-300 font-semibold">{previewDiff.hours}h</span>
                    <span className="text-neutral-500">:</span>
                    <span className="text-rose-300 font-semibold">{previewDiff.mins}m</span>
                    <span className="text-neutral-500">:</span>
                    <span className="text-rose-300 font-semibold">{previewDiff.secs}s</span>
                    <span className="text-xs text-neutral-400 font-sans italic ml-1.5">
                      {previewDiff.prefix}our special moment {previewDiff.suffix}
                    </span>
                  </div>
                ) : (
                  <span className="text-xs text-neutral-400">Loading precise counter...</span>
                )}
              </motion.div>
            )}

            <div>
              <label className="block text-xs font-semibold text-neutral-300 mb-1.5">Short Description *</label>
              <input
                type="text"
                value={newDescription}
                onChange={(e) => {
                  setNewDescription(e.target.value);
                  setCreateFormError('');
                }}
                placeholder="A tiny preview text of this card..."
                className="w-full px-4 py-2.5 text-sm bg-neutral-950 border border-white/10 rounded-xl focus:outline-none focus:ring-1 focus:ring-rose-400 focus:border-rose-400 text-white placeholder-neutral-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-300 mb-1.5">Sweet Message *</label>
              <textarea
                value={newSweetMessage}
                onChange={(e) => {
                  setNewSweetMessage(e.target.value);
                  setCreateFormError('');
                }}
                rows={4}
                placeholder="Write your beautiful deep message about this special moment..."
                className="w-full px-4 py-2.5 text-sm bg-neutral-950 border border-white/10 rounded-xl focus:outline-none focus:ring-1 focus:ring-rose-400 focus:border-rose-400 text-white placeholder-neutral-500 leading-relaxed resize-none"
              />
            </div>

            {/* Gradient Theme Color Picker */}
            <div>
              <label className="block text-xs font-semibold text-neutral-300 mb-2">Card Gradient Theme</label>
              <div className="flex flex-wrap gap-3">
                {[
                  {name: 'Rose Romance',gradient: 'from-rose-500 to-pink-600',},
                  {name: 'Warm Sunset',gradient: 'from-amber-400 to-orange-500',},
                  {name: 'Midnight Violet',gradient: 'from-indigo-500 to-purple-600',},
                  {name: 'Emerald Mint',gradient: 'from-teal-500 to-emerald-600',},
                  {name: 'Royal Crimson',gradient: 'from-red-600 to-rose-950',},
                  {name: 'Deep Sea',gradient: 'from-blue-600 to-cyan-700',},
                  {name: 'Blush Serenity',gradient: 'from-pink-300 to-rose-500',},
                  {name: 'Lavender Night',gradient: 'from-violet-500 to-fuchsia-600',},
                  {name: 'Cherry Blossom',gradient: 'from-pink-200 to-fuchsia-400',},
                  {name: 'Golden Hour',gradient: 'from-yellow-400 to-amber-600',},
                  {name: 'Love Potion',gradient: 'from-fuchsia-500 to-rose-600',},
                  {name: 'Cloudy Dream',gradient: 'from-sky-400 to-indigo-500',},
                  {name: 'Aurora Glow',gradient: 'from-emerald-400 via-cyan-500 to-indigo-600',},
                  {name: 'Sweet Heart',gradient: 'from-rose-400 to-pink-500',},
                  {name: 'Luxury Gold',gradient: 'from-yellow-500 to-amber-700',},
                  {name: 'Galaxy Love',gradient: 'from-purple-600 to-pink-600',},
                  {name: 'Tropical Breeze',gradient: 'from-emerald-300 to-teal-500',},
                  {name: 'Velvet Wine',gradient: 'from-rose-900 to-purple-900',},
                  {name: 'Ocean Horizon',gradient: 'from-blue-400 to-teal-600',},
                  {name: 'Peach Glow',gradient: 'from-orange-300 to-rose-400',},
                ].map((preset, idx) => (
                  <button
                    type="button"
                    key={`preset-gradient-${preset.gradient}-${idx}`}
                    onClick={() => setNewThemeColor(preset.gradient)}
                    className={`px-3 py-2 rounded-xl text-xs font-medium text-white bg-gradient-to-br ${preset.gradient} border-2 transition-all ${
                      newThemeColor === preset.gradient ? 'border-rose-400 scale-105 shadow-md shadow-rose-950/20' : 'border-transparent opacity-85 hover:opacity-100'
                    }`}
                  >
                    {preset.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Quota reached alert notice */}
            {(quotaStats.isTotalFull || (() => {
              const isAnniv = newCategory === 'anniversary' || newCategory === 'engagement';
              const isBday = newCategory === 'birthday';
              return isAnniv ? quotaStats.isAnnivFull : isBday ? quotaStats.isBdayFull : quotaStats.isOtherFull;
            })()) && (
              <div className="p-3.5 bg-rose-950/60 border border-rose-500/30 rounded-xl text-rose-300 text-xs flex items-start gap-2.5 shadow-lg">
                <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <span className="font-semibold block text-white">Capacity Quota Reached</span>
                  <p className="text-neutral-300 text-[11px] leading-relaxed">
                    {quotaStats.isTotalFull 
                      ? `Total milestone capacity of ${quotaStats.totalMax} has been reached for this workspace. Please archive or delete existing milestones to create a new one.`
                      : `You have reached the maximum allowed milestones for this category (${
                          (newCategory === 'anniversary' || newCategory === 'engagement') 
                            ? `${quotaStats.annivMax} Anniversaries` 
                            : newCategory === 'birthday' 
                            ? `${quotaStats.bdayMax} Birthdays` 
                            : `${quotaStats.otherMax} Other Events`
                        }). Please archive or delete an existing card, or adjust quota limits in Admin Settings.`
                    }
                  </p>
                </div>
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowCreateForm(false);
                  setCreateFormError('');
                }}
                className="flex-1 py-2.5 rounded-xl border border-white/10 text-neutral-300 hover:bg-white/5 transition-colors text-sm font-medium cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={quotaStats.isTotalFull || (newCategory === 'anniversary' || newCategory === 'engagement' ? quotaStats.isAnnivFull : newCategory === 'birthday' ? quotaStats.isBdayFull : quotaStats.isOtherFull)}
                className={`flex-1 py-2.5 rounded-xl transition-all text-sm font-semibold shadow-lg ${
                  quotaStats.isTotalFull || (newCategory === 'anniversary' || newCategory === 'engagement' ? quotaStats.isAnnivFull : newCategory === 'birthday' ? quotaStats.isBdayFull : quotaStats.isOtherFull)
                    ? 'bg-neutral-800 text-neutral-500 border border-white/5 cursor-not-allowed opacity-80'
                    : 'bg-gradient-to-r from-rose-500 to-pink-600 hover:from-rose-600 hover:to-pink-700 text-white shadow-rose-500/20 cursor-pointer'
                }`}
              >
                {quotaStats.isTotalFull || (newCategory === 'anniversary' || newCategory === 'engagement' ? quotaStats.isAnnivFull : newCategory === 'birthday' ? quotaStats.isBdayFull : quotaStats.isOtherFull)
                  ? 'Capacity Quota Full 🔒'
                  : 'Create Card 💖'
                }
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    );
  }

  if (!selectedCategoryId || !activeMilestone) {
    // Selection screen with 4 gorgeous tiles
    return (
      <div className="w-full py-6">
        <div className="text-center mb-8">
          <h2 className="font-serif text-3xl md:text-4xl text-white tracking-tight mb-2">
            Select a Milestone Card
          </h2>
          <p className="text-neutral-400 font-sans max-w-md mx-auto text-sm md:text-base">
            Select one of our special chapters below to see sweet memories, custom countups, and add beautiful photos of us.
          </p>

          {/* Gorgeous Category Tabs with Horizontal Scroll Wrapper */}
          <HorizontalScrollWrapper className="max-w-2xl mx-auto mt-5 px-4" scrollContainerClassName="gap-2 py-1 justify-start sm:justify-center">
            {[
              { id: 'all', label: 'All Chapters', icon: <Heart className="w-3.5 h-3.5" /> },
              { id: 'birthday', label: 'Birthdays', icon: <Gift className="w-3.5 h-3.5" /> },
              { id: 'engagement', label: 'Engagement', icon: <Heart className="w-3.5 h-3.5 fill-rose-400 text-rose-400" /> },
              { id: 'anniversary', label: 'Anniversaries', icon: <Calendar className="w-3.5 h-3.5" /> },
              { id: 'other', label: 'Other Sweet Moments', icon: <Sparkles className="w-3.5 h-3.5" /> },
              { id: 'archived', label: 'Archived Memories', icon: <Archive className="w-3.5 h-3.5 text-rose-300" /> }
            ].map((tab, idx) => {
              const isActive = filterCategory === tab.id;
              return (
                <button
                  type="button"
                  key={`milestone-filter-tab-${tab.id}-${idx}`}
                  onClick={() => setFilterCategory(tab.id as any)}
                  className={`px-4 py-2 text-xs font-semibold rounded-2xl flex items-center gap-2 transition-all cursor-pointer border shrink-0 ${
                    isActive
                      ? 'bg-gradient-to-r from-rose-500 to-pink-600 border-rose-500/30 text-white shadow-md shadow-rose-500/20'
                      : 'bg-white/5 border-white/5 text-neutral-400 hover:text-white hover:bg-white/10 hover:border-white/10'
                  }`}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              );
            })}
          </HorizontalScrollWrapper>

          {/* Milestone Capacity Quotas Status Pill Bar */}
          <div className="max-w-2xl mx-auto mt-4 px-4">
            <div className="bg-neutral-900/60 border border-white/10 rounded-2xl p-3 flex flex-wrap items-center justify-between gap-3 text-xs shadow-inner">
              <div className="flex items-center gap-2">
                <div className={`p-1.5 rounded-lg border ${
                  quotaStats.isTotalFull 
                    ? 'bg-rose-500/20 text-rose-300 border-rose-500/30' 
                    : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                }`}>
                  <Layers className="w-3.5 h-3.5" />
                </div>
                <div>
                  <span className="font-semibold text-white font-sans text-xs flex items-center gap-1.5">
                    Milestone Quota
                    {quotaStats.isTotalFull && (
                      <span className="text-[10px] bg-rose-500/20 text-rose-300 border border-rose-500/30 px-1.5 py-0.2 rounded-full font-mono font-bold">
                        Full
                      </span>
                    )}
                  </span>
                  <span className="text-[10px] text-neutral-400 font-mono">
                    Total: {quotaStats.totalUsed} / {quotaStats.totalMax === -1 ? '∞ Unlimited' : quotaStats.totalMax} active
                  </span>
                </div>
              </div>

              {/* Category Quota Breakdown Badges */}
              <div className="flex flex-wrap items-center gap-1.5">
                <span className={`text-[10px] font-mono px-2 py-0.5 rounded-lg border ${
                  quotaStats.isAnnivFull 
                    ? 'bg-rose-500/20 text-rose-300 border-rose-500/40' 
                    : 'bg-white/5 text-neutral-400 border-white/10'
                }`} title="Anniversaries & Engagements Quota">
                  💍 Anniv: {quotaStats.annivUsed}/{quotaStats.annivMax === -1 ? '∞' : quotaStats.annivMax}
                </span>
                <span className={`text-[10px] font-mono px-2 py-0.5 rounded-lg border ${
                  quotaStats.isBdayFull 
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' 
                    : 'bg-white/5 text-neutral-400 border-white/10'
                }`} title="Birthdays Quota">
                  🎂 B-day: {quotaStats.bdayUsed}/{quotaStats.bdayMax === -1 ? '∞' : quotaStats.bdayMax}
                </span>
                <span className={`text-[10px] font-mono px-2 py-0.5 rounded-lg border ${
                  quotaStats.isOtherFull 
                    ? 'bg-sky-500/20 text-sky-300 border-sky-500/40' 
                    : 'bg-white/5 text-neutral-400 border-white/10'
                }`} title="Other Events Quota">
                  ✨ Other: {quotaStats.otherUsed}/{quotaStats.otherMax === -1 ? '∞' : quotaStats.otherMax}
                </span>
              </div>
            </div>
          </div>

          {/* Elegant Sorting Controller & Mobile Layout Mode Switcher */}
          <div className="flex flex-wrap items-center justify-center gap-3 mt-5 px-4">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-neutral-400 flex items-center gap-1.5 font-sans uppercase tracking-wider">
                <SlidersHorizontal className="w-3.5 h-3.5 text-rose-400" /> Order By:
              </span>
              <div className="inline-flex p-1 bg-white/5 rounded-2xl border border-white/10 backdrop-blur-md">
                <button
                  type="button"
                  onClick={() => setSortBy('default')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-xl transition-all cursor-pointer ${
                    sortBy === 'default' 
                      ? 'bg-gradient-to-r from-rose-500 to-pink-600 text-white shadow-md shadow-rose-500/20' 
                      : 'text-neutral-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  Default
                </button>
                <button
                  type="button"
                  onClick={() => setSortBy('date')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-xl transition-all cursor-pointer flex items-center gap-1 ${
                    sortBy === 'date' 
                      ? 'bg-gradient-to-r from-rose-500 to-pink-600 text-white shadow-md shadow-rose-500/20' 
                      : 'text-neutral-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <Calendar className="w-3 h-3" /> Date
                </button>
                <button
                  type="button"
                  onClick={() => setSortBy('category')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-xl transition-all cursor-pointer flex items-center gap-1 ${
                    sortBy === 'category' 
                      ? 'bg-gradient-to-r from-rose-500 to-pink-600 text-white shadow-md shadow-rose-500/20' 
                      : 'text-neutral-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <Sparkles className="w-3 h-3" /> Category
                </button>
              </div>
            </div>

            {/* Mobile Layout Mode Switcher (Grid vs List on Mobile) */}
            <div className="sm:hidden flex items-center gap-1.5">
              <span className="text-xs font-semibold text-neutral-400 font-sans uppercase tracking-wider">View:</span>
              <div className="inline-flex p-1 bg-white/5 rounded-2xl border border-white/10 backdrop-blur-md">
                <button
                  type="button"
                  onClick={() => setMobileLayout('grid')}
                  title="2-Column Grid View"
                  className={`px-2.5 py-1.5 text-xs font-semibold rounded-xl transition-all cursor-pointer flex items-center gap-1 ${
                    mobileLayout === 'grid'
                      ? 'bg-rose-600 text-white shadow-md'
                      : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  <span>Grid</span>
                </button>
                <button
                  type="button"
                  onClick={() => setMobileLayout('list')}
                  title="Full Width List View"
                  className={`px-2.5 py-1.5 text-xs font-semibold rounded-xl transition-all cursor-pointer flex items-center gap-1 ${
                    mobileLayout === 'list'
                      ? 'bg-rose-600 text-white shadow-md'
                      : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  <List className="w-3.5 h-3.5" />
                  <span>List</span>
                </button>
              </div>
            </div>
          </div>

          {/* Milestone Search Bar */}
          <div className="max-w-md mx-auto mt-6 px-4">
            <div className="relative flex items-center bg-neutral-900/60 border border-white/5 rounded-2xl px-3.5 py-2.5 focus-within:border-rose-500/30 focus-within:ring-1 focus-within:ring-rose-500/30 transition-all shadow-inner">
              <Search className="w-4 h-4 text-rose-300/40 mr-2 shrink-0" />
              <input
                type="text"
                placeholder="Search milestones or memories..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-transparent text-sm text-neutral-200 placeholder-neutral-500 outline-none w-full font-sans"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="p-1 hover:bg-white/10 rounded-full text-neutral-400 hover:text-white transition-colors cursor-pointer"
                  title="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Milestone Cards Grid Container with support for 2-column grid view on mobile */}
        <div className={`max-w-4xl mx-auto mt-6 sm:mt-8 ${
          mobileLayout === 'grid' 
            ? 'grid grid-cols-2 sm:grid-cols-2 gap-3 sm:gap-6 px-2.5 sm:px-4' 
            : 'grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 px-4'
        }`}>
          {/* Add Milestone Card at first of the page */}
          <motion.button
            id="btn-create-milestone-tile"
            whileHover={{ scale: 1.03, y: -4 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setShowCreateForm(true)}
            className="relative overflow-hidden rounded-2xl p-3.5 sm:p-6 text-center shadow-lg border border-dashed border-white/20 bg-white/5 hover:bg-white/10 hover:border-rose-400/40 text-white flex flex-col justify-center items-center h-44 sm:h-52 group transition-all cursor-pointer"
          >
            <div className="p-2.5 sm:p-3.5 bg-rose-500/10 rounded-full border border-rose-500/20 text-rose-400 mb-1.5 sm:mb-2.5 group-hover:scale-110 transition-transform">
              <Plus className="w-5 h-5 sm:w-7 sm:h-7" />
            </div>
            <span className="font-serif text-sm sm:text-lg font-medium tracking-tight text-neutral-200 group-hover:text-white transition-colors">
              Add New Milestone
            </span>
            <p className="text-[10px] sm:text-[11px] text-neutral-400 mt-0.5 sm:mt-1 max-w-[160px] sm:max-w-[200px] line-clamp-2">
              Create a custom card for another beautiful moment
            </p>
            {quotaStats.isTotalFull ? (
              <span className="text-[10px] font-mono font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40 px-2.5 py-0.5 rounded-full mt-1.5 flex items-center gap-1 shadow-sm">
                <ShieldAlert className="w-2.5 h-2.5" /> Capacity Full ({quotaStats.totalMax} max)
              </span>
            ) : quotaStats.totalMax !== -1 ? (
              <span className="text-[9px] font-mono text-neutral-400 bg-white/5 border border-white/10 px-2 py-0.5 rounded-full mt-1.5">
                Quota: {quotaStats.totalUsed} / {quotaStats.totalMax}
              </span>
            ) : null}
          </motion.button>

          {filteredAndSortedMilestones.map((milestone, index) => {
            const isBirthday = milestone.category === 'birthday';
            const isEngagement = milestone.category === 'engagement';
            const isAnniversary = milestone.category === 'anniversary';

            let icon = <Sparkles className="w-4 h-4 sm:w-6 sm:h-6 text-white" />;
            if (isBirthday) icon = <Gift className="w-4 h-4 sm:w-6 sm:h-6 text-white" />;
            if (isEngagement) icon = <Heart className="w-4 h-4 sm:w-6 sm:h-6 text-white fill-white" />;
            if (isAnniversary) icon = <Calendar className="w-4 h-4 sm:w-6 sm:h-6 text-white" />;

            return (
              <motion.button
                id={`milestone-tile-${milestone.id}`}
                key={`milestone-tile-${milestone.id}-${index}`}
                whileHover={{ scale: 1.03, y: -4 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => onSelectCategory(milestone.id)}
                className={`relative overflow-hidden rounded-2xl p-3.5 sm:p-6 text-left shadow-lg cursor-pointer h-44 sm:h-52 bg-gradient-to-br ${milestone.themeColor} text-white flex flex-col justify-between group transition-shadow hover:shadow-rose-950/40`}
              >
                {/* Visual sparkles absolute */}
                <div className="absolute top-0 right-0 w-24 h-24 sm:w-32 sm:h-32 bg-white/5 rounded-full blur-2xl -mr-8 -mt-8 sm:-mr-10 sm:-mt-10 transition-transform group-hover:scale-125" />
                
                <div className="flex justify-between items-start gap-1">
                  <div className="p-2 sm:p-3 bg-white/20 backdrop-blur-md rounded-xl shrink-0">
                    {icon}
                  </div>
                  <span className="text-[9px] sm:text-xs uppercase font-semibold tracking-wider bg-black/20 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full backdrop-blur-sm truncate max-w-[85px] sm:max-w-none">
                    {milestone.category}
                  </span>
                </div>

                <div>
                  <h3 className="font-serif text-sm sm:text-xl font-medium tracking-tight mb-0.5 sm:mb-1 line-clamp-2 leading-tight">
                    {milestone.title}
                  </h3>
                  <p className="text-[10px] sm:text-xs text-white/80 font-sans line-clamp-2 leading-tight">
                    {milestone.description}
                  </p>
                </div>
              </motion.button>
            );
          })}
        </div>

        {filteredAndSortedMilestones.length === 0 && searchQuery.trim() && (
          <div className="text-center py-12 px-4 max-w-md mx-auto relative z-10">
            <div className="p-3 bg-white/5 border border-white/10 rounded-full text-neutral-400 w-12 h-12 flex items-center justify-center mx-auto mb-4">
              <Search className="w-6 h-6" />
            </div>
            <p className="text-sm font-semibold text-neutral-300">No matching memories found</p>
            <p className="text-xs text-neutral-500 mt-1">We couldn't find any milestone card matching "{searchQuery}". Try looking for another keyword!</p>
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="text-xs text-rose-400 underline hover:text-rose-300 mt-3 font-semibold cursor-pointer"
            >
              Show all cards
            </button>
          </div>
        )}
      </div>
    );
  }

  // File drag & drop handlers with support for multi-photo uploads
  const processFiles = async (files: FileList) => {
    if (!activeMilestone) return;
    const fileArray = Array.from(files).filter(
      (file) =>
        (file.type && file.type.startsWith('image/')) ||
        /\.(jpe?g|png|webp|gif|heic|heif|bmp|svg)$/i.test(file.name) ||
        file.size > 0
    );
    if (fileArray.length === 0) return;

    const readPromises = fileArray.map((file) => {
      return new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const rawResult = e.target?.result as string;
          if (!rawResult) {
            resolve('');
            return;
          }

          const img = new Image();
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
                resolve(canvas.toDataURL('image/jpeg', 0.82));
                return;
              }
            } catch (canvasErr) {
              console.warn("Canvas compression failed, falling back to raw data:", canvasErr);
            }
            resolve(rawResult);
          };
          img.onerror = () => resolve(rawResult);
          img.src = rawResult;
        };
        reader.onerror = () => resolve('');
        reader.readAsDataURL(file);
      });
    });

    try {
      const results = await Promise.all(readPromises);
      const validPhotos = results.filter((p) => p && p.trim().length > 0);
      if (validPhotos.length > 0) {
        const updatedMilestone = {
          ...activeMilestone,
          photos: [...(activeMilestone.photos || []), ...validPhotos],
        };
        onUpdateMilestone(updatedMilestone);
      }
    } catch (err) {
      console.error('Error uploading multiple photos:', err);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files) {
      processFiles(e.dataTransfer.files);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      processFiles(e.target.files);
    }
  };

  const handleAddLoveNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLoveNote.trim()) return;
    const notes = activeMilestone.loveNotes || [];
    const updatedMilestone = {
      ...activeMilestone,
      loveNotes: [...notes, newLoveNote.trim()]
    };
    onUpdateMilestone(updatedMilestone);
    setNewLoveNote('');
  };

  const handleDeleteLoveNote = (index: number) => {
    const notes = [...(activeMilestone.loveNotes || [])];
    notes.splice(index, 1);
    const updatedMilestone = {
      ...activeMilestone,
      loveNotes: notes
    };
    onUpdateMilestone(updatedMilestone);
  };

  const handleUnlock = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeMilestone) return;
    const correctPassword = getMilestonePassword(activeMilestone);
    if (enteredPassword.trim() === correctPassword.trim()) {
      setUnlockedMilestones(prev => ({ ...prev, [activeMilestone.id]: true }));
      setPasswordError('');
      setEnteredPassword('');
    } else {
      setPasswordError('Oops! That is not our secret key. Try again, sweetheart! 💕');
    }
  };

  const handleManualLock = () => {
    if (!activeMilestone) return;
    setUnlockedMilestones(prev => ({ ...prev, [activeMilestone.id]: false }));
  };

  const handleSaveEdit = () => {
    if (activeMilestone && editedCategory !== activeMilestone.category) {
      const isSwitchingToAnniv = editedCategory === 'anniversary' || editedCategory === 'engagement';
      const wasAnniv = activeMilestone.category === 'anniversary' || activeMilestone.category === 'engagement';
      if (isSwitchingToAnniv && !wasAnniv && quotaStats.isAnnivFull) {
        setSaveEditError(`Cannot switch to Anniversary: capacity quota of ${quotaStats.annivMax} has been reached.`);
        return;
      }
      const isSwitchingToBday = editedCategory === 'birthday';
      const wasBday = activeMilestone.category === 'birthday';
      if (isSwitchingToBday && !wasBday && quotaStats.isBdayFull) {
        setSaveEditError(`Cannot switch to Birthday: capacity quota of ${quotaStats.bdayMax} has been reached.`);
        return;
      }
      const isSwitchingToOther = !isSwitchingToAnniv && !isSwitchingToBday;
      const wasOther = !wasAnniv && !wasBday;
      if (isSwitchingToOther && !wasOther && quotaStats.isOtherFull) {
        setSaveEditError(`Cannot switch to Other Events: capacity quota of ${quotaStats.otherMax} has been reached.`);
        return;
      }
    }

    const updatedMilestone = {
      ...activeMilestone,
      title: editedTitle.trim(),
      category: editedCategory,
      date: editedDate,
      description: editedDesc.trim(),
      sweetMessage: editedMessage.trim(),
      password: editedPassword.trim()
    };
    onUpdateMilestone(updatedMilestone);
    setIsEditingMessage(false);
    setSaveEditError('');
  };

  const handleDeletePhoto = (photoIndex: number) => {
    const photos = [...activeMilestone.photos];
    photos.splice(photoIndex, 1);
    const updatedMilestone = {
      ...activeMilestone,
      photos
    };
    onUpdateMilestone(updatedMilestone);
  };

  const milestonePassword = getMilestonePassword(activeMilestone);
  const isLocked = milestonePassword && !unlockedMilestones[activeMilestone.id];

  if (isLocked) {
    return (
      <div className="w-full max-w-md mx-auto px-4 py-12">
        <button
          onClick={() => onSelectCategory(null)}
          className="inline-flex items-center gap-1.5 text-rose-400 hover:text-rose-300 font-sans font-medium text-sm mb-6 transition-colors group cursor-pointer"
        >
          <ChevronLeft className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" />
          Back to all milestones
        </button>
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-neutral-900 border border-white/10 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6 text-center relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-rose-500/5 rounded-full blur-2xl -mr-10 -mt-10" />
          
          <div className="flex flex-col items-center gap-3">
            <div className="p-4 bg-rose-500/10 rounded-2xl border border-rose-500/20 text-rose-400 animate-pulse">
              <Lock className="w-8 h-8 fill-rose-500/10" />
            </div>
            <div>
              <h3 className="font-serif text-2xl font-bold text-white tracking-tight">Protected Milestone</h3>
              <p className="text-xs text-neutral-400 mt-1 max-w-xs mx-auto">
                "{activeMilestone.title}" is password-protected to keep our special memories private.
              </p>
            </div>
          </div>

          <form onSubmit={handleUnlock} className="space-y-4">
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={enteredPassword}
                onChange={(e) => {
                  setEnteredPassword(e.target.value);
                  setPasswordError('');
                }}
                placeholder="Enter password..."
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
                className="text-xs text-rose-400 font-medium inline-flex items-center gap-1 bg-rose-500/5 border border-rose-500/10 px-3 py-1.5 rounded-lg w-full justify-center"
              >
                <AlertCircle className="w-3.5 h-3.5 shrink-0 animate-bounce" />
                <span>{passwordError}</span>
              </motion.p>
            )}

            <button
              type="submit"
              className="w-full py-3 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl border border-rose-500/20 shadow-md transition-all cursor-pointer inline-flex items-center justify-center gap-1.5"
            >
              <Unlock className="w-4 h-4" />
              Unlock Memory Lane 💖
            </button>
          </form>

          <div className="pt-3 border-t border-white/5 text-[10px] text-neutral-500 space-y-1">
            <p>💡 Hint: The default password <span className="font-semibold text-rose-300 font-mono">بحبك يا مريم</span> .</p>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-4xl mx-auto px-4 py-4">
      {/* Back button */}
      <button
        id="btn-back-milestones"
        onClick={() => onSelectCategory(null)}
        className="inline-flex items-center gap-1.5 text-rose-400 hover:text-rose-300 font-sans font-medium text-sm mb-6 transition-colors group cursor-pointer"
      >
        <ChevronLeft className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" />
        Back to all milestones
      </button>

      {/* Main card panel */}
      <div className="bg-white/5 backdrop-blur-md rounded-3xl shadow-2xl overflow-hidden border border-white/10">
        
        {/* Header with gradient theme */}
        <div className={`p-8 bg-gradient-to-r ${activeMilestone.themeColor} text-white relative`}>
          <div className="absolute top-0 right-0 w-48 h-48 bg-white/5 rounded-full blur-2xl -mr-16 -mt-16" />
          
          <div className="relative z-10">
            <div className="flex flex-wrap justify-between items-start gap-4 mb-3">
              <span className="text-xs uppercase font-semibold tracking-wider bg-white/20 px-3 py-1 rounded-full backdrop-blur-sm">
                {activeMilestone.category}
              </span>
              <div className="flex gap-2">
                {getMilestonePassword(activeMilestone) && (
                  <button
                    id="btn-lock-milestone-manual"
                    onClick={handleManualLock}
                    className="inline-flex items-center gap-1 bg-white/20 hover:bg-white/30 px-3 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer"
                    title="Lock milestone card"
                  >
                    <Lock className="w-3.5 h-3.5" />
                    Lock Card
                  </button>
                )}
                <button 
                  id="btn-edit-milestone"
                  onClick={() => setIsEditingMessage(!isEditingMessage)}
                  className="inline-flex items-center gap-1 bg-white/20 hover:bg-white/30 px-3 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  {isEditingMessage ? 'Cancel Edit' : 'Edit details'}
                </button>
                <button 
                  id="btn-archive-milestone"
                  onClick={() => {
                    const updated = {
                      ...activeMilestone,
                      archived: !activeMilestone.archived
                    };
                    onUpdateMilestone(updated);
                  }}
                  className={`inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer border ${
                    activeMilestone.archived
                      ? 'bg-amber-600/40 hover:bg-amber-700/60 border-amber-500/20 text-white'
                      : 'bg-white/20 hover:bg-white/30 border-transparent text-white'
                  }`}
                  title={activeMilestone.archived ? "Unarchive milestone card" : "Archive milestone card"}
                >
                  {activeMilestone.archived ? (
                    <>
                      <ArchiveRestore className="w-3.5 h-3.5 text-amber-300" />
                      Unarchive Card
                    </>
                  ) : (
                    <>
                      <Archive className="w-3.5 h-3.5 text-white/95" />
                      Archive Card
                    </>
                  )}
                </button>
                <button 
                  id="btn-delete-milestone"
                  onClick={() => setShowDeleteConfirm(true)}
                  className="inline-flex items-center gap-1 bg-rose-600/40 hover:bg-rose-700/60 px-3 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer border border-rose-500/10"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete Card
                </button>
              </div>
            </div>

            {isEditingMessage ? (
              <div className="space-y-3 bg-black/30 p-4 rounded-xl backdrop-blur-sm mt-3 text-white">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-white/95 mb-1">Milestone Title</label>
                    <input
                      type="text"
                      value={editedTitle}
                      onChange={(e) => setEditedTitle(e.target.value)}
                      className="w-full px-3 py-1.5 bg-neutral-900 border border-white/15 rounded-lg text-sm text-white focus:outline-none focus:border-rose-400"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-white/95 mb-1">Category</label>
                    <select
                      value={editedCategory}
                      onChange={(e) => setEditedCategory(e.target.value as MilestoneCategory)}
                      className="w-full px-3 py-1.5 bg-neutral-900 border border-white/15 rounded-lg text-sm text-white focus:outline-none focus:border-rose-400"
                    >
                      <option value="anniversary">Anniversary 💍</option>
                      <option value="engagement">Engagement 💍</option>
                      <option value="birthday">Birthday 🎂</option>
                      <option value="other">Other/Custom ✨</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-white/95 mb-1 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-rose-400" />
                    Date &amp; Time
                  </label>
                  <div className="relative">
                    <input
                      type="datetime-local"
                      value={editedDate}
                      onChange={(e) => setEditedDate(e.target.value)}
                      style={{ colorScheme: 'dark' }}
                      className="w-full pl-9 pr-3 py-1.5 bg-neutral-900 border border-white/15 rounded-lg text-sm text-white focus:outline-none focus:border-rose-400"
                    />
                    <Clock className="absolute left-2.5 top-1/2 -translate-y-1/2 text-rose-400/80 w-3.5 h-3.5 pointer-events-none" />
                  </div>
                  
                  {/* Live Counter Preview in Edit mode */}
                  {editedDate && editPreviewDiff && (
                    <div className="mt-2 p-2 bg-rose-500/5 rounded-lg border border-rose-500/10 text-[11px] text-center text-neutral-300 font-sans">
                      <span className="font-semibold text-rose-300">Live edit preview: </span>
                      {editPreviewDiff.days}d {editPreviewDiff.hours}h {editPreviewDiff.mins}m {editPreviewDiff.secs}s {editPreviewDiff.prefix}ago/to-go
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-white/95 mb-1">Short Description</label>
                  <textarea
                    value={editedDesc}
                    onChange={(e) => setEditedDesc(e.target.value)}
                    rows={2}
                    className="w-full px-3 py-1.5 bg-neutral-900 border border-white/15 rounded-lg text-sm text-white focus:outline-none focus:border-rose-400"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-white/95 mb-1">Sweet Message 💌</label>
                  <textarea
                    value={editedMessage}
                    onChange={(e) => setEditedMessage(e.target.value)}
                    rows={3}
                    className="w-full px-3 py-1.5 bg-neutral-900 border border-white/15 rounded-lg text-sm text-white focus:outline-none focus:border-rose-400 font-sans"
                    placeholder="Write your beautiful deep message about this special moment..."
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-white/95 mb-1">Card Password Protection (Optional)</label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={editedPassword}
                      onChange={(e) => setEditedPassword(e.target.value)}
                      placeholder="Enter a secret password or leave blank for public access"
                      className="w-full px-3 py-1.5 bg-neutral-900 border border-white/15 rounded-lg text-sm text-white focus:outline-none focus:border-rose-400 pr-10 font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 text-neutral-400 hover:text-white transition-colors cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-[10px] text-rose-300/80 mt-1">
                    Leave blank to remove password protection. Enter a value to lock the card.
                  </p>
                </div>
                {saveEditError && (
                  <div className="p-2.5 bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs rounded-xl flex items-center gap-1.5 mt-2">
                    <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                    <span>{saveEditError}</span>
                  </div>
                )}
                <div className="flex justify-end pt-1 gap-2">
                  <button
                    type="button"
                    onClick={() => setIsEditingMessage(false)}
                    className="px-4 py-1.5 border border-white/10 rounded-lg text-xs font-semibold text-neutral-300 hover:bg-white/5 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    id="btn-save-milestone-header"
                    onClick={handleSaveEdit}
                    className="bg-rose-600 text-white px-4 py-1.5 rounded-lg text-xs font-semibold hover:bg-rose-700 transition-colors inline-flex items-center gap-1 cursor-pointer border border-rose-500/20"
                  >
                    <Save className="w-3.5 h-3.5" />
                    Save Changes
                  </button>
                </div>
              </div>
            ) : (
              <>
                <h1 className="font-serif text-3xl font-medium tracking-tight mb-2">
                  {activeMilestone.title}
                </h1>
                <p className="text-white/85 font-sans text-sm md:text-base max-w-2xl leading-relaxed">
                  {activeMilestone.description}
                </p>
                <div className="flex flex-wrap items-center gap-4 mt-4 text-xs font-sans text-white/90">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-white/80" />
                    <span>Established: {formatMilestoneDate(activeMilestone.date)}</span>
                  </div>
                  {activeMilestone.createdBy && (
                    <div className="flex items-center gap-1.5 bg-white/10 border border-white/15 px-2.5 py-0.5 rounded-full backdrop-blur-sm text-[11px] text-rose-100">
                      <Sparkles className="w-3 h-3 text-rose-300 animate-spin-slow" />
                      <span>Shared by: <span className="font-semibold text-rose-200">{activeMilestone.createdBy}</span></span>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Real-time counters panel */}
        <div className="bg-white/5 border-b border-white/10 px-8 py-6">
          <div className="flex flex-col items-center text-center">
            <span className="text-xs uppercase font-sans tracking-widest text-rose-400 font-semibold mb-2">
              Time Counter
            </span>
            
            {/* Live numbers split */}
            <div className="flex gap-2 sm:gap-4 md:gap-6 justify-center items-center">
              <div className="bg-neutral-900 px-3 sm:px-5 py-3 rounded-2xl shadow-sm border border-white/10 min-w-[65px] sm:min-w-[85px]">
                <span className="block font-serif text-2xl sm:text-3xl text-rose-400 font-bold">{timeDiffText.days}</span>
                <span className="block text-[10px] text-neutral-400 font-sans uppercase font-medium tracking-wider mt-0.5">Days</span>
              </div>
              <span className="text-xl text-rose-500/50 font-light">:</span>
              <div className="bg-neutral-900 px-3 sm:px-5 py-3 rounded-2xl shadow-sm border border-white/10 min-w-[65px] sm:min-w-[85px]">
                <span className="block font-serif text-2xl sm:text-3xl text-rose-400 font-bold">{timeDiffText.hours}</span>
                <span className="block text-[10px] text-neutral-400 font-sans uppercase font-medium tracking-wider mt-0.5">Hours</span>
              </div>
              <span className="text-xl text-rose-500/50 font-light">:</span>
              <div className="bg-neutral-900 px-3 sm:px-5 py-3 rounded-2xl shadow-sm border border-white/10 min-w-[65px] sm:min-w-[85px]">
                <span className="block font-serif text-2xl sm:text-3xl text-rose-400 font-bold">{timeDiffText.mins}</span>
                <span className="block text-[10px] text-neutral-400 font-sans uppercase font-medium tracking-wider mt-0.5">Mins</span>
              </div>
              <span className="text-xl text-rose-500/50 font-light">:</span>
              <div className="bg-neutral-900 px-3 sm:px-5 py-3 rounded-2xl shadow-sm border border-white/10 min-w-[65px] sm:min-w-[85px]">
                <span className="block font-serif text-2xl sm:text-3xl text-rose-400 font-bold">{timeDiffText.secs}</span>
                <span className="block text-[10px] text-neutral-400 font-sans uppercase font-medium tracking-wider mt-0.5">Secs</span>
              </div>
            </div>

            <p className="mt-3 text-sm font-sans text-rose-300/85 font-medium italic">
              {timeDiffText.prefix}our special moment {timeDiffText.suffix}!
            </p>
          </div>
        </div>

        {/* Content Tabs / Split view */}
        <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-8">
          
          {/* Left: Photos & Videos Section */}
          <div className="space-y-6">
            <div 
              onClick={() => {
                if (activeMilestone.photos && activeMilestone.photos.length > 0) {
                  setActivePhotoIndex(0);
                } else {
                  fileInputRef.current?.click();
                }
              }}
              className="group select-none cursor-pointer"
            >
              <h3 className="font-serif text-lg text-white font-medium mb-1 inline-flex items-center gap-1.5 group-hover:text-rose-400 transition-colors">
                <ImageIcon className="w-5 h-5 text-rose-500 group-hover:scale-110 transition-transform" />
                Memory Gallery
                {activeMilestone.photos && activeMilestone.photos.length > 0 && (
                  <span className="text-[10px] font-sans font-normal uppercase tracking-wider bg-rose-500/20 text-rose-300 border border-rose-500/35 px-2.5 py-0.5 rounded-full inline-flex items-center gap-1 ml-2 animate-pulse">
                    <Sparkles className="w-2.5 h-2.5" />
                    View Slideshow
                  </span>
                )}
              </h3>
              <p className="text-xs text-neutral-400 font-sans group-hover:text-neutral-300 transition-colors">
                Drag & drop or select photos that correspond to this beautiful event.
                {activeMilestone.photos && activeMilestone.photos.length > 0 && (
                  <span className="text-rose-400 font-semibold block mt-1 underline decoration-dotted">
                    💡 Click here or on any photo below to view full-screen
                  </span>
                )}
              </p>
            </div>

            {/* Drag & drop panel - Mobile friendly overlay input */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all relative overflow-hidden select-none ${
                isDragging 
                  ? 'border-rose-500 bg-rose-950/20' 
                  : 'border-white/10 hover:border-white/30 bg-white/5 hover:bg-white/10'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,image/heic,image/heif"
                onChange={handleFileSelect}
                className="absolute inset-0 opacity-0 w-full h-full cursor-pointer z-10"
              />
              <Upload className="w-8 h-8 text-rose-400 mx-auto mb-2 pointer-events-none" />
              <p className="text-xs font-semibold text-rose-400 font-sans pointer-events-none">
                Drag your love photos here
              </p>
              <p className="text-[10px] text-neutral-400 font-sans mt-1 pointer-events-none">
                or tap to browse from device (Multiple allowed)
              </p>
            </div>

            {/* Gallery list */}
            {activeMilestone.photos.length === 0 ? (
              <div className="bg-white/5 border border-white/10 rounded-xl p-6 text-center text-neutral-400 font-sans text-xs">
                No photos in this gallery yet. Add some memories above!
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {activeMilestone.photos.map((photo, pIdx) => (
                  <div 
                    key={`milestone-detail-photo-${pIdx}`} 
                    onClick={() => setActivePhotoIndex(pIdx)}
                    className="relative aspect-square rounded-xl overflow-hidden group shadow-sm border border-white/10 bg-neutral-900 cursor-pointer hover:border-rose-400/50 transition-all hover:scale-[1.03] active:scale-[0.98]"
                    title="Click to view clearly"
                  >
                    <img
                      src={photo}
                      alt="couple memory"
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                      referrerPolicy="no-referrer"
                    />
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeletePhoto(pIdx);
                      }}
                      className="absolute top-1 right-1 p-1.5 bg-black/70 hover:bg-rose-600 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity z-10"
                      title="Delete photo"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    {/* Hover magnifying glass overlay icon */}
                    <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                      <span className="p-1.5 bg-rose-500/80 rounded-full text-white scale-90 group-hover:scale-100 transition-transform">
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right: Message & Love Notes Section */}
          <div className="space-y-6">
            
            {/* Romantic Sweet Message block */}
            <div className="bg-white/5 border border-white/10 rounded-2xl p-5 relative">
              <div className="absolute -top-3 -left-3 bg-rose-500 text-white p-1.5 rounded-lg">
                <Heart className="w-3.5 h-3.5 fill-white" />
              </div>
              
              <div className="flex justify-between items-center mb-2">
                <h4 className="font-serif text-sm font-semibold text-rose-300 uppercase tracking-wider ml-4">
                  My Sweet Message
                </h4>
              </div>

              {isEditingMessage ? (
                <div className="space-y-2">
                  <textarea
                    value={editedMessage}
                    onChange={(e) => setEditedMessage(e.target.value)}
                    rows={4}
                    className="w-full p-2 text-sm bg-neutral-900 border border-white/15 text-white rounded-xl focus:outline-none focus:ring-1 focus:ring-rose-400 font-sans"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => setIsEditingMessage(false)}
                      className="px-3 py-1 text-xs border border-white/15 rounded-lg hover:bg-white/5 cursor-pointer text-neutral-300"
                    >
                      Cancel
                    </button>
                    <button
                      id="btn-save-message"
                      onClick={handleSaveEdit}
                      className="px-3 py-1 text-xs bg-rose-600 hover:bg-rose-700 text-white rounded-lg inline-flex items-center gap-1 cursor-pointer border border-rose-500/20"
                    >
                      <Save className="w-3 h-3" />
                      Save
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-sm font-sans text-neutral-200 italic leading-relaxed pl-4">
                  "{activeMilestone.sweetMessage}"
                </p>
              )}
            </div>

            {/* Love Notes checkable bullets */}
            <div className="space-y-3">
              <h4 className="font-serif text-sm font-semibold text-white uppercase tracking-wider inline-flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-rose-500" />
                Sweet Moments & Love Notes
              </h4>
              
              {/* Form to add note */}
              <form onSubmit={handleAddLoveNote} className="flex gap-2">
                <input
                  type="text"
                  value={newLoveNote}
                  onChange={(e) => setNewLoveNote(e.target.value)}
                  placeholder="Add a cute note or reason why this day was special..."
                  className="flex-1 px-3 py-1.5 text-xs bg-neutral-900 border border-white/15 rounded-xl focus:outline-none focus:ring-1 focus:ring-rose-400 font-sans text-white placeholder-neutral-500"
                />
                <button
                  type="submit"
                  className="bg-rose-500 hover:bg-rose-600 text-white p-1.5 rounded-xl transition-colors cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </form>

              {/* Note lists */}
              <ul className="space-y-2 mt-2">
                {(activeMilestone.loveNotes || []).map((note, idx) => (
                  <li 
                    key={`milestone-love-note-${idx}`} 
                    className="flex justify-between items-start gap-3 bg-neutral-900/40 hover:bg-neutral-900/80 p-2.5 rounded-xl border border-white/10 text-xs font-sans text-neutral-200 transition-colors group"
                  >
                    <div className="flex gap-2 mt-0.5">
                      <span className="text-rose-400">♥</span>
                      <span>{note}</span>
                    </div>
                    <button
                      onClick={() => handleDeleteLoveNote(idx)}
                      className="text-neutral-500 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </li>
                ))}
                {(activeMilestone.loveNotes || []).length === 0 && (
                  <li className="text-center py-4 text-xs font-sans text-neutral-500 italic">
                    Add sweet bullet points describing our favorite details of this event.
                  </li>
                )}
              </ul>
            </div>

          </div>

        </div>

      </div>

      {/* LIGHTBOX SLIDESHOW MODAL */}
      <AnimatePresence>
        {activePhotoIndex !== null && activeMilestone.photos && activeMilestone.photos[activePhotoIndex] && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/95 backdrop-blur-md p-4 select-none"
            onClick={() => setActivePhotoIndex(null)}
          >
            {/* Close button top right */}
            <button
              onClick={() => setActivePhotoIndex(null)}
              className="absolute top-4 right-4 p-3 bg-white/10 hover:bg-rose-600 border border-white/10 rounded-full text-white hover:scale-105 transition-all z-50 cursor-pointer shadow-lg"
              title="Close image viewer"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {/* Navigation Left */}
            {activeMilestone.photos.length > 1 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setActivePhotoIndex((prev) => 
                    prev !== null ? (prev - 1 + activeMilestone.photos.length) % activeMilestone.photos.length : prev
                  );
                }}
                className="absolute left-4 p-4 bg-white/5 hover:bg-rose-600 border border-white/10 hover:border-rose-400/30 rounded-full text-white hover:scale-105 active:scale-95 transition-all z-50 cursor-pointer shadow-lg"
                title="Previous photo"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
            )}

            {/* Navigation Right */}
            {activeMilestone.photos.length > 1 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setActivePhotoIndex((prev) => 
                    prev !== null ? (prev + 1) % activeMilestone.photos.length : prev
                  );
                }}
                className="absolute right-4 p-4 bg-white/5 hover:bg-rose-600 border border-white/10 hover:border-rose-400/30 rounded-full text-white hover:scale-105 active:scale-95 transition-all z-50 cursor-pointer shadow-lg"
                title="Next photo"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            )}

            {/* Main Image Stage */}
            <motion.div
              initial={{ scale: 0.9, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 10 }}
              transition={{ type: 'spring', damping: 25, stiffness: 150 }}
              className="relative max-w-4xl max-h-[80vh] flex items-center justify-center p-2 rounded-2xl overflow-hidden bg-neutral-900 border border-white/10"
              onClick={(e) => e.stopPropagation()}
            >
              <img
                src={activeMilestone.photos[activePhotoIndex]}
                alt="couple memory detail view"
                className="max-w-full max-h-[75vh] object-contain rounded-lg shadow-2xl"
                referrerPolicy="no-referrer"
              />

              {/* Photo deletion option inside the viewer */}
              {isConfirmingPhotoDelete ? (
                <div className="absolute bottom-4 right-4 bg-neutral-900/95 border border-rose-500/30 p-2.5 rounded-xl text-white shadow-xl flex items-center gap-2 z-30 text-xs font-semibold animate-pulse" onClick={(e) => e.stopPropagation()}>
                  <span className="text-rose-400">Delete photo forever?</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      const deleteIndex = activePhotoIndex;
                      if (activeMilestone.photos.length <= 1) {
                        setActivePhotoIndex(null);
                      } else if (deleteIndex !== null && deleteIndex >= activeMilestone.photos.length - 1) {
                        setActivePhotoIndex(deleteIndex - 1);
                      }
                      if (deleteIndex !== null) {
                        handleDeletePhoto(deleteIndex);
                      }
                      setIsConfirmingPhotoDelete(false);
                    }}
                    className="px-2 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded text-[10px] cursor-pointer"
                  >
                    Yes
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsConfirmingPhotoDelete(false);
                    }}
                    className="px-2 py-1 bg-white/10 hover:bg-white/20 text-white rounded text-[10px] cursor-pointer"
                  >
                    No
                  </button>
                </div>
              ) : (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsConfirmingPhotoDelete(true);
                  }}
                  className="absolute bottom-4 right-4 p-2.5 bg-black/85 hover:bg-rose-600 border border-white/10 rounded-xl text-white transition-all shadow-md flex items-center gap-1.5 text-xs font-semibold cursor-pointer z-30"
                  title="Delete photo"
                >
                  <Trash2 className="w-4 h-4 text-rose-300" />
                  Delete Photo
                </button>
              )}
            </motion.div>

            {/* Indicators & Info at bottom */}
            <div className="mt-6 flex flex-col items-center gap-1" onClick={(e) => e.stopPropagation()}>
              <div className="text-white text-xs font-medium uppercase tracking-wider bg-white/10 px-3.5 py-1.5 rounded-full border border-white/5 backdrop-blur-sm">
                Photo {activePhotoIndex + 1} of {activeMilestone.photos.length}
              </div>
              <p className="text-[10px] text-neutral-500 font-sans tracking-wide mt-1">
                Tip: Use Left / Right arrow keys on your keyboard to navigate or click outside to exit
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Custom delete milestone confirmation modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-neutral-900 border border-white/10 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-6 text-center relative overflow-hidden text-white"
          >
            <div className="absolute top-0 right-0 w-24 h-24 bg-rose-500/15 rounded-full blur-2xl" />
            
            <div className="flex flex-col items-center gap-3">
              <div className="p-4 bg-rose-500/10 rounded-2xl border border-rose-500/20 text-rose-400">
                <Trash2 className="w-8 h-8 text-rose-500" />
              </div>
              <h3 className="font-serif text-2xl font-bold text-white tracking-tight">Delete Milestone Card?</h3>
              <p className="text-sm text-neutral-400 leading-relaxed">
                Are you sure you want to delete <span className="font-semibold text-rose-300">"{activeMilestone?.title}"</span>? This will also delete all of its sweet messages and custom pictures forever! 💔
              </p>
            </div>

            <div className="flex gap-3">
              <button
                id="btn-cancel-delete"
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 py-2.5 rounded-xl border border-white/10 text-neutral-300 hover:bg-white/5 transition-colors text-sm font-medium cursor-pointer"
              >
                Cancel
              </button>
              <button
                id="btn-confirm-delete"
                onClick={() => {
                  if (activeMilestone) {
                    onDeleteMilestone(activeMilestone.id);
                  }
                  setShowDeleteConfirm(false);
                }}
                className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-rose-600 to-pink-700 hover:from-rose-700 hover:to-pink-800 text-white transition-all text-sm font-semibold shadow-lg hover:shadow-rose-600/20 cursor-pointer"
              >
                Delete Forever 💔
              </button>
            </div>
          </motion.div>
        </div>
      )}

    </div>
  );
};

export default MilestoneCard;
