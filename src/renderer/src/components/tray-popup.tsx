import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { scaled } from '@/lib/scaled';
import { useScale } from '@/providers/scale-provider';
import { useAuth } from '@/providers/auth-provider';
import { PopupHeader } from './popup-header';
import { StatusBanner, type StatusState } from './status-banner';
import { SettingsContent } from './settings-content';
import { LoginView } from './login-view';
import { LayeredLayout } from './layouts/layered-layout';
import { HeroLayout } from './layouts/hero-layout';

// ============================================================
// Exported types and mock data
// ============================================================

export type LayoutType = 'layered' | 'hero';

export interface MockEntry {
  id: string;
  description: string;
  project: string;
  client: string;
  color: string;
  duration: string;
  durationSec: number;
}

export interface MockProject {
  id: string;
  name: string;
  client: string;
  color: string;
}

export interface TrackingContext {
  description: string;
  project: string;
  client: string;
  color: string;
}

export interface LayoutProps {
  timer: ReturnType<typeof useFakeTimer>;
  tracking: TrackingContext | null;
  onStart: () => void;
  onStop: () => void;
  onPlay: (entry: MockEntry) => void;
  selectedProject: MockProject | null;
  onProjectSelect: (project: MockProject | null) => void;
  description: string;
  onDescriptionChange: (desc: string) => void;
  weekEntries: MockDayGroup[];
}

export interface MockDayGroup {
  label: string;
  total: string;
  entries: MockEntry[];
}

export const MOCK_WEEK: MockDayGroup[] = [
  {
    label: 'Today',
    total: '3h 45m',
    entries: [
      {
        id: 'e1',
        description: 'TERN-42 Timer component',
        project: 'Ternity App',
        client: 'Acme Corp',
        color: 'hsl(var(--t-project-1))',
        duration: '1h 45m',
        durationSec: 6300,
      },
      {
        id: 'e2',
        description: 'Sprint planning',
        project: 'Legal500',
        client: 'Legal500',
        color: 'hsl(var(--t-project-2))',
        duration: '1h 15m',
        durationSec: 4500,
      },
      {
        id: 'e3',
        description: 'Client feedback review',
        project: 'Exegy',
        client: 'Exegy',
        color: 'hsl(var(--t-project-3))',
        duration: '45m',
        durationSec: 2700,
      },
    ],
  },
  {
    label: 'Yesterday',
    total: '6h 15m',
    entries: [
      {
        id: 'e4',
        description: 'Deploy pipeline fix',
        project: 'Internal',
        client: 'Internal',
        color: 'hsl(var(--primary))',
        duration: '2h 30m',
        durationSec: 9000,
      },
      {
        id: 'e5',
        description: 'Code review: auth module',
        project: 'Ternity App',
        client: 'Acme Corp',
        color: 'hsl(var(--t-project-1))',
        duration: '1h 45m',
        durationSec: 6300,
      },
      {
        id: 'e6',
        description: 'Design sync meeting',
        project: 'Legal500',
        client: 'Legal500',
        color: 'hsl(var(--t-project-2))',
        duration: '45m',
        durationSec: 2700,
      },
      {
        id: 'e7',
        description: 'Bug triage & prioritization',
        project: 'Exegy',
        client: 'Exegy',
        color: 'hsl(var(--t-project-3))',
        duration: '1h 15m',
        durationSec: 4500,
      },
    ],
  },
  {
    label: 'Monday',
    total: '5h 30m',
    entries: [
      {
        id: 'e8',
        description: 'TERN-38 Login flow',
        project: 'Ternity App',
        client: 'Acme Corp',
        color: 'hsl(var(--t-project-1))',
        duration: '3h 00m',
        durationSec: 10800,
      },
      {
        id: 'e9',
        description: 'Staging deploy',
        project: 'Internal',
        client: 'Internal',
        color: 'hsl(var(--primary))',
        duration: '1h 00m',
        durationSec: 3600,
      },
      {
        id: 'e10',
        description: 'Client call prep',
        project: 'Legal500',
        client: 'Legal500',
        color: 'hsl(var(--t-project-2))',
        duration: '1h 30m',
        durationSec: 5400,
      },
    ],
  },
  {
    label: 'Sunday',
    total: '2h 00m',
    entries: [
      {
        id: 'e11',
        description: 'Hotfix: session timeout',
        project: 'Ternity App',
        client: 'Acme Corp',
        color: 'hsl(var(--t-project-1))',
        duration: '2h 00m',
        durationSec: 7200,
      },
    ],
  },
  {
    label: 'Saturday',
    total: '1h 30m',
    entries: [
      {
        id: 'e12',
        description: 'Documentation update',
        project: 'Internal',
        client: 'Internal',
        color: 'hsl(var(--primary))',
        duration: '1h 30m',
        durationSec: 5400,
      },
    ],
  },
  {
    label: 'Friday',
    total: '7h 15m',
    entries: [
      {
        id: 'e13',
        description: 'Dashboard charts refactor',
        project: 'Exegy',
        client: 'Exegy',
        color: 'hsl(var(--t-project-3))',
        duration: '2h 30m',
        durationSec: 9000,
      },
      {
        id: 'e14',
        description: 'API endpoint testing',
        project: 'Ternity App',
        client: 'Acme Corp',
        color: 'hsl(var(--t-project-1))',
        duration: '1h 45m',
        durationSec: 6300,
      },
      {
        id: 'e15',
        description: 'Sprint retrospective',
        project: 'Internal',
        client: 'Internal',
        color: 'hsl(var(--primary))',
        duration: '1h 00m',
        durationSec: 3600,
      },
      {
        id: 'e16',
        description: 'Contract review setup',
        project: 'Legal500',
        client: 'Legal500',
        color: 'hsl(var(--t-project-2))',
        duration: '2h 00m',
        durationSec: 7200,
      },
    ],
  },
  {
    label: 'Thursday',
    total: '6h 00m',
    entries: [
      {
        id: 'e17',
        description: 'TERN-35 Notification system',
        project: 'Ternity App',
        client: 'Acme Corp',
        color: 'hsl(var(--t-project-1))',
        duration: '3h 30m',
        durationSec: 12600,
      },
      {
        id: 'e18',
        description: 'Weekly standup',
        project: 'Internal',
        client: 'Internal',
        color: 'hsl(var(--primary))',
        duration: '30m',
        durationSec: 1800,
      },
      {
        id: 'e19',
        description: 'Filter component bugfix',
        project: 'Exegy',
        client: 'Exegy',
        color: 'hsl(var(--t-project-3))',
        duration: '2h 00m',
        durationSec: 7200,
      },
    ],
  },
];

