import { motion } from 'motion/react';
import { Play } from 'lucide-react';
import { scaled } from '@/lib/scaled';
import type { Entry, DayGroup } from '@/lib/api-types';
import { formatDuration } from './tray-popup';

interface EntriesListProps {
  currentEntry: Entry | null;
  entries: DayGroup[];
  onResume: (entryId: string) => void;
}

function formatDateLabel(dateStr: string): string {
  const date = new Date(dateStr + 'T12:00:00');
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const diffDays = Math.round((today.getTime() - date.getTime()) / (24 * 60 * 60 * 1000));
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return date.toLocaleDateString('en-US', { weekday: 'long' });
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function EntriesList({ currentEntry, entries, onResume }: EntriesListProps) {
  return (
    <div>
      <div style={{ maxHeight: scaled(260), overflowY: 'auto' }}>
        {currentEntry && <TrackingRow entry={currentEntry} />}
        {entries.map((day, dayIdx) => (
          <DayGroupRow
            key={day.date}
            day={day}
            runningEntryId={currentEntry?.id ?? null}
            onResume={onResume}
            isFirst={dayIdx === 0 && !currentEntry}
          />
        ))}
      </div>
    </div>
  );
}

function TrackingRow({ entry }: { entry: Entry }) {
  const color = entry.projectColor ?? 'hsl(var(--primary))';
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
            style={{ background: color }}
            animate={{ scale: [1, 1.8, 1], opacity: [1, 0.3, 1] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          />
          <div className="absolute inset-0 rounded-full" style={{ background: color }} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium text-foreground" style={{ fontSize: scaled(12) }}>
            {entry.description || 'Untitled entry'}
          </div>
          <div className="text-muted-foreground" style={{ fontSize: scaled(10) }}>
            {entry.clientName ? <>{entry.clientName} &middot; </> : null}
            {entry.projectName ?? 'No project'}
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

function DayGroupRow({
  day,
  runningEntryId,
  onResume,
  isFirst,
}: {
  day: DayGroup;
  runningEntryId: string | null;
  onResume: (entryId: string) => void;
  isFirst: boolean;
}) {
  const visibleEntries = day.entries.filter((e) => e.id !== runningEntryId);
  if (visibleEntries.length === 0) return null;

  return (
    <>
      {!isFirst && (
        <div
          className="border-t border-border/50"
          style={{ margin: `${scaled(2)} ${scaled(16)}` }}
        />
      )}
      <DayHeader label={`${formatDateLabel(day.date)} — ${formatDuration(day.totalSeconds)}`} />
      {visibleEntries.map((entry) => (
        <div
          key={entry.id}
          className="group flex items-center transition-colors hover:bg-muted/50"
          style={{ gap: scaled(10), padding: `${scaled(6)} ${scaled(16)}` }}
        >
          <div
            className="shrink-0 rounded-full"
            style={{
              width: scaled(5),
              height: scaled(5),
              background: entry.projectColor ?? 'hsl(var(--primary))',
            }}
          />
          <div className="min-w-0 flex-1">
            <div className="truncate text-foreground" style={{ fontSize: scaled(12) }}>
              {entry.description || 'Untitled entry'}
            </div>
            <div className="text-muted-foreground" style={{ fontSize: scaled(10) }}>
              {entry.projectName ?? 'No project'}
            </div>
          </div>
          <div
            className="shrink-0 font-brand font-semibold tabular-nums text-muted-foreground"
            style={{ fontSize: scaled(12) }}
          >
            {formatDuration(entry.durationSeconds ?? 0)}
          </div>
          <button
            className="flex shrink-0 items-center justify-center rounded-full text-muted-foreground/30 opacity-0 transition-all hover:bg-primary/15 hover:text-primary group-hover:opacity-100"
            style={{ width: scaled(22), height: scaled(22) }}
            onClick={() => onResume(entry.id)}
          >
            <Play style={{ width: scaled(10), height: scaled(10) }} fill="currentColor" />
          </button>
        </div>
      ))}
    </>
  );
}
