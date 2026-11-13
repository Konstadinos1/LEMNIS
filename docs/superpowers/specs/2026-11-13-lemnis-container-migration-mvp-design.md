# LEMNIS — "Move your containers" MVP: Design

*Status: draft for approval · Written 2026-11-13 · Branch `claude/festive-clarke-qgqnna`*

---

## 1. Intent and why

LEMNIS is for **companies whose cloud bill has grown past what they can afford**. The promise:
*move your existing app to LEMNIS and pay less than half of what AWS charges.*

This round turns the whitepaper (`docs/ARCHITECTURE.md`) from a vision into a first working
product. A company should be able to:

1. Describe its existing Docker app in a small `lemnis.yaml` file.
2. See, before signing up, an honest line-by-line estimate: what it costs on AWS, what it would
   cost on LEMNIS, and how much it would save.
3. Deploy it with one command. LEMNIS runs it on **Akash** (a decentralized compute marketplace)
   and returns a public URL.
4. Pay in **US dollars** from prepaid credits, never touching crypto.
5. See, on every deploy and in a web dashboard, what it actually pays versus what AWS would charge.

The savings come from Akash. The Internet Computer (ICP) canisters are LEMNIS's own **control
plane**: accounts, projects, the deployment registry, credits and the usage ledger.

## 2. The specs (verified November 2026)

All prices are on-demand list prices, us-east-1 for AWS. These are the numbers the estimator ships
with. Each catalog entry keeps its source and the date it was checked.

| Workload | AWS on-demand | LEMNIS source | Saving | Confidence |
|---|---|---|---|---|
| GPU, 1× H100 | **$6.88/GPU-hr** (p5.48xlarge $55.04/hr ÷ 8), after AWS's June 2025 cut. Reserved GPU blocks went **up 15%** in January 2026 | Akash: **$1.45–$2.73/hr**, ~$2.72 in Oct–Nov 2026 trackers | 60–79% before markup | Good: several 2026 sources |
| Server, 2 vCPU / 8 GiB | m7i.large **$0.1008/hr ≈ $73.58/mo** | Akash: set by provider bids. Third party reports 4 vCPU / 16 GB at ~$15–30/mo vs ~$120 on AWS | likely 70%+ | **Unverified.** `akash.network` was unreachable from the build container |
| Internet egress | **$0.09/GB** after 100 GB/mo free | Akash: bandwidth is included in the provider's bid | up to 100% | Medium: Akash's own comparison page |
| Object storage | S3 Standard **$0.023/GB-mo** | ICP: ~4T cycles per GiB-year ≈ **$5.35/GiB-yr ≈ $0.45/GB-mo** | **ICP is ~19× more expensive** | Good: ICP docs |
| Block storage (server disk) | EBS gp3 $0.08/GB-mo (long-standing; re-check) | Akash: included in bid | likely large | Medium |

What this means for the design:

- The promise holds for servers, GPUs and bandwidth (Akash). It **fails** for storing customer
  data on ICP, so this round does not sell storage.
- The baseline is **AWS on-demand**. Committed pricing narrows the gap: a 3-year Savings Plan
  brings H100 to ~$3.10/GPU-hr. The estimator must say so. The target customer usually can't
  commit for three years, which is exactly why they're squeezed. "No commitment, half the
  on-demand price" is the honest pitch.
- **Markup ceiling.** At Akash $2.72/hr, H100 savings stay above 50% only while the LEMNIS markup
  is ≤ ~26% ($6.88 × 0.5 ÷ 2.72 − 1).
- **Two whitepaper numbers are wrong and must be corrected:**
  - §11.4 "Storage (100GB) AWS $25 → LEMNIS $5". On ICP it's ~$45/mo vs S3's ~$2.30/mo.
  - §11.3's Akash rates ($0.018/vCPU-hr + $0.009/GB-hr). These would make a 2 vCPU / 8 GiB box
    ($0.108/hr) *cost more* than m7i.large ($0.1008/hr).

