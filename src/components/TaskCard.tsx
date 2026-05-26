import { useState, useRef, useEffect, FocusEvent, ChangeEvent } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Pin, PinOff, Calendar, Trash2, Check, Clock, Link2, Palette, 
  Image, Music, Globe, Play, Pause, ExternalLink 
} from 'lucide-react';
import { Task } from '../types';

interface TaskCardProps {
  key?: string;
  task: Task;
  position: { x: number; y: number } | undefined;
  onUpdate: (task: Task) => void;
  onDelete: (id: string) => void;
  onDragStart: (id: string, clientX: number, clientY: number) => void;
  onLinkToggle: (id: string) => void;
  onLinkDragStart: (id: string, clientX: number, clientY: number) => void;
  onLinkConnect: (sourceId: string, targetId: string) => void;
  draggingLinkSourceId: string | null;
  isLinkingTarget: boolean;
  isLinkingSource: boolean;
  theme: 'dark' | 'light';
}

export const COLOR_PRESETS = [
  { name: 'Obsidian Coal', class: 'bg-[#121212]/95 border-white/10 text-white shadow-2xl backdrop-blur-md', glow: 'shadow-[0_20px_50px_rgba(0,0,0,0.6)]', banner: 'bg-white/5 border-b border-white/5' },
  { name: 'Ruby Sangria', class: 'bg-[#1D0E0F]/95 border-rose-500/25 text-[#FFEBEB] shadow-2xl backdrop-blur-md', glow: 'shadow-[0_20px_50px_rgba(244,63,94,0.1)]', banner: 'bg-rose-500/5 border-b border-rose-500/10' },
  { name: 'Emerald Jade', class: 'bg-[#091D11]/95 border-emerald-500/25 text-[#ECFFED] shadow-2xl backdrop-blur-md', glow: 'shadow-[0_20px_50px_rgba(16,185,129,0.1)]', banner: 'bg-emerald-500/5 border-b border-emerald-500/10' },
  { name: 'Sapphire Sky', class: 'bg-[#0E0F2B]/95 border-indigo-500/25 text-[#ECECFF] shadow-2xl backdrop-blur-md', glow: 'shadow-[0_20px_50px_rgba(99,102,241,0.12)]', banner: 'bg-indigo-500/5 border-b border-indigo-500/10' },
  { name: 'Amber Sunset', class: 'bg-[#1E140C]/95 border-amber-500/25 text-[#FFFCEB] shadow-2xl backdrop-blur-md', glow: 'shadow-[0_20px_50px_rgba(245,158,11,0.08)]', banner: 'bg-amber-500/5 border-b border-amber-500/10' },
  { name: 'Cyber Grape', class: 'bg-[#170E28]/95 border-purple-500/25 text-[#FAEBFF] shadow-2xl backdrop-blur-md', glow: 'shadow-[0_20px_50px_rgba(168,85,247,0.12)]', banner: 'bg-purple-500/5 border-b border-purple-500/10' },
];

export const LIGHT_COLOR_PRESETS = [
  { name: 'Executive White', class: 'bg-white border-black/10 text-zinc-900 shadow-2xl', glow: 'shadow-[10px_20px_50px_rgba(0,0,0,0.1)]', banner: 'bg-zinc-50 border-b border-black/5' },
  { name: 'Blush Crimson', class: 'bg-[#FFF8F8] border-rose-200/80 text-[#5C1A20] shadow-2xl', glow: 'shadow-[10px_20px_50px_rgba(92,26,32,0.05)]', banner: 'bg-[#FFEBF0]/50 border-b border-rose-200/40' },
  { name: 'Mint Meadow', class: 'bg-[#F2FAF5] border-emerald-200/80 text-[#0F3F2A] shadow-2xl', glow: 'shadow-[10px_20px_50px_rgba(15,63,42,0.04)]', banner: 'bg-[#E2FAF0]/50 border-b border-emerald-200/40' },
  { name: 'Periwinkle Ocean', class: 'bg-[#F3F6FF] border-indigo-200/80 text-[#1A265B] shadow-2xl', glow: 'shadow-[10px_20px_50px_rgba(99,102,241,0.05)]', banner: 'bg-[#EBF1FF]/50 border-b border-indigo-200/40' },
  { name: 'Honey Honey', class: 'bg-[#FCFAF2] border-amber-200/80 text-[#4D3610] shadow-2xl', glow: 'shadow-[10px_20px_50px_rgba(245,158,11,0.04)]', banner: 'bg-[#FAF5E2]/50 border-b border-amber-200/40' },
  { name: 'Orchid Dream', class: 'bg-[#F9F4FF] border-purple-200/80 text-[#3D145A] shadow-2xl', glow: 'shadow-[10px_20px_50px_rgba(168,85,247,0.05)]', banner: 'bg-[#F3E7FF]/50 border-b border-purple-200/40' },
];

