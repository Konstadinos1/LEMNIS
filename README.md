# LEMNIS

> **The Decentralized Cloud Platform**  
> Move existing Docker containers & GPU workloads to Akash Network with an audited Internet Computer (Protocol 28) control plane.

[![ICP](https://img.shields.io/badge/Internet%20Computer-Protocol%2028-14171B)](https://internetcomputer.org)
[![Akash](https://img.shields.io/badge/Akash-Network-D84B1D)](https://akash.network)
[![License](https://img.shields.io/badge/License-Apache%202.0-137752.svg)](LICENSE)

---

## What is LEMNIS?

LEMNIS helps engineering teams cut AWS/GCP/Azure on-demand cloud bills by **50%+** with zero multi-year lock-in. Each workload runs on the infrastructure where the economics actually work:

- **Protocol 28 (Internet Computer canisters):** Persistent, tamper-proof control plane — Identity & Org RBAC, Deployment Registry with enforced 50% bid caps, Control-Plane Blobs, KV Metadata, and Idempotent micro-USD/Cycles Billing.
- **Akash Network (Compute Plane):** Unmodified Docker/OCI containers and NVIDIA H100/A100 GPU inference at 50–75% below AWS on-demand with `$0` marginal egress markup.
- **Lemniskit (`@lemnis/sdk` + `@lemnis/lemniskit` CLI):** Offline `lemnis.yaml` validation, verified Nov 2026 AWS-vs-LEMNIS savings estimation, deterministic Akash SDL v2.0 generation, and real ICP replica health checks.
- **LEMNIS Website & Cloud Console (`console/`):** Public landing website, interactive Savings Estimator & SDL Studio, searchable Whitepaper v3.1 Reader, and interactive Cloud Console App built to `console/dist` for ICP asset canister hosting.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                     LEMNIS WEBSITE & CONSOLE                        │
│     Public Site • Savings Estimator • Whitepaper v3.1 • App         │
├─────────────────────────────────────────────────────────────────────┤
│                      LEMNISKIT (@lemnis/sdk + CLI)                  │
│   lemnis.yaml Zod Schema • Pricing Catalog • Akash SDL v2.0 Gen     │
├─────────────────────────────────────────────────────────────────────┤
│                 PROTOCOL 28 (5 Hardened ICP Canisters)              │
│   identity  •  compute  •  billing  •  storage  •  database         │
├──────────────────────────────┬──────────────────────────────────────┤
│       INTERNET COMPUTER      │            AKASH NETWORK             │
│  Persistent Control Plane    │  Docker Containers & GPU Leases      │
└──────────────────────────────┴──────────────────────────────────────┘
```

---

## Quick Start

```bash
# Install all workspace packages (Node 22+)
npm install

# Build @lemnis/sdk, @lemnis/lemniskit CLI, and @lemnis/console (to console/dist)
npm run build

# Run full verification suite (Motoko Wasm/Candid compile + SDK + CLI + Console tests)
npm test

# Launch the LEMNIS Website & Cloud Console App locally
npm run dev:console
```

### Lemniskit CLI

```bash
# Generate a starter lemnis.yaml
npm run dev --workspace=@lemnis/lemniskit -- init my-api

# Validate schema and confidentiality warnings
npm run dev --workspace=@lemnis/lemniskit -- validate -f lemnis.yaml

# Estimate monthly AWS on-demand vs LEMNIS savings (offline)
npm run dev --workspace=@lemnis/lemniskit -- estimate -f lemnis.yaml

# Generate deterministic Akash SDL v2.0 with 50% bid caps
npm run dev --workspace=@lemnis/lemniskit -- sdl -f lemnis.yaml

# Check real ICP replica connectivity
npm run dev --workspace=@lemnis/lemniskit -- status --network local
```

---

## Audited Pricing Snapshot (Checked November 2026, us-east-1)

| Monthly Workload (730 hrs) | AWS On-Demand | LEMNIS (incl. 20% markup) | Net Saving | Note |
|----------------------------|---------------|---------------------------|------------|------|
| **Web API** (2 vCPU · 8 GiB · 20 GiB) | `$75.18` (`m7i.large` + gp3) | **`~$23.16`** *(est.)* | **~69%** | Confirmed on live Akash bid |
| **Web API + 500 GiB Egress** | `$111.18` (`+$36` egress) | **`~$23.16`** *(est.)* | **~79%** | Bandwidth included in Akash bid |
| **H100 GPU (100 hrs/mo)** | `$688.00` (`$6.88/GPU-hr`) | **`~$288.00`** (`$2.88/hr`) | **~58%** | 3-yr AWS Savings Plan (`~$3.10/hr`) narrows gap |
| **Bulk Storage (100 GB, low egress)** | `$2.30` (S3 Standard) | `$5.00` IPFS / `$44.60` ICP | **AWS wins** | ICP storage is for small control-plane state only |

See [`docs/PRICING.md`](docs/PRICING.md) for complete rates and disclosures.

---

## Project Structure

```
LEMNIS/
├── protocol-28/                # Core canisters (Motoko persistent actors)
│   ├── identity/main.mo        # Principal registry, Org RBAC, 1x CLI link codes
│   ├── compute/main.mo         # ICP instances + Akash deployment registry & bid caps
│   ├── storage/main.mo         # Nested private-by-default control-plane buckets
│   ├── database/main.mo        # Nested owner-isolated key-value tables
│   ├── billing/main.mo         # Cycles + prepaid micro-USD credits & allowlisted chargers
│   └── tests/                  # Automated Motoko Wasm/Candid & security invariant tests
├── lemniskit/
│   ├── sdk/                    # @lemnis/sdk (Zod schema, catalog, estimator, SDL, Candid IDL)
│   └── cli/                    # @lemnis/lemniskit CLI
├── console/                    # @lemnis/console (Website + Whitepaper Reader + Cloud Console -> dist/)
├── docs/
│   ├── ARCHITECTURE.md         # Enterprise Architecture Whitepaper v3.1 (audited)
│   ├── PRICING.md              # Verified Nov 2026 pricing & honest comparisons
│   ├── SECURITY.md             # Implemented Protocol 28 controls & confidentiality model
│   ├── GOVERNANCE.md           # Progressive ICP SNS DAO governance
│   └── ROADMAP.md              # Quarterly milestones
├── dfx.json                    # ICP canister config (5 Motoko canisters + console assets)
└── package.json                # Root npm workspaces
```

---

## Documentation

- [**Enterprise Architecture Whitepaper v3.1**](docs/ARCHITECTURE.md) — Audited architecture, changelog, pricing & confidentiality threat model
- [**Security & Confidentiality**](docs/SECURITY.md) — Implemented Protocol 28 security controls
- [**Pricing**](docs/PRICING.md) — Verified AWS on-demand vs LEMNIS baselines
- [**Governance**](docs/GOVERNANCE.md) — Progressive ICP SNS DAO model
- [**Roadmap**](docs/ROADMAP.md) — Completed & upcoming milestones

---

## License

Apache 2.0 — see [LICENSE](LICENSE).
