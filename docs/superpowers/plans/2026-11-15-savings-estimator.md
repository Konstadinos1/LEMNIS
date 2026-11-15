# Savings Estimator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `lemniskit estimate` reads a `lemnis.yaml` and prints an honest AWS-vs-LEMNIS cost table, with `lemniskit init` and `lemniskit sdl` alongside it, and no fake CLI output left.

**Architecture:** A new pure-TypeScript package `lemniskit/sdk` holds the `lemnis.yaml` schema, the versioned price catalog, the AWS baseline matcher, the estimator and the Akash SDL generator. `lemniskit/cli` becomes a thin ESM `commander` layer over it. Nothing here talks to a canister or to Akash.

**Tech Stack:** Node ≥ 22, npm workspaces, TypeScript 5 (strict, ESM, `NodeNext`), `zod`, `yaml`, `commander`, `chalk`, `vitest`.

**Spec:** `docs/superpowers/specs/2026-11-13-lemnis-container-migration-mvp-design.md` (§2, §7.5, §7.6, §7.8). This plan is spec Phase 1. It is done before Phase 0 because Phase 0 needs a network change for the build container and this needs none. It includes the TypeScript half of Phase 0 (workspaces, ESM, tests in CI).

## Global Constraints

- All money is an integer number of **micro-USD** (`1 USD = 1_000_000`). No floats are stored or summed; convert to dollars only when formatting.
- `HOURS_PER_MONTH = 730`.
- Baseline is **AWS on-demand, us-east-1**. Every rendered table states that and the catalog's `checkedAt` date.
- Default markup is `2000` basis points (20%). `PROMISE_FRACTION_BPS = 5000` (customer pays at most half the AWS baseline).
- Every catalog entry carries `sourceUrl`, `checkedAt` and `verified`. An unverified price that affects a row is marked with `*` and a footnote.
- Any service saving under 50% is flagged. GPU rows show the 3-year AWS Savings Plan comparison (`$3.10`/GPU-hr).
- `lemnis.yaml` `env` is documented as non-secret.
- No magic numbers: constants at the top of the file. Comments explain why. TypeScript strict; no `any`.
- No command prints output that isn't computed. The `deploy`, `storage`, `compute`, `db`, `balance` and `status` stubs are removed in this plan and come back as real commands in later plans.
- Conventional commits, one concern per commit, on `claude/festive-clarke-qgqnna`.

## Review Focus

1. **Missing or unparseable `lemnis.yaml`.** Expect one clear line naming the file and the problem, exit code 1, no stack trace. (Task 7)
2. **Sizes written loosely** (`8G`, `8gb`, `8192Mi`, `0.5` CPU, `500m`). Expect the common forms accepted and anything else rejected with the field path. (Task 2)
3. **A service bigger than any catalog instance, or an unknown `today.aws` / GPU model.** Expect an error naming the service and the value, never a silent $0 row. (Task 4)
4. **Egress at or under the 100 GB free tier, and `from_aws` without `region`.** Expect $0 AWS egress, and a warning for the missing region. (Tasks 4, 5)
5. **Output piped to a file or `NO_COLOR` set.** Expect plain text with aligned columns and no escape codes; `--json` gives machine-readable numbers. (Task 7)

## File Structure

```
package.json                      # NEW root: npm workspaces [lemniskit/sdk, lemniskit/cli], engines node >=22
lemniskit/sdk/package.json        # NEW @lemnis/sdk (ESM)
lemniskit/sdk/tsconfig.json
lemniskit/sdk/src/money.ts        # micro-USD helpers
lemniskit/sdk/src/units.ts        # parse "8Gi", "500m"
lemniskit/sdk/src/config.ts       # lemnis.yaml schema → ProjectConfig
lemniskit/sdk/src/catalog.ts      # price catalog + lookups
lemniskit/sdk/src/baseline.ts     # AWS baseline per service
lemniskit/sdk/src/estimate.ts     # LEMNIS side, caps, notes, totals
lemniskit/sdk/src/sdl.ts          # Akash SDL from ProjectConfig
lemniskit/sdk/src/index.ts        # public exports
lemniskit/sdk/test/*.test.ts
lemniskit/cli/src/cli.ts          # REWRITE: program wiring only
lemniskit/cli/src/commands/{init,estimate,sdl}.ts
lemniskit/cli/src/render.ts       # table + notes formatting
lemniskit/cli/test/*.test.ts
lemniskit/cli/package-lock.json   # DELETE (root lockfile replaces it)
.github/workflows/build.yml       # cli job → workspace install, typecheck, test, build
```

