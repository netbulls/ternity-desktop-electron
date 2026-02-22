import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useAuth } from './auth-provider';
import { apiFetch, ApiError } from '@/lib/api';
import type {
  Entry,
  TimerState,
  DayGroup,
  Stats,
  ProjectOption,
  UserProfile,
} from '@/lib/api-types';

interface MutationError {
  message: string;
  retry: () => void;
}

interface DataContextValue {
  timer: TimerState;
  entries: DayGroup[];
  stats: Stats;
  projects: ProjectOption[];
  userProfile: UserProfile | null;
  isLoading: boolean;
  error: string | null;
  mutationError: MutationError | null;
  dismissMutationError: () => void;
  startTimer: (params: { description?: string; projectId?: string }) => Promise<void>;
  stopTimer: () => Promise<void>;
  resumeTimer: (entryId: string) => Promise<void>;
  updateTimer: (params: { description?: string; projectId?: string | null }) => Promise<void>;
  updateEntry: (
    entryId: string,
    params: { description?: string; projectId?: string | null },
  ) => void;
  patchTimerLocal: (params: { description?: string; projectId?: string | null }) => void;
}

const DEFAULT_TIMER: TimerState = { running: false, entry: null };
const DEFAULT_STATS: Stats = { todaySeconds: 0, weekSeconds: 0 };

const DataContext = createContext<DataContextValue | null>(null);

// Compat shim: normalize old API response (flat startedAt/stoppedAt/durationSeconds)
// into the new segments-based shape. Remove once API is fully migrated.
/* eslint-disable @typescript-eslint/no-explicit-any */
function normalizeEntry(raw: any): Entry {
  if (raw.segments) return raw as Entry; // already new shape
  const startedAt = raw.startedAt ?? null;
  const stoppedAt = raw.stoppedAt ?? null;
  const durationSeconds = raw.durationSeconds ?? null;
  const isRunning = startedAt != null && stoppedAt == null;
  const entry: Entry = {
    id: raw.id,
    description: raw.description,
    projectId: raw.projectId,
    projectName: raw.projectName,
    projectColor: raw.projectColor,
    clientName: raw.clientName,
    labels: raw.labels,
    segments: startedAt
      ? [
          {
            id: `compat-${raw.id}`,
            type: 'clocked',
            startedAt,
            stoppedAt,
            durationSeconds,
            note: null,
            createdAt: raw.createdAt,
          },
        ]
      : [],
    totalDurationSeconds: durationSeconds ?? 0,
    isRunning,
    createdAt: raw.createdAt,
    userId: raw.userId,
  };
  return entry;
}

function normalizeTimerState(raw: any): TimerState {
  return {
    running: raw.running,
    entry: raw.entry ? normalizeEntry(raw.entry) : null,
  };
}

function normalizeDayGroups(raw: any[]): DayGroup[] {
  return raw.map((day) => ({
    ...day,
    entries: day.entries.map(normalizeEntry),
  }));
}
/* eslint-enable @typescript-eslint/no-explicit-any */

function getEntriesDateRange(): { from: string; to: string } {
  const today = new Date();
  const from = new Date(today);
  from.setDate(from.getDate() - 6); // 7 days including today
  return {
    from: from.toISOString().split('T')[0],
    to: today.toISOString().split('T')[0],
  };
}

// Module-level cache so SettingsContent (outside DataProvider) can read data instantly
let cachedProjects: ProjectOption[] = [];
let cachedDefaultProjectId: string | null = null;
export function getCachedProjects(): ProjectOption[] {
  return cachedProjects;
}
export function getCachedDefaultProjectId(): string | null {
  return cachedDefaultProjectId;
}
export function setCachedDefaultProjectId(id: string | null): void {
  cachedDefaultProjectId = id;
}

