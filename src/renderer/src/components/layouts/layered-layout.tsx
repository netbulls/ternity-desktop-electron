import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Play, Square, FolderKanban, ChevronDown, ExternalLink } from 'lucide-react';
import { scaled } from '@/lib/scaled';
import { AnimatedDigit } from '../animated-digit';
import { ProjectPicker } from '../project-picker';
import { EntriesList } from '../entries-list';
import type { LayoutProps } from '../tray-popup';
import { formatTimer, formatDuration } from '../tray-popup';
import type { Stats } from '@/lib/api-types';

const breathingBorderAnimation = {
  borderColor: [
    'hsl(var(--primary) / 0.3)',
    'hsl(var(--primary) / 0.6)',
    'hsl(var(--primary) / 0.3)',
  ],
};

const breathingBorderTransition = {
  duration: 2,
  repeat: Infinity,
  ease: 'easeInOut' as const,
};

function StatsStrip({ stats }: { stats: Stats }) {
  return (
    <div className="flex border-b border-border">
      <div className="flex-1 py-2.5 text-center" style={{ padding: `${scaled(10)} ${scaled(16)}` }}>
        <div
          className="font-brand font-bold tabular-nums text-primary"
          style={{ fontSize: scaled(16) }}
        >
          {formatDuration(stats.todaySeconds)}
        </div>
        <div
          className="mt-0.5 font-brand uppercase tracking-widest text-muted-foreground"
          style={{ fontSize: scaled(8), letterSpacing: '1.5px' }}
        >
          Today
        </div>
      </div>
      <div className="w-px bg-border" />
      <div className="flex-1 py-2.5 text-center" style={{ padding: `${scaled(10)} ${scaled(16)}` }}>
        <div
          className="font-brand font-bold tabular-nums text-foreground"
          style={{ fontSize: scaled(16) }}
        >
          {formatDuration(stats.weekSeconds)}
        </div>
        <div
          className="mt-0.5 font-brand uppercase tracking-widest text-muted-foreground"
          style={{ fontSize: scaled(8), letterSpacing: '1.5px' }}
        >
          This Week
        </div>
      </div>
    </div>
  );
}

function PopupFooter({ webAppUrl }: { webAppUrl: string }) {
  return (
    <div
      className="flex items-center justify-center border-t border-border"
      style={{ padding: `${scaled(8)} ${scaled(16)}` }}
    >
      <button
        className="flex cursor-pointer items-center text-muted-foreground transition-colors hover:text-primary"
        style={{ fontSize: scaled(11), gap: scaled(4) }}
        onClick={() => window.electronAPI?.openExternal(webAppUrl)}
      >
        Open Ternity
        <ExternalLink style={{ width: scaled(10), height: scaled(10) }} />
      </button>
    </div>
  );
}

