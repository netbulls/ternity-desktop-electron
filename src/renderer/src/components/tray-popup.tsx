import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Loader2 } from 'lucide-react';
import { scaled } from '@/lib/scaled';
import { useScale } from '@/providers/scale-provider';
import { useAuth } from '@/providers/auth-provider';
import { DataProvider, useData } from '@/providers/data-provider';
import type { Entry, DayGroup, Stats, ProjectOption } from '@/lib/api-types';
import { PopupHeader } from './popup-header';
import { StatusBanner, type StatusState } from './status-banner';
import { SettingsContent } from './settings-content';
import { LoginView } from './login-view';
import { useLayout } from '@/providers/layout-provider';
import { LiquidGlassLayout } from './layouts/liquid-glass-layout';
import { LayeredLayout } from './layouts/layered-layout';
import { HeroLayout } from './layouts/hero-layout';

// ============================================================
// Exported types and helpers
// ============================================================

export interface LayoutProps {
  timerRunning: boolean;
  elapsed: number;
  currentEntry: Entry | null;
  onStart: () => void;
  onStop: () => void;
  onResume: (entryId: string) => void;
  selectedProject: ProjectOption | null;
  onProjectSelect: (project: ProjectOption | null) => void;
  description: string;
  onDescriptionChange: (desc: string) => void;
  onDescriptionCommit: () => void;
  entries: DayGroup[];
  stats: Stats;
  projects: ProjectOption[];
  webAppUrl: string;
}

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
// useElapsedSeconds — ticks every second while timer is running
// ============================================================

function useElapsedSeconds(startedAt: string | null, running: boolean): number {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!running || !startedAt) {
      setElapsed(0);
      return;
    }

    const compute = () =>
      Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000));
    setElapsed(compute());
    const interval = setInterval(() => setElapsed(compute()), 1000);
    return () => clearInterval(interval);
  }, [startedAt, running]);

  return elapsed;
}

// ============================================================
// TimerView — authenticated content using real data
// ============================================================

