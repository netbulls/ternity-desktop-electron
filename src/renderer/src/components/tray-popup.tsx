import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Loader2 } from 'lucide-react';
import { scaled } from '@/lib/scaled';
import { useScale } from '@/providers/scale-provider';
import { useAuth } from '@/providers/auth-provider';
import { DataProvider, useData } from '@/providers/data-provider';
import type { Entry, DayGroup, Stats, ProjectOption } from '@/lib/api-types';
import type { EnvironmentId } from '@/lib/environments';
import { PopupHeader } from './popup-header';
import { StatusBanner, type StatusState } from './status-banner';
import { SettingsContent } from './settings-content';
import { LoginView } from './login-view';
import { useLayout, type TimerStyleId } from '@/providers/layout-provider';
import { LiquidGlassLayout } from './layouts/liquid-glass-layout';
import { LayeredLayout } from './layouts/layered-layout';
import { HeroLayout } from './layouts/hero-layout';
import { ErrorBoundary } from './error-boundary';
import { SwitchConfirmation } from './switch-confirmation';
import { PreferencesSync } from './preferences-sync';
import { getConfirmTimerSwitch, setConfirmTimerSwitch } from '@/lib/preferences-sync';

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
  onUpdateEntry: (
    entryId: string,
    params: { description?: string; projectId?: string | null },
  ) => void;
  selectedProject: ProjectOption | null;
  onProjectSelect: (project: ProjectOption | null) => void;
  description: string;
  onDescriptionChange: (desc: string) => void;
  onDescriptionCommit: () => void;
  entries: DayGroup[];
  stats: Stats;
  projects: ProjectOption[];
  webAppUrl: string;
  timerStyle: TimerStyleId;
  environment: EnvironmentId;
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

export function useElapsedSeconds(startedAt: string | null, running: boolean, offset: number = 0): number {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!running || !startedAt) {
      setElapsed(offset);
      return;
    }

    const compute = () =>
      offset + Math.max(0, Math.round((Date.now() - new Date(startedAt).getTime()) / 1000));
    setElapsed(compute());
    const interval = setInterval(() => setElapsed(compute()), 1000);
    return () => clearInterval(interval);
  }, [startedAt, running, offset]);

  return elapsed;
}

// ============================================================
// TimerView — authenticated content using real data
// ============================================================