---

### Task 1: Workspace, SDK package and money helpers

**Files:**
- Create: `package.json`, `lemniskit/sdk/package.json`, `lemniskit/sdk/tsconfig.json`, `lemniskit/sdk/src/money.ts`, `lemniskit/sdk/src/index.ts`
- Test: `lemniskit/sdk/test/money.test.ts`

**Interfaces:**
- Produces:
  - `type MicroUsd = number` (always an integer)
  - `const MICRO_PER_USD = 1_000_000`, `const HOURS_PER_MONTH = 730`
  - `usd(dollars: number): MicroUsd` — rounds to the nearest micro-USD
  - `perMonth(hourly: MicroUsd): MicroUsd`
  - `applyBps(amount: MicroUsd, bps: number): MicroUsd` — `round(amount × bps / 10_000)`
  - `formatUsd(amount: MicroUsd): string` — `"5,022.40"` (two decimals, thousands separators, no `$`)
  - `savedPercent(aws: MicroUsd, lemnis: MicroUsd): number | null` — whole percent rounded down; `null` when `aws` is 0

- [ ] **Step 1: Create the root `package.json`** with `"private": true`, `"workspaces": ["lemniskit/sdk", "lemniskit/cli"]`, `"engines": { "node": ">=22" }`, and scripts `build`, `test`, `typecheck` that run the same script in every workspace (`npm run <x> --workspaces --if-present`).
- [ ] **Step 2: Create `lemniskit/sdk/package.json`** — name `@lemnis/sdk`, `"type": "module"`, `"exports": "./dist/index.js"`, `"types": "./dist/index.d.ts"`, scripts `build: tsc`, `typecheck: tsc --noEmit`, `test: vitest run`; deps `zod`, `yaml`; devDeps `typescript`, `vitest`, `@types/node`. `tsconfig.json`: `strict`, `module`/`moduleResolution` `NodeNext`, `target` `ES2022`, `rootDir` `src`, `outDir` `dist`, `declaration`.
- [ ] **Step 3: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { applyBps, formatUsd, perMonth, savedPercent, usd } from '../src/money.js';

