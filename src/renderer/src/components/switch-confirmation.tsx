import { memo, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowUpDown } from 'lucide-react';
import { scaled } from '@/lib/scaled';
import { formatTimer, formatDuration, useElapsedSeconds } from './tray-popup';
import type { Entry } from '@/lib/api-types';

function formatDateLabel(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.getTime() === today.getTime()) return 'today';
  if (date.getTime() === yesterday.getTime()) return 'yesterday';
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

// Isolated component — only this re-renders on each elapsed tick
function PulsingTimer({ startedAt, offset }: { startedAt: string | null; offset: number }) {
  const elapsed = useElapsedSeconds(startedAt, true, offset);
  return (
    <div
      className="animate-pulse-slow font-brand tabular-nums"
      style={{
        fontSize: scaled(20),
        fontWeight: 600,
        color: 'hsl(0 80% 65%)',
        marginTop: scaled(10),
      }}
    >
      {formatTimer(elapsed)}
    </div>
  );
}

interface SwitchConfirmationProps {
  currentEntry: Entry;
  targetEntry: Entry;
  targetDate: string;
  startedAt: string | null;
  timerOffset: number;
  onConfirm: () => void;
  onCancel: () => void;
  onDontAskAgain: () => void;
}

export const SwitchConfirmation = memo(function SwitchConfirmation({
  currentEntry,
  targetEntry,
  targetDate,
  startedAt,
  timerOffset,
  onConfirm,
  onCancel,
  onDontAskAgain,
}: SwitchConfirmationProps) {
  const [dontAskAgain, setDontAskAgain] = useState(false);
  // Suppress main-process Escape→hide while overlay is mounted
  useEffect(() => {
    window.electronAPI?.setSuppressEscape(true);
    return () => window.electronAPI?.setSuppressEscape(false);
  }, []);

  // Keyboard: Escape to cancel, Enter to confirm
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
      if (e.key === 'Enter') onConfirm();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onConfirm, onCancel]);

  return (
    <motion.div
      className="absolute inset-0 z-50 flex flex-col"
      style={{ background: 'hsl(var(--background))' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      {/* Top half — Stopping */}
      <motion.div
        className="flex flex-1 flex-col items-center justify-end"
        style={{
          padding: `${scaled(20)} ${scaled(20)} ${scaled(24)}`,
          background: 'linear-gradient(to bottom, hsl(0 80% 55% / 0.04), transparent)',
        }}
        initial={{ opacity: 0, y: -30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', damping: 20, stiffness: 200, delay: 0.05 }}
      >
        <div
          className="font-brand uppercase"
          style={{
            fontSize: scaled(8),
            letterSpacing: '1.5px',
            color: 'hsl(0 80% 60% / 0.6)',
          }}
        >
          Stopping
        </div>
        <div
          className="text-center"
          style={{
            fontSize: scaled(15),
            fontWeight: 600,
            marginTop: scaled(6),
          }}
        >
          {currentEntry.description || 'No description'}
        </div>
        {(currentEntry.clientName || currentEntry.projectName) && (
          <div
            className="flex items-center"
            style={{
              gap: scaled(4),
              marginTop: scaled(6),
              fontSize: scaled(11),
              color: 'hsl(var(--muted-foreground))',
            }}
          >
            {currentEntry.projectColor && (
              <div
                className="shrink-0 rounded-full"
                style={{
                  width: scaled(5),
                  height: scaled(5),
                  backgroundColor: currentEntry.projectColor,
                }}
              />
            )}
            <span>
              {[currentEntry.clientName, currentEntry.projectName]
                .filter(Boolean)
                .join(' \u00B7 ')}
            </span>
          </div>
        )}
        <PulsingTimer startedAt={startedAt} offset={timerOffset} />
      </motion.div>

      {/* Divider */}
      <div
        className="relative z-10 flex shrink-0 items-center"
        style={{ margin: `0 ${scaled(24)}`, height: 0 }}
      >
        <div
          className="flex-1"
          style={{
            height: '1px',
            background:
              'linear-gradient(to right, transparent, hsl(var(--muted-foreground) / 0.15))',
          }}
        />
        <motion.div
          className="flex items-center justify-center"
          style={{
            width: 28,
            height: 28,
            marginTop: -14,
            marginBottom: -14,
            borderRadius: '50%',
            background: 'hsl(var(--card))',
            border: '1px solid hsl(var(--border) / 0.15)',
          }}
          initial={{ scale: 0, rotate: -180 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', damping: 15, stiffness: 200, delay: 0.2 }}
        >
          <ArrowUpDown style={{ width: 12, height: 12 }} className="text-muted-foreground/40" />
        </motion.div>
        <div
          className="flex-1"
          style={{
            height: '1px',
            background:
              'linear-gradient(to right, hsl(var(--muted-foreground) / 0.15), transparent)',
          }}
        />
      </div>

      {/* Bottom half — Starting */}
      <motion.div
        className="flex flex-1 flex-col items-center justify-start"
        style={{
          padding: `${scaled(24)} ${scaled(20)} ${scaled(20)}`,
          background: 'linear-gradient(to top, hsl(var(--primary) / 0.04), transparent)',
        }}
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', damping: 20, stiffness: 200, delay: 0.1 }}
      >
        <div
          className="font-brand uppercase"
          style={{
            fontSize: scaled(8),
            letterSpacing: '1.5px',
            color: 'hsl(var(--primary) / 0.6)',
          }}
        >
          Starting
        </div>
        <div
          className="text-center"
          style={{
            fontSize: scaled(15),
            fontWeight: 600,
            marginTop: scaled(6),
          }}
        >
          {targetEntry.description || 'No description'}
        </div>
        {(targetEntry.clientName || targetEntry.projectName) && (
          <div
            className="flex items-center"
            style={{
              gap: scaled(4),
              marginTop: scaled(6),
              fontSize: scaled(11),
              color: 'hsl(var(--muted-foreground))',
            }}
          >
            {targetEntry.projectColor && (
              <div
                className="shrink-0 rounded-full"
                style={{
                  width: scaled(5),
                  height: scaled(5),
                  backgroundColor: targetEntry.projectColor,
                }}
              />
            )}
            <span>
              {[targetEntry.clientName, targetEntry.projectName]
                .filter(Boolean)
                .join(' \u00B7 ')}
            </span>
          </div>
        )}
        <div
          className="font-brand"
          style={{
            fontSize: scaled(14),
            fontWeight: 600,
            color: 'hsl(var(--muted-foreground) / 0.4)',
            marginTop: scaled(10),
          }}
        >
          {formatDuration(targetEntry.totalDurationSeconds)} logged {formatDateLabel(targetDate)}
        </div>
      </motion.div>

      {/* Footer buttons */}
      <motion.div
        className="flex shrink-0 items-center justify-between"
        style={{
          padding: `${scaled(10)} ${scaled(16)}`,
          borderTop: '1px solid hsl(var(--border) / 0.05)',
          background: 'hsl(var(--background))',
        }}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
      >
        <label
          className="flex cursor-pointer select-none items-center"
          style={{ gap: scaled(5) }}
        >
          <span
            className={`flex shrink-0 items-center justify-center rounded transition-colors ${
              dontAskAgain
                ? 'border-primary bg-primary'
                : 'border-muted-foreground/30 bg-transparent'
            }`}
            style={{
              width: scaled(12),
              height: scaled(12),
              borderWidth: 1,
              borderStyle: 'solid',
              borderRadius: scaled(3),
            }}
            onClick={() => setDontAskAgain((v) => !v)}
          >
            {dontAskAgain && (
              <svg
                viewBox="0 0 12 12"
                fill="none"
                style={{ width: scaled(8), height: scaled(8) }}
              >
                <path
                  d="M2.5 6L5 8.5L9.5 3.5"
                  stroke="hsl(var(--background))"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </span>
          <span
            className="text-muted-foreground"
            style={{ fontSize: scaled(10) }}
          >
            Don&apos;t ask again
          </span>
        </label>
        <div className="flex items-center" style={{ gap: scaled(8) }}>
          <motion.button
            className="font-brand cursor-pointer"
            style={{
              fontSize: scaled(11),
              fontWeight: 600,
              padding: `${scaled(6)} ${scaled(16)}`,
              borderRadius: scaled(8),
              background: 'transparent',
              color: 'hsl(var(--muted-foreground))',
              border: '1px solid hsl(var(--border) / 0.15)',
            }}
            whileHover={{ scale: 1.02, backgroundColor: 'hsl(var(--muted) / 0.2)' }}
            whileTap={{ scale: 0.97 }}
            onClick={onCancel}
          >
            Cancel
          </motion.button>
          <motion.button
            className="font-brand cursor-pointer"
            style={{
              fontSize: scaled(11),
              fontWeight: 600,
              padding: `${scaled(6)} ${scaled(16)}`,
              borderRadius: scaled(8),
              background: 'hsl(var(--primary))',
              color: 'hsl(var(--background))',
              border: 'none',
            }}
            whileHover={{ scale: 1.02, filter: 'brightness(1.1)' }}
            whileTap={{ scale: 0.97 }}
            onClick={() => {
              if (dontAskAgain) onDontAskAgain();
              else onConfirm();
            }}
          >
            Switch
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
});
