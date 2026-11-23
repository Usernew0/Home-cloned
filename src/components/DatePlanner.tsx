import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Calendar, MapPin, Clock, Plus, Trash2, CheckSquare, 
  Square, Edit3, Save, Sparkles, Filter, CheckCircle2,
  ListTodo, Info, Heart, ChevronRight, Phone
} from 'lucide-react';
import { DatePlan, DateIdea, Milestone, SubscriptionTier } from '../types';
import { PRE_SEEDED_DATE_IDEAS } from '../utils';
import { DateCountdown } from './DateCountdown';
import { AIDateGenerator } from './AIDateGenerator';
import { HorizontalScrollWrapper } from './HorizontalScrollWrapper';


// Romantic Custom Date Generator with rich variety, focused exclusively on Alexandria, Egypt!
const getCustomDateSuggestion = (occasion: string, vibe: string, budget: string) => {
  const occasionLabels: Record<string, string> = {
    first_date: 'Magical First Connection 💖',
    anniversary: 'Golden Milestone Celebration 🌹',
    birthday: 'Celestial Birthday Special 🎂',
    surprise: 'Mystery Heartbeat Surprise 🎁',
    double_date: 'Double-Couple Fun Fest 👥',
    casual: 'Cozy Couple Escape 🍿'
  };

  const vibeLabels: Record<string, string> = {
    cozy: 'Warm, Comfy & Intimate Vibe ☕️',
    elegant: 'Fancy, Glamorous & Sophisticated Vibe 🌹',
    thrilling: 'Adventurous, Thrilling & Active Vibe 🗺️',
    playful: 'Fun, Teasing & Creative Vibe 🎨',
    dreamy: 'Whimsical, Celestial & Romantic Vibe ✨'
  };

  const budgetGuides: Record<string, string> = {
    '$': 'Sweet & Budget-Friendly ($)',
    '$$': 'Beautifully Comfortable ($$)',
    '$$$': 'Luxurious & Exquisite ($$$)'
  };

  // Multiple high-quality romantic Alexandria dates per vibe for beautiful variety on every click!
  const alexandriaDatePool: Record<string, Array<{ title: string; description: string; duration: string; activity: string; checklist: string[]; notes: string }>> = {
    cozy: [
      {
        title: 'Corniche Sunset Corn & Tea Stroll 🌅',
        description: 'Walk together along the beautiful Alexandria Corniche near Camp Shezar as the sun begins to set. Buy warm roasted corn or baked sweet potato from street vendors, find a quiet spot on the sea wall, and enjoy traditional hot mint tea while watching the Mediterranean waves crash.',
        duration: '2 hours',
        activity: 'Scenic coastal stroll & warm treats',
        checklist: ['Wear comfy sneakers for walking', 'Bring small change for the local batata and tea vendors', 'Bring a light jacket because the sea breeze gets chilly after sunset'],
        notes: 'Alexandria is famous for its romantic sea breeze. Slip your hand into theirs to keep warm.'
      },
      {
        title: 'Fouad Street Vintage Café & Nostalgic Chat ☕️',
        description: 'Meet up on Fouad Street—the oldest street in Alexandria. Step into a beautiful, quiet vintage café (like Trianon or L\'Étoile) and share warm French-style pastries and specialty lattes. Spend hours talking surrounded by classical European architecture.',
        duration: '2.5 hours',
        activity: 'Vintage coffee shop conversation & pastries',
        checklist: ['Dress in elegant, warm smart-casual style', 'Ask for a quiet table corner away from speakers', 'Write a small compliment on a paper napkin and slide it over'],
        notes: 'Fouad Street has a magical European soul that inspires the most heartfelt conversations.'
      },
      {
        title: 'Gleem Bay Wave-Watching at Latino 🌊',
        description: 'Get a window table at Latino Cafe or a cozy café in Gleem Bay. Order warm chocolate soufflé and hot mint tea, and watch the spectacular Mediterranean waves crash directly on the thick protective glass windows while listening to Fayrouz songs.',
        duration: '3 hours',
        activity: 'Cozy wave-watching & sweet dessert sharing',
        checklist: ['Ask for a direct wave-view glass booth', 'Bring a small booklet of poetry or conversation starters', 'Enjoy looking into each other’s eyes as the sea storms outside'],
        notes: 'Cozy, warm, and absolutely mesmerizing—the close-up view of the sea is therapeutic.'
      },
      {
        title: 'Sidi Bishr Sunset Batata Picnic 🍠',
        description: 'Take a relaxed walk on the beach wall in Sidi Bishr during golden hour. Buy hot freshly-baked sweet potatoes topped with chocolate or honey, find a peaceful bench overlooking the waves, and enjoy simple, pure happiness together.',
        duration: '1.5 hours',
        activity: 'Humble sweet potato treat & beach sunset',
        checklist: ['Bring wet wipes to clean your hands afterward', 'Wear a warm scarf for the beach breeze', 'Prepare a sweet question to ask about their favorite childhood memory'],
        notes: 'Simple, rustic, and incredibly romantic—a true Alexandrian staple.'
      }
    ],
    elegant: [
      {
        title: 'Greek Club Seafront Fine Dining 🍽️',
        description: 'Celebrate your love at White & Blue (The Greek Club) in Anfoushi. Enjoy an exquisite Mediterranean seafood dinner right above the crashing waves with a breathtaking, unobstructed view of the Eastern Harbour and the lit-up Qaitbay Citadel.',
        duration: '3.5 hours',
        activity: 'Seaside seafood fine dining & scenic night view',
        checklist: ['Secure a seaside window table reservation well in advance', 'Coordinate matching formal outfits', 'Prepare a handwritten sealed love letter to exchange during dessert'],
        notes: 'The view of the Citadel of Qaitbay sparkling over the dark sea is one of the most cinematic sights in Egypt.'
      },
      {
        title: 'San Giovanni Sea-View Grand Piano Dinner 🎹',
        description: 'Book a classic window table at the legendary San Giovanni Restaurant right above Stanley’s sea bay. Savor gourmet continental dining while a live pianist plays romantic tunes and the soothing sound of crashing waves fills the air.',
        duration: '3 hours',
        activity: 'Gourmet dining & live piano over Stanley Bay',
        checklist: ['Book a window seat table with a direct view of Stanley Bridge', 'Wear elegant evening attire', 'Request a classic romantic song from the live pianist'],
        notes: 'San Giovanni is a historical beacon of Alexandrian elegance, perfect for celebrating major milestones.'
      },
      {
        title: 'Stefano’s Italian Fine Dining at Four Seasons 🌹',
        description: 'Experience premium Italian elegance at Stefano’s in the Four Seasons San Stefano. Share wood-fired gourmet seafood pizza, handcrafted pasta, and exquisite desserts in a quiet, highly romantic candlelit atmosphere.',
        duration: '3 hours',
        activity: 'High-end Italian dining & romantic celebration',
        checklist: ['Reserve a quiet corner booth table', 'Prepare a beautiful small surprise gift box', 'Enjoy the flawless world-class service and luxury ambiance'],
        notes: 'Perfect for making your partner feel like absolute royalty on a special evening.'
      }
    ],
    thrilling: [
      {
        title: 'Sunrise Corniche Cycling & Mohamed Ahmed Feast 🚲',
        description: 'Wake up early and surprise your sweetheart with an invigorating sunrise bicycle ride along the quiet Corniche from Gleem to Selsela. Conclude the ride with the ultimate traditional Alexandrian breakfast (Foul, Falafel, and spicy Shakshouka) at the historic Mohamed Ahmed Restaurant in Raml Station.',
        duration: '3 hours',
        activity: 'Early morning sea cycling & legendary breakfast feast',
        checklist: ['Arrange bicycle rentals the night before', 'Ensure they wear comfortable athletic wear', 'Order their legendary Falafel stuffed with spicy onions'],
        notes: 'Watching the morning mist clear over the Alexandrian sea is a refreshing and memorable surprise.'
      },
      {
        title: 'Sailing Adventure on Selsela Waves ⛵',
        description: 'Head to the Selsela area or the Eastern Harbour Yacht Club and board a private sailing felucca. Feel the wind in your hair and spray of the sea as the captain sails across the harbor, giving you a thrilling close-up view of Qaitbay Citadel from the open sea.',
        duration: '2.5 hours',
        activity: 'Breezy harbor sailing & sea spray exploration',
        checklist: ['Coordinate with a boat captain a day ahead', 'Wear light windbreakers as it gets windy', 'Bring some music on a portable speaker'],
        notes: 'A lively, refreshing, and adventurous way to experience the historic harbor.'
      },
      {
        title: 'Qaitbay Citadel Medieval Watchtowers Exploration 🏰',
        description: 'Explore the spectacular medieval halls, stone tunnels, and high watchtowers of the Citadel of Qaitbay. Stand together on the highest fort tower, looking through the ancient arrow slits at the vast Mediterranean sea stretching out before you.',
        duration: '2 hours',
        activity: 'Historic castle exploration & high-point views',
        checklist: ['Buy entry tickets at the gate', 'Take funny photos in the dark stone dungeons', 'Walk along the outer seawalls afterward'],
        notes: 'Built in the 15th century on the exact site of the ancient Lighthouse of Alexandria, the fort is loaded with historic energy.'
      }
    ],
    playful: [
      {
        title: 'Tivoli Dome Neon Bowling & Arcade Showdown 🎳',
        description: 'Enjoy legendary Alexandrian ice cream at El-Saeedy or Azza in Gleem. Afterward, walk over to Tivoli Dome for a playful session of neon bowling, basketball shootout, and arcade games, sharing a delicious dessert over the open-air marina view.',
        duration: '2.5 hours',
        activity: 'Ice cream tasting & friendly arcade challenge',
        checklist: ['Pick your favorite flavor (mastic or mango)', 'Set a playful stake (loser buys the waffles!)', 'Take silly selfies with the glowing bowling pins'],
        notes: 'A perfect low-pressure, highly-playful evening full of smiles and sweet treats.'
      },
      {
        title: 'Alexandria Vintage Tram Nostalgia Trip 🚃',
        description: 'Hop on the double-decker yellow tram of Alexandria! Secure the front seats on the top deck and ride all the way from San Stefano to Raml Station, looking down at the lively city. Challenge each other to find the most unique vintage shop sign along the way.',
        duration: '2 hours',
        activity: 'Top-deck tram ride & retro street spotting',
        checklist: ['Keep small cash for the tram tickets', 'Get off at Raml station and buy warm traditional sahlab', 'Take funny vintage-style photos through the tram windows'],
        notes: 'One of the oldest tramways in the world, it offers a beautifully playful and nostalgic tour of Alexandria.'
      },
      {
        title: 'Nabi Daniel Street Book Hunt & Mystery Postcard 📚',
        description: 'Browse the open-air book stalls of Nabi Daniel Street. Give each other a budget of 50 EGP and 15 minutes to find the most interesting, funniest, or sweetest vintage book or postcard to gift to the other, then read them together at a juice bar.',
        duration: '2 hours',
        activity: 'Playful street book-finding & reading challenge',
        checklist: ['Look for vintage books with beautiful cover designs', 'Write a custom secret message inside the book cover', 'Grab fresh mango juice at a local stand'],
        notes: 'A highly engaging and artistic date that reveals new things about your partner’s mind.'
      }
    ],
    dreamy: [
      {
        title: 'Montazah Tea Island & Red Bridge Walk 🌲',
        description: 'Surprise your partner with a date inside the royal Montazah Palace Gardens. Walk through the lush Mediterranean pine forests, cross the historic red El-Montazah Bridge to Tea Island, and celebrate with warm tea and a sweet bite at the island cafe over private rocky coves.',
        duration: '3.5 hours',
        activity: 'Royal gardens walk, red bridge crossing & sea-cove views',
        checklist: ['Wear nice outfits for photos under the royal palms', 'Bring a mini instant camera for classic memories', 'Sit by the edge of Tea Island and watch the waves sweep over the rocks'],
        notes: 'Built for kings, the Montazah gardens offer unmatched botanical beauty and ocean majesty.'
      },
      {
        title: 'Private Felucca Sunset Sailing & Toast 🥂',
        description: 'Rent a private sailing felucca boat from the Eastern Harbour for a golden hour cruise. Play a custom acoustic love playlist, take gorgeous photos, and raise a non-alcoholic sparkling juice toast as the sun melts into the Mediterranean.',
        duration: '3 hours',
        activity: 'Private boat cruise & sunset celebration on the waves',
        checklist: ['Book the private boat captain a day ahead', 'Prepare a beautiful fresh fruit and cheese platter to bring along', 'Pack a warm blanket to wrap around each other when the sun dips'],
        notes: 'One of the most breathtaking, cinematic anniversary experiences you will ever share.'
      },
      {
        title: 'Selsela Sunset Promenade & Star Watching ✨',
        description: 'Meet at the Selsela promenade right at the start of sunset. Sit close together on the rocky ledge, listen to the whisper of the waves, and watch the orange sky turn into a deep purple starry night over the vast sea.',
        duration: '2 hours',
        activity: 'Sunset sea meditation & stargazing',
        checklist: ['Bring a thermos of hot cinnamon tea', 'Use a stargazing app to identify constellations', 'Whisper 3 things you love most about your partner into the night'],
        notes: 'The Selsela point gives an unobstructed 270-degree view of the sea and sky, making it exceptionally romantic.'
      }
    ]
  };

  // 1. Find matching options for the selected vibe
  const matchingPool = alexandriaDatePool[vibe] || alexandriaDatePool['cozy'];
  
  // 2. Randomly select one item from the pool to guarantee variety upon multiple clicks!
  const randomIndex = Math.floor(Math.random() * matchingPool.length);
  const selectedDate = matchingPool[randomIndex];

  const title = selectedDate.title;
  const description = `A beautiful custom romantic date in Alexandria, Egypt curated for a ${occasionLabels[occasion]}. You will be heading out for a "${selectedDate.title}", perfectly matching a ${vibeLabels[vibe]} on a ${budgetGuides[budget]} budget. \n\n${selectedDate.description}`;

  return {
    title: selectedDate.title,
    description: description,
    duration: selectedDate.duration,
    activity: `${vibeLabels[vibe]} activity: ${selectedDate.activity}`,
    checklist: selectedDate.checklist,
    notes: selectedDate.notes
  };
};

