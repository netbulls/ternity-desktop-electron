import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Play, Check, X, ChevronDown } from 'lucide-react';
import { scaled } from '@/lib/scaled';
import type { Entry, DayGroup, ProjectOption } from '@/lib/api-types';
import { formatDuration } from './tray-popup';
import { ProjectPicker } from './project-picker';

// ============================================================
// Breathing effects (adapted from sandbox)
// ============================================================

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

function BreathingGlow() {
  return (
    <motion.div
      className="pointer-events-none absolute inset-0"
      animate={{
        boxShadow: [
          'inset 0 0 10px hsl(var(--primary) / 0.02)',
          'inset 0 0 20px hsl(var(--primary) / 0.06)',
          'inset 0 0 10px hsl(var(--primary) / 0.02)',
        ],
      }}
      transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
    />
  );
}

function SaveFlash() {
  return (
    <motion.div
      className="pointer-events-none absolute inset-0"
      initial={{ backgroundColor: 'hsl(var(--primary) / 0.08)' }}
      animate={{ backgroundColor: 'hsl(var(--primary) / 0)' }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.6 }}
    />
  );
}

// ============================================================
// Types
// ============================================================

type EditingField = 'description' | 'project' | null;

interface EntriesListProps {
  currentEntry: Entry | null;
  entries: DayGroup[];
  onResume: (entryId: string) => void;
  onUpdateEntry: (
    entryId: string,
    params: { description?: string; projectId?: string | null },
  ) => void;
  projects: ProjectOption[];
}

// ============================================================
// Helpers
// ============================================================

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

// ============================================================
// EntriesList
// ============================================================

interface ProjectPickerState {
  entryId: string;
  selectedProjectId: string | null;
  anchor: { top: number; bottom: number; left: number; right: number };
  direction: 'down' | 'up';
}

export function EntriesList({
  currentEntry,
  entries,
  onResume,
  onUpdateEntry,
  projects,
}: EntriesListProps) {
  // Active edit lock — only one entry can be edited at a time
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  // Lifted project picker state — renders outside the scrollable area
  const [pickerState, setPickerState] = useState<ProjectPickerState | null>(null);

  const handleOpenProjectPicker = useCallback(
    (
      entryId: string,
      projectId: string | null,
      anchor: { top: number; bottom: number; left: number; right: number },
    ) => {
      const spaceBelow = window.innerHeight - anchor.bottom;
      setPickerState({
        entryId,
        selectedProjectId: projectId,
        anchor,
        direction: spaceBelow < 250 ? 'up' : 'down',
      });
      setEditingEntryId(entryId);
    },
    [],
  );

  const handleCloseProjectPicker = useCallback(() => {
    setPickerState(null);
    setEditingEntryId(null);
  }, []);

  // Track which entry just had a project saved — for save flash
  const [projectSavedEntryId, setProjectSavedEntryId] = useState<string | null>(null);

  const handleProjectSelect = useCallback(
    (project: ProjectOption | null) => {
      if (pickerState) {
        onUpdateEntry(pickerState.entryId, { projectId: project?.id ?? null });
        setProjectSavedEntryId(pickerState.entryId);
        setTimeout(() => setProjectSavedEntryId(null), 600);
      }
      setPickerState(null);
      setEditingEntryId(null);
    },
    [pickerState, onUpdateEntry],
  );

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

    // Sort entries within each day by createdAt (newest first)
    for (const day of copy) {
      day.entries.sort((a, b) => {
        const aTime = new Date(a.createdAt).getTime();
        const bTime = new Date(b.createdAt).getTime();
        return bTime - aTime;
      });
    }

    return copy;
  })();

  const selectedProject = pickerState?.selectedProjectId
    ? (projects.find((p) => p.id === pickerState.selectedProjectId) ?? null)
    : null;

  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
        {enrichedEntries.map((day, dayIdx) => (
          <DayGroupRow
            key={day.date}
            day={day}
            runningEntryId={currentEntry?.id ?? null}
            onResume={onResume}
            onUpdateEntry={onUpdateEntry}
            projects={projects}
            editingEntryId={editingEntryId}
            onEditingChange={setEditingEntryId}
            onOpenProjectPicker={handleOpenProjectPicker}
            onCloseProjectPicker={handleCloseProjectPicker}
            projectSavedEntryId={projectSavedEntryId}
            isFirst={dayIdx === 0}
          />
        ))}
      </div>
      {/* Project picker — rendered outside the scrollable area */}
      {pickerState && (
        <ProjectPicker
          selected={selectedProject}
          onSelect={handleProjectSelect}
          onClose={handleCloseProjectPicker}
          projects={projects}
          direction={pickerState.direction}
          anchorRect={pickerState.anchor}
        />
      )}
    </>
  );
}

