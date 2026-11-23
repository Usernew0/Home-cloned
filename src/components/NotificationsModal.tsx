import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Bell, 
  X, 
  CheckCheck, 
  Trash2, 
  MessageSquareHeart, 
  Mail, 
  Calendar, 
  Gift, 
  HelpCircle, 
  Heart, 
  UserPlus, 
  Sparkles, 
  ChevronRight,
  Filter,
  CheckCircle2,
  Info
} from 'lucide-react';
import { 
  ChatMessage, 
  LoveLetter, 
  DatePlan, 
  Milestone, 
  CoupleQuestion, 
  UserAccount, 
  CoupleTenant, 
  UserActivityLog 
} from '../types';

export interface AppNotification {
  id: string;
  type: 'chat' | 'letter' | 'planner' | 'milestone' | 'question' | 'invite' | 'system';
  title: string;
  message: string;
  timestamp: string;
  rawDate: Date;
  sender?: string;
  isRead: boolean;
  targetTab?: string;
  actionLabel?: string;
}

interface NotificationsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: string;
  coupleTenant: CoupleTenant;
  chatMessages: ChatMessage[];
  letters: LoveLetter[];
  datePlans: DatePlan[];
  milestones: Milestone[];
  coupleQuestions: CoupleQuestion[];
  userAccounts: UserAccount[];
  activityLogs: UserActivityLog[];
  onNavigateToTab: (tabId: string) => void;
  readNotificationIds: string[];
  clearedNotificationIds: string[];
  onMarkAsRead: (id: string) => void;
  onMarkAllAsRead: (ids: string[]) => void;
  onClearAllNotifications: (ids: string[]) => void;
}

