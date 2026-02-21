import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Play, Square, FolderKanban, ChevronDown, ExternalLink } from 'lucide-react';
import { scaled } from '@/lib/scaled';
import { AnimatedDigit } from '../animated-digit';
import { ProjectPicker } from '../project-picker';
import { EntriesList } from '../entries-list';
import type { LayoutProps } from '../tray-popup';
import { formatTimer, formatDuration } from '../tray-popup';

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

export function LiquidGlassLayout({
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
  const [inputFocused, setInputFocused] = useState(false);
  const pillRef = useRef<HTMLSpanElement>(null);
  const isIncomplete = timerRunning && !currentEntry?.description;

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
    <div className="flex min-h-0 flex-1 flex-col" style={{ padding: scaled(8), gap: scaled(8) }}>
      {/* Timer Glass Card — z-10 so project picker renders above the stats card below */}
      <motion.div
        className="relative z-10"
        style={{
          borderRadius: scaled(14),
          padding: scaled(14),
          background: 'hsl(var(--card) / 0.6)',
          backdropFilter: 'blur(12px)',
          border: '1px solid',
        }}
        animate={{
          borderColor: timerRunning
            ? 'hsl(var(--primary) / 0.2)'
            : 'hsl(var(--border) / 0.3)',
        }}
        transition={{ duration: 0.3 }}
      >
        {/* Top highlight (glass refraction) */}
        <div
          className="pointer-events-none absolute left-0 right-0 top-0"
          style={{
            height: '50%',
            background:
              'linear-gradient(180deg, hsl(var(--foreground) / 0.02) 0%, transparent 100%)',
          }}
        />

        {/* Header: Orb + Timer + Button */}
        <div
          className="relative flex items-center"
          style={{ gap: scaled(10), marginBottom: scaled(6) }}
        >
          {/* Status Orb */}
          <motion.div
            className="shrink-0 rounded-full"
            style={{ width: scaled(10), height: scaled(10) }}
            animate={{
              background: isIncomplete
                ? 'hsl(38 92% 50%)'
                : timerRunning
                  ? 'hsl(var(--primary))'
                  : 'hsl(var(--muted-foreground) / 0.2)',
              boxShadow: isIncomplete
                ? '0 0 8px hsl(38 92% 50% / 0.5)'
                : timerRunning
                  ? '0 0 8px hsl(var(--primary) / 0.5), 0 0 20px hsl(var(--primary) / 0.2)'
                  : '0 0 0px transparent',
            }}
            transition={{ duration: 0.3 }}
          />

          {/* Timer Display */}
          <motion.div
            className="font-brand font-bold tabular-nums tracking-wider"
            style={{ fontSize: scaled(28), letterSpacing: '2px', lineHeight: 1, marginTop: scaled(2) }}
            animate={{
              color: timerRunning
                ? 'hsl(var(--primary))'
                : 'hsl(var(--muted-foreground) / 0.15)',
            }}
            transition={{ duration: 0.3 }}
          >
            {digits.map((d, i) => (
              <AnimatedDigit key={i} char={d} />
            ))}
          </motion.div>

          {/* Play / Stop Button — single button that transforms between states */}
          <div className="ml-auto">
            <motion.button
              className="flex items-center justify-center font-brand font-semibold uppercase"
              style={{
                height: scaled(30),
                width: scaled(72),
                borderRadius: scaled(10),
                gap: scaled(6),
                fontSize: scaled(10),
                letterSpacing: '0.5px',
              }}
              animate={{
                background: timerRunning
                  ? 'hsl(var(--destructive))'
                  : 'hsl(var(--primary))',
                color: timerRunning
                  ? 'hsl(var(--destructive-foreground))'
                  : 'hsl(var(--primary-foreground))',
              }}
              transition={{ duration: 0.3 }}
              whileTap={{ scale: 0.95 }}
              onClick={timerRunning ? onStop : onStart}
            >
              <AnimatePresence mode="wait" initial={false}>
                {timerRunning ? (
                  <motion.span
                    key="stop"
                    className="flex items-center"
                    style={{ gap: scaled(6) }}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    transition={{ duration: 0.15 }}
                  >
                    <Square style={{ width: scaled(11), height: scaled(11) }} fill="currentColor" />
                    Stop
                  </motion.span>
                ) : (
                  <motion.span
                    key="start"
                    className="flex items-center"
                    style={{ gap: scaled(6) }}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    transition={{ duration: 0.15 }}
                  >
                    <Play style={{ width: scaled(11), height: scaled(11) }} fill="currentColor" />
                    Start
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.button>
          </div>
        </div>

        {/* Description input — always editable */}
        <div>
          <input
            className="w-full text-foreground outline-none placeholder:italic placeholder:text-muted-foreground/40"
            style={{
              padding: `${scaled(8)} ${scaled(10)}`,
              fontSize: scaled(13),
              fontWeight: 500,
              background: 'transparent',
              border: `1px solid ${inputFocused ? 'hsl(var(--border) / 0.6)' : 'transparent'}`,
              borderRadius: scaled(8),
              fontFamily: "'Inter', sans-serif",
              transition: 'border-color 0.2s ease',
            }}
            placeholder={
              timerRunning ? 'Add description...' : 'What are you working on?'
            }
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
            onFocus={() => setInputFocused(true)}
            onBlur={() => setInputFocused(false)}
          />
        </div>

        {/* Project — inline text link, opens picker on click */}
        <div
          className="relative flex items-center"
          style={{
            marginTop: scaled(4),
            minWidth: 0,
          }}
        >
          <motion.span
            ref={pillRef}
            className={`flex cursor-pointer items-center text-muted-foreground transition-colors hover:text-foreground ${pillPop ? 'pill-pop' : ''}`}
            style={{
              gap: scaled(5),
              fontSize: scaled(11),
              border: '1px solid',
              borderRadius: scaled(12),
              padding: `${scaled(2)} ${scaled(8)}`,
              margin: `0 ${scaled(-8)}`,
            }}
            animate={pickerOpen ? breathingBorderAnimation : { borderColor: 'transparent' }}
            transition={pickerOpen ? breathingBorderTransition : { duration: 0.2 }}
            onClick={handlePillClick}
          >
            {selectedProject ? (
              <>
                <div
                  className="shrink-0 rounded-full"
                  style={{
                    width: scaled(6),
                    height: scaled(6),
                    background: selectedProject.color ?? 'hsl(var(--primary))',
                  }}
                />
                {selectedProject.clientName && (
                  <>
                    <span>{selectedProject.clientName}</span>
                    <span className="text-muted-foreground/30">&rsaquo;</span>
                  </>
                )}
                <span>{selectedProject.name}</span>
              </>
            ) : (
              <>
                <FolderKanban style={{ width: scaled(12), height: scaled(12) }} />
                <span>No project</span>
              </>
            )}
            <ChevronDown
              style={{
                width: scaled(10),
                height: scaled(10),
                opacity: 0.5,
                transition: 'transform 0.15s',
                transform: pickerOpen ? 'rotate(180deg)' : 'rotate(0)',
              }}
            />
          </motion.span>
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
        </div>

        {/* LiquidEdge — drifting teal blobs when timer is running */}
        <AnimatePresence>
          {timerRunning && !isIncomplete && (
            <motion.div
              className="pointer-events-none absolute bottom-0 left-0 right-0 overflow-hidden"
              style={{
                height: 3,
                borderRadius: `0 0 ${scaled(14)}px ${scaled(14)}px`,
              }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              {/* Subtle glow underneath */}
              <div
                className="absolute inset-0"
                style={{
                  background: 'linear-gradient(90deg, transparent, hsl(var(--primary) / 0.03), transparent)',
                }}
              />
              {/* Blob 1 */}
              <div
                className="absolute top-0 h-full"
                style={{
                  width: '35%',
                  background: 'radial-gradient(ellipse at center, hsl(var(--primary) / 0.6) 0%, transparent 70%)',
                  animation: 'liquid-drift 5s ease-in-out infinite alternate',
                }}
              />
              {/* Blob 2 */}
              <div
                className="absolute top-0 h-full"
                style={{
                  width: '20%',
                  background: 'radial-gradient(ellipse at center, hsl(var(--primary) / 0.4) 0%, transparent 70%)',
                  animation: 'liquid-drift-2 7s ease-in-out infinite alternate',
                }}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Incomplete progress line */}
        <AnimatePresence>
          {isIncomplete && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute bottom-0 left-0 right-0 overflow-hidden"
              style={{
                height: 2,
                background: 'hsl(var(--border) / 0.1)',
                borderRadius: `0 0 ${scaled(14)}px ${scaled(14)}px`,
              }}
            >
              <motion.div
                className="absolute h-full"
                style={{
                  width: '30%',
                  background: 'hsl(38 92% 50% / 0.7)',
                }}
                animate={{ left: ['-30%', '100%'] }}
                transition={{
                  duration: 1.5,
                  repeat: Infinity,
                  ease: 'easeInOut',
                }}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Stats + Entries Glass Card */}
      <div
        className="relative flex min-h-0 flex-1 flex-col overflow-hidden"
        style={{
          borderRadius: scaled(14),
          border: '1px solid hsl(var(--border) / 0.3)',
        }}
      >
        {/* Glass blur layer — separate from content so child backdrop-filters work */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background: 'hsl(var(--card) / 0.6)',
            backdropFilter: 'blur(12px)',
            borderRadius: scaled(14),
          }}
        />

        {/* Top highlight (glass refraction) */}
        <div
          className="pointer-events-none absolute left-0 right-0 top-0"
          style={{
            height: '50%',
            background:
              'linear-gradient(180deg, hsl(var(--foreground) / 0.02) 0%, transparent 100%)',
          }}
        />

        {/* Stats mini-cards */}
        <div
          className="relative shrink-0 grid grid-cols-2"
          style={{ gap: scaled(6), padding: `${scaled(12)} ${scaled(12)} 0` }}
        >
          <div
            style={{
              padding: `${scaled(8)} ${scaled(10)}`,
              background: 'hsl(var(--muted) / 0.2)',
              border: '1px solid hsl(var(--border) / 0.15)',
              borderRadius: scaled(8),
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
            style={{
              padding: `${scaled(8)} ${scaled(10)}`,
              background: 'hsl(var(--muted) / 0.2)',
              border: '1px solid hsl(var(--border) / 0.15)',
              borderRadius: scaled(8),
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

        {/* Entries + footer overlay */}
        <div className="relative flex min-h-0 flex-1 flex-col">
          <EntriesList currentEntry={currentEntry} entries={entries} onResume={onResume} onUpdateEntry={onUpdateEntry} projects={projects} />

          {/* Footer overlay — frosted backdrop + button on top */}
          <div
            className="pointer-events-none absolute bottom-0 left-0 right-0"
            style={{ zIndex: 50 }}
          >
            {/* Frosted layer with gradual mask */}
            <div
              className="absolute inset-0"
              style={{
                background: 'linear-gradient(to top, hsl(var(--card) / 0.95) 0%, hsl(var(--card) / 0.05) 100%)',
                backdropFilter: 'blur(12px)',
                maskImage: 'linear-gradient(to top, black 30%, transparent 100%)',
                WebkitMaskImage: 'linear-gradient(to top, black 30%, transparent 100%)',
              }}
            />
            {/* Button — unaffected by mask */}
            <div
              className="relative flex items-center justify-center"
              style={{ padding: `${scaled(12)} ${scaled(14)} ${scaled(8)}` }}
            >
              <button
                className="pointer-events-auto flex cursor-pointer items-center text-muted-foreground transition-colors hover:text-primary"
                style={{ fontSize: scaled(11), gap: scaled(4) }}
                onClick={() => window.electronAPI?.openExternal(webAppUrl)}
              >
                Open Ternity
                <ExternalLink style={{ width: scaled(10), height: scaled(10) }} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