Sources: [Akash H100](https://akash.network/the-bid/h100-rental-price-2026-cost-per-hour/) ·
[computeprices Akash H100](https://computeprices.com/providers/akash/gpus/h100) ·
[AWS GPU price cut](https://aws.amazon.com/blogs/aws/announcing-up-to-45-price-reduction-for-amazon-ec2-nvidia-gpu-accelerated-instances) ·
[AWS H100 2026](https://spheron.network/blog/aws-h100-pricing-2026) ·
[AWS GPU increase](https://www.theregister.com/2026/01/05/aws_price_increase/) ·
[m7i.large](https://www.doit.com/compute/spot/us-east-1/m7i.large) ·
[S3 2026](https://upstash.com/blog/aws-s3-pricing-explained-2026) ·
[AWS egress](https://egresscost.com/aws/) ·
[Akash vs AWS](https://akash.network/explore/compare/akash-vs-aws/) ·
[ICP cycle costs](https://docs.internetcomputer.org/references/cycle-costs/)

## 3. Current state (verified 2026-11-11)

- **Five Motoko canisters** (`protocol-28/{identity,compute,storage,database,billing}`). They are
  `persistent actor`s on `mo:base/OrderedMap`. The compile and persistence fixes from
  [PR #4](https://github.com/Konstadinos1/LEMNIS/pull/4) and
  [PR #5](https://github.com/Konstadinos1/LEMNIS/pull/5) are merged, so CLAUDE.md §3.3 is stale.
  They compile: the repo CI's "Type-check Motoko canisters" job passed on 2026-10-18
  ([run](https://github.com/Konstadinos1/LEMNIS/actions/runs/39099740924)). They have not been
  compiled in this container (no toolchain; see §6).
- **Security holes found by reading the code:**
  - `billing.charge` has no caller check, so anyone can wipe anyone's balance.
  - `database.update` and `database.delete` have no owner check.
  - Storage keys are `bucket # "/" # key` and bucket names may contain `/`. The owner of bucket
    `a` can therefore overwrite objects in someone else's bucket `a/b`, and read across buckets.
  - Database record IDs are `table # "-" # n`. `list("t")` returns rows from table `t-x`.
  - All reads are public (no read authorization).
  - Nothing rejects the anonymous principal.
  - No input limits or quotas, so anyone can fill the canister's memory.
  - Bucket and table counters are never updated.
  - `identity.getUserCount` claims "admin only" but is public.
- **CLI** (`lemniskit/cli`):
  - `npm ci`, `npm run build` and `node dist/cli.js --help` work on Node 22.
  - Every command prints fake output.
  - `npm test` fails (no tests).
  - npm flags `@dfinity/agent` 0.19 as deprecated ("use `@icp-sdk/core/agent`").
  - `chalk`/`ora`/`inquirer` are ESM-only while the build emits CommonJS. This only works on
    Node ≥ 20.19 / 22.12.
- **Missing pieces:** `dfx.json` declares a `console` assets canister whose `console/dist` doesn't
  exist. The README advertises `lemniskit auth login` / `projects create` and `lemniskit/sdk/`,
  none of which exist.
- **Toolchain moved on:**
  - `dfx` is being deprecated in favour of **icp-cli** (v1.0 June 2026; `@icp-sdk/icp-cli`
    1.8.0 on npm; `icp.yaml` replaces `dfx.json`).
  - Motoko's **`core`** library supersedes `base`.
  - **`@icp-sdk/core`** (6.x) replaces `@dfinity/agent`.
  - Internet Identity auth is in **`@icp-sdk/auth`**.

## 4. Goals, non-goals, anti-goals

**Goals (this round)**
1. `lemniskit estimate` gives an honest AWS-vs-LEMNIS table from a `lemnis.yaml`, with no
   account needed.
2. `lemniskit deploy` takes a public Docker image to a running Akash deployment with a public URL,
   billed from prepaid USD credits.
3. The ICP control plane is secure and tested: orgs and members, projects, the deployment
   registry, credits and the usage ledger.
4. A web console shows credits, runway, deployments and savings.
5. All five canisters get the security fixes. The repo moves to the Nov 2026 toolchain and has
   tests and CI.
6. The docs tell the truth: README, CLAUDE.md, and the whitepaper's pricing corrected with sources.

**Non-goals (deferred, stated in docs)**
- Object storage / IPFS buckets.
- Managed databases and persistent volumes. This round targets **stateless** services: web apps,
  APIs, workers, GPU inference.
- Building images from source (public images only), and private registries.
- Autoscaling, custom domains, a secrets manager, logs streaming.
- Card checkout and invoices.
- DAO and token, multi-chain routing, MetaMask login.
- Python/Rust SDKs, Terraform, a GitHub Action.

**Anti-goals (a failure even if it "works")**
- Savings that aren't real: cherry-picked baselines, hidden costs, unlabeled guesses.
- Making customers buy or hold crypto, or rewrite their app.
- Double-charging, charging after a deployment closed, or losing credits on a bridge crash.
- Customer secrets stored on-chain in plain text.
- Fake CLI output presented as real.

## 5. Approaches considered

| | Approach | Trade-off | Verdict |
|---|---|---|---|
| A | **Move your containers.** Deploy existing Docker apps to Akash through LEMNIS, pay USD, savings on every deploy; ICP canisters as control plane | Delivers the real savings; needs an Akash account + API key and network access for real deployments; Akash provider reliability varies | **Picked by the user** |
| B | Savings report only (upload AWS bill → line-by-line LEMNIS price) | Fastest sales tool, fully testable, but hosts nothing | Folded into A as its first deliverable (`estimate`) |
| C | ICP-only "canister cloud" (finish the five services) | Easiest to demo, but customers must rewrite apps and ICP storage costs ~19× S3, which breaks the promise | Rejected; its security fixes and modernization are kept |

## 6. Constraints

- **Conventions** (CLAUDE.md §7):
  - Motoko: 4-space indent, `Result` returns (never trap on expected errors), ownership via
    `Principal.equal`, query for caller-independent reads, one service per actor.
  - TypeScript: strict mode, `commander` + `chalk`.
  - Named constants instead of magic numbers; comments explain *why*.
  - Conventional commits, one concern per commit, draft PRs.
- **Branch:** all work on `claude/festive-clarke-qgqnna` → one draft PR, updated phase by phase.
- **Build container network:**
  - `internetcomputer.org`, `akash.network`, `mops.one` and `cdn.jsdelivr.net` are blocked.
  - GitHub release downloads for `dfinity/*` are outside the session's repo scope.
  - The npm registry works.
  - Phase 0 must get a personal "LEMNIS" cloud environment approved, allowing `akash.network`,
    `console-api.akash.network`, `mops.one`, `internetcomputer.org` and
    `cli.internetcomputer.org`, plus read access to the needed `dfinity/*` repos for
    moc/PocketIC binaries. Approval goes through the user's prompt.
- **Real Akash deployments** need the operator's Akash Console API key (entered through the secure
  credential form, never in chat) and a small card-funded balance (~$10–20) for smoke tests.
  Everything else is tested against a mock Akash API.
- **ICP state is not confidential.** Node providers can read canister memory, so no secrets go on
  chain. Container env vars are visible to the Akash provider too, so `lemnis.yaml` env is
  documented as non-secret.
- **No production data exists** (no `canister_ids.json`). Incompatible state changes can reinstall
  instead of migrating.
- **Composite queries** only work between canisters on the same subnet. Mainnet deploys must put
  the control-plane canisters on one subnet.

## 7. Design

### 7.1 System overview

```
 customer laptop / CI                     LEMNIS operator infra              Akash Network
┌──────────────────┐   ICP calls   ┌──────────────────────────┐        ┌───────────────────┐
│ lemniskit CLI    │──────────────▶│  ICP control plane       │        │ Console API       │
│ (local key id)   │               │  identity · compute ·    │◀──────▶│ (managed wallet,  │
└──────────────────┘               │  billing  (+storage,db)  │  poll/ │  USD by card)     │
┌──────────────────┐   ICP calls   │                          │  write └─────────┬─────────┘
│ Web console      │──────────────▶│                          │                  │ leases
│ (Internet Id.)   │               └────────────▲─────────────┘        ┌─────────▼─────────┐
└──────────────────┘                            │ operator principal   │ provider runs the │
                                     ┌──────────┴─────────────┐        │ customer container│
                                     │ akash-bridge (Node)    │───────▶│ → public URL      │
                                     │ holds Akash API key    │  REST  └───────────────────┘
                                     └────────────────────────┘
```

- **Canisters are the source of truth.** The bridge is stateless: it reads work from the
  canisters, acts on Akash, and writes results back.
- **The API key never touches the chain.** The bridge is the only component holding the Akash
  API key.

### 7.2 Money flow *(my call: reseller model)*

- **Akash account.** The LEMNIS operator (the user's company) owns one Akash Console account,
  with a managed wallet funded by card (Auto Recharge). Customers never see Akash.
- **Customer credits.** Each customer **org** holds prepaid **USD credits** in the billing
  canister. Amounts are `Nat` micro-USD (1 USD = 1,000,000) to avoid floats.
- **How customers pay this round.** The operator grants credits manually
  (`lemniskit admin credits grant <org> <usd> --note "<ref>"`) after payment by invoice, bank
  transfer or a payment link outside LEMNIS. In-product card checkout is deferred: it needs a
  payment processor, and card data can't live on-chain.
- **Customer price** = Akash lease cost × (1 + markup). Markup is an operator-set billing
  parameter in basis points; see §9 for the default.
- **Metering.** The bridge meters each active deployment hourly. Each period is charged once,
  keyed by `deploymentId + periodStart` so retries never double-charge. The final partial period
  is charged on close.
- **Running out of credit.**
  - Below **24 h of runway**: the CLI and console warn.
  - At **zero**: the bridge closes the org's deployments (reason `#creditsExhausted`) and
    charging stops.
- **Operator exposure.** The operator fronts Akash escrow. Customer credits are prepaid, so the
  exposure is at most one metering period plus the escrow top-up buffer.

### 7.3 Identity and access *(my calls)*

- **Org = account and billing boundary** (whitepaper §2). It has a name and members
  `[(Principal, Role)]`, with `Role = #owner | #developer | #viewer`.
  - Any non-anonymous principal can create up to `MAX_ORGS_PER_PRINCIPAL` orgs.
  - Owners manage members and see billing.
  - Developers deploy and close.
  - Viewers read.
- **CLI identity.** `lemniskit auth login` creates an Ed25519 key in `~/.config/lemnis/`
  (file mode 0600) and prints its principal. This works headless, so CI uses it too.
- **Console identity.** Internet Identity through `@icp-sdk/auth`.
- **Linking and invites.** An owner creates a **one-time link code**: 128-bit random, expires
  after `LINK_CODE_TTL` (10 min), carries a role. Another principal redeems it with
  `lemniskit auth link <code>` or in the console. This one mechanism covers "connect my CLI to my
  console account" and "invite a teammate".
- **Operators.** Admin principals are set at install. Admins can add admins, set the bridge
  principal, grant credits and set the markup. The **bridge principal** is the only caller
  allowed to move deployments between lifecycle states and record usage.
- **Everywhere:**
  - Anonymous callers are rejected on every mutation and every private read.
  - Authenticated reads are `shared query` / `composite query` with `msg.caller` checks. CLAUDE.md
    §3.2 wrongly says queries can't see the caller; correct it.
- **Cross-canister checks.** `compute` and `billing` ask `identity.roleOf(orgId, principal)`:
  - Updates use an inter-canister call.
  - Reads use a composite query.
  - State must be re-checked after every `await` (commit point / reentrancy).

### 7.4 Canisters

- **identity** (rewritten as IAM): orgs, members, roles, link codes, admins.
  - Methods: `createOrg`, `listMyOrgs`, `getOrg`, `createLinkCode`, `redeemLinkCode`,
    `removeMember`, `setRole`, `roleOf` (query, for other canisters), `addAdmin`, `isAdmin`.
  - The old `register` / `getUser` / `isAuthenticated` / `getUserCount` are removed.
- **compute** (becomes the deployment registry; the name stays).
  - `Project { id; orgId; name; createdAt }`.
  - `Deployment { id; projectId; orgId; service; spec : ServiceSpec; state; lease : ?AkashLease; awsEquivalentHourlyMicroUsd; pricingCatalogVersion; createdAt; updatedAt; history : [StateChange] }`.
  - `ServiceSpec { image; cpuMilli; memoryMiB; storageMiB; gpu : ?{ model; count }; ports : [{ port; exposeAs : ?Nat }]; env : [(Text, Text)]; command : ?[Text] }`.
    It is validated on-chain against named limits (CPU, memory, GPU count, env size, image
    format), and the CLI validates the same rules.
  - `AkashLease { dseq; gseq; oseq; provider; pricePerHourMicroUsd; uris : [Text] }`.
  - Lifecycle (whitepaper §5.2, trimmed):

```
#pending ──claim──▶ #creating ──lease ok──▶ #active ──requestClose / credits out──▶ #closing ──▶ #closed
              │                │                                                              ▲
              └────────────────┴── no bids / Akash error / provider closed lease ──▶ #failed ─┘ (charges stop)
```

  - Member methods: `createProject`, `listProjects`, `requestDeployment` (developer+; one live
    deployment per project+service), `listDeployments`, `getDeployment`, `requestClose`.
  - Bridge-only methods: `listWork` (pending + closing), `claim` (idempotent), `attachAkash`
    (records `dseq` right after creation so a crashed bridge can resume), `markActive`,
    `markFailed`, `markClosed`.
  - The old `createInstance` / `stopInstance` mock API is removed.
- **billing** (USD credits, replaces the cycles mock).
  - `OrgAccount { orgId; balanceMicroUsd; grantedMicroUsd; spentMicroUsd; awsEquivalentMicroUsd }`.
  - `UsageRecord { deploymentId; orgId; periodStart; periodEnd; akashCostMicroUsd; chargedMicroUsd; awsEquivalentMicroUsd }`.
  - Admin methods: `grantCredits`, `setMarkupBps`, `setBridge`.
  - Bridge method: `recordUsage`. It is idempotent per key and returns `{ remaining; exhausted }`.
  - Member methods: `getAccount`, `listUsage(orgId, since)`, `getSavings(orgId)`.
  - The public `charge` hole and the cycles `deposit` are removed.
- **storage, database**: security fixes only, no new features, migrated to `mo:core`.
  - Validated names (`[a-z0-9-]`, 3–63 chars).
  - Per-bucket and per-table maps instead of string-prefix keys.
  - Owner-only reads and writes; anonymous rejected.
  - Counters kept correct; size and count limits as constants.
  - Documented as outside the savings offer (ICP storage ≈ 19× S3).

### 7.5 `lemnis.yaml` and SDL

A subset of whitepaper §10.2, validated with zod in `lemniskit/sdk`:

```yaml
version: "1"
project: shop-api
services:
  api:
    image: ghcr.io/acme/api:1.4.2   # public image, pinned tag
    cpu: 2                          # vCPU
    memory: 8Gi
    storage: 20Gi                   # ephemeral disk
    expose:
      - port: 8080
        as: 80                      # public HTTP
    env:
      NODE_ENV: production          # NOT for secrets (see §6)
    usage:
      egress: 500Gi                 # per month, estimate-only
  infer:
    image: ghcr.io/acme/infer:2.0.0
    cpu: 8
    memory: 32Gi
    gpu: { model: h100, count: 1 }
```

`lemniskit/sdk` generates the Akash SDL deterministically from a `ServiceSpec` (pure function,
snapshot-tested). The bridge uses it, and so does `lemniskit sdl` for transparency.

### 7.6 Pricing catalog and estimator

- **Catalog** (`lemniskit/sdk`, versioned).
  - Entries: `{ id, provider, kind, unit, priceMicroUsd, region, sourceUrl, checkedAt }`.
  - AWS: m7i / c7i / r7i sizes up to 16 vCPU, p5 per-GPU share, EBS gp3, egress tiers.
  - Akash: per-GPU-model hourly rates, plus CPU / memory / storage rates. CPU rates stay marked
    `unverified` until calibrated from real bids (Phase 0 task once `akash.network` is reachable).
- **Matching.**
  - AWS equivalent = the cheapest catalog instance with ≥ requested vCPU and ≥ RAM (how AWS makes
    you buy), plus gp3 for disk, plus egress tiers above 100 GB free.
  - GPUs: AWS per-GPU rate × count.
  - LEMNIS = Akash estimate × (1 + markup).
- **Honesty rules (anti-goal guard).** Every table:
  - states the baseline ("AWS on-demand, us-east-1, prices checked <date>");
  - marks unverified numbers;
  - flags any service saving < 50%;
  - shows the 3-year-commitment comparison for GPUs.
- **Actual price.** After deploy, the real price comes from the accepted Akash bid and replaces
  the estimate.

Sketch (illustrative numbers):

```
$ lemniskit estimate
LEMNIS estimate vs AWS on-demand (us-east-1) · prices checked 2026-11-11 · markup 20%

SERVICE  SPEC                    AWS EQUIVALENT        AWS $/mo   LEMNIS $/mo  SAVED
api      2 vCPU · 8 GiB · 20 GiB  m7i.large + gp3         75.18      ~24.00*    68%
infer    8 vCPU · 32 GiB · 1×H100 p5 (1-GPU share)     5,022.40    2,382.72    53%
egress   500 GiB/mo              AWS data transfer        36.00        0.00   100%
──────────────────────────────────────────────────────────────────────────────────
TOTAL                                                  5,133.58    2,406.72    53%

* CPU price is an estimate until a real provider bid confirms it.
ℹ With a 3-year AWS Savings Plan ($3.10/GPU-hr) AWS would be ~5% cheaper for "infer".
```

### 7.7 akash-bridge (operator service, TypeScript)

Lives in `protocol-28/akash-bridge/`. It runs on the operator's machine or server (later on Akash
itself).

- **Configuration:** env vars for the network, canister IDs, bridge identity PEM path,
  `AKASH_CONSOLE_API_KEY`, `AKASH_API_BASE` (overridable to the mock), and the poll and meter
  intervals.
- **Reconcile loop:**
  1. **Pending → creating.**
     - `claim`, then create the Akash deployment from the SDL with the initial escrow deposit,
       then immediately `attachAkash(dseq)`.
     - Poll bids up to `BID_WAIT_SECONDS`.
     - Choose the lowest-priced bid, preferring audited providers.
     - Create the lease and poll lease status for service URIs, then `markActive`.
     - No bids, or an error → `markFailed` with a human-readable reason and the Akash deployment
       closed.
  2. **Resume.** A deployment found in `#creating` with a `dseq` continues from Akash's
     current state instead of creating a duplicate.
  3. **Closing.** Close on Akash → final metering → `markClosed`.
  4. **Metering** (hourly) → `billing.recordUsage`. If `exhausted`, request close for the
     org's deployments.
  5. **Escrow top-up** when an escrow has less than 24 h of runway.
  6. **Provider closed a lease** → `markFailed`, stop charging.
- **Mock Akash Console API** (same package) implements the endpoints the bridge uses, with
  deterministic bids, leases and URIs, plus switches for "no bids" and "provider closes lease".
  Tests use it, and so does the default local demo.
- **Must be verified against the live Console API before coding the client** (docs were
  unreachable from the container):
  - exact paths and fields (`/v1/deployments`, bids, leases, `/v1/deposit-deployment` with
    `dseq` + `deposit`, `x-api-key` header);
  - certificate/manifest handling;
  - the SDL pricing denomination for managed (USD) wallets;
  - minimum deposits;
  - whether a GPU price endpoint exists.

### 7.8 CLI (`lemniskit`, rewritten; no fake output)

| Command | Who |
|---|---|
| `auth login` · `auth whoami` · `auth link <code>` | anyone |
| `orgs create <name>` · `orgs list` · `orgs invite --role <r>` (prints a link code) | member / owner |
| `init [name]` (starter `lemnis.yaml`) · `estimate [-f file]` · `sdl [-f file]` | anyone, offline |
| `deploy [-f file] [--org]` (validate → estimate → create project if needed → request → wait for `#active` → print URL, $/mo, AWS $/mo, saved %) | developer+ |
| `deployments list` · `deployments status <id>` · `deployments close <id>` | member / developer+ |
| `balance` (credits, burn rate, runway, savings to date) · `billing usage` | member |
| `status` (real reachability of each canister) | anyone |
| `admin credits grant` · `admin markup set` · `admin bridge set` | admin |

Global flags: `--network local|ic` and `--json`. The `storage` / `compute` / `db` echo stubs are
**removed** *(my call)*. They print fake output, and those services aren't part of the offer this
round.

### 7.9 Console (`console/`)

Vite + React + TypeScript, built to `console/dist` (the existing assets canister), using
`@icp-sdk/auth` and `@icp-sdk/core`.

- **Pages:**
  - Sign in.
  - Overview: credits, runway, this month paid vs AWS, saved %.
  - Deployments: status, URL, $/mo, AWS $/mo, saved %; close for developer+.
  - Estimate: paste `lemnis.yaml` or fill a form, using the same SDK estimator.
  - Settings: members, invite / "Connect CLI" link codes.
- **States:** loading, empty and error states on every page.

```
┌ LEMNIS ───────────────────────────────────── acme-inc ▾ ┐
│ Credits $412.50 · runway 11 days                         │
│ This month: you paid $186.20 · AWS would be $402.90      │
│ ███████████████░░░░░░░░░░░░░  saved $216.70 (54%)        │
├──────────────────────────────────────────────────────────┤
│ api    ● active    https://…provider…/   $24/mo   68%    │
│ infer  ◐ creating  waiting for provider bids…            │
└──────────────────────────────────────────────────────────┘
```

### 7.10 Repository layout and toolchain

```
icp.yaml                  # replaces dfx.json (pinned Motoko + assets recipes; local + ic networks)
mops.toml                 # mo:core (pinned) + test deps; moc pinned via mops toolchain
package.json              # npm workspaces, "engines": { "node": ">=22" }, ESM
protocol-28/{identity,compute,billing,storage,database}/main.mo
protocol-28/akash-bridge/ # TS operator service + mock Akash API
protocol-28/test/         # PocketIC integration tests (@dfinity/pic)
lemniskit/sdk/            # TS: bindings (@icp-sdk/bindgen), lemnis.yaml schema, SDL gen, pricing
lemniskit/cli/            # TS CLI (ESM, commander, chalk, ora)
console/                  # Vite + React
```

### 7.11 Testing and evidence

- **Motoko unit tests:** `mops test` for pure logic (validation, pricing maths in Motoko,
  lifecycle transitions).
- **PocketIC integration tests:** multi-principal cases covering owner / teammate / stranger /
  anonymous / bridge / admin. These include **a regression test for every hole in §3** and the
  idempotent metering and resume-after-crash cases.
- **TS (vitest):** schema, SDL snapshots, estimator against hand-computed tables, the bridge
  against the mock Akash + PocketIC, and CLI command output.
- **End to end:**
  - local network + mock Akash + bridge + CLI;
  - Playwright on the console, capturing **screenshots of every page and state** (including
    errors: invalid yaml, no bids, credits exhausted, unauthorized) and a **video of the main
    flow** (estimate → deploy → active → savings);
  - terminal captures of CLI flows.
- **Real Akash smoke test**: opt-in, needs the key. One tiny deployment that is closed right
  after.
- **CI:** Motoko build + tests, TS typecheck + tests, console build, E2E with mock.
- **Self-review:** every capture is reviewed for layout shifts, missing states and broken
  animation before hand-off.

## 8. Delivery order

Each phase leaves the build green and something demonstrable.

0. **Foundation.** Approved environment + toolchain. Move to icp-cli / `icp.yaml`, `mo:core`,
   `@icp-sdk/core` and ESM. Security fixes in all five canisters with regression tests. CI.
   Calibrate Akash CPU prices.
1. **Estimator.** SDK catalog + schema + `init` / `estimate` / `sdl`. This is the sales hook and
   needs nothing from the user.
2. **Control plane.** identity / compute / billing rewrite + CLI auth / orgs / deploy-request /
   deployments / balance / admin.
3. **Bridge.** Mock Akash, reconcile, metering, credit exhaustion, then the real Akash smoke test
   (needs the key).
4. **Console.**
5. **Docs.** README, CLAUDE.md, whitepaper corrections with sources, PRICING, ROADMAP, SECURITY.
   Docs that describe changed behaviour also move with each phase.

## 9. Decisions

**The user decided:**
- Audience: companies whose cloud bill outgrew their budget.
- Promise: save more than half.
- Approach A: move containers to Akash, ICP control plane, estimate first.

**My calls (correct any):**
- The reseller money flow (§7.2).
- Manual credit grants this round.
- Micro-USD amounts.
- Org / member / link-code identity, local-key CLI and Internet Identity console (§7.3).
- The off-chain bridge holds the only Akash key.
- Storage / database get security fixes only.
- The fake CLI stubs are removed.
- AWS on-demand baseline with commitment disclosure.
- Stateless public images only; env is non-secret.
- Deployments close at zero credit, with a 24 h warning.
- One draft PR on the given branch.

**Open: theirs to decide:** *(filled in after review)*

## 10. Left to the builder

- Exact icp-cli recipe and package versions.
- Akash API field names after verification.
- Bid wait and poll intervals.
- Validation limit values (as named constants).
- UI styling.
- File layout inside each package.
- Whether a given read is a composite query or an update.
- How bindings are generated and committed.

## 11. Remaining uncertainty

- Akash CPU / memory prices and Console API details are unverified until `akash.network` is
  reachable.
- Whether icp-cli's local network, Internet Identity and PocketIC run inside this container
  depends on the environment approval.
- Akash provider reliability is variable. Re-deploying to a new provider on failure is deferred,
  so a failed lease means `#failed` and the customer redeploys.