function TimerView({ onSettingsClick }: { onSettingsClick: () => void }) {
  const data = useData();
  const { layout, timerStyle } = useLayout();
  const { environment, environmentConfig } = useAuth();
  const [selectedProject, setSelectedProject] = useState<ProjectOption | null>(null);
  const [description, setDescription] = useState('');
  const [pendingResumeId, setPendingResumeId] = useState<string | null>(null);
  const statusState: StatusState = data.mutationError ? 'mutation-error' : 'none';
  const [statusDismissed, setStatusDismissed] = useState(false);
  // Reset dismissed state when a new mutation error appears
  const prevMutationError = useRef(data.mutationError);
  useEffect(() => {
    if (data.mutationError && data.mutationError !== prevMutationError.current) {
      setStatusDismissed(false);
    }
    prevMutationError.current = data.mutationError;
  }, [data.mutationError]);
  const completedDuration =
    data.timer.entry?.segments
      .filter((s) => s.durationSeconds != null)
      .reduce((sum, s) => sum + s.durationSeconds!, 0) ?? 0;
  const runningSegment = data.timer.entry?.segments.find(
    (s) => s.type === 'clocked' && !s.stoppedAt,
  );
  const elapsed = useElapsedSeconds(
    runningSegment?.startedAt ?? null,
    data.timer.running,
    completedDuration,
  );
  const descriptionCommitRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSyncedEntryIdRef = useRef<string | null>(null);
  const defaultProjectIdRef = useRef<string | null>(null);

  // Load default project preference from config and pre-select if idle
  useEffect(() => {
    window.electronAPI?.getDefaultProject().then((id) => {
      defaultProjectIdRef.current = id;
      if (id && !data.timer.running) {
        const match = data.projects.find((p) => p.id === id) ?? null;
        if (match) setSelectedProject(match);
      }
    });
  }, [data.projects]); // re-run when projects load

  // Sync when default project is changed in settings (while timer is idle)
  useEffect(() => {
    const handler = (e: Event) => {
      const id = (e as CustomEvent<string | null>).detail;
      defaultProjectIdRef.current = id;
      if (data.timer.running) return;
      const match = id ? (data.projects.find((p) => p.id === id) ?? null) : null;
      setSelectedProject(match);
    };
    window.addEventListener('default-project-changed', handler);
    return () => window.removeEventListener('default-project-changed', handler);
  }, [data.timer.running, data.projects]);

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
      ? (data.projects.find((p) => p.id === entry.projectId) ?? null)
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
    // Re-apply default project for the next timer, or clear
    const defaultMatch = defaultProjectIdRef.current
      ? (data.projects.find((p) => p.id === defaultProjectIdRef.current) ?? null)
      : null;
    setSelectedProject(defaultMatch);
    data.stopTimer();
  };
  const handleResume = (entryId: string) => {
    if (data.timer.running) {
      if (!getConfirmTimerSwitch()) {
        // Skip confirmation — switch immediately
        if (descriptionCommitRef.current) {
          clearTimeout(descriptionCommitRef.current);
          descriptionCommitRef.current = null;
        }
        data.resumeTimer(entryId);
        return;
      }
      setPendingResumeId(entryId);
      return;
    }
    // Not running — resume immediately (no confirmation needed)
    if (descriptionCommitRef.current) {
      clearTimeout(descriptionCommitRef.current);
      descriptionCommitRef.current = null;
    }
    data.resumeTimer(entryId);
  };

  const handleSwitchConfirm = () => {
    const entryId = pendingResumeId;
    setPendingResumeId(null);
    if (!entryId) return;
    if (descriptionCommitRef.current) {
      clearTimeout(descriptionCommitRef.current);
      descriptionCommitRef.current = null;
    }
    data.resumeTimer(entryId);
  };

  const handleSwitchCancel = () => {
    setPendingResumeId(null);
  };

  const handleSwitchConfirmDontAsk = () => {
    setConfirmTimerSwitch(false);
    window.dispatchEvent(new CustomEvent('confirm-timer-switch-changed', { detail: false }));
    handleSwitchConfirm();
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
      <div className="flex h-screen items-center justify-center">
        <Loader2
          className="animate-spin text-primary/40"
          style={{ width: scaled(24), height: scaled(24) }}
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

  const pendingEntryInfo = pendingResumeId
    ? (() => {
        for (const dg of data.entries) {
          const entry = dg.entries.find((e) => e.id === pendingResumeId);
          if (entry) return { entry, date: dg.date };
        }
        return null;
      })()
    : null;

  const layoutProps: LayoutProps = {
    timerRunning: data.timer.running,
    elapsed,
    currentEntry: effectiveEntry,
    onStart: handleStart,
    onStop: handleStop,
    onResume: handleResume,
    onUpdateEntry: data.updateEntry,
    selectedProject,
    onProjectSelect: handleProjectSelect,
    description,
    onDescriptionChange: handleDescriptionChange,
    onDescriptionCommit: handleDescriptionCommit,
    entries: data.entries,
    stats: data.stats,
    projects: data.projects,
    webAppUrl: environmentConfig.webAppUrl,
    timerStyle: layout === 'liquid-glass' ? timerStyle : 'default',
    environment,
  };

  const LayoutComponent =
    layout === 'hero' ? HeroLayout : layout === 'layered' ? LayeredLayout : LiquidGlassLayout;

  return (
    <div className="relative flex h-screen flex-col">
      <div className="relative shrink-0">
        <PopupHeader onSettingsClick={onSettingsClick} />
        <AnimatePresence>
          {statusState !== 'none' && !statusDismissed && (
            <StatusBanner
              status={statusState}
              onDismiss={() => {
                setStatusDismissed(true);
                data.dismissMutationError();
              }}
              onStopTimer={handleStop}
              mutationError={data.mutationError ?? undefined}
            />
          )}
        </AnimatePresence>
      </div>
      <LayoutComponent {...layoutProps} />
      <AnimatePresence>
        {pendingEntryInfo && effectiveEntry && data.timer.running && (
          <SwitchConfirmation
            key="switch-confirmation"
            currentEntry={effectiveEntry}
            targetEntry={pendingEntryInfo.entry}
            targetDate={pendingEntryInfo.date}
            startedAt={runningSegment?.startedAt ?? null}
            timerOffset={completedDuration}
            onConfirm={handleSwitchConfirm}
            onCancel={handleSwitchCancel}
            onDontAskAgain={handleSwitchConfirmDontAsk}
          />
        )}
      </AnimatePresence>
      <PreferencesSync />
    </div>
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
  const initialResizeDone = useRef(false);

  const popupWidth = Math.round(BASE_WIDTH * scale);
  const settingsWidth = Math.round(BASE_SETTINGS_WIDTH * scale);

  const resizeWidth = useCallback((w: number) => {
    window.electronAPI?.resizeWindow(w, 0); // height ignored by main process
  }, []);

  // Send initial width + trigger show on first meaningful render
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;

    const observer = new ResizeObserver(() => {
      if (!initialResizeDone.current && el.scrollHeight > 200) {
        initialResizeDone.current = true;
        const width = settingsOpenRef.current ? popupWidth + settingsWidth : popupWidth;
        resizeWidth(width);
      }
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, [popupWidth, settingsWidth, resizeWidth]);

  // Resize width when scale changes
  useEffect(() => {
    if (!initialResizeDone.current) return;
    const width = settingsOpenRef.current ? popupWidth + settingsWidth : popupWidth;
    resizeWidth(width);
  }, [popupWidth, settingsWidth, resizeWidth]);

  // Close settings panel when signing out
  useEffect(() => {
    if (!isAuthenticated && settingsOpenRef.current) {
      settingsOpenRef.current = false;
      setSettingsOpen(false);
      resizeWidth(popupWidth);
    }
  }, [isAuthenticated, popupWidth, resizeWidth]);

  const handleSettingsToggle = () => {
    if (settingsOpen) {
      settingsOpenRef.current = false;
      resizeWidth(popupWidth);
      setTimeout(() => setSettingsOpen(false), 150);
    } else {
      settingsOpenRef.current = true;
      setSettingsOpen(true);
      requestAnimationFrame(() => {
        resizeWidth(popupWidth + settingsWidth);
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
      <div className="flex min-h-0 flex-1">
        {/* Main popup column — stable ref for ResizeObserver */}
        <div
          ref={contentRef}
          className="flex flex-col"
          style={{ width: popupWidth, flexShrink: 0 }}
        >
          <AnimatePresence mode="wait">
            {isLoading ? (
              <div key="loading" className="flex h-screen items-center justify-center">
                <Loader2
                  className="animate-spin text-primary/40"
                  style={{ width: scaled(24), height: scaled(24) }}
                />
              </div>
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
                className="flex min-h-0 flex-1 flex-col"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
              >
                <ErrorBoundary>
                  <DataProvider>
                    <TimerView onSettingsClick={handleSettingsToggle} />
                  </DataProvider>
                </ErrorBoundary>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Settings expand panel */}
        {isAuthenticated && settingsOpen && (
          <div
            className="shrink-0 border-l border-border bg-background"
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
