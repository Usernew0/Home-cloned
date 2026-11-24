import React from "react";
import { Heart, CheckCircle2, Sparkles, Clock, RefreshCw, Unlink } from "lucide-react";
import type { CoupleTenant, SubscriptionPlan } from "../types";

type Props = {
  tenant: CoupleTenant & { isFromDatabase?: boolean };
  /** True when no loaded account currently points at this space. It says nothing about stored data. */
  unlinkedSpace: boolean;
  isSyncing: boolean;
  subscriptionPlans: SubscriptionPlan[];
  getStatus: (t: any) => { isExpired: boolean; isLifetime: boolean; statusText: string; formattedEndDate: string };
  onSetPlan: (t: CoupleTenant, plan: string) => void;
  onUnlink: (t: CoupleTenant) => void;
  onSaveToDb: (t: CoupleTenant) => void;
};

export function CoupleTenantRow({ tenant, unlinkedSpace, isSyncing, subscriptionPlans, getStatus, onSetPlan, onUnlink, onSaveToDb }: Props) {
  return (
                  <div data-unlinked-space={unlinkedSpace ? "true" : undefined} data-testid="tenant-row" className={`p-4 bg-neutral-950/50 border border-white/10 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-white/20 transition-all shadow-md`}>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-xs sm:text-sm font-bold text-white font-serif flex items-center gap-1.5">
                          <Heart className="w-3.5 h-3.5 text-rose-400 fill-rose-400/40" />
                          <span>{tenant.coupleName}</span>
                        </h4>

                        {/* Plan select dropdown */}
                        <select value={tenant.plan || "free"} onChange={(e) => onSetPlan(tenant, e.target.value)} disabled={isSyncing} className="text-[9px] font-mono font-bold uppercase px-2 py-0.5 rounded-md border bg-neutral-900 text-rose-300 border-rose-500/40 cursor-pointer focus:outline-none focus:border-rose-400" title="Select subscription plan for this couple workspace">
                          {subscriptionPlans.map((p, idx) => (
                            <option key={`tenant-plan-${p.id}-${idx}`} value={p.id} className="bg-neutral-900 text-white">
                              {p.name.toUpperCase()} ({p.price})
                            </option>
                          ))}
                        </select>

                        {/* Database Sync Status Badge */}
                        {tenant.isFromDatabase ? (
                          <span className="text-[9px] font-mono uppercase bg-emerald-500/15 text-emerald-300 px-1.5 py-0.5 rounded border border-emerald-500/30 flex items-center gap-1">
                            <CheckCircle2 className="w-2.5 h-2.5" />
                            <span>DB Synced</span>
                          </span>
                        ) : (
                          <span className="text-[9px] font-mono uppercase bg-amber-500/15 text-amber-300 px-1.5 py-0.5 rounded border border-amber-500/30 flex items-center gap-1">
                            <Sparkles className="w-2.5 h-2.5 text-amber-400" />
                            <span>Auto-Linked</span>
                          </span>
                        )}

                        {unlinkedSpace && (
                          <span className="text-[9px] font-mono uppercase bg-sky-500/10 text-sky-300 px-1.5 py-0.5 rounded border border-sky-500/30" title="No user account currently points at this space. This does not show whether the space holds data. The record is kept as is.">
                            No accounts currently linked
                          </span>
                        )}

                        {/* Real Subscription Expiration Badge */}
                        {(() => {
                          const subStatus = getStatus(tenant);
                          return (
                            <span className={`text-[9px] font-mono px-2 py-0.5 rounded border flex items-center gap-1 ${subStatus.isExpired ? "bg-rose-500/20 text-rose-300 border-rose-500/40" : subStatus.isLifetime ? "bg-cyan-500/15 text-cyan-300 border-cyan-500/30" : "bg-amber-500/15 text-amber-300 border-amber-500/30"}`}>
                              <Clock className="w-2.5 h-2.5" />
                              <span>
                                {subStatus.statusText} ({subStatus.formattedEndDate})
                              </span>
                            </span>
                          );
                        })()}
                      </div>

                      <p className="text-[11px] text-neutral-400 font-mono mt-1 flex items-center gap-2 flex-wrap">
                        <span>
                          Partners: <strong className="text-rose-200 capitalize">{tenant.partner1}</strong>{" "}
                          {tenant.partner2 ? (
                            <>
                              and <strong className="text-rose-200 capitalize">{tenant.partner2}</strong>
                            </>
                          ) : (
                            "(Single)"
                          )}
                        </span>
                        <span>•</span>
                        <span className="text-neutral-500 font-mono">
                          Space ID: <code className="text-neutral-300 bg-neutral-900 px-1 rounded">{tenant.coupleId}</code>
                        </span>
                      </p>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-center">
                      {!tenant.isFromDatabase && (
                        <button
                          type="button"
                          onClick={() => onSaveToDb(tenant)}
                          disabled={isSyncing}
                          className="text-[11px] text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 px-2.5 py-1 rounded-xl transition-all flex items-center gap-1 cursor-pointer"
                          title="Persist this auto-detected couple tenant to database"
                        >
                          <RefreshCw className="w-3 h-3" />
                          <span>Save to DB</span>
                        </button>
                      )}

                                            <button type="button" onClick={() => onUnlink(tenant)} disabled={isSyncing || unlinkedSpace} title={unlinkedSpace ? "No account is linked to this space, so there is nothing to unlink. This button does not delete spaces." : "Unlink these partners"} className="text-[11px] text-rose-400 hover:text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 px-2.5 py-1 rounded-xl transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50">
                        <Unlink className="w-3 h-3" />
                        <span>Unlink</span>
                      </button>
                    </div>
                  </div>
  );
}
