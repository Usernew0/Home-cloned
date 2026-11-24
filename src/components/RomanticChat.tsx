import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Send, Heart, Trash2, CornerUpLeft, X, Sparkles, Smile, Mic, AlertCircle, Copy, Check, MoreVertical, Pin, PinOff, Search, Volume2, VolumeX, Music, Bookmark, BookmarkCheck, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Image as ImageIcon, Loader2, Download, ZoomIn, Settings, Square, CheckSquare, Globe, Users, MessageSquare, Shield, ShieldCheck, Link, Lock, Unlock, Edit3, Share2, Info, Calendar, Crown, Eye, CheckCheck } from 'lucide-react';
import { jsPDF } from 'jspdf';
import JSZip from 'jszip';
import { ChatMessage, ChatGroup, UserPresence, UserAccount, AdminSetting } from '../types';
import { uploadChatImage, saveChatMessageDoc, saveUserAccountDoc, subscribeToChatGroups, saveChatGroupDoc, joinChatGroupByCode, deleteChatGroupDoc, updateUserPresenceDoc } from '../lib/syncService';
import { EmojiPicker } from './EmojiPicker';
import { HorizontalScrollWrapper } from './HorizontalScrollWrapper';

const formatAudioTime = (secs: number) => {
  if (isNaN(secs)) return '0:00';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
};

const HighlightText: React.FC<{ text: string; search: string }> = ({ text, search }) => {
  if (!search.trim()) return <>{text}</>;
  const escapedSearch = search.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
  const parts = text.split(new RegExp(`(${escapedSearch})`, 'gi'));
  return (
    <>
      {parts.map((part, i) => 
        part.toLowerCase() === search.toLowerCase() ? (
          <mark key={`mark-match-${i}`} className="bg-rose-500/30 text-rose-100 rounded px-0.5 font-medium border border-rose-500/20">
            {part}
          </mark>
        ) : (
          <React.Fragment key={`text-part-${i}`}>{part}</React.Fragment>
        )
      )}
    </>
  );
};

const VoiceNotePlayer: React.FC<{ audioUrl: string; duration?: number; isFloating?: boolean }> = ({ audioUrl, duration: initialDuration, isFloating }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(initialDuration || 0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = new Audio(audioUrl);
    audioRef.current = audio;

    const onTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const onLoadedMetadata = () => {
      if (audio.duration && !isNaN(audio.duration)) {
        setDuration(audio.duration);
      }
    };

    const onEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('ended', onEnded);

    return () => {
      audio.pause();
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('ended', onEnded);
    };
  }, [audioUrl]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().catch(err => console.error("Audio playback failed", err));
      setIsPlaying(true);
    }
  };

  const handleProgressChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!audioRef.current) return;
    const time = parseFloat(e.target.value);
    audioRef.current.currentTime = time;
    setCurrentTime(time);
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className={`flex items-center gap-3 bg-black/40 border border-white/5 rounded-2xl p-3 select-none ${
      isFloating 
        ? 'w-[280px] xs:w-[320px] sm:w-[350px] max-w-full' 
        : 'w-[280px] sm:w-[350px] md:w-[380px] max-w-full'
    }`}>
      {/* Play/Pause Button */}
      <button
        type="button"
        onClick={togglePlay}
        className="w-8 h-8 rounded-full bg-rose-500 hover:bg-rose-600 active:scale-95 text-white flex items-center justify-center transition-all shadow-md shadow-rose-950/20 cursor-pointer shrink-0"
      >
        {isPlaying ? (
          <svg className="w-4.5 h-4.5 fill-white" viewBox="0 0 24 24">
            <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
          </svg>
        ) : (
          <svg className="w-4.5 h-4.5 fill-white ml-0.5" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" />
          </svg>
        )}
      </button>

      {/* Track & Time */}
      <div className="flex-1 flex flex-col gap-1 min-w-0">
        <div className="relative flex items-center w-full group min-w-0">
          <input
            type="range"
            min={0}
            max={duration || 100}
            value={currentTime}
            onChange={handleProgressChange}
            className="w-full h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-rose-400 group-hover:bg-white/30 transition-colors shrink-0"
            style={{
              background: `linear-gradient(to right, rgb(244, 63, 94) 0%, rgb(244, 63, 94) ${progressPercent}%, rgba(255, 255, 255, 0.2) ${progressPercent}%, rgba(255, 255, 255, 0.2) 100%)`
            }}
          />
        </div>
        <div className="flex justify-between text-[10px] text-neutral-400 font-mono">
          <span>{formatAudioTime(currentTime)}</span>
          <span>{formatAudioTime(duration)}</span>
        </div>
      </div>
    </div>
  );
};

interface RomanticChatProps {
  currentUser: string;
  messages: ChatMessage[];
  onSendMessage: (content: string, replyTo?: ChatMessage, audioUrl?: string, audioDuration?: number, imageUrl?: string, imageFile?: File, receiver?: string) => void;
  onDeleteMessage: (id: string) => void;
  onReactToMessage: (id: string, reaction: string) => void;
  onTogglePinMessage?: (id: string) => void;
  userPresences?: UserPresence[];
  lastReadChatTime?: number;
  isFloating?: boolean;
  onCloseToggle?: () => void;
  isSoundEnabled?: boolean;
  onToggleSound?: () => void;
  userAccounts?: UserAccount[];
  adminSettings?: AdminSetting[];
}