export function DataProvider({ children }: { children: ReactNode }) {
  const { environment, environmentConfig, isAuthenticated, isDemo, signOut } = useAuth();
  const [timer, setTimer] = useState<TimerState>(DEFAULT_TIMER);
  const [entries, setEntries] = useState<DayGroup[]>([]);
  const [stats, setStats] = useState<Stats>(DEFAULT_STATS);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(!isDemo);
  const [error, setError] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<MutationError | null>(null);
  const dismissMutationError = useCallback(() => setMutationError(null), []);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerDirtyUntilRef = useRef<number>(0); // timestamp — suppress poll overwrites until this time

  // Stop polling immediately when auth state changes
  useEffect(() => {
    if (!isAuthenticated && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, [isAuthenticated]);

  const apiBaseUrl = environmentConfig.apiBaseUrl;

  const authFailuresRef = useRef(0);

  const handleApiError = useCallback(
    (err: unknown) => {
      if (err instanceof ApiError && err.status === 401) {
        authFailuresRef.current += 1;
        console.warn('[data] 401 error, attempt', authFailuresRef.current);

        // Allow a few 401s for token refresh to recover (wake from sleep, transient failure)
        if (authFailuresRef.current >= 3) {
          console.error('[data] Persistent 401 — signing out');
          if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
          }
          authFailuresRef.current = 0;
          signOut();
        }
        return;
      }
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error('[data] API error:', message);
      setError(message);
    },
    [signOut],
  );

  const fetchTimerAndStats = useCallback(async () => {
    const [timerRaw, statsRes] = await Promise.all([
      apiFetch<TimerState>(apiBaseUrl, environment, '/api/timer'),
      apiFetch<Stats>(apiBaseUrl, environment, '/api/stats'),
    ]);
    const timerRes = normalizeTimerState(timerRaw);
    // Don't overwrite optimistic timer updates — wait until the dirty window expires
    if (Date.now() < timerDirtyUntilRef.current) {
      // Only update stats, keep the local timer state
      setStats(statsRes);
    } else {
      setTimer(timerRes);
      setStats(statsRes);
    }
    setError(null);
    authFailuresRef.current = 0;
  }, [apiBaseUrl, environment]);

  const fetchEntries = useCallback(async () => {
    const { from, to } = getEntriesDateRange();
    const raw = await apiFetch<DayGroup[]>(
      apiBaseUrl,
      environment,
      `/api/entries?from=${from}&to=${to}`,
    );
    setEntries(normalizeDayGroups(raw));
  }, [apiBaseUrl, environment]);

  const fetchProjects = useCallback(async () => {
    const res = await apiFetch<ProjectOption[]>(apiBaseUrl, environment, '/api/projects');
    setProjects(res);
    cachedProjects = res;
  }, [apiBaseUrl, environment]);

  const fetchUserProfile = useCallback(async () => {
    const res = await apiFetch<UserProfile>(apiBaseUrl, environment, '/api/me');
    setUserProfile(res);
  }, [apiBaseUrl, environment]);

  // Initial fetch on mount
  useEffect(() => {
    if (isDemo) return;
    let cancelled = false;

    (async () => {
      try {
        await Promise.all([
          fetchTimerAndStats(),
          fetchEntries(),
          fetchProjects(),
          fetchUserProfile(),
          // Pre-cache default project ID for settings panel
          window.electronAPI?.getDefaultProject().then((id) => {
            cachedDefaultProjectId = id ?? null;
          }),
        ]);
      } catch (err) {
        if (!cancelled) handleApiError(err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isDemo, fetchTimerAndStats, fetchEntries, fetchProjects, fetchUserProfile, handleApiError]);

  // Poll every 5s — always timer+stats, retry entries/projects if they failed
  useEffect(() => {
    if (isDemo) return;

    pollRef.current = setInterval(async () => {
      try {
        const promises: Promise<void>[] = [fetchTimerAndStats()];
        if (entries.length === 0) promises.push(fetchEntries());
        if (projects.length === 0) promises.push(fetchProjects());
        await Promise.all(promises);
      } catch (err) {
        handleApiError(err);
      }
    }, 5000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [
    isDemo,
    fetchTimerAndStats,
    fetchEntries,
    fetchProjects,
    entries.length,
    projects.length,
    handleApiError,
  ]);

  const refetchAfterMutation = useCallback(async () => {
    await Promise.all([fetchTimerAndStats(), fetchEntries()]);
  }, [fetchTimerAndStats, fetchEntries]);

  const startTimer = useCallback(
    async (params: { description?: string; projectId?: string }) => {
      try {
        await apiFetch<TimerState>(apiBaseUrl, environment, '/api/timer/start', {
          method: 'POST',
          body: { description: params.description, projectId: params.projectId },
        });
        setMutationError(null);
        await refetchAfterMutation();
      } catch (err) {
        handleApiError(err);
        setMutationError({
          message: 'Failed to start timer',
          retry: () => startTimer(params),
        });
      }
    },
    [apiBaseUrl, environment, refetchAfterMutation, handleApiError],
  );

  const stopTimer = useCallback(async () => {
    try {
      timerDirtyUntilRef.current = 0; // Clear dirty window so refetch applies
      await apiFetch<TimerState>(apiBaseUrl, environment, '/api/timer/stop', { method: 'POST' });
      setMutationError(null);
      await refetchAfterMutation();
    } catch (err) {
      handleApiError(err);
      setMutationError({
        message: 'Failed to stop timer',
        retry: () => stopTimer(),
      });
    }
  }, [apiBaseUrl, environment, refetchAfterMutation, handleApiError]);

  const resumeTimer = useCallback(
    async (entryId: string) => {
      try {
        timerDirtyUntilRef.current = 0; // Clear dirty window so refetch applies
        await apiFetch<TimerState>(apiBaseUrl, environment, `/api/timer/resume/${entryId}`, {
          method: 'POST',
        });
        setMutationError(null);
        await refetchAfterMutation();
      } catch (err) {
        handleApiError(err);
        setMutationError({
          message: 'Failed to resume timer',
          retry: () => resumeTimer(entryId),
        });
      }
    },
    [apiBaseUrl, environment, refetchAfterMutation, handleApiError],
  );

  const patchTimerLocal = useCallback(
    (params: { description?: string; projectId?: string | null }) => {
      // Suppress poll overwrites for 6s after an optimistic update
      // (covers 500ms debounce + API roundtrip + one 5s poll cycle)
      timerDirtyUntilRef.current = Date.now() + 6000;
      setTimer((prev) => {
        if (!prev.entry) return prev;
        const patch: Partial<Entry> = {};
        if (params.description !== undefined) patch.description = params.description;
        if (params.projectId !== undefined) {
          if (params.projectId === null) {
            patch.projectId = null;
            patch.projectName = null;
            patch.projectColor = null;
            patch.clientName = null;
          } else {
            const proj = projects.find((p) => p.id === params.projectId);
            if (proj) {
              patch.projectId = proj.id;
              patch.projectName = proj.name;
              patch.projectColor = proj.color;
              patch.clientName = proj.clientName;
            }
          }
        }
        return { ...prev, entry: { ...prev.entry, ...patch } };
      });
    },
    [projects],
  );

  const updateTimer = useCallback(
    async (params: { description?: string; projectId?: string | null }) => {
      if (!timer.running || !timer.entry) return;
      patchTimerLocal(params);
      try {
        await apiFetch(apiBaseUrl, environment, `/api/entries/${timer.entry.id}`, {
          method: 'PATCH',
          body: params,
        });
        setMutationError(null);
      } catch (err) {
        console.warn('[data] updateTimer failed:', err instanceof Error ? err.message : err);
        setMutationError({
          message: 'Failed to save changes',
          retry: () => updateTimer(params),
        });
      }
    },
    [apiBaseUrl, environment, timer.running, timer.entry, patchTimerLocal],
  );

  const updateEntry = useCallback(
    (entryId: string, params: { description?: string; projectId?: string | null }) => {
      // Optimistic update — patch the entry in the local list immediately
      setEntries((prev) =>
        prev.map((day) => ({
          ...day,
          entries: day.entries.map((e) => {
            if (e.id !== entryId) return e;
            const patch: Partial<Entry> = {};
            if (params.description !== undefined) patch.description = params.description;
            if (params.projectId !== undefined) {
              if (params.projectId === null) {
                patch.projectId = null;
                patch.projectName = null;
                patch.projectColor = null;
                patch.clientName = null;
              } else {
                const proj = projects.find((p) => p.id === params.projectId);
                if (proj) {
                  patch.projectId = proj.id;
                  patch.projectName = proj.name;
                  patch.projectColor = proj.color;
                  patch.clientName = proj.clientName;
                }
              }
            }
            return { ...e, ...patch };
          }),
        })),
      );
      // Fire API call in background, refetch on completion
      apiFetch(apiBaseUrl, environment, `/api/entries/${entryId}`, {
        method: 'PATCH',
        body: params,
      })
        .then(() => {
          setMutationError(null);
          return fetchEntries();
        })
        .catch((err) => {
          console.warn('[data] updateEntry failed:', err instanceof Error ? err.message : err);
          setMutationError({
            message: 'Failed to save changes',
            retry: () => updateEntry(entryId, params),
          });
          fetchEntries(); // Revert optimistic update
        });
    },
    [apiBaseUrl, environment, fetchEntries, projects],
  );

  return (
    <DataContext.Provider
      value={{
        timer,
        entries,
        stats,
        projects,
        userProfile,
        isLoading,
        error,
        mutationError,
        dismissMutationError,
        startTimer,
        stopTimer,
        resumeTimer,
        updateTimer,
        updateEntry,
        patchTimerLocal,
      }}
    >
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used within DataProvider');
  return ctx;
}

/** Safe version — returns null when used outside DataProvider (e.g. settings panel). */
export function useOptionalData() {
  return useContext(DataContext);
}
