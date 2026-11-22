# CLAUDE.md — LEMNIS

Guidance for AI coding agents working in this repository. Verified against the codebase in November 2026.

---

## 1. Repository Architecture

LEMNIS is an npm workspace monorepo (`Node >= 22`, ESM, strict TypeScript) plus five Motoko canisters:

- **`protocol-28/{identity,compute,storage,database,billing}/main.mo`** — Five `persistent actor` Motoko canisters on `mo:base/OrderedMap` (zero compiler errors and zero warnings).
- **`protocol-28/tests/`** — Automated Vitest suite using `motoko@3.20.0` to type-check, generate Candid `.did`, compile to real ICP WebAssembly, and assert security invariants across all five canisters.
- **`lemniskit/sdk/` (`@lemnis/sdk`)** — Zod-validated `lemnis.yaml` parser, verified Nov 2026 AWS/Akash/ICP pricing catalog, honest savings estimator (including `from_aws` data gravity & 3-yr AWS Savings Plan disclosures), deterministic Akash SDL v2.0 generator, and Protocol 28 Candid IDL bindings (`@icp-sdk/core`).
- **`lemniskit/cli/` (`@lemnis/lemniskit`)** — Real CLI (`init`, `validate`, `estimate`, `sdl`, `status`, `deploy`) powered by `@lemnis/sdk`. Zero mock echo stubs remain.
- **`console/` (`@lemnis/console`)** — Vite + React + TypeScript + Vanilla CSS web application outputting to `console/dist` (matching `dfx.json`'s `console` assets canister). Houses the public LEMNIS Website, interactive Estimator & SDL Studio, Protocol 28 Explorer, Whitepaper v3.1 Reader, and interactive Cloud Console App.
- **`docs/`** — Audited Whitepaper v3.1 (`ARCHITECTURE.md`), `PRICING.md`, `SECURITY.md`, `GOVERNANCE.md`, and `ROADMAP.md`.

---

## 2. Motoko Canister Conventions (`protocol-28/`)

All five canisters share these mandatory patterns:

1. **`persistent actor` + `mo:base/OrderedMap`** so state survives upgrades cleanly.
2. **All error strings, numeric limits, and `Map.Make` helpers MUST be `transient let`.** In a `persistent actor`, plain `let` bindings become stable and ignore edits on upgrade.
3. **Caller-aware read methods use `public shared query(msg) func ...`** (note syntax: `query` precedes `(msg)`). Queries CAN inspect `msg.caller` for authorization.
4. **Reject `Principal.isAnonymous(msg.caller)`** on every state mutation and private read.
5. **Fallible mutations return `Result.Result<T, Text>`** (`#ok` / `#err`) — never trap on expected errors.
6. **Structural tenant isolation:** `storage` and `database` use nested maps (`Map<BucketId, Map<Key, Obj>>` and `Map<TableName, Map<RecordId, Record>>`) — never flat string-prefix concatenation.
7. **Capability annotations:** Use `Cycles.accept<system>(Cycles.available())` to avoid `M0195` warnings, and annotate `Nat` subtractions explicitly to avoid `M0155` warnings.
8. **Confidentiality:** Never store plaintext customer secrets on-chain (ICP node providers can inspect canister memory).

---

## 3. Build, Test, and Run

```bash
# Install all workspaces
npm install

# Run all automated tests (canisters Wasm/Candid + SDK + CLI + Console)
npm test

# Build SDK, CLI, and Console (produces console/dist for dfx deploy)
npm run build

# Run the Website & Cloud Console locally
npm run dev:console

# Type-check canisters with dfx (when dfx is installed)
for c in identity compute storage database billing; do dfx build --check "$c"; done
```

---

## 4. Engineering & Git Conventions

- TypeScript strict mode, ESM, named constants at top of file, functions concise (<= 40 lines), comments explain **why**.
- Conventional commits (`feat:`, `fix:`, `docs:`, `chore:`, `refactor:`), one logical change per commit.
- Never push directly to `main` — open draft PRs on feature branches (`feat/...`, `fix/...`).
- Keep `README.md`, `CLAUDE.md`, and `docs/` synchronized whenever behavior or pricing changes.
