import { motion } from 'motion/react';
import { Play } from 'lucide-react';
// motion used for pulsing dot animation only
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
  // Merge running entry into the entries list:
  // - Replace matching entry with currentEntry (has live local edits)
  // - Inject at top of today if not found (new entry not yet in API response)
  const enrichedEntries = (() => {
    const seenIds = new Set<string>();
    let found = false;

    const copy = entries.map((day) => ({
      ...day,
      entries: day.entries.reduce<Entry[]>((acc, e) => {
        // Deduplicate
        if (seenIds.has(e.id)) return acc;
        seenIds.add(e.id);
        if (currentEntry && e.id === currentEntry.id) {
          found = true;
          acc.push(currentEntry);
        } else {
          acc.push(e);
        }
        return acc;
      }, []),
    }));

    // Inject running entry into today's group if not present in the list yet
    if (currentEntry && !found) {
      const today = new Date().toISOString().split('T')[0];
      const todayGroup = copy.find((day) => day.date === today);
      if (todayGroup) {
        todayGroup.entries.unshift(currentEntry);
      } else {
        copy.unshift({ date: today, totalSeconds: 0, entries: [currentEntry] });
      }
    }

    return copy;
  })();

  return (
    <div>
      <div style={{ maxHeight: scaled(300), overflowY: 'auto', overflowX: 'hidden' }}>
        {enrichedEntries.map((day, dayIdx) => (
          <DayGroupRow
            key={day.date}
            day={day}
            runningEntryId={currentEntry?.id ?? null}
            onResume={onResume}
            isFirst={dayIdx === 0}
          />
        ))}
      </div>
    </div>
  );
}

function DayHeader({ label, duration }: { label: string; duration: string }) {
  return (
    <div
      className="sticky top-0 z-10 flex items-center justify-between backdrop-blur-sm"
      style={{ padding: `${scaled(6)} ${scaled(14)} ${scaled(3)}`, background: 'hsl(var(--card) / 0.85)' }}
    >
      <span
        className="font-brand uppercase tracking-widest text-muted-foreground/60"
        style={{ fontSize: scaled(8), letterSpacing: '1.5px' }}
      >
        {label}
      </span>
      <span
        className="font-brand tabular-nums text-muted-foreground/40"
        style={{ fontSize: scaled(9) }}
      >
        {duration}
      </span>
    </div>
  );
}

function EntryRow({
  entry,
  isRunning,
  onResume,
}: {
  entry: Entry;
  isRunning: boolean;
  onResume: (entryId: string) => void;
}) {
  const color = entry.projectColor ?? 'hsl(var(--primary))';

  return (
    <div
      className={`group flex items-center transition-colors ${
        isRunning ? '' : 'cursor-pointer hover:bg-muted/50'
      }`}
      style={{
        gap: scaled(10),
        padding: `${scaled(6)} ${scaled(16)}`,
        background: isRunning ? 'hsl(var(--primary) / 0.04)' : undefined,
      }}
      onClick={isRunning ? undefined : () => onResume(entry.id)}
    >
      {/* Dot — pulsing when running */}
      <div className="relative shrink-0" style={{ width: scaled(5), height: scaled(5) }}>
        {isRunning && (
          <motion.div
            className="absolute inset-0 rounded-full"
            style={{ background: color }}
            animate={{ scale: [1, 1.8, 1], opacity: [1, 0.3, 1] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          />
        )}
        <div className="absolute inset-0 rounded-full" style={{ background: color }} />
      </div>

      {/* Description + client › project */}
      <div className="min-w-0 flex-1">
        <div
          className={`truncate ${isRunning ? 'font-medium text-foreground' : 'text-foreground'}`}
          style={{ fontSize: scaled(12) }}
        >
          {entry.description || 'Untitled entry'}
        </div>
        <div
          className="flex items-center truncate text-muted-foreground"
          style={{ fontSize: scaled(10), gap: scaled(4) }}
        >
          {entry.clientName ? (
            <>
              <span className="truncate">{entry.clientName}</span>
              {entry.projectName && (
                <>
                  <span className="shrink-0 text-muted-foreground/30">›</span>
                  <span className="truncate">{entry.projectName}</span>
                </>
              )}
            </>
          ) : entry.projectName ? (
            <span className="truncate">{entry.projectName}</span>
          ) : (
            <span className="italic opacity-50">No project</span>
          )}
        </div>
      </div>

      {/* Duration or tracking badge */}
      {isRunning ? (
        <span
          className="shrink-0 font-brand text-primary/70"
          style={{ fontSize: scaled(9), letterSpacing: '0.5px' }}
        >
          TRACKING
        </span>
      ) : (
        <>
          <div
            className="shrink-0 font-brand font-semibold tabular-nums text-muted-foreground"
            style={{ fontSize: scaled(12) }}
          >
            {formatDuration(entry.durationSeconds ?? 0)}
          </div>
          <button
            className="flex shrink-0 items-center justify-center rounded-full text-muted-foreground/30 opacity-0 transition-all hover:bg-primary/15 hover:text-primary group-hover:opacity-100"
            style={{ width: scaled(22), height: scaled(22) }}
            onClick={(e) => {
              e.stopPropagation();
              onResume(entry.id);
            }}
          >
            <Play style={{ width: scaled(10), height: scaled(10) }} fill="currentColor" />
          </button>
        </>
      )}
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
  if (day.entries.length === 0) return null;

  return (
    <>
      {!isFirst && (
        <div
          style={{ margin: `${scaled(1)} ${scaled(14)}`, borderTop: '1px solid hsl(var(--border) / 0.08)' }}
        />
      )}
      <DayHeader label={formatDateLabel(day.date)} duration={formatDuration(day.totalSeconds)} />
      {day.entries.map((entry) => (
        <EntryRow
          key={entry.id}
          entry={entry}
          isRunning={entry.id === runningEntryId}
          onResume={onResume}
        />
      ))}
    </>
  );
}