export const RomanticChat: React.FC<RomanticChatProps> = ({
  currentUser,
  messages,
  onSendMessage,
  onDeleteMessage,
  onReactToMessage,
  onTogglePinMessage,
  userPresences = [],
  lastReadChatTime,
  isFloating = false,
  onCloseToggle,
  isSoundEnabled = true,
  onToggleSound,
  userAccounts = [],
  adminSettings = [],
}) => {
  const [inputText, setInputText] = useState('');
  const [activePartner, setActivePartner] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchBar, setShowSearchBar] = useState(false);
  const [replyTarget, setReplyTarget] = useState<ChatMessage | null>(null);
  const [showEmojiPickerForId, setShowEmojiPickerForId] = useState<string | null>(null);
  const [showInputEmojiPicker, setShowInputEmojiPicker] = useState(false);
  const [tick, setTick] = useState(0);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [showMediaGallery, setShowMediaGallery] = useState(false);
  
  // Image Upload States (Multi-Photo Chat Attachment Support)
  interface AttachedChatPhoto {
    id: string;
    file: File;
    previewUrl: string;
    uploadedUrl?: string;
    isUploading: boolean;
  }
  const [attachedPhotos, setAttachedPhotos] = useState<AttachedChatPhoto[]>([]);
  const isUploadingAnyPhoto = attachedPhotos.some((p) => p.isUploading);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const chatInputRef = useRef<HTMLInputElement | null>(null);
  
  // Mobile Action Menu States
  const [activeMobileMenuMessage, setActiveMobileMenuMessage] = useState<ChatMessage | null>(null);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [messageSeenInfoTarget, setMessageSeenInfoTarget] = useState<ChatMessage | null>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Multi-Selection Mode States
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedMessageIds, setSelectedMessageIds] = useState<string[]>([]);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [showDeleteConvConfirm, setShowDeleteConvConfirm] = useState(false);
  const [partnerToDelete, setPartnerToDelete] = useState<string | null>(null);

  // Undo Toast Notification state
  const [toast, setToast] = useState<{
    message: string;
    type: 'delete' | 'star';
    undoData: any;
  } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => {
      setToast(null);
    }, 5000);
    return () => clearTimeout(timer);
  }, [toast]);

  const handleUndo = async () => {
    if (!toast) return;
    if (toast.type === 'star') {
      const prevSavedIds = toast.undoData as string[];
      setSavedMessageIds(prevSavedIds);
      const savedKey = `saved_chat_messages_v1_${currentUser.toLowerCase().trim()}`;
      localStorage.setItem(savedKey, JSON.stringify(prevSavedIds));
    } else if (toast.type === 'delete') {
      const msgsToRestore = toast.undoData as ChatMessage[];
      for (const msg of msgsToRestore) {
        try {
          await saveChatMessageDoc(msg);
        } catch (err) {
          console.error("Error restoring message on undo:", err);
        }
      }
    }
    setToast(null);
  };

  // Normalize current user name for styling
  const currentSender = currentUser.trim();

  // Group Chat States & Real-Time Sync
  const [chatGroups, setChatGroups] = useState<ChatGroup[]>(() => {
    try {
      const stored = localStorage.getItem('chat_groups_v1');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    const unsub = subscribeToChatGroups((groups) => {
      if (groups && Array.isArray(groups)) {
        setChatGroups(groups);
        try {
          localStorage.setItem('chat_groups_v1', JSON.stringify(groups));
        } catch (e) {
          console.warn("Could not cache chat_groups_v1", e);
        }
      }
    });
    return () => {
      if (unsub) unsub();
    };
  }, []);

  // Check URL query param ?join_group=GRP-XXXXXX on page mount
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const codeParam = params.get('join_group');
      if (codeParam) {
        setJoinGroupInput(codeParam.trim().toUpperCase());
        setGroupModalTab('join');
        setIsCreateGroupModalOpen(true);
      }
    } catch (err) {
      console.warn("Could not parse URL join parameter:", err);
    }
  }, []);

  const [isCreateGroupModalOpen, setIsCreateGroupModalOpen] = useState(false);
  const [groupModalTab, setGroupModalTab] = useState<'create' | 'join'>('create');
  const [joinGroupInput, setJoinGroupInput] = useState('');
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDesc, setNewGroupDesc] = useState('');
  const [selectedGroupMembers, setSelectedGroupMembers] = useState<string[]>([]);
  const [groupMemberSearchQuery, setGroupMemberSearchQuery] = useState('');
  
  const [isGroupSettingsOpen, setIsGroupSettingsOpen] = useState(false);
  const [activeGroupSettingsTab, setActiveGroupSettingsTab] = useState<'info' | 'members' | 'permissions' | 'media'>('info');
  const [isEditingGroupInfo, setIsEditingGroupInfo] = useState(false);
  const [editGroupName, setEditGroupName] = useState('');
  const [editGroupDesc, setEditGroupDesc] = useState('');
  const [editGroupAvatar, setEditGroupAvatar] = useState('');
  const [copiedInviteLink, setCopiedInviteLink] = useState(false);
  const [groupMemberToAdd, setGroupMemberToAdd] = useState('');
  const [addMemberError, setAddMemberError] = useState<string | null>(null);
  const [addMemberSuccess, setAddMemberSuccess] = useState<string | null>(null);
  
  const [confirmGroupAction, setConfirmGroupAction] = useState<{
    isOpen: boolean;
    type: 'delete_group' | 'remove_member' | 'leave_group';
    title: string;
    description: string;
    confirmText: string;
    targetMember?: string;
  } | null>(null);

  const [transferAdminModal, setTransferAdminModal] = useState<{
    isOpen: boolean;
    group: ChatGroup;
    remainingMembers: string[];
    selectedNewAdmin: string;
  } | null>(null);

  const handleInitiateGroupExit = (groupToExit: ChatGroup) => {
    if (!groupToExit) return;
    const me = currentSender.trim();
    const meNorm = me.toLowerCase();

    const remainingMembers = (groupToExit.members || []).filter(
      m => m.toLowerCase().trim() !== meNorm
    );

    const remainingAdmins = (groupToExit.admins || []).filter(
      a => a.toLowerCase().trim() !== meNorm
    );

    const isCurrentAdmin = (groupToExit.admins || [])
      .map(a => a.toLowerCase().trim())
      .includes(meNorm) || (groupToExit.createdBy?.toLowerCase().trim() === meNorm);

    // Case 1: No remaining members in group -> Permanently delete group document
    if (remainingMembers.length === 0) {
      setConfirmGroupAction({
        isOpen: true,
        type: 'delete_group',
        title: 'Delete Group Chat?',
        description: `You are the last member in "${groupToExit.name}". Are you sure you want to permanently delete this group chat for everyone?`,
        confirmText: 'Delete Permanently'
      });
      return;
    }

    // Case 2a: Current user is an admin AND no other admins remain among the remaining members
    if (isCurrentAdmin && remainingAdmins.length === 0) {
      setTransferAdminModal({
        isOpen: true,
        group: groupToExit,
        remainingMembers,
        selectedNewAdmin: remainingMembers[0] || ''
      });
      return;
    }

    // Case 2b / 2c: There is already another admin OR current user is not sole admin
    // Just delete/leave the group for the current user only
    setConfirmGroupAction({
      isOpen: true,
      type: 'leave_group',
      title: `Delete Group for You?`,
      description: `Are you sure you want to remove "${groupToExit.name}" from your chat list? The group chat will remain active for all other members.`,
      confirmText: 'Delete for Me',
      targetMember: me
    });
  };

  const handleConfirmTransferAndExit = async () => {
    if (!transferAdminModal || !transferAdminModal.group) return;
    const { group, remainingMembers, selectedNewAdmin } = transferAdminModal;
    const me = currentSender.trim();
    const meNorm = me.toLowerCase();

    if (!selectedNewAdmin) return;

    const remainingAdmins = (group.admins || []).filter(
      a => a.toLowerCase().trim() !== meNorm
    );

    const newAdmins = Array.from(new Set([...remainingAdmins, selectedNewAdmin]));

    const updatedGroup: ChatGroup = {
      ...group,
      members: remainingMembers,
      admins: newAdmins,
      createdBy: group.createdBy?.toLowerCase().trim() === meNorm ? selectedNewAdmin : group.createdBy
    };

    try {
      await saveChatGroupDoc(updatedGroup);
      setChatGroups(prev => prev.map(g => g.id === updatedGroup.id ? updatedGroup : g));
      sendGroupSystemMessage(
        group.id,
        `${me} transferred admin rights to ${selectedNewAdmin} and left the group`
      );
      setTransferAdminModal(null);
      setIsGroupSettingsOpen(false);
      if (activePartner === group.id) {
        setActivePartner(null);
      }
    } catch (err) {
      console.error("Error transferring admin rights and leaving group:", err);
    }
  };

  const promptDeleteGroup = () => {
    if (!activeGroup) return;
    handleInitiateGroupExit(activeGroup);
  };

  const promptRemoveMember = (member: string) => {
    if (!activeGroup) return;
    const isMe = member.toLowerCase().trim() === currentSender.toLowerCase().trim();
    if (isMe) {
      handleInitiateGroupExit(activeGroup);
    } else {
      setConfirmGroupAction({
        isOpen: true,
        type: 'remove_member',
        title: `Remove ${member}?`,
        description: `Are you sure you want to remove "${member}" from "${activeGroup.name}"?`,
        confirmText: 'Remove Member',
        targetMember: member
      });
    }
  };

  const activeGroup = React.useMemo(() => {
    if (!activePartner) return null;
    const norm = activePartner.toLowerCase().trim();
    return chatGroups.find(g => g.id === activePartner || g.id.toLowerCase().trim() === norm || g.name.toLowerCase().trim() === norm) || null;
  }, [activePartner, chatGroups]);

  // Derived admin roles & permissions for current active group
  const isGroupAdmin = React.useMemo(() => {
    if (!activeGroup) return false;
    const me = currentSender.toLowerCase().trim();
    const creator = activeGroup.createdBy?.toLowerCase().trim();
    if (me === creator) return true;
    const adminList = (activeGroup.admins || []).map(a => a.toLowerCase().trim());
    return adminList.includes(me);
  }, [activeGroup, currentSender]);

  const isGroupCreator = React.useMemo(() => {
    if (!activeGroup) return false;
    return activeGroup.createdBy?.toLowerCase().trim() === currentSender.toLowerCase().trim();
  }, [activeGroup, currentSender]);

  const canSendInGroup = React.useMemo(() => {
    if (!activeGroup) return true;
    if (!activeGroup.onlyAdminsCanSend) return true;
    return isGroupAdmin;
  }, [activeGroup, isGroupAdmin]);

  const canEditGroupInfo = React.useMemo(() => {
    if (!activeGroup) return false;
    if (!activeGroup.onlyAdminsCanEditInfo) return true;
    return isGroupAdmin;
  }, [activeGroup, isGroupAdmin]);

  const canAddGroupMembers = React.useMemo(() => {
    if (!activeGroup) return false;
    if (!activeGroup.onlyAdminsCanAddMembers) return true;
    return isGroupAdmin;
  }, [activeGroup, isGroupAdmin]);

  const isGroupMuted = React.useMemo(() => {
    if (!activeGroup) return false;
    const me = currentSender.toLowerCase().trim();
    return (activeGroup.mutedBy || []).map(m => m.toLowerCase().trim()).includes(me);
  }, [activeGroup, currentSender]);

  const pendingGroupInvites = React.useMemo(() => {
    const me = currentSender.toLowerCase().trim();
    return chatGroups.filter(g => {
      const pending = (g.pendingMembers || []).map(m => m.toLowerCase().trim());
      return pending.includes(me);
    });
  }, [chatGroups, currentSender]);

  const checkUserExists = (usernameStr: string): { exists: boolean; exactUsername: string } => {
    const norm = usernameStr.toLowerCase().trim();
    if (!norm) return { exists: false, exactUsername: '' };

    if (Array.isArray(userAccounts) && userAccounts.length > 0) {
      const acc = userAccounts.find(u => u.username && u.username.toLowerCase().trim() === norm);
      if (acc) return { exists: true, exactUsername: acc.username };
    }

    if (Array.isArray(userPresences) && userPresences.length > 0) {
      const pres = userPresences.find(p => p.username && p.username.toLowerCase().trim() === norm);
      if (pres) return { exists: true, exactUsername: pres.username };
    }

    if (currentSender.toLowerCase().trim() === norm) {
      return { exists: true, exactUsername: currentSender };
    }

    if (Array.isArray(messages) && messages.length > 0) {
      const matchedMsg = messages.find(
        m => (m.sender && m.sender.toLowerCase().trim() === norm) ||
             (m.receiver && m.receiver.toLowerCase().trim() === norm)
      );
      if (matchedMsg) {
        const matchName = matchedMsg.sender && matchedMsg.sender.toLowerCase().trim() === norm
          ? matchedMsg.sender
          : matchedMsg.receiver;
        if (matchName) return { exists: true, exactUsername: matchName };
      }
    }

    if (Array.isArray(adminSettings) && adminSettings.length > 0) {
      for (const setting of adminSettings) {
        if (Array.isArray(setting.adminAccounts)) {
          const adm = setting.adminAccounts.find(a => a.username && a.username.toLowerCase().trim() === norm);
          if (adm) return { exists: true, exactUsername: adm.username };
        }
      }
    }

    return { exists: false, exactUsername: '' };
  };

  const userGroups = React.useMemo(() => {
    const me = currentSender.toLowerCase().trim();
    const groupMap = new Map<string, ChatGroup>();
    chatGroups.forEach(g => {
      if (!g || !g.id) return;
      const members = (g.members || []).map(m => m.toLowerCase().trim());
      if (members.includes(me) || g.createdBy?.toLowerCase().trim() === me) {
        groupMap.set(g.id, g);
      }
    });
    return Array.from(groupMap.values());
  }, [chatGroups, currentSender]);

  const getUnreadCountForGroup = (groupId: string): number => {
    if (activePartner === groupId) return 0;
    const me = currentSender.toLowerCase().trim();
    return messages.filter(msg => {
      if (msg.conversationId !== groupId && msg.receiver !== groupId) return false;
      if (msg.sender.toLowerCase().trim() === me) return false;
      if (msg.seen) return false;
      if (lastReadChatTime && new Date(msg.timestamp).getTime() <= lastReadChatTime) return false;
      return true;
    }).length;
  };

  const sendGroupSystemMessage = async (groupId: string, text: string) => {
    const sysMsg: ChatMessage = {
      id: `msg_sys_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      sender: 'system',
      receiver: groupId,
      conversationId: groupId,
      content: text,
      timestamp: new Date().toISOString(),
      isSystem: true
    };
    try {
      await saveChatMessageDoc(sysMsg);
    } catch (e) {
      console.warn("Could not save group system message:", e);
    }
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName.trim()) return;

    const me = currentSender.trim();
    const invitedMembers = selectedGroupMembers.filter(m => m.toLowerCase().trim() !== me.toLowerCase());

    const inviteCode = `GRP-${Array.from(crypto.getRandomValues(new Uint8Array(10))).map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
    const nowIso = new Date().toISOString();
    const initialJoinedAt: Record<string, string> = {};
    const initialCanSeePastHistory: Record<string, boolean> = {};
    initialJoinedAt[me.toLowerCase().trim()] = nowIso;
    initialCanSeePastHistory[me.toLowerCase().trim()] = true;

    const newGroup: ChatGroup = {
      id: `group_${Array.from(crypto.getRandomValues(new Uint8Array(12))).map((b) => b.toString(16).padStart(2, '0')).join('')}`,
      name: newGroupName.trim(),
      description: newGroupDesc.trim() || undefined,
      createdBy: me,
      createdAt: nowIso,
      members: [me],
      pendingMembers: invitedMembers,
      admins: [me],
      inviteCode,
      isInviteLinkEnabled: true,
      historyVisibleToNewMembers: true,
      memberJoinedAt: initialJoinedAt,
      memberCanSeePastHistory: initialCanSeePastHistory,
      onlyAdminsCanEditInfo: false,
      onlyAdminsCanSend: false,
      onlyAdminsCanAddMembers: false
    };

    try {
      await saveChatGroupDoc(newGroup);
      setChatGroups(prev => [...prev.filter(g => g.id !== newGroup.id), newGroup]);
      setIsCreateGroupModalOpen(false);
      setNewGroupName('');
      setNewGroupDesc('');
      setSelectedGroupMembers([]);
      setActivePartner(newGroup.id);
      sendGroupSystemMessage(newGroup.id, `${me} created group "${newGroupName.trim()}"`);
      if (invitedMembers.length > 0) {
        sendGroupSystemMessage(newGroup.id, `${me} invited ${invitedMembers.join(', ')} to join`);
      }
    } catch (err) {
      console.error("Error creating chat group:", err);
    }
  };

  const handleJoinGroupByCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinGroupInput.trim()) return;
    
    let code = joinGroupInput.trim();
    if (code.includes('join_group=')) {
      const parts = code.split('join_group=');
      if (parts[1]) {
        code = parts[1].split('&')[0];
      }
    }
    code = code.trim().toUpperCase();

    const me = currentSender.trim();
    const meNorm = me.toLowerCase();
    // Already a member (the list only holds groups I belong to or am invited to): just open it.
    const own = chatGroups.find(g => g.inviteCode?.toUpperCase() === code && (g.members || []).map(m => m.toLowerCase().trim()).includes(meNorm));
    if (own) {
      setActivePartner(own.id);
      setIsCreateGroupModalOpen(false);
      setJoinGroupInput('');
      return;
    }
    // Otherwise the code itself is the proof: the rules accept a self-join only with a code that matches the group's current invite code.
    const joined = await joinChatGroupByCode(code, me);
    if (joined.ok === false) {
      alert("Invalid or disabled group invite code or link. Please verify the code and try again.");
      return;
    }
    sendGroupSystemMessage(joined.groupId, `${me} joined the group via invite code`);
    setActivePartner(joined.groupId);
    setIsCreateGroupModalOpen(false);
    setJoinGroupInput('');
  };

  const handleAddMemberToActiveGroup = async () => {
    setAddMemberError(null);
    setAddMemberSuccess(null);

    if (!activeGroup || !canAddGroupMembers || !groupMemberToAdd.trim()) return;
    const rawInput = groupMemberToAdd.trim();

    // 1. Check if user exists in application
    const { exists, exactUsername } = checkUserExists(rawInput);
    if (!exists) {
      setAddMemberError(`Username "${rawInput}" not found. Please verify the exact username.`);
      return;
    }

    const targetName = exactUsername || rawInput;
    const targetNorm = targetName.toLowerCase().trim();

    // 2. Check if already active member
    if ((activeGroup.members || []).map(m => m.toLowerCase().trim()).includes(targetNorm)) {
      setAddMemberError(`"${targetName}" is already an active member of this group.`);
      return;
    }

    // 3. Check if invitation is already pending
    if ((activeGroup.pendingMembers || []).map(m => m.toLowerCase().trim()).includes(targetNorm)) {
      setAddMemberError(`An invitation is already pending for "${targetName}".`);
      return;
    }

    // 4. Add to pendingMembers
    const updatedPending = [...(activeGroup.pendingMembers || []), targetName];
    const updatedGroup: ChatGroup = {
      ...activeGroup,
      pendingMembers: updatedPending
    };

    try {
      await saveChatGroupDoc(updatedGroup);
      setChatGroups(prev => prev.map(g => g.id === updatedGroup.id ? updatedGroup : g));
      sendGroupSystemMessage(activeGroup.id, `${currentSender} invited ${targetName} to join the group`);
      setGroupMemberToAdd('');
      setAddMemberSuccess(`Invitation sent to ${targetName}! They will receive a notification to accept or decline.`);
      setTimeout(() => setAddMemberSuccess(null), 5000);
    } catch (err) {
      console.error("Error sending group invitation:", err);
      setAddMemberError("Failed to send invitation. Please try again.");
    }
  };

  const handleQuickAddInviteMember = async (targetUsername: string) => {
    setAddMemberError(null);
    setAddMemberSuccess(null);

    if (!activeGroup || !canAddGroupMembers) return;
    const targetNorm = targetUsername.toLowerCase().trim();

    if ((activeGroup.members || []).map(m => m.toLowerCase().trim()).includes(targetNorm)) {
      setAddMemberError(`"${targetUsername}" is already an active member.`);
      return;
    }

    if ((activeGroup.pendingMembers || []).map(m => m.toLowerCase().trim()).includes(targetNorm)) {
      setAddMemberError(`An invitation is already pending for "${targetUsername}".`);
      return;
    }

    const updatedPending = [...(activeGroup.pendingMembers || []), targetUsername];
    const updatedGroup: ChatGroup = {
      ...activeGroup,
      pendingMembers: updatedPending
    };

    try {
      await saveChatGroupDoc(updatedGroup);
      setChatGroups(prev => prev.map(g => g.id === updatedGroup.id ? updatedGroup : g));
      sendGroupSystemMessage(activeGroup.id, `${currentSender} invited ${targetUsername} to join the group`);
      setAddMemberSuccess(`Invitation sent to ${targetUsername}!`);
      setTimeout(() => setAddMemberSuccess(null), 4000);
    } catch (err) {
      console.error("Error inviting member to group:", err);
      setAddMemberError("Failed to send invitation. Please try again.");
    }
  };

  const handleAcceptGroupInvite = async (group: ChatGroup) => {
    const me = currentSender.trim();
    const meNorm = me.toLowerCase();
    const canSeePast = group.historyVisibleToNewMembers !== false;
    const updatedPending = (group.pendingMembers || []).filter(m => m.toLowerCase().trim() !== meNorm);
    const updatedMembers = Array.from(new Set([...(group.members || []), me]));
    const updatedJoinedAt = {
      ...(group.memberJoinedAt || {}),
      [meNorm]: new Date().toISOString()
    };
    const updatedCanSeePast = {
      ...(group.memberCanSeePastHistory || {}),
      [meNorm]: canSeePast
    };

    const updatedGroup: ChatGroup = {
      ...group,
      pendingMembers: updatedPending,
      members: updatedMembers,
      memberJoinedAt: updatedJoinedAt,
      memberCanSeePastHistory: updatedCanSeePast
    };

    try {
      await saveChatGroupDoc(updatedGroup);
      setChatGroups(prev => prev.map(g => g.id === updatedGroup.id ? updatedGroup : g));
      sendGroupSystemMessage(group.id, `${me} accepted the invitation and joined the group`);
      setActivePartner(group.id);
    } catch (err) {
      console.error("Error accepting group invite:", err);
    }
  };

  const handleRejectGroupInvite = async (group: ChatGroup) => {
    const me = currentSender.trim();
    const updatedPending = (group.pendingMembers || []).filter(m => m.toLowerCase().trim() !== me.toLowerCase());

    const updatedGroup: ChatGroup = {
      ...group,
      pendingMembers: updatedPending
    };

    try {
      await saveChatGroupDoc(updatedGroup);
      setChatGroups(prev => prev.map(g => g.id === updatedGroup.id ? updatedGroup : g));
      sendGroupSystemMessage(group.id, `${me} declined the group invitation`);
    } catch (err) {
      console.error("Error declining group invite:", err);
    }
  };

  const handleCancelGroupInvite = async (targetUsername: string) => {
    if (!activeGroup) return;
    const targetNorm = targetUsername.toLowerCase().trim();
    const updatedPending = (activeGroup.pendingMembers || []).filter(m => m.toLowerCase().trim() !== targetNorm);

    const updatedGroup: ChatGroup = {
      ...activeGroup,
      pendingMembers: updatedPending
    };

    try {
      await saveChatGroupDoc(updatedGroup);
      setChatGroups(prev => prev.map(g => g.id === updatedGroup.id ? updatedGroup : g));
      sendGroupSystemMessage(activeGroup.id, `${currentSender} canceled the group invite for ${targetUsername}`);
    } catch (err) {
      console.error("Error canceling group invite:", err);
    }
  };

  const handleToggleAdminRole = async (memberUsername: string) => {
    if (!activeGroup || !isGroupAdmin) return;
    const targetNorm = memberUsername.toLowerCase().trim();
    if (targetNorm === activeGroup.createdBy?.toLowerCase().trim()) return;

    const currentAdmins = (activeGroup.admins || []).map(a => a.trim());
    const isCurrentlyAdmin = currentAdmins.map(a => a.toLowerCase()).includes(targetNorm);

    let updatedAdmins: string[];
    if (isCurrentlyAdmin) {
      updatedAdmins = currentAdmins.filter(a => a.toLowerCase() !== targetNorm);
    } else {
      updatedAdmins = [...currentAdmins, memberUsername];
    }

    const updatedGroup: ChatGroup = {
      ...activeGroup,
      admins: updatedAdmins
    };

    try {
      await saveChatGroupDoc(updatedGroup);
      setChatGroups(prev => prev.map(g => g.id === updatedGroup.id ? updatedGroup : g));
      sendGroupSystemMessage(
        activeGroup.id,
        isCurrentlyAdmin
          ? `${currentSender} removed Admin rights from ${memberUsername}`
          : `${currentSender} promoted ${memberUsername} to Admin`
      );
    } catch (err) {
      console.error("Error toggling admin role:", err);
    }
  };

  const handleToggleGroupPermission = async (key: 'onlyAdminsCanSend' | 'onlyAdminsCanEditInfo' | 'onlyAdminsCanAddMembers' | 'isInviteLinkEnabled' | 'historyVisibleToNewMembers') => {
    if (!activeGroup || !isGroupAdmin) return;
    const currentValue = (key === 'isInviteLinkEnabled' || key === 'historyVisibleToNewMembers')
      ? (activeGroup[key] !== false)
      : !!activeGroup[key];
    const newValue = !currentValue;
    const updatedGroup: ChatGroup = {
      ...activeGroup,
      [key]: newValue
    };

    try {
      await saveChatGroupDoc(updatedGroup);
      setChatGroups(prev => prev.map(g => g.id === updatedGroup.id ? updatedGroup : g));
    } catch (err) {
      console.error("Error updating group permission:", err);
    }
  };

  const handleResetGroupInviteCode = async () => {
    if (!activeGroup || !isGroupAdmin) return;
    const newCode = `GRP-${Array.from(crypto.getRandomValues(new Uint8Array(10))).map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
    const updatedGroup: ChatGroup = {
      ...activeGroup,
      inviteCode: newCode
    };

    try {
      await saveChatGroupDoc(updatedGroup);
      setChatGroups(prev => prev.map(g => g.id === updatedGroup.id ? updatedGroup : g));
      sendGroupSystemMessage(activeGroup.id, `${currentSender} revoked previous invite link and generated a new code`);
    } catch (err) {
      console.error("Error revoking group invite code:", err);
    }
  };

  const handleToggleMuteGroup = async () => {
    if (!activeGroup) return;
    const me = currentSender.trim();
    const currentMuted = (activeGroup.mutedBy || []).map(m => m.trim());
    const isMuted = currentMuted.map(m => m.toLowerCase()).includes(me.toLowerCase());

    const updatedMuted = isMuted
      ? currentMuted.filter(m => m.toLowerCase() !== me.toLowerCase())
      : [...currentMuted, me];

    const updatedGroup: ChatGroup = {
      ...activeGroup,
      mutedBy: updatedMuted
    };

    try {
      await saveChatGroupDoc(updatedGroup);
      setChatGroups(prev => prev.map(g => g.id === updatedGroup.id ? updatedGroup : g));
    } catch (err) {
      console.error("Error toggling group mute status:", err);
    }
  };

  const handleSaveGroupInfo = async () => {
    if (!activeGroup || !canEditGroupInfo || !editGroupName.trim()) return;
    const updatedGroup: ChatGroup = {
      ...activeGroup,
      name: editGroupName.trim(),
      description: editGroupDesc.trim() || undefined,
      avatarUrl: editGroupAvatar.trim() || undefined
    };

    try {
      await saveChatGroupDoc(updatedGroup);
      setChatGroups(prev => prev.map(g => g.id === updatedGroup.id ? updatedGroup : g));
      setIsEditingGroupInfo(false);
      sendGroupSystemMessage(activeGroup.id, `${currentSender} updated group info`);
    } catch (err) {
      console.error("Error saving group info:", err);
    }
  };

  const handleCopyGroupInviteLink = async () => {
    if (!activeGroup) return;
    let inviteCode = activeGroup.inviteCode;
    if (!inviteCode) {
      inviteCode = `GRP-${Array.from(crypto.getRandomValues(new Uint8Array(10))).map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
      const updatedGroup = { ...activeGroup, inviteCode };
      try {
        await saveChatGroupDoc(updatedGroup);
        setChatGroups(prev => prev.map(g => g.id === updatedGroup.id ? updatedGroup : g));
      } catch (e) {
        console.warn("Could not save group invite code:", e);
      }
    }

    const inviteLink = `${window.location.origin}?join_group=${inviteCode}`;
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopiedInviteLink(true);
      setTimeout(() => setCopiedInviteLink(false), 2500);
    } catch (e) {
      console.error("Copy to clipboard failed:", e);
    }
  };

  const handleRemoveMemberFromGroup = async (memberToRemove: string) => {
    if (!activeGroup) return;
    const isMe = memberToRemove.toLowerCase().trim() === currentSender.toLowerCase().trim();
    const updatedMembers = (activeGroup.members || []).filter(m => m.toLowerCase().trim() !== memberToRemove.toLowerCase().trim());
    if (updatedMembers.length === 0) {
      try {
        await deleteChatGroupDoc(activeGroup.id);
        setChatGroups(prev => prev.filter(g => g.id !== activeGroup.id));
        setIsGroupSettingsOpen(false);
        setActivePartner(null);
      } catch (err) {
        console.error("Error deleting group:", err);
      }
      return;
    }

    // Also remove from admins if present
    const updatedAdmins = (activeGroup.admins || []).filter(a => a.toLowerCase().trim() !== memberToRemove.toLowerCase().trim());

    const updatedGroup: ChatGroup = {
      ...activeGroup,
      members: updatedMembers,
      admins: updatedAdmins
    };

    try {
      await saveChatGroupDoc(updatedGroup);
      setChatGroups(prev => prev.map(g => g.id === updatedGroup.id ? updatedGroup : g));
      sendGroupSystemMessage(
        activeGroup.id,
        isMe ? `${currentSender} left the group` : `${currentSender} removed ${memberToRemove} from the group`
      );
      if (isMe) {
        setIsGroupSettingsOpen(false);
        setActivePartner(null);
      }
    } catch (err) {
      console.error("Error removing member from group:", err);
    }
  };

  const handleDeleteActiveGroup = async () => {
    if (!activeGroup) return;
    try {
      await deleteChatGroupDoc(activeGroup.id);
      setChatGroups(prev => prev.filter(g => g.id !== activeGroup.id));
      setIsGroupSettingsOpen(false);
      setActivePartner(null);
    } catch (err) {
      console.error("Error deleting group:", err);
    }
  };

  const handleConfirmGroupAction = async () => {
    if (!confirmGroupAction) return;
    const { type, targetMember } = confirmGroupAction;
    setConfirmGroupAction(null);

    if (type === 'delete_group') {
      await handleDeleteActiveGroup();
    } else if ((type === 'remove_member' || type === 'leave_group') && targetMember) {
      await handleRemoveMemberFromGroup(targetMember);
    }
  };
  
  // Dynamically find registered user accounts from panel & admin settings
  const adminCreds = adminSettings.find(s => s.id === 'credentials');
  const adminUsername = adminCreds?.username || (import.meta as any).env.VITE_APP_USERNAME || 'home';
  const isAdmin = currentSender.toLowerCase() === adminUsername.toLowerCase().trim();

  // Current user account object
  const currentUserAccount = React.useMemo(() => {
    return userAccounts.find(
      u => u.username?.toLowerCase().trim() === currentSender.toLowerCase().trim()
    );
  }, [userAccounts, currentSender]);

  // Global Chat enabled setting
  const isGlobalChatEnabled = React.useMemo(() => {
    if (currentUserAccount?.enableGlobalChat !== undefined) {
      return currentUserAccount.enableGlobalChat;
    }
    const stored = localStorage.getItem(`enable_global_chat_${currentSender}`);
    return stored === 'false' ? false : true;
  }, [currentUserAccount, currentSender]);

  // Close active chat room if global chat gets disabled while user is in global lounge
  useEffect(() => {
    if (!isGlobalChatEnabled && activePartner?.toLowerCase().trim() === 'global') {
      setActivePartner(null);
    }
  }, [isGlobalChatEnabled, activePartner]);

  // Primary partner username (if paired)
  const partnerUsername = React.useMemo(() => {
    if (currentUserAccount?.partnerUsername) {
      return currentUserAccount.partnerUsername;
    }
    const me = currentSender.toLowerCase().trim();
    const targetCoupleId = currentUserAccount?.coupleId;
    if (targetCoupleId && targetCoupleId !== 'couple_default') {
      const partnerAcc = userAccounts.find(
        u => u.username.toLowerCase().trim() !== me &&
             u.coupleId && u.coupleId === targetCoupleId
      );
      if (partnerAcc) return partnerAcc.username;
    }
    return null;
  }, [currentUserAccount, userAccounts, currentSender]);

  // Sidebar user search query
  const [partnerSearchQuery, setPartnerSearchQuery] = useState('');

  // Stored / explicitly started chat partners list
  const [customChatPartners, setCustomChatPartners] = useState<string[]>(() => {
    try {
      const key = `started_chats_v1_${currentSender.toLowerCase().trim()}`;
      const stored = localStorage.getItem(key);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  // Comprehensive list of all registered members across the website
  const allAvailableUsers = React.useMemo(() => {
    const map = new Map<string, { id: string; username: string }>();

    const addUser = (username?: string, id?: string) => {
      if (!username) return;
      const clean = username.trim();
      const norm = clean.toLowerCase();
      if (!norm || norm === 'home' || norm === 'global' || norm.startsWith('group_')) return;
      
      if (!map.has(norm)) {
        map.set(norm, {
          id: id || `user_${norm}`,
          username: clean
        });
      }
    };

    // 1. Registered user accounts
    if (Array.isArray(userAccounts)) {
      userAccounts.forEach(u => {
        if (u.username) addUser(u.username, u.id);
      });
    }

    // 2. Admin account
    if (adminUsername) {
      addUser(adminUsername, 'admin_account');
    }

    // 3. User presences
    if (Array.isArray(userPresences)) {
      userPresences.forEach(p => {
        if (p.username) addUser(p.username, `presence_${p.username.toLowerCase().trim()}`);
      });
    }

    // 4. Partner username
    if (partnerUsername) {
      addUser(partnerUsername);
    }

    // 5. Custom chat partners
    if (Array.isArray(customChatPartners)) {
      customChatPartners.forEach(p => addUser(p));
    }

    // 6. Messages participants
    if (Array.isArray(messages)) {
      messages.forEach(msg => {
        if (msg.sender) addUser(msg.sender);
        if (msg.receiver && msg.receiver !== 'global' && !msg.receiver.startsWith('group_')) {
          addUser(msg.receiver);
        }
        if (msg.conversationId && !msg.conversationId.startsWith('group_') && msg.conversationId !== 'global') {
          const parts = msg.conversationId.split('_');
          if (parts.length === 2) {
            addUser(parts[0]);
            addUser(parts[1]);
          }
        }
      });
    }

    return Array.from(map.values());
  }, [userAccounts, adminUsername, userPresences, partnerUsername, customChatPartners, messages]);

  // Chat partners list: include all registered users (except system 'home')
  const chatPartners = React.useMemo(() => {
    return allAvailableUsers;
  }, [allAvailableUsers]);

  // Partners we already have active messages with
  const messagePartners = React.useMemo(() => {
    const me = currentSender.toLowerCase().trim();
    const adminName = adminUsername.toLowerCase().trim();
    const partners = new Set<string>();
    
    messages.forEach(msg => {
      const sender = msg.sender.toLowerCase().trim();
      const receiver = (msg.receiver || '').toLowerCase().trim();
      const convId = (msg.conversationId || '').toLowerCase().trim();

      if (convId === 'global' || receiver === 'global' || receiver.startsWith('group_') || convId.startsWith('group_')) {
        return; // Handled separately as global lounge or group chats
      }
      
      if (sender === me && receiver === me) {
        partners.add(me);
      } else if (sender === me && receiver && receiver !== me) {
        if (!receiver.startsWith('group_')) partners.add(receiver);
      } else if (receiver === me && sender && sender !== me) {
        if (!sender.startsWith('group_')) partners.add(sender);
      } else if (msg.conversationId) {
        const parts = msg.conversationId.split('_');
        if (parts.length === 2) {
          const p1 = parts[0].toLowerCase().trim();
          const p2 = parts[1].toLowerCase().trim();
          if (p1 === me && p2 === me) {
            partners.add(me);
          } else {
            if (p1 === me && p2 !== me && !p2.startsWith('group_')) partners.add(p2);
            if (p2 === me && p1 !== me && !p1.startsWith('group_')) partners.add(p1);
          }
        }
      } else {
        const firstRegularUser = userAccounts?.[0]?.username?.toLowerCase().trim() || '';
        if (me === adminName && firstRegularUser) {
          partners.add(firstRegularUser);
        } else if (me === firstRegularUser && adminName) {
          partners.add(adminName);
        }
      }
    });
    
    return Array.from(partners);
  }, [messages, currentSender, userAccounts, adminUsername]);

  // Merge primary partner, global lounge (if enabled), explicitly started conversations, and active message threads
  const displayedPartners = React.useMemo(() => {
    const me = currentSender.toLowerCase().trim();
    const adminName = adminUsername.toLowerCase().trim();
    const list: { id: string; username: string; isPartner?: boolean; isGlobal?: boolean; isSelf?: boolean }[] = [];
    const addedNames = new Set<string>();

    // 1. Primary Couple Partner (Always prioritized at top if paired)
    if (partnerUsername && partnerUsername.toLowerCase().trim() !== me) {
      const norm = partnerUsername.toLowerCase().trim();
      const account = userAccounts.find(u => u.username.toLowerCase().trim() === norm);
      list.push({
        id: account?.id || `partner_${norm}`,
        username: partnerUsername,
        isPartner: true
      });
      addedNames.add(norm);
    }

    // 2. Global Community Lounge (If enabled in profile settings)
    if (isGlobalChatEnabled) {
      list.push({
        id: 'global-lounge-room',
        username: 'global',
        isGlobal: true
      });
      addedNames.add('global');
    }

    // 3. Active Message DM Partners
    messagePartners.forEach(pName => {
      const norm = pName.toLowerCase().trim();
      if (addedNames.has(norm) || norm.startsWith('group_')) return;
      if (norm === 'home' && me !== 'home') return;

      if (norm === me) {
        list.push({ id: 'notes-to-self', username: currentSender, isSelf: true });
        addedNames.add(me);
        return;
      }

      const account = userAccounts.find(u => u.username.toLowerCase().trim() === norm);
      if (account) {
        list.push({ id: account.id, username: account.username });
      } else if (norm === adminName) {
        list.push({ id: 'admin', username: adminUsername });
      } else {
        list.push({ id: norm, username: pName });
      }
      addedNames.add(norm);
    });

    // 4. Custom explicitly started chats
    customChatPartners.forEach(pName => {
      const norm = pName.toLowerCase().trim();
      if (addedNames.has(norm) || norm.startsWith('group_')) return;
      if (norm === 'home' && me !== 'home') return;

      if (norm === me) {
        list.push({ id: 'notes-to-self', username: currentSender, isSelf: true });
        addedNames.add(me);
        return;
      }

      const account = userAccounts.find(u => u.username.toLowerCase().trim() === norm);
      if (account) {
        list.push({ id: account.id, username: account.username });
      } else {
        list.push({ id: norm, username: pName });
      }
      addedNames.add(norm);
    });

    return list;
  }, [partnerUsername, isGlobalChatEnabled, messagePartners, customChatPartners, currentSender, adminUsername, userAccounts]);

  // Active DM partners currently in the user's conversation list (excluding global lounge and notes-to-self)
  const availableDmMembers = React.useMemo(() => {
    const me = currentSender.toLowerCase().trim();
    return displayedPartners
      .filter(p => !p.isGlobal && p.username.toLowerCase().trim() !== 'global' && p.username.toLowerCase().trim() !== me)
      .map(p => ({
        id: p.id,
        username: p.username
      }));
  }, [displayedPartners, currentSender]);

  // Non-member DM partners for active group adding
  const nonMemberUsers = React.useMemo(() => {
    if (!activeGroup) return [];
    const memberNorms = new Set((activeGroup.members || []).map(m => m.toLowerCase().trim()));
    return availableDmMembers.filter(u => !memberNorms.has(u.username.toLowerCase().trim()));
  }, [availableDmMembers, activeGroup]);

  const startChatWithPartner = (username: string) => {
    const normName = username.toLowerCase().trim();
    if (!customChatPartners.map(p => p.toLowerCase().trim()).includes(normName)) {
      const updated = [...customChatPartners, username];
      setCustomChatPartners(updated);
      try {
        const key = `started_chats_v1_${currentSender.toLowerCase().trim()}`;
        localStorage.setItem(key, JSON.stringify(updated));
      } catch (err) {
        console.error("Error saving started chat to localStorage:", err);
      }
    }
    setActivePartner(username);
    setPartnerSearchQuery('');
  };

  // Unique registered users for status tracking (includes admin and all user accounts)
  const uniqueUsers = React.useMemo(() => {
    const list = [adminUsername];
    userAccounts.forEach(u => {
      if (!list.map(n => n.toLowerCase().trim()).includes(u.username.toLowerCase().trim())) {
        list.push(u.username);
      }
    });
    return list;
  }, [userAccounts, adminUsername]);

  // Get unread messages count for a partner
  const getUnreadCountForPartner = (targetPartner: string) => {
    const me = currentSender.toLowerCase().trim();
    const partner = targetPartner.toLowerCase().trim();

    if (partner === 'global') {
      return messages.filter(msg => {
        if (msg.sender.toLowerCase().trim() === me) return false;
        if (msg.seen) return false;
        return msg.conversationId === 'global' || (msg.receiver || '').toLowerCase().trim() === 'global';
      }).length;
    }
    
    const activeConvId = [me, partner].sort().join('_');
    
    return messages.filter(msg => {
      // Must be sent by partner
      if (msg.sender.toLowerCase().trim() !== partner) return false;
      
      // Must not be seen
      if (msg.seen) return false;
      
      // Match conversation Id
      if (msg.conversationId) {
        return msg.conversationId === activeConvId;
      }
      
      // Secondary receiver check
      const msgReceiver = (msg.receiver || '').toLowerCase().trim();
      if (msgReceiver) {
        return msgReceiver === me;
      }
      
      // Legacy fallback
      const adminName = adminUsername.toLowerCase().trim();
      const firstRegularUser = userAccounts?.[0]?.username?.toLowerCase().trim() || '';
      const isLegacyChat = (me === adminName && partner === firstRegularUser) || 
                           (me === firstRegularUser && partner === adminName);
      if (isLegacyChat) {
        return msg.sender.toLowerCase().trim() === partner;
      }
      return false;
    }).length;
  };

  const partnerPresence = userPresences.find(
    (p) => p.username.toLowerCase().trim() === (activePartner || '').toLowerCase().trim()
  );

  // Filter messages to keep conversations private and only display messages exchanged in the active direct message chat
  const conversationMessages = messages.filter(msg => {
    if (!activePartner) return false;
    const msgSender = msg.sender.toLowerCase().trim();
    const msgReceiver = (msg.receiver || '').toLowerCase().trim();
    const me = currentSender.toLowerCase().trim();
    const partner = activePartner.toLowerCase().trim();

    // Global Community Lounge Messages
    if (partner === 'global') {
      return msg.conversationId === 'global' || msgReceiver === 'global';
    }

    // Group Chat Messages
    if (activeGroup || partner.startsWith('group_')) {
      const isGroupMsg = msg.conversationId === activePartner || msgReceiver === partner;
      if (!isGroupMsg) return false;

      // Group History Visibility Check:
      // Enforces per-member snapshot recorded at the time the user joined:
      // - If memberCanSeePastHistory[me] was true when they joined, they see older messages even if admin later disables history.
      // - If memberCanSeePastHistory[me] was false when they joined, they only see messages sent after their join timestamp, even if admin later enables history.
      if (activeGroup) {
        const isGroupAdmin = (activeGroup.admins || []).map(a => a.toLowerCase().trim()).includes(me) || 
                             activeGroup.createdBy?.toLowerCase().trim() === me;

        if (!isGroupAdmin) {
          const userCanSeePast = activeGroup.memberCanSeePastHistory?.[me];

          if (userCanSeePast === false) {
            // Joined when history was disabled -> hide older messages sent before joinedAt
            const joinedAtIso = activeGroup.memberJoinedAt?.[me];
            if (joinedAtIso) {
              const joinedMs = new Date(joinedAtIso).getTime();
              const msgMs = new Date(msg.timestamp).getTime();
              if (msgMs < joinedMs) {
                return false;
              }
            }
          } else if (userCanSeePast === true) {
            // Joined when history was enabled -> retains access to older messages
            return true;
          } else {
            // Legacy fallback if snapshot isn't available for this user yet
            if (activeGroup.historyVisibleToNewMembers === false) {
              const joinedAtIso = activeGroup.memberJoinedAt?.[me];
              if (joinedAtIso) {
                const joinedMs = new Date(joinedAtIso).getTime();
                const msgMs = new Date(msg.timestamp).getTime();
                if (msgMs < joinedMs) {
                  return false;
                }
              }
            }
          }
        }
      }

      return true;
    }
    
    // 1. Primary filter by conversationId if present
    if (msg.conversationId && msg.conversationId !== 'global') {
      const activeConvId = [me, partner].sort().join('_');
      return msg.conversationId === activeConvId;
    }

    // 2. Secondary filter by receiver if present
    if (msgReceiver && msgReceiver !== 'global') {
      return (msgSender === me && msgReceiver === partner) || 
             (msgSender === partner && msgReceiver === me);
    } else {
      // Default legacy fallback for admin/firstRegularUser
      const firstRegularUser = userAccounts[0]?.username?.toLowerCase().trim() || '';
      const adminName = adminUsername.toLowerCase().trim();
      
      const isLegacyChat = (me === adminName && partner === firstRegularUser) || 
                           (me === firstRegularUser && partner === adminName);
      
      if (isLegacyChat) {
        return (msgSender === me || msgSender === partner);
      }
      return false;
    }
  });

  // Handle typing status broadcast
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setInputText(value);

    if (activePartner && currentUser) {
      const targetId = activeGroup ? activeGroup.id : activePartner;
      if (value.trim()) {
        updateUserPresenceDoc(currentUser, lastReadChatTime, targetId, new Date().toISOString());
        if (typingTimeoutRef.current) {
          clearTimeout(typingTimeoutRef.current);
        }
        typingTimeoutRef.current = setTimeout(() => {
          updateUserPresenceDoc(currentUser, lastReadChatTime, null, null);
        }, 3500);
      } else {
        if (typingTimeoutRef.current) {
          clearTimeout(typingTimeoutRef.current);
        }
        updateUserPresenceDoc(currentUser, lastReadChatTime, null, null);
      }
    }
  };

  // Compute active typing users in current conversation
  const typingUsers = React.useMemo(() => {
    if (!activePartner) return [];
    const activeTarget = activeGroup ? activeGroup.id : activePartner;
    const canonicalConvId = activePartner === 'global' ? 'global' : [currentUser.toLowerCase().trim(), activePartner.toLowerCase().trim()].sort().join('_');
    const now = Date.now();

    return userPresences.filter((p) => {
      if (p.username.toLowerCase().trim() === currentUser.toLowerCase().trim()) return false;
      if (!p.typingIn || !p.typingAt) return false;
      
      const elapsed = now - new Date(p.typingAt).getTime();
      if (elapsed > 5000 || elapsed < 0) return false;

      const pTypingIn = p.typingIn.toLowerCase().trim();
      return (
        pTypingIn === activeTarget.toLowerCase().trim() ||
        pTypingIn === activePartner.toLowerCase().trim() ||
        pTypingIn === currentUser.toLowerCase().trim() ||
        pTypingIn === canonicalConvId
      );
    }).map(p => p.username);
  }, [userPresences, activePartner, activeGroup, currentUser]);

  // Real-time Group Read Receipts: Auto-mark incoming messages as seen by currentUser
  useEffect(() => {
    if (!activePartner || !currentSender || !conversationMessages.length) return;
    const me = currentSender.toLowerCase().trim();

    const unseenMsgs = conversationMessages.filter(msg => {
      if (msg.sender.toLowerCase().trim() === me) return false;
      const seenList = (msg.seenBy || []).map(u => u.toLowerCase().trim());
      return !seenList.includes(me);
    });

    if (unseenMsgs.length > 0) {
      unseenMsgs.forEach(async (msg) => {
        try {
          const currentSeenBy = msg.seenBy || [];
          const currentSeenByTime = msg.seenByTime || {};
          const nowIso = new Date().toISOString();

          const updatedSeenBy = Array.from(new Set([...currentSeenBy, currentSender]));
          const updatedSeenByTime = {
            ...currentSeenByTime,
            [currentSender]: nowIso
          };

          const updatedMsg: ChatMessage = {
            ...msg,
            seen: true,
            seenBy: updatedSeenBy,
            seenByTime: updatedSeenByTime
          };

          await saveChatMessageDoc(updatedMsg);
        } catch (err) {
          console.warn("Error marking message as seen:", err);
        }
      });
    }
  }, [activePartner, currentSender, conversationMessages]);

  const handleEnableSelectionMode = (messageId?: string) => {
    setIsSelectionMode(true);
    if (messageId) {
      setSelectedMessageIds([messageId]);
    } else {
      setSelectedMessageIds([]);
    }
  };

  const handleToggleSelectMessage = (messageId: string) => {
    setSelectedMessageIds((prev) => {
      if (prev.includes(messageId)) {
        return prev.filter((id) => id !== messageId);
      } else {
        return [...prev, messageId];
      }
    });
  };

  const handleBulkStar = () => {
    if (selectedMessageIds.length === 0) return;
    const anyUnsaved = selectedMessageIds.some(id => !savedMessageIds.includes(id));
    
    // Save previous state for undo
    const previousSavedIds = [...savedMessageIds];

    setSavedMessageIds((prev) => {
      let updated;
      if (anyUnsaved) {
        // Add all selected that are not already there
        const toAdd = selectedMessageIds.filter(id => !prev.includes(id));
        updated = [...prev, ...toAdd];
      } else {
        // Remove all selected
        updated = prev.filter(id => !selectedMessageIds.includes(id));
      }
      const savedKey = `saved_chat_messages_v1_${currentUser.toLowerCase().trim()}`;
      localStorage.setItem(savedKey, JSON.stringify(updated));
      return updated;
    });

    setToast({
      message: anyUnsaved 
        ? `Saved ${selectedMessageIds.length} messages` 
        : `Unsaved ${selectedMessageIds.length} messages`,
      type: 'star',
      undoData: previousSavedIds
    });

    // Clear selection and turn off selection mode
    setSelectedMessageIds([]);
    setIsSelectionMode(false);
  };

  const handleBulkPin = () => {
    if (selectedMessageIds.length === 0 || !onTogglePinMessage) return;
    const selectedMsgs = conversationMessages.filter(m => selectedMessageIds.includes(m.id));
    const anyUnpinned = selectedMsgs.some(m => !m.pinned);
    
    selectedMsgs.forEach(msg => {
      const shouldBePinned = anyUnpinned;
      if (msg.pinned !== shouldBePinned) {
        onTogglePinMessage(msg.id);
      }
    });
    
    // Clear selection and turn off selection mode
    setSelectedMessageIds([]);
    setIsSelectionMode(false);
  };
  
  // Lightbox Modal States
  const [activeLightboxIndex, setActiveLightboxIndex] = useState<number | null>(null);

  // Filter messages that have images and aren't being uploaded
  const imageMessages = conversationMessages.filter(
    (msg) => msg.imageUrl && !msg.imageUrl.startsWith('uploading_blob:')
  );

  const currentLightboxMsg = activeLightboxIndex !== null ? imageMessages[activeLightboxIndex] : null;

  const formatLightboxTime = (isoString?: string) => {
    if (!isoString) return '';
    try {
      const date = new Date(isoString);
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
    } catch {
      return '';
    }
  };

  const handleDownloadLightboxImage = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (activeLightboxIndex === null) return;
    const activeMsg = imageMessages[activeLightboxIndex];
    if (!activeMsg || !activeMsg.imageUrl) return;
    
    const link = document.createElement('a');
    link.href = activeMsg.imageUrl;
    const senderClean = activeMsg.sender.replace(/[^a-zA-Z0-9]/g, '_');
    link.download = `love_chat_${senderClean}_${Date.now()}.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  useEffect(() => {
    if (activeLightboxIndex === null) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        setActiveLightboxIndex((prev) => 
          prev !== null && prev > 0 ? prev - 1 : prev
        );
      } else if (e.key === 'ArrowRight') {
        setActiveLightboxIndex((prev) => 
          prev !== null && prev < imageMessages.length - 1 ? prev + 1 : prev
        );
      } else if (e.key === 'Escape') {
        setActiveLightboxIndex(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [activeLightboxIndex, imageMessages.length]);
  
  // Microphone recording states
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const recordingSecondsRef = useRef(0);
  const [micError, setMicError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);

  // Sound selection and settings
  const [selectedSound, setSelectedSound] = useState('harps');
  const [showSoundSettings, setShowSoundSettings] = useState(false);
  const [showSettingsDropdown, setShowSettingsDropdown] = useState(false);
  const lastMessageIdRef = useRef<string | null>(null);

  // Saved messages, search query, and collapsibility states
  const [savedSearchQuery, setSavedSearchQuery] = useState('');
  const [savedMessageIds, setSavedMessageIds] = useState<string[]>(() => {
    try {
      const savedKey = `saved_chat_messages_v1_${currentUser.toLowerCase().trim()}`;
      const saved = localStorage.getItem(savedKey);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [isPinnedCollapsed, setIsPinnedCollapsed] = useState(true);
  const [isSavedCollapsed, setIsSavedCollapsed] = useState(true);

  // Sync saved messages when current user changes
  useEffect(() => {
    try {
      const savedKey = `saved_chat_messages_v1_${currentUser.toLowerCase().trim()}`;
      const saved = localStorage.getItem(savedKey);
      setSavedMessageIds(saved ? JSON.parse(saved) : []);
    } catch {
      setSavedMessageIds([]);
    }
  }, [currentUser]);

  // Sync selected sound when current user or active partner changes
  useEffect(() => {
    if (activePartner && currentUser) {
      const soundKey = `chat_notification_sound_${currentUser.toLowerCase().trim()}_${activePartner.toLowerCase().trim()}`;
      setSelectedSound(localStorage.getItem(soundKey) || 'harps');
    } else {
      setSelectedSound(localStorage.getItem('chat_notification_sound') || 'harps');
    }
  }, [activePartner, currentUser]);

  const toggleSaveMessage = (messageId: string) => {
    setSavedMessageIds((prev) => {
      const updated = prev.includes(messageId)
        ? prev.filter((id) => id !== messageId)
        : [...prev, messageId];
      const savedKey = `saved_chat_messages_v1_${currentUser.toLowerCase().trim()}`;
      localStorage.setItem(savedKey, JSON.stringify(updated));
      return updated;
    });
  };

  const playNotificationSound = (type = selectedSound) => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const playTone = (freq: number, start: number, duration: number, typeOfOsc: OscillatorType = 'sine', volumeValue = 0.15) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = typeOfOsc;
        osc.frequency.setValueAtTime(freq, start);
        
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(volumeValue, start + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
        
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        osc.start(start);
        osc.stop(start + duration);
      };

      const now = ctx.currentTime;

      if (type === 'harps') {
        // Sweet Harps ascending chord
        const notes = [523.25, 659.25, 783.99, 987.77, 1046.50]; // C5, E5, G5, B5, C6
        notes.forEach((freq, idx) => {
          playTone(freq, now + idx * 0.08, 0.6, 'triangle', 0.12);
        });
      } else if (type === 'chime') {
        // Love Chime
        playTone(587.33, now, 0.8, 'sine', 0.2); // D5
        playTone(880, now + 0.05, 1.0, 'sine', 0.15); // A5
        playTone(1174.66, now + 0.1, 1.2, 'sine', 0.1); // D6
      } else if (type === 'spark') {
        // Cosmic Spark
        const notes = [880, 1046.50, 1318.51, 1567.98]; // A5, C6, E6, G6
        notes.forEach((freq, idx) => {
          playTone(freq, now + idx * 0.04, 0.4, 'sine', 0.1);
        });
      } else if (type === 'waltz') {
        // Cute Waltz melody
        playTone(523.25, now, 0.25, 'sine', 0.15);
        playTone(659.25, now + 0.15, 0.25, 'sine', 0.15);
        playTone(783.99, now + 0.3, 0.4, 'sine', 0.15);
        playTone(880, now + 0.45, 0.4, 'sine', 0.12);
      } else if (type === 'lullaby') {
        // Dreamy Lullaby
        playTone(698.46, now, 0.3, 'sine', 0.15); // F5
        playTone(783.99, now + 0.2, 0.3, 'sine', 0.15); // G5
        playTone(880, now + 0.4, 0.5, 'sine', 0.15); // A5
        playTone(659.25, now + 0.7, 0.6, 'sine', 0.15); // E5
      }
    } catch (err) {
      console.warn("Could not play synthesized audio notification:", err);
    }
  };

  // Initialize the ref with the last message on first load or when messages populate
  useEffect(() => {
    if (conversationMessages.length > 0 && lastMessageIdRef.current === null) {
      lastMessageIdRef.current = conversationMessages[conversationMessages.length - 1].id;
    }
  }, [conversationMessages]);

  // Track new incoming messages to play sound
  useEffect(() => {
    if (conversationMessages.length > 0) {
      const lastMsg = conversationMessages[conversationMessages.length - 1];
      if (lastMessageIdRef.current && lastMsg.id !== lastMessageIdRef.current) {
        // A new message has arrived!
        lastMessageIdRef.current = lastMsg.id;
        
        // Play sound if sent by the other partner
        const isFromOther = lastMsg.sender.toLowerCase().trim() !== currentUser.toLowerCase().trim();
        if (isFromOther) {
          playNotificationSound();
        }
      }
    }
  }, [conversationMessages, currentUser, selectedSound]);

  // Clean up recording resources on unmount
  useEffect(() => {
    return () => {
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  const handleExportAsText = () => {
    const header = `==================================================\n  OUR HOME - CHAT EXPORT  \n==================================================\nExported on: ${new Date().toLocaleString()}\nTotal Messages: ${conversationMessages.length}\n==================================================\n\n`;
    
    const body = conversationMessages.map(msg => {
      const dateStr = new Date(msg.timestamp).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
      let content = msg.content || '';
      if (msg.imageUrl) content += ' [Image Attachment]';
      if (msg.audioUrl) content += ' [Voice Note 🎙️]';
      return `[${dateStr}] ${msg.sender}: ${content}`;
    }).join('\n');
    
    const blob = new Blob([header + body], { type: 'text/plain;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `OurHome_ChatHistory_${Date.now()}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportAsPDF = () => {
    const doc = new jsPDF();
    const pageHeight = doc.internal.pageSize.height;
    const margin = 15;
    const contentWidth = 180;
    let y = margin + 10;

    const drawHeader = (pageNum: number) => {
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(14);
      doc.setTextColor(225, 29, 72); // Rose 600
      doc.text('Our Home', margin, margin);
      
      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(115, 115, 115);
      doc.text(`Chat History Export • Page ${pageNum}`, 210 - margin, margin, { align: 'right' });
      
      doc.setDrawColor(229, 229, 229);
      doc.setLineWidth(0.2);
      doc.line(margin, margin + 3, 210 - margin, margin + 3);
    };

    const drawFooter = () => {
      doc.setFont('Helvetica', 'italic');
      doc.setFontSize(8);
      doc.setTextColor(163, 163, 163);
      doc.text('Made with love in our shared home', 105, pageHeight - 10, { align: 'center' });
    };

    let currentPage = 1;
    drawHeader(currentPage);
    drawFooter();

    // Title Card
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(18);
    doc.setTextColor(23, 23, 23);
    doc.text('Our Shared Conversations Log', margin, y);
    y += 8;

    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(82, 82, 82);
    doc.text(`Exported on: ${new Date().toLocaleString()}`, margin, y);
    y += 8;
    doc.text(`Total conversations saved: ${conversationMessages.length}`, margin, y);
    y += 12;

    conversationMessages.forEach((msg) => {
      const senderStr = `${msg.sender}`;
      const timeStr = new Date(msg.timestamp).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
      
      let bodyText = msg.content || '';
      if (msg.imageUrl) bodyText += ' [Image Attachment]';
      if (msg.audioUrl) bodyText += ' [Voice Note 🎙️]';

      if (y + 15 > pageHeight - margin) {
        doc.addPage();
        currentPage++;
        y = margin + 15;
        drawHeader(currentPage);
        drawFooter();
      }

      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(225, 29, 72);
      doc.text(senderStr, margin, y);

      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(115, 115, 115);
      doc.text(timeStr, 210 - margin, y, { align: 'right' });
      y += 5;

      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(9.5);
      doc.setTextColor(38, 38, 38);

      const lines = doc.splitTextToSize(bodyText, contentWidth);
      lines.forEach((line: string) => {
        if (y + 6 > pageHeight - margin) {
          doc.addPage();
          currentPage++;
          y = margin + 15;
          drawHeader(currentPage);
          drawFooter();
          
          doc.setFont('Helvetica', 'normal');
          doc.setFontSize(9.5);
          doc.setTextColor(38, 38, 38);
        }
        doc.text(line, margin, y);
        y += 5.5;
      });

      y += 3.5;
    });

    doc.save(`OurHome_ChatHistory_${Date.now()}.pdf`);
  };

  const handleExportAsZip = async () => {
    const zip = new JSZip();
    
    let textHistory = `==================================================\n  OUR HOME CHAT EXPORT  \n==================================================\nExported on: ${new Date().toLocaleString()}\n\n`;
    
    const attachmentsFolder = zip.folder('attachments');
    let imageCounter = 1;
    let audioCounter = 1;
    
    conversationMessages.forEach((msg) => {
      const dateStr = new Date(msg.timestamp).toLocaleString();
      let content = msg.content || '';
      
      if (msg.imageUrl) {
        const imgName = `image_${imageCounter}.jpg`;
        content += ` [Attachment: attachments/${imgName}]`;
        
        const base64Data = msg.imageUrl.split(',')[1];
        if (base64Data && attachmentsFolder) {
          attachmentsFolder.file(imgName, base64Data, { base64: true });
          imageCounter++;
        }
      }
      
      if (msg.audioUrl) {
        let ext = 'webm';
        if (msg.audioUrl.startsWith('data:')) {
          const parts = msg.audioUrl.split(';')[0];
          const mime = parts.split(':')[1];
          if (mime) {
            const sub = mime.split('/')[1];
            if (sub) {
              ext = sub.split('+')[0];
            }
          }
        }
        const audioName = `voice_note_${audioCounter}.${ext}`;
        content += ` [Voice Note: attachments/${audioName}]`;
        
        const base64Data = msg.audioUrl.split(',')[1];
        if (base64Data && attachmentsFolder) {
          attachmentsFolder.file(audioName, base64Data, { base64: true });
          audioCounter++;
        }
      }
      
      textHistory += `[${dateStr}] ${msg.sender}: ${content}\n`;
    });
    
    zip.file('chat_history.txt', textHistory);
    
    const contentBlob = await zip.generateAsync({ type: 'blob' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(contentBlob);
    link.download = `OurHome_ChatArchive_${Date.now()}.zip`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const startRecording = async () => {
    if (!canSendInGroup) return;
    try {
      setMicError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      audioChunksRef.current = [];

      let recorder: MediaRecorder;
      try {
        // Enforce 24 kbps low-bitrate compression for optimal storage and Firestore document safety
        recorder = new MediaRecorder(stream, { 
          mimeType: 'audio/webm',
          audioBitsPerSecond: 24000
        });
      } catch (e) {
        try {
          recorder = new MediaRecorder(stream, { 
            audioBitsPerSecond: 24000
          });
        } catch (e2) {
          recorder = new MediaRecorder(stream);
        }
      }

      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = () => {
          if (!canSendInGroup) return;
          const base64Audio = reader.result as string;
          // Send audio note using correct non-stale duration ref
          onSendMessage("Voice Note 🎙️", replyTarget || undefined, base64Audio, recordingSecondsRef.current, undefined, undefined, activePartner || undefined);
          setReplyTarget(null);
        };

        if (streamRef.current) {
          streamRef.current.getTracks().forEach((track) => track.stop());
        }
      };

      recorder.start();
      setIsRecording(true);
      recordingSecondsRef.current = 0;
      setRecordingSeconds(0);

      recordingIntervalRef.current = setInterval(() => {
        recordingSecondsRef.current += 1;
        setRecordingSeconds(recordingSecondsRef.current);
        if (recordingSecondsRef.current >= 300) { // Generous 5-minute limit (300 seconds)
          stopRecording();
        }
      }, 1000);

    } catch (err) {
      console.error("Microphone access denied or error:", err);
      setMicError("Microphone access denied. Please allow microphone permissions in your browser.");
      setTimeout(() => setMicError(null), 5000);
    }
  };

  const stopRecording = () => {
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  };

  const cancelRecording = () => {
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.stop();
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
    }

    setIsRecording(false);
    recordingSecondsRef.current = 0;
    setRecordingSeconds(0);
  };

  // Re-evaluate online status periodically
  useEffect(() => {
    const timer = setInterval(() => {
      setTick((t) => t + 1);
    }, 10000);
    return () => clearInterval(timer);
  }, []);

  const isUserOnline = (username: string) => {
    const presence = userPresences.find(
      (p) => p.username.toLowerCase().trim() === username.toLowerCase().trim()
    );
    if (!presence) return false;
    const diffMs = new Date().getTime() - new Date(presence.lastActive).getTime();
    // Use Math.abs and a wider window (60 seconds) to resiliently tolerate browser clock skew and update delays
    return Math.abs(diffMs) < 60000;
  };

  const scrollToBottom = (behavior: any = 'smooth') => {
    if (messagesContainerRef.current) {
      const container = messagesContainerRef.current;
      const validBehavior: ScrollBehavior = (behavior === 'smooth' || behavior === 'auto' || behavior === 'instant')
        ? behavior
        : 'smooth';
      container.scrollTo({
        top: container.scrollHeight,
        behavior: validBehavior
      });
    }
  };

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    const isScrolledUp = target.scrollHeight - target.scrollTop - target.clientHeight > 150;
    setShowScrollToBottom(isScrolledUp);
  };

  // Instantly lock scroll to bottom on initial mount or when tab gains focus
  useEffect(() => {
    scrollToBottom('auto');
    // Staggered layout settling fallbacks (handles slow base64 image renders, flex layout, etc)
    const t1 = setTimeout(() => scrollToBottom('auto'), 50);
    const t2 = setTimeout(() => scrollToBottom('auto'), 300);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  // Handle subsequent messages changes: smooth scroll for new incoming/outgoing text; instant adjust for static changes
  const prevMessagesLength = useRef(conversationMessages.length);
  const prevActivePartnerRef = useRef<string | null>(null);

  useEffect(() => {
    setShowMediaGallery(false); // Reset gallery when changing partner
    // If the active partner has changed, scroll to bottom instantly and reset the tracked length
    if (activePartner !== prevActivePartnerRef.current) {
      scrollToBottom('auto');
      // Staggered layout settling fallbacks
      const t = setTimeout(() => scrollToBottom('auto'), 80);
      prevActivePartnerRef.current = activePartner;
      prevMessagesLength.current = conversationMessages.length;
      return () => clearTimeout(t);
    }

    // If the active partner didn't change, we only scroll if a new message is added to the active conversation
    if (conversationMessages.length > prevMessagesLength.current) {
      const lastMsg = conversationMessages[conversationMessages.length - 1];
      const isMyMessage = lastMsg?.sender.toLowerCase().trim() === currentUser.toLowerCase().trim();
      
      // Scroll to bottom if:
      // 1. It is our own sent message (we want immediate feedback)
      // 2. OR the user is already near the bottom (not scrolled way up)
      if (isMyMessage || !showScrollToBottom) {
        scrollToBottom('smooth');
      }
    }
    
    // Always keep the tracked length up to date
    prevMessagesLength.current = conversationMessages.length;
  }, [conversationMessages.length, activePartner, currentUser, showScrollToBottom]);

  // Automatically mark partner's incoming messages in the active direct conversation as seen in Firestore
  useEffect(() => {
    if (activePartner && currentUser) {
      const unseenPartnerMessages = conversationMessages.filter(
        (msg) => msg.sender.toLowerCase().trim() === activePartner.toLowerCase().trim() && !msg.seen
      );
      if (unseenPartnerMessages.length > 0) {
        unseenPartnerMessages.forEach((msg) => {
          saveChatMessageDoc({ ...msg, seen: true }).catch((err) =>
            console.error("Error updating message seen status in active chat:", err)
          );
        });
      }
    }
  }, [activePartner, conversationMessages, currentUser]);

  const handleJumpToMessage = (messageId: string) => {
    const element = document.getElementById(`chat-message-${messageId}`);
    const container = messagesContainerRef.current;
    if (element && container) {
      const elementTop = element.offsetTop - container.offsetTop;
      container.scrollTo({
        top: Math.max(0, elementTop - container.clientHeight / 2),
        behavior: 'smooth'
      });
      // Temporary high impact highlight
      element.classList.add('bg-rose-500/15', 'ring-1', 'ring-rose-500/40', 'scale-[1.01]', 'duration-300');
      setTimeout(() => {
        element.classList.remove('bg-rose-500/15', 'ring-1', 'ring-rose-500/40', 'scale-[1.01]', 'duration-300');
      }, 2500);
    }
  };

  const pinnedMessages = conversationMessages.filter((msg) => msg.pinned);
  const savedMessages = conversationMessages.filter((msg) => savedMessageIds.includes(msg.id));

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!canSendInGroup) return;
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    // Filter by max 15MB size
    const validFiles = files.filter((f) => {
      if (f.size > 15 * 1024 * 1024) {
        setMicError(`"${f.name}" is over 15MB limit.`);
        setTimeout(() => setMicError(null), 5000);
        return false;
      }
      return true;
    });

    if (validFiles.length === 0) return;

    // Create attachment records with immediate blob preview
    const newAttachments: AttachedChatPhoto[] = validFiles.map((file) => ({
      id: `att-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      file,
      previewUrl: URL.createObjectURL(file),
      isUploading: true
    }));

    setAttachedPhotos((prev) => [...prev, ...newAttachments]);

    // Asynchronously upload each image with optimization
    for (const att of newAttachments) {
      try {
        const realUrl = await uploadChatImage(att.file);
        setAttachedPhotos((prev) =>
          prev.map((item) => (item.id === att.id ? { ...item, uploadedUrl: realUrl, isUploading: false } : item))
        );
      } catch (err) {
        console.error("Failed to upload attached photo:", err);
        setAttachedPhotos((prev) => prev.filter((item) => item.id !== att.id));
        setMicError("Failed to upload one of the attached photos. Please try again.");
        setTimeout(() => setMicError(null), 5000);
      }
    }

    e.target.value = '';
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSendInGroup) return;
    if (isUploadingAnyPhoto) return;

    const readyPhotos = attachedPhotos.filter((p) => !!p.uploadedUrl);
    if (!inputText.trim() && readyPhotos.length === 0) return;

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    updateUserPresenceDoc(currentUser, lastReadChatTime, null, null);

    if (readyPhotos.length === 0) {
      // Plain text message
      onSendMessage(
        inputText.trim(),
        replyTarget || undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        activePartner || undefined
      );
    } else {
      // Send first photo with inputText (or default caption)
      const firstPhoto = readyPhotos[0];
      const firstCaption = inputText.trim() || "Shared a photo 📸";
      onSendMessage(
        firstCaption,
        replyTarget || undefined,
        undefined,
        undefined,
        firstPhoto.uploadedUrl,
        undefined,
        activePartner || undefined
      );

      // Consecutively send any additional photos selected in this batch
      for (let i = 1; i < readyPhotos.length; i++) {
        await new Promise((resolve) => setTimeout(resolve, 80));
        onSendMessage(
          "Shared a photo 📸",
          undefined,
          undefined,
          undefined,
          readyPhotos[i].uploadedUrl,
          undefined,
          activePartner || undefined
        );
      }
    }

    setInputText('');
    setReplyTarget(null);
    setAttachedPhotos([]);
  };

  const handleSetReplyTarget = (msg: ChatMessage) => {
    setReplyTarget(msg);
    setTimeout(() => {
      chatInputRef.current?.focus();
    }, 50);
  };

  const quickReactions = ['♥️', '🥰', '💖', '😆', '🔥', '🌹'];

  const formatMessageTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
    } catch {
      return '';
    }
  };

  const formatMessageDate = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return '';
    }
  };

  const formatDetailedMessageTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      const now = new Date();
      const isToday = date.toDateString() === now.toDateString();
      const timeStr = date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
      if (isToday) {
        return `Today at ${timeStr}`;
      }
      const isYesterday = new Date(now.getTime() - 86400000).toDateString() === date.toDateString();
      if (isYesterday) {
        return `Yesterday at ${timeStr}`;
      }
      const dateStr = date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
      return `${dateStr} at ${timeStr}`;
    } catch {
      return '';
    }
  };

  const isMessageRead = (msg: ChatMessage): boolean => {
    if (msg.seen) return true;
    if (msg.seenBy && Array.isArray(msg.seenBy)) {
      const readers = msg.seenBy.filter(u => u.toLowerCase().trim() !== msg.sender.toLowerCase().trim());
      if (readers.length > 0) return true;
    }
    const partner = activePartner ? activePartner.toLowerCase().trim() : '';
    if (!partner || partner === 'global' || partner.startsWith('group_')) return false;

    if (partnerPresence && partnerPresence.lastReadChatTime) {
      const lastReadMs = partnerPresence.lastReadChatTime;
      const msgMs = new Date(msg.timestamp).getTime();
      return lastReadMs >= msgMs;
    }
    return false;
  };

  // Find the first message that was sent by the other user and is newer than lastReadChatTime
  const firstUnreadIndex = lastReadChatTime !== undefined
    ? conversationMessages.findIndex(msg => 
        msg.sender.toLowerCase().trim() !== currentSender.toLowerCase() && 
        new Date(msg.timestamp).getTime() > lastReadChatTime
      )
    : -1;

  // Group messages by date
  const renderMessageGroups = () => {
    let lastDate = '';
    
    const filteredMessages = searchQuery.trim()
      ? conversationMessages.filter((msg) =>
          msg.content.toLowerCase().includes(searchQuery.toLowerCase())
        )
      : conversationMessages;

    if (filteredMessages.length === 0 && searchQuery.trim()) {
      return (
        <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-3">
          <div className="p-3 bg-white/5 border border-white/10 rounded-full text-neutral-400">
            <Search className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-semibold text-neutral-300">No past sweet words found</p>
            <p className="text-xs text-neutral-500 mt-1 max-w-xs">No messages match your search term "{searchQuery}".</p>
            <button
              onClick={() => setSearchQuery('')}
              className="text-xs text-rose-400 underline hover:text-rose-300 mt-2 font-semibold cursor-pointer"
            >
              Clear Search
            </button>
          </div>
        </div>
      );
    }

    return filteredMessages.map((msg, index) => {
      const msgDateStr = formatMessageDate(msg.timestamp);
      const showDateDivider = msgDateStr !== lastDate;
      lastDate = msgDateStr;

      const isMyMessage = msg.sender.toLowerCase() === currentSender.toLowerCase();
      const isFirstUnread = !searchQuery.trim() && index === firstUnreadIndex;
      const isSystemMessage = msg.isSystem || msg.sender.toLowerCase().trim() === 'system';
      
      if (isSystemMessage) {
        return (
          <div 
            key={`msg-sys-${msg.id || 'sys'}-${index}`} 
            id={`chat-message-${msg.id}`} 
            className="space-y-3 transition-all duration-300 my-2"
          >
            {isFirstUnread && (
              <div className="flex items-center gap-2 my-6 px-4 animate-pulse">
                <div className="flex-1 h-[1px] bg-gradient-to-r from-transparent to-rose-500/50" />
                <span className="text-[10px] uppercase font-bold tracking-widest text-rose-400 bg-rose-950/80 border border-rose-500/30 px-3 py-1 rounded-full shadow-lg flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-ping" />
                  Unread Messages
                </span>
                <div className="flex-1 h-[1px] bg-gradient-to-r from-rose-500/50 to-transparent" />
              </div>
            )}

            {showDateDivider && (
              <div className="flex justify-center my-4">
                <span className="px-3 py-1 bg-neutral-900/80 border border-white/5 rounded-full text-[10px] font-mono uppercase tracking-widest text-neutral-500">
                  {msgDateStr}
                </span>
              </div>
            )}

            <div className="flex justify-center my-2 px-4">
              <div className="bg-purple-950/60 border border-purple-500/30 text-purple-200 text-[11px] font-medium px-4 py-1.5 rounded-full shadow-lg flex items-center justify-center gap-2 max-w-md text-center font-sans tracking-wide">
                <Users className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                <span>{msg.content}</span>
                <span className="text-[9px] text-purple-300/60 font-mono ml-1">{formatDetailedMessageTime(msg.timestamp)}</span>
              </div>
            </div>
          </div>
        );
      }

      return (
        <div 
          key={`msg-${msg.id || 'msg'}-${index}`} 
          id={`chat-message-${msg.id}`} 
          className="space-y-3 transition-all duration-500 rounded-2xl"
        >
          {isFirstUnread && (
            <div className="flex items-center gap-2 my-6 px-4 animate-pulse">
              <div className="flex-1 h-[1px] bg-gradient-to-r from-transparent to-rose-500/50" />
              <span className="text-[10px] uppercase font-bold tracking-widest text-rose-400 bg-rose-950/80 border border-rose-500/30 px-3 py-1 rounded-full shadow-lg flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-ping" />
                Unread Messages
              </span>
              <div className="flex-1 h-[1px] bg-gradient-to-r from-rose-500/50 to-transparent" />
            </div>
          )}

          {showDateDivider && (
            <div className="flex justify-center my-4">
              <span className="px-3 py-1 bg-neutral-900/80 border border-white/5 rounded-full text-[10px] font-mono uppercase tracking-widest text-neutral-500">
                {msgDateStr}
              </span>
            </div>
          )}

          <div
            onClick={(e) => {
              if (isSelectionMode) {
                const target = e.target as HTMLElement;
                if (target.closest('button') || target.closest('input') || target.closest('a')) {
                  return;
                }
                e.stopPropagation();
                handleToggleSelectMessage(msg.id);
              }
            }}
            className={`w-full flex flex-col ${
              isMyMessage ? 'items-end' : 'items-start'
            } group relative mb-2 px-1 ${isSelectionMode ? 'cursor-pointer select-none' : ''}`}
          >
            {/* Sender label (only show if not me, or if group changes) */}
            <div className="flex items-center gap-1.5 mb-1 px-1">
              <span 
                className={`h-1.5 w-1.5 rounded-full ${
                  isUserOnline(msg.sender) ? 'bg-emerald-500 animate-pulse' : 'bg-neutral-600'
                }`} 
                title={isUserOnline(msg.sender) ? 'Online' : 'Offline'}
              />
              <span className="text-[11px] font-semibold text-rose-200/70">
                {msg.sender}
              </span>
              {!isMyMessage && activePartner?.toLowerCase().trim() === 'global' && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    startChatWithPartner(msg.sender);
                  }}
                  className="text-[9px] bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/25 hover:border-rose-500/40 px-1.5 py-0.5 rounded-md flex items-center gap-1 transition-all cursor-pointer font-sans shadow-sm active:scale-95 ml-1"
                  title={`Start direct chat with ${msg.sender}`}
                >
                  <MessageSquare className="w-2.5 h-2.5 text-rose-400" />
                  <span>Chat</span>
                </button>
              )}
              {msg.pinned && (
                <span className="text-[8.5px] bg-amber-500/10 border border-amber-500/30 text-amber-300 px-1.5 py-0.5 rounded-full flex items-center gap-0.5 ml-1 font-sans">
                  <Pin className="w-2.5 h-2.5 fill-amber-300 text-amber-300" /> Pinned
                </span>
              )}
            </div>

            {/* Message Bubble Container */}
            <div className={`flex items-center gap-2.5 w-full max-w-[95%] sm:max-w-[75%] ${
              isMyMessage ? 'justify-end' : 'justify-start'
            }`}>
              
              {isSelectionMode && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleToggleSelectMessage(msg.id);
                  }}
                  className={`p-1.5 rounded-xl border flex items-center justify-center transition-all duration-200 active:scale-90 cursor-pointer shrink-0 ${
                    selectedMessageIds.includes(msg.id)
                      ? 'bg-rose-500/20 border-rose-500/50 text-rose-400 shadow-[0_0_8px_rgba(244,63,94,0.15)]'
                      : 'bg-neutral-900 border-white/10 text-neutral-500 hover:text-rose-300 hover:border-rose-500/25'
                  }`}
                >
                  {selectedMessageIds.includes(msg.id) ? (
                    <CheckSquare className="w-4 h-4 fill-rose-500/10" />
                  ) : (
                    <Square className="w-4 h-4" />
                  )}
                </button>
              )}
              
              {/* Message actions trigger - Reply, Smile and 3 dots menu */}
              {isMyMessage && !isSelectionMode && (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSetReplyTarget(msg);
                    }}
                    className="opacity-100 md:opacity-0 md:group-hover:opacity-100 p-1 bg-white/5 active:scale-90 hover:bg-white/10 rounded-full text-neutral-400 hover:text-rose-400 transition-all duration-200 cursor-pointer shrink-0"
                    title="Reply"
                  >
                    <CornerUpLeft className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowEmojiPickerForId(showEmojiPickerForId === msg.id ? null : msg.id);
                    }}
                    className="opacity-100 md:opacity-0 md:group-hover:opacity-100 p-1 bg-white/5 active:scale-90 hover:bg-white/10 rounded-full text-neutral-400 hover:text-rose-400 transition-all duration-200 cursor-pointer shrink-0"
                    title="Add Reaction"
                  >
                    <Smile className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveMobileMenuMessage(msg);
                    }}
                    className="opacity-100 md:opacity-0 md:group-hover:opacity-100 p-1 bg-white/5 active:scale-90 hover:bg-white/10 rounded-full text-neutral-400 hover:text-rose-400 transition-all duration-200 cursor-pointer shrink-0"
                    title="Message Actions"
                  >
                    <MoreVertical className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* Bubble */}
              <div className="relative min-w-0 max-w-full">
                {/* Swipe-to-reply background indicator */}
                <div className={`absolute inset-y-0 flex items-center pointer-events-none transition-opacity duration-200 ${
                  isMyMessage ? '-right-10 justify-start' : '-left-10 justify-end'
                }`}>
                  <div className="p-1.5 bg-rose-500/20 text-rose-300 rounded-full border border-rose-500/30 scale-90">
                    <CornerUpLeft className="w-4 h-4" />
                  </div>
                </div>

                {msg.pinned && (
                  <div 
                    className={`absolute z-20 -top-1.5 ${
                      isMyMessage ? '-left-1.5' : '-right-1.5'
                    } bg-amber-500 text-neutral-950 rounded-full p-1 shadow-lg border border-amber-400 animate-bounce-short cursor-pointer hover:bg-amber-400 transition-colors`}
                    title="Pinned Message"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (isSelectionMode) {
                        handleToggleSelectMessage(msg.id);
                        return;
                      }
                      onTogglePinMessage?.(msg.id);
                    }}
                  >
                    <Pin className="w-2.5 h-2.5 fill-neutral-950 text-neutral-950" />
                  </div>
                )}
                <motion.div
                  drag="x"
                  dragDirectionLock
                  dragConstraints={{ left: 0, right: 0 }}
                  dragElastic={isMyMessage ? { left: 0.5, right: 0 } : { left: 0, right: 0.5 }}
                  onDragEnd={(e, info) => {
                    const threshold = 50;
                    if (isMyMessage) {
                      if (info.offset.x < -threshold) {
                        handleSetReplyTarget(msg);
                      }
                    } else {
                      if (info.offset.x > threshold) {
                        handleSetReplyTarget(msg);
                      }
                    }
                  }}
                  onClick={(e) => {
                    // Prevent toggling if clicking inside interactive audio elements
                    const target = e.target as HTMLElement;
                    if (target.closest('button') || target.closest('input[type="range"]')) {
                      return;
                    }
                    if (isSelectionMode) {
                      e.stopPropagation();
                      handleToggleSelectMessage(msg.id);
                      return;
                    }
                    setActiveMobileMenuMessage(msg);
                  }}
                  className={`rounded-2xl px-4 py-2.5 shadow-md border cursor-pointer select-none active:scale-[0.99] transition-all duration-150 max-w-full overflow-hidden ${
                    isMyMessage
                      ? 'bg-rose-500/10 border-rose-500/20 text-rose-100 rounded-tr-none hover:border-rose-500/40'
                      : 'bg-neutral-900 border-white/10 text-neutral-200 rounded-tl-none hover:border-white/20'
                  }`}
                >
                  {/* Reply Context inside Bubble */}
                  {msg.replyTo && (
                    <div className="mb-2 p-2 bg-neutral-950/60 border-l-2 border-rose-500/40 rounded text-xs text-neutral-400 font-sans italic flex flex-col gap-0.5">
                      <span className="text-[10px] font-semibold text-rose-400">
                        Replying to {msg.replyTo.sender}
                      </span>
                      <p className="truncate max-w-[200px]">{msg.replyTo.content}</p>
                    </div>
                  )}

                  {msg.imageUrl && (() => {
                    const isUploadingImage = msg.imageUrl.startsWith('uploading_blob:');
                    const displayImageUrl = isUploadingImage ? msg.imageUrl.replace('uploading_blob:', '') : msg.imageUrl;
                    
                    if (isUploadingImage) {
                      if (isMyMessage) {
                        return (
                          <div className="mb-2 max-w-xs sm:max-w-md rounded-xl overflow-hidden border border-white/10 shadow-sm relative bg-neutral-900 min-h-[150px] flex items-center justify-center">
                            <img 
                              src={displayImageUrl} 
                              alt="Uploading memory..." 
                              className="w-full h-auto object-cover max-h-[300px] rounded-lg opacity-40 blur-[1px]" 
                              referrerPolicy="no-referrer"
                            />
                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/40">
                              <Loader2 className="w-5 h-5 text-rose-400 animate-spin" />
                              <span className="text-xs text-rose-200 font-medium font-sans">Optimizing & uploading...</span>
                            </div>
                          </div>
                        );
                      } else {
                        // Partner's screen before upload completes
                        return (
                          <div className="mb-2 w-48 sm:w-64 h-36 rounded-xl overflow-hidden border border-rose-500/10 shadow-sm relative bg-neutral-900 flex flex-col items-center justify-center gap-2 animate-pulse">
                            <ImageIcon className="w-8 h-8 text-rose-400/50" />
                            <div className="flex items-center gap-1.5">
                              <Loader2 className="w-3.5 h-3.5 text-rose-400 animate-spin" />
                              <span className="text-xs text-rose-300 font-sans">Sending a sweet photo...</span>
                            </div>
                          </div>
                        );
                      }
                    }

                    return (
                      <div className="mb-2 w-full max-w-full sm:max-w-md rounded-xl overflow-hidden border border-white/10 shadow-sm relative group/img">
                        <img 
                          src={displayImageUrl} 
                          alt="Shared memory" 
                          className="w-full h-auto object-cover max-h-[300px] rounded-lg cursor-zoom-in hover:scale-[1.01] transition-transform duration-200" 
                          referrerPolicy="no-referrer"
                          onClick={(e) => {
                            e.stopPropagation();
                            const idx = imageMessages.findIndex(m => m.id === msg.id || m.imageUrl === displayImageUrl);
                            if (idx !== -1) {
                              setActiveLightboxIndex(idx);
                            }
                          }}
                        />
                      </div>
                    );
                  })()}

                  {msg.audioUrl ? (
                    <div className="space-y-2">
                      <VoiceNotePlayer audioUrl={msg.audioUrl} duration={msg.audioDuration} isFloating={isFloating} />
                      {msg.content && msg.content !== "Voice Note 🎙️" && msg.content !== "Shared a photo 📸" && (
                        <p className="text-sm leading-relaxed whitespace-pre-wrap font-sans break-words mt-1">
                          <HighlightText text={msg.content} search={searchQuery} />
                        </p>
                      )}
                    </div>
                  ) : (
                    msg.content && msg.content !== "Shared a photo 📸" && (
                      <p className="text-sm leading-relaxed whitespace-pre-wrap font-sans break-words">
                        <HighlightText text={msg.content} search={searchQuery} />
                      </p>
                    )
                  )}

                  {/* Message reaction display */}
                  {msg.reaction && (
                    <div className="absolute -bottom-2 -right-1 bg-neutral-950 border border-white/10 rounded-full px-1.5 py-0.5 text-xs shadow-lg animate-bounce-short">
                      {msg.reaction}
                    </div>
                  )}
                </motion.div>
              </div>

              {/* Message actions trigger - Reply, Smile and 3 dots menu */}
              {!isMyMessage && !isSelectionMode && (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSetReplyTarget(msg);
                    }}
                    className="opacity-100 md:opacity-0 md:group-hover:opacity-100 p-1.5 bg-white/5 active:scale-90 hover:bg-white/10 rounded-full text-neutral-400 hover:text-rose-400 transition-all duration-200 cursor-pointer shrink-0"
                    title="Reply"
                  >
                    <CornerUpLeft className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveMobileMenuMessage(msg);
                    }}
                    className="opacity-100 md:opacity-0 md:group-hover:opacity-100 p-1.5 bg-white/5 active:scale-90 hover:bg-white/10 rounded-full text-neutral-400 hover:text-rose-400 transition-all duration-200 cursor-pointer shrink-0"
                    title="Message Actions"
                  >
                    <MoreVertical className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowEmojiPickerForId(showEmojiPickerForId === msg.id ? null : msg.id);
                    }}
                    className="opacity-100 md:opacity-0 md:group-hover:opacity-100 p-1.5 bg-white/5 active:scale-90 hover:bg-white/10 rounded-full text-neutral-400 hover:text-rose-400 transition-all duration-200 cursor-pointer shrink-0"
                    title="Add Reaction"
                  >
                    <Smile className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>

            {/* Detailed timestamp beneath the bubble */}
            <div className={`mt-1 text-[9px] text-neutral-500 font-mono px-2 flex items-center gap-1.5 ${
              isMyMessage ? 'text-right justify-end' : 'text-left justify-start'
            }`}>
              <span>{formatDetailedMessageTime(msg.timestamp)}</span>
              {(() => {
                if (!isMyMessage) return null;

                const seenByMembers = (msg.seenBy || []).filter(u => u.toLowerCase().trim() !== currentSender.toLowerCase().trim());
                const isRead = isMessageRead(msg) || seenByMembers.length > 0;

                if (activeGroup) {
                  return (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setMessageSeenInfoTarget(msg);
                      }}
                      className={`flex items-center gap-1 font-sans transition-colors cursor-pointer px-1.5 py-0.5 rounded-md ${
                        seenByMembers.length > 0
                          ? 'text-rose-400 bg-rose-500/10 border border-rose-500/20 hover:bg-rose-500/20 font-medium'
                          : 'text-neutral-500 hover:text-neutral-300'
                      }`}
                      title="Click to view group message read status"
                    >
                      • {seenByMembers.length > 0 ? (
                        <>
                          <span>Seen by {seenByMembers.length}</span>
                          <div className="flex items-center">
                            <Check className="w-3 h-3 -mr-1 text-rose-400 stroke-[3]" />
                            <Check className="w-3 h-3 text-rose-400 stroke-[3]" />
                          </div>
                        </>
                      ) : (
                        <>
                          <span>Sent</span>
                          <Check className="w-3 h-3 text-neutral-500 stroke-[2]" />
                        </>
                      )}
                      <Info className="w-2.5 h-2.5 opacity-70 ml-0.5" />
                    </button>
                  );
                }

                return (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMessageSeenInfoTarget(msg);
                    }}
                    className="flex items-center gap-1 select-none cursor-pointer hover:underline"
                    title="Click to view message info"
                  >
                    • {isRead ? (
                      <span className="flex items-center gap-0.5 text-rose-400 font-sans font-medium">
                        Seen
                        <div className="flex items-center">
                          <Check className="w-3 h-3 -mr-1 text-rose-400 stroke-[3]" />
                          <Check className="w-3 h-3 text-rose-400 stroke-[3]" />
                        </div>
                      </span>
                    ) : (
                      <span className="flex items-center gap-0.5 text-neutral-600 font-sans">
                        Sent
                        <Check className="w-3 h-3 text-neutral-500 stroke-[2]" />
                      </span>
                    )}
                    <Info className="w-2.5 h-2.5 text-neutral-500 opacity-60 ml-0.5" />
                  </button>
                );
              })()}
            </div>

            {/* Float Emoji Reaction Picker below bubble */}
            {/* Float Emoji Reaction Picker on top of message */}
            <AnimatePresence>
              {showEmojiPickerForId === msg.id && (
                <>
                  {/* Invisible full-screen backdrop to handle click-away closing cleanly */}
                  <div 
                    className="fixed inset-0 z-20 cursor-default" 
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowEmojiPickerForId(null);
                    }} 
                  />
                  <motion.div
                    initial={{ opacity: 0, y: -6, scale: 0.9 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -6, scale: 0.9 }}
                    transition={{ duration: 0.15 }}
                    className={`absolute z-30 -top-11 sm:-top-12 bg-neutral-900/95 backdrop-blur-md border border-white/15 p-1.5 sm:p-2 rounded-2xl shadow-[0_12px_30px_rgba(0,0,0,0.6)] flex gap-1.5 items-center ${
                      isMyMessage ? 'right-2' : 'left-2'
                    }`}
                  >
                    {quickReactions.map((emoji, idx) => (
                      <button
                        key={`quick-react-btn-${emoji}-${idx}`}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onReactToMessage(msg.id, emoji);
                          setShowEmojiPickerForId(null);
                        }}
                        className="hover:scale-135 transition-transform duration-150 p-1.5 text-lg rounded-xl hover:bg-white/10 active:scale-90 cursor-pointer select-none"
                      >
                        {emoji}
                      </button>
                    ))}
                    <div className="h-4 w-[1px] bg-white/10 mx-0.5" />
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onReactToMessage(msg.id, ''); // Clear reaction
                        setShowEmojiPickerForId(null);
                      }}
                      className="text-[10px] text-neutral-400 hover:text-white px-2 py-1 hover:bg-rose-500/20 hover:text-rose-300 font-semibold rounded-lg transition-colors cursor-pointer"
                    >
                      Clear
                    </button>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        </div>
      );
    });
  };

  return (
    <div 
      id="romantic_chat_tab" 
      className={`bg-neutral-950 text-white relative flex flex-col overflow-hidden h-full w-full ${
        isFloating 
          ? 'p-3 sm:p-4 rounded-none sm:rounded-2xl shadow-2xl' 
          : 'rounded-3xl p-4 sm:p-6 shadow-2xl shadow-neutral-950/80 border border-white/10'
      }`}
    >
      
      {/* Background Decorative Accents */}
      <div className="absolute top-0 right-0 w-[200px] h-[200px] bg-rose-500/5 rounded-full blur-[80px] pointer-events-none z-0"></div>
      <div className="absolute bottom-0 left-0 w-[200px] h-[200px] bg-purple-500/5 rounded-full blur-[80px] pointer-events-none z-0"></div>

      {/* Header */}
      <div className={`relative z-10 flex border-b border-white/10 pb-3 mb-3 ${
        isFloating 
          ? 'flex-row items-center justify-between gap-2' 
          : 'flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pb-4 mb-4'
      }`}>
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-rose-500/10 border border-rose-500/20 rounded-lg text-rose-500 shrink-0">
            <Heart className="w-3.5 h-3.5 fill-rose-500 animate-pulse" />
          </div>
          <div>
            <h2 className="font-serif text-xs sm:text-sm md:text-base font-bold tracking-tight text-white flex items-center gap-1">
              {isFloating ? "Our Sweet DM" : "Our Sweet Conversations"}
              <Sparkles className="w-3 h-3 text-rose-300/60 animate-spin-slow shrink-0" />
            </h2>
            <p className="text-[8px] sm:text-[9px] text-rose-200/50 font-mono uppercase tracking-widest">
              Live Connection • {currentSender} {isAdmin ? "👑" : ""}
            </p>
          </div>
        </div>

        {/* Actions Button Group */}
        <div className="flex items-center gap-2">
          {activePartner && (
            <>
              {/* Multi-Select Toggle Button */}
              <button
                type="button"
                onClick={() => {
                  if (isSelectionMode) {
                    setIsSelectionMode(false);
                    setSelectedMessageIds([]);
                  } else {
                    handleEnableSelectionMode();
                  }
                }}
                className={`p-1.5 rounded-lg transition-all cursor-pointer shrink-0 relative flex items-center justify-center ${
                  isSelectionMode 
                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' 
                    : 'text-neutral-400 hover:bg-white/10 hover:text-white'
                }`}
                title={isSelectionMode ? "Exit Multi-Select" : "Multi-Select Messages"}
              >
                <CheckSquare className="w-4 h-4 text-rose-400" />
                {selectedMessageIds.length > 0 && (
                  <span className="absolute -top-1 -right-1 bg-rose-500 text-white text-[8px] font-bold h-3.5 min-w-[14px] px-1 rounded-full flex items-center justify-center shadow-md animate-pulse">
                    {selectedMessageIds.length}
                  </span>
                )}
              </button>

              {/* Settings Dropdown Trigger */}
              <button
                type="button"
                onClick={() => setShowSettingsDropdown(!showSettingsDropdown)}
                className={`p-1.5 rounded-lg transition-all cursor-pointer shrink-0 relative flex items-center justify-center ${
                  showSettingsDropdown 
                    ? 'bg-rose-500/20 text-rose-300' 
                    : 'text-neutral-400 hover:bg-white/10 hover:text-white'
                }`}
                title="Chat Settings"
              >
                <Settings className={`w-4 h-4 ${showSettingsDropdown ? 'rotate-90 duration-300 text-rose-300' : 'transition-transform hover:rotate-45 text-neutral-400'}`} />
                {/* Dot indicator if sound is muted or search query is active */}
                {(!isSoundEnabled || searchQuery.trim()) && (
                  <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-rose-500 rounded-full shadow-[0_0_4px_#f43f5e]" />
                )}
              </button>
            </>
          )}

          {/* Close Chat Window / Modal Button */}
          {onCloseToggle && (
            <button
              type="button"
              onClick={onCloseToggle}
              className="p-1.5 hover:bg-rose-500/20 hover:text-rose-300 rounded-xl text-neutral-400 border border-white/10 bg-white/5 transition-all cursor-pointer shrink-0"
              title="Close Chat"
            >
              <X className="w-4 h-4 text-rose-400" />
            </button>
          )}
        </div>
      </div>

      {/* Dynamic Private Chat Split Workspace */}
      <div className="flex flex-1 overflow-hidden min-h-0 min-w-0 w-full relative z-10 gap-4 mt-1">
        {/* Contact Sidebar */}
        <div className={`${
          isFloating 
            ? (activePartner ? 'hidden' : 'flex w-full') 
            : (activePartner ? 'hidden md:flex md:w-64' : 'flex w-full md:w-64')
        } flex-col border-r border-white/5 pr-3 shrink-0 min-h-0`}>
          {/* User Search Box to start a new chat */}
          <div className="relative mb-4">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-neutral-500">
              <Search className="w-4 h-4" />
            </span>
            <input
              type="text"
              placeholder="Search user to start chat..."
              value={partnerSearchQuery}
              onChange={(e) => setPartnerSearchQuery(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-8 py-2 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-rose-500/50 transition-colors"
            />
            {partnerSearchQuery && (
              <button
                type="button"
                onClick={() => setPartnerSearchQuery('')}
                className="absolute inset-y-0 right-0 flex items-center pr-2.5 text-neutral-500 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Chat with Myself Quick Shortcut */}
          {!partnerSearchQuery.trim() && (
            <button
              onClick={() => startChatWithPartner(currentSender)}
              className="mb-4 w-full flex items-center gap-3 p-3 rounded-2xl bg-rose-500/5 hover:bg-rose-500/10 border border-rose-500/10 hover:border-rose-500/20 text-left transition-all cursor-pointer group"
            >
              <div className="w-8 h-8 rounded-full bg-rose-500/10 flex items-center justify-center text-rose-400 group-hover:scale-105 transition-transform">
                <Bookmark className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-xs text-rose-200">
                  Notes to Self
                </p>
                <p className="text-[9px] text-neutral-400 font-sans truncate">
                  Your private, secure notepad space
                </p>
              </div>
            </button>
          )}

          <div className="text-[10px] uppercase font-bold tracking-widest text-neutral-500 mb-3 pl-1 font-sans flex items-center justify-between shrink-0">
            <span>{partnerSearchQuery.trim() ? 'Search Results' : 'Your Conversations'}</span>
            {!partnerSearchQuery.trim() && (
              <button
                type="button"
                onClick={() => {
                  setSelectedGroupMembers([]);
                  setGroupMemberSearchQuery('');
                  setNewGroupName('');
                  setNewGroupDesc('');
                  setIsCreateGroupModalOpen(true);
                }}
                className="text-[10px] bg-purple-500/15 hover:bg-purple-500/25 text-purple-300 border border-purple-500/30 px-2 py-0.5 rounded-lg flex items-center gap-1 transition-all cursor-pointer font-sans font-bold"
                title="Create a new group chat"
              >
                <Users className="w-3 h-3 text-purple-400" />
                <span>+ Group</span>
              </button>
            )}
            {partnerSearchQuery.trim() && (
              <span className="text-[9px] bg-rose-500/10 text-rose-300 border border-rose-500/20 px-1.5 py-0.5 rounded-md uppercase font-extrabold tracking-normal">
                Filter
              </span>
            )}
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
            {/* Pending Group Invitations Banner / Cards */}
            {!partnerSearchQuery.trim() && pendingGroupInvites.length > 0 && (
              <div className="mb-3 space-y-2">
                <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-amber-300 bg-amber-500/15 border border-amber-500/30 px-2.5 py-1.5 rounded-xl shadow-sm">
                  <span className="flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
                    Pending Invites ({pendingGroupInvites.length})
                  </span>
                  <span className="h-2 w-2 rounded-full bg-amber-400 animate-ping" />
                </div>

                {pendingGroupInvites.map((group, idx) => (
                  <div
                    key={`pending-sidebar-invite-${group.id}-${idx}`}
                    className="p-3 rounded-2xl bg-gradient-to-br from-purple-950/60 to-indigo-950/60 border border-purple-500/40 space-y-2 shadow-lg"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-purple-500/25 border border-purple-500/40 flex items-center justify-center font-bold text-xs text-purple-200 shrink-0 uppercase">
                        {group.name.substring(0, 2)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-white truncate">{group.name}</p>
                        <p className="text-[10px] text-purple-300/80 font-sans truncate">
                          Invited by <span className="font-semibold text-purple-200">{group.createdBy}</span>
                        </p>
                      </div>
                    </div>

                    {group.description && (
                      <p className="text-[10.5px] text-neutral-300 font-sans italic line-clamp-2 bg-black/30 p-2 rounded-xl">
                        "{group.description}"
                      </p>
                    )}

                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => handleAcceptGroupInvite(group)}
                        className="flex-1 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1 transition-all cursor-pointer shadow-md"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Accept</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRejectGroupInvite(group)}
                        className="flex-1 py-1.5 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 font-bold text-xs rounded-xl flex items-center justify-center gap-1 transition-all cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                        <span>Decline</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {partnerSearchQuery.trim() ? (
              (() => {
                const query = partnerSearchQuery.toLowerCase().trim();
                const connectedMatches = displayedPartners.filter(item => {
                  const normUser = item.username.toLowerCase().trim();
                  if (normUser.includes(query)) return true;
                  if (item.isGlobal && ('global lounge'.includes(query) || 'community'.includes(query) || 'public'.includes(query))) return true;
                  if (item.isSelf && ('notes to self'.includes(query) || 'personal'.includes(query) || 'notepad'.includes(query))) return true;
                  return messages.some(msg => {
                    const msgContent = (msg.content || '').toLowerCase();
                    if (!msgContent.includes(query)) return false;
                    if (item.isGlobal) return msg.conversationId === 'global' || (msg.receiver || '').toLowerCase().trim() === 'global';
                    const msgSender = msg.sender.toLowerCase().trim();
                    const msgReceiver = (msg.receiver || '').toLowerCase().trim();
                    const me = currentSender.toLowerCase().trim();
                    if (item.isSelf) return msgSender === me && msgReceiver === me;
                    return (msgSender === me && msgReceiver === normUser) || (msgSender === normUser && msgReceiver === me) || msg.conversationId === [me, normUser].sort().join('_');
                  });
                });

                if (connectedMatches.length === 0) {
                  return (
                    <div className="text-center py-12 text-neutral-500 text-xs italic">
                      No matching conversations found.
                    </div>
                  );
                }

                return (
                  <div className="space-y-2">
                    {connectedMatches.map((partner, idx) => {
                      const isSelected = activePartner?.toLowerCase().trim() === partner.username.toLowerCase().trim();
                      const online = isUserOnline(partner.username);
                      const unreadCount = getUnreadCountForPartner(partner.username);
                      const hasUnread = unreadCount > 0;
                      const isSelf = partner.isSelf || partner.username.toLowerCase().trim() === currentSender.toLowerCase().trim();
                      const isGlobal = partner.isGlobal || partner.username.toLowerCase().trim() === 'global';

                      return (
                        <button
                          key={`search-connected-${partner.id || partner.username}-${idx}`}
                          onClick={() => {
                            setActivePartner(partner.username);
                            setPartnerSearchQuery('');
                          }}
                          className={`w-full flex items-center justify-between p-3 rounded-2xl transition-all text-left cursor-pointer border ${
                            isSelected
                              ? 'bg-rose-500/10 border-rose-500/20 text-rose-200 shadow-[0_0_12px_rgba(244,63,94,0.1)]'
                              : 'bg-white/5 border-white/5 hover:bg-rose-500/5 hover:border-rose-500/20 text-neutral-300'
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="relative shrink-0">
                              <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${
                                isGlobal
                                  ? 'from-purple-600/30 to-rose-600/30 text-purple-300 border-purple-500/30'
                                  : isSelf
                                    ? 'from-rose-500/30 to-purple-500/30 text-rose-200 border-rose-500/20'
                                    : 'from-rose-500/20 to-purple-500/20 text-rose-300'
                              } border border-white/5 flex items-center justify-center font-bold text-xs uppercase font-sans`}>
                                {isGlobal ? <Globe className="w-4 h-4 text-purple-300" /> : (isSelf ? <Bookmark className="w-4 h-4 text-rose-400" /> : partner.username.substring(0, 2))}
                              </div>
                              {!isSelf && !isGlobal && (
                                <span 
                                  className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-neutral-950 ${
                                    online ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]' : 'bg-neutral-600'
                                  }`}
                                />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-xs text-neutral-200 truncate flex items-center gap-1.5">
                                {isGlobal ? "Global Community Lounge" : (isSelf ? "Notes to Self" : partner.username)}
                                {partner.isPartner && (
                                  <span className="text-[9px] bg-rose-500/20 text-rose-300 border border-rose-500/30 px-1.5 py-0.5 rounded-md uppercase font-bold tracking-tight">
                                    Partner 💕
                                  </span>
                                )}
                                {isGlobal && (
                                  <span className="text-[9px] bg-purple-500/20 text-purple-300 border border-purple-500/30 px-1.5 py-0.5 rounded-md uppercase font-bold tracking-tight">
                                    Public
                                  </span>
                                )}
                                {isSelf && (
                                  <span className="text-[9px] bg-rose-500/15 text-rose-300 border border-rose-500/20 px-1.5 py-0.5 rounded-md uppercase font-bold tracking-tight">
                                    Private
                                  </span>
                                )}
                              </p>
                              <p className="text-[10px] text-neutral-500 truncate font-sans">
                                {isGlobal ? "Open public chat room" : (isSelf ? "Personal Notepad Space" : (online ? 'Active now' : 'Offline'))}
                              </p>
                            </div>
                          </div>
                          {hasUnread && (
                            <span className="shrink-0 bg-rose-500 text-white text-[10px] font-bold h-5 min-w-[20px] px-1.5 rounded-full flex items-center justify-center shadow-[0_0_10px_rgba(244,63,94,0.6)] font-sans">
                              {unreadCount}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                );
              })()
            ) : (
              <div className="space-y-2">
                {/* Group Chats Section */}
                {userGroups.length > 0 && (
                  <div className="mb-3 space-y-1.5">
                    <div className="text-[9px] uppercase font-bold tracking-widest text-purple-400 pl-1 font-sans">
                      Group Chats ({userGroups.length})
                    </div>
                    {userGroups.map((group, idx) => {
                      const isSelected = activePartner === group.id;
                      const groupUnread = getUnreadCountForGroup(group.id);
                      const hasUnread = groupUnread > 0;
                      return (
                        <div
                          key={`group-sidebar-${group.id}-${idx}`}
                          className={`group w-full flex items-center justify-between p-3 rounded-2xl transition-all text-left border ${
                            isSelected
                              ? 'bg-purple-500/15 border-purple-500/30 text-purple-200 shadow-[0_0_12px_rgba(168,85,247,0.15)]'
                              : hasUnread
                                ? 'bg-purple-500/10 border-purple-500/35 text-purple-100 shadow-[0_0_15px_rgba(168,85,247,0.15)] animate-pulse'
                                : 'bg-white/5 border-white/5 hover:bg-white/10 text-neutral-300'
                          }`}
                        >
                          <div
                            onClick={() => setActivePartner(group.id)}
                            className="flex-1 flex items-center gap-3 min-w-0 cursor-pointer"
                          >
                            <div className="relative shrink-0">
                              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-600/30 to-indigo-600/30 border border-purple-500/30 flex items-center justify-center font-bold text-xs text-purple-300">
                                <Users className="w-4 h-4 text-purple-300" />
                              </div>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-xs text-neutral-200 truncate flex items-center gap-1.5">
                                {group.name}
                                <span className="text-[9px] bg-purple-500/20 text-purple-300 border border-purple-500/30 px-1.5 py-0.5 rounded-md uppercase font-bold tracking-tight">
                                  {group.members?.length || 0}
                                </span>
                              </p>
                              <p className="text-[10px] text-neutral-400 truncate font-sans">
                                {group.description || `${group.members?.length || 0} members`}
                              </p>
                            </div>
                          </div>
                          {hasUnread && (
                            <span className="shrink-0 bg-purple-500 text-white text-[10px] font-bold h-5 min-w-[20px] px-1.5 rounded-full flex items-center justify-center shadow-[0_0_10px_rgba(168,85,247,0.6)] font-sans">
                              {groupUnread}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {displayedPartners.length === 0 && userGroups.length === 0 ? (
                  <div className="text-center py-12 px-4 text-neutral-500 text-xs italic">
                    No active conversations yet.
                  </div>
                ) : (
                displayedPartners.map((partner, idx) => {
                  const isSelected = activePartner?.toLowerCase().trim() === partner.username.toLowerCase().trim();
                  const online = isUserOnline(partner.username);
                  const unreadCount = getUnreadCountForPartner(partner.username);
                  const hasUnread = unreadCount > 0;
                  const isSelf = partner.isSelf || partner.username.toLowerCase().trim() === currentSender.toLowerCase().trim();
                  const isGlobal = partner.isGlobal || partner.username.toLowerCase().trim() === 'global';
                  
                  return (
                    <div
                      key={`partner-${partner.id}-${partner.username}-${idx}`}
                      className={`group w-full flex items-center justify-between p-3 rounded-2xl transition-all text-left border ${
                        isSelected 
                          ? 'bg-rose-500/10 border-rose-500/20 text-rose-200 shadow-[0_0_12px_rgba(244,63,94,0.1)]' 
                          : hasUnread
                            ? 'bg-rose-500/5 border-rose-500/35 text-rose-100 shadow-[0_0_15px_rgba(244,63,94,0.15)] animate-pulse'
                            : 'bg-transparent border-transparent hover:bg-white/5 text-neutral-400 hover:text-neutral-200'
                      }`}
                    >
                      <div
                        onClick={() => {
                          setActivePartner(partner.username);
                        }}
                        className="flex-1 flex items-center gap-3 min-w-0 cursor-pointer"
                      >
                        <div className="relative shrink-0">
                          <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${
                            isGlobal
                              ? 'from-purple-600/30 to-rose-600/30 text-purple-300 border-purple-500/30'
                              : isSelf 
                                ? 'from-rose-500/30 to-purple-500/30 text-rose-200 border-rose-500/20' 
                                : 'from-rose-500/20 to-purple-500/20 text-rose-300'
                          } border border-white/5 flex items-center justify-center font-bold text-xs uppercase font-sans`}>
                            {isGlobal ? (
                              <Globe className="w-4 h-4 text-purple-300" />
                            ) : isSelf ? (
                              <Bookmark className="w-4 h-4 text-rose-400" />
                            ) : (
                              partner.username.substring(0, 2)
                            )}
                          </div>
                          {!isSelf && !isGlobal && (
                            <span 
                              className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-neutral-950 ${
                                online ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]' : 'bg-neutral-600'
                              }`}
                            />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-xs text-neutral-200 truncate flex items-center gap-1.5">
                            {isGlobal ? "Global Community Lounge" : (isSelf ? "Notes to Self" : partner.username)}
                            {partner.isPartner && (
                              <span className="text-[9px] bg-rose-500/20 text-rose-300 border border-rose-500/30 px-1.5 py-0.5 rounded-md uppercase font-bold tracking-tight">
                                Partner 💕
                              </span>
                            )}
                            {isGlobal && (
                              <span className="text-[9px] bg-purple-500/20 text-purple-300 border border-purple-500/30 px-1.5 py-0.5 rounded-md uppercase font-bold tracking-tight">
                                Public
                              </span>
                            )}
                            {isSelf && (
                              <span className="text-[9px] bg-rose-500/15 text-rose-300 border border-rose-500/20 px-1.5 py-0.5 rounded-md uppercase font-bold tracking-tight">
                                Private
                              </span>
                            )}
                          </p>
                          <p className="text-[10px] text-neutral-500 truncate font-sans">
                            {isGlobal ? 'Open public chat room' : (isSelf ? 'Personal Notepad Space' : (online ? 'Active now' : 'Offline'))}
                          </p>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2 shrink-0">
                        {hasUnread && (
                          <span className="shrink-0 bg-rose-500 text-white text-[10px] font-bold h-5 min-w-[20px] px-1.5 rounded-full flex items-center justify-center shadow-[0_0_10px_rgba(244,63,94,0.6)] font-sans animate-bounce-short">
                            {unreadCount}
                          </span>
                        )}
                        {!isGlobal && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setPartnerToDelete(partner.username);
                              setShowDeleteConvConfirm(true);
                            }}
                            className="opacity-60 md:opacity-0 md:group-hover:opacity-100 p-1.5 rounded-xl bg-white/5 hover:bg-rose-500/25 text-neutral-400 hover:text-rose-400 border border-white/5 hover:border-rose-500/20 transition-all cursor-pointer"
                            title={`Delete chat with ${isSelf ? 'yourself' : partner.username}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            )}
          </div>
        </div>

        {/* Chat / Conversation Area */}
        <div className={`${
          isFloating
            ? (activePartner ? 'flex flex-1 min-w-0' : 'hidden')
            : (activePartner ? 'flex flex-1 min-w-0' : 'hidden md:flex md:flex-1 md:min-w-0')
        } flex-col min-h-0 min-w-0 relative`}>
          {!activePartner ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8 space-y-4">
              <div className="p-4 bg-rose-500/5 border border-rose-500/10 rounded-full text-rose-400">
                <Heart className="w-10 h-10 text-rose-400 animate-pulse" />
              </div>
              <div>
                <h3 className="font-serif text-lg font-medium text-rose-200">Start a Conversation</h3>
                <p className="text-xs text-neutral-500 mt-1 max-w-sm">
                  Choose a user from the conversations list on the left to start a private 1-to-1 secure chat.
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* Conversation Area Header */}
              <div className="flex items-center justify-between gap-1.5 sm:gap-3 border-b border-white/5 pb-3 mb-3 shrink-0 w-full min-w-0">
                <div className="flex items-center min-w-0 flex-1 overflow-hidden mr-1 sm:mr-2">
                  {/* Back button on mobile or floating */}
                  <button
                    type="button"
                    onClick={() => setActivePartner(null)}
                    className={`${isFloating ? 'flex' : 'flex md:hidden'} items-center gap-1 text-xs text-neutral-400 hover:text-white bg-white/5 border border-white/10 px-2 sm:px-2.5 py-1.5 rounded-xl cursor-pointer mr-2 sm:mr-3 shrink-0 transition-colors`}
                    title="Back to all conversations"
                  >
                    <ChevronLeft className="w-3.5 h-3.5 text-rose-400" />
                    <span className="text-[10px] font-bold uppercase tracking-wide">Chats</span>
                  </button>
                  <div className="relative shrink-0">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-purple-500/20 to-rose-500/20 border border-white/10 flex items-center justify-center font-bold text-xs uppercase text-rose-300 font-sans">
                      {activeGroup ? (
                        <Users className="w-4 h-4 text-purple-300" />
                      ) : activePartner.toLowerCase().trim() === 'global' ? (
                        <Globe className="w-4 h-4 text-purple-300" />
                      ) : activePartner.toLowerCase().trim() === currentSender.toLowerCase().trim() ? (
                        <Bookmark className="w-4 h-4 text-rose-400" />
                      ) : (
                        activePartner.substring(0, 2)
                      )}
                    </div>
                    {!activeGroup && activePartner.toLowerCase().trim() !== currentSender.toLowerCase().trim() && activePartner.toLowerCase().trim() !== 'global' && (
                      <span 
                        className={`absolute bottom-0 right-0 h-2 w-2 rounded-full border border-neutral-950 ${
                          isUserOnline(activePartner) ? 'bg-emerald-500 animate-pulse' : 'bg-neutral-600'
                        }`}
                      />
                    )}
                  </div>
                  <div className="ml-2.5 sm:ml-3 min-w-0 flex-1 overflow-hidden">
                    <h3 className="text-xs sm:text-sm font-semibold text-rose-100 truncate flex items-center gap-1.5 min-w-0">
                      <span className="truncate">
                        {activeGroup
                          ? activeGroup.name
                          : activePartner.toLowerCase().trim().startsWith('group_')
                            ? "Group Chat"
                            : activePartner.toLowerCase().trim() === 'global'
                              ? "Global Community Lounge"
                              : activePartner.toLowerCase().trim() === currentSender.toLowerCase().trim()
                                ? "Notes to Self"
                                : (partnerUsername && activePartner.toLowerCase().trim() === partnerUsername.toLowerCase().trim() ? `${activePartner} 💕` : activePartner)
                        }
                      </span>
                      {activeGroup && (
                        <span className="text-[9px] bg-purple-500/20 text-purple-300 border border-purple-500/30 px-1.5 py-0.5 rounded-md uppercase font-bold tracking-tight shrink-0">
                          Group ({activeGroup.members?.length || 0})
                        </span>
                      )}
                      {activePartner.toLowerCase().trim() === 'global' && (
                        <span className="text-[9px] bg-purple-500/20 text-purple-300 border border-purple-500/30 px-1.5 py-0.5 rounded-md uppercase font-bold tracking-tight shrink-0">
                          Public
                        </span>
                      )}
                      {activePartner.toLowerCase().trim() === currentSender.toLowerCase().trim() && (
                        <span className="text-[9px] bg-rose-500/15 text-rose-300 border border-rose-500/20 px-1.5 py-0.5 rounded-md uppercase font-bold tracking-tight shrink-0">
                          Private
                        </span>
                      )}
                    </h3>
                    <p className="text-[9px] text-neutral-500 font-sans truncate min-w-0">
                      {activeGroup
                        ? (activeGroup.description || `Members: ${activeGroup.members?.join(', ')}`)
                        : activePartner.toLowerCase().trim() === 'global'
                          ? "Public chat lounge • Open to all registered community members"
                          : activePartner.toLowerCase().trim() === currentSender.toLowerCase().trim()
                            ? "Your private secure notepad space"
                            : (isUserOnline(activePartner) ? 'Online' : 'Offline')
                      }
                    </p>
                  </div>
                </div>
                {/* Header Actions for Active Chat */}
                <div className="flex items-center gap-1 sm:gap-1.5 md:gap-2 shrink-0 flex-nowrap">
                  {activeGroup && (
                    <button
                      type="button"
                      onClick={() => setIsGroupSettingsOpen(true)}
                      className="flex items-center gap-1 text-xs px-2 sm:px-2.5 py-1.5 rounded-xl border border-purple-500/30 bg-purple-500/15 hover:bg-purple-500/25 text-purple-300 transition-all cursor-pointer font-semibold shrink-0"
                      title="Group Members & Info"
                    >
                      <Users className="w-3.5 h-3.5 text-purple-300 shrink-0" />
                      <span className="hidden md:inline">Members</span>
                      <span className="text-[10px] font-bold bg-purple-500/30 text-purple-200 px-1 rounded sm:inline md:hidden">
                        {activeGroup.members?.length || 0}
                      </span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setShowSearchBar(!showSearchBar);
                      if (showSearchBar) {
                        setSearchQuery('');
                      }
                    }}
                    className={`flex items-center gap-1 text-xs px-2 sm:px-2.5 py-1.5 rounded-xl border transition-all cursor-pointer shrink-0 ${
                      showSearchBar
                        ? 'bg-rose-500/20 text-rose-300 border-rose-500/30 font-semibold'
                        : 'text-neutral-400 hover:text-white bg-white/5 border-white/10 hover:bg-white/10'
                    }`}
                    title={showSearchBar ? "Hide Search" : "Search Messages"}
                  >
                    <Search className="w-3.5 h-3.5 shrink-0" />
                    <span className="hidden md:inline">{showSearchBar ? "Hide" : "Search"}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowMediaGallery(!showMediaGallery)}
                    className={`flex items-center gap-1 text-xs px-2 sm:px-2.5 py-1.5 rounded-xl border transition-all cursor-pointer shrink-0 ${
                      showMediaGallery
                        ? 'bg-rose-500/20 text-rose-300 border-rose-500/30 font-semibold'
                        : 'text-neutral-400 hover:text-white bg-white/5 border-white/10 hover:bg-white/10'
                    }`}
                    title={showMediaGallery ? "Back to Chat" : "View Shared Media Gallery"}
                  >
                    <ImageIcon className="w-3.5 h-3.5 shrink-0" />
                    <span className="hidden md:inline">{showMediaGallery ? "Chat" : "Media"}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActivePartner(null)}
                    className="flex items-center gap-1 text-xs px-2 sm:px-2.5 py-1.5 rounded-xl border border-white/10 text-neutral-400 hover:text-white bg-white/5 hover:bg-white/10 transition-all cursor-pointer shrink-0"
                    title="Close Chat / Exit Conversation"
                  >
                    <X className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                    <span className="hidden md:inline">Close</span>
                  </button>
                </div>
              </div>

              {/* Active Sliding Search Bar */}
              <AnimatePresence>
                {showSearchBar && (
                  <motion.div
                    initial={{ height: 0, opacity: 0, marginBottom: 0 }}
                    animate={{ height: 'auto', opacity: 1, marginBottom: 12 }}
                    exit={{ height: 0, opacity: 0, marginBottom: 0 }}
                    className="relative z-10 overflow-hidden shrink-0"
                  >
                    <div className="relative flex items-center bg-neutral-900/60 border border-white/10 rounded-xl px-3 py-2 focus-within:border-rose-500/30 transition-all">
                      <Search className="w-3.5 h-3.5 text-rose-300/40 mr-2 shrink-0" />
                      <input
                        type="text"
                        placeholder="Search for sweet words in chat history..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="bg-transparent text-xs text-neutral-200 placeholder-neutral-500 outline-none w-full font-sans"
                        autoFocus
                      />
                      {searchQuery && (
                        <button
                          onClick={() => setSearchQuery('')}
                          className="p-1 hover:bg-white/10 rounded-full text-neutral-400 hover:text-white transition-colors cursor-pointer"
                          title="Clear search"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Active Search Banner Indicator */}
      {searchQuery.trim() && (
        <div className="relative z-10 flex items-center justify-between bg-rose-500/10 border border-rose-500/20 rounded-xl px-3 py-1.5 mb-2.5 shrink-0">
          <span className="text-[10px] text-rose-300 font-sans flex items-center gap-1.5">
            <Search className="w-3.5 h-3.5 text-rose-400" />
            Filtering sweet words by: <span className="font-semibold text-white">"{searchQuery}"</span>
          </span>
          <button
            onClick={() => setSearchQuery('')}
            className="text-[9px] font-bold uppercase tracking-wider text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 px-2 py-0.5 rounded-full border border-rose-500/25 transition-all cursor-pointer"
          >
            Clear
          </button>
        </div>
      )}

      {/* Unified Settings & Tools Overlay */}
      <AnimatePresence>
        {showSettingsDropdown && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.98 }}
            className="absolute top-[75px] sm:top-[85px] left-4 right-4 z-30 bg-neutral-900/95 backdrop-blur-xl border border-white/10 rounded-2xl p-4 shadow-2xl flex flex-col gap-4 select-none max-h-[80%] overflow-y-auto custom-scrollbar"
          >
            {/* Settings Header */}
            <div className="flex items-center justify-between border-b border-white/5 pb-2">
              <span className="text-xs uppercase tracking-widest font-bold text-rose-400 flex items-center gap-1.5">
                <Settings className="w-3.5 h-3.5 animate-spin-slow" />
                Chat Settings
              </span>
              <button
                onClick={() => setShowSettingsDropdown(false)}
                className="p-1 hover:bg-white/5 rounded-full text-neutral-400 hover:text-white transition-colors cursor-pointer"
                title="Close Settings"
              >
                <X className="w-4 h-4" />
              </button>
            </div>


            {/* SECTION 2: SOUNDS & NOTIFICATIONS */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider flex items-center gap-1">
                  <Music className="w-3 h-3 text-rose-400" /> Sound Settings
                </label>
                {onToggleSound && (
                  <button
                    type="button"
                    onClick={onToggleSound}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all border cursor-pointer ${
                      isSoundEnabled
                        ? 'bg-rose-500/10 border-rose-500/20 text-rose-300'
                        : 'bg-neutral-950 border-white/5 text-neutral-500 hover:text-neutral-400'
                    }`}
                  >
                    {isSoundEnabled ? (
                      <>
                        <Volume2 className="w-3 h-3 text-rose-400 animate-pulse" />
                        <span>Sound Enabled</span>
                      </>
                    ) : (
                      <>
                        <VolumeX className="w-3 h-3 text-neutral-500" />
                        <span>Sounds Muted</span>
                      </>
                    )}
                  </button>
                )}
              </div>

              {isSoundEnabled && (
                <div className="bg-neutral-950/40 border border-white/5 rounded-xl p-2.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] uppercase tracking-wider font-bold text-rose-300/80 flex items-center gap-1">
                      <Music className="w-3 h-3 text-rose-400 animate-bounce" /> {activePartner ? `Melody for ${activePartner}` : 'Choose Melody'}
                    </span>
                    <span className="text-[8px] text-neutral-500 font-mono">Plays for incoming messages</span>
                  </div>
                  
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
                    {[
                      { id: 'harps', label: '🌸 Harps' },
                      { id: 'chime', label: '🔔 Chime' },
                      { id: 'spark', label: '✨ Spark' },
                      { id: 'waltz', label: '🎵 Waltz' },
                      { id: 'lullaby', label: '🌙 Lull' }
                    ].map((sound, idx) => {
                      const isSelected = selectedSound === sound.id;
                      return (
                        <button
                          key={`sound-opt-${sound.id}-${idx}`}
                          onClick={() => {
                            setSelectedSound(sound.id);
                            if (activePartner && currentUser) {
                              const soundKey = `chat_notification_sound_${currentUser.toLowerCase().trim()}_${activePartner.toLowerCase().trim()}`;
                              localStorage.setItem(soundKey, sound.id);
                            } else {
                              localStorage.setItem('chat_notification_sound', sound.id);
                            }
                            playNotificationSound(sound.id);
                          }}
                          className={`px-1.5 py-1 rounded-lg text-[10px] font-medium text-center transition-all cursor-pointer border ${
                            isSelected 
                              ? 'bg-gradient-to-r from-rose-500/20 to-pink-500/20 border-rose-500/40 text-rose-200 shadow-md shadow-rose-500/5' 
                              : 'bg-neutral-950/60 border-white/5 text-neutral-400 hover:bg-neutral-950 hover:border-white/10 hover:text-neutral-200'
                          }`}
                        >
                          {sound.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* SECTION 2.5: EXPORT CONVERSATIONS */}
            <div className="space-y-2 border-t border-white/5 pt-3">
              <label className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
                <Download className="w-3.5 h-3.5 text-rose-400" /> Export Chat History
              </label>
              <p className="text-[10px] text-neutral-500 italic font-sans pl-1">
                Save and preserve your beautiful conversation history in multiple offline-friendly formats.
              </p>
              
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                {/* PDF Export */}
                <button
                  type="button"
                  onClick={handleExportAsPDF}
                  className="flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-rose-500/10 border border-rose-500/20 hover:bg-rose-500/20 text-rose-300 hover:text-white text-xs font-semibold tracking-wide transition-all cursor-pointer active:scale-[0.98] shadow-sm"
                  title="Export as highly-formatted PDF document"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Formatted PDF</span>
                </button>

                {/* TXT Export */}
                <button
                  type="button"
                  onClick={handleExportAsText}
                  className="flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20 hover:bg-amber-500/20 text-amber-300 hover:text-white text-xs font-semibold tracking-wide transition-all cursor-pointer active:scale-[0.98] shadow-sm"
                  title="Export as plain text log file"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Plain Text (TXT)</span>
                </button>

                {/* ZIP Export */}
                <button
                  type="button"
                  onClick={handleExportAsZip}
                  className="flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-teal-500/10 border border-teal-500/20 hover:bg-teal-500/20 text-teal-300 hover:text-white text-xs font-semibold tracking-wide transition-all cursor-pointer active:scale-[0.98] shadow-sm"
                  title="Export as ZIP archive containing text logs and unpacked photos"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Full ZIP Archive</span>
                </button>
              </div>
            </div>

            {/* SECTION 3: PINNED MESSAGES */}
            <div className="space-y-1.5 border-t border-white/5 pt-2">
              <button
                type="button"
                onClick={() => setIsPinnedCollapsed(!isPinnedCollapsed)}
                className="w-full flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-neutral-400 hover:text-rose-300 transition-colors cursor-pointer"
              >
                <span className="flex items-center gap-1.5">
                  <Pin className="w-3 h-3 text-rose-400" />
                  Pinned Messages ({pinnedMessages.length})
                </span>
                {pinnedMessages.length > 0 && (
                  isPinnedCollapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5 text-rose-400" />
                )}
              </button>

              {pinnedMessages.length === 0 ? (
                <p className="text-[10px] text-neutral-500 italic font-sans pl-4.5 py-1">No pinned messages yet. Hover or long-press messages in chat to pin them.</p>
              ) : (
                <AnimatePresence>
                  {!isPinnedCollapsed && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="bg-rose-500/5 border border-rose-500/10 rounded-xl p-2 flex flex-col gap-1 select-none overflow-hidden"
                    >
                      <HorizontalScrollWrapper scrollContainerClassName="gap-2 py-0.5">
                        {pinnedMessages.map((msg, idx) => (
                          <div
                            key={`pinned-${msg.id || idx}-${idx}`}
                            onClick={() => {
                              handleJumpToMessage(msg.id);
                              setShowSettingsDropdown(false);
                            }}
                            className="flex items-center gap-2 bg-neutral-950/80 border border-white/5 hover:border-rose-500/20 rounded-lg p-1.5 shrink-0 max-w-[200px] text-left cursor-pointer transition-all hover:bg-neutral-900 group"
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1">
                                <span className="text-[8.5px] font-bold text-rose-300 truncate">{msg.sender}</span>
                                <span className="text-[7px] text-neutral-600 font-mono shrink-0">
                                  {new Date(msg.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                </span>
                              </div>
                              <p className="text-[9px] text-neutral-300 truncate font-sans italic mt-0.5 group-hover:text-rose-200 transition-colors">
                                {msg.content || "Voice Note 🎙️"}
                              </p>
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onTogglePinMessage?.(msg.id);
                              }}
                              className="p-1 hover:bg-rose-500/10 rounded-lg text-neutral-500 hover:text-rose-400 transition-colors shrink-0 cursor-pointer"
                              title="Unpin"
                            >
                              <PinOff className="w-2.5 h-2.5" />
                            </button>
                          </div>
                        ))}
                      </HorizontalScrollWrapper>
                    </motion.div>
                  )}
                </AnimatePresence>
              )}
            </div>

            {/* SECTION 4: STARRED/SAVED MESSAGES */}
            <div className="space-y-1.5 border-t border-white/5 pt-2">
              <button
                type="button"
                onClick={() => setIsSavedCollapsed(!isSavedCollapsed)}
                className="w-full flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-neutral-400 hover:text-teal-300 transition-colors cursor-pointer"
              >
                <span className="flex items-center gap-1.5">
                  <Bookmark className="w-3 h-3 text-teal-400" />
                  Starred Messages ({savedMessages.length})
                </span>
                {savedMessages.length > 0 && (
                  isSavedCollapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5 text-teal-400" />
                )}
              </button>

              {savedMessages.length === 0 ? (
                <p className="text-[10px] text-neutral-500 italic font-sans pl-4.5 py-1">No starred messages yet. Hover or long-press messages in chat to star them.</p>
              ) : (
                <AnimatePresence>
                  {!isSavedCollapsed && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="bg-teal-500/5 border border-teal-500/10 rounded-xl p-2 flex flex-col gap-2 select-none overflow-hidden"
                    >
                      {/* Search input for Starred messages */}
                      <div className="relative flex items-center bg-neutral-950/80 border border-teal-500/20 rounded-lg px-2.5 py-1">
                        <Search className="w-3 h-3 text-teal-400 mr-1.5 shrink-0" />
                        <input
                          type="text"
                          placeholder="Search starred..."
                          value={savedSearchQuery}
                          onChange={(e) => setSavedSearchQuery(e.target.value)}
                          className="bg-transparent text-[9px] text-neutral-200 placeholder-neutral-500 outline-none w-full font-sans"
                        />
                        {savedSearchQuery && (
                          <button
                            onClick={() => setSavedSearchQuery('')}
                            className="p-0.5 hover:bg-white/10 rounded-full text-neutral-400 hover:text-white transition-colors cursor-pointer"
                            title="Clear search"
                          >
                            <X className="w-2.5 h-2.5" />
                          </button>
                        )}
                      </div>

                      <HorizontalScrollWrapper scrollContainerClassName="gap-2 py-0.5">
                        {(() => {
                          const filtered = savedMessages.filter((msg) =>
                            (msg.content || '').toLowerCase().includes(savedSearchQuery.toLowerCase())
                          );
                          if (filtered.length === 0) {
                            return (
                              <span className="text-[9px] text-neutral-500 py-1 font-sans italic w-full text-center">
                                No matching starred messages
                              </span>
                            );
                          }
                          return filtered.map((msg, idx) => (
                            <div
                              key={`saved-${msg.id || idx}-${idx}`}
                              onClick={() => {
                                handleJumpToMessage(msg.id);
                                setShowSettingsDropdown(false);
                              }}
                              className="flex items-center gap-2 bg-neutral-950/80 border border-white/5 hover:border-teal-500/20 rounded-lg p-1.5 shrink-0 max-w-[200px] text-left cursor-pointer transition-all hover:bg-neutral-900 group"
                            >
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1">
                                  <span className="text-[8.5px] font-bold text-teal-300 truncate">{msg.sender}</span>
                                  <span className="text-[7px] text-neutral-600 font-mono shrink-0">
                                    {new Date(msg.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                  </span>
                                </div>
                                <p className="text-[9px] text-neutral-300 truncate font-sans italic mt-0.5 group-hover:text-teal-200 transition-colors">
                                  {msg.content || "Voice Note 🎙️"}
                                </p>
                              </div>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleSaveMessage(msg.id);
                                }}
                                className="p-1 hover:bg-teal-500/10 rounded-lg text-neutral-500 hover:text-teal-400 transition-colors shrink-0 cursor-pointer"
                                title="Unsave"
                              >
                                <BookmarkCheck className="w-2.5 h-2.5 text-teal-400" />
                              </button>
                            </div>
                          ));
                        })()}
                      </HorizontalScrollWrapper>
                    </motion.div>
                  )}
                </AnimatePresence>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {/* Lightbox Modal */}
        {activeLightboxIndex !== null && currentLightboxMsg && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-2xl select-none"
            onClick={() => setActiveLightboxIndex(null)}
          >
            {/* Floating Top Toolbar */}
            <div className="absolute top-6 right-6 z-50 flex items-center gap-3">
              {/* Download button */}
              <button
                onClick={handleDownloadLightboxImage}
                className="p-3 bg-neutral-950/80 hover:bg-neutral-900 border border-white/10 rounded-full text-neutral-300 hover:text-white transition-all active:scale-95 cursor-pointer flex items-center justify-center shadow-lg"
                title="Download Image"
              >
                <Download className="w-5 h-5" />
              </button>

              {/* Close Button */}
              <button
                onClick={() => setActiveLightboxIndex(null)}
                className="p-3 bg-neutral-950/80 hover:bg-rose-500/20 border border-white/10 rounded-full text-neutral-300 hover:text-rose-400 transition-all active:scale-95 cursor-pointer flex items-center justify-center shadow-lg"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Main Interactive Image Area */}
            <div className="relative flex items-center justify-center w-full h-full p-4">
              {/* Prev Button */}
              {activeLightboxIndex > 0 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveLightboxIndex(prev => prev !== null && prev > 0 ? prev - 1 : prev);
                  }}
                  className="absolute left-6 z-10 p-3 bg-neutral-950/80 hover:bg-neutral-900 border border-white/10 text-white hover:text-rose-400 rounded-full transition-all active:scale-90 cursor-pointer shadow-lg flex items-center justify-center"
                  title="Previous Image"
                >
                  <ChevronLeft className="w-6 h-6" />
                </button>
              )}

              {/* Enlarged Image */}
              <motion.img
                key={`chat-lightbox-${currentLightboxMsg?.id || activeLightboxIndex}-${activeLightboxIndex}`}
                src={currentLightboxMsg.imageUrl}
                alt="Enlarged shared media"
                className="max-w-[95vw] max-h-[90vh] sm:max-w-[85vw] sm:max-h-[85vh] object-contain rounded-2xl shadow-2xl border border-white/10"
                initial={{ scale: 0.96, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.96, opacity: 0 }}
                transition={{ type: "spring", damping: 25, stiffness: 260 }}
                referrerPolicy="no-referrer"
                onClick={(e) => e.stopPropagation()}
              />

              {/* Next Button */}
              {activeLightboxIndex < imageMessages.length - 1 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveLightboxIndex(prev => prev !== null && prev < imageMessages.length - 1 ? prev + 1 : prev);
                  }}
                  className="absolute right-6 z-10 p-3 bg-neutral-950/80 hover:bg-neutral-900 border border-white/10 text-white hover:text-rose-400 rounded-full transition-all active:scale-90 cursor-pointer shadow-lg flex items-center justify-center"
                  title="Next Image"
                >
                  <ChevronRight className="w-6 h-6" />
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Messages Window or Media Gallery */}
      {showMediaGallery ? (
        <div className="relative z-10 flex-1 overflow-y-auto overflow-x-hidden pr-1 mb-4 custom-scrollbar">
          <div className="flex items-center justify-between mb-4 border-b border-white/5 pb-2.5">
            <div>
              <h4 className="text-sm font-semibold text-rose-200 font-serif flex items-center gap-1.5">
                <ImageIcon className="w-4 h-4 text-rose-400" />
                Shared Media Gallery ({imageMessages.length})
              </h4>
              <p className="text-[10px] text-neutral-500 font-sans">
                A visual album of all photos shared in this DM conversation
              </p>
            </div>
          </div>

          {imageMessages.length === 0 ? (
            <div className="h-[250px] flex flex-col items-center justify-center text-center p-8 space-y-3 bg-white/5 border border-white/10 rounded-2xl">
              <div className="p-3 bg-white/5 border border-white/10 rounded-full text-neutral-400">
                <ImageIcon className="w-6 h-6 text-neutral-500" />
              </div>
              <div>
                <p className="text-sm font-semibold text-neutral-300">No photos shared yet</p>
                <p className="text-xs text-neutral-500 mt-1 max-w-xs">
                  Photos you or your partner share in this direct message will appear in this album.
                </p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3.5">
              {imageMessages.map((msg, idx) => {
                const dateStr = new Date(msg.timestamp).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                });
                return (
                  <div
                    key={`gallery-item-${msg.id || idx}-${idx}`}
                    className="group relative aspect-square bg-neutral-900 border border-white/10 rounded-xl overflow-hidden cursor-pointer hover:border-rose-500/40 hover:shadow-lg hover:shadow-rose-500/5 transition-all duration-300"
                    onClick={() => setActiveLightboxIndex(idx)}
                  >
                    <img
                      src={msg.imageUrl}
                      alt={`Shared by ${msg.sender}`}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      referrerPolicy="no-referrer"
                    />
                    {/* Hover Overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-2.5">
                      <div className="flex items-center justify-between min-w-0">
                        <div className="min-w-0">
                          <p className="text-[10px] font-bold text-rose-200 truncate">{msg.sender}</p>
                          <p className="text-[8px] text-neutral-400 font-mono mt-0.5">{dateStr}</p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const link = document.createElement('a');
                              link.href = msg.imageUrl || '';
                              link.download = `love_chat_${msg.sender}_${Date.now()}.jpg`;
                              document.body.appendChild(link);
                              link.click();
                              document.body.removeChild(link);
                            }}
                            className="p-1 bg-black/60 hover:bg-rose-500/20 border border-white/10 rounded-lg text-neutral-300 hover:text-white transition-colors"
                            title="Download Image"
                          >
                            <Download className="w-3 h-3" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowMediaGallery(false);
                              // Smooth scroll & highlight
                              setTimeout(() => handleJumpToMessage(msg.id), 120);
                            }}
                            className="p-1 bg-black/60 hover:bg-rose-500/20 border border-white/10 rounded-lg text-neutral-300 hover:text-white transition-colors"
                            title="Go to Message"
                          >
                            <ZoomIn className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div 
          ref={messagesContainerRef}
          onScroll={handleScroll}
          className="relative z-10 flex-1 overflow-y-auto overflow-x-hidden pr-1 space-y-4 mb-4 custom-scrollbar"
        >
          {conversationMessages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-4">
              <div className="p-4 bg-rose-500/5 border border-rose-500/10 rounded-full text-rose-400">
                <Heart className="w-8 h-8 fill-rose-500/10 animate-bounce-short" />
              </div>
              <div>
                <h3 className="font-serif text-base font-medium text-rose-200">No sweet words yet</h3>
                <p className="text-xs text-neutral-500 mt-1 max-w-xs">
                  Leave a sweet letter, share a plan, or write a love note to kickstart your shared romantic board.
                </p>
              </div>
            </div>
          ) : (
            renderMessageGroups()
          )}
          <div ref={messagesEndRef} />
        </div>
      )}

      {/* Floating Scroll to Bottom Arrow Button */}
      <AnimatePresence>
        {showScrollToBottom && (
          <motion.button
            type="button"
            initial={{ opacity: 0, scale: 0.8, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 10 }}
            onClick={() => scrollToBottom('smooth')}
            className="absolute bottom-24 right-8 z-30 p-2.5 bg-rose-500 hover:bg-rose-600 text-white rounded-full shadow-lg shadow-rose-500/30 border border-rose-400/20 flex items-center justify-center transition-all active:scale-95 cursor-pointer"
            title="Scroll to bottom"
          >
            <ChevronDown className="w-4 h-4 animate-bounce" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Reply Preview Bar */}
      <AnimatePresence>
        {replyTarget && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="relative z-10 bg-neutral-900/90 border border-white/10 rounded-2xl px-4 py-2.5 mb-2 flex items-center justify-between"
          >
            <div className="flex flex-col text-xs text-neutral-300">
              <span className="font-bold text-rose-400 flex items-center gap-1">
                <CornerUpLeft className="w-3.5 h-3.5" />
                Replying to {replyTarget.sender}
              </span>
              <span className="truncate max-w-[300px] text-neutral-400 italic">
                "{replyTarget.content}"
              </span>
            </div>
            <button
              onClick={() => setReplyTarget(null)}
              className="p-1 text-neutral-500 hover:text-neutral-300 hover:bg-white/5 rounded-full transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mic permission/access error display */}
      <AnimatePresence>
        {micError && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="relative z-10 bg-rose-950/90 border border-rose-500/30 text-rose-200 px-4 py-2.5 rounded-2xl mb-2 flex items-center gap-2 text-xs"
          >
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{micError}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Selected Image(s) Multi-Photo Preview Reel */}
      <AnimatePresence>
        {attachedPhotos.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0, scale: 0.95 }}
            animate={{ opacity: 1, height: 'auto', scale: 1 }}
            exit={{ opacity: 0, height: 0, scale: 0.95 }}
            className="relative z-10 bg-neutral-900 border border-white/10 rounded-2xl p-3 mb-2 space-y-2 shadow-xl"
          >
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-rose-200 flex items-center gap-1.5">
                <ImageIcon className="w-3.5 h-3.5 text-rose-400" />
                Attached Photos ({attachedPhotos.length})
                {isUploadingAnyPhoto ? (
                  <span className="text-[10px] text-rose-400 animate-pulse font-mono flex items-center gap-1 ml-1">
                    <Loader2 className="w-3 h-3 animate-spin" /> Uploading...
                  </span>
                ) : (
                  <span className="text-[10px] text-emerald-400 font-mono ml-1 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Ready
                  </span>
                )}
              </span>

              <button
                type="button"
                onClick={() => setAttachedPhotos([])}
                className="text-[10px] text-rose-400 hover:text-rose-300 underline cursor-pointer"
              >
                Clear all
              </button>
            </div>

            {/* Horizontal thumbnail scroll */}
            <div className="flex items-center gap-2 overflow-x-auto py-1 custom-scrollbar">
              {attachedPhotos.map((photo, pIdx) => (
                <div
                  key={`attached-chat-photo-${photo.id}-${pIdx}`}
                  className="relative w-16 h-16 rounded-xl overflow-hidden border border-white/15 bg-neutral-950 shrink-0 group"
                >
                  <img
                    src={photo.previewUrl}
                    alt={photo.file.name}
                    className={`w-full h-full object-cover ${photo.isUploading ? 'opacity-40 blur-[0.5px]' : ''}`}
                  />
                  {photo.isUploading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                      <Loader2 className="w-4 h-4 text-rose-400 animate-spin" />
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => setAttachedPhotos((prev) => prev.filter((p) => p.id !== photo.id))}
                    className="absolute top-1 right-1 p-0.5 bg-black/75 hover:bg-rose-600 text-white rounded-full transition-colors cursor-pointer"
                    title="Remove photo"
                  >
                    <X className="w-3 h-3" />
                  </button>
                  <span className="absolute bottom-0.5 left-1 text-[8px] font-mono text-white/80 bg-black/60 px-1 rounded">
                    #{pIdx + 1}
                  </span>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Real-time Typing Indicator Banner */}
      <AnimatePresence>
        {typingUsers.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.95 }}
            className="relative z-10 flex items-center gap-2 text-xs text-rose-300 font-sans px-3.5 py-1.5 mb-2 bg-rose-500/10 border border-rose-500/20 rounded-full w-fit shadow-md shadow-rose-950/20"
          >
            <Sparkles className="w-3.5 h-3.5 text-rose-400 animate-spin-slow shrink-0" />
            <span className="font-semibold text-rose-200">
              {typingUsers.join(', ')} {typingUsers.length === 1 ? 'is typing...' : 'are typing...'}
            </span>
            <div className="flex items-center gap-1 shrink-0 ml-1">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Chat Input Area */}
      {isSelectionMode ? (
        <div className="relative z-10 bg-neutral-900/90 border border-rose-500/20 rounded-2xl p-2.5 flex items-center justify-between gap-3 w-full animate-fade-in shadow-lg shadow-rose-950/10">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-rose-200 bg-rose-500/10 border border-rose-500/20 px-2.5 py-1 rounded-full flex items-center gap-1.5">
              <CheckSquare className="w-3.5 h-3.5 text-rose-400 animate-pulse" />
              {selectedMessageIds.length} <span className="hidden min-[360px]:inline">selected</span>
            </span>
            {selectedMessageIds.length > 0 && (
              <button
                type="button"
                onClick={() => setSelectedMessageIds([])}
                className="text-[10px] text-rose-400 hover:text-rose-300 underline cursor-pointer"
              >
                Clear
              </button>
            )}
          </div>
          
          <div className="flex items-center gap-1.5 sm:gap-2 justify-end shrink-0">
            {/* PIN / UNPIN action */}
            <button
              type="button"
              disabled={selectedMessageIds.length === 0}
              onClick={handleBulkPin}
              className="p-2 bg-neutral-950 hover:bg-neutral-800 disabled:opacity-40 disabled:hover:bg-neutral-950 text-amber-300 border border-amber-500/20 rounded-xl transition-all cursor-pointer active:scale-95 disabled:cursor-not-allowed flex items-center justify-center shrink-0"
              title="Pin/Unpin Selected"
            >
              <Pin className="w-4 h-4 fill-amber-300/10 shrink-0" />
            </button>

            {/* STAR / UNSTAR action */}
            <button
              type="button"
              disabled={selectedMessageIds.length === 0}
              onClick={handleBulkStar}
              className="p-2 bg-neutral-950 hover:bg-neutral-800 disabled:opacity-40 disabled:hover:bg-neutral-950 text-teal-300 border border-teal-500/20 rounded-xl transition-all cursor-pointer active:scale-95 disabled:cursor-not-allowed flex items-center justify-center shrink-0"
              title="Star/Unstar Selected"
            >
              <Bookmark className="w-4 h-4 fill-teal-300/10 shrink-0" />
            </button>

            {/* DELETE action */}
            <button
              type="button"
              disabled={selectedMessageIds.length === 0}
              onClick={() => setShowBulkDeleteConfirm(true)}
              className="p-2 bg-rose-950/80 hover:bg-rose-900/80 disabled:opacity-40 disabled:hover:bg-rose-950/80 text-rose-300 border border-rose-500/20 rounded-xl transition-all cursor-pointer active:scale-95 disabled:cursor-not-allowed flex items-center justify-center shrink-0"
              title="Delete Selected"
            >
              <Trash2 className="w-4 h-4 shrink-0" />
            </button>

            {/* CANCEL action */}
            <button
              type="button"
              onClick={() => {
                setIsSelectionMode(false);
                setSelectedMessageIds([]);
              }}
              className="p-2 bg-neutral-950 hover:bg-neutral-800 text-neutral-400 hover:text-white rounded-xl border border-white/5 transition-all cursor-pointer shrink-0 flex items-center justify-center"
              title="Cancel Selection"
            >
              <X className="w-4 h-4 shrink-0" />
            </button>
          </div>
        </div>
      ) : isRecording ? (
        <div className="relative z-10 flex gap-2 w-full">
          <div className="flex-1 flex items-center justify-between bg-neutral-900 border border-rose-500/30 rounded-2xl px-4 py-2.5">
            <div className="flex items-center gap-3">
              {/* Pulsing red dot */}
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-500"></span>
              </span>
              {/* Live Timer formatted as MM:SS / 5:00 */}
              <span className="text-xs sm:text-sm font-semibold text-rose-200">
                Recording: {formatAudioTime(recordingSeconds)} / 5:00
              </span>
              
              {/* Custom audio wave visualization using CSS animations */}
              <div className="flex items-end gap-[3px] h-4 ml-2">
                <span className="w-[3px] bg-rose-400 animate-wave-1 rounded-full" />
                <span className="w-[3px] bg-rose-400 animate-wave-2 rounded-full" />
                <span className="w-[3px] bg-rose-400 animate-wave-3 rounded-full" />
                <span className="w-[3px] bg-rose-400 animate-wave-4 rounded-full" />
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Cancel Button */}
              <button
                type="button"
                onClick={cancelRecording}
                className="text-xs font-semibold text-neutral-400 hover:text-neutral-200 px-2 sm:px-3 py-1.5 rounded-xl hover:bg-white/5 transition-all cursor-pointer"
              >
                Cancel
              </button>
              {/* Stop & Send Button */}
              <button
                type="button"
                onClick={stopRecording}
                className="bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold px-3 py-1.5 rounded-xl transition-all shadow-md active:scale-95 flex items-center gap-1 cursor-pointer"
              >
                <Mic className="w-3.5 h-3.5 fill-white/10" />
                <span>Send</span>
              </button>
            </div>
          </div>
        </div>
      ) : !canSendInGroup ? (
        <div className="relative z-10 w-full bg-purple-950/40 border border-purple-500/30 rounded-2xl p-3.5 text-center text-xs text-purple-200 font-sans flex items-center justify-center gap-2 select-none shadow-lg">
          <Lock className="w-4 h-4 text-purple-400 shrink-0" />
          <span>Only group admins can send messages in this group.</span>
        </div>
      ) : (
        <form onSubmit={handleSend} className="relative z-10 flex gap-2 w-full">
          {/* Mobile-Friendly Image Upload Trigger button */}
          <label
            className="relative overflow-hidden bg-neutral-900 border border-white/10 text-rose-300 p-3 rounded-2xl hover:bg-neutral-800 hover:border-rose-500/30 transition-all active:scale-95 flex items-center justify-center cursor-pointer shrink-0"
            title="Attach Memory Photo"
          >
            <input
              type="file"
              multiple
              accept="image/*,image/heic,image/heif"
              ref={fileInputRef}
              onChange={handleImageChange}
              className="absolute inset-0 opacity-0 w-full h-full cursor-pointer z-10"
            />
            <ImageIcon className="w-4 h-4" />
          </label>

          {/* Microphone button inside form */}
          <button
            type="button"
            onClick={startRecording}
            className="bg-neutral-900 border border-white/10 text-rose-300 p-3 rounded-2xl hover:bg-neutral-800 hover:border-rose-500/30 transition-all active:scale-95 flex items-center justify-center cursor-pointer shrink-0"
            title="Record Voice Note"
          >
            <Mic className="w-4 h-4" />
          </button>

          <div className="relative flex-1 min-w-0">
            <input
              type="text"
              ref={chatInputRef}
              value={inputText}
              onChange={handleInputChange}
              placeholder="Type a sweet message to your love..."
              className="w-full bg-neutral-900 border border-white/10 rounded-2xl pl-4 pr-11 py-3 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-rose-500/50 focus:ring-1 focus:ring-rose-500/20 transition-all font-sans"
            />
            <button
              type="button"
              onClick={() => setShowInputEmojiPicker(!showInputEmojiPicker)}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-rose-400 transition-colors cursor-pointer p-1 rounded-full hover:bg-white/5 active:scale-90"
              title="Insert Emoji"
            >
              <Smile className="w-4 h-4" />
            </button>
            
            {/* Input Emoji Picker Pop-up */}
            <AnimatePresence>
              {showInputEmojiPicker && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowInputEmojiPicker(false)} />
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                    className="absolute bottom-full mb-3 right-0 z-50 shadow-2xl"
                  >
                    <EmojiPicker 
                      onSelect={(emoji) => setInputText((prev) => prev + emoji)}
                      onClose={() => setShowInputEmojiPicker(false)}
                    />
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
          <button
            type="submit"
            disabled={isUploadingAnyPhoto}
            className="bg-gradient-to-r from-rose-500 to-pink-600 text-white p-3 rounded-2xl hover:opacity-95 transition-opacity active:scale-95 shadow-md shadow-rose-950/20 flex items-center justify-center cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isUploadingAnyPhoto ? (
              <Loader2 className="w-4 h-4 animate-spin text-white" />
            ) : (
              <Send className="w-4 h-4 fill-white" />
            )}
          </button>
        </form>
      )}
            </>
          )}
        </div>
      </div>

      {/* Custom Delete Confirmation Modal */}
      <AnimatePresence>
        {deleteTargetId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDeleteTargetId(null)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            {/* Card */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative bg-neutral-900 border border-white/10 rounded-3xl p-6 max-w-sm w-full shadow-2xl text-center space-y-4"
            >
              <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center mx-auto text-rose-400">
                <Trash2 className="w-5 h-5 animate-pulse" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-white">Delete Message?</h3>
                <p className="text-xs text-neutral-400">
                  Are you sure you want to delete this message? This action is irreversible.
                </p>
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setDeleteTargetId(null)}
                  className="flex-1 px-4 py-2 bg-white/5 hover:bg-white/10 rounded-xl text-xs font-semibold text-neutral-300 transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (deleteTargetId) {
                      onDeleteMessage(deleteTargetId);
                      setDeleteTargetId(null);
                    }
                  }}
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-rose-500 to-pink-600 hover:opacity-95 text-white rounded-xl text-xs font-bold transition-all shadow-md active:scale-95 cursor-pointer"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Custom Bulk Delete Confirmation Modal */}
      <AnimatePresence>
        {showBulkDeleteConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowBulkDeleteConfirm(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            {/* Card */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative bg-neutral-900 border border-white/10 rounded-3xl p-6 max-w-sm w-full shadow-2xl text-center space-y-4"
            >
              <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center mx-auto text-rose-400">
                <Trash2 className="w-5 h-5 animate-pulse" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-white">Delete Selected Messages?</h3>
                <p className="text-xs text-neutral-400">
                  Are you sure you want to delete these {selectedMessageIds.length} messages? This action is irreversible.
                </p>
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowBulkDeleteConfirm(false)}
                  className="flex-1 px-4 py-2 bg-white/5 hover:bg-white/10 rounded-xl text-xs font-semibold text-neutral-300 transition-all cursor-pointer"
                >
                  Cancel
                </button>
                 <button
                  type="button"
                  onClick={() => {
                    const deletedMsgs = conversationMessages.filter(m => selectedMessageIds.includes(m.id));

                    selectedMessageIds.forEach(id => {
                      onDeleteMessage(id);
                    });

                    setToast({
                      message: `Deleted ${deletedMsgs.length} messages`,
                      type: 'delete',
                      undoData: deletedMsgs
                    });

                    setSelectedMessageIds([]);
                    setIsSelectionMode(false);
                    setShowBulkDeleteConfirm(false);
                  }}
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-rose-500 to-pink-600 hover:opacity-95 text-white rounded-xl text-xs font-bold transition-all shadow-md active:scale-95 cursor-pointer"
                >
                  Delete All
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Custom Delete Conversation Confirmation Modal */}
      <AnimatePresence>
        {showDeleteConvConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setShowDeleteConvConfirm(false);
                setPartnerToDelete(null);
              }}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            {/* Card */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative bg-neutral-900 border border-white/10 rounded-3xl p-6 max-w-sm w-full shadow-2xl text-center space-y-4"
            >
              <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center mx-auto text-rose-400">
                <Trash2 className="w-5 h-5 animate-pulse" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-white">Delete Entire Chat?</h3>
                <p className="text-xs text-neutral-400 leading-relaxed">
                  Are you sure you want to delete all chat messages with <span className="text-rose-300 font-semibold">{(partnerToDelete || activePartner || '').toLowerCase().trim() === currentSender.toLowerCase().trim() ? "yourself (Notes to Self)" : (partnerToDelete || activePartner)}</span>? This action is irreversible.
                </p>
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowDeleteConvConfirm(false);
                    setPartnerToDelete(null);
                  }}
                  className="flex-1 px-4 py-2 bg-white/5 hover:bg-white/10 rounded-xl text-xs font-semibold text-neutral-300 transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const partnerToClear = partnerToDelete || activePartner;
                    if (partnerToClear) {
                      const normPartner = partnerToClear.toLowerCase().trim();
                      const me = currentSender.toLowerCase().trim();

                      // Filter messages between me and partnerToClear
                      const msgsToClear = messages.filter(msg => {
                        const msgSender = msg.sender.toLowerCase().trim();
                        const msgReceiver = (msg.receiver || '').toLowerCase().trim();
                        
                        // 1. Primary filter by conversationId if present
                        if (msg.conversationId) {
                          const activeConvId = [me, normPartner].sort().join('_');
                          return msg.conversationId === activeConvId;
                        }

                        // 2. Secondary filter by receiver if present
                        if (msgReceiver) {
                          return (msgSender === me && msgReceiver === normPartner) || 
                                 (msgSender === normPartner && msgReceiver === me);
                        } else {
                          // Default legacy fallback for admin/firstRegularUser
                          const firstRegularUser = userAccounts[0]?.username?.toLowerCase().trim() || '';
                          const adminName = adminUsername.toLowerCase().trim();
                          
                          const isLegacyChat = (me === adminName && normPartner === firstRegularUser) || 
                                               (me === firstRegularUser && normPartner === adminName);
                          
                          if (isLegacyChat) {
                            return (msgSender === me || msgSender === normPartner);
                          }
                          return false;
                        }
                      });

                      // Delete each message
                      msgsToClear.forEach(m => {
                        onDeleteMessage(m.id);
                      });

                      // Remove from custom partners
                      const updated = customChatPartners.filter(p => p.toLowerCase().trim() !== normPartner);
                      setCustomChatPartners(updated);
                      try {
                        const key = `started_chats_v1_${currentSender.toLowerCase().trim()}`;
                        localStorage.setItem(key, JSON.stringify(updated));
                      } catch (err) {
                        console.error("Error saving updated chats to localStorage:", err);
                      }

                      setToast({
                        message: `Deleted conversation with ${partnerToClear}`,
                        type: 'delete',
                        undoData: null
                      });

                      // If the active chat is the one we deleted, close it
                      if (activePartner && activePartner.toLowerCase().trim() === normPartner) {
                        setActivePartner(null);
                      }

                      setPartnerToDelete(null);
                      setShowDeleteConvConfirm(false);
                    }
                  }}
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-rose-500 to-pink-600 hover:opacity-95 text-white rounded-xl text-xs font-bold transition-all shadow-md active:scale-95 cursor-pointer"
                >
                  Delete Chat
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Mobile Actions Drawer Bottom Sheet */}
      <AnimatePresence>
        {activeMobileMenuMessage && (
          <div className="fixed inset-0 z-50 flex items-end justify-center">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setActiveMobileMenuMessage(null)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            {/* Sheet Container */}
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 220 }}
              className="relative bg-neutral-900 border-t border-white/10 rounded-t-[32px] w-full max-w-md p-6 pb-10 shadow-2xl space-y-6 flex flex-col z-10 overflow-hidden"
            >
              {/* Drag handle line */}
              <div className="w-12 h-1 bg-neutral-800 rounded-full mx-auto" />

              {/* Message Header Preview */}
              <div className="space-y-1 text-center">
                <span className="text-[10px] uppercase tracking-widest font-bold text-rose-400 bg-rose-500/10 px-2.5 py-1 rounded-full">
                  {activeMobileMenuMessage.sender}
                </span>
                <p className="text-xs text-neutral-400 font-mono mt-1">
                  {formatDetailedMessageTime(activeMobileMenuMessage.timestamp)}
                </p>
                <div className="max-h-24 overflow-y-auto bg-black/30 border border-white/5 rounded-2xl p-3 text-sm text-neutral-200 mt-2 text-left italic font-sans break-words">
                  {activeMobileMenuMessage.content || "Voice Note 🎙️"}
                </div>
              </div>

              {/* Quick Reactions Slider Row */}
              <div className="space-y-2">
                <p className="text-[10px] uppercase tracking-widest font-semibold text-neutral-500 text-center">
                  React to message
                </p>
                <div className="flex flex-wrap items-center justify-center gap-2.5 sm:gap-3 py-2 px-3.5 bg-white/5 border border-white/10 rounded-2xl w-full">
                  <div className="flex items-center justify-center gap-2.5 sm:gap-3">
                    {quickReactions.map((emoji, idx) => (
                      <button
                        key={`modal-quick-react-${emoji}-${idx}`}
                        onClick={() => {
                          onReactToMessage(activeMobileMenuMessage.id, emoji);
                          setActiveMobileMenuMessage(null);
                        }}
                        className="text-2xl hover:scale-125 active:scale-95 transition-transform duration-100 p-0.5 cursor-pointer shrink-0"
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                  <div className="h-4 w-[1px] bg-white/10 shrink-0" />
                  <button
                    onClick={() => {
                      onReactToMessage(activeMobileMenuMessage.id, '');
                      setActiveMobileMenuMessage(null);
                    }}
                    className="text-[10px] text-neutral-400 font-medium px-2.5 py-1.5 hover:text-white bg-white/5 hover:bg-white/10 active:scale-95 rounded-xl transition-all cursor-pointer shrink-0"
                  >
                    Clear
                  </button>
                </div>
              </div>

              {/* Action Buttons List */}
              <div className="grid grid-cols-1 gap-2.5">
                {/* Direct DM Chat option for other users in global chat */}
                {activePartner?.toLowerCase().trim() === 'global' && activeMobileMenuMessage.sender.toLowerCase().trim() !== currentSender.toLowerCase().trim() && (
                  <button
                    onClick={() => {
                      const sender = activeMobileMenuMessage.sender;
                      setActiveMobileMenuMessage(null);
                      startChatWithPartner(sender);
                    }}
                    className="flex items-center gap-3 w-full bg-rose-500/15 hover:bg-rose-500/25 active:scale-[0.98] py-3 px-4 rounded-2xl text-left text-sm font-semibold text-rose-200 border border-rose-500/20 transition-all cursor-pointer shadow-sm"
                  >
                    <MessageSquare className="w-4 h-4 text-rose-400 shrink-0" />
                    <span>Direct Chat with {activeMobileMenuMessage.sender}</span>
                  </button>
                )}

                {/* Reply Button */}
                <button
                  onClick={() => {
                    handleSetReplyTarget(activeMobileMenuMessage);
                    setActiveMobileMenuMessage(null);
                  }}
                  className="flex items-center gap-3 w-full bg-white/5 hover:bg-white/10 active:scale-[0.98] py-3 px-4 rounded-2xl text-left text-sm font-semibold text-white border border-white/5 transition-all cursor-pointer"
                >
                  <CornerUpLeft className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>Reply to Message</span>
                </button>

                {/* Pin / Unpin Button */}
                <button
                  onClick={() => {
                    onTogglePinMessage?.(activeMobileMenuMessage.id);
                    setActiveMobileMenuMessage(null);
                  }}
                  className="flex items-center gap-3 w-full bg-white/5 hover:bg-white/10 active:scale-[0.98] py-3 px-4 rounded-2xl text-left text-sm font-semibold text-white border border-white/5 transition-all cursor-pointer"
                >
                  <Pin className={`w-4 h-4 shrink-0 ${activeMobileMenuMessage.pinned ? 'text-amber-400 fill-amber-400' : 'text-rose-400'}`} />
                  <span>{activeMobileMenuMessage.pinned ? 'Unpin Message' : 'Pin Message'}</span>
                </button>

                {/* Save / Unsave Button */}
                <button
                  onClick={() => {
                    toggleSaveMessage(activeMobileMenuMessage.id);
                    setActiveMobileMenuMessage(null);
                  }}
                  className="flex items-center gap-3 w-full bg-white/5 hover:bg-white/10 active:scale-[0.98] py-3 px-4 rounded-2xl text-left text-sm font-semibold text-white border border-white/5 transition-all cursor-pointer"
                >
                  <Bookmark className={`w-4 h-4 shrink-0 ${savedMessageIds.includes(activeMobileMenuMessage.id) ? 'text-teal-400 fill-teal-400' : 'text-rose-400'}`} />
                  <span>{savedMessageIds.includes(activeMobileMenuMessage.id) ? 'Unsave Message' : 'Save Message'}</span>
                </button>

                {/* Copy Text Button */}
                {activeMobileMenuMessage.content && activeMobileMenuMessage.content !== "Voice Note 🎙️" && (
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(activeMobileMenuMessage.content);
                      setCopiedMessageId(activeMobileMenuMessage.id);
                      setTimeout(() => {
                        setCopiedMessageId(null);
                        setActiveMobileMenuMessage(null);
                      }, 1200);
                    }}
                    className="flex items-center justify-between w-full bg-white/5 hover:bg-white/10 active:scale-[0.98] py-3 px-4 rounded-2xl text-left text-sm font-semibold text-white border border-white/5 transition-all cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <Copy className="w-4 h-4 text-rose-400 shrink-0" />
                      <span>Copy Text</span>
                    </div>
                    {copiedMessageId === activeMobileMenuMessage.id ? (
                      <span className="text-xs text-emerald-400 flex items-center gap-1 font-mono">
                        <Check className="w-3.5 h-3.5" /> Copied!
                      </span>
                    ) : null}
                  </button>
                )}

                {/* Message Info & Read Receipts Button (if sent by user) */}
                {activeMobileMenuMessage.sender.toLowerCase().trim() === currentUser.toLowerCase().trim() && (
                  <button
                    onClick={() => {
                      const target = activeMobileMenuMessage;
                      setActiveMobileMenuMessage(null);
                      setMessageSeenInfoTarget(target);
                    }}
                    className="flex items-center gap-3 w-full bg-white/5 hover:bg-white/10 active:scale-[0.98] py-3 px-4 rounded-2xl text-left text-sm font-semibold text-white border border-white/5 transition-all cursor-pointer"
                  >
                    <Eye className="w-4 h-4 text-rose-400 shrink-0" />
                    <span>Message Info & Read Status</span>
                  </button>
                )}

                {/* Select / Multi-select Button */}
                <button
                  onClick={() => {
                    handleEnableSelectionMode(activeMobileMenuMessage.id);
                    setActiveMobileMenuMessage(null);
                  }}
                  className="flex items-center gap-3 w-full bg-white/5 hover:bg-white/10 active:scale-[0.98] py-3 px-4 rounded-2xl text-left text-sm font-semibold text-white border border-white/5 transition-all cursor-pointer"
                >
                  <CheckSquare className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>Select Message</span>
                </button>

                {/* Delete Message (if mine) */}
                {activeMobileMenuMessage.sender.toLowerCase().trim() === currentUser.toLowerCase().trim() && (
                  <button
                    onClick={() => {
                      setDeleteTargetId(activeMobileMenuMessage.id);
                      setActiveMobileMenuMessage(null);
                    }}
                    className="flex items-center gap-3 w-full bg-rose-500/10 hover:bg-rose-500/20 active:scale-[0.98] py-3 px-4 rounded-2xl text-left text-sm font-semibold text-rose-200 border border-rose-500/10 transition-all cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4 text-rose-500 shrink-0" />
                    <span>Delete Message</span>
                  </button>
                )}

                {/* Cancel/Close Button */}
                <button
                  onClick={() => setActiveMobileMenuMessage(null)}
                  className="w-full bg-neutral-950 hover:bg-black active:scale-[0.98] py-3 px-4 rounded-2xl text-center text-sm font-bold text-neutral-400 border border-white/5 transition-all mt-1 cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Undo Toast Notification */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            transition={{ type: 'spring', damping: 20, stiffness: 300 }}
            className="absolute bottom-24 left-1/2 -translate-x-1/2 z-50 bg-neutral-950/95 border border-rose-500/30 text-white rounded-2xl flex items-center justify-between gap-4 px-4 py-3 shadow-2xl shadow-rose-950/20 max-w-sm w-[90%] sm:w-auto backdrop-blur-md"
          >
            <div className="flex items-center gap-2.5">
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse shrink-0" />
              <p className="text-xs font-medium text-rose-100">{toast.message}</p>
            </div>
            <button
              onClick={handleUndo}
              className="px-3 py-1.5 bg-rose-500 hover:bg-rose-600 active:scale-95 text-white font-bold rounded-xl text-[10px] uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1 shadow-md shadow-rose-500/20 shrink-0"
            >
              Undo
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Create & Join Group Chat Modal */}
      <AnimatePresence>
        {isCreateGroupModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-neutral-900 border border-purple-500/30 rounded-3xl p-6 max-w-md w-full shadow-2xl shadow-purple-950/40 text-white space-y-5"
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <div className="flex items-center gap-2 text-purple-300 font-serif font-bold text-lg">
                  <Users className="w-5 h-5 text-purple-400" />
                  <span>Group Chat</span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsCreateGroupModalOpen(false)}
                  className="p-1.5 rounded-xl text-neutral-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Tab Selector */}
              <div className="grid grid-cols-2 p-1 bg-black/30 border border-white/5 rounded-2xl gap-1">
                <button
                  type="button"
                  onClick={() => setGroupModalTab('create')}
                  className={`py-2 text-xs font-semibold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                    groupModalTab === 'create'
                      ? 'bg-purple-600 text-white shadow-md'
                      : 'text-neutral-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>Create Group</span>
                </button>
                <button
                  type="button"
                  onClick={() => setGroupModalTab('join')}
                  className={`py-2 text-xs font-semibold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                    groupModalTab === 'join'
                      ? 'bg-purple-600 text-white shadow-md'
                      : 'text-neutral-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <Link className="w-3.5 h-3.5" />
                  <span>Join with Code</span>
                </button>
              </div>

              {groupModalTab === 'create' ? (
                <form onSubmit={handleCreateGroup} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider mb-1">
                      Group Name *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Family & Friends, Trip Planning..."
                      value={newGroupName}
                      onChange={(e) => setNewGroupName(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-2.5 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-purple-500/50"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider mb-1">
                      Description (Optional)
                    </label>
                    <input
                      type="text"
                      placeholder="Group topic or description"
                      value={newGroupDesc}
                      onChange={(e) => setNewGroupDesc(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-2.5 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-purple-500/50"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                        Select Members ({selectedGroupMembers.length} selected)
                      </label>
                      <span className="text-[10px] text-purple-300 font-sans font-medium">
                        {availableDmMembers.length} conversation DM{availableDmMembers.length === 1 ? '' : 's'}
                      </span>
                    </div>

                    {/* Search Filter for Active DM Conversations */}
                    <div className="relative mb-2">
                      <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                      <input
                        type="text"
                        placeholder="Search active conversations..."
                        value={groupMemberSearchQuery}
                        onChange={(e) => setGroupMemberSearchQuery(e.target.value)}
                        className="w-full bg-white/5 border border-white/10 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-purple-500/50"
                      />
                    </div>

                    <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1 custom-scrollbar border border-white/5 p-2 rounded-2xl bg-black/20">
                      {availableDmMembers
                        .filter(u => !groupMemberSearchQuery.trim() || u.username.toLowerCase().includes(groupMemberSearchQuery.toLowerCase().trim()))
                        .map((u, idx) => {
                          const isSelected = selectedGroupMembers.includes(u.username);
                          return (
                            <label
                              key={`group-member-select-${u.id || u.username}-${idx}`}
                              className={`flex items-center justify-between p-2 rounded-xl border transition-all cursor-pointer ${
                                isSelected
                                  ? 'bg-purple-500/20 border-purple-500/40 text-purple-200'
                                  : 'bg-white/5 border-white/5 hover:bg-white/10 text-neutral-300'
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-purple-500/30 to-indigo-500/30 text-purple-300 font-bold text-[10px] flex items-center justify-center border border-purple-500/30 uppercase font-sans">
                                  {u.username.substring(0, 2)}
                                </div>
                                <span className="text-xs font-medium">{u.username}</span>
                              </div>
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => {
                                  if (isSelected) {
                                    setSelectedGroupMembers(prev => prev.filter(m => m !== u.username));
                                  } else {
                                    setSelectedGroupMembers(prev => [...prev, u.username]);
                                  }
                                }}
                                className="rounded accent-purple-500 w-4 h-4 cursor-pointer"
                              />
                            </label>
                          );
                        })}

                      {availableDmMembers.length === 0 ? (
                        <p className="text-xs text-neutral-400 italic text-center py-4">
                          No active DM conversations found in your chat list. Start a chat with someone first to invite them to a group.
                        </p>
                      ) : availableDmMembers.filter(u => !groupMemberSearchQuery.trim() || u.username.toLowerCase().includes(groupMemberSearchQuery.toLowerCase().trim())).length === 0 ? (
                        <p className="text-xs text-neutral-500 italic text-center py-4">
                          No active conversations found matching "{groupMemberSearchQuery}"
                        </p>
                      ) : null}
                    </div>
                    <p className="text-[10px] text-neutral-500 mt-1.5 font-sans">
                      You ({currentSender}) are automatically included as group creator.
                    </p>
                  </div>

                  <div className="flex items-center justify-end gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setIsCreateGroupModalOpen(false)}
                      className="px-4 py-2 rounded-xl text-xs font-semibold text-neutral-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={!newGroupName.trim()}
                      className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-purple-600 hover:bg-purple-500 active:scale-95 transition-all shadow-lg shadow-purple-600/30 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                    >
                      Create Group
                    </button>
                  </div>
                </form>
              ) : (
                <form onSubmit={handleJoinGroupByCode} className="space-y-4 py-2">
                  <div className="text-center space-y-1">
                    <div className="w-12 h-12 rounded-2xl bg-purple-500/20 text-purple-300 border border-purple-500/30 flex items-center justify-center mx-auto mb-2">
                      <Link className="w-6 h-6 text-purple-400" />
                    </div>
                    <h3 className="text-sm font-bold text-white">Join via Invite Code</h3>
                    <p className="text-xs text-neutral-400 font-sans">
                      Enter the 6-character group invite code (e.g. GRP-A8B9C2) to instantly join the group chat.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider mb-1">
                      Invite Code or Link
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="GRP-XXXXXX"
                      value={joinGroupInput}
                      onChange={(e) => setJoinGroupInput(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-sm font-mono text-center text-purple-200 tracking-wider placeholder-neutral-500 focus:outline-none focus:border-purple-500/50 uppercase"
                    />
                  </div>

                  <div className="flex items-center justify-end gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setIsCreateGroupModalOpen(false)}
                      className="px-4 py-2 rounded-xl text-xs font-semibold text-neutral-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={!joinGroupInput.trim()}
                      className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-purple-600 hover:bg-purple-500 active:scale-95 transition-all shadow-lg shadow-purple-600/30 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                    >
                      Join Group
                    </button>
                  </div>
                </form>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Telegram/WhatsApp Style Group Settings Modal */}
      <AnimatePresence>
        {isGroupSettingsOpen && activeGroup && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-neutral-900 border border-purple-500/30 rounded-3xl p-5 sm:p-6 max-w-lg w-full shadow-2xl shadow-purple-950/40 text-white space-y-4 max-h-[90vh] flex flex-col"
            >
              {/* Modal Top Header */}
              <div className="flex items-center justify-between border-b border-white/10 pb-3 shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500/30 to-indigo-500/30 text-purple-300 border border-purple-500/30 flex items-center justify-center font-bold text-sm shrink-0">
                    <Users className="w-5 h-5 text-purple-300" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-base font-bold text-white truncate flex items-center gap-1.5">
                      <span>{activeGroup.name}</span>
                      {isGroupAdmin && (
                        <span title="You are an Admin">
                          <Shield className="w-4 h-4 text-purple-400 shrink-0" />
                        </span>
                      )}
                    </h3>
                    <p className="text-[11px] text-neutral-400 font-sans truncate">
                      {activeGroup.members?.length || 0} members • Created by {activeGroup.createdBy}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsGroupSettingsOpen(false);
                    setIsEditingGroupInfo(false);
                  }}
                  className="p-1.5 rounded-xl text-neutral-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer shrink-0"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Multi-Tab Navigation Bar */}
              <div className="grid grid-cols-4 p-1 bg-black/40 border border-white/10 rounded-2xl gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => setActiveGroupSettingsTab('info')}
                  className={`py-2 px-1 text-xs font-semibold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                    activeGroupSettingsTab === 'info'
                      ? 'bg-purple-600 text-white shadow-md'
                      : 'text-neutral-400 hover:text-white hover:bg-white/5'
                  }`}
                  title="Group Info"
                >
                  <Info className="w-3.5 h-3.5 shrink-0" />
                  <span className="hidden sm:inline">Info</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveGroupSettingsTab('members')}
                  className={`py-2 px-1 text-xs font-semibold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                    activeGroupSettingsTab === 'members'
                      ? 'bg-purple-600 text-white shadow-md'
                      : 'text-neutral-400 hover:text-white hover:bg-white/5'
                  }`}
                  title="Group Members"
                >
                  <Users className="w-3.5 h-3.5 shrink-0" />
                  <span className="hidden sm:inline">Members</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveGroupSettingsTab('permissions')}
                  className={`py-2 px-1 text-xs font-semibold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                    activeGroupSettingsTab === 'permissions'
                      ? 'bg-purple-600 text-white shadow-md'
                      : 'text-neutral-400 hover:text-white hover:bg-white/5'
                  }`}
                  title="Permissions & Settings"
                >
                  <Lock className="w-3.5 h-3.5 shrink-0" />
                  <span className="hidden sm:inline">Settings</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveGroupSettingsTab('media')}
                  className={`py-2 px-1 text-xs font-semibold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                    activeGroupSettingsTab === 'media'
                      ? 'bg-purple-600 text-white shadow-md'
                      : 'text-neutral-400 hover:text-white hover:bg-white/5'
                  }`}
                  title="Shared Media"
                >
                  <ImageIcon className="w-3.5 h-3.5 shrink-0" />
                  <span className="hidden sm:inline">Media</span>
                </button>
              </div>

              {/* Tab 1: Group Info & Quick Actions */}
              {activeGroupSettingsTab === 'info' && (
                <div className="space-y-4 overflow-y-auto pr-1 custom-scrollbar flex-1">
                  {/* Group Info Card */}
                  <div className="bg-white/5 border border-white/5 p-4 rounded-2xl space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">
                        Group Details
                      </span>
                      {canEditGroupInfo && (
                        <button
                          type="button"
                          onClick={() => {
                            if (!isEditingGroupInfo) {
                              setEditGroupName(activeGroup.name);
                              setEditGroupDesc(activeGroup.description || '');
                            }
                            setIsEditingGroupInfo(!isEditingGroupInfo);
                          }}
                          className="text-xs text-purple-300 hover:text-purple-200 flex items-center gap-1 font-medium cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>{isEditingGroupInfo ? 'Cancel' : 'Edit'}</span>
                        </button>
                      )}
                    </div>

                    {isEditingGroupInfo ? (
                      <div className="space-y-3 pt-1">
                        <div>
                          <label className="block text-[10px] font-medium text-neutral-400 uppercase mb-1">
                            Group Name
                          </label>
                          <input
                            type="text"
                            value={editGroupName}
                            onChange={(e) => setEditGroupName(e.target.value)}
                            className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-purple-500/50"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-medium text-neutral-400 uppercase mb-1">
                            Description
                          </label>
                          <textarea
                            rows={2}
                            value={editGroupDesc}
                            onChange={(e) => setEditGroupDesc(e.target.value)}
                            className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-purple-500/50 resize-none"
                            placeholder="Add group description..."
                          />
                        </div>
                        <button
                          type="button"
                          onClick={handleSaveGroupInfo}
                          disabled={!editGroupName.trim()}
                          className="w-full py-2 bg-purple-600 hover:bg-purple-500 active:scale-95 text-white font-bold text-xs rounded-xl transition-all cursor-pointer shadow-md disabled:opacity-50"
                        >
                          Save Changes
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <p className="text-xs text-neutral-300 font-sans leading-relaxed">
                          {activeGroup.description || <span className="text-neutral-500 italic">No description set for this group.</span>}
                        </p>
                        <div className="flex items-center gap-2 text-[11px] text-neutral-400 pt-1 border-t border-white/5 font-mono">
                          <Calendar className="w-3.5 h-3.5 text-purple-400" />
                          <span>Created {new Date(activeGroup.createdAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Invite Link Card */}
                  <div className="bg-white/5 border border-white/5 p-4 rounded-2xl space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Link className={`w-4 h-4 ${activeGroup.isInviteLinkEnabled !== false ? 'text-purple-400' : 'text-amber-400'}`} />
                        <span className="text-xs font-bold text-white">Group Invite Link</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className={`text-[10px] border px-2 py-0.5 rounded-full font-mono font-bold ${
                          activeGroup.isInviteLinkEnabled !== false 
                            ? 'bg-purple-500/20 text-purple-300 border-purple-500/30' 
                            : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                        }`}>
                          {activeGroup.isInviteLinkEnabled !== false ? 'Active' : 'Disabled'}
                        </span>
                        <span className="text-[10px] bg-white/10 text-neutral-300 border border-white/10 px-2 py-0.5 rounded-full font-mono font-bold">
                          {activeGroup.inviteCode || 'GRP-8A9F'}
                        </span>
                      </div>
                    </div>

                    <p className="text-[11px] text-neutral-400 font-sans">
                      {activeGroup.isInviteLinkEnabled !== false 
                        ? 'Anyone with this link or code can join this group chat.' 
                        : 'Invite links are currently disabled. Users cannot join via link/code.'}
                    </p>

                    <div className="flex flex-col gap-2 pt-1">
                      {(activeGroup.isInviteLinkEnabled !== false || isGroupAdmin) ? (
                        <button
                          type="button"
                          onClick={handleCopyGroupInviteLink}
                          className="w-full py-2 bg-purple-500/15 hover:bg-purple-500/25 active:scale-95 text-purple-200 border border-purple-500/30 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer"
                        >
                          {copiedInviteLink ? (
                            <>
                              <Check className="w-4 h-4 text-emerald-400" />
                              <span className="text-emerald-300">Invite Link Copied!</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-4 h-4 text-purple-300" />
                              <span>Copy Invite Link {activeGroup.isInviteLinkEnabled === false && '(Admin Only)'}</span>
                            </>
                          )}
                        </button>
                      ) : (
                        <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl text-[11px] text-amber-200 text-center font-medium">
                          Invite link disabled for members by group admin.
                        </div>
                      )}

                      {/* Admin Quick Action to Toggle Link or Revoke Code */}
                      {isGroupAdmin && (
                        <div className="flex items-center justify-between pt-1 border-t border-white/5">
                          <button
                            type="button"
                            onClick={() => handleToggleGroupPermission('isInviteLinkEnabled')}
                            className="text-[10.5px] text-purple-300 hover:text-purple-200 flex items-center gap-1 font-medium cursor-pointer"
                          >
                            {activeGroup.isInviteLinkEnabled !== false ? (
                              <>
                                <Lock className="w-3 h-3 text-amber-400" />
                                <span>Disable for Members</span>
                              </>
                            ) : (
                              <>
                                <Unlock className="w-3 h-3 text-emerald-400" />
                                <span>Enable for Members</span>
                              </>
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={handleResetGroupInviteCode}
                            className="text-[10.5px] text-neutral-400 hover:text-rose-300 flex items-center gap-1 font-medium cursor-pointer"
                            title="Revoke current link and create a new code"
                          >
                            <Sparkles className="w-3 h-3 text-rose-400" />
                            <span>Revoke & Reset Link</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Notifications Mute Toggle */}
                  <div className="bg-white/5 border border-white/5 p-4 rounded-2xl flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-xl ${isGroupMuted ? 'bg-amber-500/20 text-amber-400' : 'bg-purple-500/20 text-purple-300'}`}>
                        {isGroupMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                      </div>
                      <div>
                        <p className="text-xs font-bold text-white">Mute Notifications</p>
                        <p className="text-[10px] text-neutral-400 font-sans">
                          {isGroupMuted ? 'You will not receive unread sound or badges' : 'Receive sound alerts for group messages'}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleToggleMuteGroup}
                      className={`w-11 h-6 rounded-full transition-colors p-1 cursor-pointer relative ${
                        isGroupMuted ? 'bg-amber-500' : 'bg-neutral-700'
                      }`}
                    >
                      <span
                        className={`block w-4 h-4 rounded-full bg-white shadow-md transition-transform ${
                          isGroupMuted ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                </div>
              )}

              {/* Tab 2: Group Members List & Management */}
              {activeGroupSettingsTab === 'members' && (
                <div className="space-y-3 overflow-y-auto pr-1 custom-scrollbar flex-1">
                  {/* Search / Add Member Section */}
                  <div className="flex items-center justify-between text-xs font-semibold text-neutral-300">
                    <span>Members ({activeGroup.members?.length || 0})</span>
                    {canAddGroupMembers && (
                      <span className="text-[10px] text-purple-300 font-sans">
                        Admin powers enabled
                      </span>
                    )}
                  </div>

                  {canAddGroupMembers && (
                    <div className="space-y-2 bg-white/5 border border-white/5 p-3 rounded-2xl">
                      <label className="block text-[10px] font-bold text-purple-300 uppercase tracking-wider">
                        Invite New Member to Group
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="Enter username..."
                          value={groupMemberToAdd}
                          onChange={(e) => {
                            setGroupMemberToAdd(e.target.value);
                            if (addMemberError) setAddMemberError(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleAddMemberToActiveGroup();
                            }
                          }}
                          className="flex-1 bg-black/30 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-purple-500/50"
                        />
                        <button
                          type="button"
                          onClick={handleAddMemberToActiveGroup}
                          disabled={!groupMemberToAdd.trim()}
                          className="px-3.5 py-1.5 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl text-xs transition-colors disabled:opacity-50 cursor-pointer shrink-0"
                        >
                          Send Invite
                        </button>
                      </div>

                      {/* Username validation error alert */}
                      {addMemberError && (
                        <div className="p-2.5 bg-rose-500/15 border border-rose-500/30 rounded-xl text-[11px] text-rose-300 flex items-center gap-1.5 font-medium animate-fadeIn">
                          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                          <span>{addMemberError}</span>
                        </div>
                      )}

                      {/* Success confirmation alert */}
                      {addMemberSuccess && (
                        <div className="p-2.5 bg-emerald-500/15 border border-emerald-500/30 rounded-xl text-[11px] text-emerald-300 flex items-center gap-1.5 font-medium animate-fadeIn">
                          <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                          <span>{addMemberSuccess}</span>
                        </div>
                      )}

                      {availableDmMembers.filter(u => 
                        !activeGroup.members?.map(m => m.toLowerCase().trim()).includes(u.username.toLowerCase().trim()) &&
                        !activeGroup.pendingMembers?.map(m => m.toLowerCase().trim()).includes(u.username.toLowerCase().trim())
                      ).length > 0 && (
                        <div className="pt-1">
                          <p className="text-[10px] text-neutral-400 mb-1 font-sans">Quick invite from your active chats:</p>
                          <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto custom-scrollbar">
                            {availableDmMembers
                              .filter(u => 
                                !activeGroup.members?.map(m => m.toLowerCase().trim()).includes(u.username.toLowerCase().trim()) &&
                                !activeGroup.pendingMembers?.map(m => m.toLowerCase().trim()).includes(u.username.toLowerCase().trim())
                              )
                              .map((u, idx) => (
                                <button
                                  key={`quick-add-${u.id || u.username}-${idx}`}
                                  type="button"
                                  onClick={() => handleQuickAddInviteMember(u.username)}
                                  className="text-[10px] bg-purple-500/15 hover:bg-purple-500/30 text-purple-200 border border-purple-500/30 px-2 py-0.5 rounded-lg flex items-center gap-1 transition-all cursor-pointer font-sans"
                                >
                                  <span>+ Invite {u.username}</span>
                                </button>
                              ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Members List */}
                  <div className="space-y-1.5 bg-black/20 border border-white/5 p-2 rounded-2xl max-h-56 overflow-y-auto custom-scrollbar">
                    {activeGroup.members?.map((member, idx) => {
                      const memberNorm = member.toLowerCase().trim();
                      const isOwner = memberNorm === activeGroup.createdBy?.toLowerCase().trim();
                      const isAdmin = (activeGroup.admins || []).map(a => a.toLowerCase().trim()).includes(memberNorm) || isOwner;
                      const isMe = memberNorm === currentSender.toLowerCase().trim();

                      return (
                        <div
                          key={`group-member-item-${member}-${idx}`}
                          className="flex items-center justify-between p-2.5 rounded-xl bg-white/5 border border-white/5 hover:border-white/10 transition-all"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500/30 to-indigo-500/30 text-purple-200 font-bold text-xs flex items-center justify-center shrink-0 border border-purple-500/30 uppercase">
                              {member.substring(0, 2)}
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-neutral-200 truncate flex items-center gap-1.5">
                                <span>{member} {isMe && '(You)'}</span>
                                {isOwner && (
                                  <span className="text-[8.5px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-1.5 py-0.2 rounded uppercase font-bold tracking-tight shrink-0 flex items-center gap-0.5">
                                    <Crown className="w-2.5 h-2.5 text-amber-400" /> Owner
                                  </span>
                                )}
                                {!isOwner && isAdmin && (
                                  <span className="text-[8.5px] bg-purple-500/20 text-purple-300 border border-purple-500/30 px-1.5 py-0.2 rounded uppercase font-bold tracking-tight shrink-0 flex items-center gap-0.5">
                                    <ShieldCheck className="w-2.5 h-2.5 text-purple-300" /> Admin
                                  </span>
                                )}
                              </p>
                              <p className="text-[9.5px] text-neutral-500 font-mono">
                                {isOwner ? 'Group Creator' : isAdmin ? 'Group Admin' : 'Member'}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            {/* Admin promotion / demotion toggle (only for admins, except creator) */}
                            {isGroupAdmin && !isOwner && !isMe && (
                              <button
                                type="button"
                                onClick={() => handleToggleAdminRole(member)}
                                className={`text-[10px] px-2 py-1 rounded-lg border font-medium transition-all cursor-pointer ${
                                  isAdmin
                                    ? 'bg-purple-500/20 border-purple-500/40 text-purple-300 hover:bg-rose-500/20 hover:border-rose-500/40 hover:text-rose-300'
                                    : 'bg-white/5 border-white/10 text-neutral-400 hover:text-purple-300 hover:bg-purple-500/20'
                                }`}
                                title={isAdmin ? 'Dismiss Admin' : 'Make Group Admin'}
                              >
                                {isAdmin ? 'Dismiss Admin' : 'Make Admin'}
                              </button>
                            )}

                            {/* Remove / Leave button */}
                            {(isGroupAdmin || isMe) && !isOwner && (
                              <button
                                type="button"
                                onClick={() => promptRemoveMember(member)}
                                className="text-[10px] text-rose-400 hover:text-rose-300 hover:bg-rose-500/20 px-2 py-1 rounded-lg transition-colors cursor-pointer font-medium"
                              >
                                {isMe ? 'Leave' : 'Remove'}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Pending Group Invitations Section */}
                  {activeGroup.pendingMembers && activeGroup.pendingMembers.length > 0 && (
                    <div className="space-y-2 pt-2 border-t border-white/5">
                      <div className="flex items-center justify-between text-xs font-semibold text-amber-300">
                        <span>Pending Invitations ({activeGroup.pendingMembers.length})</span>
                        <span className="text-[10px] text-amber-400/80 font-mono">Awaiting User Confirmation</span>
                      </div>

                      <div className="space-y-1.5 bg-amber-500/5 border border-amber-500/10 p-2 rounded-2xl max-h-40 overflow-y-auto custom-scrollbar">
                        {activeGroup.pendingMembers.map((pendingUser, idx) => (
                          <div
                            key={`pending-member-item-${pendingUser}-${idx}`}
                            className="flex items-center justify-between p-2 rounded-xl bg-white/5 border border-white/5"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="w-7 h-7 rounded-full bg-amber-500/20 text-amber-300 font-bold text-xs flex items-center justify-center shrink-0 border border-amber-500/30 uppercase">
                                {pendingUser.substring(0, 2)}
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs font-semibold text-neutral-200 truncate">{pendingUser}</p>
                                <p className="text-[9px] text-amber-300/80 font-mono flex items-center gap-1">
                                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                                  Invitation Pending
                                </p>
                              </div>
                            </div>

                            {canAddGroupMembers && (
                              <button
                                type="button"
                                onClick={() => handleCancelGroupInvite(pendingUser)}
                                className="text-[10px] text-rose-400 hover:text-rose-300 hover:bg-rose-500/20 px-2 py-1 rounded-lg transition-colors cursor-pointer font-medium"
                                title="Cancel invitation"
                              >
                                Cancel Invite
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Tab 3: Permissions (WhatsApp / Telegram style) */}
              {activeGroupSettingsTab === 'permissions' && (
                <div className="space-y-4 overflow-y-auto pr-1 custom-scrollbar flex-1">
                  <div className="space-y-1">
                    <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                      <Lock className="w-4 h-4 text-purple-400" />
                      <span>Group Permissions & Restrictions</span>
                    </h4>
                    <p className="text-[11px] text-neutral-400 font-sans">
                      Configure what members can do in this group. Only group admins can change these settings.
                    </p>
                  </div>

                  {!isGroupAdmin && (
                    <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-2xl text-[11px] text-amber-200 flex items-center gap-2 font-sans">
                      <Lock className="w-4 h-4 text-amber-400 shrink-0" />
                      <span>Only group admins can modify group permissions.</span>
                    </div>
                  )}

                  <div className="space-y-3">
                    {/* Toggle 1: Send Messages Permission */}
                    <div className="bg-white/5 border border-white/5 p-3.5 rounded-2xl flex items-center justify-between">
                      <div className="space-y-0.5 max-w-[80%]">
                        <p className="text-xs font-bold text-white">Send Messages</p>
                        <p className="text-[10.5px] text-neutral-400 font-sans">
                          {!activeGroup.onlyAdminsCanSend
                            ? 'All members can send messages, photos, and voice notes'
                            : 'Restricted: Only Admins can send messages (Announcement Mode)'}
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={!isGroupAdmin}
                        onClick={() => handleToggleGroupPermission('onlyAdminsCanSend')}
                        className={`w-11 h-6 rounded-full transition-colors p-1 cursor-pointer relative disabled:opacity-40 disabled:cursor-not-allowed ${
                          !activeGroup.onlyAdminsCanSend ? 'bg-purple-600' : 'bg-neutral-700'
                        }`}
                      >
                        <span
                          className={`block w-4 h-4 rounded-full bg-white shadow-md transition-transform ${
                            !activeGroup.onlyAdminsCanSend ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>

                    {/* Toggle 2: Edit Group Info Permission */}
                    <div className="bg-white/5 border border-white/5 p-3.5 rounded-2xl flex items-center justify-between">
                      <div className="space-y-0.5 max-w-[80%]">
                        <p className="text-xs font-bold text-white">Edit Group Info</p>
                        <p className="text-[10.5px] text-neutral-400 font-sans">
                          {!activeGroup.onlyAdminsCanEditInfo
                            ? 'All members can edit group name and description'
                            : 'Restricted: Only Admins can change group details'}
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={!isGroupAdmin}
                        onClick={() => handleToggleGroupPermission('onlyAdminsCanEditInfo')}
                        className={`w-11 h-6 rounded-full transition-colors p-1 cursor-pointer relative disabled:opacity-40 disabled:cursor-not-allowed ${
                          !activeGroup.onlyAdminsCanEditInfo ? 'bg-purple-600' : 'bg-neutral-700'
                        }`}
                      >
                        <span
                          className={`block w-4 h-4 rounded-full bg-white shadow-md transition-transform ${
                            !activeGroup.onlyAdminsCanEditInfo ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>

                    {/* Toggle 3: Add Other Members Permission */}
                    <div className="bg-white/5 border border-white/5 p-3.5 rounded-2xl flex items-center justify-between">
                      <div className="space-y-0.5 max-w-[80%]">
                        <p className="text-xs font-bold text-white">Add Other Members</p>
                        <p className="text-[10.5px] text-neutral-400 font-sans">
                          {!activeGroup.onlyAdminsCanAddMembers
                            ? 'All members can invite or add friends to group'
                            : 'Restricted: Only Admins can invite or add members'}
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={!isGroupAdmin}
                        onClick={() => handleToggleGroupPermission('onlyAdminsCanAddMembers')}
                        className={`w-11 h-6 rounded-full transition-colors p-1 cursor-pointer relative disabled:opacity-40 disabled:cursor-not-allowed ${
                          !activeGroup.onlyAdminsCanAddMembers ? 'bg-purple-600' : 'bg-neutral-700'
                        }`}
                      >
                        <span
                          className={`block w-4 h-4 rounded-full bg-white shadow-md transition-transform ${
                            !activeGroup.onlyAdminsCanAddMembers ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>

                    {/* Toggle 4: Enable/Disable Group Invite Link & Joining for Members */}
                    <div className="bg-white/5 border border-white/5 p-3.5 rounded-2xl space-y-2.5">
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5 max-w-[80%]">
                          <div className="flex items-center gap-1.5">
                            <p className="text-xs font-bold text-white">Group Invite Link & Joining</p>
                            <span className={`text-[9px] font-mono px-1.5 py-0.2 rounded font-bold uppercase ${
                              activeGroup.isInviteLinkEnabled !== false
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            }`}>
                              {activeGroup.isInviteLinkEnabled !== false ? 'Enabled for Members' : 'Admins Only'}
                            </span>
                          </div>
                          <p className="text-[10.5px] text-neutral-400 font-sans">
                            {activeGroup.isInviteLinkEnabled !== false
                              ? 'All members and users with the invite link or code can join or share links.'
                              : 'Restricted: Regular users cannot join via link or code. Group Chat Admins can invite at all times.'}
                          </p>
                        </div>
                        <button
                          type="button"
                          disabled={!isGroupAdmin}
                          onClick={() => handleToggleGroupPermission('isInviteLinkEnabled')}
                          className={`w-11 h-6 rounded-full transition-colors p-1 cursor-pointer relative disabled:opacity-40 disabled:cursor-not-allowed ${
                            activeGroup.isInviteLinkEnabled !== false ? 'bg-purple-600' : 'bg-neutral-700'
                          }`}
                        >
                          <span
                            className={`block w-4 h-4 rounded-full bg-white shadow-md transition-transform ${
                              activeGroup.isInviteLinkEnabled !== false ? 'translate-x-5' : 'translate-x-0'
                            }`}
                          />
                        </button>
                      </div>

                      {isGroupAdmin && (
                        <div className="pt-2 border-t border-white/5 flex items-center justify-between text-[10.5px]">
                          <span className="text-neutral-400 font-mono">Current Code: <strong className="text-purple-300">{activeGroup.inviteCode || 'GRP-8A9F'}</strong></span>
                          <button
                            type="button"
                            onClick={handleResetGroupInviteCode}
                            className="text-neutral-300 hover:text-rose-300 flex items-center gap-1 font-semibold cursor-pointer transition-colors"
                            title="Revoke current link/code and generate a new one"
                          >
                            <Sparkles className="w-3 h-3 text-rose-400" />
                            <span>Revoke & Reset Link</span>
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Toggle 5: Past History Visibility for New Members */}
                    <div className="bg-white/5 border border-white/5 p-3.5 rounded-2xl flex items-center justify-between">
                      <div className="space-y-0.5 max-w-[80%]">
                        <div className="flex items-center gap-1.5">
                          <p className="text-xs font-bold text-white">Past History for New Members</p>
                          <span className={`text-[9px] font-mono px-1.5 py-0.2 rounded font-bold uppercase ${
                            activeGroup.historyVisibleToNewMembers !== false
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                              : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                          }`}>
                            {activeGroup.historyVisibleToNewMembers !== false ? 'Visible' : 'Restricted'}
                          </span>
                        </div>
                        <p className="text-[10.5px] text-neutral-400 font-sans">
                          {activeGroup.historyVisibleToNewMembers !== false
                            ? 'New members can see full past chat history sent before they joined.'
                            : 'Restricted: New members can only see messages sent AFTER they joined the group.'}
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={!isGroupAdmin}
                        onClick={() => handleToggleGroupPermission('historyVisibleToNewMembers')}
                        className={`w-11 h-6 rounded-full transition-colors p-1 cursor-pointer relative disabled:opacity-40 disabled:cursor-not-allowed ${
                          activeGroup.historyVisibleToNewMembers !== false ? 'bg-purple-600' : 'bg-neutral-700'
                        }`}
                      >
                        <span
                          className={`block w-4 h-4 rounded-full bg-white shadow-md transition-transform ${
                            activeGroup.historyVisibleToNewMembers !== false ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 4: Shared Media Gallery */}
              {activeGroupSettingsTab === 'media' && (
                <div className="space-y-3 overflow-y-auto pr-1 custom-scrollbar flex-1">
                  <div className="flex items-center justify-between text-xs font-semibold text-neutral-300">
                    <span>Shared Photos & Media</span>
                    <span className="text-[10px] text-neutral-500">
                      {conversationMessages.filter(m => m.imageUrl || m.audioUrl).length} items
                    </span>
                  </div>

                  {(() => {
                    const mediaMsgs = conversationMessages.filter(m => m.imageUrl || m.audioUrl);
                    if (mediaMsgs.length === 0) {
                      return (
                        <div className="text-center py-10 space-y-2 bg-white/5 border border-white/5 rounded-2xl">
                          <ImageIcon className="w-8 h-8 text-neutral-600 mx-auto" />
                          <p className="text-xs text-neutral-400 italic">No media shared in this group yet.</p>
                        </div>
                      );
                    }

                    return (
                      <div className="grid grid-cols-3 gap-2">
                        {mediaMsgs.map((msg, idx) => (
                          <div
                            key={`media-thumb-${msg.id || idx}-${idx}`}
                            className="aspect-square bg-black/40 border border-white/10 rounded-xl overflow-hidden relative group cursor-pointer"
                            onClick={() => {
                              if (msg.imageUrl) {
                                const idx = imageMessages.findIndex(m => m.id === msg.id);
                                if (idx !== -1) setActiveLightboxIndex(idx);
                              }
                            }}
                          >
                            {msg.imageUrl ? (
                              <img
                                src={msg.imageUrl}
                                alt="Shared group media"
                                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                              />
                            ) : (
                              <div className="w-full h-full flex flex-col items-center justify-center text-rose-400 bg-rose-500/10 p-2 text-center">
                                <Volume2 className="w-5 h-5 mb-1" />
                                <span className="text-[9px] font-mono">Voice Note</span>
                              </div>
                            )}
                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-1.5">
                              <span className="text-[9px] text-white truncate font-sans">
                                {msg.sender}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Bottom Footer Actions */}
              <div className="flex items-center justify-between pt-3 border-t border-white/10 shrink-0">
                {isGroupCreator ? (
                  <button
                    type="button"
                    onClick={promptDeleteGroup}
                    className="text-xs text-rose-400 hover:text-rose-300 flex items-center gap-1.5 font-semibold cursor-pointer py-1.5 px-3 rounded-xl hover:bg-rose-500/10 transition-colors"
                  >
                    <Trash2 className="w-4 h-4 text-rose-500" />
                    <span>Delete Group</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => promptRemoveMember(currentSender)}
                    className="text-xs text-rose-400 hover:text-rose-300 flex items-center gap-1.5 font-semibold cursor-pointer py-1.5 px-3 rounded-xl hover:bg-rose-500/10 transition-colors"
                  >
                    <Trash2 className="w-4 h-4 text-rose-500" />
                    <span>Leave Group</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setIsGroupSettingsOpen(false)}
                  className="px-4 py-2 bg-white/10 hover:bg-white/20 text-neutral-300 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Confirmation Dialog Modal for Group Actions */}
      <AnimatePresence>
        {confirmGroupAction && confirmGroupAction.isOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-neutral-900 border border-rose-500/30 rounded-3xl p-6 max-w-sm w-full shadow-2xl shadow-rose-950/50 text-white space-y-4 text-center"
            >
              <div className="w-12 h-12 rounded-2xl bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center justify-center mx-auto shadow-lg shadow-rose-500/10">
                <AlertCircle className="w-6 h-6 text-rose-400" />
              </div>

              <div className="space-y-1.5">
                <h3 className="text-base font-bold text-white font-serif tracking-tight">
                  {confirmGroupAction.title}
                </h3>
                <p className="text-xs text-neutral-300 font-sans leading-relaxed">
                  {confirmGroupAction.description}
                </p>
              </div>

              <div className="flex items-center justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setConfirmGroupAction(null)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-neutral-400 hover:text-white bg-white/5 hover:bg-white/10 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmGroupAction}
                  className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-500 active:scale-95 transition-all shadow-lg shadow-rose-600/30 cursor-pointer"
                >
                  {confirmGroupAction.confirmText}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Transfer Adminship Modal */}
      <AnimatePresence>
        {transferAdminModal && transferAdminModal.isOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-neutral-900 border border-purple-500/40 rounded-3xl p-6 max-w-sm w-full shadow-2xl shadow-purple-950/50 text-white space-y-4"
            >
              <div className="w-12 h-12 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center mx-auto shadow-lg shadow-amber-500/10">
                <Crown className="w-6 h-6 text-amber-400" />
              </div>

              <div className="space-y-1.5 text-center">
                <h3 className="text-base font-bold text-white font-serif tracking-tight">
                  Transfer Admin Rights & Exit
                </h3>
                <p className="text-xs text-neutral-300 font-sans leading-relaxed">
                  You are the only admin in <span className="font-semibold text-purple-300">"{transferAdminModal.group.name}"</span>. Choose a member to become the new group admin before you leave:
                </p>
              </div>

              <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar p-1">
                {transferAdminModal.remainingMembers.map((member, idx) => {
                  const isSelected = transferAdminModal.selectedNewAdmin.toLowerCase().trim() === member.toLowerCase().trim();
                  return (
                    <button
                      key={`transfer-admin-${member}-${idx}`}
                      type="button"
                      onClick={() =>
                        setTransferAdminModal(prev =>
                          prev ? { ...prev, selectedNewAdmin: member } : null
                        )
                      }
                      className={`w-full flex items-center justify-between p-3 rounded-2xl border transition-all text-left cursor-pointer ${
                        isSelected
                          ? 'bg-purple-500/20 border-purple-500/50 text-purple-100 shadow-[0_0_12px_rgba(168,85,247,0.2)]'
                          : 'bg-white/5 border-white/5 hover:bg-white/10 text-neutral-300'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-full bg-purple-500/25 border border-purple-500/40 flex items-center justify-center font-bold text-xs text-purple-200 shrink-0 uppercase">
                          {member.substring(0, 2)}
                        </div>
                        <span className="text-xs font-semibold truncate">{member}</span>
                      </div>
                      <div className={`w-5 h-5 rounded-full border flex items-center justify-center transition-colors ${
                        isSelected ? 'border-purple-400 bg-purple-600' : 'border-neutral-600 bg-black/30'
                      }`}>
                        {isSelected && <Check className="w-3 h-3 text-white" />}
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setTransferAdminModal(null)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-neutral-400 hover:text-white bg-white/5 hover:bg-white/10 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!transferAdminModal.selectedNewAdmin}
                  onClick={handleConfirmTransferAndExit}
                  className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-purple-600 hover:bg-purple-500 active:scale-95 transition-all shadow-lg shadow-purple-600/30 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
                >
                  <Crown className="w-3.5 h-3.5 text-amber-300" />
                  <span>Transfer & Exit</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Detailed Read Status & Message Info Modal */}
      <AnimatePresence>
        {messageSeenInfoTarget && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-neutral-900 border border-white/10 rounded-3xl p-6 max-w-sm w-full shadow-2xl shadow-rose-950/40 text-white space-y-4"
            >
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded-xl">
                    <Info className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white font-serif">Message Details</h3>
                    <p className="text-[10px] text-neutral-400 font-mono">
                      {formatDetailedMessageTime(messageSeenInfoTarget.timestamp)}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setMessageSeenInfoTarget(null)}
                  className="p-1.5 text-neutral-400 hover:text-white hover:bg-white/10 rounded-full transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Message Content Preview */}
              <div className="bg-black/40 border border-white/5 rounded-2xl p-3 text-xs text-neutral-200">
                <span className="text-[10px] text-rose-300 font-semibold block mb-1">
                  Sent by {messageSeenInfoTarget.sender}:
                </span>
                <p className="italic">{messageSeenInfoTarget.content}</p>
              </div>

              {/* Read Receipts Breakdown */}
              <div className="space-y-2">
                {(() => {
                  const seenByList = messageSeenInfoTarget.seenBy || [];
                  const seenByTimeMap = messageSeenInfoTarget.seenByTime || {};
                  let filteredList = seenByList.filter(
                    u => u.toLowerCase().trim() !== messageSeenInfoTarget.sender.toLowerCase().trim()
                  );

                  // If private 1-on-1 chat and filteredList is empty, but partner read the message:
                  if (!activeGroup && filteredList.length === 0 && (isMessageRead(messageSeenInfoTarget) || messageSeenInfoTarget.seen)) {
                    if (activePartner && activePartner !== 'global') {
                      filteredList = [activePartner];
                    }
                  }

                  return (
                    <>
                      <div className="flex items-center justify-between text-xs font-semibold text-neutral-300">
                        <span className="flex items-center gap-1.5">
                          <Eye className="w-3.5 h-3.5 text-rose-400" />
                          Read Receipts
                        </span>
                        <span className="text-[10px] font-mono text-rose-300">
                          {filteredList.length} user(s)
                        </span>
                      </div>

                      <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1 custom-scrollbar">
                        {filteredList.length === 0 ? (
                          <div className="p-4 text-center text-xs text-neutral-500 bg-white/5 rounded-2xl border border-white/5">
                            No users have seen this message yet.
                          </div>
                        ) : (
                          filteredList.map((username, idx) => {
                            const seenIso = seenByTimeMap[username];
                            return (
                              <div
                                key={`read-receipt-${username}-${idx}`}
                                className="flex items-center justify-between bg-white/5 border border-white/5 rounded-xl px-3 py-2 text-xs"
                              >
                                <div className="flex items-center gap-2">
                                  <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                                  <span className="font-semibold text-white">{username}</span>
                                </div>
                                <span className="text-[10px] text-rose-300 font-mono">
                                  {seenIso ? formatMessageTime(seenIso) : 'Read'}
                                </span>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </>
                  );
                })()}
              </div>

              <button
                type="button"
                onClick={() => setMessageSeenInfoTarget(null)}
                className="w-full py-2.5 bg-white/10 hover:bg-white/20 text-neutral-200 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
              >
                Close
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
};

export default RomanticChat;
