import swc from 'unplugin-swc';
import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    root: './',
    environment: 'node',
    // A live testcontainers Redis (retry.spec.ts) — sequential, shared
    // across the file, same pattern as apps/api's suite.
    fileParallelism: false,
    isolate: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    include: ['src/**/*.spec.ts', 'test/**/*.spec.ts'],
  },
  plugins: [
    tsconfigPaths(),
    // NestJS decorators rely on emitDecoratorMetadata, which esbuild
    // (vitest's default transform) does not implement — Nest's own
    // documented Vitest setup.
    swc.vite({ module: { type: 'es6' } }),
  ],
});
