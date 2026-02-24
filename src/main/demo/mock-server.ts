import seedData from './seed.json';

// Types matching the renderer's api-types
interface Segment {
  id: string;
  type: 'clocked' | 'manual';
  startedAt: string | null;
  stoppedAt: string | null;
  durationSeconds: number | null;
  note: string | null;
  createdAt: string;
}

interface Entry {
  id: string;
  description: string;
  projectId: string | null;
  projectName: string | null;
  projectColor: string | null;
  clientName: string | null;
  labels: { id: string; name: string; color: string | null }[];
  segments: Segment[];
  totalDurationSeconds: number;
  isRunning: boolean;
  createdAt: string;
  userId: string;
}

interface Project {
  id: string;
  name: string;
  color: string | null;
  clientName: string | null;
}

interface UserProfile {
  userId: string;
  displayName: string;
  email: string | null;
}

interface DayGroup {
  date: string;
  totalSeconds: number;
  entries: Entry[];
}

interface SeedEntry {
  dayOffset: number;
  timeOfDay: string;
  durationMinutes: number;
  description: string;
  projectId: string;
}

interface SeedData {
  user: UserProfile;
  projects: Project[];
  entries: SeedEntry[];
}

// In-memory state
let entries: Entry[] = [];
let projects: Project[] = [];
let user: UserProfile | null = null;
let runningEntryId: string | null = null;
let nextId = 1;

function genId(): string {
  return `demo-${nextId++}`;
}

function findProject(projectId: string | null): Project | undefined {
  if (!projectId) return undefined;
  return projects.find((p) => p.id === projectId);
}

function resolveDate(dayOffset: number, timeOfDay: string): Date {
  const now = new Date();
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset);
  const [hours, minutes] = timeOfDay.split(':').map(Number);
  date.setHours(hours, minutes, 0, 0);
  return date;
}

function buildEntry(seed: SeedEntry): Entry {
  const id = genId();
  const project = findProject(seed.projectId);
  const startedAt = resolveDate(seed.dayOffset, seed.timeOfDay);
  const durationSeconds = seed.durationMinutes * 60;
  const stoppedAt = new Date(startedAt.getTime() + durationSeconds * 1000);

  return {
    id,
    description: seed.description,
    projectId: project?.id ?? null,
    projectName: project?.name ?? null,
    projectColor: project?.color ?? null,
    clientName: project?.clientName ?? null,
    labels: [],
    segments: [
      {
        id: `seg-${id}`,
        type: 'clocked',
        startedAt: startedAt.toISOString(),
        stoppedAt: stoppedAt.toISOString(),
        durationSeconds,
        note: null,
        createdAt: startedAt.toISOString(),
      },
    ],
    totalDurationSeconds: durationSeconds,
    isRunning: false,
    createdAt: startedAt.toISOString(),
    userId: 'demo-user-001',
  };
}

function getStartOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function getStartOfWeek(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = d.getDay();
  const diff = day === 0 ? 6 : day - 1; // Monday = start of week
  d.setDate(d.getDate() - diff);
  return d;
}

function calcElapsedSeconds(entry: Entry): number {
  const lastSeg = entry.segments[entry.segments.length - 1];
  if (!lastSeg || lastSeg.stoppedAt) return 0;
  return Math.floor((Date.now() - new Date(lastSeg.startedAt!).getTime()) / 1000);
}

// --- Route handlers ---

function handleGetMe(): { data: UserProfile; status: number } {
  return { data: user!, status: 200 };
}

function handleGetProjects(): { data: Project[]; status: number } {
  return { data: projects, status: 200 };
}

function handleGetTimer(): { data: { running: boolean; entry: Entry | null }; status: number } {
  if (runningEntryId) {
    const entry = entries.find((e) => e.id === runningEntryId) ?? null;
    return { data: { running: true, entry }, status: 200 };
  }
  return { data: { running: false, entry: null }, status: 200 };
}

function handleGetStats(): {
  data: { todaySeconds: number; weekSeconds: number };
  status: number;
} {
  const now = new Date();
  const todayStart = getStartOfDay(now).getTime();
  const weekStart = getStartOfWeek(now).getTime();

  let todaySeconds = 0;
  let weekSeconds = 0;

  for (const entry of entries) {
    const entryDate = new Date(entry.createdAt).getTime();
    let duration = entry.totalDurationSeconds;
    if (entry.isRunning) {
      duration += calcElapsedSeconds(entry);
    }

    if (entryDate >= weekStart) {
      weekSeconds += duration;
    }
    if (entryDate >= todayStart) {
      todaySeconds += duration;
    }
  }

  return { data: { todaySeconds, weekSeconds }, status: 200 };
}

function handleGetEntries(path: string): { data: DayGroup[]; status: number } {
  const url = new URL(path, 'http://localhost');
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');

  let filtered = entries;
  if (from || to) {
    const fromDate = from ? new Date(from + 'T00:00:00').getTime() : 0;
    const toDate = to ? new Date(to + 'T23:59:59.999').getTime() : Infinity;
    filtered = entries.filter((e) => {
      const t = new Date(e.createdAt).getTime();
      return t >= fromDate && t <= toDate;
    });
  }

  // Group by date, descending
  const groups = new Map<string, Entry[]>();
  for (const entry of filtered) {
    const dateKey = entry.createdAt.split('T')[0];
    if (!groups.has(dateKey)) groups.set(dateKey, []);
    groups.get(dateKey)!.push(entry);
  }

  const dayGroups: DayGroup[] = Array.from(groups.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, dayEntries]) => ({
      date,
      totalSeconds: dayEntries.reduce((sum, e) => {
        let d = e.totalDurationSeconds;
        if (e.isRunning) d += calcElapsedSeconds(e);
        return sum + d;
      }, 0),
      entries: dayEntries.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    }));

  return { data: dayGroups, status: 200 };
}

