import { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Play, Square, FolderKanban, ChevronDown, ExternalLink } from 'lucide-react';
import type { EnvironmentId } from '@/lib/environments';
import { scaled } from '@/lib/scaled';
import { AnimatedDigit } from '../animated-digit';
import { ProjectPicker } from '../project-picker';
import { EntriesList } from '../entries-list';
import type { LayoutProps } from '../tray-popup';
import { formatTimer, formatDuration } from '../tray-popup';

// ============================================================
// State color system
// ============================================================
type TimerState = 'idle' | 'incomplete' | 'running';

function stateColors(state: TimerState) {
  switch (state) {
    case 'idle':
      return {
        orbBg: 'hsl(var(--muted-foreground) / 0.2)',
        orbShadow: '0 0 0px transparent',
        timerColor: 'hsl(var(--muted-foreground) / 0.15)',
        borderColor: 'hsl(var(--border) / 0.3)',
        cardTint: 'transparent',
        btnBg: 'hsl(var(--primary) / 0.06)',
        btnBorder: 'hsl(var(--primary) / 0.2)',
        btnColor: 'hsl(var(--primary))',
        btnHoverBg: 'hsl(var(--primary) / 0.12)',
        btnHoverBorder: 'hsl(var(--primary) / 0.35)',
      };
    case 'incomplete':
      return {
        orbBg: 'hsl(38 92% 50%)',
        orbShadow: '0 0 10px hsl(38 92% 50% / 0.4), 0 0 24px hsl(38 92% 50% / 0.15)',
        timerColor: 'hsl(38 92% 50%)',
        borderColor: 'hsl(38 92% 50% / 0.15)',
        cardTint: 'hsl(38 92% 50% / 0.02)',
        btnBg: 'hsl(var(--destructive) / 0.06)',
        btnBorder: 'hsl(var(--destructive) / 0.2)',
        btnColor: 'hsl(var(--destructive))',
        btnHoverBg: 'hsl(var(--destructive) / 0.12)',
        btnHoverBorder: 'hsl(var(--destructive) / 0.35)',
      };
    case 'running':
      return {
        orbBg: 'hsl(var(--primary))',
        orbShadow: '0 0 10px hsl(var(--primary) / 0.4), 0 0 24px hsl(var(--primary) / 0.15)',
        timerColor: 'hsl(var(--primary))',
        borderColor: 'hsl(var(--primary) / 0.15)',
        cardTint: 'hsl(var(--primary) / 0.02)',
        btnBg: 'hsl(var(--destructive) / 0.06)',
        btnBorder: 'hsl(var(--destructive) / 0.2)',
        btnColor: 'hsl(var(--destructive))',
        btnHoverBg: 'hsl(var(--destructive) / 0.12)',
        btnHoverBorder: 'hsl(var(--destructive) / 0.35)',
      };
  }
}

