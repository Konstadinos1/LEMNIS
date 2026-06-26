# CLAUDE.md — LEMNIS

Guidance for AI coding agents (Claude Code, Codex, Cursor, etc.) working in this repository.
Read this before making changes. It describes what LEMNIS is, how the code is laid out, how to
build and run it, the conventions to follow, and the known gotchas that will trip you up.

---

## 1. What this project is

**LEMNIS** is a decentralized cloud platform — an AWS/GCP/Azure-style alternative built on the
**Internet Computer (ICP)** and Akash. It exposes cloud primitives (compute, storage, database,
identity, billing) as on-chain canisters, with a CLI/SDK for developers.

The project is organized as a **three-tier brand structure**:

| Tier | Name | What lives here | Tech |
|------|------|-----------------|------|
| Brand (user-facing) | **LEMNIS** | The platform / product | — |
| Backend (core) | **Protocol 28** | Canisters (the actual services) | Motoko |
| Tooling (DX) | **Lemniskit** | CLI + SDKs | TypeScript |

> **Maturity:** This is an **early-stage / prototype** codebase. The canisters implement working
> in-memory logic but are not production-hardened, and the CLI currently prints **mock output**
> rather than calling the canisters. Treat the docs (especially `docs/ARCHITECTURE.md`) as the
> *target vision*, and the code as a first scaffold toward it. Do not assume a feature exists in
> code just because the README or whitepaper describes it.

---

## 2. Repository layout

```
LEMNIS/
├── protocol-28/            # Core canisters (Motoko) — the backend
│   ├── identity/main.mo    # Auth / user registry (Internet Identity principals)
│   ├── compute/main.mo     # Compute instance lifecycle
│   ├── storage/main.mo     # S3-style blob buckets/objects
│   ├── database/main.mo    # Key-value tables + records
│   └── billing/main.mo     # Cycles accounts, deposits, charges
│
├── lemniskit/              # Developer tooling
│   └── cli/                # `lemniskit` command-line tool (TypeScript + commander)
│       ├── src/cli.ts      # All CLI command definitions
│       └── package.json    # @lemnis/lemniskit
│
├── console/                # Web dashboard (referenced in dfx.json as an assets canister;
│                           #   source `console/dist` — NOT yet present in the repo)
│
├── docs/                   # Long-form documentation
│   ├── ARCHITECTURE.md     # Full whitepaper (15 sections) — the source of truth for vision
│   ├── GOVERNANCE.md       # DAO governance model
│   ├── PRICING.md          # Plans + cost model
│   ├── ROADMAP.md          # Quarterly milestones
│   └── SECURITY.md         # Security posture / threat model
│
├── dfx.json                # ICP project config: canister → source mapping, networks
├── README.md               # Public overview
├── CLAUDE.md / AGENTS.md   # Agent instructions (this file)
└── LICENSE                 # Apache 2.0
```

When the README's "Project Structure" mentions `lemniskit/sdk/` or `console/`, note those
directories do not exist in the tree yet — only `lemniskit/cli/` is implemented.

---

## 3. The canisters (Protocol 28)

All five canisters are Motoko `actor`s and follow the **same idioms**. Learn one and you know all
of them.

**Shared patterns:**
- State is held in `HashMap.HashMap<K, V>` instance fields (in-memory).
- Caller identity comes from `public shared(msg) func ...` → `msg.caller : Principal`.
- Reads that don't need the caller are `public query func ...` (cheap, non-consensus).
- Mutations return `Result.Result<T, Text>` (`#ok` / `#err "message"`) — **errors are values,
  not traps**. Follow this; never let a public method trap on expected error paths.
- Ownership is enforced by comparing `Principal.equal(record.owner, msg.caller)` and returning
  `#err("Not authorized")` on mismatch.
- IDs are generated from a monotonic counter, e.g. `"compute-" # Nat.toText(counter)`.

**Per-canister responsibilities:**

| Canister | Key types | Key methods |
|----------|-----------|-------------|
| `identity` | `User { id, createdAt, email, projects }` | `register`, `getUser`, `isAuthenticated`, `getUserCount` |
| `compute` | `ComputeInstance`, `InstanceStatus {#running/#stopped/#terminated}` | `createInstance`, `getInstance`, `listInstances`, `stopInstance`, `getAvailableCycles` |
| `storage` | `Bucket`, `StorageObject` (objects keyed `bucketId # "/" # key`) | `createBucket`, `uploadObject`, `getObject`, `listObjects`, `deleteObject`, `getStats` |
| `database` | `Table`, `Record { id, data: [(Text,Text)] }` | `createTable`, `insert`, `get`, `query`, `update`, `delete`, `list`, `getStats` |
| `billing` | `Account { balance, totalDeposited, totalSpent }`, `UsageRecord` | `getOrCreateAccount`, `deposit`, `getBalance`, `charge`, `getAccount`, `getCyclePrice`, `getPlatformStats` |

### Known gotchas in the current canister code (fix these when you touch a file)

These will surface as soon as you run `dfx build`:

1. **Missing imports.** Several files use modules they don't import:
   - `compute/main.mo` uses `Text.equal`, `Text.hash`, `Nat.toText` but imports neither `Text`
     nor `Nat`.
   - `database/main.mo` uses `Nat.toText` without importing `Nat`.
   Add the corresponding `import Text "mo:base/Text";` / `import Nat "mo:base/Nat";`.
2. **`query` as a method name.** `database/main.mo` defines `public query func query(...)`.
   `query` is a Motoko keyword; this won't compile. Rename it (e.g. `queryByField`) and update
   the CLI/SDK accordingly.
