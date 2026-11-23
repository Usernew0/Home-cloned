import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Sparkles, Calendar, DollarSign, MapPin, Clock, Heart, Check, Plus, Lock } from 'lucide-react';
import { DatePlan, SubscriptionTier } from '../types';

interface AIDateGeneratorProps {
  onAddPlan: (plan: DatePlan) => void;
  userPlan: SubscriptionTier;
  onOpenUpgradeModal: () => void;
}

export const AIDateGenerator: React.FC<AIDateGeneratorProps> = ({
  onAddPlan,
  userPlan,
  onOpenUpgradeModal
}) => {
  const [occasion, setOccasion] = useState('Weekend Surprise');
  const [budget, setBudget] = useState('$$');
  const [mood, setMood] = useState('Cozy & Romantic');
  const [location, setLocation] = useState('Local City');
  const [duration, setDuration] = useState('Evening (3-4 hours)');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedPlan, setGeneratedPlan] = useState<any | null>(null);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const handleGenerate = async () => {
    if (userPlan === 'free') {
      onOpenUpgradeModal();
      return;
    }

    setIsGenerating(true);
    setSavedSuccess(false);

    try {
      const response = await fetch('/api/generate-date', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ occasion, budget, mood, location, duration })
      });
      const data = await response.json();
      if (data.success && data.plan) {
        setGeneratedPlan(data.plan);
      }
    } catch (err) {
      console.error("AI Generation error:", err);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSaveToPlanner = () => {
    if (!generatedPlan) return;

    const newDatePlan: DatePlan = {
      id: 'date-' + Date.now(),
      title: generatedPlan.title || 'AI Generated Romantic Date',
      category: (generatedPlan.category as any) || 'dinner',
      occasion: 'surprise',
      theme: generatedPlan.theme || mood,
      dateTime: new Date(Date.now() + 86400000 * 3).toISOString().slice(0, 16), // Default 3 days ahead
      location: location || 'Special Location',
      description: generatedPlan.description || 'AI Curated Date Itinerary',
      checklist: (generatedPlan.checklist || []).map((item: any, idx: number) => ({
        id: 'ck-' + idx,
        text: typeof item === 'string' ? item : item.text,
        completed: false
      })),
      notes: generatedPlan.notes,
      status: 'planned',
      isAiGenerated: true
    };

    onAddPlan(newDatePlan);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  return (
    <div className="bg-neutral-900/80 border border-rose-500/30 rounded-3xl p-6 sm:p-8 space-y-6 relative overflow-hidden shadow-2xl">
      <div className="absolute -top-10 -right-10 w-40 h-40 bg-rose-500/10 rounded-full blur-2xl pointer-events-none" />

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-950/80 border border-rose-500/30 text-rose-300 text-xs font-semibold uppercase tracking-wider">
            <Sparkles className="w-3.5 h-3.5 text-rose-400 fill-rose-400" />
            AI Itinerary Generator
            {userPlan === 'free' && (
              <span className="ml-1 bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded text-[10px] font-bold border border-amber-500/30 flex items-center gap-1">
                <Lock className="w-2.5 h-2.5" /> PRO
              </span>
            )}
          </div>
          <h3 className="text-xl sm:text-2xl font-serif font-bold text-white">
            Curate an Unforgettable Date Night
          </h3>
        </div>
      </div>

      {/* Input Controls */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {/* Mood */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-neutral-300 uppercase tracking-wider">Mood / Vibe</label>
          <select
            value={mood}
            onChange={(e) => setMood(e.target.value)}
            className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-rose-500"
          >
            <option value="Cozy & Romantic">Cozy & Romantic</option>
            <option value="Adventurous & Fun">Adventurous & Fun</option>
            <option value="Luxurious & Fancy">Luxurious & Fancy</option>
            <option value="Chill & Relaxed at Home">Chill & Relaxed at Home</option>
            <option value="Spontaneous Surprise">Spontaneous Surprise</option>
          </select>
        </div>

        {/* Budget */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-neutral-300 uppercase tracking-wider">Budget Level</label>
          <select
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-rose-500"
          >
            <option value="Free">Free ($0)</option>
            <option value="$">Budget Friendly ($)</option>
            <option value="$$">Standard ($$)</option>
            <option value="$$$">Splurge / Premium ($$$)</option>
          </select>
        </div>

        {/* Duration */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-neutral-300 uppercase tracking-wider">Duration</label>
          <select
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-rose-500"
          >
            <option value="Quick Date (1-2 hours)">Quick Date (1-2 hours)</option>
            <option value="Evening (3-4 hours)">Evening (3-4 hours)</option>
            <option value="Full Day Adventure">Full Day Adventure</option>
            <option value="Weekend Getaway">Weekend Getaway</option>
          </select>
        </div>
      </div>

      {/* Generate Action Button */}
      <button
        type="button"
        onClick={handleGenerate}
        disabled={isGenerating}
        className="w-full py-3.5 bg-gradient-to-r from-rose-600 via-pink-600 to-purple-600 hover:from-rose-500 hover:to-purple-500 text-white font-bold rounded-2xl text-xs sm:text-sm transition-all shadow-lg shadow-rose-950/40 flex items-center justify-center gap-2 cursor-pointer"
      >
        <Sparkles className="w-4 h-4 fill-white animate-spin" />
        {isGenerating ? "Crafting Your Personalized Date Itinerary..." : userPlan === 'free' ? "Unlock AI Date Night Generator (Pro Feature)" : "Generate Romantic Date Itinerary"}
      </button>

      {/* Generated Itinerary Display */}
      {generatedPlan && (
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-neutral-950 border border-rose-500/40 rounded-2xl p-5 space-y-4"
        >
          <div className="flex justify-between items-start border-b border-neutral-800 pb-3">
            <div>
              <span className="text-[10px] font-bold text-rose-400 uppercase tracking-wider bg-rose-950 px-2 py-0.5 rounded border border-rose-500/30">
                {generatedPlan.theme || mood}
              </span>
              <h4 className="text-xl font-serif font-bold text-white mt-1">{generatedPlan.title}</h4>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 bg-neutral-900 border border-neutral-700 text-emerald-300 rounded-full">
              Cost: {generatedPlan.cost || budget}
            </span>
          </div>

          <p className="text-xs text-neutral-300 leading-relaxed">{generatedPlan.description}</p>

          {generatedPlan.checklist && generatedPlan.checklist.length > 0 && (
            <div className="space-y-2">
              <h5 className="text-xs font-semibold text-rose-300 uppercase tracking-wider">Planned Activity Steps</h5>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {generatedPlan.checklist.map((item: any, idx: number) => (
                  <div key={`ai-checklist-${idx}`} className="flex items-center gap-2 bg-neutral-900 border border-neutral-800 p-2 rounded-xl text-xs text-neutral-200">
                    <Check className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                    <span>{typeof item === 'string' ? item : item.text}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {generatedPlan.notes && (
            <div className="bg-rose-950/30 border border-rose-500/20 p-3 rounded-xl text-xs text-rose-200 font-serif italic">
              💡 {generatedPlan.notes}
            </div>
          )}

          <div className="pt-2 flex justify-end">
            <button
              type="button"
              onClick={handleSaveToPlanner}
              className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                savedSuccess
                  ? 'bg-emerald-600 text-white'
                  : 'bg-rose-600 hover:bg-rose-500 text-white shadow-md shadow-rose-950/40'
              }`}
            >
              {savedSuccess ? (
                <>
                  <Check className="w-4 h-4" /> Added to Date Planner!
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" /> Save Itinerary to Date Planner
                </>
              )}
            </button>
          </div>
        </motion.div>
      )}
    </div>
  );
};