describe('money', () => {
    it('converts dollars to integer micro-USD', () => {
        expect(usd(0.1008)).toBe(100_800);
        expect(Number.isInteger(usd(0.1 + 0.2))).toBe(true);
    });
    it('turns an hourly price into a 730-hour month', () => {
        expect(perMonth(usd(6.88))).toBe(5_022_400_000);
    });
    it('applies basis points with rounding', () => {
        expect(applyBps(usd(100), 2000)).toBe(usd(20));
        expect(applyBps(1, 5000)).toBe(1); // 0.5 rounds up
    });
    it('formats with thousands separators and two decimals', () => {
        expect(formatUsd(5_022_400_000)).toBe('5,022.40');
        expect(formatUsd(0)).toBe('0.00');
    });
    it('rounds the saved percentage down and handles a zero baseline', () => {
        expect(savedPercent(usd(100), usd(41.5))).toBe(58);
        expect(savedPercent(0, usd(18))).toBeNull();
    });
});
```

- [ ] **Step 4: Run it to see it fail** — `npm install && npm test -w @lemnis/sdk`. Expected: FAIL, cannot find `../src/money.js`.
- [ ] **Step 5: Implement `money.ts`** with the signatures above and export it from `index.ts`.
- [ ] **Step 6: Run** `npm test -w @lemnis/sdk` — Expected: 5 passed.
- [ ] **Step 7: Commit** — `git add package.json package-lock.json lemniskit/sdk && git commit -m "feat(sdk): add workspace, sdk package and micro-USD helpers"`

---

### Task 2: `lemnis.yaml` schema

**Files:**
- Create: `lemniskit/sdk/src/units.ts`, `lemniskit/sdk/src/config.ts`
- Test: `lemniskit/sdk/test/units.test.ts`, `lemniskit/sdk/test/config.test.ts`

**Interfaces:**
- Produces:
  - `parseSizeMiB(text: string): number` — accepts `Mi`, `Gi`, `Ti` and the loose forms `M`/`MB`, `G`/`GB`, `T`/`TB` (case-insensitive, treated as binary); throws `Error('invalid size "<text>"')` otherwise
  - `parseCpuMilli(value: number | string): number` — `2` → `2000`, `0.5` → `500`, `"500m"` → `500`
  - `class ConfigError extends Error { issues: string[] }` — each issue is `"<path>: <message>"`
  - `parseConfig(yamlText: string): ProjectConfig` — throws `ConfigError`
  - Types:

```ts
export interface ProjectConfig {
    version: '1';
    project: string;            // [a-z0-9-], 3–63 chars
    region?: string;
    services: ServiceConfig[];  // 1..MAX_SERVICES (10), in file order
}
export interface ServiceConfig {
    name: string;               // [a-z0-9-], 1–63 chars
    group: string;              // from `placement`, default 'default'
    image: string;
    cpuMilli: number;           // 100..MAX_CPU_MILLI (64_000)
    memoryMiB: number;          // 128..MAX_MEMORY_MIB (262_144)
    storageMiB: number;         // default DEFAULT_STORAGE_MIB (1024)
    gpu?: { model: string; count: number };   // count 1..8
    ports: PortConfig[];
    env: Record<string, string>;
    command?: string[];
    today?: { aws: string };
    egressGiBPerMonth: number;  // from usage.egress, default 0
    fromAwsGiBPerMonth: number; // from usage.from_aws, default 0
    maxMonthlyPrice?: MicroUsd; // from max_monthly_price (dollars)
}
export interface PortConfig { port: number; publicAs?: number; privateTo: string[] }
```

- Rules the schema enforces, each with its issue text:
  - image must have a tag or digest and the tag may not be `latest`: `"services.api.image: pin a tag (not \"latest\")"`
  - a port has `as` or `to` or neither, never both
  - every name in `to` is another service **in the same group**: `"services.infer.expose[0].to: \"api\" is not a service in group \"gpu\""`
  - unknown keys are rejected (`.strict()`), so typos don't pass silently

- [ ] **Step 1: Write the failing tests.** `units.test.ts` asserts: `parseSizeMiB('8Gi') === 8192`, `'8G'`, `'8gb'` → `8192`, `'512Mi'` → `512`, `'1Ti'` → `1_048_576`, `'8 potatoes'` throws `invalid size "8 potatoes"`; `parseCpuMilli(2) === 2000`, `0.5` → `500`, `'500m'` → `500`. `config.test.ts` uses the spec §7.5 example verbatim as a fixture and asserts:

```ts
const cfg = parseConfig(SPEC_EXAMPLE);
expect(cfg.project).toBe('shop-api');
expect(cfg.region).toBe('us');
expect(cfg.services.map((s) => s.name)).toEqual(['api', 'infer']);
const [api, infer] = cfg.services;
expect(api).toMatchObject({ group: 'default', cpuMilli: 2000, memoryMiB: 8192, storageMiB: 20480,
    today: { aws: 't3a.large' }, egressGiBPerMonth: 500, fromAwsGiBPerMonth: 300 });
