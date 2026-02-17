import { Layers, Target, Keyboard, X, LogOut } from 'lucide-react';
import { scaled } from '@/lib/scaled';
import { THEMES, type ThemeId } from '@/lib/themes';
import { SCALES, useScale } from '@/providers/scale-provider';
import { useTheme } from '@/providers/theme-provider';
import { useAuth } from '@/providers/auth-provider';
import { useOptionalData } from '@/providers/data-provider';
import type { LayoutType } from './tray-popup';

export function SettingsContent({
  layout,
  onLayoutChange,
  onClose,
}: {
  layout: LayoutType;
  onLayoutChange: (l: LayoutType) => void;
  onClose: () => void;
}) {
  const { theme, setTheme } = useTheme();
  const { scale, setScale } = useScale();
  const { environmentConfig, user, signOut } = useAuth();
  const data = useOptionalData();

  return (
    <div style={{ padding: scaled(16) }}>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center" style={{ gap: scaled(6) }}>
          <span
            className="font-brand font-semibold uppercase tracking-widest text-foreground"
            style={{ fontSize: scaled(10), letterSpacing: '2px' }}
          >
            Settings
          </span>
          <span
            className="rounded border border-primary/30 bg-primary/8 px-1.5 py-0.5 font-mono text-primary"
            style={{ fontSize: scaled(8) }}
          >
            {environmentConfig.label}
          </span>
        </div>
        <button
          className="flex items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          style={{ width: scaled(24), height: scaled(24) }}
          onClick={onClose}
        >
          <X style={{ width: scaled(14), height: scaled(14) }} />
        </button>
      </div>

      {/* Layout picker */}
      <div className="mb-4">
        <span
          className="mb-2 block font-brand uppercase tracking-wider text-muted-foreground"
          style={{ fontSize: scaled(8), letterSpacing: '1.5px' }}
        >
          Layout
        </span>
        <div className="flex" style={{ gap: scaled(6) }}>
          {(
            [
              ['layered', 'Layered', Layers],
              ['hero', 'Hero', Target],
            ] as const
          ).map(([key, label, Icon]) => (
            <button
              key={key}
              className={`flex flex-1 items-center justify-center rounded-md border transition-colors ${
                layout === key
                  ? 'border-primary/40 bg-primary/8 text-primary'
                  : 'border-border bg-card text-muted-foreground hover:border-primary/20 hover:text-foreground'
              }`}
              style={{
                gap: scaled(6),
                padding: `${scaled(8)} ${scaled(12)}`,
                fontSize: scaled(11),
              }}
              onClick={() => onLayoutChange(key)}
            >
              <Icon style={{ width: scaled(14), height: scaled(14) }} />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Theme picker */}
      <div className="mb-4">
        <span
          className="mb-2 block font-brand uppercase tracking-wider text-muted-foreground"
          style={{ fontSize: scaled(8), letterSpacing: '1.5px' }}
        >
          Theme
        </span>
        <div className="grid grid-cols-3" style={{ gap: scaled(4) }}>
          {THEMES.map((t) => (
            <button
              key={t.id}
              className={`rounded-md border text-center transition-colors ${
                theme === t.id
                  ? 'border-primary/40 bg-primary/8 text-primary'
                  : 'border-border bg-card text-muted-foreground hover:border-primary/20 hover:text-foreground'
              }`}
              style={{ padding: `${scaled(6)} ${scaled(8)}`, fontSize: scaled(10) }}
              onClick={() => setTheme(t.id as ThemeId)}
            >
              {t.name}
            </button>
          ))}
        </div>
      </div>

      {/* Scale picker */}
      <div className="mb-4">
        <span
          className="mb-2 block font-brand uppercase tracking-wider text-muted-foreground"
          style={{ fontSize: scaled(8), letterSpacing: '1.5px' }}
        >
          Scale
        </span>
        <div className="flex" style={{ gap: scaled(4) }}>
          {SCALES.map((s) => (
            <button
              key={s.label}
              className={`flex-1 rounded-md border text-center transition-colors ${
                scale === s.value
                  ? 'border-primary/40 bg-primary/8 text-primary'
                  : 'border-border bg-card text-muted-foreground hover:border-primary/20 hover:text-foreground'
              }`}
              style={{ padding: `${scaled(6)} ${scaled(8)}`, fontSize: scaled(10) }}
              onClick={() => setScale(s.value)}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Shortcuts */}
      <div>
        <span
          className="mb-2 flex items-center font-brand uppercase tracking-wider text-muted-foreground"
          style={{ fontSize: scaled(8), letterSpacing: '1.5px', gap: scaled(4) }}
        >
          <Keyboard style={{ width: scaled(10), height: scaled(10) }} />
          Shortcuts
        </span>
        <div
          className="rounded-md border border-border bg-card"
          style={{ padding: `${scaled(8)} ${scaled(10)}` }}
        >
          {[
            ['Start / Stop', '⌘ + Shift + T'],
            ['Open Popup', '⌘ + Shift + P'],
            ['Open Web App', '⌘ + Shift + W'],
          ].map(([action, key]) => (
            <div
              key={action}
              className="flex items-center justify-between text-muted-foreground"
              style={{ fontSize: scaled(10), padding: `${scaled(3)} 0` }}
            >
              <span>{action}</span>
              <kbd
                className="rounded border border-border bg-muted/50 font-mono"
                style={{ padding: `${scaled(1)} ${scaled(6)}`, fontSize: scaled(9) }}
              >
                {key}
              </kbd>
            </div>
          ))}
        </div>
      </div>

      {/* User + Sign out */}
      <div
        className="mt-4 flex items-center border-t border-border"
        style={{ paddingTop: scaled(10), gap: scaled(8) }}
      >
        {user && (
          <div
            className="min-w-0 flex-1 truncate text-muted-foreground"
            style={{ fontSize: scaled(9) }}
          >
            {data?.userProfile?.displayName ?? user.name ?? user.email ?? user.sub}
          </div>
        )}
        <button
          className="flex shrink-0 items-center rounded-md border border-border bg-card text-muted-foreground transition-colors hover:border-red-500/40 hover:bg-red-500/8 hover:text-red-400"
          style={{ gap: scaled(4), padding: `${scaled(5)} ${scaled(8)}`, fontSize: scaled(10) }}
          onClick={signOut}
        >
          <LogOut style={{ width: scaled(12), height: scaled(12) }} />
          Sign out
        </button>
      </div>
    </div>
  );
}
