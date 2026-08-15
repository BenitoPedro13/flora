import { spawn } from 'node:child_process';
import { startTestInfra } from '@flora/db/test/containers';
import { describe, expect, it } from 'vitest';

// vitest.config.ts sets `root: './'` (apps/api), and this suite only ever
// runs via `pnpm --filter api test`, so process.cwd() is apps/api itself.
const apiRoot = process.cwd();

function runMain(
  databaseUrl: string,
): Promise<{ code: number | null; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn('node', ['--import', 'tsx/esm', 'src/main.ts'], {
      cwd: apiRoot,
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
        DATABASE_MIGRATION_URL: databaseUrl,
        REDIS_URL: process.env.REDIS_URL ?? 'redis://localhost:6379',
        JWT_SIGNING_KEY: 'test-signing-key-at-least-32-bytes-long',
        WEB_ORIGIN: 'http://localhost:3000',
        API_PORT: '4101',
        NODE_ENV: 'test',
      },
    });

    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    const timer = setTimeout(() => child.kill('SIGKILL'), 25_000);
    child.on('exit', (code) => {
      clearTimeout(timer);
      resolve({ code, stderr });
    });
  });
}

describe('boot RLS assertion (§6.11)', () => {
  it('exits 1, naming the role, when DATABASE_URL is the owner connection', async () => {
    const infra = await startTestInfra();
    const { code, stderr } = await runMain(infra.ownerUrl);
    expect(code).toBe(1);
    expect(stderr).toMatch(/flora/i);
    expect(stderr).toMatch(/bypass/i);
  }, 30_000);

  it('starts normally when DATABASE_URL is the flora_app connection', async () => {
    const infra = await startTestInfra();
    const { code, stderr } = await runMain(infra.appUrl);
    // null means the process was still running when the timeout killed it —
    // it never hit bootstrap's catch-and-exit(1), so it started normally.
    expect(code).toBeNull();
    expect(stderr).not.toMatch(/rolsuper|rolbypassrls/i);
  }, 30_000);
});
