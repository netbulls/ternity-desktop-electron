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
      className="flex flex-col items-center justify-center text-center"
      style={{ padding: `${scaled(40)} ${scaled(24)}`, WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      <div className="mb-4 text-primary" style={{ opacity: 0.5 }}>
        <HourglassLogo size={40} />
      </div>
      <div
        className="mb-1 font-brand font-semibold uppercase tracking-widest text-foreground"
        style={{ fontSize: scaled(14), letterSpacing: '4px' }}
      >
        TERNITY
      </div>
      <div className="mb-6 text-muted-foreground" style={{ fontSize: scaled(11) }}>
        Time tracking for your team
      </div>

      {/* Environment selector */}
      <div className="mb-6 flex w-full justify-center" style={{ gap: scaled(6), WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        {ENVIRONMENT_LIST.map((env) => (
          <button
            key={env.id}
            disabled={isSigningIn}
            className={`rounded-md border px-3 py-1.5 transition-colors ${
              environment === env.id
                ? 'border-primary/40 bg-primary/8 text-primary'
                : 'border-border bg-card text-muted-foreground hover:border-primary/20 hover:text-foreground'
            } ${isSigningIn ? 'cursor-not-allowed opacity-50' : ''}`}
            style={{ fontSize: scaled(10) }}
            onClick={() => setEnvironment(env.id as EnvironmentId)}
          >
            {env.label}
          </button>
        ))}
      </div>

      {isSigningIn ? (
        <div style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <div
            className="flex items-center text-muted-foreground"
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
        <div style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <motion.button
            className="flex items-center rounded-lg bg-primary px-6 py-2.5 font-medium text-primary-foreground transition-colors"
            style={{ fontSize: scaled(12), gap: scaled(6) }}
            whileTap={{ scale: 0.95 }}
            onClick={signIn}
          >
            <LogIn style={{ width: scaled(14), height: scaled(14) }} />
            Sign in
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

      <div className="mt-6 text-muted-foreground/40" style={{ fontSize: scaled(9) }}>
        {__APP_VERSION__}
      </div>
    </div>
  );
}
