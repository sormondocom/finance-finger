import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['**/node_modules/**', 'tests/**'],
    passWithNoTests: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      reportsDirectory: './coverage',
      // Only pure-logic modules that can run in Node without browser APIs.
      // Pages, crypto, DB, components, and background are exercised by E2E tests
      // and would read as 0% here, skewing the aggregate numbers.
      include: [
        'src/engine/**/*.ts',
        'src/utils/**/*.ts',
      ],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 60,
      },
      exclude: [
        'src/**/*.{test,spec}.ts',
        // Utils that depend on browser APIs unavailable in Node
        'src/utils/bellSound.ts',       // Web Audio API
        'src/utils/helpNav.ts',         // browser navigation helpers
        'src/utils/notificationModal.ts', // DOM modal
        'src/utils/notifications.ts',   // Notifications API
        'src/utils/notifier.ts',        // depends on notifications
        'src/utils/snapshot.ts',        // depends on IndexedDB db layer
      ],
    },
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
});
