// API response types — mirrors the Ternity backend

export interface Entry {
  id: string;
  description: string;
  projectId: string | null;
  projectName: string | null;
  projectColor: string | null;
  clientName: string | null;
  labels: { id: string; name: string; color: string | null }[];
  startedAt: string;
  stoppedAt: string | null;
  durationSeconds: number | null;
  createdAt: string;
  userId: string;
}

export interface DayGroup {
  date: string;
  totalSeconds: number;
  entries: Entry[];
}

export interface TimerState {
  running: boolean;
  entry: Entry | null;
}

export interface Stats {
  todaySeconds: number;
  weekSeconds: number;
}

export interface ProjectOption {
  id: string;
  name: string;
  color: string | null;
  clientName: string | null;
}

export interface UserProfile {
  userId: string;
  displayName: string;
  email: string | null;
}
