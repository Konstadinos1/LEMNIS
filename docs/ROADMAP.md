# LEMNIS Roadmap

## 12-Month Plan

```
Q1 ─────────────► Q2 ─────────────► Q3 ─────────────► Q4
   Core & MVP       Storage+SDKs      Observability     Enterprise GA
   $25K             $45K              $60K              $80K
```

---

## Q1: Foundation & MVP ($25K)

### Completed in Repository
- [x] Hardened Protocol 28 Motoko canisters (`identity`, `compute`, `storage`, `database`, `billing`) with persistent `OrderedMap` state, anonymous rejection, RBAC orgs, nested bucket/table isolation, `authorizedChargers`, and 50% bid-cap enforcement
- [x] Automated Motoko compilation, Wasm/Candid verification & security test suite (`protocol-28/tests`)
- [x] `@lemnis/sdk` — Zod `lemnis.yaml` schema, verified Nov 2026 AWS/Akash pricing catalog, honest savings estimator, deterministic Akash SDL v2.0 generator, and Protocol 28 Candid bindings
- [x] `@lemnis/lemniskit` CLI — real `init`, `validate`, `estimate`, `sdl`, `status`, and `deploy` commands (stubs removed)
- [x] `console/` — Public LEMNIS Website, Interactive Whitepaper v3.1 Reader, Live Savings Estimator, and Interactive Blockchain Cloud Console App (buildable to `console/dist` for ICP asset canister)
- [x] Audited Whitepaper v3.1 & honest pricing disclosures

### Remaining Q1 Exit Milestones
- [ ] Off-chain `akash-bridge` daemon connected to live Akash Console API / wallet
- [ ] End-to-end live smoke deployment on Akash Network with public HTTPS URL
- [ ] Mainnet ICP canister deployment + custom domain + first 5 beta customers

---

## Q2: Bulk Storage, Payments & Multi-Language SDKs ($45K)

- [ ] IPFS / Storacha bucket integration + S3-compatible API wrapper (zero egress fees)
- [ ] Automated Stripe / USDC prepaid credit top-up
- [ ] AWS Cost & Usage Report (CUR) importer for instant bill-wide estimates
- [ ] Python & Rust SDKs
- [ ] GitHub Actions `lemnis/deploy-action@v1` & Terraform provider

---

## Q3: Observability, Autoscaling & Chain-Key Bridge ($60K)

- [ ] Streaming container logs & Prometheus metrics
- [ ] Alerting engine & dashboard builder
- [ ] Akash autoscaling, canary & blue/green automated rollouts
- [ ] ICP Chain-Key ECDSA (`sign_with_ecdsa`) Cosmos/Akash signing pilot

---

## Q4: Enterprise & GA ($80K)

- [ ] Independent third-party security audit of Protocol 28 canisters
- [ ] OIDC/SAML enterprise federation & custom IAM policies
- [ ] SOC 2 Type I certification
- [ ] Multi-region provider failover & SLA tiers (99.9%)
- [ ] ICP SNS DAO governance transition (post-PMF)

---

*See [ARCHITECTURE.md](ARCHITECTURE.md#section-15-12-month-roadmap) for full roadmap details.*