interface DatePlannerProps {
  datePlans: DatePlan[];
  onAddDatePlan: (plan: DatePlan) => void;
  onUpdateDatePlan: (updated: DatePlan) => void;
  onDeleteDatePlan: (id: string) => void;
  currentUser: string;
  milestones: Milestone[];
  activeSubTab?: 'scheduler' | 'ideas';
  onSubTabChange?: (tab: 'scheduler' | 'ideas') => void;
  userPlan?: SubscriptionTier;
  onOpenUpgradeModal?: () => void;
}

export const DatePlanner: React.FC<DatePlannerProps> = ({
  datePlans,
  onAddDatePlan,
  onUpdateDatePlan,
  onDeleteDatePlan,
  currentUser,
  milestones,
  activeSubTab,
  onSubTabChange,
  userPlan = 'free',
  onOpenUpgradeModal
}) => {

  const [internalTab, setInternalTab] = useState<'scheduler' | 'ideas'>('scheduler');
  
  const activeTab = activeSubTab !== undefined ? activeSubTab : internalTab;
  const setActiveTab = (tab: 'scheduler' | 'ideas') => {
    if (onSubTabChange) {
      onSubTabChange(tab);
    } else {
      setInternalTab(tab);
    }
  };

  const [filterStatus, setFilterStatus] = useState<'all' | 'planned' | 'completed'>('all');
  const [filterOccasion, setFilterOccasion] = useState<string>('all');
  
  // Dynamic Suggestion Engine State
  const [sugOccasion, setSugOccasion] = useState<'first_date' | 'anniversary' | 'birthday' | 'surprise' | 'double_date' | 'casual'>('casual');
  const [sugVibe, setSugVibe] = useState<'cozy' | 'elegant' | 'thrilling' | 'playful' | 'dreamy'>('cozy');
  const [sugBudget, setSugBudget] = useState<'$' | '$$' | '$$$'>('$$');
  const [suggestedResult, setSuggestedResult] = useState<any | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [sugDateTime, setSugDateTime] = useState('');
  const [sugLocation, setSugLocation] = useState('To be decided together');

  // Form State
  const [isAdding, setIsAdding] = useState(false);
  const [formTitle, setFormTitle] = useState('');
  const [formCategory, setFormCategory] = useState<'dinner' | 'adventure' | 'home' | 'budget' | 'other'>('dinner');
  const [formOccasion, setFormOccasion] = useState<'first_date' | 'anniversary' | 'birthday' | 'surprise' | 'double_date' | 'casual' | 'other'>('casual');
  const [formTheme, setFormTheme] = useState('Cozy & Warm ☕️');
  const [customThemeInput, setCustomThemeInput] = useState('');
  const [formDateTime, setFormDateTime] = useState('');
  const [formLocation, setFormLocation] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formChecklist, setFormChecklist] = useState<string[]>(['']);

  // Suggestion handlers
  const handleTriggerSuggestion = () => {
    setIsGenerating(true);
    setSuggestedResult(null);
    setTimeout(() => {
      const result = getCustomDateSuggestion(sugOccasion, sugVibe, sugBudget);
      setSuggestedResult(result);
      
      // Initialize suggested date and time to 3 days from now at 7:00 PM
      const defaultDate = new Date();
      defaultDate.setDate(defaultDate.getDate() + 3);
      defaultDate.setHours(19, 0, 0, 0);
      const year = defaultDate.getFullYear();
      const month = String(defaultDate.getMonth() + 1).padStart(2, '0');
      const day = String(defaultDate.getDate()).padStart(2, '0');
      const hours = String(defaultDate.getHours()).padStart(2, '0');
      const minutes = String(defaultDate.getMinutes()).padStart(2, '0');
      setSugDateTime(`${year}-${month}-${day}T${hours}:${minutes}`);
      setSugLocation('To be decided together');
      
      setIsGenerating(false);
    }, 1200); // simulated curation
  };

  const handleAddSuggestedDate = (sug: any) => {
    const finalDateTime = sugDateTime || new Date().toISOString().slice(0, 16);

    const newPlan: DatePlan = {
      id: 'plan-' + Date.now(),
      title: sug.title,
      category: sugOccasion === 'first_date' ? 'other' : 'adventure',
      occasion: sugOccasion,
      theme: sugVibe.charAt(0).toUpperCase() + sugVibe.slice(1) + ' & Romantic',
      dateTime: finalDateTime,
      location: sugLocation || 'To be decided together',
      description: sug.description,
      checklist: sug.checklist.map((item: string, idx: number) => ({
        id: `sug-item-${idx}-${Date.now()}`,
        text: item,
        completed: false
      })),
      notes: sug.notes,
      status: 'planned'
    };

    onAddDatePlan(newPlan);
    setActiveTab('scheduler');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setSuggestedResult(null);
  };

  // Handle preset date idea addition
  const handleAddPresetIdea = (idea: DateIdea) => {
    const defaultDate = new Date();
    defaultDate.setDate(defaultDate.getDate() + 7); // Default to 7 days from now
    const formattedDate = defaultDate.toISOString().slice(0, 16); // YYYY-MM-DDTHH:MM

    const newPlan: DatePlan = {
      id: 'plan-' + Date.now(),
      title: idea.title,
      category: idea.category,
      occasion: idea.occasion || 'casual',
      theme: idea.theme || 'Cozy & Warm ☕️',
      dateTime: formattedDate,
      location: idea.category === 'home' ? 'Our Cozy Living Room' : 'To be chosen together',
      description: idea.description,
      checklist: [
        { id: '1', text: 'Confirm date & time with my partner', completed: false },
        { id: '2', text: 'Set a cute reminder on our calendar', completed: false }
      ],
      notes: `Suggested duration: ${idea.duration}. Suggested budget: ${idea.cost}. Special details: ${idea.activity}.`,
      status: 'planned'
    };
    
    onAddDatePlan(newPlan);
    setActiveTab('scheduler');
    
    // Highlight or scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleAddChecklistField = () => {
    setFormChecklist([...formChecklist, '']);
  };

  const handleRemoveChecklistField = (index: number) => {
    const list = [...formChecklist];
    list.splice(index, 1);
    setFormChecklist(list);
  };

  const handleChecklistFieldChange = (index: number, val: string) => {
    const list = [...formChecklist];
    list[index] = val;
    setFormChecklist(list);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim()) return;

    const checklistItems = formChecklist
      .filter(item => item.trim() !== '')
      .map((item, idx) => ({
        id: `item-${idx}-${Date.now()}`,
        text: item.trim(),
        completed: false
      }));

    const finalTheme = formTheme === 'custom' ? customThemeInput : formTheme;

    const newPlan: DatePlan = {
      id: 'plan-' + Date.now(),
      title: formTitle,
      category: formCategory,
      occasion: formOccasion,
      theme: finalTheme || 'Cozy',
      dateTime: formDateTime || new Date().toISOString().slice(0, 16),
      location: formLocation || 'Decided together',
      description: formDesc,
      checklist: checklistItems,
      notes: formNotes,
      status: 'planned'
    };

    onAddDatePlan(newPlan);
    resetForm();
  };

  const resetForm = () => {
    setFormTitle('');
    setFormCategory('dinner');
    setFormOccasion('casual');
    setFormTheme('Cozy & Warm ☕️');
    setCustomThemeInput('');
    setFormDateTime('');
    setFormLocation('');
    setFormDesc('');
    setFormNotes('');
    setFormChecklist(['']);
    setIsAdding(false);
  };

  const handleToggleChecklistItem = (plan: DatePlan, itemId: string) => {
    const currentChecklist = plan.checklist || [];
    const updatedChecklist = currentChecklist.map(item => {
      if (item.id === itemId) {
        return { ...item, completed: !item.completed };
      }
      return item;
    });

    onUpdateDatePlan({
      ...plan,
      checklist: updatedChecklist
    });
  };

  const handleTogglePlanStatus = (plan: DatePlan) => {
    const nextStatus = plan.status === 'planned' ? 'completed' : 'planned';
    onUpdateDatePlan({
      ...plan,
      status: nextStatus
    });
  };

  // Filter schedules
  const filteredPlans = datePlans.filter(p => {
    const matchesStatus = filterStatus === 'all' || p.status === filterStatus;
    const matchesOccasion = filterOccasion === 'all' || p.occasion === filterOccasion;
    return matchesStatus && matchesOccasion;
  });

  return (
    <div className="w-full max-w-4xl mx-auto px-4 py-4 font-sans">
      
      {/* Category selector */}
      <div className="mb-8 max-w-xl mx-auto">
        <HorizontalScrollWrapper scrollContainerClassName="border border-white/10 p-1 bg-white/5 rounded-2xl w-full gap-1">
          <button
            id="btn-tab-scheduler"
            onClick={() => setActiveTab('scheduler')}
            className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-semibold transition-all cursor-pointer inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 ${
              activeTab === 'scheduler'
                ? 'bg-rose-600 text-white shadow-sm border border-rose-500/20'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            <Calendar className="w-4 h-4" />
            Our Date Scheduler
          </button>
          <button
            id="btn-tab-ideas"
            onClick={() => setActiveTab('ideas')}
            className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-semibold transition-all cursor-pointer inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 ${
              activeTab === 'ideas'
                ? 'bg-rose-600 text-white shadow-sm border border-rose-500/20'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            Romantic Ideas
          </button>
        </HorizontalScrollWrapper>
      </div>

      <AnimatePresence mode="wait">
        {activeTab === 'ideas' ? (
          /* IDEAS CABINET VIEW */
          <motion.div
            key="ideas-tab"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-6"
          >
            {/* AI Date Night Itinerary Generator */}
            <AIDateGenerator
              userPlan={userPlan}
              onOpenUpgradeModal={onOpenUpgradeModal || (() => {})}
              onAddPlan={(newPlan) => {
                onAddDatePlan(newPlan);
                setActiveTab('scheduler');
              }}
            />

            <div className="text-center mb-8">
              <h2 className="font-serif text-2xl md:text-3xl text-white font-medium tracking-tight mb-2">
                Need Romantic Date Ideas?
              </h2>
              <p className="text-xs sm:text-sm text-neutral-400 max-w-md mx-auto">
                Use our romantic matchmaker to generate tailored, themed plans, or browse our curated collection of sweet couple activities below.
              </p>
            </div>

            {/* INTERACTIVE ROMANTIC MATCHMAKER */}
            <div className="bg-gradient-to-br from-rose-950/40 to-neutral-900/60 p-6 sm:p-8 rounded-3xl border border-rose-500/10 shadow-xl space-y-6">
              <div className="flex items-center gap-2 mb-2">
                <div className="p-2 bg-rose-500/10 rounded-xl border border-rose-500/20 text-rose-400">
                  <Sparkles className="w-5 h-5 animate-pulse" />
                </div>
                <div>
                  <h3 className="font-serif text-lg font-semibold text-white">Interactive Romantic Matchmaker</h3>
                  <p className="text-[11px] text-neutral-400">Answer 3 simple prompts to curate the ultimate date night theme & checklist</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-white/5 p-4 rounded-2xl border border-white/5">
                {/* Occasion Option selector */}
                <div>
                  <label className="block text-[10px] uppercase font-bold tracking-wider text-rose-300 mb-1.5">1. Pick Occasion</label>
                  <select
                    value={sugOccasion}
                    onChange={(e) => setSugOccasion(e.target.value as any)}
                    className="w-full px-3 py-2 text-xs bg-neutral-900 border border-white/10 rounded-xl focus:outline-none focus:ring-1 focus:ring-rose-400 text-white"
                  >
                    <option value="casual">Casual Vibe 🍿</option>
                    <option value="first_date">First Date 💖</option>
                    <option value="anniversary">Anniversary 🌹</option>
                    <option value="birthday">Birthday 🎂</option>
                    <option value="surprise">Surprise 🎁</option>
                    <option value="double_date">Double Date 👥</option>
                  </select>
                </div>

                {/* Vibe Option selector */}
                <div>
                  <label className="block text-[10px] uppercase font-bold tracking-wider text-rose-300 mb-1.5">2. Select Vibe & Theme</label>
                  <select
                    value={sugVibe}
                    onChange={(e) => setSugVibe(e.target.value as any)}
                    className="w-full px-3 py-2 text-xs bg-neutral-900 border border-white/10 rounded-xl focus:outline-none focus:ring-1 focus:ring-rose-400 text-white"
                  >
                    <option value="cozy">Cozy & Comfy ☕️</option>
                    <option value="elegant">Elegant & Sophisticated 🌹</option>
                    <option value="thrilling">Adventurous & Active 🗺️</option>
                    <option value="playful">Fun & Playful 🎨</option>
                    <option value="dreamy">Whimsical & Celestial ✨</option>
                  </select>
                </div>

                {/* Budget Option selector */}
                <div>
                  <label className="block text-[10px] uppercase font-bold tracking-wider text-rose-300 mb-1.5">3. Decide Budget</label>
                  <div className="flex bg-neutral-950 p-1 rounded-xl border border-white/10 h-9">
                    {(['$', '$$', '$$$'] as const).map((b, idx) => (
                      <button
                        key={`budget-btn-${b}-${idx}`}
                        type="button"
                        onClick={() => setSugBudget(b)}
                        className={`flex-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                          sugBudget === b
                            ? 'bg-rose-600 text-white shadow-sm'
                            : 'text-neutral-400 hover:text-white'
                        }`}
                      >
                        {b === '$' ? 'Free/Low' : b === '$$' ? 'Moderate' : 'Premium'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={handleTriggerSuggestion}
                  disabled={isGenerating}
                  className="w-full sm:w-auto px-6 py-3 bg-rose-600 hover:bg-rose-700 disabled:bg-rose-900/40 text-white text-xs font-bold rounded-xl border border-rose-500/20 shadow-md shadow-rose-950/25 inline-flex items-center justify-center gap-2 transition-all cursor-pointer"
                >
                  <Sparkles className={`w-4 h-4 ${isGenerating ? 'animate-spin' : ''}`} />
                  {isGenerating ? 'Curating Romantic Formula...' : '✨ Generate Perfect Custom Date'}
                </button>
              </div>

              {/* GENERATION STATE / RESULTS CARDS */}
              <AnimatePresence mode="wait">
                {isGenerating && (
                  <motion.div
                    key="generating"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="p-8 text-center bg-white/5 rounded-2xl border border-white/5 flex flex-col items-center justify-center gap-3"
                  >
                    <div className="relative">
                      <div className="w-10 h-10 border-2 border-rose-500/20 border-t-rose-500 rounded-full animate-spin" />
                      <Heart className="w-4 h-4 text-rose-500 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 fill-rose-500 animate-pulse" />
                    </div>
                    <span className="text-xs text-rose-300 italic font-medium">Scouring romantic records for the ultimate dynamic formula...</span>
                  </motion.div>
                )}

                {suggestedResult && !isGenerating && (
                  <motion.div
                    key="result"
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0 }}
                    className="p-5 sm:p-6 bg-white/5 rounded-2xl border border-rose-500/20 shadow-lg relative overflow-hidden space-y-4"
                  >
                    <div className="absolute top-0 right-0 w-24 h-24 bg-rose-500/5 rounded-full blur-2xl pointer-events-none" />
                    
                    <div className="flex flex-wrap justify-between items-start gap-2 border-b border-white/15 pb-3">
                      <div>
                        <span className="text-[9px] uppercase font-extrabold tracking-widest bg-rose-500/20 text-rose-300 border border-rose-500/30 px-2 py-0.5 rounded-full">
                          Matchmaker Formula Approved
                        </span>
                        <h4 className="font-serif text-xl font-bold text-white mt-1">{suggestedResult.title}</h4>
                      </div>
                      <div className="text-right text-xs text-neutral-400 shrink-0">
                        <div className="flex items-center gap-1.5 font-semibold text-rose-400">
                          <span>⏱️ {suggestedResult.duration}</span>
                          <span>•</span>
                          <span>💳 Budget: {sugBudget}</span>
                        </div>
                      </div>
                    </div>

                    <p className="text-xs sm:text-sm text-neutral-300 leading-relaxed italic">
                      "{suggestedResult.description}"
                    </p>

                    <div className="space-y-2 border-t border-white/5 pt-3">
                      <span className="block text-[10px] uppercase font-bold tracking-wider text-rose-300">Customized Preparation Checklist</span>
                      <ul className="space-y-1.5">
                        {suggestedResult.checklist.map((item: string, idx: number) => (
                          <li key={`sug-checklist-${idx}`} className="text-xs text-neutral-300 inline-flex items-start gap-2">
                            <Heart className="w-3 h-3 text-rose-400 fill-rose-500/30 shrink-0 mt-1" />
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="p-3 bg-rose-950/30 rounded-xl border border-rose-500/10 text-xs text-rose-200">
                      <strong>💖 Romantic Advice:</strong> {suggestedResult.notes}
                    </div>

                    {/* Custom Date, Time & Location Input Fields */}
                    <div className="p-4 bg-white/5 border border-white/10 rounded-2xl space-y-3">
                      <span className="block text-[10px] uppercase font-bold tracking-wider text-rose-300">
                        🗓️ Custom Date & Location Scheduler
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[10px] text-neutral-400 mb-1">Pick Date & Time</label>
                          <input
                            type="datetime-local"
                            value={sugDateTime}
                            onChange={(e) => setSugDateTime(e.target.value)}
                            className="w-full px-3 py-2 text-xs bg-neutral-900 border border-white/10 rounded-xl focus:outline-none focus:ring-1 focus:ring-rose-400 text-white cursor-pointer"
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-neutral-400 mb-1">Location / Venue</label>
                          <input
                            type="text"
                            placeholder="e.g. San Giovanni Hotel, or Cozy Home"
                            value={sugLocation}
                            onChange={(e) => setSugLocation(e.target.value)}
                            className="w-full px-3 py-2 text-xs bg-neutral-900 border border-white/10 rounded-xl focus:outline-none focus:ring-1 focus:ring-rose-400 text-white"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-end pt-2">
                      <button
                        type="button"
                        onClick={() => handleAddSuggestedDate(suggestedResult)}
                        className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl border border-rose-500/20 inline-flex items-center gap-1.5 transition-all cursor-pointer"
                      >
                        <Calendar className="w-4 h-4" />
                        Add this Custom Date to Scheduler!
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="text-center mt-12 mb-4">
              <h3 className="font-serif text-lg font-medium text-white">Or Explore Hand-Picked Classics</h3>
              <p className="text-[11px] text-neutral-400">Add any preset date style directly to your organizer schedule</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {PRE_SEEDED_DATE_IDEAS.map((idea, index) => {
                let badgeColor = 'bg-rose-500/10 text-rose-300 border border-rose-500/20';
                if (idea.category === 'home') badgeColor = 'bg-blue-500/10 text-blue-300 border border-blue-500/20';
                if (idea.category === 'adventure') badgeColor = 'bg-amber-500/10 text-amber-300 border border-amber-500/20';
                if (idea.category === 'budget') badgeColor = 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20';

                return (
                  <div 
                    key={`idea-${idea.id}-${index}`}
                    className="bg-white/5 rounded-2xl border border-white/10 p-5 shadow-md hover:border-white/20 hover:bg-white/10 transition-all flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex justify-between items-start gap-2 mb-3">
                        <span className={`text-[10px] uppercase font-bold tracking-wider px-2.5 py-1 rounded-full border ${badgeColor}`}>
                          {idea.category}
                        </span>
                        <div className="flex items-center gap-1.5 text-xs text-neutral-400">
                          <span>{idea.duration}</span>
                          <span className="text-neutral-700">•</span>
                          <span className="font-semibold text-rose-400">{idea.cost}</span>
                        </div>
                      </div>

                      <h3 className="font-serif text-lg font-medium text-white mb-2">
                        {idea.title}
                      </h3>
                      <p className="text-xs sm:text-sm text-neutral-300 leading-relaxed mb-4">
                        {idea.description}
                      </p>
                    </div>

                    <button
                      onClick={() => handleAddPresetIdea(idea)}
                      className="w-full inline-flex items-center justify-center gap-1 bg-rose-950/40 hover:bg-rose-900/40 text-rose-300 text-xs font-semibold py-2.5 rounded-xl border border-rose-500/15 transition-colors cursor-pointer"
                    >
                      Add to Planner
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          </motion.div>
        ) : (
          /* SCHEDULER VIEW */
          <motion.div
            key="scheduler-tab"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-6"
          >
            <DateCountdown 
              datePlans={datePlans}
              onQuickPlan={(spot) => {
                setFormTitle(spot.suggestedTitle);
                setFormCategory(spot.suggestedCategory);
                setFormOccasion('casual');
                setFormTheme(spot.suggestedTheme);
                setFormLocation(`${spot.name}, ${spot.area}`);
                setFormDesc(spot.description);
                setFormNotes(spot.romanticTip);
                
                // Set default date to 3 days from now at 7:00 PM
                const defaultDate = new Date();
                defaultDate.setDate(defaultDate.getDate() + 3);
                defaultDate.setHours(19, 0, 0, 0);
                const year = defaultDate.getFullYear();
                const month = String(defaultDate.getMonth() + 1).padStart(2, '0');
                const day = String(defaultDate.getDate()).padStart(2, '0');
                const hours = String(defaultDate.getHours()).padStart(2, '0');
                const minutes = String(defaultDate.getMinutes()).padStart(2, '0');
                setFormDateTime(`${year}-${month}-${day}T${hours}:${minutes}`);

                setFormChecklist(spot.suggestedChecklist);
                setIsAdding(true);
                
                setTimeout(() => {
                  const el = document.getElementById('btn-add-date-plan');
                  el?.scrollIntoView({ behavior: 'smooth' });
                }, 100);
              }}
            />

                       {/* Header controls */}
            <div className="flex flex-col gap-4 mb-4 bg-white/5 p-5 rounded-3xl border border-white/10 shadow-md">
              <div className="flex flex-wrap justify-between items-center gap-4">
                {/* Filter pills */}
                <div className="flex flex-wrap gap-1">
                  {(['all', 'planned', 'completed'] as const).map((status, idx) => (
                    <button
                      key={`filter-status-${status}-${idx}`}
                      onClick={() => setFilterStatus(status)}
                      className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold uppercase tracking-wider transition-all cursor-pointer ${
                        filterStatus === status
                          ? 'bg-rose-600 text-white shadow-md shadow-rose-950/25 border border-rose-500/20'
                          : 'text-neutral-400 hover:bg-white/5 hover:text-white'
                      }`}
                    >
                      {status}
                    </button>
                  ))}
                </div>

                {/* Add button */}
                <button
                  id="btn-add-date-plan"
                  onClick={() => setIsAdding(!isAdding)}
                  className="bg-rose-600 hover:bg-rose-700 text-white px-4.5 py-2.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer shadow-md shadow-rose-950/20 border border-rose-500/20"
                >
                  <Plus className="w-4 h-4" />
                  Plan new date
                </button>
              </div>

              {/* Occasion Filter row - Cleanly framed inside card box */}
              <div className="bg-neutral-900/70 p-2.5 sm:p-3 rounded-2xl border border-white/5 flex flex-col sm:flex-row sm:items-center gap-2 w-full overflow-hidden mt-1">
                <div className="flex items-center gap-1.5 shrink-0">
                  <Sparkles className="w-3.5 h-3.5 text-rose-400" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-300">
                    Occasion Filter:
                  </span>
                </div>
                <HorizontalScrollWrapper className="w-full flex-1 min-w-0" scrollContainerClassName="gap-1.5 py-0.5">
                  {[
                    { id: 'all', label: 'All Occasions' },
                    { id: 'first_date', label: 'First Dates 💖' },
                    { id: 'anniversary', label: 'Anniversaries 🌹' },
                    { id: 'birthday', label: 'Birthdays 🎂' },
                    { id: 'surprise', label: 'Surprises 🎁' },
                    { id: 'double_date', label: 'Double Dates 👥' },
                    { id: 'casual', label: 'Casual 🍿' }
                  ].map((occ, idx) => (
                    <button
                      key={`filter-occ-${occ.id}-${idx}`}
                      onClick={() => setFilterOccasion(occ.id)}
                      className={`px-3 py-1 rounded-lg text-xs font-medium transition-all whitespace-nowrap cursor-pointer shrink-0 ${
                        filterOccasion === occ.id
                          ? 'bg-rose-600 text-white shadow-md shadow-rose-950/40 border border-rose-400/30 font-semibold'
                          : 'text-neutral-400 hover:text-neutral-200 bg-white/5 hover:bg-white/10 border border-white/5'
                      }`}
                    >
                      {occ.label}
                    </button>
                  ))}
                </HorizontalScrollWrapper>
              </div>
            </div>

            {/* Form to add date plan */}
            <AnimatePresence>
              {isAdding && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden bg-neutral-900 rounded-3xl border border-white/10 shadow-2xl"
                >
                  <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-4">
                    <h3 className="font-serif text-lg font-medium text-white mb-2">
                      Plan Our Next Adventure
                    </h3>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-neutral-400 mb-1">Date Title *</label>
                        <input
                          type="text"
                          required
                          value={formTitle}
                          onChange={(e) => setFormTitle(e.target.value)}
                          placeholder="E.g., Sweet Rooftop Picnic"
                          className="w-full px-3 py-2 text-xs sm:text-sm bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:ring-1 focus:ring-rose-400 focus:border-rose-400 text-white placeholder-neutral-500"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-neutral-400 mb-1">Romantic Occasion</label>
                        <select
                          value={formOccasion}
                          onChange={(e) => setFormOccasion(e.target.value as any)}
                          className="w-full px-3 py-2 text-xs sm:text-sm bg-neutral-900 border border-white/10 rounded-xl focus:outline-none focus:ring-1 focus:ring-rose-400 focus:border-rose-400 text-white"
                        >
                          <option value="first_date">First Date 💖</option>
                          <option value="anniversary">Anniversary Date 🌹</option>
                          <option value="birthday">Birthday Celebration 🎂</option>
                          <option value="surprise">Surprise Date 🎁</option>
                          <option value="double_date">Double Date 👥</option>
                          <option value="casual">Casual Date 🍿</option>
                          <option value="other">Other Special Occasion ✨</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-neutral-400 mb-1">Date Vibe & Theme</label>
                        <select
                          value={formTheme}
                          onChange={(e) => setFormTheme(e.target.value)}
                          className="w-full px-3 py-2 text-xs sm:text-sm bg-neutral-900 border border-white/10 rounded-xl focus:outline-none focus:ring-1 focus:ring-rose-400 focus:border-rose-400 text-white"
                        >
                          <option value="Cozy & Warm ☕️">Cozy & Warm ☕️</option>
                          <option value="Elegant & Fancy 🌹">Elegant & Fancy 🌹</option>
                          <option value="Thrilling & Active 🗺️">Thrilling & Active 🗺️</option>
                          <option value="Playful & Creative 🎨">Playful & Creative 🎨</option>
                          <option value="Retro & Vintage 🍿">Retro & Vintage 🍿</option>
                          <option value="Dreamy & Celestial ✨">Dreamy & Celestial ✨</option>
                          <option value="custom">-- Custom Theme --</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-neutral-400 mb-1">Date Style Category</label>
                        <select
                          value={formCategory}
                          onChange={(e) => setFormCategory(e.target.value as any)}
                          className="w-full px-3 py-2 text-xs sm:text-sm bg-neutral-900 border border-white/10 rounded-xl focus:outline-none focus:ring-1 focus:ring-rose-400 focus:border-rose-400 text-white"
                        >
                          <option value="dinner">Romantic Dinner</option>
                          <option value="adventure">Outdoor Adventure</option>
                          <option value="home">Cosy Home Date</option>
                          <option value="budget">Budget Friendly</option>
                          <option value="other">Other Milestone Style</option>
                        </select>
                      </div>

                      {formTheme === 'custom' && (
                        <div className="sm:col-span-2">
                          <label className="block text-xs font-semibold text-neutral-400 mb-1">Custom Theme Name</label>
                          <input
                            type="text"
                            required
                            value={customThemeInput}
                            onChange={(e) => setCustomThemeInput(e.target.value)}
                            placeholder="E.g., Parisian Sunset Romance"
                            className="w-full px-3 py-2 text-xs sm:text-sm bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:ring-1 focus:ring-rose-400 focus:border-rose-400 text-white placeholder-neutral-500"
                          />
                        </div>
                      )}

                      <div>
                        <label className="block text-xs font-semibold text-neutral-400 mb-1">Date & Time</label>
                        <input
                          type="datetime-local"
                          value={formDateTime}
                          onChange={(e) => setFormDateTime(e.target.value)}
                          className="w-full px-3 py-2 text-xs sm:text-sm bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:ring-1 focus:ring-rose-400 focus:border-rose-400 text-white"
                        />
                      </div>
                      
                      <div>
                        <label className="block text-xs font-semibold text-neutral-400 mb-1">Location / Meeting Point</label>
                        <input
                          type="text"
                          value={formLocation}
                          onChange={(e) => setFormLocation(e.target.value)}
                          placeholder="Where are we meeting?"
                          className="w-full px-3 py-2 text-xs sm:text-sm bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:ring-1 focus:ring-rose-400 focus:border-rose-400 text-white placeholder-neutral-500"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-neutral-400 mb-1">What we will do (Description)</label>
                      <textarea
                        value={formDesc}
                        onChange={(e) => setFormDesc(e.target.value)}
                        rows={2}
                        placeholder="Describe the plan..."
                        className="w-full px-3 py-2 text-xs sm:text-sm bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:ring-1 focus:ring-rose-400 focus:border-rose-400 text-white placeholder-neutral-500"
                      />
                    </div>

                    {/* Todo checklist additions */}
                    <div>
                      <label className="block text-xs font-semibold text-neutral-400 mb-1 inline-flex items-center gap-1">
                        <ListTodo className="w-3.5 h-3.5 text-rose-400" />
                        Our Date Checklist
                      </label>
                      <p className="text-[10px] text-neutral-500 mb-2">Create custom checklist items for this date (e.g. reserve table, dress-code, pick flowers)</p>
                      
                      <div className="space-y-2">
                        {formChecklist.map((item, idx) => (
                          <div key={`form-checklist-${idx}`} className="flex gap-2">
                            <input
                              type="text"
                              value={item}
                              onChange={(e) => handleChecklistFieldChange(idx, e.target.value)}
                              placeholder={`Checklist item #${idx + 1}`}
                              className="flex-1 px-3 py-1.5 text-xs bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:ring-1 focus:ring-rose-400 focus:border-rose-400 text-white placeholder-neutral-500"
                            />
                            {formChecklist.length > 1 && (
                              <button
                                type="button"
                                onClick={() => handleRemoveChecklistField(idx)}
                                className="text-neutral-500 hover:text-rose-400 p-1.5"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>

                      <button
                        type="button"
                        onClick={handleAddChecklistField}
                        className="mt-2 text-xs font-semibold text-rose-400 hover:text-rose-300 inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Plus className="w-3 h-3" />
                        Add checklist item
                      </button>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-neutral-400 mb-1">Special Romantic Notes</label>
                      <input
                        type="text"
                        value={formNotes}
                        onChange={(e) => setFormNotes(e.target.value)}
                        placeholder="E.g., Surprise gift or flower details..."
                        className="w-full px-3 py-2 text-xs sm:text-sm bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:ring-1 focus:ring-rose-400 focus:border-rose-400 text-white placeholder-neutral-500"
                      />
                    </div>

                    <div className="flex justify-end gap-2 pt-2 border-t border-white/10">
                      <button
                        type="button"
                        onClick={resetForm}
                        className="px-4 py-2 rounded-xl text-xs font-semibold border border-white/15 text-neutral-300 hover:bg-white/5 cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        id="btn-submit-date"
                        type="submit"
                        className="px-4 py-2 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white cursor-pointer border border-rose-500/20"
                      >
                        Schedule Date
                      </button>
                    </div>
                  </form>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Schedule list */}
            <div className="space-y-6">
              {(() => {
                const interactivePlans = filteredPlans.filter(p => p.id.includes('plan-interactive') || p.notes?.includes('Interactive Love Card') || p.notes?.includes('Interactive Love Planner'));
                const schedulerPlans = filteredPlans.filter(p => !p.id.includes('plan-interactive') && !p.notes?.includes('Interactive Love Card') && !p.notes?.includes('Interactive Love Planner'));

                const renderPlanCard = (plan: typeof filteredPlans[0], idx: number = 0) => {
                  const dateVal = new Date(plan.dateTime);
                  const isCompleted = plan.status === 'completed';

                  let categoryBadge = 'bg-rose-500/10 text-rose-300 border-rose-500/20';
                  if (plan.category === 'home') categoryBadge = 'bg-blue-500/10 text-blue-300 border-blue-500/20';
                  if (plan.category === 'adventure') categoryBadge = 'bg-amber-500/10 text-amber-300 border-amber-500/20';
                  if (plan.category === 'budget') categoryBadge = 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20';

                  const isInteractive = plan.id.includes('plan-interactive') || plan.notes?.includes('Interactive Love Card') || plan.notes?.includes('Interactive Love Planner');

                  return (
                    <div
                      key={`plan-${isInteractive ? 'interactive' : 'scheduler'}-${plan.id}-${idx}`}
                      className={`rounded-2xl border p-5 sm:p-6 shadow-md relative transition-all ${
                        isInteractive 
                          ? 'border-purple-500/30 hover:border-purple-500/50 bg-gradient-to-r from-purple-950/15 to-rose-950/15' 
                          : 'border-white/10 hover:border-white/20 bg-white/5'
                      } ${
                        isCompleted 
                          ? 'opacity-65' 
                          : 'hover:bg-white/10'
                      }`}
                    >
                      {/* Top status & category */}
                      <div className="flex justify-between items-start gap-2 mb-3">
                        <div className="flex flex-wrap gap-1.5 items-center">
                          {/* Tag indicating where it came from */}
                          {isInteractive ? (
                            <span className="text-[9px] uppercase font-bold tracking-wide px-2.5 py-0.5 rounded-full bg-purple-500/20 text-purple-200 border border-purple-500/30 inline-flex items-center gap-1">
                              🎮 Interactive Game
                            </span>
                          ) : (
                            <span className="text-[9px] uppercase font-bold tracking-wide px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-200 border border-blue-500/30 inline-flex items-center gap-1">
                              📅 Scheduler
                            </span>
                          )}

                          {/* Occasion Badge */}
                          <span className="text-[10px] uppercase font-extrabold tracking-wider px-2.5 py-0.5 rounded-full bg-rose-500/10 text-rose-300 border border-rose-500/20">
                            {(() => {
                              switch (plan.occasion) {
                                case 'first_date': return '💖 First Date';
                                case 'anniversary': return '🌹 Anniversary';
                                case 'birthday': return '🎂 Birthday';
                                case 'surprise': return '🎁 Surprise';
                                case 'double_date': return '👥 Double Date';
                                case 'casual': return '🍿 Casual';
                                default: return '✨ Occasion';
                              }
                            })()}
                          </span>

                          {/* Theme Badge */}
                          {plan.theme && (
                            <span className="text-[10px] font-semibold tracking-wide px-2.5 py-0.5 rounded-full bg-purple-500/10 text-purple-300 border border-purple-500/20">
                              🎭 {plan.theme}
                            </span>
                          )}

                          <span className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full border ${categoryBadge}`}>
                            {plan.category}
                          </span>

                          {plan.createdBy && (
                            <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-white/10 text-rose-200 border border-white/15 inline-flex items-center gap-1">
                              👤 Planned by {plan.createdBy}
                            </span>
                          )}

                          {isCompleted ? (
                            <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 inline-flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Completed
                            </span>
                          ) : (
                            <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-300 border border-blue-500/20">
                              Upcoming
                            </span>
                          )}
                        </div>

                        <button
                          onClick={() => onDeleteDatePlan(plan.id)}
                          className="text-neutral-500 hover:text-rose-400 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Title */}
                      <h3 className={`font-serif text-xl font-medium mb-2 ${
                        isCompleted ? 'text-neutral-500 line-through' : 'text-white'
                      }`}>
                        {plan.title}
                      </h3>

                      {plan.description && (
                        <p className="text-xs sm:text-sm text-neutral-300 leading-relaxed mb-4">
                          {plan.description}
                        </p>
                      )}

                      {/* Details: time & venue */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4 bg-white/5 p-3.5 rounded-xl border border-white/10 text-xs text-neutral-300">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-rose-400 shrink-0" />
                          <span>{dateVal.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })} at {dateVal.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <MapPin className="w-4 h-4 text-rose-400 shrink-0" />
                          <span className="truncate">{plan.location}</span>
                        </div>
                      </div>

                      {/* Todo checklist */}
                      {plan.checklist && plan.checklist.length > 0 && (
                        <div className="mb-4 border-t border-white/10 pt-4">
                          <span className="block text-xs font-semibold text-white uppercase tracking-wider mb-2">
                            Date Checklist
                          </span>
                          <div className="space-y-1.5">
                            {plan.checklist.map((item, cIdx) => (
                              <button
                                key={`checklist-${item.id || cIdx}-${cIdx}`}
                                onClick={() => handleToggleChecklistItem(plan, item.id)}
                                className="w-full flex items-center gap-2 text-left text-xs font-sans text-neutral-300 hover:text-white cursor-pointer"
                              >
                                {item.completed ? (
                                  <CheckSquare className="w-4 h-4 text-rose-400 shrink-0" />
                                ) : (
                                  <Square className="w-4 h-4 text-neutral-600 hover:text-rose-400 shrink-0" />
                                )}
                                <span className={item.completed ? 'line-through text-neutral-500' : ''}>
                                  {item.text}
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Special Notes banner */}
                      {plan.notes && (
                        <div className="flex gap-2 bg-rose-500/10 p-3 rounded-xl border border-rose-500/20 text-xs text-rose-200 italic mb-4">
                          <Info className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                          <span>{plan.notes}</span>
                        </div>
                      )}

                      {/* Bottom actions */}
                      <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-white/10">
                        {/* Beautiful WhatsApp Share Action */}
                        <button
                          onClick={() => {
                            const dateStr = dateVal.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
                            const timeStr = dateVal.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
                            
                            let checklistStr = '';
                            if (plan.checklist && plan.checklist.length > 0) {
                              checklistStr = '%0A%0A📝 *Our To-Do Checklist:*%0A' + plan.checklist.map(item => `${item.completed ? '✅' : '⬜'} ${item.text}`).join('%0A');
                            }
                            
                            let notesStr = '';
                            if (plan.notes) {
                              notesStr = `%0A%0A💖 *Romantic Spark:* _"${plan.notes}"_`;
                            }

                            const message = `💕 *OUR PERFECT DATE MEMO* 💕%0A%0A` +
                                           `✨ *Title:* ${plan.title}%0A` +
                                           `🗓️ *Date:* ${dateStr}%0A` +
                                           `⏰ *Time:* ${timeStr}%0A` +
                                           `📍 *Venue:* ${plan.location}%0A` +
                                           `💬 *Description:* ${plan.description || 'No description added yet.'}` +
                                           checklistStr +
                                           notesStr +
                                           `%0A%0A_Sent via Dating Planner App_ ❤️`;

                            window.open(`https://wa.me/201099995546?text=${message}`, '_blank');
                          }}
                          className="px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-600/20 hover:bg-emerald-600 text-emerald-300 hover:text-white border border-emerald-500/25 transition-all inline-flex items-center gap-1.5 cursor-pointer shadow-sm"
                          title="Send to Partner via WhatsApp"
                        >
                          <Phone className="w-3.5 h-3.5 text-emerald-400" />
                          <span>WhatsApp Share 📱</span>
                        </button>

                        <button
                          onClick={() => handleTogglePlanStatus(plan)}
                          className={`text-xs font-semibold px-4 py-2 rounded-xl inline-flex items-center gap-1.5 transition-all cursor-pointer ${
                            isCompleted
                              ? 'border border-white/15 text-neutral-300 hover:bg-white/5'
                              : 'bg-rose-600 hover:bg-rose-700 text-white shadow-md shadow-rose-950/20'
                          }`}
                        >
                          <Heart className={`w-3.5 h-3.5 ${isCompleted ? '' : 'fill-white'}`} />
                          {isCompleted ? 'Mark as Planned' : 'Mark as Completed!'}
                        </button>
                      </div>
                    </div>
                  );
                };

                if (filteredPlans.length === 0) {
                  return (
                    <div className="bg-white/5 rounded-2xl border border-white/10 p-8 text-center text-neutral-400 font-sans text-sm shadow-sm">
                      No {filterStatus === 'all' ? '' : filterStatus} date plans found. Click "Plan new date" to schedule our next beautiful date!
                    </div>
                  );
                }

                return (
                  <div className="space-y-8">
                    {/* Interactive Game Plans Section */}
                    {interactivePlans.length > 0 && (
                      <div className="space-y-4">
                        <h4 className="text-xs font-bold uppercase tracking-widest text-purple-400 flex items-center gap-2 border-b border-purple-500/20 pb-2">
                          <Heart className="w-3.5 h-3.5 text-purple-400 fill-purple-500/30" />
                          Interactive Love Game Plans 💕 ({interactivePlans.length})
                        </h4>
                        <div className="space-y-4">
                          {interactivePlans.map((plan, idx) => renderPlanCard(plan, idx))}
                        </div>
                      </div>
                    )}

                    {/* Standard Scheduler Plans Section */}
                    {schedulerPlans.length > 0 && (
                      <div className="space-y-4">
                        <h4 className="text-xs font-bold uppercase tracking-widest text-rose-400 flex items-center gap-2 border-b border-rose-500/20 pb-2">
                          <Calendar className="w-3.5 h-3.5 text-rose-400" />
                          Our Date Scheduler Plans 📅 ({schedulerPlans.length})
                        </h4>
                        <div className="space-y-4">
                          {schedulerPlans.map((plan, idx) => renderPlanCard(plan, idx))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default DatePlanner;