expect(api.ports).toEqual([{ port: 8080, publicAs: 80, privateTo: [] }]);
expect(infer.gpu).toEqual({ model: 'h100', count: 1 });
expect(infer.ports).toEqual([{ port: 8000, privateTo: ['api'] }]);
```

  and one test per rule above, each asserting `ConfigError.issues` contains the exact issue text, plus: empty text → `issues` contains `"lemnis.yaml is empty"`; YAML syntax error → one issue starting `"YAML: "`; `image: nginx:latest` rejected; `cpu: 0` rejected; unknown key `memroy` rejected with its path.
- [ ] **Step 2: Run** `npm test -w @lemnis/sdk` — Expected: FAIL, modules missing.
- [ ] **Step 3: Implement `units.ts` and `config.ts`.** Use `yaml.parse` then a `zod` schema with `.strict()` objects; map zod issues to `"<dot.path>: <message>"`. Cross-service checks (`to` targets, duplicate service names) run after the schema parse.
- [ ] **Step 4: Run** — Expected: all pass.
- [ ] **Step 5: Commit** — `git commit -m "feat(sdk): parse and validate lemnis.yaml"`

---

### Task 3: Price catalog

**Files:**
- Create: `lemniskit/sdk/src/catalog.ts`
- Test: `lemniskit/sdk/test/catalog.test.ts`

**Interfaces:**
- Produces:

```ts
export interface PriceSource { sourceUrl: string; checkedAt: string; verified: boolean }
export interface AwsInstance extends PriceSource {
    name: string; family: string; vcpu: number; memoryMiB: number;
    hourly: MicroUsd; arch: 'x86' | 'arm'; burstable: boolean;
}
export interface Catalog {
    version: string;                       // '2026-11-11'
    checkedAt: string;                     // '2026-11-11'
    aws: {
        instances: AwsInstance[];
        fargate: PriceSource & { vcpuHourly: MicroUsd; gbHourly: MicroUsd };
        gp3GbMonth: PriceSource & { price: MicroUsd };
        egress: PriceSource & { freeGiB: number; tiers: { upToGiB: number | null; perGiB: MicroUsd }[] };
        gpuHourly: Record<string, PriceSource & { price: MicroUsd; savingsPlan3y?: MicroUsd }>;
    };
    akash: {
        vcpuHourly: PriceSource & { price: MicroUsd };
        gibMemoryHourly: PriceSource & { price: MicroUsd };
        gibStorageHourly: PriceSource & { price: MicroUsd };
        gpuHourly: Record<string, PriceSource & { price: MicroUsd }>;
    };
}
export const CATALOG: Catalog;
export function findAwsInstance(catalog: Catalog, name: string): AwsInstance | undefined;
```

- Values (dollars; store with `usd()`). `verified: true` only for rows the spec §2 sourced:

| Entry | Price | verified | source |
|---|---|---|---|
| m7i.large (2 vCPU / 8 GiB) | 0.1008/hr | true | doit.com m7i.large |
| m7i.xlarge, 2xlarge, 4xlarge | 2×, 4×, 8× m7i.large | true | same (linear family pricing) |
| m7a.large / c7i.large / c7a.large / r7i.large / r7a.large and their xlarge–4xlarge | 0.11592 / 0.08925 / 0.10264 / 0.1323 / 0.15215 per hr at `large` (2 vCPU; 8 / 4 / 4 / 16 / 16 GiB), doubling per size | false | aws.amazon.com/ec2/pricing/on-demand |
| t3.large, t3a.large (burstable, 2 / 8) | 0.0832, 0.0752 | false | same |
| m7g.large (arm, 2 / 8) | 0.0816 | false | same |
| Fargate | 0.04048/vCPU-hr, 0.004445/GB-hr | false | aws.amazon.com/fargate/pricing |
| EBS gp3 | 0.08/GB-mo | false | aws.amazon.com/ebs/pricing |
| Egress | 100 GiB free, then 0.09 (to 10,240 GiB), 0.085 (to 51,200), 0.07 (to 153,600), 0.05 above | true | egresscost.com/aws |
| AWS `h100` | 6.88/hr, `savingsPlan3y` 3.10 | true | spheron.network aws-h100-pricing-2026 |
| Akash `h100` | 2.72/hr | true | computeprices.com akash h100 |
| Akash vCPU / GiB memory / GiB storage | 0.0055 / 0.0014 / 0.00006 per hr | **false** | akash.network/pricing/usage-calculator (placeholder until calibrated from real bids) |

- [ ] **Step 1: Write the failing test** asserting: `findAwsInstance(CATALOG, 'm7i.large')` has `hourly === 100_800`, `vcpu === 2`, `memoryMiB === 8192`; `findAwsInstance(CATALOG, 'nope')` is `undefined`; every instance name is unique; **every** price entry in the catalog (walk it) has a non-empty `sourceUrl` starting `https://` and a `checkedAt` matching `/^\d{4}-\d{2}-\d{2}$/`; `CATALOG.akash.vcpuHourly.verified === false`; egress tiers are ascending and the last `upToGiB` is `null`.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement `catalog.ts`.** Build the size ladders with a small helper (`ladder(family, largeHourly, largeMemGiB, source)`) rather than writing 24 literals.
- [ ] **Step 4: Run** — Expected: pass.
- [ ] **Step 5: Re-check the unverified AWS rows** with a web search against AWS's pricing pages; for each one confirmed, set the exact value and `verified: true`. Leave any you can't confirm as `false`. Do not touch the Akash CPU placeholder.
- [ ] **Step 6: Commit** — `git commit -m "feat(sdk): add sourced AWS and Akash price catalog"`

---

### Task 4: AWS baseline

**Files:**
- Create: `lemniskit/sdk/src/baseline.ts`
- Test: `lemniskit/sdk/test/baseline.test.ts`

**Interfaces:**
- Consumes: `ServiceConfig`, `Catalog`, money helpers.
- Produces:

```ts
export class EstimateError extends Error {}
export interface AwsBaseline {
    label: string;            // 'm7i.large + gp3' | 't3a.large (runs today)' | 'p5 (1-GPU share)' | 'Fargate (runs today)'
    computeHourly: MicroUsd;  // instance, Fargate or GPU share
    diskMonthly: MicroUsd;    // gp3 × storage GiB
    monthly: MicroUsd;        // perMonth(computeHourly) + diskMonthly
    verified: boolean;        // false if any price used is unverified
    notes: string[];
}
export function awsBaseline(service: ServiceConfig, catalog: Catalog): AwsBaseline;
export function awsEgressMonthly(gib: number, catalog: Catalog): MicroUsd;
```

