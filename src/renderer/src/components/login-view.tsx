import { motion } from 'motion/react';
import { LogIn, Loader2 } from 'lucide-react';
import { scaled } from '@/lib/scaled';
import { ENVIRONMENT_LIST, type EnvironmentId } from '@/lib/environments';
import { useAuth } from '@/providers/auth-provider';
import { HourglassLogo } from './hourglass-logo';

export function LoginView() {
  const { environment, setEnvironment, signIn, signInDemo, isSigningIn, cancelSignIn } = useAuth();

  return (
    <div
      className="flex h-screen flex-col items-center text-center"
      style={{ padding: `${scaled(24)} ${scaled(24)}`, WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      {/* Top section — branding */}
      <div className="flex flex-1 flex-col items-center justify-center">
        <div className="mb-6 text-primary" style={{ opacity: 0.5 }}>
          <HourglassLogo size={48} />
        </div>
        <div
          className="mb-1.5 font-brand font-semibold uppercase tracking-widest text-foreground"
          style={{ fontSize: scaled(16), letterSpacing: '5px' }}
        >
          TERNITY
        </div>
        <div className="mb-8 text-muted-foreground" style={{ fontSize: scaled(11) }}>
          Time tracking for your team
        </div>

        {/* Sign-in / signing-in state */}
        {isSigningIn ? (
          <div className="flex w-full flex-col items-center" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            <div
              className="flex w-full items-center justify-center rounded-lg border border-border bg-card/50 py-2.5 text-muted-foreground"
              style={{ fontSize: scaled(12), gap: scaled(8) }}
            >
              <Loader2
                className="animate-spin text-primary"
                style={{ width: scaled(16), height: scaled(16) }}
              />
              Waiting for browser...
            </div>
            <button
              className="mt-3 text-muted-foreground/50 transition-colors hover:text-muted-foreground"
              style={{ fontSize: scaled(10) }}
              onClick={cancelSignIn}
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex w-full flex-col items-center" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            <motion.button
              className="flex w-full items-center justify-center rounded-lg bg-primary py-2.5 font-medium text-primary-foreground transition-colors"
              style={{ fontSize: scaled(12), gap: scaled(8) }}
              whileTap={{ scale: 0.97 }}
              onClick={signIn}
            >
              <LogIn style={{ width: scaled(14), height: scaled(14) }} />
              Sign in with browser
            </motion.button>

            <button
              className="mt-3 text-muted-foreground/50 transition-colors hover:text-muted-foreground"
              style={{ fontSize: scaled(10) }}
              onClick={signInDemo}
            >
              Continue as demo
            </button>
          </div>
        )}
      </div>

      {/* Footer — version + env selector */}
      <div className="flex w-full flex-col items-center" style={{ gap: scaled(8) }}>
        <div className="h-px w-full bg-border/40" />
        <div className="text-muted-foreground/40" style={{ fontSize: scaled(9) }}>
          Electron · {__APP_VERSION__}
        </div>
        <div
          className="flex items-center text-muted-foreground/40"
          style={{ fontSize: scaled(9), gap: scaled(4), WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          {ENVIRONMENT_LIST.map((env, i) => (
            <span key={env.id} className="flex items-center" style={{ gap: scaled(4) }}>
              {i > 0 && <span>·</span>}
              <button
                disabled={isSigningIn}
                className={`transition-colors ${
                  environment === env.id
                    ? 'text-primary'
                    : 'hover:text-muted-foreground'
                } ${isSigningIn ? 'cursor-not-allowed' : ''}`}
                onClick={() => setEnvironment(env.id as EnvironmentId)}
              >
                {env.label}
              </button>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
