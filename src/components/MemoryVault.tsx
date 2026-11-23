import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Image as ImageIcon, Plus, Trash2, Calendar, Filter, 
  Upload, X, Heart, ZoomIn, Film, Edit3,
  LayoutGrid, ChevronLeft, ChevronRight, Play, Pause
} from 'lucide-react';
import { Memory, Milestone, ChatMessage, MilestoneCategory, SubscriptionTier } from '../types';
import { HorizontalScrollWrapper } from './HorizontalScrollWrapper';

interface MemoryVaultProps {
  memories: Memory[];
  milestones?: Milestone[];
  chatMessages?: ChatMessage[];
  onAddMemory: (memory: Memory) => void;
  onDeleteMemory: (id: string) => void;
  onUpdateMemory: (memory: Memory) => void;
  userPlan?: SubscriptionTier;
  onOpenUpgradeModal?: () => void;
}

export const MemoryVault: React.FC<MemoryVaultProps> = ({
  memories,
  milestones,
  chatMessages,
  onAddMemory,
  onDeleteMemory,
  onUpdateMemory,
  userPlan = 'free',
  onOpenUpgradeModal
}) => {
  const [templateFilter, setTemplateFilter] = useState<'all' | 'gallery' | 'milestones' | 'chat' | 'templates'>('all');
  const [templateSearch, setTemplateSearch] = useState('');

  // Aggregate all images from Gallery (Scrapbook, Milestones, Chat, Templates) for the chooser modal
  const gallerySourceImages = React.useMemo(() => {
    const list: { id: string; name: string; path: string; source: 'scrapbook' | 'milestones' | 'chat' | 'templates'; sourceName: string }[] = [];

    // 1. Scrapbook memories
    if (Array.isArray(memories)) {
      memories.forEach((mem, idx) => {
        if (mem.url && mem.url.trim().length > 0) {
          list.push({
            id: `mem-${mem.id || idx}`,
            name: mem.title || 'Scrapbook Photo',
            path: mem.url,
            source: 'scrapbook',
            sourceName: 'Scrapbook'
          });
        }
      });
    }

    // 2. Milestones photos
    if (Array.isArray(milestones)) {
      milestones.forEach((m) => {
        if (!m.archived && Array.isArray(m.photos)) {
          m.photos.forEach((photoUrl, pIdx) => {
            if (photoUrl && photoUrl.trim().length > 0) {
              list.push({
                id: `m-${m.id}-${pIdx}`,
                name: m.title ? `${m.title} (#${pIdx + 1})` : 'Milestone Photo',
                path: photoUrl,
                source: 'milestones',
                sourceName: 'Milestone'
              });
            }
          });
        }
      });
    }

    // 3. Chat attachments
    if (Array.isArray(chatMessages)) {
      chatMessages.forEach((msg) => {
        if (msg.imageUrl && msg.imageUrl.trim().length > 0) {
          list.push({
            id: `chat-${msg.id}`,
            name: msg.content ? msg.content.substring(0, 25) : 'Chat Photo',
            path: msg.imageUrl,
            source: 'chat',
            sourceName: 'Chat'
          });
        }
      });
    };

    return list;
  }, [memories, milestones, chatMessages]);

  const filteredGalleryImages = React.useMemo(() => {
    return gallerySourceImages.filter(img => {
      if (templateFilter !== 'all' && img.source !== templateFilter) {
        return false;
      }
      if (templateSearch.trim()) {
        const q = templateSearch.toLowerCase().trim();
        return img.name.toLowerCase().includes(q) || img.sourceName.toLowerCase().includes(q);
      }
      return true;
    });
  }, [gallerySourceImages, templateFilter, templateSearch]);

  const [activeFilter, setActiveFilter] = useState<'all' | MilestoneCategory>('all');
  
  // Filter lists (moved up for access in hooks/state)
  const filteredMemories = memories.filter(m => {
    if (activeFilter === 'all') return true;
    return m.category === activeFilter;
  });

  const [isAdding, setIsAdding] = useState(false);
  const [selectedMemory, setSelectedMemory] = useState<Memory | null>(null);
  const [showGallery, setShowGallery] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // View state for Grid vs Carousel Slideshow mode
  const [viewMode, setViewMode] = useState<'grid' | 'carousel'>('grid');
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const [isPlaying, setIsPlaying] = useState(false);

  // Auto-play interval for Carousel
  useEffect(() => {
    if (!isPlaying || viewMode !== 'carousel' || filteredMemories.length <= 1) {
      return;
    }

    const interval = setInterval(() => {
      setDirection(1);
      setCarouselIndex((prev) => (prev + 1) % filteredMemories.length);
    }, 4000);

    return () => clearInterval(interval);
  }, [isPlaying, viewMode, filteredMemories.length]);

  // Keep carouselIndex in bounds if filtered memories count shrinks
  useEffect(() => {
    if (carouselIndex >= filteredMemories.length) {
      setCarouselIndex(0);
    }
  }, [filteredMemories.length, carouselIndex]);

  const handleNext = () => {
    setDirection(1);
    setCarouselIndex((prev) => (prev + 1) % filteredMemories.length);
  };

  const handlePrev = () => {
    setDirection(-1);
    setCarouselIndex((prev) => (prev - 1 + filteredMemories.length) % filteredMemories.length);
  };

  const slideVariants = {
    enter: (dir: number) => ({
      x: dir > 0 ? 300 : -300,
      opacity: 0,
      scale: 0.95
    }),
    center: {
      zIndex: 1,
      x: 0,
      opacity: 1,
      scale: 1
    },
    exit: (dir: number) => ({
      zIndex: 0,
      x: dir < 0 ? 300 : -300,
      opacity: 0,
      scale: 0.95
    })
  };

  // Form states
  // Form states (Supports Multi-File Upload)
  const [formTitle, setFormTitle] = useState('');
  const [formCategory, setFormCategory] = useState<MilestoneCategory>('anniversary');
  const [formDate, setFormDate] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formMediaBase64, setFormMediaBase64] = useState<string>('');
  const [formMediaType, setFormMediaType] = useState<'image' | 'video' | 'audio'>('image');
  const [pendingMediaList, setPendingMediaList] = useState<Array<{ id: string; url: string; type: 'image' | 'video'; name: string }>>([]);
  const [processingStatusText, setProcessingStatusText] = useState<string>('');
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Single file compression helper
  const compressMediaItem = (file: File): Promise<{ url: string; type: 'image' | 'video'; name: string } | null> => {
    return new Promise((resolve) => {
      const isImage = (file.type && file.type.startsWith('image/')) || 
                      /\.(jpe?g|png|webp|gif|heic|heif|bmp|svg)$/i.test(file.name) ||
                      (!file.type.startsWith('video/') && file.size > 0);
      const isVideo = file.type && file.type.startsWith('video/');
      
      if (!isImage && !isVideo) {
        resolve(null);
        return;
      }

      const mediaType: 'image' | 'video' = isImage ? 'image' : 'video';
      const cleanName = file.name.replace(/\.[^/.]+$/, '').trim();

      if (isImage) {
        const reader = new FileReader();
        reader.onload = (e) => {
          const rawResult = e.target?.result as string;
          if (!rawResult) {
            resolve(null);
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
                const compressed = canvas.toDataURL('image/jpeg', 0.80);
                resolve({ url: compressed, type: 'image', name: cleanName });
                return;
              }
            } catch (err) {
              console.warn("Canvas compression failed, falling back:", err);
            }
            resolve({ url: rawResult, type: 'image', name: cleanName });
          };
          img.onerror = () => resolve({ url: rawResult, type: 'image', name: cleanName });
          img.src = rawResult;
        };
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(file);
      } else {
        const reader = new FileReader();
        reader.onload = (e) => {
          if (e.target?.result && typeof e.target.result === 'string') {
            resolve({ url: e.target.result, type: 'video', name: cleanName });
          } else {
            resolve(null);
          }
        };
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(file);
      }
    });
  };

  // Multi-file processing handler
  const processFiles = async (files: File[]) => {
    if (!files || files.length === 0) return;

    setIsProcessingFile(true);
    const newItems: Array<{ id: string; url: string; type: 'image' | 'video'; name: string }> = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setProcessingStatusText(files.length > 1 ? `Optimizing item ${i + 1} of ${files.length}...` : 'Optimizing item...');
      const item = await compressMediaItem(file);
      if (item) {
        newItems.push({
          id: `pending-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          url: item.url,
          type: item.type,
          name: item.name || `Memory ${pendingMediaList.length + newItems.length + 1}`
        });
      }
    }

    if (newItems.length > 0) {
      setPendingMediaList((prev) => [...prev, ...newItems]);
      if (!formTitle.trim()) {
        setFormTitle(newItems[0].name || 'Our Sweet Memory');
      }
      setFormMediaBase64(newItems[0].url);
      setFormMediaType(newItems[0].type);
    }

    setIsProcessingFile(false);
    setProcessingStatusText('');
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
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFiles(Array.from(e.target.files));
      e.target.value = '';
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const hasMedia = pendingMediaList.length > 0 || !!formMediaBase64;
    if (!formTitle.trim() || !hasMedia) return;

    if (editingId) {
      const updatedMemory: Memory = {
        id: editingId,
        title: formTitle,
        type: formMediaType,
        url: formMediaBase64,
        description: formDesc,
        date: formDate || new Date().toISOString().slice(0, 10),
        category: formCategory
      };
      onUpdateMemory(updatedMemory);
    } else {
      if (pendingMediaList.length > 0) {
        pendingMediaList.forEach((media, idx) => {
          const itemTitle = pendingMediaList.length === 1 
            ? formTitle.trim() 
            : `${formTitle.trim()} (${idx + 1})`;

          const newMemory: Memory = {
            id: `mem-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 6)}`,
            title: itemTitle,
            type: media.type,
            url: media.url,
            description: formDesc || `Scrapbook moment`,
            date: formDate || new Date().toISOString().slice(0, 10),
            category: formCategory
          };
          onAddMemory(newMemory);
        });
      } else if (formMediaBase64) {
        const newMemory: Memory = {
          id: 'mem-' + Date.now(),
          title: formTitle,
          type: formMediaType,
          url: formMediaBase64,
          description: formDesc,
          date: formDate || new Date().toISOString().slice(0, 10),
          category: formCategory
        };
        onAddMemory(newMemory);
      }
    }

    resetForm();
  };

  const resetForm = () => {
    setFormTitle('');
    setFormCategory('anniversary');
    setFormDate('');
    setFormDesc('');
    setFormMediaBase64('');
    setFormMediaType('image');
    setPendingMediaList([]);
    setIsAdding(false);
    setEditingId(null);
  };

  const handleStartEdit = (mem: Memory) => {
    setEditingId(mem.id);
    setFormTitle(mem.title);
    setFormCategory(mem.category);
    setFormDate(mem.date);
    setFormDesc(mem.description);
    setFormMediaBase64(mem.url);
    setFormMediaType(mem.type);
    setIsAdding(true);

    // Scroll to form smoothly
    const element = document.getElementById('btn-add-memory');
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  // Filter list defined above

  return (
    <div className="w-full max-w-4xl mx-auto px-4 py-4 font-sans">
      
      {/* Title */}
      <div className="text-center mb-8">
        <h2 className="font-serif text-2xl md:text-3xl text-white font-medium tracking-tight mb-2">
          Our Love Scrapbook
        </h2>
        <p className="text-xs sm:text-sm text-neutral-400 max-w-md mx-auto">
          Browse and capture all our gorgeous highlights, holding hands, travels, dinners, and cute milestones in one beautiful gallery.
        </p>
      </div>

      {/* Filter and Add panel */}
      <div className="flex flex-wrap justify-between items-center gap-4 mb-8 bg-white/5 p-4 rounded-2xl border border-white/10 shadow-md">
        {/* Filters and Toggle layout */}
        <div className="flex flex-wrap items-center gap-4">
          {/* View Mode Toggle */}
          <div className="flex bg-neutral-950/40 p-1 rounded-xl border border-white/10 gap-0.5">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-lg transition-all inline-flex items-center gap-1 text-xs font-semibold cursor-pointer ${
                viewMode === 'grid'
                  ? 'bg-rose-600 text-white shadow-md shadow-rose-950/25'
                  : 'text-neutral-400 hover:text-white hover:bg-white/5'
              }`}
              title="Grid View"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span className="text-[10px] uppercase font-bold tracking-wider px-0.5 hidden sm:inline font-sans">Grid</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setViewMode('carousel');
                setCarouselIndex(0);
                setIsPlaying(false);
              }}
              className={`p-1.5 rounded-lg transition-all inline-flex items-center gap-1 text-xs font-semibold cursor-pointer ${
                viewMode === 'carousel'
                  ? 'bg-rose-600 text-white shadow-md shadow-rose-950/25'
                  : 'text-neutral-400 hover:text-white hover:bg-white/5'
              }`}
              title="Carousel Slideshow"
            >
              <Film className="w-3.5 h-3.5" />
              <span className="text-[10px] uppercase font-bold tracking-wider px-0.5 hidden sm:inline font-sans font-semibold">Slideshow</span>
            </button>
          </div>

          {/* Filter Pills */}
          <div className="flex flex-wrap gap-1">
            {([
              { id: 'all', label: 'All Photos' },
              { id: 'anniversary', label: 'Anniversary' },
              { id: 'engagement', label: 'Engagement' },
              { id: 'birthday', label: 'Birthday' },
              { id: 'other', label: 'Other' }
            ] as const).map((filter, idx) => (
              <button
                key={`vault-filter-${filter.id}-${idx}`}
                onClick={() => {
                  setActiveFilter(filter.id);
                  setCarouselIndex(0);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all cursor-pointer ${
                  activeFilter === filter.id
                    ? 'bg-rose-600 text-white shadow-md shadow-rose-950/25'
                    : 'text-neutral-400 hover:bg-white/5 hover:text-white'
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>

        {/* Add Memory Button */}
        <button
          id="btn-add-memory"
          onClick={() => {
            setIsAdding(!isAdding);
          }}
          className="bg-rose-600 hover:bg-rose-700 text-white px-4 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer shadow-md shadow-rose-950/20"
        >
          <Plus className="w-4 h-4" />
          Add sweet moment
        </button>

      </div>

      {/* Add Memory Form Panel */}
      <AnimatePresence>
        {isAdding && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden bg-neutral-900 rounded-3xl border border-white/10 shadow-2xl mb-8"
          >
            <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-4">
              <h3 className="font-serif text-lg font-medium text-white mb-2 flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-rose-500" />
                {editingId ? 'Edit Your Beautiful Memory' : 'Log a New Memory'}
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Left: Drag-n-drop file upload & Multi-Media Preview Reel */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-semibold text-neutral-400">Photo or Video *</label>
                    {pendingMediaList.length > 0 && (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-rose-500/20 text-rose-300 border border-rose-500/30">
                        {pendingMediaList.length} Item{pendingMediaList.length > 1 ? 's' : ''} Selected
                      </span>
                    )}
                  </div>
                  
                  {isProcessingFile ? (
                    <div className="border-2 border-dashed rounded-2xl p-8 text-center h-44 flex flex-col justify-center items-center border-rose-500/30 bg-white/5">
                      <div className="w-8 h-8 border-2 border-rose-500 border-t-transparent rounded-full animate-spin mb-3" />
                      <p className="text-xs font-semibold text-rose-400 font-sans">
                        {processingStatusText || 'Processing and compressing...'}
                      </p>
                      <p className="text-[10px] text-neutral-500 font-sans mt-1">
                        Optimizing your beautiful memory for fast loading!
                      </p>
                    </div>
                  ) : pendingMediaList.length > 0 ? (
                    <div className="space-y-2">
                      {/* Grid of uploaded thumbnails */}
                      <div className="grid grid-cols-3 gap-2.5 max-h-48 overflow-y-auto p-1 bg-black/30 rounded-2xl border border-white/10 custom-scrollbar">
                        {pendingMediaList.map((media, idx) => (
                          <div
                            key={`pending-media-${media.id}-${idx}`}
                            className="relative aspect-square rounded-xl overflow-hidden border border-white/10 bg-neutral-950 group"
                          >
                            {media.type === 'image' ? (
                              <img src={media.url} alt={media.name} className="w-full h-full object-cover" />
                            ) : (
                              <video src={media.url} className="w-full h-full object-cover" />
                            )}
                            <span className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded-md bg-black/70 text-[9px] font-mono text-white">
                              #{idx + 1}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                const remaining = pendingMediaList.filter((m) => m.id !== media.id);
                                setPendingMediaList(remaining);
                                if (remaining.length > 0) {
                                  setFormMediaBase64(remaining[0].url);
                                  setFormMediaType(remaining[0].type);
                                } else {
                                  setFormMediaBase64('');
                                }
                              }}
                              className="absolute top-1 right-1 p-1 bg-black/75 hover:bg-rose-600 text-white rounded-full transition-colors cursor-pointer"
                              title="Remove item"
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
                            accept="image/*,video/*,image/heic,image/heif"
                            onChange={handleFileSelect}
                            className="absolute inset-0 opacity-0 w-full h-full cursor-pointer z-10"
                          />
                          <Plus className="w-5 h-5 mb-0.5" />
                          <span className="text-[9px] font-semibold text-center leading-tight">Add More</span>
                        </label>
                      </div>

                      <div className="flex items-center justify-between text-[10px] text-neutral-400 px-1">
                        <span>Tap "+ Add More" to upload more files</span>
                        <button
                          type="button"
                          onClick={() => {
                            setPendingMediaList([]);
                            setFormMediaBase64('');
                          }}
                          className="text-rose-400 hover:text-rose-300 underline cursor-pointer"
                        >
                          Clear All
                        </button>
                      </div>
                    </div>
                  ) : formMediaBase64 ? (
                    <div className="relative aspect-video rounded-2xl overflow-hidden border border-white/10 bg-neutral-950">
                      {formMediaType === 'image' ? (
                        <img
                          src={formMediaBase64}
                          alt="upload preview"
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <video
                          src={formMediaBase64}
                          controls
                          className="w-full h-full object-cover"
                        />
                      )}
                      <div className="absolute bottom-2 left-2 flex gap-1.5 z-10">
                        <button
                          type="button"
                          onClick={() => setShowGallery(true)}
                          className="px-2.5 py-1 rounded-lg bg-black/75 hover:bg-rose-600 text-[10px] text-white border border-white/10 transition-colors inline-flex items-center gap-1 cursor-pointer"
                        >
                          <ImageIcon className="w-3 h-3" />
                          Choose Another
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => setFormMediaBase64('')}
                        className="absolute top-2 right-2 p-1.5 bg-black/60 hover:bg-rose-600 rounded-full text-white transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                      className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all h-52 flex flex-col justify-center items-center relative overflow-hidden select-none ${
                        isDragging 
                          ? 'border-rose-500 bg-rose-500/10' 
                          : 'border-white/15 hover:border-rose-500/30 hover:bg-white/5'
                      }`}
                    >
                      <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        accept="image/*,video/*,image/heic,image/heif"
                        onChange={handleFileSelect}
                        className="absolute inset-0 opacity-0 w-full h-full cursor-pointer z-10"
                      />
                      <Upload className="w-8 h-8 text-rose-400 mb-2 animate-pulse pointer-events-none" />
                      <p className="text-xs font-semibold text-rose-400 font-sans pointer-events-none">
                        Drop photos or videos here
                      </p>
                      <p className="text-[10px] text-neutral-400 font-sans mt-1 pointer-events-none">
                        or <span className="underline text-rose-400 font-medium">tap to browse phone photos / camera (Multi-select)</span>
                      </p>
                      
                      <div className="mt-4 relative z-20">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowGallery(true);
                          }}
                          className="px-3 py-1.5 rounded-lg bg-rose-600/20 hover:bg-rose-600 text-rose-300 hover:text-white border border-rose-500/30 text-[11px] font-semibold transition-all cursor-pointer inline-flex items-center gap-1 shadow-sm"
                        >
                          <ImageIcon className="w-3.5 h-3.5 text-rose-400" />
                          Browse Gallery Images 📸
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Right: details input */}
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-400 mb-1">Memory Title *</label>
                    <input
                      type="text"
                      required
                      value={formTitle}
                      onChange={(e) => setFormTitle(e.target.value)}
                      placeholder="E.g., Sweet hug at the pier"
                      className="w-full px-3 py-2 text-xs bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:ring-1 focus:ring-rose-400 focus:border-rose-400 text-white placeholder-neutral-500"
                    />
                    {pendingMediaList.length > 1 && (
                      <p className="text-[10px] text-neutral-400 mt-1">
                        Memories will be titled "{formTitle || 'Memory'} (1)", "{formTitle || 'Memory'} (2)", etc.
                      </p>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-neutral-400 mb-1">Category</label>
                      <select
                        value={formCategory}
                        onChange={(e) => setFormCategory(e.target.value as any)}
                        className="w-full px-3 py-2 text-xs bg-neutral-900 border border-white/10 rounded-xl focus:outline-none focus:ring-1 focus:ring-rose-400 focus:border-rose-400 text-white"
                      >
                        <option value="anniversary">Anniversary</option>
                        <option value="engagement">Engagement</option>
                        <option value="birthday">Birthday</option>
                        <option value="other">Other Milestone</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-neutral-400 mb-1">Date Occurred</label>
                      <input
                        type="date"
                        value={formDate}
                        onChange={(e) => setFormDate(e.target.value)}
                        className="w-full px-3 py-2 text-xs bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:ring-1 focus:ring-rose-400 focus:border-rose-400 text-white"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-neutral-400 mb-1">Describe this beautiful moment</label>
                    <textarea
                      value={formDesc}
                      onChange={(e) => setFormDesc(e.target.value)}
                      rows={3}
                      placeholder="E.g., We sat together for hours just listening to the waves..."
                      className="w-full px-3 py-2 text-xs bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:ring-1 focus:ring-rose-400 focus:border-rose-400 text-white placeholder-neutral-500 resize-none"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-white/10">
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-4 py-2 rounded-xl text-xs font-semibold border border-white/15 text-neutral-300 hover:bg-white/5 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  id="btn-save-memory-submit"
                  type="submit"
                  disabled={!formTitle.trim() || (pendingMediaList.length === 0 && !formMediaBase64)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer border border-rose-500/20"
                >
                  {editingId ? 'Save Changes' : (pendingMediaList.length > 1 ? `Save ${pendingMediaList.length} Moments` : 'Save to Album')}
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {viewMode === 'grid' ? (
        /* Memories Grid layout */
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
          {filteredMemories.map((mem, index) => {
            let badgeColor = 'bg-rose-500/10 text-rose-300 border border-rose-500/20';
            if (mem.category === 'birthday') badgeColor = 'bg-pink-500/10 text-pink-300 border border-pink-500/20';
            if (mem.category === 'engagement') badgeColor = 'bg-amber-500/10 text-amber-300 border border-amber-500/20';
            if (mem.category === 'other') badgeColor = 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20';

            return (
              <motion.div
                id={`memory-card-${mem.id}`}
                key={`memory-card-${mem.id}-${index}`}
                layout
                whileHover={{ y: -5 }}
                className="bg-white/5 rounded-2xl overflow-hidden shadow-md border border-white/10 flex flex-col group relative"
              >
                {/* Media element with magnifying overlay */}
                <div 
                  onClick={() => setSelectedMemory(mem)}
                  className="aspect-[4/3] bg-neutral-950 overflow-hidden relative cursor-pointer group"
                >
                  {mem.type === 'image' ? (
                    <img
                      src={mem.url}
                      alt={mem.title}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="relative w-full h-full">
                      <video
                        src={mem.url}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                        <Film className="w-8 h-8 text-white drop-shadow" />
                      </div>
                    </div>
                  )}

                  {/* Hover overlay zoom */}
                  <div className="absolute inset-0 bg-black/25 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <span className="p-2 bg-white/20 backdrop-blur-md rounded-full text-white">
                      <ZoomIn className="w-5 h-5" />
                    </span>
                  </div>
                </div>

                {/* Text content block */}
                <div className="p-4 flex-1 flex flex-col justify-between">
                  <div>
                    <div className="flex justify-between items-center gap-2 mb-2">
                      <span className={`text-[9px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full border ${badgeColor}`}>
                        {mem.category}
                      </span>
                      <span className="text-[10px] text-neutral-400 inline-flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-rose-400" />
                        {new Date(mem.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                    </div>

                    {mem.createdBy && (
                      <div className="text-[10px] text-rose-200/90 font-sans font-medium mb-1.5 flex items-center gap-1">
                        <span>📸 Captured by: <span className="font-semibold text-rose-300">{mem.createdBy}</span></span>
                      </div>
                    )}

                    <h3 className="font-serif text-base font-semibold text-white mb-1 leading-snug">
                      {mem.title}
                    </h3>
                    <p className="text-xs text-neutral-300 font-sans line-clamp-2">
                      {mem.description}
                    </p>
                  </div>

                  <div className="flex justify-between items-center mt-4 pt-3 border-t border-white/10">
                    <button
                      type="button"
                      onClick={() => handleStartEdit(mem)}
                      className="text-[11px] font-semibold text-rose-300 hover:text-white flex items-center gap-1 cursor-pointer transition-colors"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>Edit moment</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteMemory(mem.id)}
                      className="text-neutral-500 hover:text-rose-400 transition-colors cursor-pointer"
                      title="Delete Memory"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </motion.div>
            );
          })}

          {filteredMemories.length === 0 && (
            <div className="col-span-full bg-white/5 rounded-2xl border border-white/10 p-12 text-center text-neutral-400 font-sans text-sm shadow-sm">
              No memories saved in this category yet. Add a sweet moment using the "Add sweet moment" button above!
            </div>
          )}
        </div>
      ) : (
        /* Carousel View Container */
        <div className="bg-neutral-900/40 border border-white/10 rounded-3xl p-6 relative overflow-hidden shadow-2xl backdrop-blur-md min-h-[450px] flex flex-col justify-between">
          {/* Ambient Background Blur from current active image */}
          {filteredMemories[carouselIndex] && filteredMemories[carouselIndex].type === 'image' && (
            <div 
              className="absolute inset-0 bg-cover bg-center filter blur-3xl opacity-15 scale-110 pointer-events-none transition-all duration-1000"
              style={{ backgroundImage: `url(${filteredMemories[carouselIndex].url})` }}
            />
          )}
          
          {/* Top Bar inside carousel */}
          <div className="flex justify-between items-center border-b border-white/5 pb-4 relative z-10">
            <div className="flex items-center gap-2">
              <span className="p-1.5 bg-rose-500/10 rounded-lg text-rose-400">
                <Film className="w-4 h-4 animate-pulse" />
              </span>
              <span className="text-xs uppercase font-bold tracking-wider text-rose-300">
                Slideshow Mode {filteredMemories.length > 0 ? `(${carouselIndex + 1} of ${filteredMemories.length})` : ''}
              </span>
            </div>
            
            {/* Autoplay toggle */}
            {filteredMemories.length > 1 && (
              <button
                type="button"
                onClick={() => setIsPlaying(!isPlaying)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-all cursor-pointer border ${
                  isPlaying 
                    ? 'bg-rose-500/25 border-rose-500/30 text-rose-300 animate-pulse' 
                    : 'bg-white/5 border-white/10 text-neutral-300 hover:bg-white/10'
                }`}
              >
                {isPlaying ? (
                  <>
                    <Pause className="w-3.5 h-3.5 fill-rose-300 text-rose-300" />
                    <span>Pause Slideshow</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 fill-neutral-300 text-neutral-300" />
                    <span>Auto-play</span>
                  </>
                )}
              </button>
            )}
          </div>

          {/* Main Stage: Transition area */}
          <div className="relative flex-1 flex flex-col md:flex-row items-center gap-6 my-6 min-h-[300px] z-10 justify-center">
            {filteredMemories.length > 1 && (
              /* Left Arrow button */
              <button
                type="button"
                onClick={handlePrev}
                className="absolute left-2 md:relative md:left-0 p-3 bg-black/50 hover:bg-rose-600/90 text-white rounded-full transition-all cursor-pointer border border-white/10 z-20 shadow-lg"
                title="Previous Moment"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
            )}

            {/* Slide Content wrapper */}
            <div className="flex-1 w-full h-full overflow-hidden relative flex flex-col md:flex-row items-center gap-6 justify-center">
              <AnimatePresence mode="wait" custom={direction}>
                {filteredMemories[carouselIndex] ? (
                  <motion.div
                    key={`carousel-mem-${filteredMemories[carouselIndex].id || carouselIndex}-${carouselIndex}`}
                    custom={direction}
                    variants={slideVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={{
                      x: { type: "spring", stiffness: 300, damping: 30 },
                      opacity: { duration: 0.4 },
                      scale: { duration: 0.4 }
                    }}
                    className="w-full h-full flex flex-col md:flex-row items-center gap-6"
                  >
                    {/* Media display */}
                    <div 
                      onClick={() => setSelectedMemory(filteredMemories[carouselIndex])}
                      className="w-full md:w-1/2 aspect-video md:aspect-[4/3] bg-black rounded-2xl overflow-hidden border border-white/10 shadow-lg cursor-pointer relative group shrink-0"
                    >
                      {filteredMemories[carouselIndex].type === 'image' ? (
                        <img
                          src={filteredMemories[carouselIndex].url}
                          alt={filteredMemories[carouselIndex].title}
                          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="relative w-full h-full">
                          <video
                            src={filteredMemories[carouselIndex].url}
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                            <Film className="w-10 h-10 text-white drop-shadow" />
                          </div>
                        </div>
                      )}
                      <div className="absolute inset-0 bg-black/25 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <span className="p-2 bg-white/20 backdrop-blur-md rounded-full text-white">
                          <ZoomIn className="w-5 h-5" />
                        </span>
                      </div>
                    </div>

                    {/* Details Display */}
                    <div className="flex-1 text-left flex flex-col justify-between h-full space-y-4">
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`text-[9px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full border ${
                            filteredMemories[carouselIndex].category === 'birthday' ? 'bg-pink-500/10 text-pink-300 border border-pink-500/20' :
                            filteredMemories[carouselIndex].category === 'engagement' ? 'bg-amber-500/10 text-amber-300 border border-amber-500/20' :
                            filteredMemories[carouselIndex].category === 'other' ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20' :
                            'bg-rose-500/10 text-rose-300 border border-rose-500/20'
                          }`}>
                            {filteredMemories[carouselIndex].category}
                          </span>
                          <span className="text-xs text-neutral-400 inline-flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5 text-rose-400" />
                            {new Date(filteredMemories[carouselIndex].date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                          </span>
                        </div>

                        {filteredMemories[carouselIndex].createdBy && (
                          <div className="text-xs text-rose-200/95 font-sans font-medium flex items-center gap-1">
                            <span>📸 Captured by: <span className="font-semibold text-rose-300">{filteredMemories[carouselIndex].createdBy}</span></span>
                          </div>
                        )}

                        <h3 className="font-serif text-xl sm:text-2xl font-semibold text-white leading-tight">
                          {filteredMemories[carouselIndex].title}
                        </h3>
                        <p className="text-xs sm:text-sm text-neutral-300 leading-relaxed font-sans font-light">
                          {filteredMemories[carouselIndex].description}
                        </p>
                      </div>

                      <div className="flex justify-between items-center pt-4 border-t border-white/5">
                        <button
                          type="button"
                          onClick={() => handleStartEdit(filteredMemories[carouselIndex])}
                          className="text-xs font-semibold text-rose-300 hover:text-white flex items-center gap-1 cursor-pointer transition-colors"
                        >
                          <Edit3 className="w-4 h-4" />
                          <span>Edit moment</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            onDeleteMemory(filteredMemories[carouselIndex].id);
                            if (carouselIndex > 0) setCarouselIndex(carouselIndex - 1);
                          }}
                          className="text-neutral-500 hover:text-rose-400 transition-colors cursor-pointer"
                          title="Delete Memory"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                ) : (
                  <div className="w-full text-center py-12 text-neutral-400 font-sans text-sm">
                    No memories saved in this category yet. Add a sweet moment above to get started!
                  </div>
                )}
              </AnimatePresence>
            </div>

            {filteredMemories.length > 1 && (
              /* Right Arrow button */
              <button
                type="button"
                onClick={handleNext}
                className="absolute right-2 md:relative md:right-0 p-3 bg-black/50 hover:bg-rose-600/90 text-white rounded-full transition-all cursor-pointer border border-white/10 z-20 shadow-lg"
                title="Next Moment"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            )}
          </div>

          {/* Bottom Dots Indicator */}
          {filteredMemories.length > 0 && (
            <div className="flex justify-center items-center gap-1.5 pt-4 border-t border-white/5 relative z-10">
              {filteredMemories.map((_, idx) => (
                <button
                  key={`vault-carousel-dot-${idx}`}
                  type="button"
                  onClick={() => {
                    setDirection(idx > carouselIndex ? 1 : -1);
                    setCarouselIndex(idx);
                  }}
                  className={`h-2 rounded-full transition-all duration-300 cursor-pointer ${
                    idx === carouselIndex ? 'w-6 bg-rose-500' : 'w-2 bg-white/20 hover:bg-white/40'
                  }`}
                  title={`Go to slide ${idx + 1}`}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Lightbox / Fullscreen Modal */}
      <AnimatePresence>
        {selectedMemory && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSelectedMemory(null)}
            className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4 backdrop-blur-md"
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-neutral-900 rounded-3xl overflow-hidden max-w-3xl w-full max-h-[90vh] flex flex-col md:flex-row relative shadow-2xl border border-white/10"
            >
              {/* Close button */}
              <button
                onClick={() => setSelectedMemory(null)}
                className="absolute top-4 right-4 z-10 p-2 bg-black/40 text-white rounded-full hover:bg-rose-600 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>

              {/* Media viewer left */}
              <div className="md:w-3/5 bg-black flex items-center justify-center aspect-video md:aspect-auto">
                {selectedMemory.type === 'image' ? (
                  <img
                    src={selectedMemory.url}
                    alt={selectedMemory.title}
                    className="w-full h-full object-contain max-h-[50vh] md:max-h-[80vh]"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <video
                    src={selectedMemory.url}
                    controls
                    autoPlay
                    className="w-full h-full object-contain max-h-[50vh] md:max-h-[80vh]"
                  />
                )}
              </div>

              {/* Detail list right */}
              <div className="md:w-2/5 p-6 sm:p-8 flex flex-col justify-between bg-neutral-900 text-white">
                <div>
                  <div className="flex gap-2 items-center mb-4">
                    <span className="text-xs uppercase font-bold tracking-wider px-2.5 py-0.5 rounded-full bg-rose-500/10 text-rose-300 border border-rose-500/20">
                      {selectedMemory.category}
                    </span>
                    <span className="text-xs text-neutral-400 font-medium inline-flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-rose-400" />
                      {new Date(selectedMemory.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                    </span>
                  </div>

                  <h3 className="font-serif text-2xl font-semibold text-white mb-3 leading-snug">
                    {selectedMemory.title}
                  </h3>
                  <p className="text-sm text-neutral-300 leading-relaxed font-sans">
                    {selectedMemory.description}
                  </p>
                </div>

                <div className="mt-6 pt-4 border-t border-white/10 flex items-center gap-2 text-rose-400 font-sans text-xs font-semibold">
                  <Heart className="w-4 h-4 fill-rose-400" />
                  <span>A beautiful piece of our story</span>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Template & Gallery Images Browser Modal */}
      <AnimatePresence>
        {showGallery && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4 backdrop-blur-md"
            onClick={() => setShowGallery(false)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-neutral-900 border border-white/10 rounded-3xl max-w-2xl w-full max-h-[88vh] overflow-hidden flex flex-col shadow-2xl"
            >
              {/* Header */}
              <div className="p-5 border-b border-white/10 flex justify-between items-center bg-white/5">
                <div>
                  <h3 className="font-serif text-lg font-medium text-white flex items-center gap-2">
                    <Heart className="w-5 h-5 text-rose-500 fill-rose-500/20" />
                    Select Image From Gallery 📸
                  </h3>
                  <p className="text-[11px] text-neutral-400 mt-0.5 font-sans">
                    Choose from all uploaded photos across Scrapbook, Milestones, Sweet Chat, and Preset Templates
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowGallery(false)}
                  className="p-1.5 bg-white/5 hover:bg-rose-600 rounded-full text-white transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Filter Tabs & Search Bar */}
              <div className="p-4 border-b border-white/5 bg-neutral-950/40 space-y-3">
                <HorizontalScrollWrapper scrollContainerClassName="gap-1.5 py-0.5">
                  {[
                    { id: 'all', label: `All (${gallerySourceImages.length})` },
                    { id: 'scrapbook', label: `Scrapbook (${gallerySourceImages.filter(i=>i.source==='scrapbook').length})` },
                    { id: 'milestones', label: `Milestones (${gallerySourceImages.filter(i=>i.source==='milestones').length})` },
                    { id: 'chat', label: `Chat (${gallerySourceImages.filter(i=>i.source==='chat').length})` },
                    { id: 'templates', label: `Presets (${gallerySourceImages.filter(i=>i.source==='templates').length})` }
                  ].map((tab, idx) => (
                    <button
                      key={`gallery-picker-tab-${tab.id}-${idx}`}
                      type="button"
                      onClick={() => setTemplateFilter(tab.id as any)}
                      className={`px-3 py-1 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                        templateFilter === tab.id
                          ? 'bg-rose-600 text-white shadow'
                          : 'bg-white/5 text-neutral-400 hover:text-white hover:bg-white/10'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </HorizontalScrollWrapper>

                <input
                  type="text"
                  value={templateSearch}
                  onChange={(e) => setTemplateSearch(e.target.value)}
                  placeholder="Search photo title or source..."
                  className="w-full px-3 py-1.5 text-xs bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:ring-1 focus:ring-rose-400 text-white placeholder-neutral-500"
                />
              </div>

              {/* Grid content */}
              <div className="p-5 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 gap-3.5 max-h-[55vh]">
                {filteredGalleryImages.length === 0 ? (
                  <div className="col-span-full py-12 text-center text-neutral-500 text-xs">
                    No images found matching your search.
                  </div>
                ) : (
                  filteredGalleryImages.map((img, index) => (
                    <button
                      key={`vault-img-${img.id || index}-${index}`}
                      type="button"
                      onClick={() => {
                        setFormMediaBase64(img.path);
                        setFormMediaType('image');
                        setShowGallery(false);
                      }}
                      className="group relative aspect-square rounded-2xl overflow-hidden border border-white/10 hover:border-rose-500 bg-neutral-950 transition-all text-left flex flex-col cursor-pointer shadow-md"
                    >
                      <img
                        src={img.path}
                        alt={img.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        referrerPolicy="no-referrer"
                      />
                      
                      {/* Badge indicating image origin */}
                      <div className="absolute top-2 left-2 z-10">
                        <span className={`text-[9px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full backdrop-blur-md shadow-sm border ${
                          img.source === 'scrapbook'
                            ? 'bg-amber-950/80 text-amber-300 border-amber-500/30'
                            : img.source === 'milestones'
                            ? 'bg-pink-950/80 text-pink-300 border-pink-500/30'
                            : img.source === 'chat'
                            ? 'bg-purple-950/80 text-purple-300 border-purple-500/30'
                            : 'bg-rose-950/80 text-rose-300 border-rose-500/30'
                        }`}>
                          {img.sourceName}
                        </span>
                      </div>

                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent p-2.5 pt-6">
                        <span className="text-[10px] font-semibold text-white drop-shadow truncate block font-sans">
                          {img.name}
                        </span>
                      </div>
                    </button>
                  ))
                )}
              </div>

              {/* Footer / close */}
              <div className="p-4 border-t border-white/10 flex justify-between items-center bg-white/5">
                <span className="text-[11px] text-neutral-400">
                  Showing {filteredGalleryImages.length} images
                </span>
                <button
                  type="button"
                  onClick={() => setShowGallery(false)}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-semibold transition-all cursor-pointer border border-rose-500/25 font-sans"
                >
                  Close Browser
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default MemoryVault;