export const NotificationsModal: React.FC<NotificationsModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  coupleTenant,
  chatMessages,
  letters,
  datePlans,
  milestones,
  coupleQuestions,
  userAccounts,
  activityLogs,
  onNavigateToTab,
  readNotificationIds,
  clearedNotificationIds,
  onMarkAsRead,
  onMarkAllAsRead,
  onClearAllNotifications
}) => {
  const [filterType, setFilterType] = useState<'all' | 'unread' | 'chat' | 'letters' | 'activities'>('all');

  const cleanUser = currentUser.toLowerCase().trim();

  // Aggregate all notifications strictly scoped to current user and active couple ID
  const allNotifications = useMemo<AppNotification[]>(() => {
    const list: AppNotification[] = [];
    const currentCoupleId = (coupleTenant.coupleId || '').trim();

    // Helper to check if an item belongs to current couple space
    const isSameCoupleSpace = (itemCoupleId?: string) => {
      if (!itemCoupleId || !itemCoupleId.trim()) return true; // fallback if untagged
      if (!currentCoupleId) return true;
      return itemCoupleId.trim() === currentCoupleId;
    };

    // 1. Unread & Recent Chat Messages from partner in this couple space
    if (Array.isArray(chatMessages)) {
      chatMessages.forEach(msg => {
        if (!msg) return;
        if (!isSameCoupleSpace(msg.coupleId)) return;

        const sender = msg.sender?.trim() || 'Partner';
        if (sender.toLowerCase() !== cleanUser) {
          const msgDate = new Date(msg.timestamp || Date.now());
          const isRead = msg.seen || readNotificationIds.includes(`msg_${msg.id}`);
          
          list.push({
            id: `msg_${msg.id}`,
            type: 'chat',
            title: `New Message from ${sender}`,
            message: msg.content.length > 80 ? `${msg.content.substring(0, 80)}...` : msg.content,
            timestamp: msgDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' }),
            rawDate: msgDate,
            sender,
            isRead,
            targetTab: 'chat',
            actionLabel: 'Open Sweet Chat'
          });
        }
      });
    }

    // 2. Love Letters for the couple / user in this couple space
    if (Array.isArray(letters)) {
      letters.forEach(letter => {
        if (!letter) return;
        if (!isSameCoupleSpace(letter.coupleId)) return;

        const sender = letter.sender || 'Partner';
        const recipient = letter.recipient || '';
        if (sender.toLowerCase() !== cleanUser || recipient.toLowerCase() === cleanUser) {
          const letterDate = new Date(letter.date || Date.now());
          const isRead = letter.isOpened || readNotificationIds.includes(`letter_${letter.id}`);

          list.push({
            id: `letter_${letter.id}`,
            type: 'letter',
            title: `💌 Love Letter from ${sender}`,
            message: `Subject: "${letter.subject || 'Sweet Note'}"`,
            timestamp: letterDate.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }),
            rawDate: letterDate,
            sender,
            isRead,
            targetTab: 'letters',
            actionLabel: 'Read Love Letter'
          });
        }
      });
    }

    // 3. Date Plans created in this couple space
    if (Array.isArray(datePlans)) {
      datePlans.forEach(plan => {
        if (!plan) return;
        if (!isSameCoupleSpace(plan.coupleId)) return;

        const creator = plan.createdBy || 'Partner';
        if (creator.toLowerCase() !== cleanUser) {
          const planDate = new Date(plan.dateTime || Date.now());
          const isRead = readNotificationIds.includes(`plan_${plan.id}`);

          list.push({
            id: `plan_${plan.id}`,
            type: 'planner',
            title: `🌹 Date Plan: ${plan.title}`,
            message: `Scheduled for ${planDate.toLocaleDateString([], { month: 'short', day: 'numeric' })} at ${plan.location || 'Romantic Spot'}`,
            timestamp: planDate.toLocaleDateString([], { month: 'short', day: 'numeric' }),
            rawDate: planDate,
            sender: creator,
            isRead,
            targetTab: 'planner',
            actionLabel: 'View Date Plan'
          });
        }
      });
    }

    // 4. Milestones in this couple space
    if (Array.isArray(milestones)) {
      milestones.forEach(m => {
        if (!m) return;
        if (!isSameCoupleSpace(m.coupleId)) return;

        const creator = m.createdBy || 'Partner';
        if (creator.toLowerCase() !== cleanUser) {
          const mDate = new Date(m.date || Date.now());
          const isRead = readNotificationIds.includes(`milestone_${m.id}`);

          list.push({
            id: `milestone_${m.id}`,
            type: 'milestone',
            title: `🎁 New Milestone: ${m.title}`,
            message: m.description ? (m.description.length > 70 ? `${m.description.substring(0, 70)}...` : m.description) : 'A romantic memory added to your story timeline.',
            timestamp: mDate.toLocaleDateString([], { month: 'short', day: 'numeric' }),
            rawDate: mDate,
            sender: creator,
            isRead,
            targetTab: 'milestones',
            actionLabel: 'View Story Milestone'
          });
        }
      });
    }

    // 5. Couple Questions answered by partner in this couple space
    if (Array.isArray(coupleQuestions)) {
      coupleQuestions.forEach(q => {
        if (!q || !Array.isArray(q.answers)) return;
        if (!isSameCoupleSpace(q.coupleId)) return;

        q.answers.forEach(ans => {
          if (ans.username && ans.username.toLowerCase() !== cleanUser) {
            const ansDate = new Date(ans.timestamp || Date.now());
            const isRead = readNotificationIds.includes(`q_ans_${q.id}_${ans.username}`);

            list.push({
              id: `q_ans_${q.id}_${ans.username}`,
              type: 'question',
              title: `❓ ${ans.username} answered a couple question!`,
              message: `Q: "${q.text.substring(0, 50)}..." -> "${ans.answerText.substring(0, 50)}..."`,
              timestamp: ansDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' }),
              rawDate: ansDate,
              sender: ans.username,
              isRead,
              targetTab: 'questions',
              actionLabel: 'See Q&A Answer'
            });
          }
        });
      });
    }

    // 6. Partner Space Invitations & Activity Logs strictly for this user / couple space
    if (Array.isArray(activityLogs)) {
      activityLogs.forEach(log => {
        if (!log) return;
        if (!isSameCoupleSpace(log.coupleId)) return;

        const isTargeted = log.details?.toLowerCase().includes(cleanUser) || 
                           log.action === 'partner_invite_sent' || 
                           log.action === 'profile_updated';
        if (isTargeted && log.username?.toLowerCase() !== cleanUser) {
          const logDate = new Date(log.timestamp || Date.now());
          const isRead = readNotificationIds.includes(`log_${log.id}`);

          list.push({
            id: `log_${log.id}`,
            type: 'invite',
            title: `💖 Activity: ${log.username || 'Partner'}`,
            message: log.details || 'Updated couple space relationship settings.',
            timestamp: logDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' }),
            rawDate: logDate,
            sender: log.username,
            isRead,
            targetTab: 'dashboard',
            actionLabel: 'View Activity'
          });
        }
      });
    }

    // Deduplicate by unique id and filter out cleared items
    const seenIds = new Set<string>();
    const uncleared: AppNotification[] = [];
    list.forEach(n => {
      if (!n || !n.id) return;
      if (seenIds.has(n.id)) return;
      if (clearedNotificationIds.includes(n.id)) return;
      seenIds.add(n.id);
      uncleared.push(n);
    });

    // Sort by latest timestamp descending
    return uncleared.sort((a, b) => b.rawDate.getTime() - a.rawDate.getTime());
  }, [
    chatMessages, 
    letters, 
    datePlans, 
    milestones, 
    coupleQuestions, 
    activityLogs, 
    cleanUser, 
    coupleTenant.coupleId,
    readNotificationIds, 
    clearedNotificationIds
  ]);

  // Filtered list based on active pill
  const filteredNotifications = useMemo(() => {
    return allNotifications.filter(n => {
      if (filterType === 'unread') return !n.isRead;
      if (filterType === 'chat') return n.type === 'chat';
      if (filterType === 'letters') return n.type === 'letter';
      if (filterType === 'activities') return n.type === 'planner' || n.type === 'milestone' || n.type === 'question' || n.type === 'invite';
      return true;
    });
  }, [allNotifications, filterType]);

  const unreadCount = useMemo(() => {
    return allNotifications.filter(n => !n.isRead).length;
  }, [allNotifications]);

  // Tab counts for category filter tabs
  const tabCounts = useMemo(() => {
    return {
      all: allNotifications.length,
      unread: unreadCount,
      chat: allNotifications.filter(n => n.type === 'chat').length,
      letters: allNotifications.filter(n => n.type === 'letter').length,
      activities: allNotifications.filter(n => n.type === 'planner' || n.type === 'milestone' || n.type === 'question' || n.type === 'invite').length
    };
  }, [allNotifications, unreadCount]);

  if (!isOpen) return null;

  const FILTER_TABS = [
    { id: 'all', label: 'All', icon: Sparkles, count: tabCounts.all },
    { id: 'unread', label: 'Unread', icon: Bell, count: tabCounts.unread },
    { id: 'chat', label: 'Chat', icon: MessageSquareHeart, count: tabCounts.chat },
    { id: 'letters', label: 'Letters', icon: Mail, count: tabCounts.letters },
    { id: 'activities', label: 'Activities', icon: Calendar, count: tabCounts.activities },
  ];

  const getNotificationIcon = (type: AppNotification['type']) => {
    switch (type) {
      case 'chat':
        return <MessageSquareHeart className="w-4 h-4 text-rose-400" />;
      case 'letter':
        return <Mail className="w-4 h-4 text-purple-400" />;
      case 'planner':
        return <Calendar className="w-4 h-4 text-amber-400" />;
      case 'milestone':
        return <Gift className="w-4 h-4 text-pink-400" />;
      case 'question':
        return <HelpCircle className="w-4 h-4 text-blue-400" />;
      case 'invite':
        return <UserPlus className="w-4 h-4 text-emerald-400" />;
      default:
        return <Sparkles className="w-4 h-4 text-rose-400" />;
    }
  };

  const handleNotificationClick = (item: AppNotification) => {
    if (!item.isRead) {
      onMarkAsRead(item.id);
    }
    if (item.targetTab) {
      onNavigateToTab(item.targetTab);
      onClose();
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="relative w-full max-w-lg bg-neutral-900 border border-white/10 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
        >
          {/* Header */}
          <div className="relative p-5 sm:p-6 bg-gradient-to-r from-rose-950/70 via-purple-950/50 to-neutral-900 border-b border-white/10 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-rose-500 via-pink-500 to-amber-500 p-0.5 shadow-lg shadow-rose-950/50 flex items-center justify-center">
                <div className="w-full h-full bg-neutral-950 rounded-[14px] flex items-center justify-center">
                  <Bell className="w-5 h-5 text-rose-400 animate-pulse" />
                </div>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-white tracking-tight">
                    Notifications
                  </h2>
                  {unreadCount > 0 && (
                    <span className="text-xs font-bold font-mono px-2 py-0.5 rounded-full bg-rose-500 text-white shadow-md shadow-rose-950/50">
                      {unreadCount} new
                    </span>
                  )}
                </div>
                <p className="text-xs text-neutral-400">
                  Real-time activity & sweet updates from your partner
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-2 text-neutral-400 hover:text-white rounded-xl hover:bg-white/10 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Filter Pills & Actions Bar */}
          <div className="p-2.5 sm:p-3 sm:px-6 bg-neutral-950/80 border-b border-white/10 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
            <div className="grid grid-cols-5 gap-1 p-1 bg-neutral-900/90 rounded-2xl border border-white/10 shadow-inner w-full sm:w-auto">
              {FILTER_TABS.map((f, idx) => {
                const isActive = filterType === f.id;
                const IconComp = f.icon;
                return (
                  <button
                    key={`notif-filter-${f.id}-${idx}`}
                    onClick={() => setFilterType(f.id as any)}
                    className={`px-1 xs:px-2 sm:px-3 py-1.5 rounded-xl text-[10px] xs:text-[11px] sm:text-xs font-bold uppercase tracking-wider transition-all duration-200 cursor-pointer flex items-center justify-center gap-1 sm:gap-1.5 relative select-none min-w-0 ${
                      isActive
                        ? 'text-white font-extrabold'
                        : 'text-neutral-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    {isActive && (
                      <motion.div
                        layoutId="notifFilterPill"
                        className="absolute inset-0 bg-gradient-to-r from-rose-600 via-pink-600 to-rose-500 rounded-xl shadow-md shadow-rose-950/60 border border-rose-400/30 z-0"
                        transition={{ type: "spring", stiffness: 450, damping: 32 }}
                      />
                    )}
                    <IconComp className={`w-3 h-3 sm:w-3.5 sm:h-3.5 relative z-10 shrink-0 transition-transform ${isActive ? 'text-white scale-105' : 'text-neutral-400'}`} />
                    <span className="truncate relative z-10">{f.label}</span>
                    {f.count > 0 && (
                      <span className={`relative z-10 text-[9px] sm:text-[10px] font-mono font-bold px-1 sm:px-1.5 py-0.2 rounded-full min-w-[14px] sm:min-w-[18px] text-center shrink-0 ${
                        isActive
                          ? 'bg-white/20 text-white shadow-sm'
                          : 'bg-neutral-800 text-neutral-300 border border-white/5'
                      }`}>
                        {f.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-end gap-1.5 shrink-0">
              {unreadCount > 0 && (
                <button
                  onClick={() => onMarkAllAsRead(allNotifications.map(n => n.id))}
                  className="px-2.5 py-1.5 text-xs font-semibold text-rose-300 hover:text-white bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shadow-sm active:scale-95"
                  title="Mark all as read"
                >
                  <CheckCheck className="w-3.5 h-3.5 text-rose-400" />
                  <span>Read All</span>
                </button>
              )}

              {allNotifications.length > 0 && (
                <button
                  onClick={() => onClearAllNotifications(allNotifications.map(n => n.id))}
                  className="px-2.5 py-1.5 text-xs font-semibold text-neutral-400 hover:text-rose-400 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 active:scale-95"
                  title="Clear all notifications"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Clear</span>
                </button>
              )}
            </div>
          </div>

          {/* Notifications List */}
          <div className="p-4 sm:p-6 space-y-3 overflow-y-auto flex-1">
            {filteredNotifications.length === 0 ? (
              <div className="py-12 text-center space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto text-neutral-500">
                  <Bell className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-neutral-300">No Notifications</p>
                  <p className="text-xs text-neutral-500 max-w-xs mx-auto">
                    {filterType === 'unread' 
                      ? "You're all caught up! No unread notifications at the moment."
                      : "No activity notifications found in this category yet."}
                  </p>
                </div>
              </div>
            ) : (
              filteredNotifications.map((item, index) => (
                <motion.div
                  key={`notif-card-${item.id}-${index}`}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  onClick={() => handleNotificationClick(item)}
                  className={`p-3.5 rounded-2xl border transition-all cursor-pointer group flex items-start gap-3 relative ${
                    item.isRead
                      ? 'bg-neutral-950/40 border-white/5 opacity-80 hover:opacity-100 hover:border-white/10'
                      : 'bg-gradient-to-r from-rose-950/30 via-purple-950/20 to-neutral-950 border-rose-500/30 hover:border-rose-500/60 shadow-md shadow-rose-950/30'
                  }`}
                >
                  {/* Icon Badge */}
                  <div className={`p-2.5 rounded-xl border shrink-0 ${
                    item.isRead
                      ? 'bg-white/5 border-white/10 text-neutral-400'
                      : 'bg-rose-500/20 border-rose-500/30 text-rose-300'
                  }`}>
                    {getNotificationIcon(item.type)}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className={`text-xs font-bold truncate ${item.isRead ? 'text-neutral-300' : 'text-white'}`}>
                        {item.title}
                      </h4>
                      <span className="text-[10px] text-neutral-500 font-mono shrink-0">
                        {item.timestamp}
                      </span>
                    </div>

                    <p className="text-xs text-neutral-400 leading-relaxed line-clamp-2">
                      {item.message}
                    </p>

                    {item.actionLabel && (
                      <div className="pt-1 flex items-center gap-1 text-[11px] font-semibold text-rose-400 group-hover:text-rose-300 transition-colors">
                        <span>{item.actionLabel}</span>
                        <ChevronRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                      </div>
                    )}
                  </div>

                  {/* Unread Indicator Dot */}
                  {!item.isRead && (
                    <div className="w-2 h-2 rounded-full bg-rose-500 shrink-0 mt-1 shadow-[0_0_8px_rgba(244,63,94,0.8)]" />
                  )}
                </motion.div>
              ))
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default NotificationsModal;
