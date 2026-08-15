import swc from 'unplugin-swc';
import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    root: './',
    environment: 'node',
    // A live testcontainers Postgres + Redis per run (test/setup.ts). One
    // container, not one per file — tests run sequentially against it, and
    // isolate: false keeps every spec file in the same worker so the
    // module-level container/app caches in test/setup.ts actually apply.
    fileParallelism: false,
    isolate: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    include: ['src/**/*.spec.ts', 'test/**/*.spec.ts'],
  },
  plugins: [
    tsconfigPaths(),
    // NestJS decorators rely on emitDecoratorMetadata, which esbuild (vitest's
    // default transform) does not implement. swc does — this is Nest's own
    // documented Vitest setup.
    swc.vite({ module: { type: 'es6' } }),
  ],
});
