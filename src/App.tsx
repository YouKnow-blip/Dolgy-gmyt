import React, { useEffect, useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  deleteDoc,
  getDoc,
  writeBatch
} from 'firebase/firestore';
import {
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged,
  User
} from 'firebase/auth';
import {
  Sparkles,
  Grid,
  Eye,
  LogIn,
  LogOut,
  Plus,
  Compass,
  RotateCcw,
  LayoutGrid,
  Zap,
  Bell,
  Brush,
  Eraser,
  MousePointer,
  HelpCircle,
  X,
  Database,
  CalendarDays,
  Image,
  Music
} from 'lucide-react';

import { db, auth, handleFirestoreError, OperationType } from './lib/firebase';
import { Task, Stroke, BoardSettings } from './types';
import WebGLBackground from './components/WebGLBackground';
import DrawingCanvas from './components/DrawingCanvas';
import Logo from './components/Logo';
import TaskCard from './components/TaskCard';
import { usePhysics } from './hooks/usePhysics';

export default function App() {
  // 1. Core State
  const [user, setUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  // Canvas layout State (Pan & Zoom)
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [showGrid, setShowGrid] = useState(true);

  // Drawing tools parameters
  const [activeTool, setActiveTool] = useState<'none' | 'draw' | 'erase'>('none');
  const [strokeColor, setStrokeColor] = useState('#6366f1'); // Teal/Indigo preset values
  const [strokeWidth, setStrokeWidth] = useState(4);
  const [brushStyle, setBrushStyle] = useState<'solid' | 'neon' | 'dashed' | 'dotted'>('solid');

  // Connection Linking Anchor state
  const [linkingSourceId, setLinkingSourceId] = useState<string | null>(null);
  const [hoveredTaskId, setHoveredTaskId] = useState<string | null>(null);

  // Link Rope Drag States
  const [draggingLinkSourceId, setDraggingLinkSourceId] = useState<string | null>(null);
  const [draggingLinkCurrentPos, setDraggingLinkCurrentPos] = useState<{ x: number; y: number } | null>(null);

  // Reminder Trigger state
  const [triggeredReminder, setTriggeredReminder] = useState<string | null>(null);
  const [activeReminders, setActiveReminders] = useState<{ id: string; title: string; time: string }[]>([]);
  const [showHelp, setShowHelp] = useState(false);

  // View toggle ('workspace' boards vs. classic aggregated overview grid)
  const [currentView, setCurrentView] = useState<'workspace' | 'analytics'>('workspace');

  // Infinite scroll pan drag state
  const isPanningRef = useRef(false);
  const startPanPosRef = useRef({ x: 0, y: 0 });
  const localStrokesRef = useRef<Stroke[]>([]);
  const drawingSyncTimerRef = useRef<number | null>(null);
  
  const directPhotoInputRef = useRef<HTMLInputElement>(null);
  const directAudioInputRef = useRef<HTMLInputElement>(null);

  // Keeps local strokes ref updated for debouncing
  useEffect(() => {
    localStrokesRef.current = strokes;
  }, [strokes]);

  // Audio synthethizer chime sound for reminders (Web Audio API)
  const playReminderChime = () => {
    try {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const now = ctx.currentTime;
      
      const playTone = (freq: number, start: number, duration: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.setValueAtTime(freq, start);
        gain.gain.setValueAtTime(0.15, start);
        gain.gain.exponentialRampToValueAtTime(0.01, start + duration);
        osc.start(start);
        osc.stop(start + duration);
      };

      // Play soft luxury arpeggio
      playTone(523.25, now, 0.4); // C5
      playTone(659.25, now + 0.15, 0.4); // E5
      playTone(783.99, now + 0.3, 0.6); // G5
    } catch (e) {
      // Ignored
    }
  };

  // 2. Authentication handlers
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setIsAuthLoading(false);
      if (u) {
        // Transfer any offline localStorage items to cloud upon initial login matching user UID!
        transferOfflineDataToCloud(u.uid);
      }
    });
    return () => unsub();
  }, []);

  const loginWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error('Login Error: ', error);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      setTasks([]);
      setStrokes([]);
      // Reset view
      setPanX(0);
      setPanY(0);
      setZoom(1);
    } catch (error) {
      console.error('Logout error: ', error);
    }
  };

  // 3. Sync Logic (Load Tasks and Sketch Strokes)
  useEffect(() => {
    if (isAuthLoading) return;

    if (user) {
      // Real-time Firestore Stream for Tasks
      const tasksPath = `users/${user.uid}/tasks`;
      const unsubTasks = onSnapshot(
        collection(db, tasksPath),
        (snap) => {
          const list: Task[] = [];
          snap.forEach((docSnap) => {
            list.push(docSnap.data() as Task);
          });
          setTasks(list);
        },
        (err) => {
          handleFirestoreError(err, OperationType.GET, tasksPath);
        }
      );

      // Realtime sketch strokes sync
      const strokePath = `users/${user.uid}/drawings`;
      const unsubStrokes = onSnapshot(
        collection(db, strokePath),
        (snap) => {
          snap.forEach((docSnap) => {
            if (docSnap.id === 'canvas_layer') {
              const data = docSnap.data();
              if (data && data.strokesData) {
                try {
                  const parsed = JSON.parse(data.strokesData) as Stroke[];
                  setStrokes(parsed);
                } catch (e) {
                  // silent
                }
              }
            }
          });
        },
        (err) => {
          handleFirestoreError(err, OperationType.GET, strokePath);
        }
      );

      // Realtime settings sync
      const settingsPath = `users/${user.uid}/settings`;
      const unsubSettings = onSnapshot(
        collection(db, settingsPath),
        (snap) => {
          snap.forEach((docSnap) => {
            if (docSnap.id === 'user_settings') {
              const pref = docSnap.data() as BoardSettings;
              if (pref.theme) setTheme(pref.theme);
              if (pref.showGrid !== undefined) setShowGrid(pref.showGrid);
            }
          });
        },
        (err) => {
          handleFirestoreError(err, OperationType.GET, settingsPath);
        }
      );

      return () => {
        unsubTasks();
        unsubStrokes();
        unsubSettings();
      };
    } else {
      // Load from Local Storage fallback for guest mode
      const cachedTasks = localStorage.getItem('board_tasks');
      const cachedDrawings = localStorage.getItem('board_drawings');
      const cachedTheme = localStorage.getItem('board_theme');
      
      if (cachedTasks) setTasks(JSON.parse(cachedTasks));
      if (cachedDrawings) setStrokes(JSON.parse(cachedDrawings));
      if (cachedTheme) setTheme(cachedTheme as 'dark' | 'light');
    }
  }, [user, isAuthLoading]);

  // Sync state modifications back to cloud or localStorage
  const saveTasks = async (nextTasks: Task[]) => {
    setTasks(nextTasks);
    if (!user) {
      localStorage.setItem('board_tasks', JSON.stringify(nextTasks));
      return;
    }
  };

  const saveStrokes = (nextStrokes: Stroke[]) => {
    setStrokes(nextStrokes);
    if (!user) {
      localStorage.setItem('board_drawings', JSON.stringify(nextStrokes));
      return;
    }

    // Debounce/Throttle drawing uploads by 1.5 seconds so canvas drawing has 0% freeze/jitter
    if (drawingSyncTimerRef.current) {
      window.clearTimeout(drawingSyncTimerRef.current);
    }

    drawingSyncTimerRef.current = window.setTimeout(async () => {
      const drawingPath = `users/${user.uid}/drawings`;
      try {
        await setDoc(doc(db, drawingPath, 'canvas_layer'), {
          id: 'canvas_layer',
          userId: user.uid,
          strokesData: JSON.stringify(nextStrokes),
          updatedAt: new Date().toISOString()
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, drawingPath);
      }
    }, 1500);
  };

  // Sync settings helper
  const saveThemeSettings = async (nextTheme: 'dark' | 'light') => {
    setTheme(nextTheme);
    localStorage.setItem('board_theme', nextTheme);
    if (user) {
      const settingsPath = `users/${user.uid}/settings`;
      try {
        await setDoc(doc(db, settingsPath, 'user_settings'), {
          id: 'user_settings',
          userId: user.uid,
          theme: nextTheme,
          showGrid,
          panX,
          panY,
          zoom,
          updatedAt: new Date().toISOString()
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, settingsPath);
      }
    }
  };

  // Transfers guest local offline cache vectors up into the cloud on Google login
  const transferOfflineDataToCloud = async (userId: string) => {
    const cachedTasks = localStorage.getItem('board_tasks');
    const cachedDrawings = localStorage.getItem('board_drawings');

    try {
      if (cachedTasks) {
        const list = JSON.parse(cachedTasks) as Task[];
        const batch = writeBatch(db);
        list.forEach(t => {
          const tDoc = doc(db, `users/${userId}/tasks`, t.id);
          batch.set(tDoc, { ...t, userId });
        });
        await batch.commit();
        localStorage.removeItem('board_tasks');
      }

      if (cachedDrawings) {
        await setDoc(doc(db, `users/${userId}/drawings`, 'canvas_layer'), {
          id: 'canvas_layer',
          userId,
          strokesData: cachedDrawings,
          updatedAt: new Date().toISOString()
        });
        localStorage.removeItem('board_drawings');
      }
    } catch (e) {
      console.warn("Error migrating database payload:", e);
    }
  };

  // 4. Position drag synchronization from physical engine
  const handlePhysicsPositionUpdate = useCallback((updates: { id: string; posX: number; posY: number }[]) => {
    setTasks(prev => {
      const updated = prev.map(t => {
        const up = updates.find(u => u.id === t.id);
        if (up) {
          return { ...t, posX: up.posX, posY: up.posY, updatedAt: new Date().toISOString() };
        }
        return t;
      });

      // Write changes synchronously
      if (!user) {
        localStorage.setItem('board_tasks', JSON.stringify(updated));
      } else {
        updates.forEach(async (up) => {
          const taskObj = updated.find(t => t.id === up.id);
          if (taskObj) {
            const taskPath = `users/${user.uid}/tasks`;
            try {
              await setDoc(doc(db, taskPath, up.id), taskObj);
            } catch (err) {
              handleFirestoreError(err, OperationType.WRITE, taskPath);
            }
          }
        });
      }

      return updated;
    });
  }, [user]);

  // Hook physics 2D simulation loop
  const {
    positions,
    startDrag,
    updateDragMouse,
    endDrag,
    shakeBoard,
    toggleLink,
    ropes
  } = usePhysics({
    tasks,
    onTasksPositionUpdate: handlePhysicsPositionUpdate,
    panX,
    panY,
    zoom
  });

  const handleDirectPhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = async () => {
        if (typeof reader.result === 'string') {
          const nextId = 'task_' + Math.floor(Math.random() * 10000000);
          const activeCenterX = (window.innerWidth / 2 - panX) / zoom;
          const activeCenterY = (window.innerHeight / 2 - panY) / zoom;

          const newTask: Task = {
            id: nextId,
            userId: user?.uid || 'guest',
            title: 'Фотокарточка',
            description: '',
            status: 'pending',
            priority: 'medium',
            color: 'Cyber Grape',
            posX: activeCenterX + (Math.random() * 80 - 40),
            posY: activeCenterY + (Math.random() * 80 - 40),
            pinned: false,
            attachedImage: reader.result,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };

          const nextTasks = [...tasks, newTask];
          await saveTasks(nextTasks);

          if (user) {
            const taskPath = `users/${user.uid}/tasks`;
            try {
              await setDoc(doc(db, taskPath, nextId), newTask);
            } catch (err) {
              handleFirestoreError(err, OperationType.CREATE, taskPath);
            }
          }
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDirectAudioUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = async () => {
        if (typeof reader.result === 'string') {
          const nextId = 'task_' + Math.floor(Math.random() * 10000000);
          const activeCenterX = (window.innerWidth / 2 - panX) / zoom;
          const activeCenterY = (window.innerHeight / 2 - panY) / zoom;

          const newTask: Task = {
            id: nextId,
            userId: user?.uid || 'guest',
            title: 'Музыкальная пауза',
            description: '',
            status: 'pending',
            priority: 'medium',
            color: 'Sapphire Sky',
            posX: activeCenterX + (Math.random() * 80 - 40),
            posY: activeCenterY + (Math.random() * 80 - 40),
            pinned: false,
            attachedAudio: reader.result,
            attachedAudioName: file.name,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };

          const nextTasks = [...tasks, newTask];
          await saveTasks(nextTasks);

          if (user) {
            const taskPath = `users/${user.uid}/tasks`;
            try {
              await setDoc(doc(db, taskPath, nextId), newTask);
            } catch (err) {
              handleFirestoreError(err, OperationType.CREATE, taskPath);
            }
          }
        }
      };
      reader.readAsDataURL(file);
    }
  };

  // 5. Tasks Creation / Updates / Deletions Controls
  const addNewTask = async (prio: 'low' | 'medium' | 'high' = 'medium') => {
    const nextId = 'task_' + Math.floor(Math.random() * 10000000);
    // Center the card relative to active board Pan offset coordinates
    const activeCenterX = (window.innerWidth / 2 - panX) / zoom;
    const activeCenterY = (window.innerHeight / 2 - panY) / zoom;

    const newTask: Task = {
      id: nextId,
      userId: user?.uid || 'guest',
      title: '',
      description: '',
      status: 'pending',
      priority: prio,
      color: 'Obsidian Coal',
      posX: activeCenterX + (Math.random() * 80 - 40),
      posY: activeCenterY + (Math.random() * 80 - 40),
      pinned: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const nextTasks = [...tasks, newTask];
    await saveTasks(nextTasks);

    if (user) {
      const taskPath = `users/${user.uid}/tasks`;
      try {
        await setDoc(doc(db, taskPath, nextId), newTask);
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, taskPath);
      }
    }
  };

  const handleTaskUpdate = async (updatedTask: Task) => {
    const nextTasks = tasks.map(t => (t.id === updatedTask.id ? updatedTask : t));
    await saveTasks(nextTasks);

    if (user) {
      const taskPath = `users/${user.uid}/tasks`;
      try {
        await setDoc(doc(db, taskPath, updatedTask.id), updatedTask);
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, taskPath);
      }
    }
  };

  const handleTaskDelete = async (id: string) => {
    const nextTasks = tasks.filter(t => t.id !== id);
    await saveTasks(nextTasks);

    if (user) {
      const taskPath = `users/${user.uid}/tasks`;
      try {
        await deleteDoc(doc(db, taskPath, id));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, taskPath);
      }
    }
  };

  // Clear drawings helper
  const clearDrawings = () => {
    saveStrokes([]);
  };

  // Connect rope joints initiator
  const handleLinkToggle = (id: string) => {
    if (!linkingSourceId) {
      setLinkingSourceId(id);
    } else {
      if (linkingSourceId !== id) {
        // Toggle physical constraint connection link details
        toggleLink(linkingSourceId, id);
      }
      setLinkingSourceId(null);
    }
  };

  // 6. Realtime Clock and Reminder Monitor Trigger Loop
  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      
      // Update running active reminders tray lists
      const pendingRemindList: { id: string; title: string; time: string }[] = [];
      
      tasks.forEach(t => {
        if (t.reminderTime && t.status === 'pending') {
          const remindDate = new Date(t.reminderTime);
          pendingRemindList.push({
            id: t.id,
            title: t.title || 'Untitled Node',
            time: remindDate.toLocaleDateString(undefined, { hour: '2-digit', minute: '2-digit' })
          });

          // Check for match triggers in 1 minute precision range
          const timeValDiff = Math.abs(now.getTime() - remindDate.getTime());
          if (timeValDiff < 30000 && triggeredReminder !== t.id) { // within 30 seconds
            setTriggeredReminder(t.id);
            playReminderChime();
          }
        }
      });

      setActiveReminders(pendingRemindList);
    }, 10000);

    return () => clearInterval(interval);
  }, [tasks, triggeredReminder]);

  // 7. Board space panning / dragging gestures
  const handleBoardMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    // Only permit panning if click is middle wheel, or with Spacebar modifier key, or tool is Pointer mode
    if (e.button === 1 || activeTool === 'none') {
      isPanningRef.current = true;
      startPanPosRef.current = { x: e.clientX - panX, y: e.clientY - panY };
      e.preventDefault();
    }
  };

  const handleBoardMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isPanningRef.current) {
      setPanX(e.clientX - startPanPosRef.current.x);
      setPanY(e.clientY - startPanPosRef.current.y);
    } else {
      // Updates standard physics drag positions
      updateDragMouse(e.clientX, e.clientY);
    }

    if (draggingLinkSourceId) {
      const boardMouseX = (e.clientX - panX) / zoom;
      const boardMouseY = (e.clientY - panY) / zoom;
      setDraggingLinkCurrentPos({ x: boardMouseX, y: boardMouseY });
    }
  };

  const handleBoardMouseUp = () => {
    isPanningRef.current = false;
    endDrag();
    setDraggingLinkSourceId(null);
    setDraggingLinkCurrentPos(null);
  };

  const handleLinkDragStart = (id: string, clientX: number, clientY: number) => {
    setDraggingLinkSourceId(id);
    const boardMouseX = (clientX - panX) / zoom;
    const boardMouseY = (clientY - panY) / zoom;
    setDraggingLinkCurrentPos({ x: boardMouseX, y: boardMouseY });
  };

  const handleLinkConnect = (sourceId: string, targetId: string) => {
    toggleLink(sourceId, targetId);
    setDraggingLinkSourceId(null);
    setDraggingLinkCurrentPos(null);
  };

  // Zoom slider helper
  const handleZoomChange = (factor: number) => {
    setZoom(prev => Math.min(Math.max(prev + factor, 0.4), 2.2));
  };

  const resetBoardViewport = () => {
    setPanX(0);
    setPanY(0);
    setZoom(1);
  };

  // Dynamic CSS themes class toggles
  const bgClass = theme === 'dark' ? 'bg-[#050505] text-[#E5E5E5]' : 'bg-[#FAF8F5] text-[#1C1A17]';

  return (
    <div className={`w-screen h-screen overflow-hidden relative font-sans select-none transition-colors duration-500 ${bgClass} ${theme}`}>
      
      {/* GLOWING AMBIENT SHADER WEBGL */}
      <WebGLBackground theme={theme} />

      {/* EDITORIAL RADIAL GLOW ACCENTS */}
      <div className="absolute inset-0 opacity-30 dark:opacity-45 pointer-events-none z-0 overflow-hidden">
        <div className="absolute top-[-12%] left-[-12%] w-[500px] h-[500px] bg-[#2200FF] rounded-full blur-[160px]"></div>
        <div className="absolute bottom-[-12%] right-[-12%] w-[600px] h-[600px] bg-[#00D1FF] rounded-full blur-[180px]"></div>
      </div>

      {/* AMBIENT BACKGROUND WATERMARK */}
      <div className="absolute top-28 right-12 text-right pointer-events-none select-none z-0 opacity-[0.03] dark:opacity-[0.07]">
        <h1 className="text-[36px] md:text-[48px] font-serif italic text-zinc-900 dark:text-white leading-none tracking-tight uppercase whitespace-nowrap">
          Долги Жмут
        </h1>
      </div>

      {/* ДолгиЖмут BRAND NAVBAR HEADER */}
      <header className="fixed top-5 left-1/2 -translate-x-1/2 w-[94%] max-w-6xl h-16 rounded-xl border border-black/10 dark:border-white/10 bg-white/70 dark:bg-zinc-950/75 backdrop-blur-2xl z-50 flex items-center justify-between px-8 shadow-2xl transition-all">
        
        {/* Left Branding with stylized stamp mascot logo */}
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 flex items-center justify-center bg-zinc-100/10 dark:bg-white/5 hover:scale-105 transition-transform duration-300 rounded-lg">
            <Logo className="w-9 h-9" />
          </div>
          <div className="flex flex-col">
            <span className="text-[14px] font-sans font-black tracking-widest text-[#4D4DFF] dark:text-[#a855f7] leading-none uppercase">
              ДолгиЖмут
            </span>
            <span className="text-[9px] font-mono tracking-wide text-zinc-500 dark:text-zinc-400 opacity-80 leading-none mt-1 uppercase">
              Физический Сжиматель Долгов
            </span>
          </div>
        </div>

        {/* Dynamic Global Dashboard View Selector Tabs */}
        <div className="flex items-center gap-1.5 bg-zinc-900/5 dark:bg-white/5 border border-zinc-900/10 dark:border-white/10 p-1 rounded-lg">
          <button
            onClick={() => setCurrentView('workspace')}
            className={`px-3.5 py-1.5 rounded-md text-[9px] uppercase tracking-widest font-bold flex items-center gap-1.5 transition-all ${
              currentView === 'workspace'
                ? 'bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 shadow-sm'
                : 'hover:bg-zinc-500/10 text-zinc-500 dark:text-zinc-400'
            }`}
          >
            <Compass className="w-3.5 h-3.5 font-bold" />
            <span className="hidden sm:inline">Доска Сжатия</span>
          </button>
          
          <button
            onClick={() => setCurrentView('analytics')}
            className={`px-3.5 py-1.5 rounded-md text-[9px] uppercase tracking-widest font-bold flex items-center gap-1.5 transition-all ${
              currentView === 'analytics'
                ? 'bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 shadow-sm'
                : 'hover:bg-zinc-500/10 text-zinc-500 dark:text-zinc-400'
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Матрица Обзора</span>
          </button>
        </div>

        {/* Quick controls and Profile triggers */}
        <div className="flex items-center gap-3.5">
          
          {/* Cloud encrypted live display */}
          <div className="hidden lg:flex flex-col items-end text-right justify-center">
            <span className="text-[8px] uppercase tracking-[0.15em] opacity-40 leading-none">Режим Безопасности</span>
            <span className={`text-[10px] font-mono mt-0.5 leading-none font-bold ${user ? 'text-[#00FF94]' : 'text-amber-500'}`}>
              ● {user ? 'ОБЛАЧНЫЙ СИНХРОН' : 'ЛОКАЛЬНЫЙ РЕЖИМ'}
            </span>
          </div>

          <span className="w-px h-6 bg-zinc-500/15 dark:bg-zinc-800" />

          {/* Action icon triggers */}
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => setShowHelp(true)}
              className="p-1.5 rounded-lg hover:bg-zinc-500/10 text-zinc-500 dark:text-zinc-400 transition-colors"
              title="Перейти к руководству"
            >
              <HelpCircle className="w-4 h-4" />
            </button>

            <button
              onClick={() => saveThemeSettings(theme === 'dark' ? 'light' : 'dark')}
              className="p-1.5 rounded-lg hover:bg-zinc-500/10 text-zinc-500 dark:text-zinc-400 transition-colors"
              title="Сменить Тему"
            >
              <Zap className={`w-4 h-4 ${theme === 'dark' ? 'text-zinc-400' : 'text-amber-500 fill-amber-500/15'}`} />
            </button>
          </div>

          {/* User account state block */}
          {isAuthLoading ? (
            <div className="w-8 h-8 rounded-full bg-zinc-700/10 dark:bg-zinc-850 animate-pulse" />
          ) : user ? (
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full border border-zinc-900/10 dark:border-white/20 overflow-hidden shadow-sm bg-gradient-to-tr from-zinc-700 to-zinc-500">
                <img
                  src={user.photoURL || undefined}
                  alt={user.displayName || 'Аккаунт'}
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              </div>
              <button
                onClick={handleSignOut}
                className="p-1.5 rounded-lg hover:bg-red-950/20 text-red-500 hover:text-red-400 transition-colors"
                title="Режим Выхода"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={loginWithGoogle}
              className="px-3.5 py-1.5 bg-[#4D4DFF] hover:bg-[#2200FF] active:scale-95 transition-all text-[9px] uppercase tracking-widest font-black rounded-lg text-white flex items-center gap-1 shadow-xl shadow-indigo-500/15"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Войти</span>
            </button>
          )}

        </div>
      </header>

      {/* CAMERA MAP CONTROL HUD (BOTTOM-LEFT MINIMALIST PANEL) */}
      <AnimatePresence>
        {currentView === 'workspace' && (
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -25 }}
            className="fixed bottom-6 left-6 z-40 p-4 rounded-xl border border-black/10 dark:border-white/10 bg-white/80 dark:bg-[#0A0A0A]/85 backdrop-blur-xl shadow-2xl flex items-center gap-3 w-fit"
          >
            <div className="flex flex-col gap-1 text-[9px] text-zinc-400 dark:text-zinc-500 font-bold uppercase tracking-widest font-mono">
              <span>КАМЕРА</span>
              <span className="text-zinc-950 dark:text-white font-mono text-xs font-semibold leading-none">
                {Math.round(zoom * 100)}%
              </span>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={() => handleZoomChange(0.1)}
                className="w-7 h-7 rounded-md border border-zinc-200 dark:border-zinc-800 bg-zinc-500/5 hover:bg-zinc-500/10 text-xs font-bold transition-all flex items-center justify-center focus:outline-none"
              >
                +
              </button>
              <button
                onClick={() => handleZoomChange(-0.1)}
                className="w-7 h-7 rounded-md border border-zinc-200 dark:border-zinc-800 bg-zinc-500/5 hover:bg-zinc-500/10 text-xs font-bold transition-all flex items-center justify-center focus:outline-none"
              >
                -
              </button>
              <button
                onClick={resetBoardViewport}
                className="p-1.5 rounded-md hover:bg-zinc-500/10 text-zinc-400 dark:text-zinc-500 transition-colors"
                title="Сбросить Камеру"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setShowGrid(!showGrid)}
                className={`p-1.5 rounded-md transition-colors ${
                  showGrid ? 'text-[#4D4DFF] bg-[#4D4DFF]/10' : 'text-zinc-400 dark:text-zinc-500 hover:bg-zinc-500/10'
                }`}
                title="Включить/Выключить Сетку"
              >
                <Grid className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={shakeBoard}
                className="p-1.5 rounded-md hover:bg-zinc-500/10 text-zinc-400 dark:text-zinc-500 transition-all hover:rotate-12"
                title="Встряхнуть Доску (Физика)"
              >
                <Database className="w-3.5 h-3.5" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* DRAWING BOARD PENCIL & BRUSH TOOL SETTINGS (BOTTOM CENTER TOOLBAR) */}
      <AnimatePresence>
        {currentView === 'workspace' && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex flex-col items-center gap-2.5 pointer-events-none">
            
            {/* Popover bar for brush settings (floats elegantly above the main switches) */}
            <AnimatePresence>
              {activeTool === 'draw' && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 10 }}
                  className="p-2 px-3 rounded-xl border border-black/10 dark:border-white/10 bg-white/90 dark:bg-[#0A0A0A]/90 backdrop-blur-xl shadow-xl flex items-center gap-3 w-fit pointer-events-auto"
                >
                  {/* Color dots */}
                  <div className="flex gap-1.5 items-center">
                    {['#4D4DFF', '#FF3D00', '#00FF94', '#00D1FF', '#FFB800', '#A814FF'].map(hex => (
                      <button
                        key={hex}
                        onClick={() => setStrokeColor(hex)}
                        style={{ backgroundColor: hex }}
                        className={`w-3.5 h-3.5 rounded-full transition-transform hover:scale-125 focus:outline-none ${
                          strokeColor === hex ? 'ring-2 ring-zinc-950 dark:ring-white scale-110' : ''
                        }`}
                        title="Цвет линии"
                      />
                    ))}
                  </div>

                  <span className="w-px h-4 bg-zinc-200 dark:bg-zinc-800" />

                  {/* Brush Styles */}
                  <div className="flex gap-1 items-center p-0.5 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg">
                    {([
                      { id: 'solid', label: 'Линия', dotClass: 'w-1.5 h-1.5 rounded-full bg-current' },
                      { id: 'neon', label: 'Неон', dotClass: 'w-2 h-2 rounded-full bg-indigo-500 shadow-[0_0_6px_rgba(99,102,241,0.9)]' },
                      { id: 'dashed', label: 'Штрих', dotClass: 'w-3 h-0.5 border-t border-dashed border-current' },
                      { id: 'dotted', label: 'Точки', dotClass: 'w-3 h-0.5 border-t border-dotted border-current' }
                    ] as const).map(style => (
                      <button
                        key={style.id}
                        onClick={() => setBrushStyle(style.id)}
                        className={`px-1.5 py-0.5 rounded text-[8px] font-mono tracking-wider font-bold uppercase transition-all flex items-center gap-1 ${
                          brushStyle === style.id
                            ? 'bg-zinc-900 text-white dark:bg-[#4D4DFF] dark:text-white shadow-sm'
                            : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-500/10'
                        }`}
                        title={`Стиль кисти: ${style.label}`}
                      >
                        <span className={style.dotClass} />
                        <span className="leading-none">{style.label}</span>
                      </button>
                    ))}
                  </div>

                  <span className="w-px h-4 bg-zinc-200 dark:bg-zinc-800" />

                  {/* Width slider */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-mono opacity-50 text-zinc-800 dark:text-zinc-300">{strokeWidth}px</span>
                    <input
                      type="range"
                      min="2"
                      max="14"
                      value={strokeWidth}
                      onChange={(e) => setStrokeWidth(Number(e.target.value))}
                      className="w-14 h-1 bg-zinc-300 dark:bg-zinc-800 rounded-lg appearance-none cursor-pointer outline-none Accent-[#4D4DFF]"
                      title="Толщина Линии"
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Main switcher mode bar */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 25 }}
              className="p-2 rounded-xl border border-black/10 dark:border-white/10 bg-white/80 dark:bg-[#0A0A0A]/85 backdrop-blur-xl shadow-2xl flex items-center gap-2 pointer-events-auto"
            >
              <button
                onClick={() => setActiveTool('none')}
                className={`p-2 rounded-lg transition-all ${
                  activeTool === 'none'
                    ? 'bg-zinc-950 text-white dark:bg-[#4D4DFF] dark:text-white shadow-md'
                    : 'hover:bg-zinc-500/10 text-zinc-400 dark:text-zinc-500'
                }`}
                title="Режим Курсора / Выбора"
              >
                <MousePointer className="w-4 h-4" />
              </button>

              <button
                onClick={() => setActiveTool('draw')}
                className={`p-2 rounded-lg transition-all ${
                  activeTool === 'draw'
                    ? 'bg-zinc-950 text-white dark:bg-[#4D4DFF] dark:text-white shadow-md'
                    : 'hover:bg-zinc-500/10 text-zinc-400 dark:text-zinc-500'
                }`}
                title="Кисть Рисования"
              >
                <Brush className="w-4 h-4" />
              </button>

              <button
                onClick={() => setActiveTool('erase')}
                className={`p-2 rounded-lg transition-all ${
                  activeTool === 'erase'
                    ? 'bg-zinc-950 text-white dark:bg-[#4D4DFF] dark:text-white shadow-md'
                    : 'hover:bg-zinc-500/10 text-zinc-400 dark:text-zinc-500'
                }`}
                title="Ластик"
              >
                <Eraser className="w-4 h-4" />
              </button>

              {strokes.length > 0 && (
                <>
                  <span className="w-px h-5 bg-zinc-200 dark:bg-zinc-800 mx-1" />
                  <button
                    onClick={clearDrawings}
                    className="px-2.5 py-1 text-[8px] font-mono hover:bg-red-500/10 border border-red-500/20 text-red-500 dark:text-red-400 hover:text-red-300 rounded-md font-bold transition-all uppercase tracking-wider"
                  >
                    Очистить Набросок
                  </button>
                </>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* QUICK FLOATING NEW TASK BENTO BUTTON (BOTTOM RIGHT BAR) */}
      <AnimatePresence>
        {currentView === 'workspace' && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 25 }}
            className="fixed bottom-6 right-8 z-45 flex flex-col gap-4 items-end"
          >
            <button
              onClick={() => addNewTask('high')}
              className="text-[9px] font-mono uppercase tracking-[0.25em] text-[#FF3D00] hover:text-[#ff5522] hover:scale-105 active:scale-95 transition-all mb-1"
            >
              ✦ Создать срочный долг (макс)
            </button>

            {/* Horizontal photocard & music card creators */}
            <div className="flex gap-2.5 items-center mr-2">
              <button
                onClick={() => directPhotoInputRef.current?.click()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-850 bg-white/75 dark:bg-zinc-950/80 hover:bg-[#4D4DFF]/10 text-zinc-700 dark:text-zinc-300 hover:text-[#4D4DFF] dark:hover:text-[#a855f7] transition-all text-[10px] font-medium shadow-md cursor-pointer pointer-events-auto active:scale-95"
                title="Добавить отдельную фотокарточку на полотно"
              >
                <Image className="w-3.5 h-3.5" />
                <span>Добавить фото</span>
              </button>
              <input
                type="file"
                ref={directPhotoInputRef}
                onChange={handleDirectPhotoUpload}
                accept="image/*"
                className="hidden"
              />

              <button
                onClick={() => directAudioInputRef.current?.click()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-850 bg-white/75 dark:bg-zinc-950/80 hover:bg-pink-500/10 text-zinc-700 dark:text-zinc-300 hover:text-pink-500 transition-all text-[10px] font-medium shadow-md cursor-pointer pointer-events-auto active:scale-95"
                title="Добавить отдельный музыкальный плеер на полотно"
              >
                <Music className="w-3.5 h-3.5" />
                <span>Добавить музыку</span>
              </button>
              <input
                type="file"
                ref={directAudioInputRef}
                onChange={handleDirectAudioUpload}
                accept="audio/*"
                className="hidden pointer-events-auto"
              />
            </div>
            
            {/* Editorial "Draft Task" button matching original HTML mockup perfectly */}
            <button
              onClick={() => addNewTask('medium')}
              className="group relative flex flex-col items-end gap-1.5 focus:outline-none text-right"
            >
              <div className="absolute -inset-4 bg-[#4D4DFF] opacity-0 group-hover:opacity-10 rounded-full blur-xl transition-all duration-500"></div>
              <span className="text-[10px] uppercase tracking-[0.3em] text-[#4D4DFF] font-semibold">Новое соображение</span>
              <span className="text-3xl md:text-4xl font-serif italic text-zinc-950 dark:text-zinc-50 border-b border-zinc-900/10 dark:border-white/10 pb-1.5 pr-2 group-hover:pr-5 transition-all duration-300">
                Записать Долг
              </span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* CENTRAL WORKSPACE INFINITE PLAYGROUND PANEL VIEW */}
      {currentView === 'workspace' && (
        <div
          onMouseDown={handleBoardMouseDown}
          onMouseMove={handleBoardMouseMove}
          onMouseUp={handleBoardMouseUp}
          onMouseLeave={handleBoardMouseUp}
          className="w-full h-full absolute inset-0 select-none overflow-hidden touch-none"
          style={{
            cursor: isPanningRef.current ? 'grabbing' : activeTool !== 'none' ? 'default' : 'grab',
            zIndex: 10,
          }}
        >
          {/* Subtle Dynamic grid alignment guidelines */}
          <div
            className="absolute inset-x-[-1000vw] inset-y-[-1000vh] pointer-events-none transition-opacity duration-300"
            style={{
              opacity: showGrid ? 1 : 0,
              transform: `translate3d(${panX}px, ${panY}px, 0) scale(${zoom})`,
              transformOrigin: '0 0',
              backgroundImage: theme === 'dark' 
                ? 'radial-gradient(rgba(255, 255, 255, 0.08) 1.2px, transparent 0)' 
                : 'radial-gradient(rgba(0, 0, 0, 0.05) 1.2px, transparent 0)',
              backgroundSize: '24px 24px',
            }}
          />

          {/* ACTIVE DRAWING CANVAS LAYERS */}
          <DrawingCanvas
            strokes={strokes}
            onStrokesChange={saveStrokes}
            panX={panX}
            panY={panY}
            zoom={zoom}
            activeTool={activeTool}
            strokeColor={strokeColor}
            strokeWidth={strokeWidth}
            brushStyle={brushStyle}
            draggingLinkSourceId={draggingLinkSourceId}
          />

          {/* PHYSICAL SVG ROPE JOINT LINKS CONNECTING CARD SHEETS */}
          <svg
            className="absolute inset-0 pointer-events-none fill-none"
            style={{
              transform: `translate3d(${panX}px, ${panY}px, 0) scale(${zoom})`,
              transformOrigin: '0 0',
              zIndex: 12,
            }}
          >
            <defs>
              <linearGradient id="ropeGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#818cf8" stopOpacity="0.8" />
                <stop offset="100%" stopColor="#ec4899" stopOpacity="0.8" />
              </linearGradient>
            </defs>
            {(() => {
              const paths: React.ReactNode[] = [];

              // Render existing established ropes
              ropes.forEach(rope => {
                const posA = positions[rope.nodeAId];
                const posB = positions[rope.nodeBId];
                if (!posA || !posB) return;

                const taskA = tasks.find(t => t.id === rope.nodeAId);
                const taskB = tasks.find(t => t.id === rope.nodeBId);
                const widthA = taskA?.width || 300;
                const widthB = taskB?.width || 300;

                // Source cards are centered at posA/posB. Anchor ropes from right edge of A to left edge of B
                const sX = posA.x + (widthA / 2);
                const sY = posA.y;
                const eX = posB.x - (widthB / 2);
                const eY = posB.y;

                const midX = (sX + eX) / 2;
                const midY = (sY + eY) / 2;
                const dx = eX - sX;
                const dy = eY - sY;
                const dist = Math.sqrt(dx * dx + dy * dy) || 1;

                // Sag depends on distance: shorter distance = more sag
                const sag = Math.max(30, Math.min(220, 50 + (350 - dist) * 0.4));
                const ctrlX = midX;
                const ctrlY = midY + sag;

                const pathD = `M ${sX} ${sY} Q ${ctrlX} ${ctrlY} ${eX} ${eY}`;

                const elapsed = rope.createdAt ? Date.now() - rope.createdAt : 999999;
                const animDuration = 1000; // 1 second drawing animation
                const isAnimating = elapsed < animDuration;
                
                const dashArray = isAnimating ? `${dist}` : undefined;
                const dashOffset = isAnimating ? `${dist * (1 - elapsed / animDuration)}` : undefined;

                paths.push(
                  <g key={rope.id}>
                    {/* Shadow Layer */}
                    <path
                      d={pathD}
                      stroke="rgba(0, 0, 0, 0.35)"
                      strokeWidth="5"
                      strokeLinecap="round"
                      strokeDasharray={dashArray}
                      strokeDashoffset={dashOffset}
                    />
                    {/* Glow Line */}
                    <path
                      d={pathD}
                      stroke="url(#ropeGradient)"
                      strokeWidth="3.2"
                      strokeLinecap="round"
                      className="animate-pulse"
                      strokeDasharray={dashArray}
                      strokeDashoffset={dashOffset}
                    />
                    {/* Core Line */}
                    <path
                      d={pathD}
                      stroke="rgba(255, 255, 255, 0.6)"
                      strokeWidth="1"
                      strokeLinecap="round"
                      strokeDasharray={dashArray}
                      strokeDashoffset={dashOffset}
                    />
                    {/* Spark Signal Shooting across newly connected rope */}
                    {isAnimating && (
                      <path
                        d={pathD}
                        stroke="#ffffff"
                        strokeWidth="3.5"
                        strokeLinecap="round"
                        strokeDasharray="40 1000"
                        strokeDashoffset={`${dist - (elapsed / animDuration) * dist}`}
                        style={{ filter: 'drop-shadow(0 0 5px #818cf8)' }}
                      />
                    )}
                  </g>
                );
              });

              // Render active draft dragging rope line connection
              if (draggingLinkSourceId && draggingLinkCurrentPos) {
                const posStart = positions[draggingLinkSourceId];
                const posEnd = draggingLinkCurrentPos;
                if (posStart) {
                  const taskStart = tasks.find(t => t.id === draggingLinkSourceId);
                  const widthStart = taskStart?.width || 300;
                  const sX = posStart.x + (widthStart / 2);
                  const sY = posStart.y;
                  const eX = posEnd.x;
                  const eY = posEnd.y;

                  const midX = (sX + eX) / 2;
                  const midY = (sY + eY) / 2;
                  const dx = eX - sX;
                  const dy = eY - sY;
                  const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                  const sag = Math.max(20, Math.min(180, 40 + (300 - dist) * 0.35));
                  const ctrlX = midX;
                  const ctrlY = midY + sag;

                  const pathD = `M ${sX} ${sY} Q ${ctrlX} ${ctrlY} ${eX} ${eY}`;

                  paths.push(
                    <g key="active-rope-draft">
                      <path
                        d={pathD}
                        stroke="rgba(0,0,0,0.3)"
                        strokeWidth="5"
                        strokeLinecap="round"
                      />
                      <path
                        d={pathD}
                        stroke="#818cf8"
                        strokeWidth="2.8"
                        strokeLinecap="round"
                        strokeDasharray="4 4"
                      />
                      <path
                        d={pathD}
                        stroke="#00ffff"
                        strokeWidth="1"
                        strokeLinecap="round"
                      />
                    </g>
                  );
                }
              }

              return paths;
            })()}
          </svg>

          {/* RENDER DYNAMIC CARD NODE LIST */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              transform: `translate3d(${panX}px, ${panY}px, 0) scale(${zoom})`,
              transformOrigin: '0 0',
              zIndex: 15,
            }}
          >
            <div className="relative w-full h-full pointer-events-none">
              <AnimatePresence>
                {tasks.map(task => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    position={positions[task.id]}
                    onUpdate={handleTaskUpdate}
                    onDelete={handleTaskDelete}
                    onDragStart={startDrag}
                    onLinkToggle={handleLinkToggle}
                    onLinkDragStart={handleLinkDragStart}
                    onLinkConnect={handleLinkConnect}
                    draggingLinkSourceId={draggingLinkSourceId}
                    isLinkingSource={linkingSourceId === task.id || draggingLinkSourceId === task.id}
                    isLinkingTarget={(linkingSourceId !== null && linkingSourceId !== task.id) || (draggingLinkSourceId !== null && draggingLinkSourceId !== task.id)}
                    theme={theme}
                    zoom={zoom}
                    hoveredTaskId={hoveredTaskId}
                    onHoverTask={setHoveredTaskId}
                  />
                ))}
              </AnimatePresence>
            </div>
          </div>

          {/* Workspace empty instructions card */}
          {tasks.length === 0 && (
            <div className="absolute top-[48%] left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none text-center flex flex-col items-center gap-3 w-5/6 max-w-sm border border-zinc-700/40 bg-zinc-900/60 backdrop-blur-md p-6 rounded-2xl shadow-2xl">
              <div className="w-12 h-12 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-400">
                <Compass className="w-6 h-6 animate-spin-slow" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-zinc-100">Доска Сжатия Долгов Пуста</h3>
                <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                  Нажмите на кнопку «Записать Долг» или «Создать срочный долг» внизу справа. Листы долгов парят в невесомости с физикой упругих столкновений! Нажмите на кружок у правого края карты и потяните нить, чтобы связать их.
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ALTERNATIVE HUD SUMMARY MATRIX VIEW (KANKAN BENTO LAYOUTS) */}
      <AnimatePresence>
        {currentView === 'analytics' && (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="w-full h-full pt-28 pb-10 px-6 overflow-y-auto relative z-30"
          >
            <div className="max-w-5xl mx-auto flex flex-col gap-6">

              {/* Grid Top Widgets stats */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                
                {/* Visual Card total ratio */}
                <div className="p-5 rounded-2xl border border-white/5 dark:border-zinc-800/80 bg-white/70 dark:bg-zinc-950/70 backdrop-blur-lg flex items-center justify-between shadow-lg shadow-black/5">
                  <div>
                    <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider block">Отношение Сжатых</span>
                    <span className="text-2xl font-black mt-1 block">
                      {tasks.filter(t => t.status === 'completed').length} / {tasks.length}
                    </span>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                    <Zap className="w-5 h-5" />
                  </div>
                </div>

                {/* Highly critical nodes priority */}
                <div className="p-5 rounded-2xl border border-white/5 dark:border-zinc-800/80 bg-white/70 dark:bg-zinc-950/70 backdrop-blur-lg flex items-center justify-between shadow-lg shadow-black/5">
                  <div>
                    <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider block">Критические карточки</span>
                    <span className="text-2xl font-black mt-1 text-rose-500 block">
                      {tasks.filter(t => t.priority === 'high' && t.status === 'pending').length}
                    </span>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-rose-500/10 flex items-center justify-center text-rose-500">
                    <Plus className="w-5 h-5" />
                  </div>
                </div>

                {/* Connected joints threads */}
                <div className="p-5 rounded-2xl border border-white/5 dark:border-zinc-800/80 bg-white/70 dark:bg-zinc-950/70 backdrop-blur-lg flex items-center justify-between shadow-lg shadow-black/5">
                  <div>
                    <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider block">Упругие сочленения</span>
                    <span className="text-2xl font-black mt-1 block">
                      {ropes.length} Нитей
                    </span>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-500 animate-pulse">
                    <Compass className="w-5 h-5" />
                  </div>
                </div>

              </div>

              {/* Structured Kanban columns matrix */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Column pending notes */}
                <div className="p-6 rounded-2xl border border-white/5 dark:border-zinc-800/60 bg-white/60 dark:bg-zinc-950/60 backdrop-blur-md flex flex-col gap-4">
                  <div className="flex items-center justify-between border-b dark:border-zinc-800 pb-3">
                    <h3 className="font-bold flex items-center gap-1.5 text-sm uppercase tracking-wider text-zinc-500">
                      <span>Карточки в Работе</span>
                      <span className="px-1.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 text-[10px]">
                        {tasks.filter(t => t.status === 'pending').length}
                      </span>
                    </h3>
                  </div>

                  <div className="flex flex-col gap-2 max-h-[420px] overflow-y-auto pr-1">
                    {tasks.filter(t => t.status === 'pending').map(task => (
                      <div
                        key={task.id}
                        className="p-3.5 rounded-xl border border-white/10 dark:border-zinc-800/80 bg-white/40 dark:bg-zinc-900/40 hover:bg-zinc-500/5 transition-colors flex items-center justify-between gap-3"
                      >
                        <div>
                          <p className="text-xs font-bold tracking-tight text-zinc-900 dark:text-zinc-100">{task.title || 'Новая заметка'}</p>
                          <p className="text-[10px] text-zinc-500 mt-0.5 max-w-[320px] truncate">{task.description || 'Нет описания'}</p>
                        </div>
                        <button
                          onClick={() => {
                            const nt = { ...task, status: 'completed' as const };
                            handleTaskUpdate(nt);
                          }}
                          className="p-1 px-1.5 rounded-lg border border-zinc-500/30 text-[10px] hover:bg-zinc-850 text-inherit/85"
                        >
                          Сжать
                        </button>
                      </div>
                    ))}
                    {tasks.filter(t => t.status === 'pending').length === 0 && (
                      <p className="text-xs text-zinc-400 text-center py-6">Все долги успешно возвращены и сжаты! Можно рисовать на холсте.</p>
                    )}
                  </div>
                </div>

                {/* Column completed notes */}
                <div className="p-6 rounded-2xl border border-white/5 dark:border-zinc-800/60 bg-white/60 dark:bg-zinc-950/60 backdrop-blur-md flex flex-col gap-4">
                  <div className="flex items-center justify-between border-b dark:border-zinc-800 pb-3">
                    <h3 className="font-bold flex items-center gap-1.5 text-sm uppercase tracking-wider text-zinc-500">
                      <span>Архив Сжатых Долгов</span>
                      <span className="px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 text-[10px]">
                        {tasks.filter(t => t.status === 'completed').length}
                      </span>
                    </h3>
                  </div>

                  <div className="flex flex-col gap-2 max-h-[420px] overflow-y-auto pr-1">
                    {tasks.filter(t => t.status === 'completed').map(task => (
                      <div
                        key={task.id}
                        className="p-3.5 rounded-xl border border-white/10 dark:border-zinc-800/80 bg-white/40 dark:bg-zinc-900/40 hover:bg-zinc-500/5 transition-colors flex items-center justify-between gap-3 opacity-60"
                      >
                        <div>
                          <p className="text-xs font-bold tracking-tight text-zinc-900 dark:text-zinc-100 line-through">{task.title}</p>
                          <p className="text-[10px] text-zinc-500 mt-0.5">{new Date(task.updatedAt).toLocaleDateString()}</p>
                        </div>
                        <button
                          onClick={() => {
                            const nt = { ...task, status: 'pending' as const };
                            handleTaskUpdate(nt);
                          }}
                          className="p-1 px-1.5 rounded-lg border border-zinc-500/30 text-[10px] hover:bg-zinc-850 text-inherit/60"
                        >
                          Вернуть
                        </button>
                      </div>
                    ))}
                    {tasks.filter(t => t.status === 'completed').length === 0 && (
                      <p className="text-xs text-zinc-400 text-center py-6">Сжатых долгов пока нет. Нажмите галочку на парящей карточке!</p>
                    )}
                  </div>
                </div>

              </div>

            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* FLOATING ACTIVE REMINDERS TRAY HUD PANEL (TOP RIGHT) */}
      <div className="fixed top-20 right-6 z-40 max-w-sm flex flex-col gap-1.5 pointer-events-none">
        
        {/* Triggered Alarm Banner */}
        <AnimatePresence>
          {triggeredReminder && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: -10 }}
              className="p-4 rounded-xl border border-amber-500 bg-amber-950/90 text-amber-50 shadow-2xl backdrop-blur-md flex items-start gap-3 pointer-events-auto"
            >
              <div className="p-2 bg-amber-500 text-black rounded-lg animate-bounce">
                <Bell className="w-5 h-5" />
              </div>
              <div className="flex-grow">
                <h4 className="font-bold text-xs">Calendar Reminder Fired!</h4>
                <p className="text-[11px] text-amber-200 mt-0.5">
                  Task title: <strong>{tasks.find(t => t.id === triggeredReminder)?.title || 'Untitled Node'}</strong> is due right now.
                </p>
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={() => {
                      const triggerTask = tasks.find(t => t.id === triggeredReminder);
                      if (triggerTask) {
                        const nt = { ...triggerTask, status: 'completed' as const };
                        handleTaskUpdate(nt);
                      }
                      setTriggeredReminder(null);
                    }}
                    className="p-1 px-2.5 bg-amber-500 hover:bg-amber-400 text-black text-[10px] font-black rounded-md"
                  >
                    Mark Done
                  </button>
                  <button
                    onClick={() => setTriggeredReminder(null)}
                    className="p-1 px-2.5 bg-amber-900 border border-amber-800 text-amber-200 text-[10px] font-bold rounded-md"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Regular list of reminders */}
        {activeReminders.length > 0 && (
          <div className="flex flex-col gap-1 select-none text-right">
            {activeReminders.slice(0, 3).map(r => (
              <div
                key={r.id}
                className="px-2.5 py-1 text-[9px] bg-zinc-900/65 backdrop-blur-md border border-zinc-800 text-zinc-300 rounded-lg inline-flex items-center gap-1.5 self-end"
              >
                <CalendarDays className="w-3 h-3 text-indigo-400" />
                <span>Due at <strong className="text-white">{r.time}</strong></span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* USER GUIDE HELP CENTER POPUP BOARD */}
      <AnimatePresence>
        {showHelp && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.9, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 15 }}
              className="p-6 rounded-2xl border border-zinc-800 bg-zinc-950 max-w-md w-full text-zinc-100 flex flex-col gap-4 text-xs shadow-2xl relative"
            >
              <button
                onClick={() => setShowHelp(false)}
                className="absolute top-4 right-4 p-1 hover:bg-zinc-800 text-zinc-400 hover:text-white rounded-lg transition-colors"
                title="Закрыть Руководство"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-2 border-b border-zinc-800 pb-3">
                <Sparkles className="w-5 h-5 text-indigo-400 animate-pulse" />
                <h3 className="font-bold text-sm tracking-tight">Руководство Сжимателя</h3>
              </div>

              <div className="flex flex-col gap-3">
                <div>
                  <h4 className="font-semibold text-zinc-300">🎮 Физическое Взаимодействие</h4>
                  <p className="text-zinc-400 mt-0.5 leading-relaxed">
                    Карточки долгов парят и упруго сталкиваются в невесомости холста. Перетаскивайте их за верхнюю шапку, чтобы запустить с инерцией. Нажмите на иконку булавки (Pin), чтобы жестко зафиксировать карточку.
                  </p>
                </div>

                <div>
                  <h4 className="font-semibold text-zinc-300">🔗 Упругие Межкарточные Связи</h4>
                  <p className="text-zinc-400 mt-0.5 leading-relaxed">
                    Соединяйте ваши карточки долгов! Нажмите на разъем у правого края Карточки А и перетащите нить на Карточку Б, чтобы связать их упругой светящейся неоновой связью. Они будут двигаться вместе!
                  </p>
                </div>

                <div>
                  <h4 className="font-semibold text-zinc-300">🎨 Рисование на Холсте</h4>
                  <p className="text-zinc-400 mt-0.5 leading-relaxed">
                    Выберите инструмент кисти на нижней панели, чтобы нарисовать стрелки, диаграммы или схемы решения долговых связей прямо на холсте. Переключитесь назад на курсор, чтобы передвигать карточки.
                  </p>
                </div>

                <div>
                  <h4 className="font-semibold text-zinc-300">☁️ Мгновенная Облачная База</h4>
                  <p className="text-zinc-400 mt-0.5 leading-relaxed">
                    Войдите через Google, чтобы сохранить ваши наброски и сети связей в реальном времени. Изменения физики будут мгновенно транслироваться на все ваши подключенные устройства.
                  </p>
                </div>
              </div>

              <button
                onClick={() => setShowHelp(false)}
                className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 font-bold rounded-lg mt-2 text-white transition-all shadow-md shadow-indigo-500/10"
              >
                Запустить Сжиматель
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