export const MOCK_PROJECTS: MockProject[] = [
  { id: 'p1', name: 'Ternity App', client: 'Acme Corp', color: 'hsl(var(--t-project-1))' },
  { id: 'p2', name: 'Legal500', client: 'Legal500', color: 'hsl(var(--t-project-2))' },
  { id: 'p3', name: 'Exegy Dashboard', client: 'Exegy', color: 'hsl(var(--t-project-3))' },
  { id: 'p4', name: 'Internal', client: '', color: 'hsl(var(--primary))' },
  { id: 'p5', name: 'Mobile App', client: 'Acme Corp', color: 'hsl(var(--t-project-1))' },
  { id: 'p6', name: 'Data Pipeline', client: 'Exegy', color: 'hsl(var(--t-project-3))' },
  { id: 'p7', name: 'Brand Refresh', client: 'Legal500', color: 'hsl(var(--t-project-2))' },
  { id: 'p8', name: 'DevOps', client: '', color: 'hsl(var(--primary))' },
  { id: 'p9', name: 'API Gateway', client: 'Acme Corp', color: 'hsl(var(--t-project-1))' },
  { id: 'p10', name: 'QA Automation', client: 'Exegy', color: 'hsl(var(--t-project-3))' },
];

export const MOCK_STATS = { today: '3h 45m', week: '28h 30m' };
export const MOCK_STATS_TRACKING = { today: '5h 08m', week: '29h 53m' };

// ============================================================
// Fake timer hook
// ============================================================

export function useFakeTimer() {
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [tick, setTick] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const start = useCallback((fromElapsed?: number) => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = null;
    setRunning(true);
    setElapsed(fromElapsed ?? 0);
    setTick((t) => t + 1); // force effect re-run even if already running
  }, []);

  const stop = useCallback(() => {
    setRunning(false);
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = null;
    setElapsed(0);
  }, []);

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [running, tick]);

  return { running, elapsed, start, stop };
}

// ============================================================
// Helpers
// ============================================================

export function formatTimer(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  return `${m}m`;
}

// ============================================================
// TrayPopup — main state orchestrator
// ============================================================

// Base dimensions at scale 1.0 — multiplied by current scale for actual window size
const BASE_WIDTH = 345;
const BASE_SETTINGS_WIDTH = 240;