- Rules:
  - GPU service → `gpuHourly[model].price × count`, label `p5 (<count>-GPU share)`. Unknown model → `EstimateError('service "infer": no AWS price for GPU "<model>"')`.
  - `today.aws === 'fargate'` → vCPU and GB rates × the service's size, label `Fargate (runs today)`.
  - `today.aws` names an instance → that instance, label `<name> (runs today)`. Unknown → `EstimateError('service "api": unknown AWS instance "<name>" in today.aws')`.
  - Otherwise → cheapest instance with `arch === 'x86'`, `burstable === false`, `vcpu × 1000 ≥ cpuMilli` and `memoryMiB ≥` requested; label `<name> + gp3`. None fits → `EstimateError('service "api": no AWS instance in the catalog is large enough (<n> vCPU, <m> GiB)')`.
  - In the "otherwise" case add a note when a cheaper arm or burstable instance also fits: `"m7g.large (ARM) would be $59.57/mo on AWS if your image runs on ARM"` / `"t3a.large (burstable) would be $54.90/mo on AWS but throttles under sustained load"`.
  - `awsEgressMonthly`: subtract the free tier, then walk the tiers.

- [ ] **Step 1: Write the failing test.** Using `CATALOG` and services built by a `svc(overrides)` test helper:

```ts
expect(awsBaseline(svc({ cpuMilli: 2000, memoryMiB: 8192, storageMiB: 20480 }), CATALOG))
    .toMatchObject({ label: 'm7i.large + gp3', computeHourly: 100_800, diskMonthly: usd(1.6), monthly: usd(75.184) });
expect(awsBaseline(svc({ gpu: { model: 'h100', count: 1 }, storageMiB: 0 }), CATALOG).monthly).toBe(usd(5022.4));
expect(awsBaseline(svc({ today: { aws: 't3a.large' } }), CATALOG).label).toBe('t3a.large (runs today)');
expect(awsEgressMonthly(100, CATALOG)).toBe(0);
expect(awsEgressMonthly(500, CATALOG)).toBe(usd(36));
expect(awsEgressMonthly(20_480, CATALOG)).toBe(usd(10_240 * 0.09 + 10_140 * 0.085));
```

  plus: 2 vCPU / 4 GiB picks a `c7i`/`c7a` instance cheaper than m7i.large; the three `EstimateError` messages exactly; the ARM and burstable notes are present for a 2 vCPU / 8 GiB service and absent when `today` is set.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement `baseline.ts`.**
- [ ] **Step 4: Run** — Expected: pass.
- [ ] **Step 5: Commit** — `git commit -m "feat(sdk): match each service to its AWS baseline"`

---

### Task 5: Estimator

**Files:**
- Create: `lemniskit/sdk/src/estimate.ts`
- Test: `lemniskit/sdk/test/estimate.test.ts`

**Interfaces:**
- Consumes: `ProjectConfig`, `Catalog`, `awsBaseline`, `awsEgressMonthly`.
- Produces:

```ts
export const DEFAULT_MARKUP_BPS = 2000;
export const PROMISE_FRACTION_BPS = 5000;
export interface EstimateOptions { markupBps?: number; catalog?: Catalog }
export interface EstimateRow {
    kind: 'service' | 'egress' | 'from_aws';
    name: string;                 // service name, 'egress', 'from AWS'
    spec: string;                 // '2 vCPU · 8 GiB · 20 GiB' | '500 GiB/mo to internet'
    awsLabel: string;
    awsMonthly: MicroUsd;
    lemnisMonthly: MicroUsd;
    savedPercent: number | null;
    unverified: boolean;          // true → rendered with '*'
    belowPromise: boolean;        // service rows only: savedPercent < 50
    capMonthly?: MicroUsd;        // service rows: highest customer price we will accept
}
export interface Estimate {
    project: string; catalogCheckedAt: string; markupBps: number;
    rows: EstimateRow[];
    total: { awsMonthly: MicroUsd; lemnisMonthly: MicroUsd; savedPercent: number | null };
    notes: string[];
}
export function estimate(config: ProjectConfig, options?: EstimateOptions): Estimate;
export function maxAkashHourly(awsHourly: MicroUsd, markupBps: number): MicroUsd; // floor(aws × 0.5 ÷ (1 + markup))
```