export default function TaskCard({
  task,
  position,
  onUpdate,
  onDelete,
  onDragStart,
  onLinkToggle,
  onLinkDragStart,
  onLinkConnect,
  draggingLinkSourceId,
  isLinkingTarget,
  isLinkingSource,
  theme,
}: TaskCardProps) {
  const [showPalette, setShowPalette] = useState(false);
  const [reminderStr, setReminderStr] = useState(task.reminderTime ? task.reminderTime.split('T')[0] : '');
  const [showReminderPicker, setShowReminderPicker] = useState(false);
  
  // Media Input / Player States
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [tempLink, setTempLink] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);

  const cardRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Sync audio ref to attachment
  useEffect(() => {
    if (task.attachedAudio) {
      audioRef.current = new Audio(task.attachedAudio);
      const updateRef = () => {
        if (audioRef.current) {
          const cur = audioRef.current.currentTime;
          const dur = audioRef.current.duration || 1;
          setProgress((cur / dur) * 100);
        }
      };
      const endRef = () => {
        setIsPlaying(false);
        setProgress(0);
      };
      audioRef.current.addEventListener('timeupdate', updateRef);
      audioRef.current.addEventListener('ended', endRef);

      return () => {
        if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current.removeEventListener('timeupdate', updateRef);
          audioRef.current.removeEventListener('ended', endRef);
          audioRef.current = null;
        }
      };
    } else {
      setIsPlaying(false);
      setProgress(0);
    }
  }, [task.attachedAudio]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().catch(() => {});
      setIsPlaying(true);
    }
  };

  const handleImageUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          onUpdate({ ...task, attachedImage: reader.result });
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAudioUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          onUpdate({ 
            ...task, 
            attachedAudio: reader.result, 
            attachedAudioName: file.name 
          });
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const getYouTubeId = (url: string) => {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  };

  // Sound generator utilizing browser built-in Web Audio API 
  const playSnd = (type: 'tick' | 'delete' | 'palette' | 'pin') => {
    try {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      if (type === 'tick') {
        const now = ctx.currentTime;
        osc.frequency.setValueAtTime(620, now);
        osc.frequency.exponentialRampToValueAtTime(1200, now + 0.12);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);
        osc.start(now);
        osc.stop(now + 0.12);
      } else if (type === 'delete') {
        const now = ctx.currentTime;
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(180, now);
        osc.frequency.linearRampToValueAtTime(40, now + 0.2);
        gain.gain.setValueAtTime(0.14, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
        osc.start(now);
        osc.stop(now + 0.2);
      } else if (type === 'palette') {
        const now = ctx.currentTime;
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.exponentialRampToValueAtTime(554.37, now + 0.08);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
        osc.start(now);
        osc.stop(now + 0.08);
      } else if (type === 'pin') {
        const now = ctx.currentTime;
        osc.frequency.setValueAtTime(280, now);
        osc.frequency.exponentialRampToValueAtTime(200, now + 0.15);
        gain.gain.setValueAtTime(0.06, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
        osc.start(now);
        osc.stop(now + 0.15);
      }
    } catch (e) {
      // Audio auto-play policy blocks occasionally, fail silently
    }
  };

  const presets = theme === 'dark' ? COLOR_PRESETS : LIGHT_COLOR_PRESETS;
  const activePreset = presets.find(p => p.name === task.color) || presets[0];

  const handleTitleBlur = (e: FocusEvent<HTMLInputElement>) => {
    const nextVal = e.target.value.trim() || 'Новая заметка';
    if (nextVal !== task.title) {
      onUpdate({ ...task, title: nextVal });
    }
  };

  const handleDescBlur = (e: FocusEvent<HTMLTextAreaElement>) => {
    const nextVal = e.target.value;
    if (nextVal !== task.description) {
      onUpdate({ ...task, description: nextVal });
    }
  };

  const toggleTaskStatus = () => {
    playSnd('tick');
    const nextStatus = task.status === 'pending' ? 'completed' : 'pending';
    import('canvas-confetti').then(confetti => {
      if (nextStatus === 'completed') {
        confetti.default({
          particleCount: 50,
          spread: 60,
          origin: { y: 0.8 },
          colors: ['#f59e0b', '#10b981', '#6366f1', '#a855f7'],
        });
      }
    });
    onUpdate({ ...task, status: nextStatus });
  };

  const togglePin = () => {
    playSnd('pin');
    onUpdate({ ...task, pinned: !task.pinned });
  };

  const selectColor = (name: string) => {
    playSnd('palette');
    onUpdate({ ...task, color: name });
    setShowPalette(false);
  };

  const selectPriority = (prio: 'low' | 'medium' | 'high') => {
    onUpdate({ ...task, priority: prio });
  };

  const updateReminder = (val: string) => {
    setReminderStr(val);
    if (val) {
      const isoTime = new Date(val).toISOString();
      onUpdate({ ...task, reminderTime: isoTime });
    } else {
      const nextTask = { ...task };
      delete nextTask.reminderTime;
      onUpdate(nextTask);
    }
    setShowReminderPicker(false);
  };

  const getPrioColor = (lvl: 'low' | 'medium' | 'high') => {
    if (lvl === 'high') return 'bg-rose-500 text-white';
    if (lvl === 'medium') return 'bg-amber-500 text-white';
    return 'bg-teal-500 text-white';
  };

  const cardX = position?.x ?? 200;
  const cardY = position?.y ?? 200;

  const hasMedia = task.attachedImage || task.attachedAudio || task.attachedLink;

  return (
    <div
      ref={cardRef}
      style={{
        transform: `translate3d(${cardX - 150}px, ${cardY - 80}px, 0)`,
        position: 'absolute',
        width: '300px',
        height: 'auto',
        minHeight: '160px',
        zIndex: isLinkingSource ? 40 : 20,
      }}
      className={`rounded-2xl border flex flex-col justify-between overflow-visible transition-[transform,shadow,ring] duration-300 select-none pointer-events-auto ${activePreset.class} ${activePreset.glow} ${
        isLinkingTarget ? 'ring-4 ring-indigo-500/80 scale-[1.03] shadow-lg shadow-indigo-500/20' : ''
      } ${isLinkingSource ? 'ring-4 ring-purple-500/80 scale-[1.03]' : ''} ${
        (draggingLinkSourceId !== null && draggingLinkSourceId !== task.id) ? 'hover:ring-4 hover:ring-indigo-500/50 hover:scale-[1.02]' : ''
      }`}
    >
      {/* Dynamic Right Side Drag Pull Handle Eyelet */}
      <div
        onMouseDown={(e) => {
          e.stopPropagation();
          e.preventDefault();
          onLinkDragStart(task.id, e.clientX, e.clientY);
        }}
        className="absolute right-[-7px] top-[45px] w-4 h-4 rounded-full border-2 border-inherit/60 bg-zinc-950 dark:bg-white flex items-center justify-center cursor-crosshair z-30 transition-transform hover:scale-125 hover:bg-[#4D4DFF] dark:hover:bg-[#a855f7]"
        title="Перетащите нить для связки"
      >
        <div className="w-1.5 h-1.5 rounded-full bg-inherit" />
      </div>

      {/* Card Header and Grabbing Bar */}
      <div
        onMouseDown={(e) => {
          const target = e.target as HTMLElement;
          if (target.closest('button') || target.closest('input') || target.closest('textarea')) return;
          if (task.pinned) return; 
          onDragStart(task.id, e.clientX, e.clientY);
        }}
        className={`px-3 py-1.5 flex items-center justify-between border-b border-inherit/40 ${
          task.pinned ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'
        } ${activePreset.banner}`}
      >
        <div className="flex items-center gap-1.5">
          {/* Completion toggle */}
          <button
            onClick={toggleTaskStatus}
            className={`w-4 h-4 rounded-full flex items-center justify-center border transition-all duration-300 ${
              task.status === 'completed'
                ? 'bg-indigo-500 border-indigo-400 text-white'
                : 'border-zinc-500/50 hover:border-zinc-400'
            }`}
          >
            {task.status === 'completed' && <Check className="w-2.5 h-2.5" />}
          </button>
          
          {/* Priority indicator dots */}
          <div className="flex gap-0.5">
            {(['low', 'medium', 'high'] as const).map(p => (
              <button
                key={p}
                onClick={() => selectPriority(p)}
                className={`w-2 h-2 rounded-full transition-all ${
                  task.priority === p 
                    ? p === 'high' ? 'bg-rose-500' : p === 'medium' ? 'bg-amber-500' : 'bg-teal-500' 
                    : 'bg-zinc-600/30 hover:bg-zinc-600/60'
                }`}
                title={`Приоритет: ${p}`}
              />
            ))}
          </div>
        </div>

        {/* Toolbar buttons */}
        <div className="flex items-center gap-1">
          {/* Image file button */}
          <button
            onClick={() => imageInputRef.current?.click()}
            className="p-1 rounded-md hover:bg-white/10 transition-colors text-inherit/60"
            title="Добавить фото"
          >
            <Image className="w-3.5 h-3.5" />
          </button>
          <input
            type="file"
            ref={imageInputRef}
            onChange={handleImageUpload}
            accept="image/*"
            className="hidden"
          />

          {/* Audio file button */}
          <button
            onClick={() => audioInputRef.current?.click()}
            className="p-1 rounded-md hover:bg-white/10 transition-colors text-inherit/60"
            title="Добавить музыку"
          >
            <Music className="w-3.5 h-3.5" />
          </button>
          <input
            type="file"
            ref={audioInputRef}
            onChange={handleAudioUpload}
            accept="audio/*"
            className="hidden"
          />

          {/* Link URL input toggle */}
          <button
            onClick={() => setShowLinkInput(!showLinkInput)}
            className={`p-1 rounded-md hover:bg-white/10 transition-colors ${
              task.attachedLink ? 'text-indigo-400' : 'text-inherit/60'
            }`}
            title="Добавить ссылку / YouTube"
          >
            <Globe className="w-3.5 h-3.5" />
          </button>

          {/* Reminder Bell */}
          <div className="relative">
            <button
              onClick={() => setShowReminderPicker(!showReminderPicker)}
              className={`p-1 rounded-md hover:bg-white/10 transition-colors relative ${
                task.reminderTime ? 'text-amber-400' : 'text-inherit/60'
              }`}
              title="Напоминание"
            >
              <Calendar className="w-3.5 h-3.5" />
              {task.reminderTime && (
                <span className="absolute top-0 right-0 w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse" />
              )}
            </button>
            <AnimatePresence>
              {showReminderPicker && (
                <motion.div
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -5 }}
                  className="absolute right-0 top-7 z-50 p-2.5 rounded-xl border border-zinc-800 bg-zinc-950 shadow-2xl flex flex-col gap-1.5 w-48"
                >
                  <label className="text-[9px] text-zinc-400 uppercase font-bold tracking-wider">Дата напоминания</label>
                  <input
                    type="date"
                    value={reminderStr}
                    onChange={(e) => updateReminder(e.target.value)}
                    className="bg-zinc-900 text-xs text-white rounded p-1 border border-zinc-800 outline-none w-full"
                  />
                  {task.reminderTime && (
                    <button
                      onClick={() => updateReminder('')}
                      className="text-[9px] bg-red-950/50 border border-red-900/40 text-red-100 py-0.5 rounded hover:bg-red-900"
                    >
                      Удалить
                    </button>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Card Coloring Swatch Palettes */}
          <div className="relative">
            <button
              onClick={() => setShowPalette(!showPalette)}
              className="p-1 rounded-md hover:bg-white/10 transition-colors text-inherit/60"
            >
              <Palette className="w-3.5 h-3.5" />
            </button>
            <AnimatePresence>
              {showPalette && (
                <motion.div
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -5 }}
                  className="absolute right-0 top-7 z-50 p-2 rounded-xl border border-zinc-800 bg-zinc-950/95 shadow-2xl flex flex-wrap gap-1.5 w-36"
                >
                  {presets.map(p => (
                    <button
                      key={p.name}
                      onClick={() => selectColor(p.name)}
                      className={`w-6 h-6 rounded-md hover:scale-110 active:scale-95 transition-transform ${p.class}`}
                      title={p.name}
                    />
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Card Physics Immobilizer (Pin on Board) */}
          <button
            onClick={togglePin}
            className="p-1 rounded-md hover:bg-white/10 transition-colors text-inherit/60"
          >
            {task.pinned ? <Pin className="w-3.5 h-3.5 text-indigo-400" /> : <PinOff className="w-3.5 h-3.5" />}
          </button>

          {/* Deletion bin */}
          <button
            onClick={() => {
              playSnd('delete');
              onDelete(task.id);
            }}
            className="p-1 rounded-md hover:bg-red-950 hover:text-red-400 transition-colors text-inherit/60"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Title & Body content area */}
      <div className="px-4 pt-2.5 pb-2.5 flex-grow flex flex-col gap-1.5 overflow-visible">
        <input
          defaultValue={task.title}
          onBlur={handleTitleBlur}
          placeholder="Название заметки"
          className={`bg-transparent outline-none font-serif italic text-base tracking-tight leading-none border-b border-transparent hover:border-inherit/10 focus:border-indigo-500/30 w-full transition-colors ${
            task.status === 'completed' ? 'line-through text-inherit/35' : 'text-inherit font-medium'
          }`}
        />
        
        <textarea
          defaultValue={task.description}
          onBlur={handleDescBlur}
          placeholder="Введите свои задачи и примечания..."
          className={`bg-transparent outline-none font-sans font-light text-[11px] leading-relaxed resize-none w-full text-inherit/70 placeholder-inherit/30 transition-opacity ${
            task.status === 'completed' ? 'opacity-35' : ''
          }`}
          rows={hasMedia ? 2 : 3}
        />

        {/* --- ATTACHMENTS SECTION --- */}
        
        {/* 1. Image Attachment */}
        {task.attachedImage && (
          <div className="mt-1 rounded-xl border border-inherit/25 bg-black/10 dark:bg-black/25 overflow-hidden p-1 shadow-inner relative group select-none">
            <img 
              src={task.attachedImage} 
              alt="Attachment" 
              className="w-full max-h-[140px] object-cover rounded-lg"
              referrerPolicy="no-referrer"
            />
            {/* Delete Hover Accent */}
            <div className="absolute inset-x-0 bottom-2 flex justify-center pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
              <span className="text-[8px] font-mono font-bold tracking-wider text-white uppercase bg-red-650 bg-red-650/90 hover:bg-red-600 px-2 py-1 rounded shadow-md pointer-events-auto cursor-pointer" onClick={(e) => {
                e.stopPropagation();
                onUpdate({ ...task, attachedImage: undefined });
              }}>
                Удалить Фото
              </span>
            </div>
          </div>
        )}

        {/* 2. Audio Attachment (Custom Wave Player) */}
        {task.attachedAudio && (
          <div className="mt-1 rounded-xl border border-inherit/25 bg-white/5 dark:bg-black/30 p-2 flex flex-col gap-1.5 relative group">
            <div className="flex items-center gap-2">
              <button
                onClick={togglePlay}
                className="w-6 h-6 rounded-full bg-[#4D4DFF] hover:scale-105 active:scale-95 transition-all text-white flex items-center justify-center shadow"
              >
                {isPlaying ? <Pause className="w-3 h-3 fill-current text-white" /> : <Play className="w-3 h-3 fill-current text-white translate-x-0.5" />}
              </button>
              <div className="flex-1 min-w-0">
                <span className="text-[9px] font-mono block truncate opacity-90 leading-none">
                  {task.attachedAudioName || 'Audio track.mp3'}
                </span>
                <span className="text-[7.5px] font-mono text-zinc-400 block mt-0.5">
                  МУЗЫКА СЖАТИЯ
                </span>
              </div>
              <button
                onClick={() => {
                  if (isPlaying && audioRef.current) audioRef.current.pause();
                  setIsPlaying(false);
                  onUpdate({ ...task, attachedAudio: undefined, attachedAudioName: undefined });
                }}
                className="p-1 rounded text-zinc-400 hover:text-red-500 hover:bg-red-500/10 transition-colors opacity-0 group-hover:opacity-100"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
            {/* Track playhead progress */}
            <div className="w-full h-1 bg-zinc-750/50 rounded-full overflow-hidden relative">
              <div 
                className="h-full bg-gradient-to-r from-[#4D4DFF] to-pink-500 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {/* 3. Link Input View Mode */}
        {showLinkInput && (
          <div className="mt-1 p-1 rounded-xl border border-inherit/30 bg-black/10 flex items-center gap-1">
            <input 
              type="text"
              placeholder="Вставьте ссылку..."
              value={tempLink}
              onChange={(e) => setTempLink(e.target.value)}
              className="bg-transparent text-[10px] text-inherit outline-none flex-grow placeholder-zinc-500 px-1"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  if (tempLink.trim()) {
                    onUpdate({ ...task, attachedLink: tempLink.trim() });
                    setTempLink('');
                    setShowLinkInput(false);
                  }
                }
              }}
            />
            <button
              onClick={() => {
                if (tempLink.trim()) {
                  onUpdate({ ...task, attachedLink: tempLink.trim() });
                  setTempLink('');
                  setShowLinkInput(false);
                }
              }}
              className="px-1.5 py-0.5 rounded bg-emerald-600 text-white text-[9px] font-bold"
            >
              ОК
            </button>
            <button
              onClick={() => setShowLinkInput(false)}
              className="text-[9px] opacity-60 px-1"
            >
              Х
            </button>
          </div>
        )}

        {/* 4. Link Display Mode (Beautiful telegram-preview or youtube wrapper) */}
        {task.attachedLink && (
          <div className="mt-1">
            {getYouTubeId(task.attachedLink) ? (
              <div className="rounded-xl overflow-hidden border border-inherit/35 bg-black/35 aspect-video relative shadow-md">
                <iframe
                  width="100%"
                  height="100%"
                  src={`https://www.youtube.com/embed/${getYouTubeId(task.attachedLink)}?autoplay=0`}
                  title="YouTube Player"
                  frameBorder="0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                  className="w-full h-full"
                />
                <button
                  onClick={() => onUpdate({ ...task, attachedLink: undefined })}
                  className="absolute right-1.5 top-1.5 bg-black/80 hover:bg-red-650 hover:text-white p-1 rounded text-zinc-300 transition-colors"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <div className="rounded-xl border border-inherit/25 bg-[#4D4DFF]/5 dark:bg-white/5 p-1.5 flex items-start gap-2 relative group select-none">
                <div className="p-1 rounded-lg bg-indigo-500/15 text-indigo-400 flex items-center justify-center">
                  <Globe className="w-3.5 h-3.5" />
                </div>
                <div className="flex-1 min-w-0 pr-6">
                  <a 
                    href={task.attachedLink} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="text-[10px] font-sans font-bold hover:underline block truncate text-indigo-400 leading-none"
                  >
                    {(() => {
                      try {
                        return new URL(task.attachedLink).hostname;
                      } catch (e) {
                        return 'Открыть ссылку';
                      }
                    })()}
                  </a>
                  <span className="text-[8px] opacity-60 font-mono block mt-0.5 truncate leading-none">
                    {task.attachedLink}
                  </span>
                </div>
                <button
                  onClick={() => onUpdate({ ...task, attachedLink: undefined })}
                  className="absolute right-1 top-1 bg-black/40 hover:bg-red-600 hover:text-white p-0.5 rounded text-zinc-300 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Trash2 className="w-2.5 h-2.5" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer Indicators */}
      <div className="px-4 py-1.5 flex items-center justify-between text-[8px] font-mono text-inherit/50 border-t border-inherit/15 bg-inherit/5">
        <div className="flex items-center gap-2 uppercase tracking-widest font-bold">
          <span className={`px-1.5 py-0.5 rounded-sm text-[8px] ${getPrioColor(task.priority)}`}>
            {task.priority}
          </span>
          {task.pinned && (
            <span className="text-indigo-400 flex items-center gap-0.5 text-[7px]">
              ● ЗАФИКСИРОВАН
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span>{`ID-${task.id.replace('task_', '').slice(0, 4).toUpperCase() || '0492'}`}</span>
          <span className="opacity-30">/</span>
          <div className="flex items-center gap-0.5">
            <Clock className="w-2.5 h-2.5 opacity-70" />
            <span>{new Date(task.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }).toUpperCase()}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
