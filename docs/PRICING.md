# LEMNIS Pricing (Audited November 2026)

All AWS baselines use **us-east-1 on-demand list prices** checked in November 2026. LEMNIS adds a transparent platform markup (default **20%**, strictly capped at **25%** on-chain inside `protocol-28/billing/main.mo`) and enforces a **50% minimum savings bid cap** on Akash compute workloads unless overridden via `max_monthly_price`.

---

## Developer Plans

*Cycle USD values reflect verified ICP pricing (`1T cycles ≈ 1 XDR ≈ $1.40 USD`).*

| Plan | Price | ICP Control-Plane Cycles | Prepaid Akash Compute Credit | Bulk IPFS Storage (Q2) | Akash Egress |
|------|-------|--------------------------|------------------------------|------------------------|--------------|
| **Free** | `$0/mo` | 100B cycles (`~$0.14`) | `$2` sandbox credit | 1 GB | Included (fair use) |
| **Indie** | `$9/mo` | 5T cycles (`~$7.00`) | `$9` credit | 20 GB | `$0` marginal |
| **Pro** | `$29/mo` | 20T cycles (`~$28.00`) | `$29` credit | 100 GB | `$0` marginal |
| **Team** | `$99/mo` | 100T cycles (`~$140.00`) | `$99` credit | 500 GB | `$0` marginal |

---

## Pay-As-You-Go Reference Rates

| Resource | Unit | Market / LEMNIS Rate | Confidence | Notes |
|----------|------|----------------------|------------|-------|
| **ICP Compute** | 1 trillion cycles | `$1.40` | Verified | Configurable oracle in `billing/main.mo` |
| **ICP On-Chain Storage** | GiB / year | `$5.35` (`~$0.45/GB-mo`) | Verified | Control-plane state only (see honesty note below) |
| **Akash vCPU** | vCPU-hour | `~$0.005` | Estimate | Reverse-auction average; actual set by provider bid |
| **Akash Memory** | GiB-hour | `~$0.002` | Estimate | Bundled with ephemeral disk and bandwidth |
| **Akash Ephemeral Disk** | GiB-month | `~$0.02` | Estimate | Included in provider bid |
| **Akash GPU (H100)** | GPU-hour | `$1.45–$2.73` (`~$2.40` med.) | Verified | Customer pays provider bid × (1 + markup) |
| **IPFS / Storacha (Q2)** | GB / month | `$0.05` | Verified | `$0` egress fee |
| **AWS Egress (for `from_aws`)** | GB | `$0.09` (after 100 GB free) | Verified | Paid directly to AWS when services still call RDS/S3 |

---

## Honest AWS On-Demand Comparison (730 hrs/mo, 20% LEMNIS Markup)

| Workload | AWS On-Demand (us-east-1) | LEMNIS (incl. 20% markup) | Savings | Disclosure |
|----------|---------------------------|---------------------------|---------|------------|
| **API Server (2 vCPU / 8 GiB / 20 GiB disk)** | `$75.18/mo` (`m7i.large` + gp3) | **`~$23.16/mo`** *(est.)* | **~69%** | Confirmed once live Akash bid is accepted |
| **API Server + 500 GiB Egress** | `$111.18/mo` (+ `$36.00` egress) | **`~$23.16/mo`** *(est.)* | **~79%** | Akash bundles bandwidth into provider bids |
| **GPU H100 (100 hours)** | `$688.00` (`p5.48xlarge` `$6.88/hr`) | **`~$288.00`** (`$2.40 × 1.20`) | **~58%** | AWS 3-yr Savings Plan (`~$3.10/hr`) narrows gap to ~7% |
| **GPU H100 (24/7, 730 hours)** | `$5,022.40/mo` | **`~$2,102.40/mo`** | **~58%** | Zero 3-year commitment required |
| **Bulk Object Storage (100 GB, low egress)** | `$2.30/mo` (S3 Standard) | `$5.00/mo` (IPFS) / `$44.60/mo` (ICP) | **AWS wins** | **LEMNIS does NOT pitch ICP storage as cheaper than S3** |

> **Why we show where AWS wins:** Prior v3.0 docs erroneously listed 100 GB S3 as `$25/mo`. Real S3 Standard is `$2.30/mo` (`$0.023/GB-mo`), whereas replicated ICP canister storage is `~$44.60/mo` (~19× S3). Use LEMNIS where decentralized infrastructure genuinely wins: **CPU containers, GPU inference, high-egress APIs, and tamper-proof ICP control planes.**

---

## Payment Methods

- **Prepaid USD Credits (MVP):** Granted in exact micro-USD (`1 USD = 1,000,000`) — no crypto custody required by customers.
- **ICP Cycles:** Native cycle deposits into `protocol-28/billing/main.mo` for canister workloads.
- **USDC / USDT & Card Checkout:** Planned for Q2.

---

*See [ARCHITECTURE.md](ARCHITECTURE.md#section-11-billing--pricing) for full pricing methodology and sources.*
