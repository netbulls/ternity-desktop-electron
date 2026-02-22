import { motion } from 'motion/react';
import { WifiOff, AlertTriangle, Clock, X } from 'lucide-react';
import { scaled } from '@/lib/scaled';

export type StatusState = 'none' | 'offline' | 'sync-failed' | 'long-timer' | 'mutation-error';

export function StatusBanner({
  status,
  onDismiss,
  onStopTimer,
  mutationError,
}: {
  status: StatusState;
  onDismiss: () => void;
  onStopTimer: () => void;
  mutationError?: { message: string; retry: () => void };
}) {
  if (status === 'none') return null;

  const config = {
    offline: {
      icon: WifiOff,
      message: "You're offline — entries will sync when reconnected",
      color: 'hsl(45 93% 47%)',
      gradient: 'linear-gradient(90deg, hsl(45 93% 47% / 0.12), hsl(40 90% 45% / 0.06))',
      shimmerColor: 'hsl(45 93% 47% / 0.06)',
      action: null as null | { label: string; onClick: () => void },
    },
    'sync-failed': {
      icon: AlertTriangle,
      message: 'Sync failed — retrying...',
      color: 'hsl(var(--destructive))',
      gradient:
        'linear-gradient(90deg, hsl(var(--destructive) / 0.12), hsl(var(--destructive) / 0.05))',
      shimmerColor: 'hsl(var(--destructive) / 0.06)',
      action: null as null | { label: string; onClick: () => void },
    },
    'long-timer': {
      icon: Clock,
      message: 'Timer running for 8+ hours — did you forget to stop?',
      color: 'hsl(45 93% 47%)',
      gradient: 'linear-gradient(90deg, hsl(45 93% 47% / 0.12), hsl(40 90% 45% / 0.06))',
      shimmerColor: 'hsl(45 93% 47% / 0.06)',
      action: { label: 'Stop', onClick: onStopTimer },
    },
    'mutation-error': {
      icon: AlertTriangle,
      message: mutationError?.message ?? 'Something went wrong',
      color: 'hsl(var(--destructive))',
      gradient:
        'linear-gradient(90deg, hsl(var(--destructive) / 0.12), hsl(var(--destructive) / 0.05))',
      shimmerColor: 'hsl(var(--destructive) / 0.06)',
      action: mutationError ? { label: 'Retry', onClick: mutationError.retry } : null,
    },
  }[status];

  const Icon = config.icon;

  return (
    <motion.div
      className="absolute inset-0 z-20 overflow-hidden"
      initial={{ y: '-100%', opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: '-100%', opacity: 0 }}
      transition={{ type: 'spring', damping: 25, stiffness: 300 }}
    >
      <div
        className="relative flex h-full items-center"
        style={{
          padding: `0 ${scaled(12)}`,
          background: `hsl(var(--background))`,
          gap: scaled(8),
          borderBottom: `1px solid ${config.color}20`,
        }}
      >
        <div
          className="pointer-events-none absolute inset-0"
          style={{ background: config.gradient }}
        />
        <motion.div
          className="pointer-events-none absolute inset-0 z-[5]"
          style={{
            background: `linear-gradient(90deg, transparent, ${config.shimmerColor}, transparent)`,
            width: '50%',
          }}
          animate={{ left: ['-50%', '150%'] }}
          transition={{ duration: 4, ease: 'easeInOut', repeat: Infinity }}
        />

        <motion.div
          className="relative z-10 flex shrink-0 items-center justify-center rounded-full"
          style={{
            width: scaled(22),
            height: scaled(22),
            background: `${config.color}18`,
          }}
          animate={{
            boxShadow: [
              `0 0 0 0 ${config.color}30`,
              `0 0 0 ${scaled(6)}px ${config.color}00`,
              `0 0 0 0 ${config.color}30`,
            ],
          }}
          transition={{ duration: 3, ease: 'easeInOut', repeat: Infinity }}
        >
          <Icon
            className="shrink-0"
            style={{ width: scaled(11), height: scaled(11), color: config.color }}
          />
        </motion.div>

        <span
          className="relative z-10 min-w-0 flex-1 text-foreground"
          style={{ fontSize: scaled(11), lineHeight: 1.3 }}
        >
          {config.message}
        </span>

        {config.action && (
          <button
            className="relative z-10 shrink-0 rounded-md font-medium transition-colors hover:bg-background/30"
            style={{
              fontSize: scaled(10),
              padding: `${scaled(2)} ${scaled(8)}`,
              color: config.color,
              border: `1px solid ${config.color}30`,
            }}
            onClick={config.action.onClick}
          >
            {config.action.label}
          </button>
        )}

        <button
          className="relative z-10 flex shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground"
          style={{ width: scaled(18), height: scaled(18) }}
          onClick={onDismiss}
        >
          <X style={{ width: scaled(10), height: scaled(10) }} />
        </button>
      </div>
    </motion.div>
  );
}
