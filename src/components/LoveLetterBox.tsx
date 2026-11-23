import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Mail, MailOpen, Plus, Trash2, Heart, Calendar, 
  Send, ChevronLeft, X, Check, Edit3 
} from 'lucide-react';
import { LoveLetter } from '../types';

interface LoveLetterBoxProps {
  letters: LoveLetter[];
  onAddLetter: (letter: LoveLetter) => void;
  onUpdateLetter: (updated: LoveLetter) => void;
  onDeleteLetter: (id: string) => void;
  currentUser?: string;
}

export const LoveLetterBox: React.FC<LoveLetterBoxProps> = ({
  letters,
  onAddLetter,
  onUpdateLetter,
  onDeleteLetter,
  currentUser,
}) => {
  const [isAdding, setIsAdding] = useState(false);
  const [readingLetter, setReadingLetter] = useState<LoveLetter | null>(null);

  // Form states
  const [formSender, setFormSender] = useState(currentUser ? currentUser.charAt(0).toUpperCase() + currentUser.slice(1) : '');
  const [formRecipient, setFormRecipient] = useState('');
  const [formSubject, setFormSubject] = useState('');
  const [formContent, setFormContent] = useState('');
  const [formTemplate, setFormTemplate] = useState<'classic' | 'playful' | 'deep'>('classic');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formSender.trim() || !formRecipient.trim() || !formSubject.trim() || !formContent.trim()) return;

    const newLetter: LoveLetter = {
      id: 'let-' + Date.now(),
      sender: formSender,
      recipient: formRecipient,
      subject: formSubject,
      content: formContent,
      template: formTemplate,
      isOpened: false,
      date: new Date().toISOString().slice(0, 10)
    };

    onAddLetter(newLetter);
    resetForm();
  };

  const resetForm = () => {
    setFormSender(currentUser ? currentUser.charAt(0).toUpperCase() + currentUser.slice(1) : '');
    setFormRecipient('');
    setFormSubject('');
    setFormContent('');
    setFormTemplate('classic');
    setIsAdding(false);
  };

  const handleOpenLetter = (letter: LoveLetter) => {
    setReadingLetter(letter);
    if (!letter.isOpened) {
      onUpdateLetter({
        ...letter,
        isOpened: true
      });
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto px-4 py-4 font-sans">
      
      {/* Title */}
      <div className="text-center mb-8">
        <h2 className="font-serif text-2xl md:text-3xl text-white font-medium tracking-tight mb-2">
          Love Letter Box
        </h2>
        <p className="text-xs sm:text-sm text-neutral-400 max-w-md mx-auto">
          Write and seal romantic letters for each other. Unfold digital envelopes to read heartwarming sweet letters.
        </p>
      </div>

      {/* Toolbar */}
      <div className="flex justify-between items-center mb-8 bg-white/5 p-4 rounded-2xl border border-white/10 shadow-md">
        <span className="text-xs font-semibold uppercase tracking-wider text-rose-300">
          Letters Sealed: {letters.length}
        </span>
        <button
          id="btn-write-letter"
          onClick={() => setIsAdding(!isAdding)}
          className="bg-rose-600 hover:bg-rose-700 text-white px-4 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer shadow-md shadow-rose-950/20"
        >
          <Plus className="w-4 h-4" />
          Write a letter
        </button>
      </div>

      <AnimatePresence mode="wait">
        {isAdding ? (
          /* WRITE LETTER VIEW */
          <motion.div
            key="write-letter-panel"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="bg-neutral-900 rounded-3xl border border-white/10 shadow-2xl overflow-hidden max-w-2xl mx-auto"
          >
            <div className="bg-gradient-to-r from-rose-600 to-pink-700 p-6 text-white relative">
              <button
                onClick={() => setIsAdding(false)}
                className="absolute top-4 right-4 text-white/85 hover:text-white p-1.5 hover:bg-white/10 rounded-full transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
              <h3 className="font-serif text-xl font-medium">Compose a Love Letter</h3>
              <p className="text-xs text-white/80 mt-1">Take your time. Speak directly from your heart.</p>
            </div>

            <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-neutral-400 mb-1">From (Sender Name)</label>
                  <input
                    type="text"
                    required
                    value={formSender}
                    onChange={(e) => setFormSender(e.target.value)}
                    placeholder="E.g., Your Sweetheart"
                    className="w-full px-3 py-2 text-xs sm:text-sm bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:ring-1 focus:ring-rose-400 focus:border-rose-400 font-sans text-white placeholder-neutral-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-400 mb-1">To (Recipient Name)</label>
                  <input
                    type="text"
                    required
                    value={formRecipient}
                    onChange={(e) => setFormRecipient(e.target.value)}
                    placeholder="E.g., My Forever Love"
                    className="w-full px-3 py-2 text-xs sm:text-sm bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:ring-1 focus:ring-rose-400 focus:border-rose-400 font-sans text-white placeholder-neutral-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-neutral-400 mb-1">Letter Subject</label>
                  <input
                    type="text"
                    required
                    value={formSubject}
                    onChange={(e) => setFormSubject(e.target.value)}
                    placeholder="A sweet title..."
                    className="w-full px-3 py-2 text-xs sm:text-sm bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:ring-1 focus:ring-rose-400 focus:border-rose-400 font-sans text-white placeholder-neutral-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-400 mb-1">Emotion Template</label>
                  <select
                    value={formTemplate}
                    onChange={(e) => setFormTemplate(e.target.value as any)}
                    className="w-full px-3 py-2 text-xs sm:text-sm bg-neutral-900 border border-white/10 rounded-xl focus:outline-none focus:ring-1 focus:ring-rose-400 focus:border-rose-400 text-white"
                  >
                    <option value="classic">Classic Romantic (Warm & Soft)</option>
                    <option value="playful">Playful & Teasing (Cute & Cheerful)</option>
                    <option value="deep">Deeply Heartfelt (Sincere & Sassy)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-400 mb-1">Your Letter Content</label>
                <textarea
                  required
                  value={formContent}
                  onChange={(e) => setFormContent(e.target.value)}
                  rows={6}
                  placeholder="Dearest, words can't fully express how much you mean to me..."
                  className="w-full px-3.5 py-2.5 text-xs sm:text-sm bg-white/5 border border-white/10 rounded-2xl focus:outline-none focus:ring-1 focus:ring-rose-400 focus:border-rose-400 font-serif text-white placeholder-neutral-500 leading-relaxed"
                />
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
                  id="btn-seal-letter"
                  type="submit"
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white inline-flex items-center gap-1.5 shadow-md shadow-rose-950/20 cursor-pointer border border-rose-500/20"
                >
                  <Send className="w-3.5 h-3.5" />
                  Seal & Send Letter
                </button>
              </div>
            </form>
          </motion.div>
        ) : (
          /* LIST ENVELOPES VIEW */
          <motion.div
            key="list-envelopes"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6"
          >
            {letters.map((letter, index) => {
              const dateVal = new Date(letter.date);
              
              let cardBg = 'hover:border-rose-500/40 hover:bg-white/10';
              if (letter.template === 'playful') cardBg = 'hover:border-amber-500/40 hover:bg-white/10';
              if (letter.template === 'deep') cardBg = 'hover:border-purple-500/40 hover:bg-white/10';

              return (
                <motion.div
                  id={`envelope-${letter.id}`}
                  key={`envelope-${letter.id}-${index}`}
                  whileHover={{ y: -6, scale: 1.02 }}
                  onClick={() => handleOpenLetter(letter)}
                  className={`bg-white/5 rounded-2xl border border-white/10 p-5 shadow-md text-left flex flex-col justify-between h-56 cursor-pointer transition-all ${cardBg}`}
                >
                  <div className="flex justify-between items-start">
                    <div className="p-2.5 bg-rose-500/10 text-rose-300 rounded-xl">
                      {letter.isOpened ? (
                        <MailOpen className="w-5 h-5" />
                      ) : (
                        <Mail className="w-5 h-5 fill-rose-500/10 animate-bounce" />
                      )}
                    </div>
                    <span className="text-[10px] text-neutral-400 inline-flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-rose-400" />
                      {dateVal.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                  </div>

                  <div className="my-4">
                    <h3 className="font-serif text-base font-semibold text-white mb-1 truncate">
                      {letter.subject}
                    </h3>
                    <p className="text-xs text-neutral-300 font-sans line-clamp-2">
                      {letter.content}
                    </p>
                  </div>

                  <div className="flex justify-between items-center pt-3 border-t border-white/10">
                    <span className="text-[10px] font-sans text-neutral-400 italic">
                      From: <span className="font-semibold text-rose-300">{letter.sender}</span>
                    </span>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteLetter(letter.id);
                      }}
                      className="text-neutral-500 hover:text-rose-400 p-1 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </motion.div>
              );
            })}

            {letters.length === 0 && (
              <div className="col-span-full bg-white/5 rounded-2xl border border-white/10 p-12 text-center text-neutral-400 font-sans text-sm shadow-sm">
                No love letters in this mailbox yet. Write a romantic letter using the "Write a letter" button above!
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* READING LETTER HIGH-FIDELITY PARCHMENT REVEAL OVERLAY */}
      <AnimatePresence>
        {readingLetter && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setReadingLetter(null)}
            className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4 backdrop-blur-md"
          >
            <motion.div
              initial={{ y: 50, scale: 0.95 }}
              animate={{ y: 0, scale: 1 }}
              exit={{ y: 50, scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-[#FCF9F2] text-[#3d2a1c] border border-amber-900/15 rounded-3xl p-8 max-w-lg w-full max-h-[85vh] overflow-y-auto shadow-2xl relative flex flex-col justify-between"
              style={{
                backgroundImage: 'radial-gradient(#F5EFE0 1px, transparent 1px)',
                backgroundSize: '24px 24px'
              }}
            >
              {/* Seal or decor element */}
              <div className="absolute top-0 right-12 w-10 h-16 bg-rose-600 text-white rounded-b-xl flex items-center justify-center shadow-md border-t-0">
                <Heart className="w-4 h-4 fill-white animate-pulse" />
              </div>

              <button
                onClick={() => setReadingLetter(null)}
                className="absolute top-4 right-4 p-1.5 hover:bg-black/5 rounded-full text-gray-500 hover:text-rose-600 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="space-y-6">
                {/* Header envelope information */}
                <div className="border-b border-amber-900/10 pb-4">
                  <div className="text-xs text-amber-800/80 uppercase font-sans tracking-widest font-semibold mb-1">
                    Romantic Sealed Letter
                  </div>
                  <h4 className="font-serif text-2xl font-semibold text-rose-950">
                    {readingLetter.subject}
                  </h4>
                  <div className="flex justify-between items-center mt-2 text-xs text-amber-900/60 font-sans font-medium">
                    <span>To: {readingLetter.recipient}</span>
                    <span>{new Date(readingLetter.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
                  </div>
                </div>

                {/* Letter Body Parchment */}
                <div className="font-serif text-sm md:text-base leading-relaxed text-[#4A3B32] space-y-4 whitespace-pre-line max-h-[45vh] overflow-y-auto pr-2">
                  {readingLetter.content}
                </div>
              </div>

              {/* Signature block */}
              <div className="border-t border-amber-900/10 pt-4 mt-8 flex justify-between items-center text-xs font-sans text-amber-900/70 italic">
                <span>With Love, <span className="font-semibold text-rose-800 not-italic">{readingLetter.sender}</span></span>
                <button
                  onClick={() => setReadingLetter(null)}
                  className="px-4 py-1.5 rounded-lg border border-amber-900/20 hover:bg-amber-100/30 text-amber-950 font-semibold cursor-pointer"
                >
                  Close Letter
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default LoveLetterBox;
