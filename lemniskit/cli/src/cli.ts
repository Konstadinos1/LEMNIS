#!/usr/bin/env node

/**
 * Lemniskit CLI
 * Real command-line tooling for LEMNIS (ICP Protocol 28 + Akash Network).
 * All mock echo stubs have been replaced with @lemnis/sdk logic and real network probes.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import chalk from 'chalk';
import { Command } from 'commander';
import {
  DEFAULT_MARKUP_PERCENT,
  checkReplicaStatus,
  createStarterManifestYaml,
  estimateProjectSavings,
  generateAkashSdl,
  parseLemnisYaml,
} from '@lemnis/sdk';
import { formatEstimateTable, formatUsd } from './formatters.js';

const DEFAULT_MANIFEST_FILE = 'lemnis.yaml';
const LOCAL_REPLICA_HOST = 'http://127.0.0.1:8080';
const MAINNET_REPLICA_HOST = 'https://icp-api.io';

function readManifestFile(filePath: string) {
  const fullPath = resolve(process.cwd(), filePath);
  if (!existsSync(fullPath)) {
    throw new Error(`Manifest file not found: ${fullPath}. Run "lemniskit init" to create one.`);
  }
  const raw = readFileSync(fullPath, 'utf8');
  return parseLemnisYaml(raw);
}

export function createCliProgram(): Command {
  const program = new Command();

  program
    .name('lemniskit')
    .description('CLI for LEMNIS — Decentralized Cloud Platform on ICP + Akash')
    .version('0.2.0');

  program
    .command('init [project-name]')
    .description('Generate a validated starter lemnis.yaml manifest')
    .option('-o, --out <file>', 'Output manifest path', DEFAULT_MANIFEST_FILE)
    .option('--force', 'Overwrite an existing manifest file', false)
    .action((projectName: string | undefined, opts: { out: string; force: boolean }) => {
      const targetPath = resolve(process.cwd(), opts.out);
      if (existsSync(targetPath) && !opts.force) {
        console.error(chalk.red(`Error: ${targetPath} already exists. Pass --force to overwrite.`));
        process.exitCode = 1;
        return;
      }
      const yaml = createStarterManifestYaml(projectName ?? 'my-lemnis-app');
      writeFileSync(targetPath, yaml, 'utf8');
      console.log(chalk.green(`Created ${opts.out}`));
      console.log(chalk.gray('Next steps:'));
      console.log(chalk.gray(`  1. lemniskit validate -f ${opts.out}`));
      console.log(chalk.gray(`  2. lemniskit estimate -f ${opts.out}`));
      console.log(chalk.gray(`  3. lemniskit sdl -f ${opts.out}`));
    });

  program
    .command('validate')
    .description('Validate a lemnis.yaml manifest and report security warnings')
    .option('-f, --file <file>', 'Path to lemnis.yaml', DEFAULT_MANIFEST_FILE)
    .option('--json', 'Output machine-readable JSON', false)
    .action((opts: { file: string; json: boolean }) => {
      try {
        const { manifest, warnings } = readManifestFile(opts.file);
        if (opts.json) {
          console.log(JSON.stringify({ valid: true, project: manifest.project, services: Object.keys(manifest.services), warnings }, null, 2));
          return;
        }
        console.log(chalk.green(`Valid manifest for project "${manifest.project}" (${Object.keys(manifest.services).length} service(s)).`));
        for (const warning of warnings) {
          console.log(chalk.yellow(`  ! ${warning}`));
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (opts.json) {
          console.log(JSON.stringify({ valid: false, error: msg }, null, 2));
        } else {
          console.error(chalk.red(`Validation failed: ${msg}`));
        }
        process.exitCode = 1;
      }
    });

  program
    .command('estimate')
    .description('Estimate monthly AWS on-demand vs LEMNIS cost and bid caps')
    .option('-f, --file <file>', 'Path to lemnis.yaml', DEFAULT_MANIFEST_FILE)
    .option('-m, --markup <percent>', 'LEMNIS markup percent (0-25)', String(DEFAULT_MARKUP_PERCENT))
    .option('--json', 'Output machine-readable JSON', false)
    .action((opts: { file: string; markup: string; json: boolean }) => {
      try {
        const markup = Number(opts.markup);
        const { manifest, warnings } = readManifestFile(opts.file);
        const estimate = estimateProjectSavings(manifest, markup);
        if (opts.json) {
          console.log(JSON.stringify({ estimate, warnings }, null, 2));
          return;
        }
        console.log(formatEstimateTable(estimate));
        for (const warning of warnings) {
          console.log(chalk.yellow(`  ! ${warning}`));
        }
      } catch (err) {
        console.error(chalk.red(`Estimate failed: ${err instanceof Error ? err.message : String(err)}`));
        process.exitCode = 1;
      }
    });

  program
    .command('sdl')
    .description('Generate deterministic Akash SDL v2.0 from lemnis.yaml')
    .option('-f, --file <file>', 'Path to lemnis.yaml', DEFAULT_MANIFEST_FILE)
    .option('-m, --markup <percent>', 'LEMNIS markup percent (0-25)', String(DEFAULT_MARKUP_PERCENT))
    .option('-o, --out <file>', 'Write SDL to file instead of stdout')
    .action((opts: { file: string; markup: string; out?: string }) => {
      try {
        const { manifest } = readManifestFile(opts.file);
        const sdl = generateAkashSdl(manifest, Number(opts.markup));
        if (opts.out) {
          writeFileSync(resolve(process.cwd(), opts.out), sdl, 'utf8');
          console.log(chalk.green(`Wrote Akash SDL v2.0 to ${opts.out}`));
        } else {
          process.stdout.write(sdl);
        }
      } catch (err) {
        console.error(chalk.red(`SDL generation failed: ${err instanceof Error ? err.message : String(err)}`));
        process.exitCode = 1;
      }
    });

  program
    .command('status')
    .description('Check real reachability of the ICP replica endpoint')
    .option('-n, --network <network>', 'Network (local | ic)', 'local')
    .option('--host <url>', 'Explicit ICP replica URL override')
    .option('--json', 'Output machine-readable JSON', false)
    .action(async (opts: { network: string; host?: string; json: boolean }) => {
      const host = opts.host ?? (opts.network === 'ic' ? MAINNET_REPLICA_HOST : LOCAL_REPLICA_HOST);
      const report = await checkReplicaStatus(host);
      if (opts.json) {
        console.log(JSON.stringify(report, null, 2));
      } else if (report.reachable) {
        console.log(chalk.green(`● Reachable: ${report.host} (${report.latencyMs}ms)`));
      } else {
        console.log(chalk.red(`○ Unreachable: ${report.host} (${report.error ?? 'connection failed'})`));
      }
      if (!report.reachable) {
        process.exitCode = 1;
      }
    });

  program
    .command('deploy')
    .description('Validate manifest, verify savings bid caps, and check target ICP control plane')
    .option('-f, --file <file>', 'Path to lemnis.yaml', DEFAULT_MANIFEST_FILE)
    .option('-n, --network <network>', 'Network (local | ic)', 'local')
    .option('--dry-run', 'Validate and print deployment plan without contacting replica', false)
    .action(async (opts: { file: string; network: string; dryRun: boolean }) => {
      try {
        const { manifest, warnings } = readManifestFile(opts.file);
        const estimate = estimateProjectSavings(manifest, DEFAULT_MARKUP_PERCENT);
        const sdl = generateAkashSdl(manifest, DEFAULT_MARKUP_PERCENT);

        console.log(chalk.bold(`Deployment Plan — ${manifest.project}`));
        console.log(`  Services:   ${Object.keys(manifest.services).join(', ')}`);
        console.log(`  Est. Cost:  ${formatUsd(estimate.totalLemnisMonthlyUsd)}/mo vs AWS ${formatUsd(estimate.totalAwsMonthlyUsd)}/mo (${estimate.totalSavedPercent}% saved)`);
        console.log(`  SDL Size:   ${Buffer.byteLength(sdl, 'utf8')} bytes (Akash v2.0)`);
        for (const w of warnings) {
          console.log(chalk.yellow(`  ! ${w}`));
        }

        if (opts.dryRun) {
          console.log(chalk.green('Dry run complete. No on-chain state modified.'));
          return;
        }

        const host = opts.network === 'ic' ? MAINNET_REPLICA_HOST : LOCAL_REPLICA_HOST;
        const status = await checkReplicaStatus(host);
        if (!status.reachable) {
          console.error(chalk.red(`Cannot submit deployment: ICP replica at ${host} is unreachable (${status.error}).`));
          console.error(chalk.gray('Start a local replica with "dfx start --background" or pass --dry-run.'));
          process.exitCode = 1;
          return;
        }
        console.log(chalk.green(`Replica reachable at ${host}. Configure PROTOCOL_28_COMPUTE_CANISTER_ID to submit live transactions.`));
      } catch (err) {
        console.error(chalk.red(`Deploy failed: ${err instanceof Error ? err.message : String(err)}`));
        process.exitCode = 1;
      }
    });

  return program;
}

const isDirectRun = process.argv[1]?.endsWith('cli.js') || process.argv[1]?.endsWith('cli.ts');
if (isDirectRun) {
  createCliProgram().parse();
}
