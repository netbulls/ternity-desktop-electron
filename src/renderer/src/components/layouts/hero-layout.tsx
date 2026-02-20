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

function MiniCards({ stats }: { stats: Stats }) {
  return (
    <div
      className="grid grid-cols-2 border-b border-border"
      style={{ gap: scaled(6), padding: `${scaled(8)} ${scaled(16)}` }}
    >
      <div
        className="rounded-md border bg-card"
        style={{
          padding: `${scaled(8)} ${scaled(10)}`,
          borderColor: 'hsl(var(--border) / 0.5)',
        }}
      >
        <div
          className="font-brand font-bold tabular-nums text-primary"
          style={{ fontSize: scaled(15) }}
        >
          {formatDuration(stats.todaySeconds)}
        </div>
        <div
          className="font-brand uppercase tracking-wider text-muted-foreground"
          style={{ fontSize: scaled(9), letterSpacing: '1px', marginTop: '1px' }}
        >
          Today
        </div>
      </div>
      <div
        className="rounded-md border bg-card"
        style={{
          padding: `${scaled(8)} ${scaled(10)}`,
          borderColor: 'hsl(var(--border) / 0.5)',
        }}
      >
        <div
          className="font-brand font-bold tabular-nums text-foreground"
          style={{ fontSize: scaled(15) }}
        >
          {formatDuration(stats.weekSeconds)}
        </div>
        <div
          className="font-brand uppercase tracking-wider text-muted-foreground"
          style={{ fontSize: scaled(9), letterSpacing: '1px', marginTop: '1px' }}
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

export function HeroLayout({
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
  const pillRef = useRef<HTMLDivElement>(null);

  return (
    <>
      <motion.div
        className="relative text-center"
        animate={{
          backgroundColor: timerRunning ? 'hsl(var(--primary) / 0.03)' : 'transparent',
        }}
        transition={{ duration: 0.3 }}
        style={{ padding: `${scaled(20)} ${scaled(16)}` }}
      >
        {/* Radial glow */}
        <motion.div
          className="pointer-events-none absolute inset-0"
          animate={{ opacity: timerRunning ? 1 : 0 }}
          transition={{ duration: 0.3 }}
          style={{
            background:
              'radial-gradient(ellipse at center, hsl(var(--primary) / 0.04) 0%, transparent 70%)',
          }}
        />

        {/* Big timer */}
        <motion.div
          className="relative font-brand font-bold tabular-nums tracking-wider"
          style={{ fontSize: scaled(36), letterSpacing: '2px', lineHeight: 1 }}
          animate={{
            color: timerRunning ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground) / 0.2)',
          }}
          transition={{ duration: 0.3 }}
        >
          {digits.map((d, i) => (
            <AnimatedDigit key={i} char={d} />
          ))}
        </motion.div>

        {/* Input / description row + button */}
        <div
          className="relative flex items-center justify-center"
          style={{ gap: scaled(12), marginTop: scaled(14), height: scaled(32) }}
        >
          <AnimatePresence mode="wait" initial={false}>
            {timerRunning ? (
              <motion.div
                key="desc"
                className="truncate text-muted-foreground"
                style={{ fontSize: scaled(12) }}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.15 }}
              >
                {currentEntry?.description || 'Untitled entry'}
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
                  className="rounded-md border border-border bg-card text-center text-foreground outline-none placeholder:text-muted-foreground"
                  style={{
                    width: scaled(200),
                    padding: `${scaled(6)} ${scaled(12)}`,
                    fontSize: scaled(11),
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

        {/* Project pill / label */}
        <div className="relative" style={{ marginTop: scaled(8), height: scaled(28) }}>
          <AnimatePresence mode="wait" initial={false}>
            {timerRunning ? (
              <motion.div
                key="project-label"
                className="flex items-center justify-center text-muted-foreground"
                style={{
                  fontSize: scaled(11),
                  gap: scaled(5),
                  height: scaled(28),
                  lineHeight: `${scaled(28)}`,
                }}
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
                <span className="font-medium text-primary">
                  {currentEntry?.projectName ?? selectedProject?.name ?? 'No project'}
                </span>
              </motion.div>
            ) : (
              <motion.div
                key="project-pill"
                className="relative flex items-center justify-center"
                style={{ height: scaled(28) }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                <div
                  ref={pillRef}
                  className="flex cursor-pointer items-center rounded border border-border bg-card text-muted-foreground transition-colors hover:border-primary/40"
                  style={{
                    gap: scaled(5),
                    padding: `${scaled(5)} ${scaled(10)}`,
                    fontSize: scaled(11),
                  }}
                  onClick={() => setPickerOpen((o) => !o)}
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
                </div>
                <AnimatePresence>
                  {pickerOpen && (
                    <ProjectPicker
                      selected={selectedProject}
                      onSelect={onProjectSelect}
                      onClose={() => setPickerOpen(false)}
                      projects={projects}
                    />
                  )}
                </AnimatePresence>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      <MiniCards stats={stats} />
      <EntriesList currentEntry={currentEntry} entries={entries} onResume={onResume} onUpdateEntry={onUpdateEntry} projects={projects} />
      <PopupFooter webAppUrl={webAppUrl} />
    </>
  );
}