3. **Non-stable state.** All `HashMap` state is declared with plain `var` (not `stable`), and
   there are no `preupgrade`/`postupgrade` hooks. **All data is wiped on canister upgrade.** For
   anything beyond a demo, migrate to stable structures (e.g. stable vars or the `StableBTreeMap`
   pattern) before relying on persistence.

When you fix these, prefer a small focused commit per concern and keep the existing style
(4-space indent, `// WHY` comments, explicit `Result` returns).

---

## 4. The CLI (Lemniskit)

`lemniskit/cli/src/cli.ts` — a `commander`-based CLI with `chalk` for colored output.

Commands: `init [project-name]`, `deploy [-n local|ic]`, `storage <action> [bucket] [file]`,
`compute <action> [id]`, `db <action> [table]`, `balance`, `status`.

**Important:** every command currently just `console.log`s mock/placeholder output. There is **no
`@dfinity/agent` wiring yet**, even though the deps are declared in `package.json`. When asked to
"make a command work," the real task is to connect it to the corresponding canister via the
DFINITY agent — don't assume it already does.

Dependencies of note: `@dfinity/agent`, `@dfinity/candid`, `@dfinity/principal` (canister calls),
`commander` (CLI), `chalk`/`ora`/`inquirer` (UX).

---

## 5. Build, run, and test

### Prerequisites
- **`dfx`** (DFINITY SDK) for canisters. Local replica binds to `127.0.0.1:8080` (see `dfx.json`).
- **Node 20+** + npm for the CLI. TypeScript 5, `ts-node` for dev.

### Canisters
```bash
dfx start --background        # start local replica (port 8080)
dfx deploy                    # build + deploy all canisters defined in dfx.json
dfx deploy <canister>         # e.g. dfx deploy identity
dfx canister call identity register   # invoke a method
```
`dfx.json` networks: `local` (ephemeral, 127.0.0.1:8080) and `ic` (mainnet, persistent).

### CLI
```bash
cd lemniskit/cli
npm install
npm run dev -- --help         # run via ts-node (src/cli.ts)
npm run build                 # tsc → dist/
npm test                      # jest (no tests exist yet — add them with new logic)
```

> There is **no test suite yet** (no `*.test.ts`, no Motoko tests, no CI workflow). If you add
> non-trivial logic, add tests in the same change: `jest` for the CLI/SDK, and prefer
> `dfx canister call` based checks (or PocketIC / `mo:test`) for canisters.

---

## 6. Conventions

These apply to all work in this repo. The first group is project-specific; the rest are the
codeowner's standing preferences and still apply here.

**Project-specific**
- **Motoko:** 4-space indent; explicit `Result` returns for fallible methods; enforce ownership
  with `Principal.equal`; use `query` functions for read-only access; keep canisters single-
  responsibility (don't merge two services into one actor).
- **TypeScript:** strict mode, type everything, `commander` for new CLI commands (match the
  existing `.command().description().action()` shape), `chalk` for user-facing output.
- Keep `dfx.json`, the README structure section, and any new canister in sync — adding a canister
  means: new `protocol-28/<name>/main.mo` + a `canisters` entry in `dfx.json` + a CLI surface.

**General engineering**
1. Ship working code, not prototypes-on-top-of-prototypes. No leftover `TODO` comments — if it's
   not done, say so in the PR description.
2. Name things explicitly. `getUserBalance()` not `getData()`.
3. Functions do one thing; keep them short. Extract when they grow past ~40 lines.
4. Error handling is mandatory — never let errors bubble silently (in Motoko, return `#err`).
5. No magic numbers — constants at the top of the file or in config. (`billing/main.mo`'s cycle
   constants are a good example to follow.)
6. Comments explain **why**, not what.

**Security**
- Never hardcode secrets, keys, or canister IDs that should be generated. `.gitignore` already
  excludes `.env*`, `canister_ids.json`, and `.dfx/` — keep it that way.
- Validate all external input. Enforce caller authorization on every state-mutating canister
  method (the ownership checks above).
- See `docs/SECURITY.md` for the intended threat model.

**Git workflow**
- Branch naming: `feat/...`, `fix/...`, `chore/...`, `refactor/...`.
- **Conventional commits**: `feat:`, `fix:`, `chore:`, `refactor:`, `docs:`. One logical change
  per commit.
- Never push directly to `main` — always via PR. Open PRs as drafts.

---

## 7. Documentation map

For anything beyond code mechanics, the long-form docs are the reference:

- `docs/ARCHITECTURE.md` — the full 15-section whitepaper; the canonical description of the
  intended system (services, DAO governance, multi-chain strategy). Start here for "how is X
  *supposed* to work."
- `docs/GOVERNANCE.md` — DAO committees (Technical / Treasury / Grants).
- `docs/PRICING.md` — plan tiers and the cost model vs AWS.
- `docs/ROADMAP.md` — quarterly milestones (Q1 MVP → Q4 GA).
- `docs/SECURITY.md` — security posture.

When you change behavior that these docs describe, update the relevant doc in the same PR.

---

## 8. When you're stuck

1. Read the actual code — don't guess. The canister and CLI patterns are small and consistent.
2. Check whether a feature is *implemented* vs *only described in docs* before building on it.
3. Reuse existing patterns (the five canisters are near-identical templates).
4. If a task is ambiguous, make the most reasonable choice, note it in the PR, and keep moving.
5. Never leave the build broken: `dfx build` for canisters, `npm run build` for the CLI must pass.
