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
import type { TimerState, DayGroup, Stats, ProjectOption, UserProfile } from '@/lib/api-types';

interface DataContextValue {
  timer: TimerState;
  entries: DayGroup[];
  stats: Stats;
  projects: ProjectOption[];
  userProfile: UserProfile | null;
  isLoading: boolean;
  error: string | null;
  startTimer: (params: { description?: string; projectId?: string }) => Promise<void>;
  stopTimer: () => Promise<void>;
  resumeTimer: (entryId: string) => Promise<void>;
}

const DEFAULT_TIMER: TimerState = { running: false, entry: null };
const DEFAULT_STATS: Stats = { todaySeconds: 0, weekSeconds: 0 };

const DataContext = createContext<DataContextValue | null>(null);

function getEntriesDateRange(): { from: string; to: string } {
  const today = new Date();
  const from = new Date(today);
  from.setDate(from.getDate() - 6); // 7 days including today
  return {
    from: from.toISOString().split('T')[0],
    to: today.toISOString().split('T')[0],
  };
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
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Stop polling immediately when auth state changes
  useEffect(() => {
    if (!isAuthenticated && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, [isAuthenticated]);

  const apiBaseUrl = environmentConfig.apiBaseUrl;

  const handleApiError = useCallback(
    (err: unknown) => {
      if (err instanceof ApiError && err.status === 401) {
        // Stop polling immediately before triggering sign-out
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
        signOut();
        return;
      }
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error('[data] API error:', message);
      setError(message);
    },
    [signOut],
  );

  const fetchTimerAndStats = useCallback(async () => {
    const [timerRes, statsRes] = await Promise.all([
      apiFetch<TimerState>(apiBaseUrl, environment, '/api/timer'),
      apiFetch<Stats>(apiBaseUrl, environment, '/api/stats'),
    ]);
    setTimer(timerRes);
    setStats(statsRes);
    setError(null);
  }, [apiBaseUrl, environment]);

  const fetchEntries = useCallback(async () => {
    const { from, to } = getEntriesDateRange();
    const res = await apiFetch<DayGroup[]>(
      apiBaseUrl,
      environment,
      `/api/entries?from=${from}&to=${to}`,
    );
    setEntries(res);
  }, [apiBaseUrl, environment]);

  const fetchProjects = useCallback(async () => {
    const res = await apiFetch<ProjectOption[]>(apiBaseUrl, environment, '/api/projects');
    setProjects(res);
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
        await Promise.all([fetchTimerAndStats(), fetchEntries(), fetchProjects(), fetchUserProfile()]);
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
  }, [isDemo, fetchTimerAndStats, fetchEntries, fetchProjects, entries.length, projects.length, handleApiError]);

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
        await refetchAfterMutation();
      } catch (err) {
        handleApiError(err);
      }
    },
    [apiBaseUrl, environment, refetchAfterMutation, handleApiError],
  );

  const stopTimer = useCallback(async () => {
    try {
      await apiFetch<TimerState>(apiBaseUrl, environment, '/api/timer/stop', { method: 'POST' });
      await refetchAfterMutation();
    } catch (err) {
      handleApiError(err);
    }
  }, [apiBaseUrl, environment, refetchAfterMutation, handleApiError]);

  const resumeTimer = useCallback(
    async (entryId: string) => {
      try {
        await apiFetch<TimerState>(apiBaseUrl, environment, `/api/timer/resume/${entryId}`, {
          method: 'POST',
        });
        await refetchAfterMutation();
      } catch (err) {
        handleApiError(err);
      }
    },
    [apiBaseUrl, environment, refetchAfterMutation, handleApiError],
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
        startTimer,
        stopTimer,
        resumeTimer,
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
