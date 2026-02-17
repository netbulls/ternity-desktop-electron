import { resolve } from 'path';
import { execSync } from 'child_process';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';

const appVersion = execSync('git describe --tags --always')
  .toString()
  .trim();

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        output: {
          format: 'cjs',
          entryFileNames: '[name].cjs',
        },
      },
    },
  },
  renderer: {
    resolve: {
      alias: {
        '@': resolve('src/renderer/src'),
      },
    },
    define: {
      __APP_VERSION__: JSON.stringify(appVersion),
    },
    plugins: [react()],
  },
});
