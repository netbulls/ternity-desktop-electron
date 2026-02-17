import { motion } from 'motion/react';
import { Play } from 'lucide-react';
import { scaled } from '@/lib/scaled';
import type { MockEntry, MockDayGroup, TrackingContext } from './tray-popup';

interface EntriesListProps {
  tracking: TrackingContext | null;
  weekEntries: MockDayGroup[];
  onPlay: (entry: MockEntry) => void;
}

export function EntriesList({ tracking, weekEntries, onPlay }: EntriesListProps) {
  return (
    <div>
      {/* Scrollable entries area — ~5 visible rows */}
      <div style={{ maxHeight: scaled(210), overflowY: 'auto' }}>
        {tracking && <TrackingRow tracking={tracking} />}
        {weekEntries.map((day, dayIdx) => (
          <DayGroup
            key={day.label}
            day={day}
            onPlay={onPlay}
            isFirst={dayIdx === 0 && !tracking}
          />
        ))}
      </div>
    </div>
  );
}

function TrackingRow({ tracking }: { tracking: TrackingContext }) {
  return (
    <>
      <DayHeader label="In Progress" />
      <div
        className="flex items-center"
        style={{
          gap: scaled(10),
          padding: `${scaled(7)} ${scaled(16)}`,
          background: 'hsl(var(--primary) / 0.04)',
        }}
      >
        <div className="relative shrink-0" style={{ width: scaled(5), height: scaled(5) }}>
          <motion.div
            className="absolute inset-0 rounded-full"
            style={{ background: tracking.color }}
            animate={{ scale: [1, 1.8, 1], opacity: [1, 0.3, 1] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          />
          <div
            className="absolute inset-0 rounded-full"
            style={{ background: tracking.color }}
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium text-foreground" style={{ fontSize: scaled(12) }}>
            {tracking.description}
          </div>
          <div className="text-muted-foreground" style={{ fontSize: scaled(10) }}>
            {tracking.client ? <>{tracking.client} &middot; </> : null}
            {tracking.project}
          </div>
        </div>
        <span
          className="shrink-0 font-brand text-primary/70"
          style={{ fontSize: scaled(9), letterSpacing: '0.5px' }}
        >
          TRACKING
        </span>
      </div>
    </>
  );
}

function DayHeader({ label }: { label: string }) {
  return (
    <div
      className="sticky top-0 z-10 flex items-center justify-between bg-background/95 backdrop-blur-sm"
      style={{ padding: `${scaled(6)} ${scaled(16)} ${scaled(4)}` }}
    >
      <span
        className="font-brand uppercase tracking-widest text-muted-foreground"
        style={{ fontSize: scaled(8), letterSpacing: '1.5px' }}
      >
        {label}
      </span>
    </div>
  );
}

function DayGroup({
  day,
  onPlay,
  isFirst,
}: {
  day: MockDayGroup;
  onPlay: (entry: MockEntry) => void;
  isFirst: boolean;
}) {
  return (
    <>
      {!isFirst && (
        <div
          className="border-t border-border/50"
          style={{ margin: `${scaled(2)} ${scaled(16)}` }}
        />
      )}
      <DayHeader label={`${day.label} — ${day.total}`} />
      {day.entries.map((entry) => (
        <div
          key={entry.id}
          className="group flex items-center transition-colors hover:bg-muted/50"
          style={{ gap: scaled(10), padding: `${scaled(6)} ${scaled(16)}` }}
        >
          <div
            className="shrink-0 rounded-full"
            style={{ width: scaled(5), height: scaled(5), background: entry.color }}
          />
          <div className="min-w-0 flex-1">
            <div className="truncate text-foreground" style={{ fontSize: scaled(12) }}>
              {entry.description}
            </div>
            <div className="text-muted-foreground" style={{ fontSize: scaled(10) }}>
              {entry.project}
            </div>
          </div>
          <div
            className="shrink-0 font-brand font-semibold tabular-nums text-muted-foreground"
            style={{ fontSize: scaled(12) }}
          >
            {entry.duration}
          </div>
          <button
            className="flex shrink-0 items-center justify-center rounded-full text-muted-foreground/30 opacity-0 transition-all hover:bg-primary/15 hover:text-primary group-hover:opacity-100"
            style={{ width: scaled(22), height: scaled(22) }}
            onClick={() => onPlay(entry)}
          >
            <Play style={{ width: scaled(10), height: scaled(10) }} fill="currentColor" />
          </button>
        </div>
      ))}
    </>
  );
}
