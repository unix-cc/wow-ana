import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ANALYZER_VERSION } from '../src/types.js';

/**
 * The analyzer version is half of the analysis cache key (Phase I). If it
 * drifts from package.json, cache invalidation silently breaks: a release
 * that changed rules but forgot the bump keeps serving stale cached results.
 * This test turns that drift into a build failure.
 */
describe('ANALYZER_VERSION', () => {
  it('stays in sync with the package version', () => {
    const pkg = JSON.parse(
      readFileSync(
        fileURLToPath(new URL('../package.json', import.meta.url)),
        'utf8',
      ),
    ) as { version?: string };
    expect(pkg.version).toBe(ANALYZER_VERSION);
  });
});
