import { AlertTriangle, Settings } from 'lucide-react';
import { scaled } from '@/lib/scaled';
import { useAuth } from '@/providers/auth-provider';
import { HourglassLogo } from './hourglass-logo';

const ENV_STRIP_STYLES = {
  local: 'text-amber-500 bg-amber-500/8 border-amber-500/20',
  dev: 'text-blue-400 bg-blue-400/8 border-blue-400/20',
} as const;

export function PopupHeader({ onSettingsClick }: { onSettingsClick: () => void }) {
  const { environment } = useAuth();
  const stripStyle = environment !== 'prod' ? ENV_STRIP_STYLES[environment] : null;

  return (
    <div style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
      <div
        className="flex items-center justify-between border-b border-border"
        style={{ padding: `${scaled(12)} ${scaled(16)}` }}
      >
        <div
          className="flex items-center font-brand font-semibold uppercase tracking-widest text-primary"
          style={{ fontSize: scaled(11), letterSpacing: '3px', gap: scaled(6) }}
        >
          <HourglassLogo size={14} />
          TERNITY
          <span
            className="font-brand font-normal normal-case tracking-normal text-muted-foreground"
            style={{ fontSize: scaled(9), letterSpacing: '1px' }}
          >
            Electron
          </span>
        </div>
        <button
          className="flex items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          style={{ width: scaled(24), height: scaled(24), WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          onClick={onSettingsClick}
        >
          <Settings style={{ width: scaled(14), height: scaled(14) }} />
        </button>
      </div>
      {stripStyle && (
        <div
          className={`flex items-center justify-center border-b font-mono ${stripStyle}`}
          style={{ fontSize: scaled(8), padding: `${scaled(3)} ${scaled(16)}`, gap: scaled(6) }}
        >
          <AlertTriangle style={{ width: scaled(10), height: scaled(10) }} />
          <span className="font-semibold uppercase">{environment}</span>
          <span className="opacity-40">·</span>
          <span className="opacity-60">{__APP_VERSION__}</span>
        </div>
      )}
    </div>
  );
}
