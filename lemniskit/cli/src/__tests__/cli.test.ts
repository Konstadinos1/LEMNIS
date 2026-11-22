import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createStarterManifestYaml, estimateProjectSavings, parseLemnisYaml } from '@lemnis/sdk';
import { createCliProgram } from '../cli.js';
import { formatEstimateTable } from '../formatters.js';

let tempDir: string | undefined;

afterEach(() => {
  vi.restoreAllMocks();
  process.exitCode = 0;
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

describe('@lemnis/lemniskit CLI', () => {
  it('formats a readable AWS vs LEMNIS estimate table with disclosures', () => {
    const { manifest } = parseLemnisYaml(createStarterManifestYaml('billing-api'));
    const est = estimateProjectSavings(manifest, 20);
    const table = formatEstimateTable(est);

    expect(table).toContain('LEMNIS estimate vs AWS on-demand');
    expect(table).toContain('api');
    expect(table).toContain('from_aws');
    expect(table).toContain('TOTAL');
  });

  it('init writes a valid lemnis.yaml file on disk', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'lemnis-cli-'));
    const outFile = join(tempDir, 'lemnis.yaml');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const program = createCliProgram();
    await program.parseAsync(['node', 'lemniskit', 'init', 'payments-core', '-o', outFile]);

    const written = readFileSync(outFile, 'utf8');
    const { manifest } = parseLemnisYaml(written);
    expect(manifest.project).toBe('payments-core');
    expect(logSpy).toHaveBeenCalled();
  });

  it('validate rejects malformed manifests with non-zero exit code', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const program = createCliProgram();
    await program.parseAsync(['node', 'lemniskit', 'validate', '-f', '/nonexistent/lemnis.yaml']);

    expect(process.exitCode).toBe(1);
    expect(errSpy).toHaveBeenCalled();
  });
});