function TimerView({
  onSettingsClick,
}: {
  onSettingsClick: () => void;
}) {
  const data = useData();
  const { layout } = useLayout();
  const { environmentConfig } = useAuth();
  const [selectedProject, setSelectedProject] = useState<ProjectOption | null>(null);
  const [description, setDescription] = useState('');
  const [statusState] = useState<StatusState>('none');
  const [statusDismissed, setStatusDismissed] = useState(false);
  const elapsed = useElapsedSeconds(data.timer.entry?.startedAt ?? null, data.timer.running);
  const descriptionCommitRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSyncedEntryIdRef = useRef<string | null>(null);
  const updateTimerRef = useRef(data.updateTimer);
  updateTimerRef.current = data.updateTimer;
  // Sync description + project from running entry (on resume or initial load)
  useEffect(() => {
    const entry = data.timer.entry;
    if (!data.timer.running || !entry) {
      lastSyncedEntryIdRef.current = null;
      return;
    }
    // Only sync when the entry changes (not on every poll)
    if (entry.id === lastSyncedEntryIdRef.current) return;
    lastSyncedEntryIdRef.current = entry.id;
    setDescription(entry.description || '');
    // Find matching project
    const matchedProject = entry.projectId
      ? data.projects.find((p) => p.id === entry.projectId) ?? null
      : null;
    setSelectedProject(matchedProject);
  }, [data.timer.running, data.timer.entry, data.projects]);

  const handleStart = async () => {
    await data.startTimer({
      description: description || undefined,
      projectId: selectedProject?.id,
    });
    // Don't clear — sync effect will pick up the running entry's values
  };

  const handleStop = () => {
    // Cancel any pending debounced update
    if (descriptionCommitRef.current) {
      clearTimeout(descriptionCommitRef.current);
      descriptionCommitRef.current = null;
    }
    lastSyncedEntryIdRef.current = null;
    setDescription('');
    setSelectedProject(null);
    data.stopTimer();
  };
  const handleResume = (entryId: string) => {
    // Cancel any pending debounced update from the previous entry
    if (descriptionCommitRef.current) {
      clearTimeout(descriptionCommitRef.current);
      descriptionCommitRef.current = null;
    }
    data.resumeTimer(entryId);
  };

  // Description update — debounced API call
  const handleDescriptionChange = useCallback(
    (desc: string) => {
      setDescription(desc);
      if (!data.timer.running || !data.timer.entry) return;
      if (descriptionCommitRef.current) clearTimeout(descriptionCommitRef.current);
      descriptionCommitRef.current = setTimeout(() => {
        updateTimerRef.current({ description: desc });
      }, 500);
    },
    [data.timer.running, data.timer.entry],
  );

  // Flush debounced description immediately (Enter key)
  const handleDescriptionCommit = useCallback(() => {
    if (descriptionCommitRef.current) {
      clearTimeout(descriptionCommitRef.current);
      descriptionCommitRef.current = null;
    }
    if (data.timer.running && data.timer.entry) {
      updateTimerRef.current({ description });
    }
  }, [data.timer.running, data.timer.entry, description]);

  // Project change — immediate sync to API while running
  const handleProjectSelect = useCallback(
    (project: ProjectOption | null) => {
      setSelectedProject(project);
      if (!data.timer.running || !data.timer.entry) return;
      updateTimerRef.current({ projectId: project?.id ?? null });
    },
    [data.timer.running, data.timer.entry],
  );

  if (data.isLoading) {
    return (
      <div className="flex items-center justify-center" style={{ padding: scaled(40) }}>
        <Loader2
          className="animate-spin text-primary"
          style={{ width: scaled(20), height: scaled(20) }}
        />
      </div>
    );
  }

  // Compute effective entry — merge local description so the list reflects edits in real-time.
  // Only override description (debounced). Project changes go through patchTimerLocal which
  // updates data.timer.entry directly, so no need to overlay project fields here.
  const effectiveEntry: Entry | null = (() => {
    const entry = data.timer.entry;
    if (!entry) return null;
    const synced = lastSyncedEntryIdRef.current === entry.id;
    if (!synced) return entry; // Before sync, show server data as-is
    return { ...entry, description };
  })();

  const layoutProps: LayoutProps = {
    timerRunning: data.timer.running,
    elapsed,
    currentEntry: effectiveEntry,
    onStart: handleStart,
    onStop: handleStop,
    onResume: handleResume,
    selectedProject,
    onProjectSelect: handleProjectSelect,
    description,
    onDescriptionChange: handleDescriptionChange,
    onDescriptionCommit: handleDescriptionCommit,
    entries: data.entries,
    stats: data.stats,
    projects: data.projects,
    webAppUrl: environmentConfig.webAppUrl,
  };

  const LayoutComponent =
    layout === 'hero' ? HeroLayout : layout === 'layered' ? LayeredLayout : LiquidGlassLayout;

  return (
    <>
      <div className="relative">
        <PopupHeader onSettingsClick={onSettingsClick} />
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
      <LayoutComponent {...layoutProps} />
    </>
  );
}

// ============================================================
// TrayPopup — main shell (resize, settings panel, auth gating)
// ============================================================

const BASE_WIDTH = 420;
const BASE_SETTINGS_WIDTH = 240;

export function TrayPopup() {
  const { scale } = useScale();
  const { isAuthenticated, isLoading } = useAuth();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsOpenRef = useRef(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const lastHeightRef = useRef(0);

  const popupWidth = Math.round(BASE_WIDTH * scale);
  const settingsWidth = Math.round(BASE_SETTINGS_WIDTH * scale);

  const resizeWindow = useCallback((w: number, h: number) => {
    window.electronAPI?.resizeWindow(w, h);
  }, []);

  // Auto-resize window height based on actual content
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

  // Also resize width when scale changes
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
      settingsOpenRef.current = false;
      resizeWindow(popupWidth, lastHeightRef.current || 520);
      setTimeout(() => setSettingsOpen(false), 150);
    } else {
      settingsOpenRef.current = true;
      setSettingsOpen(true);
      requestAnimationFrame(() => {
        resizeWindow(popupWidth + settingsWidth, lastHeightRef.current || 520);
      });
    }
  };

  return (
    <div
      className="relative overflow-hidden"
      style={{
        background: 'hsl(var(--background))',
        color: 'hsl(var(--foreground))',
        fontFamily: "'Inter', system-ui, sans-serif",
      }}
    >
      {/* Subtle ambient glow behind glass cards */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse at 50% 30%, hsl(var(--primary) / 0.03) 0%, transparent 70%)',
        }}
      />
      <div className="flex">
        {/* Main popup column — stable ref for ResizeObserver */}
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
                <DataProvider>
                  <TimerView onSettingsClick={handleSettingsToggle} />
                </DataProvider>
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
              <SettingsContent onClose={handleSettingsToggle} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
