import React, { useState, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import JSZip from 'jszip';
import { 
  Images, Sparkles, Filter, Search, Calendar, User, Gift, 
  ImageIcon, MessageSquareHeart, ChevronLeft, ChevronRight, X, 
  Download, ExternalLink, RefreshCw, ZoomIn, Heart, Layers,
  Plus, Trash2, Upload, AlertTriangle, CheckSquare, Square,
  FolderDown, FileArchive, Check, Loader2, Folder, FolderPlus,
  Crown, Edit3, MoreVertical, ArrowLeft, BookOpen, CheckCircle2
} from 'lucide-react';
import { Milestone, Memory, ChatMessage, MilestoneCategory, CoupleTenant, GalleryAlbum } from '../types';
import { formatMilestoneDateInEgypt, storage } from '../utils';
import { HorizontalScrollWrapper } from './HorizontalScrollWrapper';

export interface GalleryItem {
  id: string;
  rawId: string;
  url: string;
  source: 'milestones' | 'scrapbook' | 'chat';
  sourceName: string;
  title: string;
  description?: string;
  date: string; // ISO or YYYY-MM-DD
  createdBy?: string;
  targetTab: string;
}

interface GalleryProps {
  milestones: Milestone[];
  memories: Memory[];
  chatMessages: ChatMessage[];
  onNavigateTab: (tabId: string) => void;
  onAddMemory?: (memory: Memory) => void;
  onDeleteMemory?: (id: string) => void;
  onUpdateMilestone?: (milestone: Milestone) => void;
  onDeleteChatMessage?: (id: string) => void;
  currentUser?: string;
  coupleTenant?: CoupleTenant;
}

const SOURCE_COLORS = {
  milestones: {
    bg: 'bg-pink-500/15',
    border: 'border-pink-500/30',
    text: 'text-pink-300',
    badge: 'bg-gradient-to-r from-pink-500 to-rose-600 text-white',
    icon: Gift
  },
  scrapbook: {
    bg: 'bg-amber-500/15',
    border: 'border-amber-500/30',
    text: 'text-amber-300',
    badge: 'bg-gradient-to-r from-amber-500 to-orange-600 text-white',
    icon: ImageIcon
  },
  chat: {
    bg: 'bg-rose-500/15',
    border: 'border-rose-500/30',
    text: 'text-rose-300',
    badge: 'bg-gradient-to-r from-rose-600 to-purple-600 text-white',
    icon: MessageSquareHeart
  }
};

export const Gallery: React.FC<GalleryProps> = ({
  milestones,
  memories,
  chatMessages,
  onNavigateTab,
  onAddMemory,
  onDeleteMemory,
  onUpdateMilestone,
  onDeleteChatMessage,
  currentUser = 'Me',
  coupleTenant
}) => {
  // View mode switcher: 'all' (All Gallery) or 'albums' (By Albums)
  const [viewMode, setViewMode] = useState<'all' | 'albums'>('all');
  const [selectedAlbumId, setSelectedAlbumId] = useState<string | null>(null);

  // Albums State isolated by coupleId
  const [albums, setAlbums] = useState<GalleryAlbum[]>(() => {
    return storage.getGalleryAlbums(coupleTenant?.coupleId);
  });

  // Re-sync albums when couple tenant changes
  useEffect(() => {
    setAlbums(storage.getGalleryAlbums(coupleTenant?.coupleId));
  }, [coupleTenant?.coupleId]);

  // Create Album Modal State
  const [isCreateAlbumModalOpen, setIsCreateAlbumModalOpen] = useState(false);
  const [newAlbumName, setNewAlbumName] = useState('');
  const [newAlbumDesc, setNewAlbumDesc] = useState('');
  const [newAlbumSelectedPhotoIds, setNewAlbumSelectedPhotoIds] = useState<Set<string>>(new Set());
  const [createAlbumSearch, setCreateAlbumSearch] = useState('');

  // Edit Album Modal State (Name & Description & Cover)
  const [editingAlbum, setEditingAlbum] = useState<GalleryAlbum | null>(null);
  const [editAlbumName, setEditAlbumName] = useState('');
  const [editAlbumDesc, setEditAlbumDesc] = useState('');
  const [editAlbumCoverUrl, setEditAlbumCoverUrl] = useState('');

  // Manage Photos in Album Modal State
  const [managingPhotosAlbum, setManagingPhotosAlbum] = useState<GalleryAlbum | null>(null);
  const [managePhotoSelection, setManagePhotoSelection] = useState<Set<string>>(new Set());
  const [managePhotoSearch, setManagePhotoSearch] = useState('');

  // Delete Album Modal State
  const [deletingAlbum, setDeletingAlbum] = useState<GalleryAlbum | null>(null);

  // Quick Add Photo to Album Modal State
  const [quickAddPhotoItem, setQuickAddPhotoItem] = useState<GalleryItem | null>(null);

  const [activeFilter, setActiveFilter] = useState<'all' | 'milestones' | 'scrapbook' | 'chat'>('all');
  const [selectedUploader, setSelectedUploader] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'title'>('newest');
  
  // Lightbox State
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [isZoomed, setIsZoomed] = useState<boolean>(false);

  // Add Photo Modal State (Supports Multi-File Upload)
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [formTitle, setFormTitle] = useState('');
  const [formCategory, setFormCategory] = useState<MilestoneCategory>('anniversary');
  const [formDate, setFormDate] = useState(new Date().toISOString().split('T')[0]);
  const [formDesc, setFormDesc] = useState('');
  const [formMediaBase64, setFormMediaBase64] = useState<string>('');
  const [pendingUploads, setPendingUploads] = useState<Array<{ id: string; url: string; name: string }>>([]);
  const [processingStatusText, setProcessingStatusText] = useState<string>('');
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Delete Confirmation Modal State
  const [deletingItem, setDeletingItem] = useState<GalleryItem | null>(null);

  // Selection & Zip Download State
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState<boolean>(false);
  const [isZipping, setIsZipping] = useState<boolean>(false);
  const [zipProgress, setZipProgress] = useState<string>('');

  // Aggregate all gallery items across sections
  const allItems = useMemo<GalleryItem[]>(() => {
    const items: GalleryItem[] = [];

    // 1. Collect from Milestones
    if (Array.isArray(milestones)) {
      milestones.forEach((m) => {
        if (!m.archived && Array.isArray(m.photos)) {
          m.photos.forEach((photoUrl, idx) => {
            if (photoUrl && photoUrl.trim().length > 0) {
              items.push({
                id: `milestone-${m.id}-${idx}`,
                rawId: m.id,
                url: photoUrl,
                source: 'milestones',
                sourceName: 'Milestones',
                title: m.title || 'Milestone Memory',
                description: m.description || m.sweetMessage,
                date: m.date || new Date().toISOString(),
                createdBy: m.createdBy,
                targetTab: 'milestones'
              });
            }
          });
        }
      });
    }

    // 2. Collect from Scrapbook (Memories)
    if (Array.isArray(memories)) {
      memories.forEach((mem) => {
        if (mem.url && mem.url.trim().length > 0 && (mem.type === 'image' || !mem.type || mem.url.startsWith('data:image') || mem.url.match(/\.(jpeg|jpg|gif|png|webp)/i))) {
          items.push({
            id: `scrapbook-${mem.id}`,
            rawId: mem.id,
            url: mem.url,
            source: 'scrapbook',
            sourceName: 'Scrapbook',
            title: mem.title || 'Scrapbook Photo',
            description: mem.description,
            date: mem.date || new Date().toISOString(),
            createdBy: mem.createdBy,
            targetTab: 'album'
          });
        }
      });
    }

    // 3. Collect from Chat Messages
    if (Array.isArray(chatMessages)) {
      chatMessages.forEach((msg) => {
        if (msg.imageUrl && msg.imageUrl.trim().length > 0) {
          items.push({
            id: `chat-${msg.id}`,
            rawId: msg.id,
            url: msg.imageUrl,
            source: 'chat',
            sourceName: 'Sweet Chat',
            title: msg.content ? msg.content : 'Chat Image Attachment',
            description: `Sent in chat by ${msg.sender}`,
            date: msg.timestamp || new Date().toISOString(),
            createdBy: msg.sender,
            targetTab: 'chat'
          });
        }
      });
    }

    // 4. Collect from Celebration Cards (guarantees cards photos are always visible in Gallery)
    try {
      const cards = storage.getCelebrationCards(coupleTenant?.coupleId);
      if (Array.isArray(cards)) {
        cards.forEach((card) => {
          if (Array.isArray(card.photos)) {
            card.photos.forEach((photo, idx) => {
              if (photo.src && photo.src.trim().length > 0) {
                items.push({
                  id: `card-${card.id}-${photo.id || idx}`,
                  rawId: card.id,
                  url: photo.src,
                  source: 'scrapbook',
                  sourceName: `${card.title || 'Celebration'} Card`,
                  title: photo.caption || card.title || 'Celebration Photo',
                  description: `Photo attached to celebration card "${card.title}"`,
                  date: card.targetDate || card.createdAt || new Date().toISOString(),
                  createdBy: card.createdBy,
                  targetTab: 'choose'
                });
              }
            });
          }
        });
      }
    } catch (e) {
      console.warn("Could not load celebration cards into gallery:", e);
    }

    const seen = new Set<string>();
    return items.filter(item => {
      if (!item || !item.id || seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
  }, [milestones, memories, chatMessages, coupleTenant?.coupleId]);

  // Distinct uploaders list
  const uploaders = useMemo(() => {
    const set = new Set<string>();
    allItems.forEach(item => {
      if (item.createdBy && item.createdBy.trim()) {
        set.add(item.createdBy.trim());
      }
    });
    return Array.from(set);
  }, [allItems]);

  // Filtered and sorted items
  const filteredItems = useMemo(() => {
    return allItems
      .filter((item) => {
        // Section Filter
        if (activeFilter !== 'all' && item.source !== activeFilter) {
          return false;
        }
        // Uploader Filter
        if (selectedUploader !== 'all') {
          if (!item.createdBy || item.createdBy.toLowerCase().trim() !== selectedUploader.toLowerCase().trim()) {
            return false;
          }
        }
        // Search Query
        if (searchQuery.trim().length > 0) {
          const q = searchQuery.toLowerCase().trim();
          const titleMatch = item.title.toLowerCase().includes(q);
          const descMatch = (item.description || '').toLowerCase().includes(q);
          const sourceMatch = item.sourceName.toLowerCase().includes(q);
          const uploaderMatch = (item.createdBy || '').toLowerCase().includes(q);
          if (!titleMatch && !descMatch && !sourceMatch && !uploaderMatch) {
            return false;
          }
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'title') {
          return a.title.localeCompare(b.title);
        }
        const timeA = new Date(a.date).getTime() || 0;
        const timeB = new Date(b.date).getTime() || 0;
        if (sortBy === 'oldest') {
          return timeA - timeB;
        }
        return timeB - timeA; // newest
      });
  }, [allItems, activeFilter, selectedUploader, searchQuery, sortBy]);

  // Counts breakdown
  const counts = useMemo(() => {
    return {
      all: allItems.length,
      milestones: allItems.filter(i => i.source === 'milestones').length,
      scrapbook: allItems.filter(i => i.source === 'scrapbook').length,
      chat: allItems.filter(i => i.source === 'chat').length
    };
  }, [allItems]);

  // Selected item for Lightbox
  const activeLightboxItem = selectedIndex !== null ? filteredItems[selectedIndex] : null;

  // Keyboard navigation for Lightbox
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (selectedIndex === null) return;
      if (e.key === 'Escape') {
        setSelectedIndex(null);
        setIsZoomed(false);
      } else if (e.key === 'ArrowRight') {
        setSelectedIndex((prev) => (prev !== null && prev < filteredItems.length - 1 ? prev + 1 : 0));
        setIsZoomed(false);
      } else if (e.key === 'ArrowLeft') {
        setSelectedIndex((prev) => (prev !== null && prev > 0 ? prev - 1 : filteredItems.length - 1));
        setIsZoomed(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedIndex, filteredItems.length]);

  const handleDownload = (url: string, filename: string) => {
    try {
      const a = document.createElement('a');
      a.href = url;
      a.download = filename || 'romantic-memory.jpg';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (e) {
      console.warn("Download failed:", e);
      window.open(url, '_blank');
    }
  };

  const formatDateDisplay = (dateStr: string) => {
    try {
      if (!dateStr) return '';
      if (dateStr.includes('T')) {
        const d = new Date(dateStr);
        return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
      }
      return formatMilestoneDateInEgypt(dateStr);
    } catch (e) {
      return dateStr;
    }
  };

  // Single image compression helper with mobile HEIC & fallback support
  const compressSingleImage = (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const isImage = (file.type && file.type.startsWith('image/')) || 
                      /\.(jpe?g|png|webp|gif|heic|heif|bmp|svg)$/i.test(file.name) ||
                      file.size > 0;
      if (!isImage) {
        resolve('');
        return;
      }

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
              const compressed = canvas.toDataURL('image/jpeg', 0.82);
              resolve(compressed);
              return;
            }
          } catch (canvasErr) {
            console.warn("Canvas compression failed, falling back to direct image data:", canvasErr);
          }
          resolve(rawResult);
        };
        img.onerror = () => resolve(rawResult);
        img.src = rawResult;
      };
      reader.onerror = () => resolve('');
      reader.readAsDataURL(file);
    });
  };

  // Multi-file processing helper
  const processFiles = async (files: File[]) => {
    if (!files || files.length === 0) return;

    setIsProcessingFile(true);
    const newItems: Array<{ id: string; url: string; name: string }> = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setProcessingStatusText(files.length > 1 ? `Optimizing photo ${i + 1} of ${files.length}...` : 'Optimizing photo...');
      const compressed = await compressSingleImage(file);
      if (compressed) {
        newItems.push({
          id: `pending-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          url: compressed,
          name: file.name.replace(/\.[^/.]+$/, '').trim() || `Photo ${pendingUploads.length + newItems.length + 1}`
        });
      }
    }

    if (newItems.length > 0) {
      setPendingUploads((prev) => [...prev, ...newItems]);
      // Set default title from first photo if not set
      if (!formTitle.trim()) {
        setFormTitle(newItems[0].name || 'Our Sweet Moment');
      }
      setFormMediaBase64(newItems[0].url);
    }

    setIsProcessingFile(false);
    setProcessingStatusText('');
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFiles(Array.from(e.target.files));
      e.target.value = '';
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(Array.from(e.dataTransfer.files));
    }
  };

  // Handle Add Photo Form submission for multiple photos
  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pendingUploads.length === 0 || !formTitle.trim()) return;

    pendingUploads.forEach((photo, idx) => {
      const itemTitle = pendingUploads.length === 1 
        ? formTitle.trim() 
        : `${formTitle.trim()} (${idx + 1})`;

      const newMemory: Memory = {
        id: `mem_${Date.now()}_${Math.random().toString(36).substring(2, 7)}_${idx}`,
        title: itemTitle,
        category: formCategory,
        date: formDate || new Date().toISOString().split('T')[0],
        description: formDesc.trim() || `Photo added to couple gallery`,
        url: photo.url,
        type: 'image',
        createdBy: currentUser
      };

      if (onAddMemory) {
        onAddMemory(newMemory);
      } else {
        const currentMems = storage.getMemories();
        storage.saveMemories([newMemory, ...currentMems]);
      }
    });

    // Reset form
    setFormTitle('');
    setFormDesc('');
    setPendingUploads([]);
    setFormMediaBase64('');
    setFormDate(new Date().toISOString().split('T')[0]);
    setIsAddModalOpen(false);
  };

  // Confirm and Execute Deletion
  const confirmDelete = () => {
    if (!deletingItem) return;

    if (deletingItem.source === 'scrapbook') {
      onDeleteMemory?.(deletingItem.rawId);
    } else if (deletingItem.source === 'milestones') {
      const targetMilestone = milestones.find(m => m.id === deletingItem.rawId);
      if (targetMilestone) {
        const updatedPhotos = (targetMilestone.photos || []).filter(url => url !== deletingItem.url);
        onUpdateMilestone?.({ ...targetMilestone, photos: updatedPhotos });
      }
    } else if (deletingItem.source === 'chat') {
      onDeleteChatMessage?.(deletingItem.rawId);
    }

    setDeletingItem(null);
    if (selectedIndex !== null) {
      setSelectedIndex(null);
      setIsZoomed(false);
    }
  };

  // Toggle item selection
  const toggleSelectItem = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Toggle select all visible items
  const handleSelectAll = () => {
    const visibleIds = filteredItems.map((item) => item.id);
    const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(visibleIds));
    }
  };

  // ZIP download engine
  const handleDownloadZip = async (targetItems?: GalleryItem[], customFilename?: string) => {
    const itemsToZip = targetItems || (selectedIds.size > 0 ? filteredItems.filter(i => selectedIds.has(i.id)) : filteredItems);
    if (!itemsToZip || itemsToZip.length === 0) return;

    setIsZipping(true);
    setZipProgress(`Preparing ${itemsToZip.length} photo${itemsToZip.length > 1 ? 's' : ''}...`);

    try {
      const zip = new JSZip();
      const folder = zip.folder('gallery_photos');

      for (let i = 0; i < itemsToZip.length; i++) {
        const item = itemsToZip[i];
        setZipProgress(`Compressing (${i + 1}/${itemsToZip.length}): ${item.title || 'Photo'}...`);

        const rawTitle = item.title || `photo_${i + 1}`;
        const safeTitle = rawTitle.replace(/[^a-zA-Z0-9_\- ]/g, '_').trim().substring(0, 35) || `photo_${i + 1}`;
        let fileExt = 'jpg';

        if (item.url.startsWith('data:image/')) {
          const match = item.url.match(/^data:image\/([a-zA-Z0-9]+);base64,/);
          if (match) {
            fileExt = match[1] === 'jpeg' ? 'jpg' : match[1];
          }
          const base64Content = item.url.split(',')[1];
          folder?.file(`${i + 1}_${safeTitle}.${fileExt}`, base64Content, { base64: true });
        } else {
          try {
            const res = await fetch(item.url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const blob = await res.blob();
            if (blob.type) {
              const extMatch = blob.type.match(/image\/([a-zA-Z0-9]+)/);
              if (extMatch) {
                fileExt = extMatch[1] === 'jpeg' ? 'jpg' : extMatch[1];
              }
            } else {
              const urlExt = item.url.split('.').pop()?.split('?')[0];
              if (urlExt && urlExt.length <= 4) fileExt = urlExt;
            }
            folder?.file(`${i + 1}_${safeTitle}.${fileExt}`, blob);
          } catch (e) {
            console.warn(`Fetch image failed for ${item.url}`, e);
          }
        }
      }

      setZipProgress('Finalizing .ZIP package...');
      const content = await zip.generateAsync({ type: 'blob' });
      
      const downloadName = customFilename || (selectedIds.size > 0 ? `selected_gallery_photos_${itemsToZip.length}.zip` : `all_gallery_photos_${itemsToZip.length}.zip`);
      
      const a = document.createElement('a');
      a.href = URL.createObjectURL(content);
      a.download = downloadName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
    } catch (err) {
      console.error('Failed to create ZIP package:', err);
      alert('Failed to generate ZIP archive. Please try again.');
    } finally {
      setIsZipping(false);
      setZipProgress('');
    }
  };

  // Helper to resolve photos belonging to an album
  const getAlbumPhotos = (album: GalleryAlbum): GalleryItem[] => {
    if (album.isDefault || album.id === 'default-total-photos') {
      return allItems;
    }
    const idSet = new Set(album.photoIds || []);
    return allItems.filter(item => idSet.has(item.id) || idSet.has(item.url) || idSet.has(item.rawId));
  };

  const activeAlbum = useMemo(() => {
    if (!selectedAlbumId) return null;
    return albums.find(a => a.id === selectedAlbumId) || null;
  }, [albums, selectedAlbumId]);

  const activeAlbumPhotos = useMemo(() => {
    if (!activeAlbum) return [];
    return getAlbumPhotos(activeAlbum);
  }, [activeAlbum, allItems]);

  const handleCreateAlbum = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAlbumName.trim()) return;

    const newAlbum: GalleryAlbum = {
      id: `album_${Date.now()}`,
      coupleId: coupleTenant?.coupleId,
      name: newAlbumName.trim(),
      description: newAlbumDesc.trim() || undefined,
      photoIds: Array.from(newAlbumSelectedPhotoIds),
      createdBy: currentUser,
      createdAt: new Date().toISOString()
    };

    const updated = [...albums, newAlbum];
    setAlbums(updated);
    storage.saveGalleryAlbums(updated);

    setNewAlbumName('');
    setNewAlbumDesc('');
    setNewAlbumSelectedPhotoIds(new Set());
    setCreateAlbumSearch('');
    setIsCreateAlbumModalOpen(false);
    setSelectedAlbumId(newAlbum.id);
  };

  const openEditAlbumModal = (album: GalleryAlbum, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setEditingAlbum(album);
    setEditAlbumName(album.name);
    setEditAlbumDesc(album.description || '');
    setEditAlbumCoverUrl(album.coverUrl || '');
  };

  const handleSaveEditAlbum = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAlbum || !editAlbumName.trim()) return;

    const updated = albums.map(a => {
      if (a.id === editingAlbum.id) {
        return {
          ...a,
          name: a.isDefault ? 'Total Photos' : editAlbumName.trim(),
          description: editAlbumDesc.trim() || undefined,
          coverUrl: editAlbumCoverUrl.trim() || undefined,
          updatedAt: new Date().toISOString()
        };
      }
      return a;
    });

    setAlbums(updated);
    storage.saveGalleryAlbums(updated);
    setEditingAlbum(null);
  };

  const openManagePhotosModal = (album: GalleryAlbum, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setManagingPhotosAlbum(album);
    setManagePhotoSelection(new Set(album.photoIds || []));
    setManagePhotoSearch('');
  };

  const handleSaveManagePhotos = () => {
    if (!managingPhotosAlbum) return;

    const updated = albums.map(a => {
      if (a.id === managingPhotosAlbum.id) {
        return {
          ...a,
          photoIds: Array.from(managePhotoSelection),
          updatedAt: new Date().toISOString()
        };
      }
      return a;
    });

    setAlbums(updated);
    storage.saveGalleryAlbums(updated);
    setManagingPhotosAlbum(null);
  };

  const openDeleteAlbumModal = (album: GalleryAlbum, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (album.isDefault) return;
    setDeletingAlbum(album);
  };

  const confirmDeleteAlbum = () => {
    if (!deletingAlbum || deletingAlbum.isDefault) return;

    const updated = albums.filter(a => a.id !== deletingAlbum.id);
    setAlbums(updated);
    storage.saveGalleryAlbums(updated);

    if (selectedAlbumId === deletingAlbum.id) {
      setSelectedAlbumId(null);
    }
    setDeletingAlbum(null);
  };

  const handleRemovePhotoFromAlbum = (albumId: string, photoId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const targetAlbum = albums.find(a => a.id === albumId);
    if (!targetAlbum || targetAlbum.isDefault) return;

    const updatedPhotoIds = (targetAlbum.photoIds || []).filter(id => id !== photoId);
    const updated = albums.map(a => a.id === albumId ? { ...a, photoIds: updatedPhotoIds, updatedAt: new Date().toISOString() } : a);
    setAlbums(updated);
    storage.saveGalleryAlbums(updated);
  };

  const handleTogglePhotoInAlbum = (albumId: string, photoId: string) => {
    const targetAlbum = albums.find(a => a.id === albumId);
    if (!targetAlbum || targetAlbum.isDefault) return;

    const currentIds = new Set(targetAlbum.photoIds || []);
    if (currentIds.has(photoId)) {
      currentIds.delete(photoId);
    } else {
      currentIds.add(photoId);
    }

    const updated = albums.map(a => a.id === albumId ? { ...a, photoIds: Array.from(currentIds), updatedAt: new Date().toISOString() } : a);
    setAlbums(updated);
    storage.saveGalleryAlbums(updated);
  };

  const renderAlbumPreview = (album: GalleryAlbum, photos: GalleryItem[]) => {
    if (album.coverUrl) {
      return (
        <img
          src={album.coverUrl}
          alt={album.name}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          onError={(e) => {
            (e.target as HTMLElement).setAttribute('src', 'https://images.unsplash.com/photo-1518199266791-5375a83190b7?auto=format&fit=crop&w=600&q=80');
          }}
        />
      );
    }
    if (photos.length === 0) {
      return (
        <div className="w-full h-full flex flex-col items-center justify-center bg-white/5 text-neutral-500 gap-2 p-4 text-center">
          <Folder className="w-10 h-10 text-neutral-600 stroke-[1.5]" />
          <span className="text-[11px] font-medium text-neutral-400">Empty Album</span>
          <span className="text-[10px] text-neutral-500">Click to add photos</span>
        </div>
      );
    }
    if (photos.length === 1) {
      return (
        <img
          src={photos[0].url}
          alt={album.name}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
        />
      );
    }
    const collage = photos.slice(0, 4);
    return (
      <div className="grid grid-cols-2 grid-rows-2 w-full h-full gap-0.5 bg-neutral-950">
        {collage.map((p, idx) => (
          <div key={`collage-${album.id}-${p.id || idx}-${idx}`} className="relative w-full h-full overflow-hidden bg-neutral-900">
            <img
              src={p.url}
              alt=""
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            />
          </div>
        ))}
        {collage.length === 2 && (
          <>
            <div className="bg-white/5 flex items-center justify-center"><Heart className="w-4 h-4 text-rose-500/40" /></div>
            <div className="bg-white/5 flex items-center justify-center"><Sparkles className="w-4 h-4 text-amber-500/40" /></div>
          </>
        )}
        {collage.length === 3 && (
          <div className="bg-white/5 flex items-center justify-center">
            <span className="text-[10px] text-rose-300 font-bold">+{photos.length - 3}</span>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* HEADER BANNER */}
      <div className="bg-gradient-to-br from-rose-950/60 via-neutral-900 to-purple-950/50 rounded-3xl p-6 sm:p-8 border border-white/10 shadow-2xl shadow-rose-950/20 relative overflow-hidden text-white space-y-6">
        <div className="absolute top-0 right-0 w-80 h-80 bg-rose-500/10 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none" />
        <div className="absolute bottom-0 left-1/3 w-64 h-64 bg-purple-500/10 rounded-full blur-3xl -mb-16 pointer-events-none" />
        
        {/* Top Row: Title Info & Primary Actions Toolbar */}
        <div className="relative z-10 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
          <div className="space-y-2.5 max-w-2xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs uppercase font-bold tracking-widest bg-rose-500/20 text-rose-300 border border-rose-500/30 px-3 py-1 rounded-full inline-flex items-center gap-1.5 backdrop-blur-md shadow-sm">
                <Images className="w-3.5 h-3.5 text-rose-400" />
                Unified Media Gallery
              </span>
              <span className="text-[11px] font-medium text-neutral-400 bg-white/5 border border-white/10 px-2.5 py-0.5 rounded-full">
                {counts.all} items total
              </span>
              <span className="text-[11px] font-medium text-rose-300 bg-rose-500/10 border border-rose-500/20 px-2.5 py-0.5 rounded-full inline-flex items-center gap-1">
                <Layers className="w-3 h-3" />
                {albums.length} albums
              </span>
            </div>

            <h1 className="font-serif text-3xl sm:text-4xl font-semibold tracking-tight text-white leading-tight">
              Our Shared Photo & Image Vault
            </h1>
            <p className="text-xs sm:text-sm text-neutral-300 font-light leading-relaxed">
              Every snapshot, photo attachment, and memory shared between you and your partner across{' '}
              <span className="text-pink-300 font-medium hover:underline cursor-pointer" onClick={() => { setViewMode('all'); setActiveFilter('milestones'); }}>
                Milestones
              </span>,{' '}
              <span className="text-amber-300 font-medium hover:underline cursor-pointer" onClick={() => { setViewMode('all'); setActiveFilter('scrapbook'); }}>
                Scrapbook
              </span>, and{' '}
              <span className="text-purple-300 font-medium hover:underline cursor-pointer font-sans" onClick={() => { setViewMode('all'); setActiveFilter('chat'); }}>
                Sweet Chat
              </span> — gathered in one place or organized by albums.
            </p>
          </div>

          {/* Action Buttons Toolbar */}
          <div className="flex flex-wrap sm:flex-nowrap items-center gap-2.5 w-full lg:w-auto shrink-0 relative z-10">
            {/* Create Album Button */}
            <button
              onClick={() => {
                setNewAlbumName('');
                setNewAlbumDesc('');
                setNewAlbumSelectedPhotoIds(new Set());
                setCreateAlbumSearch('');
                setIsCreateAlbumModalOpen(true);
              }}
              className="flex-1 sm:flex-initial bg-white/10 hover:bg-white/20 text-white px-4 py-2.5 rounded-xl text-xs font-bold inline-flex items-center justify-center gap-2 transition-all cursor-pointer border border-white/15 backdrop-blur-md active:scale-95 shadow-md"
              title="Create a new photo album collection"
            >
              <FolderPlus className="w-4 h-4 text-rose-400 stroke-[2.5]" />
              <span>Create Album</span>
            </button>

            {/* Add Photo Button */}
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="flex-1 sm:flex-initial bg-gradient-to-r from-rose-600 via-pink-600 to-rose-600 hover:from-rose-500 hover:to-pink-500 text-white px-4 py-2.5 rounded-xl text-xs font-bold inline-flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg shadow-rose-950/50 border border-rose-400/30 active:scale-95"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>Add Photo</span>
            </button>

            {/* Download All ZIP Button */}
            <button
              onClick={() => handleDownloadZip(filteredItems, 'all_gallery_photos.zip')}
              disabled={isZipping || filteredItems.length === 0}
              className="flex-1 sm:flex-initial bg-gradient-to-r from-amber-600/30 to-orange-600/30 hover:from-amber-600/50 hover:to-orange-600/50 text-amber-200 px-4 py-2.5 rounded-xl text-xs font-bold inline-flex items-center justify-center gap-2 transition-all cursor-pointer border border-amber-400/30 backdrop-blur-md active:scale-95 disabled:opacity-40"
              title="Download all currently visible photos in a ZIP package"
            >
              <FolderDown className="w-4 h-4 text-amber-300" />
              <span>Download All .ZIP ({filteredItems.length})</span>
            </button>

            {/* Batch Select Mode Toggle */}
            <button
              onClick={() => {
                setIsSelectionMode(!isSelectionMode);
                if (isSelectionMode) setSelectedIds(new Set());
              }}
              className={`flex-1 sm:flex-initial px-4 py-2.5 rounded-xl text-xs font-bold inline-flex items-center justify-center gap-2 transition-all cursor-pointer border backdrop-blur-md active:scale-95 ${
                isSelectionMode
                  ? 'bg-rose-500 text-white border-rose-400 shadow-lg shadow-rose-950/40 ring-2 ring-rose-400/30'
                  : 'bg-white/10 hover:bg-white/20 text-white border-white/15'
              }`}
            >
              <CheckSquare className="w-4 h-4" />
              <span>{isSelectionMode ? 'Exit Select' : 'Select Photos'}</span>
            </button>
          </div>
        </div>

        {/* Bottom Row: Interactive Source Count Cards */}
        <div className="relative z-10 pt-4 border-t border-white/10">
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-400 flex items-center gap-1.5">
              <Sparkles className="w-3 h-3 text-rose-400" />
              Vault Sources (Click to filter in All Gallery)
            </span>
            {activeFilter !== 'all' && (
              <button
                onClick={() => {
                  setViewMode('all');
                  setActiveFilter('all');
                }}
                className="text-[10px] text-rose-300 hover:text-white underline transition-colors cursor-pointer"
              >
                Reset filter (Show All)
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {/* Total Photos Card */}
            <button
              type="button"
              onClick={() => {
                setViewMode('all');
                setActiveFilter('all');
              }}
              className={`p-3.5 rounded-2xl transition-all cursor-pointer text-left border relative overflow-hidden group ${
                viewMode === 'all' && activeFilter === 'all'
                  ? 'bg-gradient-to-br from-white/20 to-white/10 border-white/40 ring-2 ring-white/30 shadow-lg shadow-black/40'
                  : 'bg-white/5 hover:bg-white/10 border-white/10 opacity-80 hover:opacity-100'
              }`}
            >
              <div className="flex items-center justify-between gap-1 mb-1.5">
                <span className="text-[10px] uppercase font-bold text-neutral-300 tracking-wider flex items-center gap-1">
                  <Images className="w-3.5 h-3.5 text-neutral-300" />
                  Total Vault
                </span>
                {viewMode === 'all' && activeFilter === 'all' && (
                  <span className="w-2 h-2 rounded-full bg-white shadow-sm shadow-white" />
                )}
              </div>
              <div className="flex items-baseline justify-between">
                <span className="font-serif text-2xl font-bold text-white group-hover:scale-105 transition-transform">
                  {counts.all}
                </span>
                <span className="text-[10px] text-neutral-400 font-medium">All photos</span>
              </div>
            </button>

            {/* Milestones Card */}
            <button
              type="button"
              onClick={() => {
                setViewMode('all');
                setActiveFilter('milestones');
              }}
              className={`p-3.5 rounded-2xl transition-all cursor-pointer text-left border relative overflow-hidden group ${
                viewMode === 'all' && activeFilter === 'milestones'
                  ? 'bg-gradient-to-br from-pink-900/70 to-rose-950/70 border-pink-400/60 ring-2 ring-pink-400/40 shadow-lg shadow-pink-950/50'
                  : 'bg-pink-950/25 hover:bg-pink-950/40 border-pink-500/20 opacity-80 hover:opacity-100'
              }`}
            >
              <div className="flex items-center justify-between gap-1 mb-1.5">
                <span className="text-[10px] uppercase font-bold text-pink-300 tracking-wider flex items-center gap-1">
                  <Gift className="w-3.5 h-3.5 text-pink-400" />
                  Milestones
                </span>
                {viewMode === 'all' && activeFilter === 'milestones' && (
                  <span className="w-2 h-2 rounded-full bg-pink-400 shadow-sm shadow-pink-400" />
                )}
              </div>
              <div className="flex items-baseline justify-between">
                <span className="font-serif text-2xl font-bold text-pink-100 group-hover:scale-105 transition-transform">
                  {counts.milestones}
                </span>
                <span className="text-[10px] text-pink-300/80 font-medium">Trips & Dates</span>
              </div>
            </button>

            {/* Scrapbook Card */}
            <button
              type="button"
              onClick={() => {
                setViewMode('all');
                setActiveFilter('scrapbook');
              }}
              className={`p-3.5 rounded-2xl transition-all cursor-pointer text-left border relative overflow-hidden group ${
                viewMode === 'all' && activeFilter === 'scrapbook'
                  ? 'bg-gradient-to-br from-amber-900/70 to-orange-950/70 border-amber-400/60 ring-2 ring-amber-400/40 shadow-lg shadow-amber-950/50'
                  : 'bg-amber-950/25 hover:bg-amber-950/40 border-amber-500/20 opacity-80 hover:opacity-100'
              }`}
            >
              <div className="flex items-center justify-between gap-1 mb-1.5">
                <span className="text-[10px] uppercase font-bold text-amber-300 tracking-wider flex items-center gap-1">
                  <ImageIcon className="w-3.5 h-3.5 text-amber-400" />
                  Scrapbook
                </span>
                {viewMode === 'all' && activeFilter === 'scrapbook' && (
                  <span className="w-2 h-2 rounded-full bg-amber-400 shadow-sm shadow-amber-400" />
                )}
              </div>
              <div className="flex items-baseline justify-between">
                <span className="font-serif text-2xl font-bold text-amber-100 group-hover:scale-105 transition-transform">
                  {counts.scrapbook}
                </span>
                <span className="text-[10px] text-amber-300/80 font-medium">Keepsakes</span>
              </div>
            </button>

            {/* Chat Attachments Card */}
            <button
              type="button"
              onClick={() => {
                setViewMode('all');
                setActiveFilter('chat');
              }}
              className={`p-3.5 rounded-2xl transition-all cursor-pointer text-left border relative overflow-hidden group ${
                viewMode === 'all' && activeFilter === 'chat'
                  ? 'bg-gradient-to-br from-purple-900/70 to-indigo-950/70 border-purple-400/60 ring-2 ring-purple-400/40 shadow-lg shadow-purple-950/50'
                  : 'bg-purple-950/25 hover:bg-purple-950/40 border-purple-500/20 opacity-80 hover:opacity-100'
              }`}
            >
              <div className="flex items-center justify-between gap-1 mb-1.5">
                <span className="text-[10px] uppercase font-bold text-purple-300 tracking-wider flex items-center gap-1">
                  <MessageSquareHeart className="w-3.5 h-3.5 text-purple-400" />
                  Sweet Chat
                </span>
                {viewMode === 'all' && activeFilter === 'chat' && (
                  <span className="w-2 h-2 rounded-full bg-purple-400 shadow-sm shadow-purple-400" />
                )}
              </div>
              <div className="flex items-baseline justify-between">
                <span className="font-serif text-2xl font-bold text-purple-100 group-hover:scale-105 transition-transform">
                  {counts.chat}
                </span>
                <span className="text-[10px] text-purple-300/80 font-medium">Attachments</span>
              </div>
            </button>
          </div>
        </div>
      </div>

      {/* VIEW MODE SWITCHER: ALL GALLERY vs BY ALBUMS */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-neutral-900/90 backdrop-blur-xl p-3 sm:p-4 rounded-2xl border border-white/10 shadow-lg">
        {/* Toggle Pills */}
        <div className="flex items-center gap-1.5 p-1 bg-black/40 border border-white/10 rounded-xl w-full sm:w-auto">
          <button
            type="button"
            onClick={() => {
              setViewMode('all');
              setSelectedAlbumId(null);
            }}
            className={`flex-1 sm:flex-initial px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer inline-flex items-center justify-center gap-2 ${
              viewMode === 'all'
                ? 'bg-gradient-to-r from-rose-600 via-pink-600 to-rose-600 text-white shadow-md shadow-rose-950/50 border border-rose-400/30'
                : 'text-neutral-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Images className="w-4 h-4" />
            <span>All Gallery</span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full ${viewMode === 'all' ? 'bg-white/20 text-white' : 'bg-white/10 text-neutral-400'}`}>
              {counts.all}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setViewMode('albums');
              setSelectedAlbumId(null);
            }}
            className={`flex-1 sm:flex-initial px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer inline-flex items-center justify-center gap-2 ${
              viewMode === 'albums'
                ? 'bg-gradient-to-r from-rose-600 via-pink-600 to-rose-600 text-white shadow-md shadow-rose-950/50 border border-rose-400/30'
                : 'text-neutral-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>By Albums</span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full ${viewMode === 'albums' ? 'bg-white/20 text-white' : 'bg-white/10 text-neutral-400'}`}>
              {albums.length}
            </span>
          </button>
        </div>

        {/* Action Button & Status */}
        <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0">
          {viewMode === 'albums' ? (
            <div className="flex items-center gap-2 w-full sm:w-auto">
              {selectedAlbumId && (
                <button
                  type="button"
                  onClick={() => setSelectedAlbumId(null)}
                  className="px-3 py-2 rounded-xl bg-white/5 hover:bg-white/15 text-neutral-300 hover:text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer border border-white/10"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>All Albums</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setNewAlbumName('');
                  setNewAlbumDesc('');
                  setNewAlbumSelectedPhotoIds(new Set());
                  setCreateAlbumSearch('');
                  setIsCreateAlbumModalOpen(true);
                }}
                className="flex-1 sm:flex-initial px-4 py-2 bg-gradient-to-r from-rose-600 via-pink-600 to-rose-600 hover:from-rose-500 hover:to-pink-500 text-white text-xs font-bold rounded-xl transition-all shadow-md cursor-pointer inline-flex items-center justify-center gap-2 border border-rose-400/30 active:scale-95"
              >
                <Plus className="w-4 h-4 stroke-[2.5]" />
                <span>Create Album</span>
              </button>
            </div>
          ) : (
            <span className="text-xs text-neutral-400 hidden sm:inline">
              Viewing all relationship photos across Milestones, Scrapbook & Chat
            </span>
          )}
        </div>
      </div>

      {/* VIEW MODE 1: BY ALBUMS */}
      {viewMode === 'albums' && (
        <div className="space-y-6">
          {selectedAlbumId === null ? (
            /* ALBUMS COLLECTION GRID */
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-serif text-2xl font-bold text-white flex items-center gap-2">
                    <BookOpen className="w-6 h-6 text-rose-400" />
                    Our Relationship Albums
                  </h2>
                  <p className="text-xs text-neutral-400 mt-1">
                    Organize your shared milestones and photos into curated albums or view the default Total Photos album.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {albums.map((album, idx) => {
                  const photos = getAlbumPhotos(album);
                  const isDefaultAlbum = album.isDefault || album.id === 'default-total-photos';

                  return (
                    <motion.div
                      key={`album-grid-${album.id}-${idx}`}
                      layout
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className={`group relative bg-neutral-900/90 rounded-2xl overflow-hidden border transition-all duration-300 flex flex-col shadow-xl cursor-pointer ${
                        isDefaultAlbum
                          ? 'border-rose-500/40 hover:border-rose-400 hover:shadow-rose-950/40 ring-1 ring-rose-500/20'
                          : 'border-white/10 hover:border-white/30 hover:shadow-black/50'
                      }`}
                      onClick={() => setSelectedAlbumId(album.id)}
                    >
                      {/* Album Cover Preview */}
                      <div className="relative aspect-[4/3] w-full overflow-hidden bg-neutral-950">
                        {renderAlbumPreview(album, photos)}

                        {/* Top Badges */}
                        <div className="absolute top-2.5 left-2.5 z-10 flex flex-wrap gap-1.5">
                          {isDefaultAlbum ? (
                            <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-gradient-to-r from-amber-500 to-rose-600 text-white shadow-lg backdrop-blur-md inline-flex items-center gap-1 border border-amber-300/30">
                              <Crown className="w-3 h-3 text-amber-200 fill-amber-200" />
                              <span>Default Album</span>
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-black/60 text-white backdrop-blur-md inline-flex items-center gap-1 border border-white/15">
                              <Folder className="w-2.5 h-2.5 text-rose-400" />
                              <span>Album</span>
                            </span>
                          )}
                        </div>

                        {/* Top Right Photo Count Pill */}
                        <div className="absolute top-2.5 right-2.5 z-10">
                          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-black/70 text-rose-200 backdrop-blur-md border border-white/15 shadow-md">
                            {photos.length} {photos.length === 1 ? 'photo' : 'photos'}
                          </span>
                        </div>

                        {/* Dark Gradient Overlay */}
                        <div className="absolute inset-0 bg-gradient-to-t from-neutral-950 via-transparent to-transparent opacity-60 group-hover:opacity-40 transition-opacity" />
                      </div>

                      {/* Album Card Details */}
                      <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                        <div className="space-y-1">
                          <h3 className="font-serif text-base font-bold text-white group-hover:text-rose-300 transition-colors line-clamp-1 flex items-center justify-between">
                            <span>{album.name}</span>
                            {isDefaultAlbum && (
                              <span className="text-[10px] text-amber-400 font-sans font-semibold bg-amber-400/10 px-2 py-0.5 rounded-full border border-amber-400/20">
                                Total Vault
                              </span>
                            )}
                          </h3>
                          <p className="text-xs text-neutral-400 font-light line-clamp-2 leading-relaxed">
                            {album.description || (isDefaultAlbum ? "All photos across Milestones, Scrapbook, and Chat gathered together." : "Custom collection of shared memories.")}
                          </p>
                        </div>

                        {/* Album Action Toolbar on Card */}
                        <div className="pt-2 border-t border-white/10 flex items-center justify-between text-xs text-neutral-400">
                          <span className="text-[10px] text-neutral-500">
                            {formatDateDisplay(album.createdAt)}
                          </span>

                          <div className="flex items-center gap-1">
                            {/* Download Album ZIP */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDownloadZip(photos, `${album.name.replace(/\s+/g, '_')}_photos.zip`);
                              }}
                              disabled={photos.length === 0 || isZipping}
                              className="p-1.5 rounded-lg bg-white/5 hover:bg-amber-600/30 text-neutral-300 hover:text-amber-200 transition-colors cursor-pointer border border-white/10 disabled:opacity-40"
                              title="Download Album as .ZIP"
                            >
                              <FolderDown className="w-3.5 h-3.5" />
                            </button>

                            {!isDefaultAlbum && (
                              <>
                                {/* Manage Photos */}
                                <button
                                  type="button"
                                  onClick={(e) => openManagePhotosModal(album, e)}
                                  className="p-1.5 rounded-lg bg-white/5 hover:bg-rose-600/30 text-neutral-300 hover:text-rose-300 transition-colors cursor-pointer border border-white/10"
                                  title="Add or Remove Photos"
                                >
                                  <Layers className="w-3.5 h-3.5" />
                                </button>

                                {/* Edit Album Name */}
                                <button
                                  type="button"
                                  onClick={(e) => openEditAlbumModal(album, e)}
                                  className="p-1.5 rounded-lg bg-white/5 hover:bg-white/15 text-neutral-300 hover:text-white transition-colors cursor-pointer border border-white/10"
                                  title="Edit Album Details"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>

                                {/* Delete Album */}
                                <button
                                  type="button"
                                  onClick={(e) => openDeleteAlbumModal(album, e)}
                                  className="p-1.5 rounded-lg bg-white/5 hover:bg-rose-600 text-neutral-300 hover:text-white transition-colors cursor-pointer border border-white/10"
                                  title="Delete Album"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}

                {/* Create New Album Card Placeholder */}
                <button
                  type="button"
                  onClick={() => {
                    setNewAlbumName('');
                    setNewAlbumDesc('');
                    setNewAlbumSelectedPhotoIds(new Set());
                    setCreateAlbumSearch('');
                    setIsCreateAlbumModalOpen(true);
                  }}
                  className="min-h-[220px] rounded-2xl border-2 border-dashed border-white/15 hover:border-rose-400/50 bg-white/5 hover:bg-rose-500/5 p-6 flex flex-col items-center justify-center text-center gap-3 transition-all cursor-pointer group shadow-inner"
                >
                  <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center group-hover:scale-110 group-hover:bg-rose-500 group-hover:text-white transition-all shadow-md">
                    <Plus className="w-6 h-6 stroke-[2.5]" />
                  </div>
                  <div>
                    <h4 className="font-serif text-sm font-bold text-white group-hover:text-rose-300 transition-colors">
                      Create New Album
                    </h4>
                    <p className="text-[11px] text-neutral-400 max-w-[180px] mx-auto mt-1">
                      Curate a special collection of date trips, vacations, or love notes
                    </p>
                  </div>
                </button>
              </div>
            </div>
          ) : (
            /* ALBUM DETAIL VIEW (WHEN AN ALBUM IS OPENED) */
            activeAlbum && (
              <div className="space-y-6">
                {/* Back Breadcrumb Navigation */}
                <div className="flex items-center gap-2 text-xs">
                  <button
                    onClick={() => setSelectedAlbumId(null)}
                    className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-neutral-300 hover:text-white inline-flex items-center gap-1.5 transition-colors cursor-pointer border border-white/10"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Back to Albums</span>
                  </button>
                  <span className="text-neutral-500">/</span>
                  <span className="font-bold text-rose-300">{activeAlbum.name}</span>
                </div>

                {/* Album Hero Header */}
                <div className="bg-gradient-to-r from-neutral-900 via-neutral-900 to-rose-950/40 rounded-3xl p-6 sm:p-8 border border-white/10 shadow-2xl relative overflow-hidden text-white flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                  <div className="space-y-2 max-w-2xl">
                    <div className="flex flex-wrap items-center gap-2">
                      {activeAlbum.isDefault ? (
                        <span className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-gradient-to-r from-amber-500 to-rose-600 text-white shadow-md inline-flex items-center gap-1.5 border border-amber-300/30">
                          <Crown className="w-3.5 h-3.5 text-amber-200 fill-amber-200" />
                          <span>Default Album</span>
                        </span>
                      ) : (
                        <span className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-rose-500/20 text-rose-300 border border-rose-500/30 inline-flex items-center gap-1.5">
                          <Folder className="w-3.5 h-3.5" />
                          <span>Custom Album</span>
                        </span>
                      )}
                      <span className="text-xs font-medium text-neutral-400 bg-white/5 border border-white/10 px-3 py-1 rounded-full">
                        {activeAlbumPhotos.length} {activeAlbumPhotos.length === 1 ? 'photo' : 'photos'}
                      </span>
                    </div>

                    <h1 className="font-serif text-3xl font-bold text-white">
                      {activeAlbum.name}
                    </h1>

                    {activeAlbum.description && (
                      <p className="text-xs sm:text-sm text-neutral-300 font-light leading-relaxed">
                        {activeAlbum.description}
                      </p>
                    )}
                  </div>

                  {/* Album Action Buttons */}
                  <div className="flex flex-wrap items-center gap-2 w-full md:w-auto shrink-0">
                    {!activeAlbum.isDefault && (
                      <>
                        <button
                          type="button"
                          onClick={() => openManagePhotosModal(activeAlbum)}
                          className="flex-1 sm:flex-initial px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold inline-flex items-center justify-center gap-2 shadow-lg shadow-rose-950/50 cursor-pointer border border-rose-400/30 active:scale-95"
                        >
                          <Plus className="w-4 h-4 stroke-[2.5]" />
                          <span>Add Photos</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => openEditAlbumModal(activeAlbum)}
                          className="px-3.5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer border border-white/15"
                          title="Edit Album Name & Description"
                        >
                          <Edit3 className="w-4 h-4" />
                          <span>Edit</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => openDeleteAlbumModal(activeAlbum)}
                          className="px-3.5 py-2.5 rounded-xl bg-rose-950/40 hover:bg-rose-600 text-rose-300 hover:text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer border border-rose-500/20"
                          title="Delete Album"
                        >
                          <Trash2 className="w-4 h-4" />
                          <span>Delete</span>
                        </button>
                      </>
                    )}

                    <button
                      type="button"
                      onClick={() => handleDownloadZip(activeAlbumPhotos, `${activeAlbum.name.replace(/\s+/g, '_')}_photos.zip`)}
                      disabled={activeAlbumPhotos.length === 0 || isZipping}
                      className="flex-1 sm:flex-initial px-4 py-2.5 rounded-xl bg-amber-600/30 hover:bg-amber-600/50 text-amber-200 text-xs font-bold inline-flex items-center justify-center gap-2 cursor-pointer border border-amber-400/30 disabled:opacity-40"
                    >
                      <FolderDown className="w-4 h-4 text-amber-300" />
                      <span>Download .ZIP ({activeAlbumPhotos.length})</span>
                    </button>
                  </div>
                </div>

                {/* Photos Grid of This Album */}
                {activeAlbumPhotos.length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3.5">
                    {activeAlbumPhotos.map((item, index) => {
                      const SourceConfig = SOURCE_COLORS[item.source] || SOURCE_COLORS.milestones;
                      const SourceIcon = SourceConfig.icon;

                      return (
                        <motion.div
                          key={`album-photo-${item.id}-${index}`}
                          layout
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.9 }}
                          onClick={() => {
                            // Find index in filteredItems or set lightbox directly
                            const idx = filteredItems.findIndex(i => i.id === item.id);
                            if (idx !== -1) {
                              setSelectedIndex(idx);
                            } else {
                              // If not in filtered, use item index
                              setSelectedIndex(index);
                            }
                            setIsZoomed(false);
                          }}
                          className="group relative aspect-square bg-neutral-900 rounded-2xl overflow-hidden border border-white/10 hover:border-white/30 shadow-md hover:shadow-xl hover:shadow-rose-950/30 cursor-pointer transition-all duration-300"
                        >
                          <img
                            src={item.url}
                            alt={item.title}
                            loading="lazy"
                            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                            onError={(e) => {
                              (e.target as HTMLElement).setAttribute('src', 'https://images.unsplash.com/photo-1518199266791-5375a83190b7?auto=format&fit=crop&w=600&q=80');
                            }}
                          />

                          {/* Source Badge */}
                          <div className="absolute top-2 left-2 z-10">
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider inline-flex items-center gap-1 shadow-md backdrop-blur-md ${SourceConfig.badge}`}>
                              <SourceIcon className="w-2.5 h-2.5" />
                              <span className="hidden xs:inline">{item.sourceName}</span>
                            </span>
                          </div>

                          {/* Top Right Actions (Remove from Album for custom albums) */}
                          <div className="absolute top-2 right-2 z-10 flex items-center gap-1">
                            {!activeAlbum.isDefault && (
                              <button
                                type="button"
                                onClick={(e) => handleRemovePhotoFromAlbum(activeAlbum.id, item.id, e)}
                                className="p-1.5 rounded-xl bg-black/70 hover:bg-rose-600 text-neutral-300 hover:text-white transition-all shadow-md backdrop-blur-md opacity-80 sm:opacity-0 group-hover:opacity-100 cursor-pointer"
                                title="Remove photo from this album"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            )}

                            {/* Quick Add to other albums */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setQuickAddPhotoItem(item);
                              }}
                              className="p-1.5 rounded-xl bg-black/70 hover:bg-rose-600 text-neutral-300 hover:text-white transition-all shadow-md backdrop-blur-md opacity-80 sm:opacity-0 group-hover:opacity-100 cursor-pointer"
                              title="Add to other albums"
                            >
                              <FolderPlus className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          {/* Dark Hover Overlay */}
                          <div className="absolute inset-0 bg-gradient-to-t from-neutral-950/90 via-neutral-950/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 p-3 flex flex-col justify-end">
                            <p className="text-white text-xs font-bold font-serif line-clamp-1 drop-shadow-md">
                              {item.title}
                            </p>
                            <div className="flex items-center justify-between text-[9px] text-neutral-400 mt-1.5 pt-1 border-t border-white/10">
                              <span>{formatDateDisplay(item.date)}</span>
                              <span className="text-rose-300 flex items-center gap-0.5 font-semibold">
                                <ZoomIn className="w-3 h-3" /> View
                              </span>
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                ) : (
                  /* EMPTY ALBUM STATE */
                  <div className="bg-white/5 backdrop-blur-md rounded-3xl p-10 text-center border border-white/10 space-y-4 max-w-md mx-auto my-6 shadow-xl text-white">
                    <div className="w-16 h-16 rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-400 flex items-center justify-center mx-auto">
                      <Folder className="w-8 h-8 stroke-[1.5]" />
                    </div>
                    <div className="space-y-1">
                      <h3 className="font-serif text-lg font-bold">
                        No Photos in This Album Yet
                      </h3>
                      <p className="text-xs text-neutral-400 leading-relaxed">
                        {activeAlbum.isDefault
                          ? "No photos have been uploaded to your shared relationship vault yet."
                          : `Add photos from your gallery vault into "${activeAlbum.name}" to build your curated memory collection.`}
                      </p>
                    </div>

                    {!activeAlbum.isDefault && (
                      <button
                        type="button"
                        onClick={() => openManagePhotosModal(activeAlbum)}
                        className="px-5 py-2.5 bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 text-white text-xs font-bold rounded-xl transition-all shadow-md cursor-pointer inline-flex items-center gap-2 border border-rose-400/30 active:scale-95"
                      >
                        <Plus className="w-4 h-4 stroke-[2.5]" />
                        <span>Add Photos Now</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          )}
        </div>
      )}

      {/* VIEW MODE 2: ALL GALLERY */}
      {viewMode === 'all' && (
        <div className="space-y-6">
          {/* FILTER & SEARCH BAR CONTROLS */}
          <div className="bg-neutral-900/80 backdrop-blur-xl rounded-2xl p-4 border border-white/10 shadow-lg space-y-4">
            {/* Top Row: Section Filter Tabs */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              {/* Section Filter Pills */}
              <HorizontalScrollWrapper className="w-full sm:w-auto" scrollContainerClassName="gap-1.5 py-0.5">
                <button
                  onClick={() => setActiveFilter('all')}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider inline-flex items-center gap-1.5 transition-all cursor-pointer shrink-0 ${
                    activeFilter === 'all'
                      ? 'bg-gradient-to-r from-rose-600 via-pink-600 to-rose-500 text-white shadow-md shadow-rose-950/50 border border-rose-400/30'
                      : 'bg-white/5 text-neutral-300 hover:text-white hover:bg-white/10 border border-white/5'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>All ({counts.all})</span>
                </button>

                <button
                  onClick={() => setActiveFilter('milestones')}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider inline-flex items-center gap-1.5 transition-all cursor-pointer shrink-0 ${
                    activeFilter === 'milestones'
                      ? 'bg-gradient-to-r from-pink-500 to-rose-600 text-white shadow-md shadow-pink-950/50 border border-pink-400/30'
                      : 'bg-pink-950/20 text-pink-300 hover:bg-pink-900/40 border border-pink-500/20'
                  }`}
                >
                  <Gift className="w-3.5 h-3.5 text-pink-400" />
                  <span>Milestones ({counts.milestones})</span>
                </button>

                <button
                  onClick={() => setActiveFilter('scrapbook')}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider inline-flex items-center gap-1.5 transition-all cursor-pointer shrink-0 ${
                    activeFilter === 'scrapbook'
                      ? 'bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow-md shadow-amber-950/50 border border-amber-400/30'
                      : 'bg-amber-950/20 text-amber-300 hover:bg-amber-900/40 border border-amber-500/20'
                  }`}
                >
                  <ImageIcon className="w-3.5 h-3.5 text-amber-400" />
                  <span>Scrapbook ({counts.scrapbook})</span>
                </button>

                <button
                  onClick={() => setActiveFilter('chat')}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider inline-flex items-center gap-1.5 transition-all cursor-pointer shrink-0 ${
                    activeFilter === 'chat'
                      ? 'bg-gradient-to-r from-purple-600 to-rose-600 text-white shadow-md shadow-purple-950/50 border border-purple-400/30'
                      : 'bg-purple-950/20 text-purple-300 hover:bg-purple-900/40 border border-purple-500/20'
                  }`}
                >
                  <MessageSquareHeart className="w-3.5 h-3.5 text-purple-400" />
                  <span>Chat ({counts.chat})</span>
                </button>
              </HorizontalScrollWrapper>

              {/* Sort Dropdown */}
              <div className="flex items-center gap-2 text-xs text-neutral-400 ml-auto shrink-0">
                <span className="hidden sm:inline font-semibold">Sort:</span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="px-3 py-1.5 rounded-xl bg-neutral-950 border border-white/10 text-white focus:outline-none focus:ring-1 focus:ring-rose-400 cursor-pointer"
                >
                  <option value="newest">Newest First</option>
                  <option value="oldest">Oldest First</option>
                  <option value="title">By Title</option>
                </select>
              </div>
            </div>

            {/* Bottom Row: Search & Uploader Filters */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1 border-t border-white/5">
              <div className="sm:col-span-2 relative">
                <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search photo title, description, or uploader..."
                  className="w-full pl-9 pr-3 py-2 text-xs bg-neutral-950/80 border border-white/10 rounded-xl focus:outline-none focus:ring-1 focus:ring-rose-400 text-white placeholder-neutral-500"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white p-1"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {uploaders.length > 0 && (
                <div className="relative">
                  <User className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <select
                    value={selectedUploader}
                    onChange={(e) => setSelectedUploader(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-xs bg-neutral-950/80 border border-white/10 rounded-xl focus:outline-none focus:ring-1 focus:ring-rose-400 text-white cursor-pointer"
                  >
                    <option value="all">All Uploaders</option>
                    {uploaders.map((u, idx) => (
                      <option key={`uploader-${u}-${idx}`} value={u}>
                        Uploaded by {u}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* BATCH SELECTION & ZIP TOOLBAR */}
          <AnimatePresence>
            {(isSelectionMode || selectedIds.size > 0) && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="bg-gradient-to-r from-rose-950/80 via-neutral-900 to-rose-950/80 backdrop-blur-xl rounded-2xl p-3.5 border border-rose-500/30 shadow-xl flex flex-wrap items-center justify-between gap-3 text-white"
              >
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleSelectAll}
                    className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-bold transition-all cursor-pointer inline-flex items-center gap-2 border border-white/10 active:scale-95"
                  >
                    {filteredItems.length > 0 && filteredItems.every(i => selectedIds.has(i.id)) ? (
                      <>
                        <CheckSquare className="w-4 h-4 text-rose-400" />
                        <span>Deselect All</span>
                      </>
                    ) : (
                      <>
                        <Square className="w-4 h-4 text-neutral-400" />
                        <span>Select All ({filteredItems.length})</span>
                      </>
                    )}
                  </button>

                  <span className="text-xs text-rose-200 font-semibold bg-rose-500/20 border border-rose-500/30 px-3 py-1 rounded-full">
                    {selectedIds.size} photo{selectedIds.size !== 1 ? 's' : ''} selected
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {selectedIds.size > 0 ? (
                    <button
                      type="button"
                      onClick={() => handleDownloadZip()}
                      disabled={isZipping}
                      className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-all shadow-md shadow-rose-950/50 cursor-pointer inline-flex items-center gap-2 border border-rose-400/30 active:scale-95 disabled:opacity-50"
                    >
                      <FileArchive className="w-4 h-4" />
                      <span>Download Selected ({selectedIds.size}) .ZIP</span>
                    </button>
                  ) : (
                    <span className="text-xs text-neutral-400 italic hidden sm:inline">
                      Click on photos to select them for ZIP download
                    </span>
                  )}

                  <button
                    type="button"
                    onClick={() => handleDownloadZip(filteredItems, 'all_gallery_photos.zip')}
                    disabled={isZipping || filteredItems.length === 0}
                    className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition-all cursor-pointer inline-flex items-center gap-1.5 border border-white/10 disabled:opacity-50 active:scale-95"
                  >
                    <FolderDown className="w-4 h-4 text-amber-400" />
                    <span className="hidden sm:inline">Download All ({filteredItems.length}) .ZIP</span>
                    <span className="sm:hidden">All .ZIP</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setIsSelectionMode(false);
                      setSelectedIds(new Set());
                    }}
                    className="p-2 rounded-xl bg-white/5 hover:bg-white/15 text-neutral-400 hover:text-white transition-colors cursor-pointer"
                    title="Exit Selection Mode"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* GALLERY IMAGES GRID */}
          {filteredItems.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3.5">
              {filteredItems.map((item, index) => {
                const SourceConfig = SOURCE_COLORS[item.source] || SOURCE_COLORS.milestones;
                const SourceIcon = SourceConfig.icon;
                const isSelected = selectedIds.has(item.id);

                return (
                  <motion.div
                    key={`gallery-grid-photo-${item.id}-${index}`}
                    layout
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ duration: 0.2 }}
                    onClick={() => {
                      if (isSelectionMode) {
                        toggleSelectItem(item.id);
                      } else {
                        setSelectedIndex(index);
                        setIsZoomed(false);
                      }
                    }}
                    className={`group relative aspect-square bg-neutral-900 rounded-2xl overflow-hidden border transition-all duration-300 cursor-pointer ${
                      isSelected
                        ? 'border-rose-500 ring-2 ring-rose-500/50 shadow-lg shadow-rose-950/40'
                        : 'border-white/10 shadow-md hover:shadow-xl hover:shadow-rose-950/30 hover:border-white/30'
                    }`}
                  >
                    {/* Image */}
                    <img
                      src={item.url}
                      alt={item.title}
                      loading="lazy"
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                      onError={(e) => {
                        (e.target as HTMLElement).setAttribute('src', 'https://images.unsplash.com/photo-1518199266791-5375a83190b7?auto=format&fit=crop&w=600&q=80');
                      }}
                    />

                    {/* Top Left Source Badge */}
                    <div className="absolute top-2 left-2 z-10">
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider inline-flex items-center gap-1 shadow-md backdrop-blur-md ${SourceConfig.badge}`}>
                        <SourceIcon className="w-2.5 h-2.5" />
                        <span className="hidden xs:inline">{item.sourceName}</span>
                      </span>
                    </div>

                    {/* Top Right Action Buttons (Select Checkbox, Add to Album, and Delete) */}
                    <div className="absolute top-2 right-2 z-10 flex items-center gap-1">
                      {/* Add to Album Button */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setQuickAddPhotoItem(item);
                        }}
                        className="p-1.5 rounded-xl bg-black/60 hover:bg-rose-600 text-neutral-300 hover:text-white transition-all shadow-md backdrop-blur-md opacity-80 sm:opacity-0 group-hover:opacity-100 cursor-pointer"
                        title="Add to Album"
                      >
                        <FolderPlus className="w-3.5 h-3.5" />
                      </button>

                      {/* Select Checkbox Button */}
                      <button
                        type="button"
                        onClick={(e) => {
                          if (!isSelectionMode) setIsSelectionMode(true);
                          toggleSelectItem(item.id, e);
                        }}
                        className={`p-1.5 rounded-xl transition-all shadow-md backdrop-blur-md cursor-pointer ${
                          isSelected
                            ? 'bg-rose-600 text-white border border-rose-400 scale-105'
                            : 'bg-black/60 text-neutral-300 hover:text-white hover:bg-black/80 border border-white/20 opacity-80 sm:opacity-0 group-hover:opacity-100'
                        } ${isSelectionMode ? 'opacity-100' : ''}`}
                        title={isSelected ? "Deselect Photo" : "Select Photo for ZIP"}
                      >
                        {isSelected ? (
                          <Check className="w-3.5 h-3.5 stroke-[3]" />
                        ) : (
                          <Square className="w-3.5 h-3.5" />
                        )}
                      </button>

                      {/* Quick Delete Button */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeletingItem(item);
                        }}
                        className="p-1.5 rounded-xl bg-black/60 hover:bg-rose-600 text-neutral-300 hover:text-white transition-all shadow-md backdrop-blur-md opacity-80 sm:opacity-0 group-hover:opacity-100 cursor-pointer"
                        title="Delete Photo Permanently"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Dark Hover Gradient Overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-neutral-950/90 via-neutral-950/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 p-3 flex flex-col justify-end">
                      <p className="text-white text-xs font-bold font-serif line-clamp-1 drop-shadow-md">
                        {item.title}
                      </p>
                      {item.description && (
                        <p className="text-neutral-300 text-[10px] line-clamp-1 mt-0.5 font-light">
                          {item.description}
                        </p>
                      )}
                      <div className="flex items-center justify-between text-[9px] text-neutral-400 mt-1.5 pt-1 border-t border-white/10">
                        <span>{formatDateDisplay(item.date)}</span>
                        <span className="text-rose-300 flex items-center gap-0.5 font-semibold">
                          <ZoomIn className="w-3 h-3" /> View
                        </span>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          ) : (
            /* EMPTY STATE */
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white/5 backdrop-blur-md rounded-3xl p-10 text-center border border-white/10 space-y-4 max-w-lg mx-auto my-8 shadow-xl"
            >
              <div className="w-16 h-16 rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-400 flex items-center justify-center mx-auto">
                <Images className="w-8 h-8 animate-pulse" />
              </div>
              <div className="space-y-1">
                <h3 className="font-serif text-xl font-bold text-white">
                  No Photos Found
                </h3>
                <p className="text-xs text-neutral-400 max-w-xs mx-auto">
                  {searchQuery || activeFilter !== 'all' || selectedUploader !== 'all'
                    ? "No uploaded photos match your search or filter settings. Try adjusting your search query or clearing filters."
                    : "No photos have been uploaded yet across Milestones, Scrapbook, or Chat. Click 'Add Photo' to share your first moment!"
                  }
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                {(searchQuery || activeFilter !== 'all' || selectedUploader !== 'all') ? (
                  <button
                    onClick={() => {
                      setActiveFilter('all');
                      setSelectedUploader('all');
                      setSearchQuery('');
                    }}
                    className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl transition-all shadow-md cursor-pointer inline-flex items-center gap-1.5"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Reset Filters
                  </button>
                ) : (
                  <button
                    onClick={() => setIsAddModalOpen(true)}
                    className="px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl transition-all shadow-md cursor-pointer inline-flex items-center gap-1.5"
                  >
                    <Plus className="w-4 h-4" />
                    Add First Photo
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </div>
      )}

      {/* CREATE ALBUM MODAL */}
      <AnimatePresence>
        {isCreateAlbumModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/85 z-[70] flex items-center justify-center p-4 backdrop-blur-md overflow-y-auto"
            onClick={() => setIsCreateAlbumModalOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-neutral-900 border border-white/10 rounded-3xl max-w-xl w-full overflow-hidden flex flex-col shadow-2xl my-8 text-white max-h-[90vh]"
            >
              <div className="p-5 border-b border-white/10 flex justify-between items-center bg-white/5">
                <div>
                  <h3 className="font-serif text-lg font-medium text-white flex items-center gap-2">
                    <FolderPlus className="w-5 h-5 text-rose-500" />
                    Create New Photo Album
                  </h3>
                  <p className="text-[11px] text-neutral-400 mt-0.5">
                    Give your album a title and pick which photos to include
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsCreateAlbumModalOpen(false)}
                  className="p-1.5 bg-white/5 hover:bg-rose-600 rounded-full text-white transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleCreateAlbum} className="p-6 space-y-4 overflow-y-auto">
                {/* Album Name */}
                <div>
                  <label className="block text-xs font-semibold text-neutral-300 mb-1">
                    Album Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={newAlbumName}
                    onChange={(e) => setNewAlbumName(e.target.value)}
                    placeholder="E.g., Alexandria Beach Sunset, First Date, Romantic Getaway"
                    className="w-full px-3.5 py-2.5 text-xs bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:ring-1 focus:ring-rose-400 text-white placeholder-neutral-500 font-medium"
                  />
                </div>

                {/* Album Description */}
                <div>
                  <label className="block text-xs font-semibold text-neutral-300 mb-1">
                    Description (Optional)
                  </label>
                  <textarea
                    value={newAlbumDesc}
                    onChange={(e) => setNewAlbumDesc(e.target.value)}
                    rows={2}
                    placeholder="What makes this album special to both of you..."
                    className="w-full px-3.5 py-2 text-xs bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:ring-1 focus:ring-rose-400 text-white placeholder-neutral-500"
                  />
                </div>

                {/* Photo Selector */}
                <div className="space-y-2 pt-2 border-t border-white/10">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="text-xs font-semibold text-neutral-300 flex items-center gap-1.5">
                      <Images className="w-3.5 h-3.5 text-rose-400" />
                      Select Photos for this Album ({newAlbumSelectedPhotoIds.size} selected)
                    </label>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          if (newAlbumSelectedPhotoIds.size === allItems.length) {
                            setNewAlbumSelectedPhotoIds(new Set());
                          } else {
                            setNewAlbumSelectedPhotoIds(new Set(allItems.map(i => i.id)));
                          }
                        }}
                        className="text-[11px] text-rose-300 hover:text-white underline cursor-pointer"
                      >
                        {newAlbumSelectedPhotoIds.size === allItems.length ? 'Clear Selection' : 'Select All'}
                      </button>
                    </div>
                  </div>

                  {/* Search inside picker */}
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={createAlbumSearch}
                      onChange={(e) => setCreateAlbumSearch(e.target.value)}
                      placeholder="Filter photos by title or source..."
                      className="w-full pl-8 pr-3 py-1.5 text-xs bg-black/40 border border-white/10 rounded-xl focus:outline-none focus:ring-1 focus:ring-rose-400 text-white placeholder-neutral-500"
                    />
                  </div>

                  {/* Grid of photos */}
                  <div className="max-h-60 overflow-y-auto grid grid-cols-3 sm:grid-cols-4 gap-2 p-1 border border-white/5 rounded-2xl bg-black/20">
                    {allItems
                      .filter(i => {
                        if (!createAlbumSearch.trim()) return true;
                        const q = createAlbumSearch.toLowerCase().trim();
                        return i.title.toLowerCase().includes(q) || i.sourceName.toLowerCase().includes(q);
                      })
                      .map((item, idx) => {
                        const isSelected = newAlbumSelectedPhotoIds.has(item.id);
                        return (
                          <div
                            key={`new-album-photo-${item.id}-${idx}`}
                            onClick={() => {
                              setNewAlbumSelectedPhotoIds(prev => {
                                const next = new Set(prev);
                                if (next.has(item.id)) next.delete(item.id);
                                else next.add(item.id);
                                return next;
                              });
                            }}
                            className={`relative aspect-square rounded-xl overflow-hidden cursor-pointer border transition-all ${
                              isSelected
                                ? 'border-rose-500 ring-2 ring-rose-500/50 shadow-md'
                                : 'border-white/10 opacity-70 hover:opacity-100 hover:border-white/30'
                            }`}
                          >
                            <img src={item.url} alt="" className="w-full h-full object-cover" />
                            <div className="absolute top-1.5 right-1.5 z-10">
                              <span className={`p-1 rounded-md text-[10px] inline-flex items-center justify-center ${
                                isSelected ? 'bg-rose-600 text-white' : 'bg-black/60 text-white/50 border border-white/20'
                              }`}>
                                {isSelected ? <Check className="w-3 h-3 stroke-[3]" /> : <Square className="w-3 h-3" />}
                              </span>
                            </div>
                            <div className="absolute bottom-0 inset-x-0 p-1 bg-black/70 text-[9px] text-white truncate">
                              {item.title}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>

                {/* Modal Footer */}
                <div className="pt-3 flex justify-end gap-2 border-t border-white/10">
                  <button
                    type="button"
                    onClick={() => setIsCreateAlbumModalOpen(false)}
                    className="px-4 py-2 rounded-xl text-xs font-semibold text-neutral-400 hover:text-white bg-white/5 hover:bg-white/10 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!newAlbumName.trim()}
                    className="px-5 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white transition-all shadow-md cursor-pointer inline-flex items-center gap-1.5"
                  >
                    <FolderPlus className="w-3.5 h-3.5" />
                    <span>Create Album ({newAlbumSelectedPhotoIds.size})</span>
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* EDIT ALBUM DETAILS MODAL */}
      <AnimatePresence>
        {editingAlbum && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/85 z-[70] flex items-center justify-center p-4 backdrop-blur-md"
            onClick={() => setEditingAlbum(null)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-neutral-900 border border-white/10 rounded-3xl max-w-md w-full overflow-hidden flex flex-col shadow-2xl text-white"
            >
              <div className="p-5 border-b border-white/10 flex justify-between items-center bg-white/5">
                <div>
                  <h3 className="font-serif text-lg font-medium text-white flex items-center gap-2">
                    <Edit3 className="w-5 h-5 text-rose-500" />
                    Edit Album
                  </h3>
                  <p className="text-[11px] text-neutral-400 mt-0.5">
                    Update album name, description, or custom cover
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingAlbum(null)}
                  className="p-1.5 bg-white/5 hover:bg-rose-600 rounded-full text-white transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleSaveEditAlbum} className="p-6 space-y-4">
                {/* Album Name */}
                <div>
                  <label className="block text-xs font-semibold text-neutral-300 mb-1">
                    Album Name *
                  </label>
                  <input
                    type="text"
                    required
                    disabled={editingAlbum.isDefault}
                    value={editAlbumName}
                    onChange={(e) => setEditAlbumName(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-xs bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:ring-1 focus:ring-rose-400 text-white font-medium disabled:opacity-50"
                  />
                  {editingAlbum.isDefault && (
                    <p className="text-[10px] text-amber-400/80 mt-1">Default album name cannot be altered.</p>
                  )}
                </div>

                {/* Album Description */}
                <div>
                  <label className="block text-xs font-semibold text-neutral-300 mb-1">
                    Description (Optional)
                  </label>
                  <textarea
                    value={editAlbumDesc}
                    onChange={(e) => setEditAlbumDesc(e.target.value)}
                    rows={2}
                    placeholder="Add a special description..."
                    className="w-full px-3.5 py-2 text-xs bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:ring-1 focus:ring-rose-400 text-white placeholder-neutral-500"
                  />
                </div>

                {/* Cover Photo Choice (pick from photos in album) */}
                {getAlbumPhotos(editingAlbum).length > 0 && (
                  <div className="space-y-1.5 pt-2 border-t border-white/10">
                    <label className="block text-xs font-semibold text-neutral-300">
                      Choose Cover Image
                    </label>
                    <div className="flex items-center gap-2 overflow-x-auto py-1">
                      {getAlbumPhotos(editingAlbum).slice(0, 8).map((p, idx) => {
                        const isCover = editAlbumCoverUrl === p.url;
                        return (
                          <div
                            key={`edit-cover-${p.id || idx}-${idx}`}
                            onClick={() => setEditAlbumCoverUrl(p.url)}
                            className={`w-14 h-14 shrink-0 rounded-xl overflow-hidden cursor-pointer border transition-all relative ${
                              isCover ? 'border-rose-500 ring-2 ring-rose-500/50' : 'border-white/10 opacity-70 hover:opacity-100'
                            }`}
                          >
                            <img src={p.url} alt="" className="w-full h-full object-cover" />
                            {isCover && (
                              <div className="absolute inset-0 bg-rose-600/30 flex items-center justify-center">
                                <Check className="w-4 h-4 text-white stroke-[3]" />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Modal Footer */}
                <div className="pt-3 flex justify-end gap-2 border-t border-white/10">
                  <button
                    type="button"
                    onClick={() => setEditingAlbum(null)}
                    className="px-4 py-2 rounded-xl text-xs font-semibold text-neutral-400 hover:text-white bg-white/5 hover:bg-white/10 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white transition-all shadow-md cursor-pointer"
                  >
                    Save Changes
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* MANAGE PHOTOS IN ALBUM MODAL */}
      <AnimatePresence>
        {managingPhotosAlbum && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/85 z-[70] flex items-center justify-center p-4 backdrop-blur-md overflow-y-auto"
            onClick={() => setManagingPhotosAlbum(null)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-neutral-900 border border-white/10 rounded-3xl max-w-2xl w-full overflow-hidden flex flex-col shadow-2xl my-8 text-white max-h-[90vh]"
            >
              <div className="p-5 border-b border-white/10 flex justify-between items-center bg-white/5">
                <div>
                  <h3 className="font-serif text-lg font-medium text-white flex items-center gap-2">
                    <Layers className="w-5 h-5 text-rose-500" />
                    Manage Photos: {managingPhotosAlbum.name}
                  </h3>
                  <p className="text-[11px] text-neutral-400 mt-0.5">
                    Check or uncheck photos to add or remove them from this album
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setManagingPhotosAlbum(null)}
                  className="p-1.5 bg-white/5 hover:bg-rose-600 rounded-full text-white transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-6 space-y-4 overflow-y-auto">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs text-rose-200 font-semibold bg-rose-500/20 border border-rose-500/30 px-3 py-1 rounded-full">
                    {managePhotoSelection.size} photo{managePhotoSelection.size !== 1 ? 's' : ''} in this album
                  </span>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (managePhotoSelection.size === allItems.length) {
                          setManagePhotoSelection(new Set());
                        } else {
                          setManagePhotoSelection(new Set(allItems.map(i => i.id)));
                        }
                      }}
                      className="text-xs text-rose-300 hover:text-white underline cursor-pointer"
                    >
                      {managePhotoSelection.size === allItems.length ? 'Clear Selection' : 'Select All Photos'}
                    </button>
                  </div>
                </div>

                {/* Search */}
                <div className="relative">
                  <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={managePhotoSearch}
                    onChange={(e) => setManagePhotoSearch(e.target.value)}
                    placeholder="Search photos by title, date, or source..."
                    className="w-full pl-9 pr-3 py-2 text-xs bg-black/40 border border-white/10 rounded-xl focus:outline-none focus:ring-1 focus:ring-rose-400 text-white placeholder-neutral-500"
                  />
                </div>

                {/* Photos Grid */}
                <div className="max-h-[50vh] overflow-y-auto grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-1">
                  {allItems
                    .filter(i => {
                      if (!managePhotoSearch.trim()) return true;
                      const q = managePhotoSearch.toLowerCase().trim();
                      return i.title.toLowerCase().includes(q) || i.sourceName.toLowerCase().includes(q);
                    })
                    .map((item, idx) => {
                      const isSelected = managePhotoSelection.has(item.id) || managePhotoSelection.has(item.url);
                      return (
                        <div
                          key={`manage-photo-${item.id || idx}-${idx}`}
                          onClick={() => {
                            setManagePhotoSelection(prev => {
                              const next = new Set(prev);
                              if (next.has(item.id)) {
                                next.delete(item.id);
                                next.delete(item.url);
                              } else {
                                next.add(item.id);
                              }
                              return next;
                            });
                          }}
                          className={`relative aspect-square rounded-2xl overflow-hidden cursor-pointer border transition-all ${
                            isSelected
                              ? 'border-rose-500 ring-2 ring-rose-500/50 shadow-md'
                              : 'border-white/10 opacity-70 hover:opacity-100 hover:border-white/30'
                          }`}
                        >
                          <img src={item.url} alt="" className="w-full h-full object-cover" />

                          {/* Checkbox badge */}
                          <div className="absolute top-2 right-2 z-10">
                            <span className={`p-1.5 rounded-xl text-xs inline-flex items-center justify-center transition-all ${
                              isSelected ? 'bg-rose-600 text-white shadow-md' : 'bg-black/60 text-white/50 border border-white/20'
                            }`}>
                              {isSelected ? <Check className="w-3.5 h-3.5 stroke-[3]" /> : <Square className="w-3.5 h-3.5" />}
                            </span>
                          </div>

                          <div className="absolute bottom-0 inset-x-0 p-1.5 bg-gradient-to-t from-black/90 via-black/50 to-transparent text-[10px] text-white">
                            <p className="truncate font-medium">{item.title}</p>
                            <span className="text-[9px] text-neutral-400">{item.sourceName}</span>
                          </div>
                        </div>
                      );
                    })}
                </div>

                {/* Footer */}
                <div className="pt-3 flex justify-end gap-2 border-t border-white/10">
                  <button
                    type="button"
                    onClick={() => setManagingPhotosAlbum(null)}
                    className="px-4 py-2 rounded-xl text-xs font-semibold text-neutral-400 hover:text-white bg-white/5 hover:bg-white/10 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveManagePhotos}
                    className="px-5 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white transition-all shadow-md cursor-pointer inline-flex items-center gap-1.5"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Save Album Photos ({managePhotoSelection.size})</span>
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* DELETE ALBUM CONFIRMATION MODAL */}
      <AnimatePresence>
        {deletingAlbum && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 z-[75] flex items-center justify-center p-4 backdrop-blur-md"
            onClick={() => setDeletingAlbum(null)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-neutral-900 border border-rose-500/30 rounded-3xl max-w-md w-full p-6 space-y-5 shadow-2xl text-white"
            >
              <div className="flex items-start gap-4">
                <div className="p-3 bg-rose-500/15 border border-rose-500/30 rounded-2xl text-rose-400 shrink-0">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <h3 className="font-serif text-lg font-bold text-white">
                    Delete Album?
                  </h3>
                  <p className="text-xs text-neutral-300 leading-relaxed">
                    Are you sure you want to delete the album <span className="font-semibold text-rose-300">"{deletingAlbum.name}"</span>?
                  </p>
                  <p className="text-[11px] text-neutral-400 mt-2 bg-white/5 p-2.5 rounded-xl border border-white/10">
                    💡 <span className="font-semibold text-white">Your photos are safe:</span> Deleting this album only removes the collection folder. All photos will stay safely preserved in your shared vault.
                  </p>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setDeletingAlbum(null)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-neutral-400 hover:text-white bg-white/5 hover:bg-white/10 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmDeleteAlbum}
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white transition-all shadow-md shadow-rose-950/50 cursor-pointer inline-flex items-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete Album</span>
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* QUICK ADD PHOTO TO ALBUM MODAL */}
      <AnimatePresence>
        {quickAddPhotoItem && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 z-[75] flex items-center justify-center p-4 backdrop-blur-md"
            onClick={() => setQuickAddPhotoItem(null)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-neutral-900 border border-white/10 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl text-white"
            >
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <h3 className="font-serif text-base font-bold text-white flex items-center gap-2">
                  <FolderPlus className="w-4 h-4 text-rose-400" />
                  Add Photo to Album
                </h3>
                <button
                  onClick={() => setQuickAddPhotoItem(null)}
                  className="p-1 text-neutral-400 hover:text-white rounded-lg hover:bg-white/10"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Thumbnail of target photo */}
              <div className="flex items-center gap-3 p-2 bg-white/5 rounded-2xl border border-white/5">
                <img src={quickAddPhotoItem.url} alt="" className="w-12 h-12 rounded-xl object-cover" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-white truncate">{quickAddPhotoItem.title}</p>
                  <p className="text-[10px] text-neutral-400">{quickAddPhotoItem.sourceName}</p>
                </div>
              </div>

              {/* Albums Checklist */}
              <div className="space-y-1.5 max-h-52 overflow-y-auto">
                <label className="text-[11px] font-semibold text-neutral-300">
                  Select which albums to include this photo in:
                </label>
                {albums.filter(a => !a.isDefault).length === 0 ? (
                  <div className="p-4 text-center bg-white/5 rounded-xl border border-white/5 space-y-2">
                    <p className="text-xs text-neutral-400">No custom albums created yet.</p>
                    <button
                      type="button"
                      onClick={() => {
                        const targetItem = quickAddPhotoItem;
                        setQuickAddPhotoItem(null);
                        setNewAlbumName('');
                        setNewAlbumDesc('');
                        setNewAlbumSelectedPhotoIds(new Set([targetItem.id]));
                        setCreateAlbumSearch('');
                        setIsCreateAlbumModalOpen(true);
                      }}
                      className="text-xs text-rose-300 hover:text-white underline font-bold cursor-pointer"
                    >
                      + Create First Album with this Photo
                    </button>
                  </div>
                ) : (
                  albums.filter(a => !a.isDefault).map((album, idx) => {
                    const isInAlbum = (album.photoIds || []).includes(quickAddPhotoItem.id) || (album.photoIds || []).includes(quickAddPhotoItem.url);
                    return (
                      <div
                        key={`quick-add-album-${album.id}-${idx}`}
                        onClick={() => handleTogglePhotoInAlbum(album.id, quickAddPhotoItem.id)}
                        className={`flex items-center justify-between p-2.5 rounded-xl border transition-all cursor-pointer ${
                          isInAlbum
                            ? 'bg-rose-500/15 border-rose-500/40 text-white'
                            : 'bg-white/5 border-white/5 hover:bg-white/10 text-neutral-300'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Folder className="w-4 h-4 text-rose-400 shrink-0" />
                          <span className="text-xs font-medium truncate">{album.name}</span>
                        </div>
                        <span className={`p-1 rounded-md text-[10px] ${
                          isInAlbum ? 'bg-rose-600 text-white' : 'text-neutral-500'
                        }`}>
                          {isInAlbum ? <Check className="w-3.5 h-3.5 stroke-[3]" /> : <Square className="w-3.5 h-3.5" />}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="flex justify-between items-center pt-2 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => {
                    const targetItem = quickAddPhotoItem;
                    setQuickAddPhotoItem(null);
                    setNewAlbumName('');
                    setNewAlbumDesc('');
                    setNewAlbumSelectedPhotoIds(new Set([targetItem.id]));
                    setCreateAlbumSearch('');
                    setIsCreateAlbumModalOpen(true);
                  }}
                  className="text-xs text-rose-300 hover:text-white underline inline-flex items-center gap-1 cursor-pointer font-medium"
                >
                  <Plus className="w-3 h-3" />
                  <span>New Album</span>
                </button>

                <button
                  type="button"
                  onClick={() => setQuickAddPhotoItem(null)}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl transition-all shadow-md cursor-pointer"
                >
                  Done
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ADD PHOTO MODAL */}
      <AnimatePresence>
        {isAddModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4 backdrop-blur-md"
            onClick={() => setIsAddModalOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-neutral-900 border border-white/10 rounded-3xl max-w-lg w-full overflow-hidden flex flex-col shadow-2xl"
            >
              <div className="p-5 border-b border-white/10 flex justify-between items-center bg-white/5">
                <div>
                  <h3 className="font-serif text-lg font-medium text-white flex items-center gap-2">
                    <Plus className="w-5 h-5 text-rose-500" />
                    Upload Photo to Gallery
                  </h3>
                  <p className="text-[11px] text-neutral-400 mt-0.5 font-sans">
                    Add a new memory photo to your shared Gallery & Scrapbook
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="p-1.5 bg-white/5 hover:bg-rose-600 rounded-full text-white transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleAddSubmit} className="p-6 space-y-4">
                {/* Drag-and-drop Image Upload Box & Multi-Photo Preview Reel */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-neutral-300">
                      Photo Files *
                    </label>
                    {pendingUploads.length > 0 && (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-rose-500/20 text-rose-300 border border-rose-500/30">
                        {pendingUploads.length} Photo{pendingUploads.length > 1 ? 's' : ''} Selected
                      </span>
                    )}
                  </div>

                  {isProcessingFile ? (
                    <div className="border-2 border-dashed border-rose-500/30 bg-white/5 rounded-2xl p-6 text-center h-44 flex flex-col items-center justify-center">
                      <div className="w-7 h-7 border-2 border-rose-500 border-t-transparent rounded-full animate-spin mb-2" />
                      <p className="text-xs font-semibold text-rose-400">{processingStatusText || 'Optimizing & processing images...'}</p>
                      <p className="text-[10px] text-neutral-400 mt-1">Compressing high-res photos for mobile & storage efficiency</p>
                    </div>
                  ) : pendingUploads.length > 0 ? (
                    <div className="space-y-2">
                      {/* Grid of uploaded thumbnails */}
                      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5 max-h-48 overflow-y-auto p-1 bg-black/30 rounded-2xl border border-white/10 custom-scrollbar">
                        {pendingUploads.map((photo, idx) => (
                          <div 
                            key={`pending-upload-${photo.id}-${idx}`}
                            className="relative aspect-square rounded-xl overflow-hidden border border-white/10 bg-neutral-950 group"
                          >
                            <img src={photo.url} alt={photo.name} className="w-full h-full object-cover" />
                            <span className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded-md bg-black/70 text-[9px] font-mono text-white">
                              #{idx + 1}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setPendingUploads((prev) => prev.filter((p) => p.id !== photo.id));
                              }}
                              className="absolute top-1 right-1 p-1 bg-black/75 hover:bg-rose-600 text-white rounded-full transition-colors cursor-pointer"
                              title="Remove photo"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ))}

                        {/* Add more button */}
                        <label className="relative aspect-square rounded-xl border-2 border-dashed border-rose-500/40 bg-rose-500/5 hover:bg-rose-500/15 flex flex-col items-center justify-center text-rose-300 transition-colors cursor-pointer select-none">
                          <input
                            type="file"
                            multiple
                            accept="image/*,image/heic,image/heif"
                            onChange={handleFileSelect}
                            className="absolute inset-0 opacity-0 w-full h-full cursor-pointer z-10"
                          />
                          <Plus className="w-5 h-5 mb-0.5" />
                          <span className="text-[9px] font-semibold text-center leading-tight">Add More</span>
                        </label>
                      </div>

                      <div className="flex items-center justify-between text-[10px] text-neutral-400 px-1">
                        <span>Tap "+ Add More" to select additional photos</span>
                        <button
                          type="button"
                          onClick={() => setPendingUploads([])}
                          className="text-rose-400 hover:text-rose-300 underline cursor-pointer"
                        >
                          Clear All
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                      className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all h-44 flex flex-col justify-center items-center relative overflow-hidden select-none ${
                        isDragging ? 'border-rose-500 bg-rose-500/10' : 'border-white/15 hover:border-rose-500/40 hover:bg-white/5'
                      }`}
                    >
                      <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        accept="image/*,image/heic,image/heif"
                        onChange={handleFileSelect}
                        className="absolute inset-0 opacity-0 w-full h-full cursor-pointer z-20"
                      />
                      <Upload className="w-8 h-8 text-rose-400 mb-2 animate-bounce pointer-events-none" />
                      <p className="text-xs font-semibold text-rose-300 pointer-events-none">
                        Drop photos here or <span className="underline">tap to browse device</span>
                      </p>
                      <p className="text-[10px] text-neutral-400 mt-1 pointer-events-none">
                        📱 Supports Camera, Multi-select, PNG, JPG, WEBP, HEIC
                      </p>
                      <span className="mt-2 text-[10px] px-2.5 py-1 rounded-lg bg-rose-500/20 text-rose-200 border border-rose-500/30 font-semibold pointer-events-none">
                        Choose Photos (Multiple Allowed)
                      </span>
                    </div>
                  )}
                </div>

                {/* Title */}
                <div>
                  <label className="block text-xs font-semibold text-neutral-300 mb-1">
                    Photo Title *
                  </label>
                  <input
                    type="text"
                    required
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    placeholder="E.g., Beautiful sunset date"
                    className="w-full px-3 py-2 text-xs bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:ring-1 focus:ring-rose-400 text-white placeholder-neutral-500"
                  />
                  {pendingUploads.length > 1 && (
                    <p className="text-[10px] text-neutral-400 mt-1">
                      Photos will be titled "{formTitle || 'Memory'} (1)", "{formTitle || 'Memory'} (2)", etc.
                    </p>
                  )}
                </div>

                {/* Category & Date */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-300 mb-1">
                      Category
                    </label>
                    <select
                      value={formCategory}
                      onChange={(e) => setFormCategory(e.target.value as any)}
                      className="w-full px-3 py-2 text-xs bg-neutral-950 border border-white/10 rounded-xl focus:outline-none focus:ring-1 focus:ring-rose-400 text-white"
                    >
                      <option value="anniversary">Anniversary</option>
                      <option value="engagement">Engagement</option>
                      <option value="birthday">Birthday</option>
                      <option value="other">Other Milestone</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-neutral-300 mb-1">
                      Date Occurred
                    </label>
                    <input
                      type="date"
                      value={formDate}
                      onChange={(e) => setFormDate(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:ring-1 focus:ring-rose-400 text-white"
                    />
                  </div>
                </div>

                {/* Description */}
                <div>
                  <label className="block text-xs font-semibold text-neutral-300 mb-1">
                    Sweet Description (Optional)
                  </label>
                  <textarea
                    value={formDesc}
                    onChange={(e) => setFormDesc(e.target.value)}
                    rows={2}
                    placeholder="Add a special note or memory details..."
                    className="w-full px-3 py-2 text-xs bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:ring-1 focus:ring-rose-400 text-white placeholder-neutral-500"
                  />
                </div>

                {/* Action Footer */}
                <div className="pt-2 flex justify-end gap-2 border-t border-white/10">
                  <button
                    type="button"
                    onClick={() => {
                      setIsAddModalOpen(false);
                      setPendingUploads([]);
                    }}
                    className="px-4 py-2 rounded-xl text-xs font-semibold text-neutral-400 hover:text-white bg-white/5 hover:bg-white/10 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={pendingUploads.length === 0 || !formTitle.trim()}
                    className="px-5 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white transition-all shadow-md cursor-pointer"
                  >
                    {pendingUploads.length > 1 ? `Save ${pendingUploads.length} Photos` : 'Save Photo'}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* DELETE CONFIRMATION MODAL */}
      <AnimatePresence>
        {deletingItem && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 z-[70] flex items-center justify-center p-4 backdrop-blur-md"
            onClick={() => setDeletingItem(null)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-neutral-900 border border-rose-500/30 rounded-3xl max-w-md w-full p-6 space-y-5 shadow-2xl text-white"
            >
              <div className="flex items-start gap-4">
                <div className="p-3 bg-rose-500/15 border border-rose-500/30 rounded-2xl text-rose-400 shrink-0">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <h3 className="font-serif text-lg font-bold text-white">
                    Delete Photo Permanently?
                  </h3>
                  <p className="text-xs text-neutral-300 leading-relaxed font-sans">
                    Are you sure you want to remove <span className="font-semibold text-rose-300">"{deletingItem.title}"</span> from <span className="font-semibold text-white">{deletingItem.sourceName}</span>?
                  </p>
                </div>
              </div>

              {/* Preview Thumbnail */}
              <div className="relative aspect-video rounded-2xl overflow-hidden border border-white/10 bg-neutral-950">
                <img src={deletingItem.url} alt="thumbnail" className="w-full h-full object-cover" />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setDeletingItem(null)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-neutral-400 hover:text-white bg-white/5 hover:bg-white/10 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmDelete}
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white transition-all shadow-md shadow-rose-950/50 cursor-pointer inline-flex items-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete Photo</span>
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* FULLSCREEN LIGHTBOX MODAL */}
      <AnimatePresence>
        {activeLightboxItem && selectedIndex !== null && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-neutral-950/95 backdrop-blur-2xl flex flex-col justify-between p-4 sm:p-6"
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between z-10 w-full max-w-6xl mx-auto">
              <div className="flex items-center gap-2">
                <span className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider inline-flex items-center gap-1.5 shadow-md ${SOURCE_COLORS[activeLightboxItem.source]?.badge}`}>
                  {React.createElement(SOURCE_COLORS[activeLightboxItem.source]?.icon || Images, { className: "w-3.5 h-3.5" })}
                  <span>{activeLightboxItem.sourceName}</span>
                </span>
                <span className="text-xs text-neutral-400 font-mono hidden sm:inline">
                  {selectedIndex + 1} of {filteredItems.length}
                </span>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2">
                {/* Add to Album in Lightbox */}
                <button
                  onClick={() => setQuickAddPhotoItem(activeLightboxItem)}
                  className="p-2 rounded-xl bg-white/10 hover:bg-rose-600 text-white text-xs transition-colors cursor-pointer inline-flex items-center gap-1.5"
                  title="Add to Album"
                >
                  <FolderPlus className="w-4 h-4" />
                  <span className="hidden sm:inline">Add to Album</span>
                </button>

                <button
                  onClick={() => setIsZoomed(!isZoomed)}
                  className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs transition-colors cursor-pointer"
                  title={isZoomed ? "Reset Zoom" : "Zoom Image"}
                >
                  <ZoomIn className={`w-4 h-4 transition-transform ${isZoomed ? 'scale-125 text-rose-400' : ''}`} />
                </button>

                <button
                  onClick={() => handleDownload(activeLightboxItem.url, `${activeLightboxItem.title.replace(/\s+/g, '_')}.jpg`)}
                  className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs transition-colors cursor-pointer"
                  title="Download Image"
                >
                  <Download className="w-4 h-4" />
                </button>

                <button
                  onClick={() => handleDownloadZip([activeLightboxItem], `${activeLightboxItem.title.replace(/\s+/g, '_')}.zip`)}
                  className="p-2 rounded-xl bg-amber-950/60 hover:bg-amber-600 text-amber-300 hover:text-white text-xs transition-colors cursor-pointer inline-flex items-center gap-1.5 border border-amber-500/30"
                  title="Download as .ZIP"
                >
                  <FileArchive className="w-4 h-4" />
                  <span className="hidden sm:inline">.ZIP</span>
                </button>

                {/* Lightbox Delete Button */}
                <button
                  onClick={() => setDeletingItem(activeLightboxItem)}
                  className="p-2 rounded-xl bg-rose-950/60 hover:bg-rose-600 text-rose-300 hover:text-white text-xs transition-colors cursor-pointer inline-flex items-center gap-1.5 border border-rose-500/30"
                  title="Delete Photo Permanently"
                >
                  <Trash2 className="w-4 h-4" />
                  <span className="hidden sm:inline">Delete</span>
                </button>

                <button
                  onClick={() => {
                    setSelectedIndex(null);
                    setIsZoomed(false);
                    onNavigateTab(activeLightboxItem.targetTab);
                  }}
                  className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-all shadow-md cursor-pointer inline-flex items-center gap-1.5"
                  title={`Open section: ${activeLightboxItem.sourceName}`}
                >
                  <span>Go to {activeLightboxItem.sourceName}</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>

                <button
                  onClick={() => {
                    setSelectedIndex(null);
                    setIsZoomed(false);
                  }}
                  className="p-2 rounded-xl bg-white/10 hover:bg-rose-600 text-white transition-colors cursor-pointer"
                  title="Close Lightbox"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Image Area with Nav Arrows */}
            <div className="relative flex-1 flex items-center justify-center my-4 overflow-hidden">
              {/* Prev Arrow */}
              {filteredItems.length > 1 && (
                <button
                  onClick={() => {
                    setSelectedIndex((prev) => (prev !== null && prev > 0 ? prev - 1 : filteredItems.length - 1));
                    setIsZoomed(false);
                  }}
                  className="absolute left-2 sm:left-4 z-20 p-3 rounded-full bg-neutral-900/80 text-white border border-white/20 hover:bg-rose-600 transition-all cursor-pointer shadow-2xl active:scale-95"
                  title="Previous Image"
                >
                  <ChevronLeft className="w-6 h-6" />
                </button>
              )}

              {/* Central Image Container */}
              <div className="max-w-4xl max-h-[70vh] flex items-center justify-center overflow-auto p-2">
                <motion.img
                  key={`lightbox-img-${activeLightboxItem.id || 'item'}`}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: isZoomed ? 1.4 : 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.25 }}
                  src={activeLightboxItem.url}
                  alt={activeLightboxItem.title}
                  className={`max-h-[68vh] w-auto max-w-full object-contain rounded-2xl shadow-2xl border border-white/10 transition-transform ${isZoomed ? 'cursor-zoom-out' : 'cursor-zoom-in'}`}
                  onClick={() => setIsZoomed(!isZoomed)}
                />
              </div>

              {/* Next Arrow */}
              {filteredItems.length > 1 && (
                <button
                  onClick={() => {
                    setSelectedIndex((prev) => (prev !== null && prev < filteredItems.length - 1 ? prev + 1 : 0));
                    setIsZoomed(false);
                  }}
                  className="absolute right-2 sm:right-4 z-20 p-3 rounded-full bg-neutral-900/80 text-white border border-white/20 hover:bg-rose-600 transition-all cursor-pointer shadow-2xl active:scale-95"
                  title="Next Image"
                >
                  <ChevronRight className="w-6 h-6" />
                </button>
              )}
            </div>

            {/* Modal Bottom Metadata Panel */}
            <div className="w-full max-w-3xl mx-auto bg-neutral-900/90 border border-white/10 rounded-2xl p-4 shadow-2xl backdrop-blur-md text-white flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 z-10">
              <div className="space-y-1">
                <h3 className="font-serif text-base font-bold text-white flex items-center gap-2">
                  <span>{activeLightboxItem.title}</span>
                  <Heart className="w-3.5 h-3.5 text-rose-500 fill-rose-500" />
                </h3>
                {activeLightboxItem.description && (
                  <p className="text-xs text-neutral-300 font-light max-w-xl">
                    {activeLightboxItem.description}
                  </p>
                )}
              </div>

              <div className="flex flex-wrap sm:flex-col items-start sm:items-end text-xs text-neutral-400 gap-x-4 gap-y-1 shrink-0">
                <span className="flex items-center gap-1 font-sans">
                  <Calendar className="w-3.5 h-3.5 text-rose-400" />
                  {formatDateDisplay(activeLightboxItem.date)}
                </span>
                {activeLightboxItem.createdBy && (
                  <span className="flex items-center gap-1 text-neutral-300 font-medium font-sans">
                    <User className="w-3.5 h-3.5 text-rose-400" />
                    Uploaded by {activeLightboxItem.createdBy}
                  </span>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ZIP PROCESSING MODAL */}
      <AnimatePresence>
        {isZipping && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 z-[80] flex items-center justify-center p-4 backdrop-blur-md"
          >
            <motion.div
              initial={{ scale: 0.9, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 15 }}
              className="bg-neutral-900 border border-rose-500/30 rounded-3xl max-w-sm w-full p-6 text-center space-y-4 shadow-2xl text-white"
            >
              <div className="w-14 h-14 rounded-2xl bg-rose-500/20 border border-rose-500/40 text-rose-400 flex items-center justify-center mx-auto shadow-inner">
                <FileArchive className="w-7 h-7 animate-bounce" />
              </div>
              <div className="space-y-1">
                <h3 className="font-serif text-lg font-bold text-white">
                  Creating .ZIP Archive
                </h3>
                <p className="text-xs text-rose-300 font-sans font-medium">
                  {zipProgress || 'Packaging your photos...'}
                </p>
              </div>
              <div className="w-full bg-white/10 rounded-full h-2 overflow-hidden relative">
                <div className="bg-gradient-to-r from-rose-500 via-amber-500 to-rose-500 h-full w-full animate-pulse" />
              </div>
              <p className="text-[10px] text-neutral-400">
                Please wait while your high-resolution images are compressed into a downloadable .zip file.
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Gallery;
