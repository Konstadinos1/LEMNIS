# LEMNIS Governance

## Overview

LEMNIS follows a **progressive decentralization** model:
1. **MVP Phase:** Protocol 28 canisters are operated by documented controller principals with transparent, auditable on-chain guardrails (e.g., `billing.listAuthorizedChargers()` is public; platform markup is hard-capped at **25% / 2500 bps** in code).
2. **Post-PMF DAO Phase:** Canister controller authority transitions to an **ICP Service Nervous System (SNS)** DAO, ensuring protocol upgrades require verified on-chain neuron consensus.

## SNS DAO Structure (Post-PMF)

```
                 STAKED NEURONS (Token Holders)
                              │
                              ▼
             SECURITY & GOVERNANCE COUNCIL (7-of-11)
           (Time-bounded emergency pause only: 48h ratify)
                              │
         ┌────────────────────┼────────────────────┐
         ▼                    ▼                    ▼
    Technical            Treasury              Grants
    Committee            Committee            Committee
```

## Committees

- **Technical Committee:** Reviews reproducible canister Wasm hashes, security patches, and architecture RFCs.
- **Treasury Committee:** Manages reserves, pricing oracle updates, and quarterly budget caps (≤ 5% treasury per quarter).
- **Grants Committee:** Administers milestone-gated developer funding and ecosystem bounties.

## Proposal Types & Safeguards

| Type | Quorum | Approval | Timelock | Anti-Capture Guardrail |
|------|--------|----------|----------|------------------------|
| Parameter Change | 5% | 50%+1 | 24h | Markup hard-capped at ≤ 25% in canister |
| Protocol / Wasm Upgrade | 10% | 66% | 7 days | Reproducible Wasm SHA-256 verification |
| Emergency Action | Council | 7-of-11 | Immediate | **48h community ratification & 7-day auto-sunset** |
| Budget Allocation | 10% | 60% | 48h | Quarterly disbursement ceiling |
| Grant Approval | 5% | 50%+1 | 24h | Milestone-based release |
| Council Election | 15% | Ranked choice | 14 days | Staggered 6-month terms, recallable |

## Token Policy (Post-PMF)

Token launch is strictly deferred until product-market fit is proven. MVP billing operates exclusively with prepaid USD credits and ICP cycles.

| Category | % | Vesting / Lock |
|----------|---|----------------|
| Community Treasury (SNS) | 30% | On-chain DAO-controlled |
| Ecosystem Grants | 20% | 5-year milestone distribution |
| Core Team | 20% | 4-year linear, 1-year cliff |
| Investors | 15% | 2-year linear, 6-month cliff |
| Public SNS Swap | 10% | Neuron dissolve-delay tiers |
| Liquidity | 5% | 1-year lock |

---

*See [ARCHITECTURE.md](ARCHITECTURE.md#section-3-dao-governance-architecture) for full governance specifications.*
