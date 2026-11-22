# LEMNIS Security, Confidentiality & Compliance

This document clearly separates **security controls implemented and tested in Protocol 28 today** from the **target production compliance roadmap**.

---

## 1. Implemented Protocol 28 Security Controls

Verified by automated compilation and regression tests in `protocol-28/tests/`:

| Canister | Implemented Safeguards |
|----------|------------------------|
| **`identity`** | Rejects anonymous principal (`2vxsx-fae`) on all mutations & private reads; Organization RBAC (`#owner`, `#developer`, `#viewer`); guards against demoting/removing last owner; single-use 10-minute link codes consumed immediately on redemption; controller-only `getUserCount()`. |
| **`compute`** | Rejects anonymous callers; owner/controller-only reads (`getInstance`, `listInstances`, `getDeployment`); strict resource & memory bounds (`64 MiB–64 GiB` instances, `100m–64000m` CPU, `≤ 8` GPUs); strict state-machine transitions (`#terminated` cannot be restarted/stopped); tracks explicitly attached cycles; enforces on-chain 50% savings bid cap (`actualHourlyMicroUsd <= maxHourlyMicroUsd`); bridge/controller-only reconciliation. |
| **`storage`** | Eliminates path-traversal and cross-bucket collisions via nested `OrderedMap<BucketId, OrderedMap<ObjectKey, StorageObject>>`; enforces DNS-safe bucket names (`[a-z0-9-]`, 3–63 chars) and rejects leading `/` or `..` keys; private-by-default ACLs (`isPublic = false`); exact `objectCount`/`totalSize` accounting across overwrites and deletes; 2 MiB object & 64 MiB bucket quotas. |
| **`database`** | Eliminates unauthenticated `update()`/`delete()` holes and table prefix leakage via nested `OrderedMap<TableName, OrderedMap<RecordId, Record>>`; enforces strict table ownership on all reads and writes; deduplicates `queryByField` matches; accurate `recordCount`; bounded field counts and text lengths. |
| **`billing`** | Eliminates public `charge()` drain via controller-managed `authorizedChargers` allowlist (empty by default, rejects anonymous); idempotent `recordUsage()` prevents double-charging on retry; micro-USD integer arithmetic; on-chain 25% markup cap (`2500 bps`); owner/controller-only `getBalance()`; accurate configurable cycle pricing (`$1.40 / 1T cycles`). |
| **All Five** | `persistent actor` with `OrderedMap` for upgrade persistence; all constants & error strings declared `transient let` so updates apply across canister upgrades. |

---

## 2. Confidentiality Threat Model (Critical)

- **ICP Canister State Is NOT Confidential:** ICP subnet node providers can inspect canister memory. **Never store plaintext secrets, API keys, passwords, or private keys in canister state.**
- **Akash Container Environments Are Provider-Visible:** Akash providers have host-level access to standard containers. Document `lemnis.yaml` `env` variables as non-secret configuration; load production secrets via external KMS/Vault over mTLS or attested TEE providers.
- **Akash Operator Key Isolation:** The operator's Akash API key / wallet resides exclusively in the off-chain `akash-bridge` (Phase 1) and transitions to ICP Chain-Key ECDSA (`sign_with_ecdsa`) in Phase 2 — never hardcoded in git or plaintext canister memory.

---

## 3. Defense-in-Depth Architecture

- **Layer 1 (Ingress):** Direct certified HTTPS via ICP Boundary Nodes (zero single point of censorship) + optional Enterprise Edge/WAF for customers requiring managed DDoS mitigation.
- **Layer 2 (Identity):** Internet Identity (FIDO2 WebAuthn) for browser Console + local `0600` Ed25519 keys for headless CLI/CI.
- **Layer 3 (Authorization):** On-chain `Principal.equal` ownership checks, Org RBAC, and `Principal.isController` admin gating.
- **Layer 4 (Transport & Encryption):** TLS 1.3 everywhere; client-side envelope encryption / KMS for sensitive payloads.
- **Layer 5 (Runtime):** WebAssembly sandboxing (ICP) + OCI container isolation (Akash).

---

## 4. Target Production Compliance Roadmap

*None of the certifications below are currently held; they are planned milestones prior to Enterprise GA.*

| Framework | Status | Target Milestone |
|-----------|--------|------------------|
| Third-Party Motoko Security Audit | Planned | Pre-Mainnet Launch |
| GDPR Region Pinning (`region` selector) | In Progress | Q1 Year 1 |
| SOC 2 Type I | Planned | Q2 Year 1 |
| SOC 2 Type II | Planned | Q4 Year 1 |
| ISO 27001 | Planned | Year 2 |

---

## 5. Reporting Vulnerabilities

Email: `security@lemnis.cloud` (or open a private GitHub Security Advisory on `Konstadinos1/LEMNIS`).

*See [ARCHITECTURE.md](ARCHITECTURE.md#section-12-security-confidentiality--compliance) for full security architecture.*
