# LEMNIS CLOUD PLATFORM
## Enterprise Architecture Whitepaper v3.1

> **The Decentralized AWS/GCP/Azure Alternative**

**Target Market:** Cost-Constrained Engineering Teams • Web3 dApps • Independent Developers • DAOs • Enterprise  
**MVP Budget:** $25,000 | **Timeline:** 12-16 weeks  
**Primary Stack:** ICP (Internet Computer Control Plane) + Akash Network (Container & GPU Compute)  
**Core Differentiators:** 50%+ Verified Savings vs AWS On-Demand • No Lock-In • Audited Protocol 28 Control Plane • Progressive SNS DAO Governance

---

# TABLE OF CONTENTS

0. [Audit Changelog (v3.0 → v3.1)](#section-0-audit-changelog-v30--v31)
1. [Executive Overview](#section-1-executive-overview)
2. [Cloud Account & Governance Model](#section-2-cloud-account--governance-model)
3. [DAO Governance Architecture](#section-3-dao-governance-architecture)
4. [IAM System](#section-4-iam-system)
5. [Resource Model Architecture](#section-5-resource-model-architecture)
6. [Compute Architecture](#section-6-compute-architecture)
7. [Storage Architecture](#section-7-storage-architecture)
8. [Networking Architecture](#section-8-networking-architecture)
9. [Observability Platform](#section-9-observability-platform)
10. [Developer Tools & Experience](#section-10-developer-tools--experience)
11. [Billing & Pricing](#section-11-billing--pricing)
12. [Security, Confidentiality & Compliance](#section-12-security-confidentiality--compliance)
13. [Multi-Chain Strategy](#section-13-multi-chain-strategy)
14. [MVP Scope ($25K)](#section-14-mvp-scope-25k)
15. [12-Month Roadmap](#section-15-12-month-roadmap)

---

# SECTION 0: AUDIT CHANGELOG (v3.0 → v3.1)

This v3.1 edition incorporates a comprehensive technical, economic, and security review conducted in **November 2026** against the live Protocol 28 codebase and verified cloud market pricing:

1. **Corrected Pricing & Cost Model (§7, §11):**
   - Corrected AWS S3 Standard 100 GB storage baseline from an erroneous `$25/mo` to the verified **`$2.30/mo` ($0.023/GB-mo)** and disclosed explicitly that ICP canister storage (`~$5.35/GiB-yr ≈ $0.45/GB-mo`) is ~19× more expensive than S3 — scoping ICP storage to small replicated control-plane blobs while bulk storage uses IPFS/Storacha.
   - Corrected Akash compute unit rates (v3.0's `$0.018/vCPU-hr + $0.009/GB-hr` made a 2 vCPU / 8 GiB server cost `$78.84/mo`, *more* than AWS `m7i.large`'s `$73.58/mo`) to realistic reverse-auction benchmarks (`~$0.005/vCPU-hr + ~$0.002/GB-hr`, clearly flagged as estimates until confirmed by live provider bids).
   - Updated AWS H100 pricing to post-June-2025 on-demand **`$6.88/GPU-hr`** (`p5.48xlarge` ÷ 8) vs Akash **`$1.45–$2.73/GPU-hr`** (~$2.40 median), added mandatory **3-year AWS Savings Plan (~$3.10/GPU-hr)** disclosure, enforced an on-chain **25% markup ceiling**, and added **AWS Data Gravity (`from_aws` egress)** modeling.
   - Fixed a 1,000× cycle-unit error in plan allowances (`100M cycles` is `$0.00014`, not `$0.15`; corrected to `100B / 5T / 20T / 100T cycles`).
2. **Corrected Blockchain Comparison (§1.3):** Replaced the inaccurate claim that Solana/Arbitrum/Avalanche lack persistent state with the true ICP differentiators (large low-cost orthogonal stable memory, native HTTP serving, HTTPS outcalls, autonomous timers, and reverse gas).
3. **Eliminated Brand Drift (§5.1):** Renamed legacy `Nexus Resource Name (NRN)` to **LEMNIS Resource Name (`LRN`)**.
4. **Added ICP-to-Akash Bridge & Chain-Key Path (§6.5–6.6):** Replaced the hand-waved canister-to-Akash arrow with the concrete Phase 1 stateless `akash-bridge` + 50% on-chain bid cap and Phase 2 trustless ICP Chain-Key ECDSA (`sign_with_ecdsa`) orchestration path.
5. **Added Confidentiality & Secrets Threat Model (§2.3, §12.2):** Explicitly documented that ICP subnet node providers can inspect canister memory and Akash providers can inspect container env vars — prohibiting plaintext customer secrets on-chain and detailing client-side encryption / vetKD.
6. **Resolved Edge Decentralization Contradiction & Added SNS Safeguards (§3, §12):** Separated direct censorship-resistant ICP Boundary Node access from optional Enterprise WAF/Edge tiers, integrated **ICP SNS (Service Nervous System)** governance with 48-hour emergency ratification and 7-day sunset clauses, and separated **Implemented Protocol 28 Controls** from **Target Compliance Roadmap**.

---

# SECTION 1: EXECUTIVE OVERVIEW

## 1.1 Platform Vision

LEMNIS is a **decentralized cloud platform** delivering AWS/GCP/Azure-class infrastructure without hyperscaler lock-in or hyperscaler margins. LEMNIS pairs a tamper-proof blockchain control plane with competitive decentralized compute and storage markets:

- **ICP (Internet Computer Protocol) — Control Plane (`Protocol 28`):** Persistent on-chain IAM, organization registries, deployment state machines, prepaid USD/cycles ledgers, and verifiable metering.
- **Akash Network — Compute Plane:** Permissionless Kubernetes-native container and GPU marketplace delivering **50–75% savings** versus AWS on-demand pricing with zero multi-year lock-in.
- **IPFS / Storacha / Arweave — Bulk Object Plane:** Content-addressed decentralized storage with zero hyperscaler egress penalties.

## 1.2 Value Proposition

| Problem | Traditional Cloud (AWS/GCP/Azure) | LEMNIS Solution |
|---------|-----------------------------------|-----------------|
| **Bill Shock & Lock-In** | Steep on-demand rates; steep discounts require 1–3 year commitments | **50%+ verified savings** vs AWS on-demand with an enforced bid cap and zero commitment |
| **Egress Taxes** | `$0.09/GB` internet egress after 100 GB/mo free | Bandwidth bundled in Akash provider bids (`$0` marginal egress markup) |
| **Single Points of Failure** | Regional control-plane outages take down dependent services | Replicated ICP control plane + portable OCI containers across independent providers |
| **Vendor Lock-In** | Proprietary APIs and non-portable IAM/infra primitives | Standard Docker/OCI images, open `lemnis.yaml`, deterministic Akash SDL v2.0 |
| **Opaque Metering** | Delayed, complex billing lines | Transparent micro-USD & cycles on-chain usage ledger with idempotent hourly metering |
| **Governance** | Zero customer input on pricing or protocol changes | Progressive ICP SNS DAO governance with capped protocol markup (≤ 25%) |

## 1.3 Why ICP + Akash

**ICP is uniquely engineered to run an on-chain cloud control plane:**

| Capability | ICP | Solana | Arbitrum | Avalanche |
|------------|-----|--------|----------|-----------|
| Orthogonal persistent memory (hundreds of GiB/canister) | ✅ (~$5.35/GiB-yr) | ❌ (high rent/account limits) | ❌ (expensive L2 calldata/state) | ❌ (high storage cost) |
| Autonomous execution (native on-chain timers) | ✅ | ❌ (external keepers) | ❌ (external keepers) | ❌ (external keepers) |
| Direct certified HTTP/Web serving | ✅ | ❌ | ❌ | ❌ |
| Native HTTPS outcalls to Web2/APIs | ✅ | ❌ (needs oracle) | ❌ (needs oracle) | ❌ (needs oracle) |
| Reverse gas model (end-users pay $0 gas) | ✅ | ❌ | ❌ | ❌ |
| Chain-Key ECDSA / threshold signing (vetKD) | ✅ | ❌ | ❌ | ❌ |

> **Important architectural boundary:** While ICP excels as a replicated control plane and stateful microservice runtime, its on-chain storage (`~$5.35/GiB-yr ≈ $0.45/GB-mo`) is **~19× more expensive than AWS S3 Standard (`$0.023/GB-mo`)**. LEMNIS therefore uses ICP strictly for control-plane state, IAM, billing ledgers, and small replicated blobs — and routes container compute, GPU inference, and bandwidth-heavy workloads to **Akash Network**.

**Akash provides production-ready containerized & GPU compute:**
- Competitive reverse-auction bids typically **60–75% below AWS on-demand** for CPU containers and **55–75% below AWS on-demand** for H100 GPUs
- Standard Docker/OCI images — customers move existing containers without rewriting application code
- Bandwidth and ephemeral block disk bundled into provider bids

## 1.4 Target Users

| Segment | Use Cases | Core Pain Point Solved |
|---------|-----------|------------------------|
| **Cost-Squeezed Engineering Teams** | Production APIs, background workers, AI/GPU inference | Cloud bill outgrew budget without ability to sign 3-year AWS Savings Plans |
| **Web3 Developers** | Indexers, RPC relays, oracle nodes, DAO backends | Eliminating centralized AWS dependencies under decentralized apps |
| **Indie Developers** | Side projects, SaaS MVPs, static frontends | Predictable prepaid USD credits, zero surprise egress invoices |
| **DAOs & Enterprises** | Verifiable governance apps, censorship-resistant services | Auditable on-chain control plane and open portable deployments |

---

# SECTION 2: CLOUD ACCOUNT & GOVERNANCE MODEL

## 2.1 Hierarchy (Best of AWS/GCP/Azure)

```
┌─────────────────────────────────────────────────────────────────┐
│                    TENANT (Principal Identity)                   │
│  Root cryptographic identity — Internet Identity or Ed25519 CLI │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │           ORGANIZATION (Billing & IAM Boundary)          │    │
│  │  Prepaid USD Credits & Cycles • RBAC Members             │    │
│  ├─────────────────────────────────────────────────────────┤    │
│  │                                                          │    │
│  │  ┌─────────────────┐  ┌─────────────────┐              │    │
│  │  │  PROJECT        │  │  PROJECT        │              │    │
│  │  │  "shop-api"     │  │  "ml-inference" │              │    │
│  │  ├─────────────────┤  ├─────────────────┤              │    │
│  │  │ ┌─────────────┐ │  │ ┌─────────────┐ │              │    │
│  │  │ │ ENV:dev     │ │  │ │ ENV:staging │ │              │    │
│  │  │ ├─────────────┤ │  │ ├─────────────┤ │              │    │
│  │  │ │ ENV:prod    │ │  │ │ ENV:prod    │ │              │    │
│  │  │ └─────────────┘ │  │ └─────────────┘ │              │    │
│  │  └─────────────────┘  └─────────────────┘              │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

## 2.2 Security Boundaries

| Boundary | Isolation Mechanism | Cross-Access Policy |
|----------|---------------------|---------------------|
| **Tenant (Principal)** | Cryptographic `Principal` identity; anonymous principal (`2vxsx-fae`) strictly rejected | Never shared; explicit linking via single-use 128-bit link codes |
| **Organization** | On-chain membership table (`#owner \| #developer \| #viewer`); isolated billing ledger | Explicit owner-granted invite/link code |
| **Project** | Logical deployment namespace under an Organization | Inherited Org RBAC (Phase 2: per-project IAM bindings) |
| **Environment** | Isolated deployment spec and Akash `dseq` lease group | Promotion pipelines (`lemniskit deploy`) |

## 2.3 Core Data Types & Confidentiality Boundary

```typescript
interface Organization {
  id: string;                       // org-{n}
  name: string;                     // 2-64 chars
  owner: Principal;                 // Root ICP Principal
  members: Array<[Principal, 'owner' | 'developer' | 'viewer']>;
  createdAt: bigint;                // Nanosecond IC timestamp
}

interface BillingAccount {
  owner: Principal;
  balance: bigint;                  // ICP cycles balance
  creditsMicroUsd: bigint;          // Prepaid USD credits (1 USD = 1_000_000)
  grantedMicroUsd: bigint;
  spentMicroUsd: bigint;
  awsEquivalentMicroUsd: bigint;    // Verifiable AWS on-demand comparison ledger
}

interface Deployment {
  id: string;                       // dep-{n}
  project: string;
  owner: Principal;
  target: 'icp' | 'akash';
  image: string;                    // Pinned OCI image reference
  cpuMilli: number;                 // 100..64000
  memoryMiB: number;                // 128..524288
  storageMiB: number;               // 0..2097152
  gpuCount: number;                 // 0..8
  region?: string;
  awsHourlyMicroUsd: bigint;
  maxHourlyMicroUsd: bigint;        // Enforced 50% savings bid cap
  actualHourlyMicroUsd?: bigint;    // Settled Akash lease rate
  providerUri?: string;
  dseq?: string;
  state: 'pending' | 'creating' | 'active' | 'updating' | 'closing' | 'closed' | 'failed';
}
```

> **Confidentiality Notice (Critical Security Constraint):** ICP subnet node providers have host-level access to canister memory, and Akash compute providers have host-level access to running containers and environment variables. Therefore, **plaintext secrets (API keys, database passwords, private keys) MUST NOT be stored in `lemnis.yaml` or on-chain canister state.** Non-secret runtime configuration goes in `env`; confidential secrets require client-side envelope encryption / external KMS (Phase 1) or ICP **vetKD** threshold key derivation + TEE/Confidential Compute providers (Phase 2+).

---

# SECTION 3: DAO GOVERNANCE ARCHITECTURE

## 3.1 Progressive Decentralization via ICP SNS

LEMNIS transitions from founder/controller-operated MVP canisters to full community governance through the **Internet Computer Service Nervous System (SNS)** — ICP's audited, protocol-native DAO framework where canister upgrades require on-chain neuron consensus rather than trusted multisig operators.

```
┌─────────────────────────────────────────────────────────────────┐
│                    LEMNIS SNS DAO (Post-PMF)                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │           STAKED NEURONS (Token Holders)                 │    │
│  │   Dissolve-delay weighted voting • Proposal submission   │    │
│  └───────────────────────────┬─────────────────────────────┘    │
│                              │                                   │
│                              ▼                                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │         SECURITY & GOVERNANCE COUNCIL (7-of-11)          │    │
│  │   Time-bounded emergency pause ONLY (48h ratification)   │    │
│  └───────────────────────────┬─────────────────────────────┘    │
│                              │                                   │
│         ┌────────────────────┼────────────────────┐             │
│         ▼                    ▼                    ▼             │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐       │
│  │  TECHNICAL  │     │  TREASURY   │     │   GRANTS    │       │
│  │  COMMITTEE  │     │  COMMITTEE  │     │  COMMITTEE  │       │
│  │             │     │             │     │             │       │
│  │ • Canister  │     │ • Reserves  │     │ • Developer │       │
│  │   WASM hash │     │ • Pricing   │     │   bounties  │       │
│  │ • Audits    │     │   oracle    │     │ • Ecosystem │       │
│  └─────────────┘     └─────────────┘     └─────────────┘       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## 3.2 Proposal Types & Anti-Capture Safeguards

| Proposal Type | Quorum | Approval Threshold | Execution Timelock | Safeguard |
|---------------|--------|--------------------|--------------------|-----------|
| **Parameter Change** (markup ≤ 25%, quotas) | 5% | 50% + 1 | 24 hours | Hard protocol cap prevents markup > 2500 bps |
| **Protocol / Canister Upgrade** | 10% | 66% supermajority | 7 days | Reproducible Wasm SHA-256 verification required |
| **Emergency Security Pause** | Council | 7-of-11 multisig | Immediate | **Mandatory 48h community ratification & 7-day auto-sunset** |
| **Budget / Treasury Allocation** | 10% | 60% | 48 hours | Epoch spending cap (≤ 5% treasury per quarter) |
| **Grant Approval** | 5% | 50% + 1 | 24 hours | Milestone-gated disbursement |
| **Council Election** | 15% | Ranked choice | 14 days | Staggered 6-month terms; recallable via proposal |

## 3.3 Token Economics (Deferred Until Post-PMF)

| Allocation | % | Vesting / Lock |
|------------|---|----------------|
| Community Treasury (SNS) | 30% | On-chain DAO-controlled |
| Ecosystem Grants | 20% | 5-year milestone distribution |
| Core Team | 20% | 4-year linear, 1-year cliff |
| Investors | 15% | 2-year linear, 6-month cliff |
| Public SNS Swap | 10% | Neuron dissolve-delay tiers |
| Protocol Liquidity | 5% | 1-year lock |

**MVP Policy:** No governance token is launched before verified product-market fit. MVP billing uses **prepaid USD credits** and **ICP cycles** only.

---

# SECTION 4: IAM SYSTEM

## 4.1 Identity Providers & Unified Principal Model

```
┌──────────────────┬────────────────────┬─────────────────────────┐
│ Internet Identity│ Local Ed25519 Key  │ Enterprise OIDC / SAML  │
│ (Web Console)    │ (lemniskit CLI/CI) │ (Phase 3 Federation)    │
└────────┬─────────┴─────────┬──────────┴────────────┬────────────┘
         │                   │                       │
         ▼                   ▼                       ▼
┌─────────────────────────────────────────────────────────────────┐
│            PROTOCOL 28 IDENTITY CANISTER (IAM)                   │
│  Principal Registry • Orgs & RBAC • Single-Use Link Codes        │
└─────────────────────────────────────────────────────────────────┘
```

## 4.2 Authentication & Linking Flow

1. **Web Console:** Passwordless FIDO2 WebAuthn via **Internet Identity**.
2. **CLI & CI/CD:** Local Ed25519 keypair stored at `~/.config/lemnis/identity.pem` (`0600` permissions), working headlessly in CI pipelines.
3. **Cross-Device Linking & Team Invites:** An organization `#owner` mints a **single-use 128-bit link code** (10-minute TTL) scoped to a target role (`#owner`, `#developer`, or `#viewer`). Redeeming via `lemniskit auth link <code>` or the Web Console immediately consumes the code (preventing replay) and binds the new principal to the organization.
4. **Universal Anonymous Rejection:** Every mutation and private read across all five Protocol 28 canisters explicitly rejects `Principal.isAnonymous(msg.caller)`.

## 4.3 Roles & Permissions

| Role | Implemented MVP Scope (`identity/main.mo`) | Future Granular Grammar (`service:action:resource`) |
|------|--------------------------------------------|-----------------------------------------------------|
| `#owner` | Full org admin, member management, link codes, billing & deployments | `org:*`, `iam:*`, `billing:*`, `compute:*` |
| `#developer` | Create/update/close deployments, read org resources & usage | `compute:deploy`, `compute:close`, `storage:write` |
| `#viewer` | Read-only access to deployments, usage, and estimates | `compute:read`, `billing:read`, `logs:read` |
| `Controller / Bridge` | Canister upgrades, `authorizedChargers` allowlist, credit grants, Akash reconciliation | Hardware-backed controller / SNS governance |

---

# SECTION 5: RESOURCE MODEL ARCHITECTURE

## 5.1 LEMNIS Resource Name (LRN)

*(Corrected from legacy "NRN" in v3.0 to eliminate brand drift.)*

```
lrn:{partition}:{service}:{region}:{org-id}:{resource-type}/{resource-id}

Examples:
lrn:lemnis:compute:us-east:org-0:deployment/dep-14
lrn:lemnis:storage:icp-mainnet:org-0:bucket/app-config
lrn:lemnis:database:icp-mainnet:org-0:table/feature_flags
lrn:lemnis:canister:icp-mainnet:org-0:canister/ryjl3-tyaaa-aaaaa-aaaba-cai
```

## 5.2 Deployment Lifecycle State Machine

Enforced strictly inside `protocol-28/compute/main.mo`:

```
#pending ─claim─▶ #creating ─leases ok (≤ bid cap)─▶ #active ─requestUpdate─▶ #updating
                      │                                │  ▲                       │
                      │                                │  └── updated / failed ───┘
                      │                 requestClose / │      (previous version kept)
                      │                 credits == 0   ▼
                      │                            #closing ──────────────▶ #closed
                      ▼
                  #failed  (no bid under 50% cap, Akash error, or provider closed lease; charges stop)
```

For native ICP compute instances, `compute/main.mo` enforces strict non-reversible termination:
- `#running` → `stopInstance` → `#stopped`
- `#stopped` → `startInstance` → `#running`
- `#running | #stopped` → `terminateInstance` → `#terminated` *(terminal state; cannot be stopped or restarted)*

---

# SECTION 6: COMPUTE ARCHITECTURE

## 6.1 Compute Tiers

| Tier | Runtime | Best For | Typical Cost | Latency |
|------|---------|----------|--------------|---------|
| **Akash Containers** | Docker / OCI on Kubernetes | REST APIs, SaaS backends, workers | `~$20–$30/mo` (2 vCPU / 8 GiB est.) | ~20–80 ms |
| **Akash GPU** | NVIDIA H100 / A100 containers | LLM inference, training, media ML | `~$1.45–$2.73/GPU-hr` + markup | ~50–150 ms |
| **ICP Canisters** | WebAssembly (`Protocol 28`) | Control planes, stateful auth/ledgers, static asset hosting | `~$1.40 / 1T cycles` (`~$5.35/GiB-yr`) | <100 ms query / ~2s update |
| **Edge Functions (Year 2)** | V8 / WASM isolates | Auth hooks, lightweight transforms | Per-invocation | <50 ms |

## 6.2 When to Use Each

| Workload | Recommended Tier | Rationale |
|----------|------------------|-----------|
| **Existing Docker API / Microservice** | Akash Container | Zero rewrite, 60–75% cheaper than AWS EC2, no egress fees |
| **GPU Inference (H100 / A100)** | Akash GPU | 52–68% cheaper than AWS `p5` on-demand with zero 3-year lock-in |
| **Tamper-Proof Control Plane / Registry** | ICP Canister | Replicated consensus, orthogonal persistence, certified HTTP |
| **Static Web App / Console** | ICP Asset Canister | Served directly over HTTPS with cryptographic asset certification |

## 6.3 Autoscaling & Deployment Strategies (Q3)

- **Rolling / In-Place Manifest Update:** When only container image tag, non-secret `env`, or command changes, the Akash deployment updates in place and **preserves the provider lease and public URL**.
- **Blue/Green Replacement:** When CPU, memory, GPU, placement group, or public ports change, a new deployment (`version + 1`) spins up alongside the live one; once `#active`, traffic switches and the old lease closes.

## 6.4 Enforced 50% Savings Bid Cap

Every Akash deployment submitted to `compute/main.mo` carries both `awsHourlyMicroUsd` (from the verified AWS on-demand baseline) and `maxHourlyMicroUsd`. By default:

```
maxAkashBidHourly = floor(awsHourlyMicroUsd * 0.50 / (1 + markupBps / 10000))
```

Both the off-chain bridge AND `compute.transitionDeployment()` reject any provider lease exceeding `maxHourlyMicroUsd` unless the customer explicitly overrides `max_monthly_price` in `lemnis.yaml`. **If the market cannot deliver the promised savings, LEMNIS refuses the lease rather than silently overcharging.**

## 6.5 ICP-to-Akash Bridge & Chain-Key Decentralization Path

ICP canisters cannot natively open raw mTLS connections to Akash providers or hold raw Cosmos private keys safely in canister memory. LEMNIS therefore executes a two-phase bridge architecture:

1. **Phase 1 (MVP — Stateless Operator Bridge):**
   - `akash-bridge` runs off-chain holding the operator's Akash Console API key (or operator AKT/USDC wallet behind a pluggable `AkashClient` interface).
   - The bridge polls `compute` for `#pending`, `#updating`, and `#closing` work, executes Akash deployment/lease APIs, writes `dseq` and lease URIs back via the bridge-only `transitionDeployment()` method, runs hourly idempotent metering against `billing.recordUsage()`, caps escrow exposure to 24h runway, and sweeps orphaned leases on restart.
   - Because all state lives in Protocol 28 canisters, the bridge is completely stateless and crash-recoverable.
2. **Phase 2 (Trustless Chain-Key Orchestration):**
   - Protocol 28 canisters derive a native Cosmos/Akash secp256k1 address using **ICP Chain-Key ECDSA (`sign_with_ecdsa`)** and broadcast signed Akash deployment/bid/lease transactions via **ICP HTTPS Outcalls** to decentralized Cosmos RPC endpoints — eliminating centralized operator key custody!

---

# SECTION 7: STORAGE ARCHITECTURE

## 7.1 Storage Tiers & Honest Cost Boundaries

| Storage Tier | Backend | Verified Cost | Durability | Intended Scope |
|--------------|---------|---------------|------------|----------------|
| **Control-Plane Blob Store** | Protocol 28 `storage` canister (ICP) | `~$5.35/GiB-yr` (`~$0.45/GB-mo`) | Subnet consensus replicated | Small configs, manifests, certified web assets (≤ 2 MiB/object) |
| **Control-Plane Key-Value DB** | Protocol 28 `database` canister (ICP) | `~$5.35/GiB-yr` (`~$0.45/GB-mo`) | Subnet consensus replicated | Feature flags, metadata, tenant registries |
| **Bulk Hot Object Storage (Q2)** | IPFS + Storacha pinning | `~$0.05/GB-mo` + `$0` egress | Content-addressed pinned | User uploads, media, backups |
| **Permanent Archive (Q2)** | Arweave | `~$6–$8/GB` one-time | Permanent endowment | Audit snapshots, immutable artifacts |
| **Ephemeral Server Disk** | Akash Container Storage | Included in provider bid | Container lifecycle | Scratch space, caches, local model weights |

> **Honest Economic Warning:** AWS S3 Standard costs **`$0.023/GB-mo` (`$2.30/mo` for 100 GB)**. Storing 100 GB directly on ICP canisters costs **`~$44.60/mo`** (~19× more expensive than S3). LEMNIS NEVER markets ICP canister storage as an S3 cost replacement. Decentralized storage saves money primarily when workloads have **heavy internet egress** (AWS charges `$0.09/GB` egress after 100 GB/mo; IPFS/Akash charge `$0`).

## 7.2 Hardened Protocol 28 Storage & Database Isolation

Both `protocol-28/storage/main.mo` and `protocol-28/database/main.mo` enforce structural tenant isolation:
- **Nested Maps (No Flat String Prefixing):** Objects live in `Map<BucketId, Map<ObjectKey, StorageObject>>` and records live in `Map<TableName, Map<RecordId, Record>>`. Cross-bucket overwrite and cross-table prefix leakage are structurally impossible.
- **Strict Naming & Path Validation:** Bucket names must match `[a-z0-9-]` (3–63 chars, no `/`); object keys reject leading `/` and `..` traversal; table names match `[a-z0-9_-]` (3–63 chars).
- **Private-by-Default ACLs & Bounded Quotas:** Buckets default to `isPublic = false`, all reads require ownership (or explicit public flag for storage), `objectCount`/`totalSize`/`recordCount` stay exact across overwrites and deletes, and per-owner quotas cap canister memory growth.

---

# SECTION 8: NETWORKING ARCHITECTURE

## 8.1 Dual-Path Request Flow

```
                       ┌───────────────────────────────────────────────┐
                       │                 CLIENT / USER                 │
                       └───────────┬───────────────────────┬───────────┘
                                   │                       │
         Path A: Trustless Direct  │                       │  Path B: Optional Managed Edge
                                   ▼                       ▼
                      ┌─────────────────────┐   ┌─────────────────────┐
                      │ ICP Boundary Nodes  │   │ Optional Enterprise │
                      │ (Certified HTTPS)   │   │ Edge / WAF / CDN    │
                      └──────────┬──────────┘   └──────────┬──────────┘
                                 │                         │
                                 ▼                         ▼
                      ┌─────────────────────┐   ┌─────────────────────┐
                      │ Protocol 28 / Asset │   │ Akash Provider      │
                      │ Canisters (ICP)     │   │ Ingress (TLS 1.3)   │
                      └─────────────────────┘   └─────────────────────┘
```

- **Path A (Censorship-Resistant Default):** Direct access to ICP canisters and Akash provider ingress endpoints with zero centralized proxy bottleneck.
- **Path B (Optional Enterprise Edge):** Customers needing custom domains, managed WAF, geo-routing, or L7 DDoS scrubbing can optionally place an edge CDN/WAF in front of their Akash URIs.

## 8.2 Hybrid Data Gravity (`from_aws`)

When migrating containers from AWS to Akash while keeping managed databases (RDS) or S3 buckets inside AWS, AWS charges **`$0.09/GB` egress** for traffic leaving AWS to Akash. LEMNIS explicitly models `usage.from_aws` in `lemnis.yaml` and warns operators when `from_aws > 0` without a pinned `region` (e.g., `us-east`), ensuring latency and hybrid egress costs are accounted for before deployment.

---

# SECTION 9: OBSERVABILITY PLATFORM

- **MVP (Q1):** Real-time deployment lifecycle states (`#pending` → `#active` → `#closed`), provider lease URIs, live AWS-vs-LEMNIS spend counters, credit runway alerts (< 24 hours remaining), and CLI replica reachability checks (`lemniskit status`).
- **Q3 Expansion:** Structured container log aggregation, Prometheus metrics scraping, PromQL alerting rules (Slack/PagerDuty/Discord/Email), and distributed tracing.

---

# SECTION 10: DEVELOPER TOOLS & EXPERIENCE

## 10.1 Lemniskit CLI (`@lemnis/lemniskit`) & SDK (`@lemnis/sdk`)

```bash
# Scaffold a validated lemnis.yaml manifest
lemniskit init my-app

# Validate lemnis.yaml schema, resource bounds & non-secret warnings
lemniskit validate -f lemnis.yaml

# Run an offline, source-backed AWS vs LEMNIS savings estimate
lemniskit estimate -f lemnis.yaml --markup 20

# Generate deterministic Akash SDL v2.0 with enforced 50% bid caps
lemniskit sdl -f lemnis.yaml -o deploy.sdl.yaml

# Check real HTTP reachability of local or mainnet ICP replica
lemniskit status --host http://127.0.0.1:8080

# Validate, estimate, generate SDL, and prepare/submit deployment
lemniskit deploy -f lemnis.yaml
```

## 10.2 `lemnis.yaml` Specification (Zod-Validated in `@lemnis/sdk`)

```yaml
version: "1"
project: shop-api
region: us-east                     # Optional provider locality / residency
services:
  api:
    image: ghcr.io/acme/api:1.4.2   # Public OCI image with pinned tag
    cpu: 2                          # vCPU (0.1 - 64)
    memory: 8Gi                     # 128Mi - 512Gi
    storage: 20Gi                   # Ephemeral container disk
    expose:
      - port: 8080
        as: 80                      # Public HTTP ingress
    env:
      NODE_ENV: production          # Non-secret config only!
    today:
      aws: m7i.large                # Optional: exact current AWS instance baseline
    usage:
      egress: 500Gi                 # Monthly outbound internet bandwidth
      from_aws: 100Gi               # Monthly data still pulled from AWS RDS/S3
  infer:
    image: ghcr.io/acme/infer:2.0.0
    cpu: 8
    memory: 32Gi
    storage: 100Gi
    gpu:
      model: h100
      count: 1
    expose:
      - port: 8000
        to: [api]                   # Private intra-group service networking
    placement: gpu                  # Optional separate provider group
```

---

# SECTION 11: BILLING & PRICING

## 11.1 Dual-Rail Settlement Model

```
PREPAID USD CREDITS (micro-USD, 1 USD = 1,000,000) ─▶ HOURLY IDEMPOTENT METERING ─▶ VERIFIED SAVINGS LEDGER
ICP CYCLES DEPOSITS (native canister runtime)      ─▶ ALLOWLISTED CHARGERS ONLY   ─▶ AUDITABLE USAGE HISTORY
```

- **No Crypto Friction for Customers:** Companies fund prepaid USD credits and see exact USD burn rates, credit runway, and cumulative savings vs AWS on-demand in the Web Console.
- **Integer Micro-USD Accounting:** All on-chain billing amounts use exact `Nat` micro-USD (`1 USD = 1_000_000`) to eliminate floating-point rounding drift.
- **Idempotent Metering:** `billing.recordUsage(idempotencyKey, ...)` guarantees retries never double-charge a billing period.
- **On-Chain Markup Ceiling:** Platform markup defaults to **20% (`2000 bps`)** and is strictly capped at **25% (`2500 bps`)** inside `billing/main.mo` to preserve customer savings above 50%.

## 11.2 Developer Plans (Corrected Cycle & Compute Allowances)

*All cycle USD equivalents calculated at verified ICP rate: `1T cycles ≈ 1 XDR ≈ $1.40 USD`.*

| Plan | Price | ICP Control-Plane Cycles | Included USD Compute Credit | Bulk IPFS Storage (Q2) | Egress |
|------|-------|--------------------------|-----------------------------|------------------------|--------|
| **Free** | `$0/mo` | 100B cycles (`~$0.14`) | `$2` sandbox credit | 1 GB | Included (fair use) |
| **Indie** | `$9/mo` | 5T cycles (`~$7.00`) | `$9` Akash credit | 20 GB | `$0` Akash egress |
| **Pro** | `$29/mo` | 20T cycles (`~$28.00`) | `$29` Akash credit | 100 GB | `$0` Akash egress |
| **Team** | `$99/mo` | 100T cycles (`~$140.00`) | `$99` Akash credit | 500 GB | `$0` Akash egress |

## 11.3 Verified Market Reference Rates (Checked November 2026)

| Resource | Unit | Market / LEMNIS Rate | Confidence | Notes |
|----------|------|----------------------|------------|-------|
| **ICP Compute Cycles** | 1T cycles | `$1.40` (1 XDR) | Verified (ICP Docs) | Configurable oracle in `billing/main.mo` |
| **ICP On-Chain Storage** | GiB / year | `$5.35` (`~$0.45/GB-mo`) | Verified (ICP Docs) | Control-plane state only — NOT for bulk media |
| **Akash vCPU** | vCPU-hour | `~$0.005` | Estimate (auction) | Calibrated from multi-provider averages; actual set by bid |
| **Akash Memory** | GiB-hour | `~$0.002` | Estimate (auction) | Bundled with ephemeral disk & bandwidth in provider bid |
| **Akash Storage (Ephemeral)** | GiB-month | `~$0.02` | Estimate (auction) | Included in deployment lease |
| **Akash GPU (NVIDIA H100)** | GPU-hour | `$1.45–$2.73` (~`$2.40` med.) | Verified (2026 trackers) | LEMNIS adds default 20% markup (`~$2.88/hr` med.) |
| **IPFS / Storacha (Q2)** | GB / month | `~$0.05` | Verified | `$0` egress fee vs AWS `$0.09/GB` |

## 11.4 Honest AWS On-Demand vs LEMNIS Comparison (730 hrs/mo, us-east-1, 20% LEMNIS Markup)

| Workload (Monthly) | AWS On-Demand Baseline | LEMNIS Estimate (incl. 20% markup) | Net Savings | Important Disclosure |
|--------------------|------------------------|------------------------------------|-------------|----------------------|
| **Web API (2 vCPU / 8 GiB / 20 GiB disk)** | `$75.18/mo` (`m7i.large` `$73.58` + gp3 `$1.60`) | **`~$23.16/mo`** *(est.)* | **~69%** | CPU/RAM rate confirmed when Akash provider bids arrive |
| **Web API + 500 GiB Internet Egress** | `$111.18/mo` (+ `$36.00` egress above 100 GB free) | **`~$23.16/mo`** *(est.)* | **~79%** | Egress bundled in Akash lease |
| **GPU Inference (1× H100, 100 hrs/mo)** | `$688.00` (`p5.48xlarge` `$6.88/GPU-hr`) | **`~$288.00`** (`$2.40 × 1.20`) | **~58%** | AWS 3-yr Savings Plan (`~$3.10/GPU-hr`) narrows gap to ~7% |
| **GPU Inference (1× H100, 730 hrs/mo)** | `$5,022.40` | **`~$2,102.40`** | **~58%** | No 3-year commitment required on LEMNIS |
| **Bulk Object Storage (100 GB, low egress)** | `$2.30/mo` (AWS S3 Standard) | `$5.00/mo` (IPFS) / `$44.60/mo` (ICP) | **AWS cheaper** | **We don't sell ICP storage for bulk S3 savings** — savings require high egress |

---

# SECTION 12: SECURITY, CONFIDENTIALITY & COMPLIANCE

## 12.1 Defense in Depth

```
┌─────────────────────────────────────────────────────────────────┐
│ LAYER 1: NETWORK & INGRESS                                      │
│ Direct Certified ICP Boundary Nodes • Optional Enterprise WAF   │
├─────────────────────────────────────────────────────────────────┤
│ LAYER 2: CRYPTOGRAPHIC IDENTITY & IAM                           │
│ Internet Identity (WebAuthn) • Ed25519 CLI • Anonymous Blocked  │
├─────────────────────────────────────────────────────────────────┤
│ LAYER 3: CANISTER AUTHORIZATION & ISOLATION                     │
│ Controller Allowlists • Nested Bucket/Table Maps • Bid Caps     │
├─────────────────────────────────────────────────────────────────┤
│ LAYER 4: DATA CONFIDENTIALITY                                   │
│ TLS 1.3 • No Plaintext On-Chain Secrets • Client Encryption/KMS │
├─────────────────────────────────────────────────────────────────┤
│ LAYER 5: RUNTIME SANDBOXING                                     │
│ ICP WASM Isolation • Akash Container/Pod Isolation              │
└─────────────────────────────────────────────────────────────────┘
```

## 12.2 Confidentiality & Threat Model

| Asset | Threat | Mitigation |
|-------|--------|------------|
| **Canister Memory (ICP)** | Subnet node providers can read raw canister heap/stable memory | Never store plaintext customer secrets, API keys, or PII on-chain; use client-side encryption or future ICP vetKD |
| **Container Env Vars (Akash)** | Untrusted compute providers have host access to container environment | Document `lemnis.yaml` `env` as non-secret; fetch secrets from customer KMS/Vault over mTLS or run on attested TEE providers |
| **Billing Drain Attack** | Unauthorized caller invoking `billing.charge` or `recordUsage` | Controller-managed `authorizedChargers` allowlist (empty on fresh deploy); anonymous principals prohibited |
| **Cross-Tenant Data Overwrite** | Flat key prefix collisions (`bucket/key` or `table-id`) | Structural isolation via nested `OrderedMap<ContainerId, OrderedMap<ItemId, Value>>` + strict slug/key validation |
| **Canister Memory Exhaustion (DoS)** | Unbounded uploads, records, or deployments | Hard `transient let` quotas per principal, per bucket, per table, and 2 MiB object ceiling |
| **Upgrade State Loss / Stale Constants** | Non-stable variables wiped on upgrade; plain `let` freezing old constants | `persistent actor` + `OrderedMap` state + `transient let` for all error strings, caps, and map helpers |

## 12.3 Implemented Security Controls vs Compliance Roadmap

- **Implemented Today in Protocol 28 (Verified by Automated Tests):**
  - Anonymous principal rejection on all mutations and private reads across all 5 canisters
  - Controller-managed `authorizedChargers` allowlist & idempotent usage ledger in `billing`
  - Owner-verified `update`, `delete`, `get`, `list`, `queryByField` in `database`
  - Nested bucket isolation, private-by-default visibility, and exact counter accounting in `storage`
  - Strict state-machine guards and on-chain 50% bid-cap enforcement in `compute`
  - Single-use expiring link codes and last-owner demotion guard in `identity`
- **Target Compliance Roadmap (Post-MVP Production):**
  - **GDPR Data Residency Controls (`region` pinning):** Q1 Year 1 (in design)
  - **Third-Party Smart Contract Audit (Protocol 28):** Pre-Mainnet Launch
  - **SOC 2 Type I / II:** Q2–Q4 Year 1
  - **ISO 27001:** Year 2

---

# SECTION 13: MULTI-CHAIN STRATEGY

| Workload | Primary Infrastructure | Rationale |
|----------|------------------------|-----------|
| **Control Plane / IAM / Billing** | ICP (`Protocol 28`) | Replicated persistence, reverse gas, certified HTTP |
| **Docker APIs & Microservices** | Akash Network | 60–75% savings vs AWS on-demand, zero rewrite |
| **AI / GPU Inference** | Akash GPU (future: Render) | H100 at 52–68% below AWS on-demand |
| **Hot Bulk Object Storage** | IPFS + Storacha | Zero egress fees, content-addressed |
| **Permanent Audit Archives** | Arweave | Pay-once permanence |

---

# SECTION 14: MVP SCOPE ($25K)

## 14.1 MVP Deliverables

| Category | Included in MVP | Explicitly Deferred |
|----------|-----------------|---------------------|
| **Protocol 28 Control Plane** | Hardened `identity`, `compute`, `billing`, `storage`, `database` canisters + automated Wasm/Candid/security verification | Cross-canister composite queries, SNS DAO handover |
| **SDK & Estimator (`@lemnis/sdk`)** | Zod `lemnis.yaml` schema, verified Nov 2026 AWS/Akash price catalog, honest estimator, Akash SDL v2.0 generator | AWS Cost & Usage Report (CUR) importer |
| **CLI (`@lemnis/lemniskit`)** | Real `init`, `validate`, `estimate`, `sdl`, `status`, `deploy` commands | Python/Rust/Go SDKs, Terraform provider |
| **Website & Web Console (`console/`)** | Public landing site, interactive estimator, Whitepaper v3.1 reader, full Cloud Console App (Dual local simulator + live ICP replica mode) | Live card checkout, real-time container log streaming |
| **Akash Execution** | Deterministic SDL v2.0 generation + bid-cap enforcement + bridge reconciliation contract | Multi-provider automatic failover |

## 14.2 MVP System Architecture

```
 customer browser / CLI                   LEMNIS Operator Infra               Akash Network
┌────────────────────────┐   ICP calls   ┌───────────────────────────┐       ┌──────────────────┐
│ Website + Cloud Console│──────────────▶│  Protocol 28 (ICP)        │       │ Akash Console /  │
│ (ICP Asset Canister)   │               │  identity · compute ·     │◀─────▶│ Provider Market  │
├────────────────────────┤               │  billing · storage · db   │       │ (Docker + GPU)   │
│ lemniskit CLI / SDK    │──────────────▶│                           │       └────────┬─────────┘
└────────────────────────┘               └────────────▲──────────────┘                │
                                                      │ bridge principal              ▼
                                         ┌────────────┴──────────────┐       ┌──────────────────┐
                                         │ akash-bridge (stateless)  │──────▶│ Customer Service │
                                         │ holds Akash key / wallet  │       │ Public HTTPS URL │
                                         └───────────────────────────┘       └──────────────────┘
```

---

# SECTION 15: 12-MONTH ROADMAP

| Quarter | Budget | Milestone | Key Exit Criteria |
|---------|--------|-----------|-------------------|
| **Q1** | `$25,000` | **Audited Core + Estimator + Console + First Akash Deploys** | Hardened Protocol 28 canisters, `@lemnis/sdk` + real CLI, Website + Console App, verified Akash smoke deploy |
| **Q2** | `$45,000` | **Storage (IPFS/Storacha) + SDKs + Stripe/Stablecoin Top-Up** | Off-chain S3-compatible IPFS wrapper, Python/Rust SDKs, automated credit top-up, GitHub Action |
| **Q3** | `$60,000` | **Observability + Autoscaling + Chain-Key Bridge Pilot** | Streaming logs, Prometheus metrics, canary deploys, ICP Chain-Key ECDSA Cosmos tx signing |
| **Q4** | `$80,000` | **Enterprise GA + Audit + SNS Preparation** | External Motoko audit, OIDC/SAML federation, SOC 2 Type I, multi-region SLAs |

---

*Document Version: 3.1 (Audited & Corrected)*  
*Last Updated: November 2026*  
*Platform: LEMNIS Decentralized Cloud*  
*Codebase: Protocol 28 + Lemniskit + Console*
