import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Sparkles, Check, Crown, Shield, Zap, CreditCard, X, ArrowRight, Lock, CheckCircle2, Ticket, Tag, AlertCircle } from 'lucide-react';
import { SubscriptionPlan, PromoCode, DEFAULT_PROMO_CODES, AdminSetting } from '../types';
import { saveAdminSettingDoc } from '../lib/supabaseService';
import { authHeaders } from '../lib/authHeaders';

interface SubscriptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentPlan: string;
  memoriesCount: number;
  onUpgradeSuccess: (newPlan: string) => void;
  subscriptionPlans?: SubscriptionPlan[];
  adminSettings?: AdminSetting[];
  promoCodes?: PromoCode[];
  lockedTabLabel?: string;
  quotaReason?: string;
}

export const SubscriptionModal: React.FC<SubscriptionModalProps> = ({
  isOpen,
  onClose,
  currentPlan,
  memoriesCount,
  onUpgradeSuccess,
  subscriptionPlans = [],
  adminSettings = [],
  promoCodes: passedPromoCodes,
  lockedTabLabel,
  quotaReason
}) => {
  const rawPlans = (subscriptionPlans && subscriptionPlans.length > 0)
    ? subscriptionPlans
    : (adminSettings.find(s => s.id === 'subscriptionPlans')?.subscriptionPlans || []);

  const plansToDisplay = React.useMemo(() => {
    const seen = new Set<string>();
    return rawPlans.filter(p => {
      if (!p || !p.id || seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    });
  }, [rawPlans]);

  const activePromoCodes = passedPromoCodes || adminSettings.find(s => s.id === 'promoCodes')?.promoCodes || DEFAULT_PROMO_CODES;

  const [selectedPlanId, setSelectedPlanId] = useState<string>(() => {
    const nonCurrent = plansToDisplay.find(p => p.id !== currentPlan);
    return nonCurrent ? nonCurrent.id : (plansToDisplay[0]?.id || 'free');
  });

  const [promoCodeInput, setPromoCodeInput] = useState('');
  const [appliedPromo, setAppliedPromo] = useState<PromoCode | null>(null);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showCardInput, setShowCardInput] = useState(false);
  const [cardNumber, setCardNumber] = useState('4242 •••• •••• 4242');
  const [expiry, setExpiry] = useState('12/28');
  const [cvc, setCvc] = useState('888');
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleApplyPromo = () => {
    setPromoError(null);
    const codeClean = promoCodeInput.trim().toUpperCase();
    if (!codeClean) {
      setPromoError("Please enter a promo code.");
      setAppliedPromo(null);
      return;
    }

    const matched = activePromoCodes.find(p => p.code.toUpperCase() === codeClean);
    if (!matched) {
      setPromoError("Invalid code. Try 'LOVE50' or 'PROMO50' for discounts!");
      setAppliedPromo(null);
      return;
    }

    if (!matched.isActive) {
      setPromoError("This promo code is currently inactive.");
      setAppliedPromo(null);
      return;
    }

    if (matched.expiresAt) {
      const expDate = new Date(matched.expiresAt);
      if (!isNaN(expDate.getTime()) && expDate < new Date()) {
        setPromoError("This promo code has expired.");
        setAppliedPromo(null);
        return;
      }
    }

    if (matched.maxUses !== undefined && matched.maxUses !== -1) {
      if ((matched.timesUsed || 0) >= matched.maxUses) {
        setPromoError("This promo code has reached its maximum redemption limit.");
        setAppliedPromo(null);
        return;
      }
    }

    const appPlans = matched.applicablePlanIds || ['all'];
    if (!appPlans.includes('all') && !appPlans.includes(selectedPlanId)) {
      setPromoError(`This promo code applies only to selected tiers (${appPlans.join(', ')}).`);
      setAppliedPromo(null);
      return;
    }

    setAppliedPromo(matched);
    setPromoError(null);
  };

  const selectedPlanObj = plansToDisplay.find(p => p.id === selectedPlanId) || plansToDisplay[0];

  const handleSimulateStripeCheckout = async (targetPlanId: string) => {
    const targetPlan = plansToDisplay.find(p => p.id === targetPlanId) || selectedPlanObj;
    setIsProcessing(true);

    // If promo applied, increment timesUsed and persist
    if (appliedPromo) {
      try {
        const updatedList = activePromoCodes.map(p => {
          if (p.id === appliedPromo.id || p.code === appliedPromo.code) {
            return { ...p, timesUsed: (p.timesUsed || 0) + 1 };
          }
          return p;
        });
        await saveAdminSettingDoc({ id: 'promoCodes', promoCodes: updatedList });
      } catch (err) {
        console.warn("Error updating promo code usage count:", err);
      }
    }

    try {
      const response = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          planId: targetPlan.id,
          planName: targetPlan.name,
          promoCode: appliedPromo ? appliedPromo.code : undefined,
          email: 'couple@ourhome.app'
        })
      });
      const data = await response.json().catch(() => ({ success: false }));
      // Fail closed: only a verified successful checkout may activate a plan.
      if (!response.ok || !data.success || data.status !== 'complete') {
        setIsProcessing(false);
        setSuccessMessage(null);
        setCheckoutError(data.error || 'Payment is not available right now. Your plan was not changed.');
        return;
      }
      setCheckoutError(null);
      setIsProcessing(false);
      setSuccessMessage(`${targetPlan.name} activated.`);
      onUpgradeSuccess(targetPlan.id);
      setTimeout(() => {
        setSuccessMessage(null);
        onClose();
      }, 2200);
    } catch (err) {
      setIsProcessing(false);
      setSuccessMessage(null);
      setCheckoutError('Could not reach the payment service. Your plan was not changed.');
    }
  };

  const getBadgeStyle = (color?: string) => {
    switch (color?.toLowerCase()) {
      case 'emerald':
      case 'green':
        return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
      case 'amber':
      case 'gold':
      case 'yellow':
        return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
      case 'purple':
      case 'violet':
        return 'bg-purple-500/20 text-purple-300 border-purple-500/40';
      case 'blue':
      case 'cyan':
        return 'bg-blue-500/20 text-blue-300 border-blue-500/40';
      case 'pink':
      case 'rose':
      default:
        return 'bg-rose-500/20 text-rose-300 border-rose-500/40';
    }
  };

  const calculateDisplayPrice = (planPrice: string, planId: string) => {
    if (!appliedPromo) return planPrice;
    if (planPrice.includes('$0') || planPrice.toLowerCase().includes('free')) return planPrice;

    const appPlans = appliedPromo.applicablePlanIds || ['all'];
    if (!appPlans.includes('all') && !appPlans.includes(planId)) return planPrice;

    const match = planPrice.match(/[\d\.]+/);
    if (!match) return `${planPrice} (${appliedPromo.code} Applied!)`;

    const numericVal = parseFloat(match[0]);
    if (isNaN(numericVal)) return `${planPrice} (${appliedPromo.code} Applied!)`;

    let discountedVal = numericVal;
    if (appliedPromo.discountType === 'percentage') {
      discountedVal = Math.max(0, numericVal * (1 - (appliedPromo.discountValue / 100)));
    } else {
      discountedVal = Math.max(0, numericVal - appliedPromo.discountValue);
    }

    const formattedPrice = `$${discountedVal.toFixed(2)}`;
    const period = planPrice.includes('/year') ? '/year' : '/month';

    return (
      <span className="inline-flex items-center gap-1.5 flex-wrap">
        <span className="line-through text-neutral-500 text-xs">{planPrice}</span>
        <span className="text-amber-300 font-bold">{formattedPrice}{period}</span>
        <span className="text-[10px] text-emerald-300 font-mono font-bold bg-emerald-500/20 border border-emerald-500/30 px-1.5 py-0.5 rounded">
          {appliedPromo.discountType === 'percentage' ? `${appliedPromo.discountValue}% OFF` : `$${appliedPromo.discountValue} OFF`}
        </span>
      </span>
    );
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md overflow-y-auto"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-neutral-900 border border-rose-500/30 rounded-3xl p-6 sm:p-8 max-w-4xl w-full text-white shadow-2xl relative overflow-hidden my-8"
      >
        {/* Glow Effects */}
        <div className="absolute top-0 right-0 w-80 h-80 bg-rose-500/10 rounded-full blur-[100px] pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-60 h-60 bg-purple-500/10 rounded-full blur-[80px] pointer-events-none" />

        {/* Top Header Close Button */}
        <button
          onClick={onClose}
          aria-label="Close subscription popup"
          className="absolute top-5 right-5 p-2 text-neutral-400 hover:text-white bg-neutral-800/80 hover:bg-rose-600/30 border border-white/10 hover:border-rose-500/40 rounded-full transition-all cursor-pointer z-20 shadow-md"
        >
          <X className="w-5 h-5" />
        </button>

        {checkoutError && (
          <div role="alert" className="mx-6 mt-4 p-3 rounded-xl border border-rose-500/40 bg-rose-500/10 text-rose-200 text-sm">{checkoutError}</div>
        )}
        {successMessage ? (
          <div className="py-12 text-center space-y-4">
            <div className="w-16 h-16 bg-rose-500/20 text-rose-400 rounded-full flex items-center justify-center mx-auto border border-rose-500/40 animate-bounce">
              <Crown className="w-8 h-8 fill-rose-400" />
            </div>
            <h3 className="text-2xl font-serif font-bold text-rose-200">Membership Upgraded 💕</h3>
            <p className="text-neutral-300 max-w-md mx-auto">{successMessage}</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Enhanced Header Banner */}
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-rose-950/60 via-purple-950/40 to-rose-950/60 border border-rose-500/30 p-6 sm:p-7 text-center space-y-3 shadow-inner">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(244,63,94,0.15),transparent_50%)] pointer-events-none" />
              
              <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-semibold uppercase tracking-wider shadow-sm">
                <Crown className="w-4 h-4 text-rose-400 fill-rose-400" />
                <span>Couple Workspace Membership Tiers</span>
              </div>

              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-serif font-bold tracking-tight text-white drop-shadow-sm">
                Choose Your Membership Plan
              </h2>

              <p className="text-neutral-300 text-sm max-w-xl mx-auto leading-relaxed">
                Unlock exclusive romantic features, unlimited memory scrapbooks, custom date planners, and seamless partner synchronization.
              </p>
            </div>

            {/* Locked Tab or Quota Reason Alert */}
            {(lockedTabLabel || quotaReason) && (
              <div className="p-4 bg-amber-500/15 border border-amber-500/40 rounded-2xl flex items-center gap-3 text-amber-200 text-xs shadow-lg">
                <div className="p-2 bg-amber-500/20 rounded-xl text-amber-400 shrink-0">
                  <Lock className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-bold text-amber-300 text-sm">
                    {lockedTabLabel ? `Feature Restricted (${lockedTabLabel})` : 'Subscription Limit Reached'}
                  </div>
                  <p className="mt-0.5 text-neutral-300">
                    {quotaReason || `Upgrade your subscription tier to unlock ${lockedTabLabel || 'this feature'} and eliminate workspace limits.`}
                  </p>
                </div>
              </div>
            )}

            {/* Current Scrapbook Memory Usage Meter */}
            <div className="bg-neutral-950/60 border border-neutral-800 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="space-y-1 text-center sm:text-left">
                <div className="text-xs text-neutral-400 uppercase tracking-wider font-semibold">Current Scrapbook Memory Storage</div>
                <div className="text-sm font-medium text-neutral-200">
                  Total Saved Memories: <span className="text-rose-400 font-bold">{memoriesCount}</span>
                </div>
              </div>
              <div className="text-xs text-neutral-400 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-400" />
                <span>Unlimited storage available on higher plans!</span>
              </div>
            </div>

            {/* Dynamic Subscription Plans Grid */}
            <div className={`grid grid-cols-1 ${plansToDisplay.length > 2 ? 'lg:grid-cols-3' : 'md:grid-cols-2'} gap-4 w-full`}>
              {plansToDisplay.map((plan, idx) => {
                const isCurrent = currentPlan === plan.id;
                const isSelected = selectedPlanId === plan.id;
                const badgeClass = getBadgeStyle(plan.badgeColor);
                
                const ALL_FEATURE_TABS = [
                  { id: 'dashboard', name: 'Home Landing' },
                  { id: 'choose', name: 'Daily Card Picker' },
                  { id: 'milestones', name: 'Milestone Events' },
                  { id: 'planner', name: 'Date Night Planner' },
                  { id: 'album', name: 'Scrapbook Memory Roll' },
                  { id: 'gallery', name: 'Media Gallery' },
                  { id: 'letters', name: 'Digital Love Letters' },
                  { id: 'chat', name: 'Couple Real-Time Chat' },
                  { id: 'questions', name: 'Romantic Questionnaires' },
                  { id: 'animation', name: 'Interactive Romantic Canvas' }
                ];

                return (
                  <div
                    key={`subscription-plan-${plan.id}-${idx}`}
                    onClick={() => {
                      if (!isCurrent) setSelectedPlanId(plan.id);
                    }}
                    className={`border-2 rounded-2xl p-5 flex flex-col justify-between transition-all relative cursor-pointer ${
                      isCurrent
                        ? 'bg-neutral-950/90 border-neutral-700 opacity-90'
                        : isSelected
                        ? 'bg-gradient-to-b from-rose-950/40 via-neutral-950 to-neutral-950 border-rose-500 shadow-xl shadow-rose-950/40 scale-[1.01]'
                        : 'bg-neutral-950/50 border-neutral-800 hover:border-neutral-700 hover:bg-neutral-950'
                    }`}
                  >
                    {/* Top Badge & Status */}
                    <div className="flex items-center justify-between mb-3 flex-wrap gap-1.5">
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${badgeClass}`}>
                        {plan.badgeColor || 'Plan'}
                      </span>
                      {isCurrent ? (
                        <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-500/40 font-bold uppercase flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3 text-emerald-400" /> Active Plan
                        </span>
                      ) : (
                        plan.isDefault && (
                          <span className="text-[10px] bg-neutral-800 text-neutral-400 px-2 py-0.5 rounded-full border border-neutral-700 font-bold uppercase">
                            Default Tier
                          </span>
                        )
                      )}
                    </div>

                    <div className="space-y-3">
                      <div>
                        <h3 className="font-bold text-lg text-white flex items-center gap-2">
                          {plan.name}
                        </h3>
                        <p className="text-xs text-neutral-400 mt-1">
                          {plan.description || 'Standard romantic features.'}
                        </p>
                      </div>

                      {/* Pricing & Duration Details */}
                      <div className="space-y-1">
                        <div className="text-2xl font-bold font-serif text-rose-200">
                          {calculateDisplayPrice(plan.price, plan.id)}
                          <span className="text-xs font-normal text-neutral-400 ml-1">
                            {plan.durationDays === -1 || !plan.durationDays ? '/ Lifetime' : `/ ${plan.durationDays} days`}
                          </span>
                        </div>
                        <div className="text-[11px] text-neutral-400 font-mono">
                          Billing Cycle: <span className="text-neutral-200 uppercase font-semibold">{plan.billingCycle || (plan.durationDays === -1 ? 'Lifetime' : 'Custom')}</span>
                          {plan.durationDays && plan.durationDays !== -1 ? ` (${plan.durationDays} days access)` : ' (Permanent No Expiry)'}
                        </div>
                      </div>

                      {/* Full All Feature Tabs & Limits Breakdown */}
                      <div className="border-t border-neutral-800/80 pt-3 space-y-1.5 text-xs">
                        <div className="text-[10px] uppercase font-mono font-bold text-neutral-400 tracking-wider mb-2">
                          Plan Feature Limits Breakdown:
                        </div>

                        {ALL_FEATURE_TABS.map((tab, idx) => {
                          const limitObj = plan.tabLimits?.[tab.id];
                          const isLocked = limitObj?.isLocked ?? false;
                          const maxLimit = limitObj?.maxLimit ?? -1;

                          return (
                            <div key={`plan-${plan.id}-tab-${tab.id}-${idx}`} className="flex items-center justify-between text-[11px] py-0.5">
                              <div className="flex items-center gap-1.5 text-neutral-300">
                                {isLocked ? (
                                  <Lock className="w-3 h-3 text-rose-400 shrink-0" />
                                ) : maxLimit === -1 ? (
                                  <Sparkles className="w-3 h-3 text-amber-400 shrink-0" />
                                ) : (
                                  <Check className="w-3 h-3 text-emerald-400 shrink-0" />
                                )}
                                <span className={isLocked ? 'text-neutral-500 line-through' : 'text-neutral-200 font-medium'}>
                                  {tab.name}
                                </span>
                              </div>

                              <div>
                                {isLocked ? (
                                  <span className="text-[10px] font-mono font-bold text-rose-400 bg-rose-500/10 border border-rose-500/20 px-1.5 py-0.2 rounded">
                                    Locked
                                  </span>
                                ) : maxLimit === -1 ? (
                                  <span className="text-[10px] font-mono font-bold text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.2 rounded">
                                    Unlimited
                                  </span>
                                ) : (
                                  <span className="text-[10px] font-mono text-amber-300 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.2 rounded">
                                    Max {maxLimit}
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="mt-5 pt-3 border-t border-neutral-800/60">
                      {isCurrent ? (
                        <button
                          disabled
                          className="w-full py-2 bg-neutral-800 text-neutral-400 rounded-xl text-xs font-bold cursor-default"
                        >
                          Currently Active
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedPlanId(plan.id);
                            setShowCardInput(true);
                          }}
                          className={`w-full py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                            isSelected
                              ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-950/50'
                              : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-200'
                          }`}
                        >
                          <Crown className="w-3.5 h-3.5" />
                          Select {plan.name}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Promo Code Input */}
            <div className="space-y-2 max-w-md mx-auto">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type="text"
                    placeholder="Promo Code (e.g. LOVE50, PROMO50)"
                    value={promoCodeInput}
                    onChange={(e) => {
                      setPromoCodeInput(e.target.value.toUpperCase());
                      setPromoError(null);
                    }}
                    className="w-full bg-neutral-950 border border-neutral-800 focus:border-rose-500 rounded-xl px-3 py-2 text-xs font-mono uppercase text-white focus:outline-none placeholder:text-neutral-600"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleApplyPromo}
                  className="px-4 py-2 bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white text-xs font-semibold rounded-xl transition-all cursor-pointer shrink-0 shadow-md"
                >
                  Apply Code
                </button>
              </div>

              {promoError && (
                <div className="text-xs text-rose-400 font-medium flex items-center justify-center gap-1.5 bg-rose-500/10 border border-rose-500/20 p-2 rounded-xl">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{promoError}</span>
                </div>
              )}

              {appliedPromo && (
                <div className="text-xs text-emerald-300 font-semibold flex items-center justify-center gap-1.5 bg-emerald-500/15 border border-emerald-500/30 p-2 rounded-xl">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>
                    🎉 Code <strong>{appliedPromo.code}</strong> Applied! ({appliedPromo.discountType === 'percentage' ? `${appliedPromo.discountValue}% Discount` : `$${appliedPromo.discountValue} Off`})
                  </span>
                </div>
              )}
            </div>

            {/* Payment Section */}
            {selectedPlanObj && selectedPlanObj.id !== currentPlan && (
              <div className="bg-neutral-950 border border-neutral-800 rounded-2xl p-5 space-y-4 max-w-xl mx-auto">
                <div className="flex justify-between items-center text-xs font-semibold text-neutral-300">
                  <span className="flex items-center gap-1.5">
                    <CreditCard className="w-4 h-4 text-rose-400" />
                    Upgrading to <strong className="text-white">{selectedPlanObj.name}</strong> ({selectedPlanObj.price})
                  </span>
                  <span className="text-[10px] text-emerald-400">256-Bit Encrypted</span>
                </div>

                {showCardInput ? (
                  <div className="space-y-3 pt-1">
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={cardNumber}
                        onChange={(e) => setCardNumber(e.target.value)}
                        className="w-full bg-neutral-900 border border-neutral-700 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-rose-500"
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="text"
                          value={expiry}
                          onChange={(e) => setExpiry(e.target.value)}
                          className="bg-neutral-900 border border-neutral-700 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-rose-500"
                        />
                        <input
                          type="text"
                          value={cvc}
                          onChange={(e) => setCvc(e.target.value)}
                          className="bg-neutral-900 border border-neutral-700 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-rose-500"
                        />
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleSimulateStripeCheckout(selectedPlanObj.id)}
                      disabled={isProcessing}
                      className="w-full py-3 bg-gradient-to-r from-rose-600 to-purple-600 hover:from-rose-500 hover:to-purple-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-rose-950/50 flex items-center justify-center gap-2 cursor-pointer"
                    >
                      {isProcessing ? 'Processing Upgrade...' : `Confirm & Activate ${selectedPlanObj.name}`}
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowCardInput(true)}
                    className="w-full py-3 bg-gradient-to-r from-rose-600 to-purple-600 hover:from-rose-500 hover:to-purple-500 text-white rounded-xl text-sm font-bold transition-all shadow-lg shadow-rose-950/50 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Crown className="w-4 h-4 fill-white" />
                    Upgrade to {selectedPlanObj.name} ({selectedPlanObj.price})
                  </button>
                )}
              </div>
            )}

            <div className="flex items-center justify-center gap-4 text-[10px] text-neutral-400">
              <span className="flex items-center gap-1"><Shield className="w-3 h-3 text-rose-400" /> Cancel Anytime</span>
              <span className="flex items-center gap-1"><Zap className="w-3 h-3 text-rose-400" /> Instant Activation</span>
              <span className="flex items-center gap-1"><CreditCard className="w-3 h-3 text-rose-400" /> Powered by Stripe</span>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
};

export default SubscriptionModal;