- Rules:
  - Akash cost per service = vCPU + GiB memory + GiB storage rates, plus `gpuHourly[model] × count` for GPU services (unknown Akash GPU model → `EstimateError`). `lemnisMonthly = perMonth(akashHourly) + applyBps(…, markupBps)`.
  - `capMonthly` = `maxMonthlyPrice` if set, else half of `awsMonthly`.
  - One `egress` row when total `egressGiBPerMonth > 0`: AWS = `awsEgressMonthly(total)`, LEMNIS = 0, label `AWS data transfer`.
  - One `from_aws` row when total `fromAwsGiBPerMonth > 0`: AWS = 0, LEMNIS = `awsEgressMonthly(total)`, label `still paid to AWS`, `savedPercent` null.
  - Notes, in this order, each only when it applies:
    1. `* CPU price is an estimate until a real provider bid confirms it.` (any row `unverified`)
    2. `We only take provider bids that keep your price at half the AWS baseline or less (api ≤ $28.25/mo, …). Raise a limit with max_monthly_price.`
    3. `"<name>" saves less than 50% (<n>%).` per `belowPromise` row
    4. `With a 3-year AWS Savings Plan ($3.10/GPU-hr) AWS would cost $<x>/mo for "<name>", <cheaper|more expensive> than LEMNIS by <n>%.` per GPU service
    5. `You pull data from AWS but set no region. Add "region:" so providers are picked near your data.` (`from_aws > 0` and no `region`)
    6. Baseline notes from Task 4.

- [ ] **Step 1: Write the failing test** on the spec §7.5 example (markup 2000):

```ts
const est = estimate(parseConfig(SPEC_EXAMPLE));
const row = (n: string) => est.rows.find((r) => r.name === n)!;
// api: 2×0.0055 + 8×0.0014 + 20×0.00006 = 0.0234/hr → 17.082/mo → ×1.2 = 20.4984
expect(row('api')).toMatchObject({ awsLabel: 't3a.large (runs today)', lemnisMonthly: usd(20.4984),
    unverified: true, belowPromise: false });
expect(row('api').awsMonthly).toBe(usd(0.0752 * 730 + 20 * 0.08));       // 56.496
expect(row('api').capMonthly).toBe(usd(56.496 / 2));
// infer: 2.72 + 8×0.0055 + 32×0.0014 + 1×0.00006 = 2.80886/hr
expect(row('infer').lemnisMonthly).toBe(usd(2.80886 * 730 * 1.2));
expect(row('infer').savedPercent).toBe(51);
expect(row('egress')).toMatchObject({ awsMonthly: usd(36), lemnisMonthly: 0, savedPercent: 100 });
expect(row('from AWS')).toMatchObject({ awsMonthly: 0, lemnisMonthly: usd(18), savedPercent: null });
expect(est.total.awsMonthly).toBe(est.rows.reduce((s, r) => s + r.awsMonthly, 0));
expect(est.notes[0]).toMatch(/^\* CPU price is an estimate/);
expect(maxAkashHourly(usd(6.88), 2000)).toBe(Math.floor(usd(6.88) * 0.5 / 1.2));
```

  plus: markup 4000 makes `infer.belowPromise` true and adds note 3; `max_monthly_price: 2600` sets `capMonthly` to `usd(2600)`; dropping `region` adds note 5; a config with no `usage` has no egress rows; the Savings Plan note says `cheaper` for `infer` at the default markup.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement `estimate.ts`.**
- [ ] **Step 4: Run** — Expected: pass.
- [ ] **Step 5: Commit** — `git commit -m "feat(sdk): estimate LEMNIS cost, savings and price caps"`

---

### Task 6: Akash SDL generator

**Files:**
- Create: `lemniskit/sdk/src/sdl.ts`
- Test: `lemniskit/sdk/test/sdl.test.ts`, `lemniskit/sdk/test/__snapshots__/`

**Interfaces:**
- Consumes: `ProjectConfig`, `Estimate` (for per-service caps).
- Produces:

```ts
export interface SdlOptions {
    denom?: string;          // default 'uakt'
    microDenomPerUsd?: number; // default 1_000_000 (UNVERIFIED: depends on the managed-wallet denom)
    blocksPerHour?: number;  // default 590 (UNVERIFIED)
}
export function toSdl(config: ProjectConfig, est: Estimate, options?: SdlOptions): string; // YAML text
```