// ============================================================
// Breathing border helpers
// ============================================================
function breathingBorder(state: TimerState) {
  const color = state === 'incomplete' ? '38 92% 50%' : 'var(--primary)';
  return {
    borderColor: [
      `hsl(${color} / 0.3)`,
      `hsl(${color} / 0.6)`,
      `hsl(${color} / 0.3)`,
    ],
  };
}

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
  timerStyle,
  environment,
}: LayoutProps) {
  const digits = formatTimer(elapsed).split('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerAnchor, setPickerAnchor] = useState<{ top: number; bottom: number; left: number; right: number } | null>(null);
  const [pillAnim, setPillAnim] = useState('');
  const [inputFocused, setInputFocused] = useState(false);
  const [inputAnimClass, setInputAnimClass] = useState('');
  const prevDescRef = useRef('');
  const pillRef = useRef<HTMLSpanElement>(null);
  const [ripples, setRipples] = useState<{ id: number; x: number; y: number; color: string }[]>([]);
  const nextRippleId = useRef(0);

  const isIncomplete = timerRunning && (!description.trim() || !selectedProject);
  const state: TimerState = !timerRunning ? 'idle' : isIncomplete ? 'incomplete' : 'running';
  const colors = stateColors(state);

  const handlePillClick = () => {
    if (pillRef.current) {
      const rect = pillRef.current.getBoundingClientRect();
      setPickerAnchor({ top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right });
    }
    setPickerOpen((o) => !o);
  };

  const handleProjectSelect = (project: Parameters<typeof onProjectSelect>[0]) => {
    const wasSelected = !!selectedProject;
    onProjectSelect(project);
    setPickerOpen(false);
    // pill-pop for select, pill-clear for deselect
    if (project) {
      setPillAnim('pill-pop');
    } else if (wasSelected) {
      setPillAnim('pill-clear');
    }
    setTimeout(() => setPillAnim(''), 500);
  };

  const commitDescription = useCallback(() => {
    const prev = prevDescRef.current;
    const curr = description;
    if (curr === prev) return;
    const cleared = curr.trim().length === 0 && prev.trim().length > 0;
    const filled = curr.trim().length > 0;
    prevDescRef.current = curr;
    if (cleared || filled) {
      setInputAnimClass(cleared ? 'input-clear' : 'input-commit');
      setTimeout(() => setInputAnimClass(''), 500);
    }
  }, [description]);

  const handleButtonClick = useCallback((e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const id = nextRippleId.current++;
    const color = timerRunning ? 'hsl(var(--destructive) / 0.2)' : 'hsl(var(--primary) / 0.2)';
    setRipples((r) => [...r, { id, x, y, color }]);
    setTimeout(() => setRipples((r) => r.filter((ri) => ri.id !== id)), 600);
    if (timerRunning) {
      onStop();
    } else {
      onStart();
    }
  }, [timerRunning, onStop, onStart]);

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
          borderColor: colors.borderColor,
        }}
        transition={{ duration: 0.6, ease: 'easeInOut' }}
      >
        {/* Card tint overlay */}
        <motion.div
          className="pointer-events-none absolute inset-0"
          style={{ borderRadius: scaled(14) }}
          animate={{ background: colors.cardTint }}
          transition={{ duration: 0.8, ease: 'easeInOut' }}
        />

        {/* Top highlight (glass refraction) */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0"
          style={{
            height: '50%',
            background:
              'linear-gradient(180deg, hsl(var(--foreground) / 0.02) 0%, transparent 100%)',
            borderRadius: `${scaled(14)}px ${scaled(14)}px 0 0`,
          }}
        />

        {/* Content — relative wrapper to sit above tint overlay */}
        <div className="relative">

        {/* Header: Orb + Timer + Button */}
        <div
          className="flex items-center"
          style={{ gap: scaled(10), marginBottom: scaled(7) }}
        >
          {/* Status Orb — with breathing pulse for incomplete */}
          <div className="relative shrink-0" style={{ width: scaled(10), height: scaled(10) }}>
            <AnimatePresence>
              {state === 'incomplete' && (
                <motion.div
                  className="absolute inset-0 rounded-full"
                  initial={{ scale: 1, opacity: 0 }}
                  animate={{
                    scale: [1, 2.2, 1],
                    opacity: [0.4, 0, 0.4],
                  }}
                  exit={{ opacity: 0, scale: 1 }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    ease: 'easeInOut',
                  }}
                  style={{ background: 'hsl(38 92% 50% / 0.3)' }}
                />
              )}
            </AnimatePresence>
            <motion.div
              className="absolute inset-0 rounded-full"
              animate={{
                background: colors.orbBg,
                boxShadow: colors.orbShadow,
              }}
              transition={{ duration: 0.6, ease: 'easeInOut' }}
            />
          </div>

          {/* Timer Display — flex + explicit height to center digits against button
               (text-box-cap not supported in Electron's Chromium 132) */}
          <motion.span
            className="font-brand font-bold tabular-nums leading-none"
            style={{
              fontSize: scaled(28),
              letterSpacing: '2px',
              display: 'inline-flex',
              alignItems: 'center',
              height: scaled(30),
            }}
            animate={{
              color: colors.timerColor,
            }}
            transition={{ duration: 0.6, ease: 'easeInOut' }}
          >
            {digits.map((d, i) => (
              <AnimatedDigit key={i} char={d} />
            ))}
          </motion.span>

          {/* Play / Stop Button — inline variant (hidden in wide mode) */}
          {timerStyle !== 'liquid-glass-wide' && (
          <motion.button
            className="relative ml-auto flex cursor-pointer items-center justify-center overflow-hidden font-brand font-semibold uppercase"
            style={{
              height: scaled(30),
              width: scaled(72),
              borderRadius: scaled(10),
              gap: scaled(6),
              fontSize: scaled(10),
              letterSpacing: '0.5px',
              backdropFilter: 'blur(8px)',
              border: '1px solid',
            }}
            animate={{
              background: colors.btnBg,
              borderColor: colors.btnBorder,
              color: colors.btnColor,
            }}
            whileHover={{
              background: colors.btnHoverBg,
              borderColor: colors.btnHoverBorder,
            }}
            whileTap={{ scale: 0.9 }}
            onClick={handleButtonClick}
            transition={{ type: 'spring', damping: 15, stiffness: 300 }}
          >
            {ripples.map((r) => (
              <motion.span
                key={r.id}
                className="pointer-events-none absolute rounded-full"
                style={{ width: 40, height: 40, left: r.x - 20, top: r.y - 20, background: r.color }}
                initial={{ scale: 0, opacity: 0.4 }}
                animate={{ scale: 3.5, opacity: 0 }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
              />
            ))}
            <AnimatePresence mode="wait" initial={false}>
              {timerRunning ? (
                <motion.span
                  key="stop"
                  className="relative z-[1] flex items-center"
                  style={{ gap: scaled(6) }}
                  initial={{ opacity: 0, scale: 0.7 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.7 }}
                  transition={{ duration: 0.15 }}
                >
                  <Square style={{ width: scaled(11), height: scaled(11) }} fill="currentColor" />
                  Stop
                </motion.span>
              ) : (
                <motion.span
                  key="start"
                  className="relative z-[1] flex items-center"
                  style={{ gap: scaled(6) }}
                  initial={{ opacity: 0, scale: 0.7 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.7 }}
                  transition={{ duration: 0.15 }}
                >
                  <Play style={{ width: scaled(11), height: scaled(11) }} fill="currentColor" />
                  Start
                </motion.span>
              )}
            </AnimatePresence>
          </motion.button>
          )}
        </div>

        {/* Description input — breathing border + commit/clear animations */}
        <div>
          <motion.input
            className={`w-full text-foreground outline-none placeholder:italic placeholder:text-muted-foreground/40 ${inputAnimClass}`}
            style={{
              padding: `${scaled(5.5)} ${scaled(10)}`,
              fontSize: scaled(13),
              fontWeight: 500,
              background: 'transparent',
              border: '1px solid',
              borderRadius: scaled(8),
              fontFamily: "'Inter', sans-serif",
            }}
            animate={inputFocused && !inputAnimClass ? breathingBorder(state) : { borderColor: 'transparent' }}
            transition={inputFocused && !inputAnimClass ? breathingBorderTransition : { duration: 0.2 }}
            placeholder={
              timerRunning ? 'Add description...' : 'What are you working on?'
            }
            value={description}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => onDescriptionChange(e.target.value)}
            onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                (e.target as HTMLInputElement).blur();
                commitDescription();
                if (timerRunning) {
                  onDescriptionCommit();
                } else {
                  onStart();
                }
              }
            }}
            onFocus={() => setInputFocused(true)}
            onBlur={() => {
              setInputFocused(false);
              commitDescription();
            }}
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
            className={`flex cursor-pointer items-center text-muted-foreground transition-colors hover:text-foreground ${pillAnim}`}
            style={{
              gap: scaled(5),
              fontSize: scaled(11),
              border: '1px solid',
              borderRadius: scaled(12),
              padding: `${scaled(2)} ${scaled(8)}`,
              margin: `0 ${scaled(-8)}`,
            }}
            animate={pickerOpen ? breathingBorder(state) : { borderColor: 'transparent' }}
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

        {/* Full-width button — wide variant */}
        {timerStyle === 'liquid-glass-wide' && (
          <motion.button
            className="relative mt-1 flex w-full cursor-pointer items-center justify-center overflow-hidden font-brand font-semibold uppercase"
            style={{
              height: scaled(34),
              borderRadius: scaled(10),
              gap: scaled(6),
              fontSize: scaled(11),
              letterSpacing: '0.5px',
              backdropFilter: 'blur(8px)',
              border: '1px solid',
              marginTop: scaled(8),
            }}
            animate={{
              background: colors.btnBg,
              borderColor: colors.btnBorder,
              color: colors.btnColor,
            }}
            whileHover={{
              background: colors.btnHoverBg,
              borderColor: colors.btnHoverBorder,
            }}
            whileTap={{ scale: 0.97 }}
            onClick={handleButtonClick}
            transition={{ type: 'spring', damping: 15, stiffness: 300 }}
          >
            {ripples.map((r) => (
              <motion.span
                key={r.id}
                className="pointer-events-none absolute rounded-full"
                style={{ width: 60, height: 60, left: r.x - 30, top: r.y - 30, background: r.color }}
                initial={{ scale: 0, opacity: 0.4 }}
                animate={{ scale: 4, opacity: 0 }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
              />
            ))}
            <AnimatePresence mode="wait" initial={false}>
              {timerRunning ? (
                <motion.span
                  key="stop"
                  className="relative z-[1] flex items-center"
                  style={{ gap: scaled(6) }}
                  initial={{ opacity: 0, scale: 0.7 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.7 }}
                  transition={{ duration: 0.15 }}
                >
                  <Square style={{ width: scaled(12), height: scaled(12) }} fill="currentColor" />
                  Stop Timer
                </motion.span>
              ) : (
                <motion.span
                  key="start"
                  className="relative z-[1] flex items-center"
                  style={{ gap: scaled(6) }}
                  initial={{ opacity: 0, scale: 0.7 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.7 }}
                  transition={{ duration: 0.15 }}
                >
                  <Play style={{ width: scaled(12), height: scaled(12) }} fill="currentColor" />
                  Start Timer
                </motion.span>
              )}
            </AnimatePresence>
          </motion.button>
        )}

        </div>{/* end content wrapper */}

        {/* Bottom edge effects */}
        <AnimatePresence mode="wait">
          {state === 'running' && (
            <motion.div
              key="liquid-edge"
              className="pointer-events-none absolute bottom-0 left-0 right-0 overflow-hidden"
              style={{
                height: 3,
                borderRadius: `0 0 ${scaled(14)}px ${scaled(14)}px`,
              }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.6 }}
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
          {state === 'incomplete' && (
            <motion.div
              key="incomplete-edge"
              className="pointer-events-none absolute bottom-0 left-0 right-0 overflow-hidden"
              style={{
                height: 2,
                background: 'hsl(var(--border) / 0.08)',
                borderRadius: `0 0 ${scaled(14)}px ${scaled(14)}px`,
              }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.6 }}
            >
              <motion.div
                className="absolute top-0 h-full"
                style={{
                  width: '40%',
                  background: 'radial-gradient(ellipse at center, hsl(38 92% 50% / 0.6) 0%, transparent 70%)',
                }}
                animate={{ left: ['-40%', '100%'] }}
                transition={{
                  duration: 2.5,
                  repeat: Infinity,
                  ease: [0.4, 0, 0.6, 1],
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
            {/* Button + env info — unaffected by mask */}
            <div
              className={`relative flex ${environment === 'prod' ? 'items-center justify-center' : 'items-baseline justify-between'}`}
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
              {environment !== 'prod' && (
                <div className="pointer-events-auto flex items-center" style={{ gap: scaled(5) }}>
                  <span
                    className={`font-mono font-semibold uppercase leading-none ${environment === 'local' ? 'text-amber-500 bg-amber-500/8' : 'text-blue-400 bg-blue-400/8'}`}
                    style={{ fontSize: scaled(8), padding: `${scaled(2)} ${scaled(5)}`, borderRadius: scaled(4) }}
                  >
                    {environment}
                  </span>
                  <span className="font-mono leading-none text-muted-foreground/50" style={{ fontSize: scaled(8) }}>
                    {__APP_VERSION__}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