export function LayeredLayout({
  timerRunning,
  elapsed,
  currentEntry,
  onStart,
  onStop,
  onResume,
  onUpdateEntry,
  selectedProject,
  onProjectSelect,
  description,
  onDescriptionChange,
  onDescriptionCommit,
  entries,
  stats,
  projects,
  webAppUrl,
}: LayoutProps) {
  const digits = formatTimer(elapsed).split('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerAnchor, setPickerAnchor] = useState<{ top: number; bottom: number; left: number; right: number } | null>(null);
  const [pillPop, setPillPop] = useState(false);
  const pillRef = useRef<HTMLDivElement>(null);

  const handlePillClick = () => {
    if (pillRef.current) {
      const rect = pillRef.current.getBoundingClientRect();
      setPickerAnchor({ top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right });
    }
    setPickerOpen((o) => !o);
  };

  const handleProjectSelect = (project: Parameters<typeof onProjectSelect>[0]) => {
    onProjectSelect(project);
    setPickerOpen(false);
    setPillPop(true);
    setTimeout(() => setPillPop(false), 500);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <motion.div
        className="shrink-0"
        animate={{
          backgroundColor: timerRunning ? 'hsl(var(--primary) / 0.04)' : 'transparent',
          borderColor: timerRunning ? 'hsl(var(--primary) / 0.15)' : 'hsl(var(--border))',
        }}
        transition={{ duration: 0.3 }}
        style={{
          padding: scaled(16),
          borderBottom: '1px solid',
        }}
      >
        {/* Row 1: description / input */}
        <div style={{ marginBottom: scaled(8) }}>
          <AnimatePresence mode="wait" initial={false}>
            {timerRunning ? (
              <motion.div
                key="desc"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.15 }}
              >
                <div
                  className="truncate font-medium text-foreground"
                  style={{ fontSize: scaled(13), lineHeight: `${scaled(32)}` }}
                >
                  {currentEntry?.description || 'Untitled entry'}
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="input"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.15 }}
              >
                <input
                  className="w-full rounded-md border border-border bg-card text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary"
                  style={{
                    padding: `${scaled(6)} ${scaled(12)}`,
                    fontSize: scaled(12),
                    height: scaled(32),
                  }}
                  placeholder="What are you working on?"
                  value={description}
                  onChange={(e) => onDescriptionChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      (e.target as HTMLInputElement).blur();
                      if (timerRunning) {
                        onDescriptionCommit();
                      } else {
                        onStart();
                      }
                    }
                  }}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Row 2: project + timer + button */}
        <div className="flex items-center" style={{ gap: scaled(8), height: scaled(32) }}>
          <AnimatePresence mode="wait" initial={false}>
            {timerRunning ? (
              <motion.div
                key="tracking-project"
                className="flex items-center text-muted-foreground"
                style={{ fontSize: scaled(11), gap: scaled(5) }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                <div
                  className="rounded-full"
                  style={{
                    width: scaled(6),
                    height: scaled(6),
                    background:
                      currentEntry?.projectColor ?? selectedProject?.color ?? 'hsl(var(--primary))',
                  }}
                />
                {currentEntry ? (
                  <>
                    {currentEntry.clientName && <>{currentEntry.clientName} &middot; </>}
                    {currentEntry.projectName ?? 'No project'}
                  </>
                ) : (
                  <>No project</>
                )}
              </motion.div>
            ) : (
              <motion.div
                key="idle-project"
                className="relative"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                <motion.div
                  ref={pillRef}
                  className={`flex cursor-pointer items-center rounded bg-card text-muted-foreground transition-colors hover:border-primary/40 ${pillPop ? 'pill-pop' : ''}`}
                  style={{
                    gap: scaled(5),
                    padding: `${scaled(5)} ${scaled(10)}`,
                    fontSize: scaled(11),
                    border: '1px solid',
                  }}
                  animate={pickerOpen ? breathingBorderAnimation : { borderColor: 'hsl(var(--border))' }}
                  transition={pickerOpen ? breathingBorderTransition : { duration: 0.2 }}
                  onClick={handlePillClick}
                >
                  {selectedProject ? (
                    <>
                      <div
                        className="rounded-full"
                        style={{
                          width: scaled(6),
                          height: scaled(6),
                          background: selectedProject.color ?? 'hsl(var(--primary))',
                        }}
                      />
                      <span className="text-foreground">{selectedProject.name}</span>
                    </>
                  ) : (
                    <>
                      <FolderKanban style={{ width: scaled(12), height: scaled(12) }} />
                      Project
                    </>
                  )}
                  <ChevronDown style={{ width: scaled(10), height: scaled(10) }} />
                </motion.div>
                <AnimatePresence>
                  {pickerOpen && (
                    <ProjectPicker
                      selected={selectedProject}
                      onSelect={handleProjectSelect}
                      onClose={() => setPickerOpen(false)}
                      projects={projects}
                      anchorRect={pickerAnchor ?? undefined}
                    />
                  )}
                </AnimatePresence>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Timer display */}
          <motion.div
            className="ml-auto font-brand font-bold tabular-nums tracking-wider"
            style={{ fontSize: scaled(20), letterSpacing: '1px' }}
            animate={{
              color: timerRunning ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground) / 0.3)',
            }}
            transition={{ duration: 0.3 }}
          >
            {digits.map((d, i) => (
              <AnimatedDigit key={i} char={d} />
            ))}
          </motion.div>

          {/* Play / Stop button */}
          <AnimatePresence mode="wait" initial={false}>
            {timerRunning ? (
              <motion.button
                key="stop"
                className="flex shrink-0 items-center justify-center rounded-full bg-destructive text-white"
                style={{ width: scaled(32), height: scaled(32) }}
                initial={{ scale: 0.5, opacity: 0, rotate: -90 }}
                animate={{ scale: 1, opacity: 1, rotate: 0 }}
                exit={{ scale: 0.5, opacity: 0, rotate: 90 }}
                transition={{ type: 'spring', damping: 15, stiffness: 200 }}
                whileTap={{ scale: 0.85 }}
                onClick={onStop}
              >
                <Square style={{ width: scaled(14), height: scaled(14) }} fill="currentColor" />
              </motion.button>
            ) : (
              <motion.button
                key="start"
                className="flex shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
                style={{ width: scaled(32), height: scaled(32) }}
                initial={{ scale: 0.5, opacity: 0, rotate: 90 }}
                animate={{ scale: 1, opacity: 1, rotate: 0 }}
                exit={{ scale: 0.5, opacity: 0, rotate: -90 }}
                transition={{ type: 'spring', damping: 15, stiffness: 200 }}
                whileTap={{ scale: 0.85 }}
                onClick={onStart}
              >
                <Play style={{ width: scaled(14), height: scaled(14) }} fill="currentColor" />
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      <div className="shrink-0">
        <StatsStrip stats={stats} />
      </div>
      <div className="flex min-h-0 flex-1 flex-col">
        <EntriesList currentEntry={currentEntry} entries={entries} onResume={onResume} onUpdateEntry={onUpdateEntry} projects={projects} />
      </div>
      <div className="shrink-0">
        <PopupFooter webAppUrl={webAppUrl} />
      </div>
    </div>
  );
}
