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
import { LayeredLayout } from './layouts/layered-layout';
import { HeroLayout } from './layouts/hero-layout';

// ============================================================
// Exported types and helpers
// ============================================================

export type LayoutType = 'layered' | 'hero';

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
  layout,
  onSettingsClick,
}: {
  layout: LayoutType;
  onSettingsClick: () => void;
}) {
  const data = useData();
  const { environmentConfig } = useAuth();
  const [selectedProject, setSelectedProject] = useState<ProjectOption | null>(null);
  const [description, setDescription] = useState('');
  const [statusState] = useState<StatusState>('none');
  const [statusDismissed, setStatusDismissed] = useState(false);
  const elapsed = useElapsedSeconds(data.timer.entry?.startedAt ?? null, data.timer.running);

  const handleStart = async () => {
    await data.startTimer({
      description: description || undefined,
      projectId: selectedProject?.id,
    });
    setDescription('');
    setSelectedProject(null);
  };

  const handleStop = () => data.stopTimer();
  const handleResume = (entryId: string) => data.resumeTimer(entryId);

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

  const LayoutComponent = layout === 'layered' ? LayeredLayout : HeroLayout;

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
      <LayoutComponent
        timerRunning={data.timer.running}
        elapsed={elapsed}
        currentEntry={data.timer.entry}
        onStart={handleStart}
        onStop={handleStop}
        onResume={handleResume}
        selectedProject={selectedProject}
        onProjectSelect={setSelectedProject}
        description={description}
        onDescriptionChange={setDescription}
        entries={data.entries}
        stats={data.stats}
        projects={data.projects}
        webAppUrl={environmentConfig.webAppUrl}
      />
    </>
  );
}

// ============================================================
// TrayPopup — main shell (resize, settings panel, auth gating)
// ============================================================

const BASE_WIDTH = 345;
const BASE_SETTINGS_WIDTH = 240;

export function TrayPopup() {
  const { scale } = useScale();
  const { isAuthenticated, isLoading } = useAuth();
  const [layout, setLayout] = useState<LayoutType>('layered');
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
                  <TimerView layout={layout} onSettingsClick={handleSettingsToggle} />
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