// ============================================================
// DayHeader
// ============================================================

function DayHeader({ label, duration }: { label: string; duration: string }) {
  return (
    <div className="sticky top-0" style={{ zIndex: 50, background: 'hsl(var(--card))' }}>
      {/* Frosted layer with gradual mask */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(to bottom, hsl(var(--card) / 0.95) 0%, hsl(var(--card) / 0.05) 100%)',
          backdropFilter: 'blur(12px)',
          maskImage: 'linear-gradient(to bottom, black 30%, transparent 100%)',
          WebkitMaskImage: 'linear-gradient(to bottom, black 30%, transparent 100%)',
        }}
      />
      {/* Content — unaffected by mask */}
      <div
        className="relative flex items-center justify-between"
        style={{ padding: `${scaled(8)} ${scaled(14)} ${scaled(12)}` }}
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
    </div>
  );
}

// ============================================================
// EntryRow
// ============================================================

function EntryRow({
  entry,
  isRunning,
  onResume,
  onUpdateEntry,
  editingEntryId,
  onEditingChange,
  onOpenProjectPicker,
  onCloseProjectPicker,
  projectSavedEntryId,
}: {
  entry: Entry;
  isRunning: boolean;
  onResume: (entryId: string) => void;
  onUpdateEntry: (
    entryId: string,
    params: { description?: string; projectId?: string | null },
  ) => void;
  editingEntryId: string | null;
  onEditingChange: (id: string | null) => void;
  onOpenProjectPicker: (
    entryId: string,
    projectId: string | null,
    anchor: { top: number; bottom: number; left: number; right: number },
  ) => void;
  onCloseProjectPicker: () => void;
  projectSavedEntryId: string | null;
}) {
  const color = entry.projectColor ?? 'hsl(var(--primary))';
  const [editingField, setEditingField] = useState<EditingField>(null);
  const [editDesc, setEditDesc] = useState('');
  const [savedFlash, setSavedFlash] = useState(false);
  const editingFieldRef = useRef(editingField);
  editingFieldRef.current = editingField;
  const rowRef = useRef<HTMLDivElement>(null);
  const projectLineRef = useRef<HTMLDivElement>(null);

  // Auto-cancel when another entry claims the active edit, or when editing is cleared externally
  useEffect(() => {
    if (editingFieldRef.current === null) return;
    if (editingEntryId === null || editingEntryId !== entry.id) {
      setEditingField(null);
    }
  }, [editingEntryId, entry.id]);

  const triggerSaveFlash = () => {
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 600);
  };

  const handleEditDescription = () => {
    if (isRunning) return;
    onEditingChange(entry.id);
    setEditDesc(entry.description || '');
    setEditingField('description');
  };

  const handleEditProject = () => {
    if (isRunning) return;
    const el = projectLineRef.current ?? rowRef.current;
    if (el) {
      const rect = el.getBoundingClientRect();
      onOpenProjectPicker(entry.id, entry.projectId, {
        top: rect.top,
        bottom: rect.bottom,
        left: rect.left,
        right: rect.right,
      });
    }
    setEditingField('project');
  };

  const handleCancel = () => {
    if (editingField === 'project') onCloseProjectPicker();
    onEditingChange(null);
    setEditingField(null);
  };

  const handleSaveDescription = useCallback(() => {
    onEditingChange(null);
    setEditingField(null);
    const trimmed = editDesc.trim();
    if (trimmed !== (entry.description || '')) {
      onUpdateEntry(entry.id, { description: trimmed });
    }
    triggerSaveFlash();
  }, [editDesc, entry.description, entry.id, onUpdateEntry, onEditingChange]);

  const isEditing = editingField !== null;
  const noDesc = !entry.description;
  const noProject = !entry.projectId;

  return (
    <motion.div
      ref={rowRef}
      className="group relative flex items-center"
      style={{
        gap: scaled(10),
        padding: `${scaled(6)} ${scaled(16)}`,
      }}
      animate={{
        backgroundColor: isRunning
          ? 'hsl(var(--primary) / 0.04)'
          : isEditing
            ? 'hsl(var(--muted) / 0.15)'
            : 'hsla(0, 0%, 0%, 0)',
      }}
      transition={{ duration: 0.2 }}
    >
      {/* Breathing glow on editing row */}
      {isEditing && <BreathingGlow />}

      {/* Save flash */}
      <AnimatePresence>
        {(savedFlash || projectSavedEntryId === entry.id) && <SaveFlash />}
      </AnimatePresence>

      {/* Incomplete entry indicator — amber left border */}
      <AnimatePresence>
        {(noProject || noDesc) && (
          <motion.div
            className="absolute left-0 top-0 bottom-0 overflow-hidden"
            style={{ width: 2, borderRadius: `${scaled(2)}px` }}
            initial={{ scaleY: 0 }}
            animate={{ scaleY: 1 }}
            exit={{ scaleY: 0 }}
            transition={{ type: 'spring', damping: 15, stiffness: 300 }}
          >
            <div className="h-full w-full" style={{ background: 'hsl(35 100% 60%)' }} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Dot — pulsing when running */}
      <div className="relative z-10 shrink-0" style={{ width: scaled(5), height: scaled(5) }}>
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

      {/* Description + project */}
      <div className="relative z-10 min-w-0 flex-1">
        {/* Description — fixed height */}
        <div className="flex items-center" style={{ height: scaled(20) }}>
          {editingField === 'description' ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex w-full items-center"
              style={{ gap: scaled(6) }}
            >
              <motion.input
                className="min-w-0 flex-1 rounded-md bg-muted/40 text-foreground outline-none"
                style={{
                  height: scaled(20),
                  fontSize: scaled(12),
                  padding: `0 ${scaled(6)}`,
                  border: '1px solid hsl(var(--primary) / 0.4)',
                }}
                animate={breathingBorderAnimation}
                transition={breathingBorderTransition}
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveDescription();
                  if (e.key === 'Escape') handleCancel();
                }}
              />
              <motion.button
                whileTap={{ scale: 0.85 }}
                onClick={handleSaveDescription}
                className="flex shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
                style={{ width: scaled(16), height: scaled(16) }}
              >
                <Check style={{ width: scaled(9), height: scaled(9) }} />
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.85 }}
                onClick={handleCancel}
                className="flex shrink-0 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
                style={{ width: scaled(16), height: scaled(16) }}
              >
                <X style={{ width: scaled(9), height: scaled(9) }} />
              </motion.button>
            </motion.div>
          ) : (
            <div
              className={`truncate ${
                isRunning
                  ? 'font-medium text-foreground'
                  : noDesc
                    ? 'cursor-pointer italic text-muted-foreground hover:text-primary'
                    : 'cursor-pointer text-foreground hover:text-primary'
              }`}
              style={{ fontSize: scaled(12) }}
              onClick={handleEditDescription}
            >
              {entry.description || 'No description'}
            </div>
          )}
        </div>

        {/* Project line — fixed height */}
        <div
          ref={projectLineRef}
          className="relative flex items-center"
          style={{ height: scaled(16), marginTop: scaled(2) }}
        >
          {editingField === 'project' ? (
            <div className="relative flex items-center" style={{ gap: scaled(4) }}>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center"
                style={{ gap: scaled(4) }}
              >
                <motion.span
                  className="flex cursor-pointer items-center rounded-full bg-muted/40"
                  style={{
                    gap: scaled(4),
                    padding: `${scaled(1)} ${scaled(8)}`,
                    fontSize: scaled(10),
                    border: '1px solid hsl(var(--primary) / 0.4)',
                  }}
                  animate={breathingBorderAnimation}
                  transition={breathingBorderTransition}
                  onClick={handleCancel}
                >
                  <span
                    className="rounded-full"
                    style={{
                      width: scaled(6),
                      height: scaled(6),
                      background: entry.projectColor ?? 'hsl(var(--primary))',
                    }}
                  />
                  <span className="text-foreground">{entry.projectName || 'Select project'}</span>
                  <ChevronDown
                    style={{ width: scaled(8), height: scaled(8), transform: 'rotate(180deg)' }}
                    className="text-muted-foreground"
                  />
                </motion.span>
                <motion.button
                  whileTap={{ scale: 0.85 }}
                  onClick={handleCancel}
                  className="flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
                  style={{ width: scaled(16), height: scaled(16) }}
                >
                  <X style={{ width: scaled(9), height: scaled(9) }} />
                </motion.button>
              </motion.div>
            </div>
          ) : (
            <div
              className="flex items-center truncate text-muted-foreground"
              style={{ fontSize: scaled(10), gap: scaled(4) }}
            >
              {entry.clientName ? (
                <span
                  className={isRunning ? '' : 'cursor-pointer hover:text-primary'}
                  onClick={handleEditProject}
                >
                  <span className="truncate">{entry.clientName}</span>
                  {entry.projectName && (
                    <>
                      <span className="text-muted-foreground/30"> › </span>
                      <span className="truncate">{entry.projectName}</span>
                    </>
                  )}
                </span>
              ) : entry.projectName ? (
                <span
                  className={`truncate ${isRunning ? '' : 'cursor-pointer hover:text-primary'}`}
                  onClick={handleEditProject}
                >
                  {entry.projectName}
                </span>
              ) : (
                <span
                  className={`italic ${isRunning ? 'opacity-50' : 'cursor-pointer text-amber-500/70 hover:text-amber-400'}`}
                  onClick={handleEditProject}
                >
                  {isRunning ? 'No project' : '+ Add project'}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Duration or tracking badge */}
      {isRunning ? (
        <span
          className="relative z-10 shrink-0 font-brand text-primary/70"
          style={{ fontSize: scaled(9), letterSpacing: '0.5px' }}
        >
          TRACKING
        </span>
      ) : (
        <>
          <div
            className="relative z-10 shrink-0 font-brand font-semibold tabular-nums text-muted-foreground"
            style={{ fontSize: scaled(12) }}
          >
            {formatDuration(entry.totalDurationSeconds)}
          </div>
          <motion.button
            className="relative z-10 flex shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground/30 transition-all hover:bg-primary/15 hover:text-primary"
            style={{ width: scaled(22), height: scaled(22) }}
            whileTap={{ scale: 0.85 }}
            onClick={() => onResume(entry.id)}
          >
            <Play style={{ width: scaled(10), height: scaled(10) }} fill="currentColor" />
          </motion.button>
        </>
      )}
    </motion.div>
  );
}

// ============================================================
// DayGroupRow
// ============================================================

function DayGroupRow({
  day,
  runningEntryId,
  onResume,
  onUpdateEntry,
  projects,
  editingEntryId,
  onEditingChange,
  onOpenProjectPicker,
  onCloseProjectPicker,
  projectSavedEntryId,
  isFirst,
}: {
  day: DayGroup;
  runningEntryId: string | null;
  onResume: (entryId: string) => void;
  onUpdateEntry: (
    entryId: string,
    params: { description?: string; projectId?: string | null },
  ) => void;
  projects: ProjectOption[];
  editingEntryId: string | null;
  onEditingChange: (id: string | null) => void;
  onOpenProjectPicker: (
    entryId: string,
    projectId: string | null,
    anchor: { top: number; bottom: number; left: number; right: number },
  ) => void;
  onCloseProjectPicker: () => void;
  projectSavedEntryId: string | null;
  isFirst: boolean;
}) {
  if (day.entries.length === 0) return null;

  return (
    <>
      {!isFirst && (
        <div
          style={{
            margin: `${scaled(1)} ${scaled(14)}`,
            borderTop: '1px solid hsl(var(--border) / 0.08)',
          }}
        />
      )}
      <DayHeader label={formatDateLabel(day.date)} duration={formatDuration(day.totalSeconds)} />
      {day.entries.map((entry) => (
        <EntryRow
          key={entry.id}
          entry={entry}
          isRunning={entry.id === runningEntryId}
          onResume={onResume}
          onUpdateEntry={onUpdateEntry}
          editingEntryId={editingEntryId}
          onEditingChange={onEditingChange}
          onOpenProjectPicker={onOpenProjectPicker}
          onCloseProjectPicker={onCloseProjectPicker}
          projectSavedEntryId={projectSavedEntryId}
        />
      ))}
    </>
  );
}
