import { AuthProvider } from '@/providers/auth-provider';
import { ThemeProvider } from '@/providers/theme-provider';
import { ScaleProvider } from '@/providers/scale-provider';
import { LayoutProvider } from '@/providers/layout-provider';
import { TrayPopup } from '@/components/tray-popup';

export function App() {
  return (
    <AuthProvider>
      <ThemeProvider>
        <ScaleProvider>
          <LayoutProvider>
            <TrayPopup />
          </LayoutProvider>
        </ScaleProvider>
      </ThemeProvider>
    </AuthProvider>
  );
}
