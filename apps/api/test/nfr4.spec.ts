import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Invariant 1's enforcement (architecture §15 NFR-4, corrected by
 * TASK-satellite-pipeline §2.7: the row now asserts against all of
 * `apps/api/src` and `apps/api/package.json`, not a nonexistent
 * `apps/api/src/controllers` directory). `apps/api` enqueues; it never
 * imports the package that talks to CDSE.
 */
describe('NFR-4 — apps/api never imports @flora/satellite', () => {
  const apiRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

  it('apps/api/package.json lists no @flora/satellite dependency', () => {
    const pkg = JSON.parse(
      readFileSync(join(apiRoot, 'package.json'), 'utf-8'),
    ) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    expect(pkg.dependencies?.['@flora/satellite']).toBeUndefined();
    expect(pkg.devDependencies?.['@flora/satellite']).toBeUndefined();
  });

  it('grep -rn "@flora/satellite" apps/api/src returns nothing', () => {
    let output = '';
    try {
      output = execFileSync(
        'grep',
        ['-rn', '@flora/satellite', join(apiRoot, 'src')],
        { encoding: 'utf-8' },
      );
    } catch (err) {
      // grep exits 1 when it finds no matches — that's the success case here.
      const status = (err as { status?: number }).status;
      if (status !== 1) {
        throw err;
      }
    }
    expect(output).toBe('');
  });
});