function stopRunningEntry(): void {
  if (!runningEntryId) return;
  const entry = entries.find((e) => e.id === runningEntryId);
  if (entry) {
    const lastSeg = entry.segments[entry.segments.length - 1];
    if (lastSeg && !lastSeg.stoppedAt) {
      lastSeg.stoppedAt = new Date().toISOString();
      lastSeg.durationSeconds = Math.floor(
        (new Date(lastSeg.stoppedAt).getTime() - new Date(lastSeg.startedAt!).getTime()) / 1000,
      );
    }
    entry.totalDurationSeconds = entry.segments.reduce(
      (sum, s) => sum + (s.durationSeconds ?? 0),
      0,
    );
    entry.isRunning = false;
  }
  runningEntryId = null;
}

function handleTimerStart(body?: unknown): { data: { running: boolean; entry: Entry }; status: number } {
  stopRunningEntry();

  const { description, projectId } = (body as { description?: string; projectId?: string }) ?? {};
  const project = findProject(projectId ?? null);
  const now = new Date().toISOString();
  const id = genId();

  const entry: Entry = {
    id,
    description: description ?? '',
    projectId: project?.id ?? null,
    projectName: project?.name ?? null,
    projectColor: project?.color ?? null,
    clientName: project?.clientName ?? null,
    labels: [],
    segments: [
      {
        id: `seg-${id}`,
        type: 'clocked',
        startedAt: now,
        stoppedAt: null,
        durationSeconds: null,
        note: null,
        createdAt: now,
      },
    ],
    totalDurationSeconds: 0,
    isRunning: true,
    createdAt: now,
    userId: 'demo-user-001',
  };

  entries.unshift(entry);
  runningEntryId = id;

  return { data: { running: true, entry }, status: 200 };
}

function handleTimerStop(): { data: { running: boolean; entry: null }; status: number } {
  stopRunningEntry();
  return { data: { running: false, entry: null }, status: 200 };
}

function handleTimerResume(entryId: string): {
  data: { running: boolean; entry: Entry };
  status: number;
} {
  const original = entries.find((e) => e.id === entryId);
  if (!original) {
    return handleTimerStart({});
  }

  return handleTimerStart({
    description: original.description,
    projectId: original.projectId,
  });
}

function handlePatchEntry(
  entryId: string,
  body?: unknown,
): { data: Entry; status: number } | { error: string; status: number } {
  const entry = entries.find((e) => e.id === entryId);
  if (!entry) {
    return { error: 'Entry not found', status: 404 };
  }

  const { description, projectId } = (body as { description?: string; projectId?: string | null }) ?? {};

  if (description !== undefined) {
    entry.description = description;
  }

  if (projectId !== undefined) {
    if (projectId === null) {
      entry.projectId = null;
      entry.projectName = null;
      entry.projectColor = null;
      entry.clientName = null;
    } else {
      const project = findProject(projectId);
      if (project) {
        entry.projectId = project.id;
        entry.projectName = project.name;
        entry.projectColor = project.color;
        entry.clientName = project.clientName;
      }
    }
  }

  return { data: entry, status: 200 };
}

// --- Public API ---

export function initDemo(): void {
  const seed = seedData as SeedData;

  user = seed.user;
  projects = seed.projects;
  nextId = 1;
  runningEntryId = null;
  entries = seed.entries.map(buildEntry);

  // Sort entries by date descending
  entries.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function resetDemo(): void {
  entries = [];
  projects = [];
  user = null;
  runningEntryId = null;
  nextId = 1;
}

export function handleDemoRequest(
  path: string,
  options?: { method?: string; body?: unknown },
): { data?: unknown; error?: string; status: number } {
  const method = options?.method ?? 'GET';

  // GET routes
  if (method === 'GET') {
    if (path === '/api/me') return handleGetMe();
    if (path === '/api/projects') return handleGetProjects();
    if (path === '/api/timer') return handleGetTimer();
    if (path === '/api/stats') return handleGetStats();
    if (path.startsWith('/api/entries')) return handleGetEntries(path);
  }

  // POST routes
  if (method === 'POST') {
    if (path === '/api/timer/start') return handleTimerStart(options?.body);
    if (path === '/api/timer/stop') return handleTimerStop();

    const resumeMatch = path.match(/^\/api\/timer\/resume\/(.+)$/);
    if (resumeMatch) return handleTimerResume(resumeMatch[1]);
  }

  // PATCH routes
  if (method === 'PATCH') {
    const entryMatch = path.match(/^\/api\/entries\/(.+)$/);
    if (entryMatch) return handlePatchEntry(entryMatch[1], options?.body);
  }

  return { error: `Demo: unhandled ${method} ${path}`, status: 404 };
}