- Shape (Akash SDL `version: "2.0"`):
  - `services.<name>`: `image`, `env` as `KEY=value` list (sorted by key), `command` when set, `expose` entries — `publicAs` → `{ port, as, to: [{ global: true }] }`; `privateTo` → `{ port, to: [{ service: <name> }, …] }`.
  - `profiles.compute.<name>.resources`: `cpu.units` (e.g. `2` or `0.5`), `memory.size` and `storage.size` in `Mi`, `gpu` `{ units, attributes: { vendor: { nvidia: [{ model }] } } }` when set.
  - `profiles.placement.<group>`: `pricing.<service>` `{ denom, amount }` where `amount = ceil(maxAkashHourly-derived cap per hour ÷ blocksPerHour)` in micro-denom; `attributes.region` when `config.region` is set.
  - `deployment.<service>.<group>`: `{ profile: <service>, count: 1 }`.
  - Output is deterministic: keys in the order above, services in file order.

- [ ] **Step 1: Write the failing test**: parse the output with `yaml.parse` and assert, for the spec example: `version === '2.0'`; `services.api.expose[0]` equals `{ port: 8080, as: 80, to: [{ global: true }] }`; `services.infer.expose[0]` equals `{ port: 8000, to: [{ service: 'api' }] }`; `services.api.env` equals `['INFER_URL=http://infer:8000', 'NODE_ENV=production']`; `profiles.compute.infer.resources.gpu.units === 1`; `profiles.placement.default.attributes.region === 'us'`; both services priced under placement `default`; moving `infer` to `placement: gpu` yields two placement profiles and `deployment.infer.gpu`. Add `expect(toSdl(cfg, est)).toMatchSnapshot()` and a test that two calls return identical text.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement `sdl.ts`** (build a plain object, `yaml.stringify` it). Put the two UNVERIFIED defaults in named constants with a comment saying they are confirmed in the bridge plan against the live Console API.
- [ ] **Step 4: Run** — Expected: pass, snapshot written. Read the snapshot once and confirm it is a plausible SDL.
- [ ] **Step 5: Commit** — `git commit -m "feat(sdk): generate Akash SDL from lemnis.yaml"`

---

### Task 7: CLI — `init`, `estimate`, `sdl`

**Files:**
- Rewrite: `lemniskit/cli/src/cli.ts`, `lemniskit/cli/package.json`, `lemniskit/cli/tsconfig.json`
- Create: `lemniskit/cli/src/commands/init.ts`, `…/estimate.ts`, `…/sdl.ts`, `lemniskit/cli/src/render.ts`
- Delete: `lemniskit/cli/package-lock.json`
- Test: `lemniskit/cli/test/render.test.ts`, `lemniskit/cli/test/cli.test.ts`

**Interfaces:**
- Consumes: everything `@lemnis/sdk` exports.
- Produces:
  - `renderEstimate(est: Estimate, opts: { color: boolean }): string`
  - `buildProgram(io: { stdout: (s: string) => void; stderr: (s: string) => void; cwd: string }): Command` — exported so tests run commands in-process
  - `STARTER_YAML: string` — a commented starter with one `web` service (`image: nginx:1.27`, 1 vCPU, `1Gi`, port 80 public)
  - Commands:
    - `init [name]` — writes `lemnis.yaml` in `cwd` with `project: <name | 'my-app'>`; refuses if the file exists unless `--force`.
    - `estimate [-f, --file <path>] [--markup <percent>] [--json]` — default file `lemnis.yaml`.
    - `sdl [-f, --file <path>]` — prints the SDL.
  - Errors: `ConfigError` → `lemnis.yaml is invalid:` then one `  - <issue>` line per issue; missing file → `No lemnis.yaml found at <path>. Run "lemniskit init" to create one.`; `EstimateError` → its message. All go to stderr with exit code 1 (`process.exitCode = 1`, no `process.exit` inside commands).

- `package.json`: `"type": "module"`, `bin.lemniskit: ./dist/cli.js`, remove `main`, deps `@lemnis/sdk` (workspace), `commander`, `chalk`; remove `@dfinity/*`, `ora`, `inquirer`, `jest`, `ts-node` (they return when a command needs them); devDeps `typescript`, `vitest`, `tsx`, `@types/node`; scripts `build: tsc`, `dev: tsx src/cli.ts`, `test: vitest run`, `typecheck: tsc --noEmit`. `tsconfig.json` matches the SDK's.
- Table layout: header line `LEMNIS estimate vs AWS on-demand (us-east-1) · prices checked <date> · markup <n>%`, blank line, columns `SERVICE  SPEC  AWS BASELINE  AWS $/mo  LEMNIS $/mo  SAVED` padded to the widest cell (money right-aligned), a `─` rule, a `TOTAL` row, blank line, then each note prefixed `ℹ ` (the `*` note keeps its `* `). Unverified LEMNIS prices render as `~24.00*`; null saved as `—`. Color only when `opts.color`: saved ≥ 50 green, < 50 yellow.
- Color is on only if `process.stdout.isTTY` and `NO_COLOR` is unset.