export function TrayPopup() {
  const timer = useFakeTimer();
  const { scale } = useScale();
  const { isAuthenticated, isLoading } = useAuth();
  const [layout, setLayout] = useState<LayoutType>('layered');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsOpenRef = useRef(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const lastHeightRef = useRef(0);
  const [selectedProject, setSelectedProject] = useState<MockProject | null>(null);
  const [description, setDescription] = useState('');
  const [tracking, setTracking] = useState<TrackingContext | null>(null);
  const [statusState] = useState<StatusState>('none');
  const [statusDismissed, setStatusDismissed] = useState(false);

  const popupWidth = Math.round(BASE_WIDTH * scale);
  const settingsWidth = Math.round(BASE_SETTINGS_WIDTH * scale);

  const startTracking = (ctx: TrackingContext) => {
    // Just replace current tracking — only explicit stop saves to the list
    setTracking(ctx);
    setDescription(ctx.description);
    timer.start();
  };

  const handleStart = () => {
    const proj = selectedProject;
    startTracking({
      description: description || 'Untitled entry',
      project: proj?.name ?? 'No project',
      client: proj?.client ?? '',
      color: proj?.color ?? 'hsl(var(--primary))',
    });
  };

  const handleStop = () => {
    setTracking(null);
    setDescription('');
    setSelectedProject(null);
    timer.stop();
  };

  const handlePlay = (entry: MockEntry) => {
    startTracking({
      description: entry.description,
      project: entry.project,
      client: entry.client,
      color: entry.color,
    });
  };

  const resizeWindow = useCallback((w: number, h: number) => {
    window.electronAPI?.resizeWindow(w, h);
  }, []);

  // Auto-resize window height based on actual content (handles layout switch + scale change)
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;

    const observer = new ResizeObserver(() => {
      const height = Math.ceil(el.scrollHeight);
      if (Math.abs(height - lastHeightRef.current) < 2) return;
      lastHeightRef.current = height;
      const width = settingsOpenRef.current ? popupWidth + settingsWidth : popupWidth;
      resizeWindow(width, height);
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, [popupWidth, settingsWidth, resizeWindow]);

  // Also resize width when scale changes (ResizeObserver only catches height)
  useEffect(() => {
    const width = settingsOpenRef.current ? popupWidth + settingsWidth : popupWidth;
    if (lastHeightRef.current > 0) {
      resizeWindow(width, lastHeightRef.current);
    }
  }, [popupWidth, settingsWidth, resizeWindow]);

  // Close settings panel when signing out
  useEffect(() => {
    if (!isAuthenticated && settingsOpenRef.current) {
      settingsOpenRef.current = false;
      setSettingsOpen(false);
      resizeWindow(popupWidth, lastHeightRef.current || 520);
    }
  }, [isAuthenticated, popupWidth, resizeWindow]);

  const handleSettingsToggle = () => {
    if (settingsOpen) {
      // Closing: resize window first so panel gets clipped, then remove from DOM
      settingsOpenRef.current = false;
      resizeWindow(popupWidth, lastHeightRef.current || 520);
      setTimeout(() => setSettingsOpen(false), 150);
    } else {
      // Opening: render panel first, then expand window
      settingsOpenRef.current = true;
      setSettingsOpen(true);
      requestAnimationFrame(() => {
        resizeWindow(popupWidth + settingsWidth, lastHeightRef.current || 520);
      });
    }
  };

  const LayoutComponent = layout === 'layered' ? LayeredLayout : HeroLayout;

  return (
    <div
      className="relative overflow-hidden"
      style={{
        background: 'hsl(var(--background))',
        color: 'hsl(var(--foreground))',
        fontFamily: "'Inter', system-ui, sans-serif",
      }}
    >
      <div className="flex">
        {/* Main popup column */}
        <div ref={contentRef} style={{ width: popupWidth, flexShrink: 0 }}>
          <AnimatePresence mode="wait">
            {isLoading ? (
              <div key="loading" />
            ) : !isAuthenticated ? (
              <motion.div
                key="login"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.2 }}
              >
                <LoginView />
              </motion.div>
            ) : (
              <motion.div
                key="timer"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
              >
                <div className="relative">
                  <PopupHeader onSettingsClick={handleSettingsToggle} />
                  <AnimatePresence>
                    {statusState !== 'none' && !statusDismissed && (
                      <StatusBanner
                        status={statusState}
                        onDismiss={() => setStatusDismissed(true)}
                        onStopTimer={handleStop}
                      />
                    )}
                  </AnimatePresence>
                </div>
                <LayoutComponent
                  timer={timer}
                  tracking={tracking}
                  onStart={handleStart}
                  onStop={handleStop}
                  onPlay={handlePlay}
                  selectedProject={selectedProject}
                  onProjectSelect={setSelectedProject}
                  description={description}
                  onDescriptionChange={setDescription}
                  weekEntries={MOCK_WEEK}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Settings expand panel */}
        {isAuthenticated && settingsOpen && (
          <div
            className="shrink-0 overflow-hidden border-l border-border bg-background"
            style={{ width: scaled(240) }}
          >
            <div style={{ width: scaled(240) }}>
              <SettingsContent
                layout={layout}
                onLayoutChange={setLayout}
                onClose={handleSettingsToggle}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