- [ ] **Step 1: Write the failing tests.** `render.test.ts`: for the spec example with `color: false`, the output contains no `\u001b`; line 1 equals the header for `2026-11-11` and `20%`; the `api` line matches `/^api\s+2 vCPU · 8 GiB · 20 GiB\s+t3a\.large \(runs today\)\s+56\.50\s+~20\.50\*\s+63%$/`; the `from AWS` line ends with `—`; all table lines between header and notes have equal display width; with `color: true` the output contains `\u001b[`. `cli.test.ts` (uses `buildProgram` with a temp `cwd`): `init shop` writes a file that `parseConfig` accepts with `project === 'shop'`; a second `init` fails with `lemnis.yaml already exists` and leaves the file unchanged; `estimate` on the starter prints a table with a `web` row; `estimate --json` prints JSON whose `total.awsMonthly` is a number; `estimate --markup 40` changes the header to `markup 40%`; `estimate` with no file prints the missing-file message to stderr and sets exit code 1; a file with `memroy: 1Gi` prints `lemnis.yaml is invalid:` and the issue path; `sdl` prints text that `yaml.parse` reads with `version === '2.0'`.
- [ ] **Step 2: Run** `npm install && npm test -w @lemnis/lemniskit` — Expected: FAIL.
- [ ] **Step 3: Implement** `render.ts`, the three commands and `cli.ts` (shebang, `buildProgram(realIo).parseAsync()`).
- [ ] **Step 4: Run** `npm test && npm run build && node lemniskit/cli/dist/cli.js --help` — Expected: all tests pass; help lists only `init`, `estimate`, `sdl`.
- [ ] **Step 5: Commit** — `git commit -m "feat(cli): real init, estimate and sdl commands; remove mock output"`

---

### Task 8: CI, docs and evidence

**Files:**
- Modify: `.github/workflows/build.yml` (cli job), `README.md`, `CLAUDE.md` (§0, §2, §3.3, §4, §5), `docs/ARCHITECTURE.md` (§11.3, §11.4), `docs/PRICING.md`

- [ ] **Step 1: CI.** Replace the `cli` job with a `typescript` job at the repo root: `setup-node` 22 with `cache: npm` and `cache-dependency-path: package-lock.json`, then `npm ci`, `npm run typecheck`, `npm test`, `npm run build`. Leave the `canisters` job as is.
- [ ] **Step 2: Docs.**
  - README Quick Start shows only what works (`npm install`, `npx lemniskit init`, `estimate`) and lists what is not built yet.
  - CLAUDE.md: remove the stale "does not compile" and "no CI" claims, describe `lemniskit/sdk`, the workspace commands, and that queries can read `msg.caller`.
  - ARCHITECTURE §11.3 / §11.4 and PRICING: replace the Akash per-vCPU rates and the storage row with the spec §2 figures and sources, and state that ICP storage costs more than S3.
- [ ] **Step 3: Evidence.** From a clean clone state (`rm -rf node_modules */*/dist && npm ci && npm run build`), capture to the scratchpad and review each by eye:
  - `npm test` full output (counts).
  - `lemniskit init`, `estimate`, `estimate --json`, `sdl` on the starter and on the spec example.
  - Error states: no file, invalid YAML, unknown key, `image: x:latest`, oversized service, unknown `today.aws`.
  - `estimate | cat` and `NO_COLOR=1 estimate` (no escape codes), and a narrow-terminal run.
  - A terminal recording of the main flow (`init` → edit → `estimate` → `sdl`) rendered to video with Playwright from an HTML terminal replay.
- [ ] **Step 4: Run the full check** — `npm ci && npm run typecheck && npm test && npm run build`. Expected: all green.
- [ ] **Step 5: Commit and push** — `git commit -m "docs: align README, CLAUDE.md and pricing with the estimator"`, `git commit -m "ci: test and build the TypeScript workspace"`, then `git push -u origin claude/festive-clarke-qgqnna` and open a draft PR.

---

## Not in this plan

Canister security fixes and the icp-cli / `mo:core` move (spec Phase 0, needs network approval), the control plane, the Akash bridge, the console. Each gets its own plan.
