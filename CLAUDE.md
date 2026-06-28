# CLAUDE.md — LEMNIS

Guidance for AI coding agents (Claude Code, Codex, Cursor, etc.) working in this repository.
Read this before making changes. It describes what LEMNIS is, how the code is laid out, how to
build and run it, the conventions to follow, and the known gotchas that will trip you up.

---

## 0. 30-second orientation

- **LEMNIS** = a decentralized cloud platform (AWS-alike) on the Internet Computer (ICP).
- Backend = **5 Motoko canisters** in `protocol-28/` (identity, compute, storage, database, billing).
  They're near-identical templates — learn one, you know all five.
- Frontend tooling = **Lemniskit**, a TypeScript CLI in `lemniskit/cli/`.
- **Maturity: prototype.** Canisters hold real in-memory logic but aren't production-hardened; the
  CLI only prints **mock output** (no canister calls wired up yet). The whitepaper in
  `docs/ARCHITECTURE.md` is the *target vision*, not a description of what's built.
- **Don't trust the docs/README for "what exists."** Read the code. Several things described
  (SDK, web console, real CLI↔canister calls) are not implemented.
- The canister code does **not currently compile** as-is — see §3.3 for the three blockers.

---

## 1. The three-tier brand structure

| Tier | Name | What lives here | Tech | Path |
|------|------|-----------------|------|------|
| Brand (user-facing) | **LEMNIS** | The platform / product | — | — |
| Backend (core) | **Protocol 28** | Canisters (the actual services) | Motoko | `protocol-28/` |
| Tooling (DX) | **Lemniskit** | CLI + SDKs | TypeScript | `lemniskit/` |

When you see "Protocol 28" in code comments or docs, it means the canister backend. "Lemniskit"
means the developer tooling.

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
│       ├── src/cli.ts      # All CLI command definitions (single file)
│       └── package.json    # @lemnis/lemniskit
│
├── console/                # Web dashboard — referenced in dfx.json (source console/dist)
│                           #   but NOT present in the repo yet
│
├── docs/                   # Long-form documentation (vision, not current state)
│   ├── ARCHITECTURE.md     # Full whitepaper (15 sections) — the source of truth for vision
│   ├── GOVERNANCE.md       # DAO governance model
│   ├── PRICING.md          # Plans + cost model
│   ├── ROADMAP.md          # Quarterly milestones
│   └── SECURITY.md         # Security posture / threat model
│
├── dfx.json                # ICP project config: canister → source mapping, networks
├── README.md               # Public overview (aspirational; cross-check against code)
├── CLAUDE.md / AGENTS.md   # Agent instructions (this file)
└── LICENSE                 # Apache 2.0
```

**Tree drift to be aware of:** the README's "Project Structure" lists `lemniskit/sdk/` and
`console/` — neither exists. Only `lemniskit/cli/` is implemented. `dfx.json` declares a `console`
assets canister sourced from `console/dist`, which also doesn't exist, so `dfx deploy` of that
canister will fail until the console is built.

---

## 3. The canisters (Protocol 28)

All five are Motoko `actor`s built from the **same template**. Internalize the template once.

### 3.1 The shared canister template

```motoko
import Principal "mo:base/Principal";
import HashMap "mo:base/HashMap";
import Time "mo:base/Time";
import Result "mo:base/Result";
// + Text / Nat / Array / Blob / Cycles as the service needs them

actor Thing {
    // 1. Public types: the record + a Result alias for fallible ops
    public type Thing = { id: Text; owner: Principal; createdAt: Time.Time; /* ... */ };

    // 2. State: in-memory HashMaps as instance vars (see gotcha #3 — NOT stable)
    private var things = HashMap.HashMap<Text, Thing>(10, Text.equal, Text.hash);
    private var counter : Nat = 0;

    // 3. Mutations: shared(msg) so you get msg.caller; return Result, never trap
    public shared(msg) func createThing() : async Result.Result<Thing, Text> {
        let id = "thing-" # Nat.toText(counter);   // monotonic-counter IDs
        counter += 1;
        let t : Thing = { id; owner = msg.caller; createdAt = Time.now() };
        things.put(id, t);
        #ok(t)
    };

    // 4. Ownership check on every mutation that touches an existing record
    public shared(msg) func mutate(id: Text) : async Result.Result<(), Text> {
        switch (things.get(id)) {
            case null { #err("Thing not found") };
            case (?t) {
                if (not Principal.equal(t.owner, msg.caller)) { return #err("Not authorized") };
                // ...update with `{ t with field = newValue }`, then put...
                #ok(())
            };
        };
    };

    // 5. Reads that don't need the caller are `query` (cheap, non-consensus)
    public query func getThing(id: Text) : async ?Thing { things.get(id) };
}
```

**Non-negotiable idioms (every canister follows these):**
- Caller identity comes from `public shared(msg) func ...` → `msg.caller : Principal`.
- Fallible mutations return `Result.Result<T, Text>` (`#ok` / `#err "message"`). **Errors are
  values, not traps** — never let a public method trap on an expected error path.
- Ownership is enforced by `Principal.equal(record.owner, msg.caller)`; mismatch → `#err("Not authorized")`.
- Read-only access uses `public query func ...`.
- IDs come from a monotonic `Nat` counter: `"<prefix>-" # Nat.toText(counter)`.
- Record updates use functional update syntax: `{ existing with field = newValue }`.

### 3.2 Per-canister API reference

| Canister | Key types | Methods (✎ = mutation, 🔍 = query) |
|----------|-----------|-------------------------------------|
| **identity** | `User { id, createdAt, email: ?Text, projects: [Text] }` | ✎`register()`, ✎`getUser()`, ✎`isAuthenticated()`, 🔍`getUserCount()` |
| **compute** | `ComputeInstance { id, owner, status, createdAt, cyclesBalance, memory }`, `InstanceStatus {#running; #stopped; #terminated}` | ✎`createInstance(memory: Nat)`, 🔍`getInstance(id)`, ✎`listInstances()`, ✎`stopInstance(id)`, 🔍`getAvailableCycles()` |
| **storage** | `Bucket { id, owner, objectCount, totalSize, createdAt }`, `StorageObject { key, data: Blob, contentType, size, owner, ... }` (objects keyed `bucketId # "/" # key`) | ✎`createBucket(name)`, ✎`uploadObject(bucketId, key, data, contentType)`, 🔍`getObject(bucketId, key)`, 🔍`listObjects(bucketId)`, ✎`deleteObject(bucketId, key)`, 🔍`getStats()` |
| **database** | `Table { name, owner, recordCount, createdAt }`, `Record { id, data: [(Text,Text)], createdAt, updatedAt }` | ✎`createTable(name)`, ✎`insert(tableName, data)`, 🔍`get(recordId)`, 🔍`query(...)` ⚠️, ✎`update(recordId, data)`, ✎`delete(recordId)`, 🔍`list(tableName)`, 🔍`getStats()` |
| **billing** | `Account { owner, balance, totalDeposited, totalSpent, createdAt }`, `UsageRecord { service, amount, timestamp }` | ✎`getOrCreateAccount()`, ✎`deposit()` (accepts attached cycles), 🔍`getBalance(user)`, ✎`charge(user, amount, service)`, ✎`getAccount()`, 🔍`getCyclePrice()`, 🔍`getPlatformStats()` |

Note: some methods are `shared` (not `query`) even though they're read-shaped — e.g. `getUser`,
`listInstances`, `getAccount` — because they depend on `msg.caller`. That's intentional; a `query`
can't be authenticated by caller in the same way.

### 3.3 Build-blocking gotchas (the canisters don't compile until these are fixed)

Verified against the current source:

1. **Missing imports.**
   - `protocol-28/compute/main.mo` uses `Text.equal`/`Text.hash` (line 32) and `Nat.toText`
     (line 37) but imports neither `Text` nor `Nat` (imports end at line 9).
   - `protocol-28/database/main.mo` uses `Nat.toText` (line 75) without importing `Nat`.
   Fix: add `import Text "mo:base/Text";` and/or `import Nat "mo:base/Nat";`.

2. **`query` used as a method name.** `protocol-28/database/main.mo:95` declares
   `public query func query(...)`. `query` is a Motoko keyword — won't parse. Rename it
   (e.g. `queryByField`) and update any caller/SDK reference.

3. **Non-stable state = data loss on upgrade.** Every `HashMap` is a plain `var` (not `stable`),
   and there are no `preupgrade`/`postupgrade` hooks. **All canister data is wiped on every
   upgrade.** Fine for a demo; for anything persistent, migrate to stable structures (stable vars
   with serialize/deserialize hooks, or the `StableBTreeMap` pattern).

Minor (warnings, not blockers): `database/main.mo` imports `Iter` (line 10) but doesn't use it.

When fixing these, keep one concern per commit and match the existing style (4-space indent,
`//` comments that explain *why*, explicit `Result` returns).

---

## 4. The CLI (Lemniskit)

`lemniskit/cli/src/cli.ts` — one file, `commander`-based, `chalk` for colored output.

| Command | Args / flags | Currently does |
|---------|--------------|----------------|
| `init [project-name]` | — | Prints a fake scaffold + next-steps |
| `deploy` | `-n, --network <local\|ic>` (default `local`) | Prints a fake "compiling canisters" list |
| `storage <action>` | `[bucket] [file]` | Echoes the action |
| `compute <action>` | `[instance-id]` | Echoes the action |
| `db <action>` | `[table]` | Echoes the action |
| `balance` | — | Prints a hardcoded balance |
| `status` | — | Prints all canisters as "Running" |

**Critical:** every command is a `console.log` stub. There is **no `@dfinity/agent` wiring**, even
though `@dfinity/agent`, `@dfinity/candid`, and `@dfinity/principal` are already dependencies. When
a task says "make `<command>` work," the real job is to instantiate an agent + actor and call the
matching canister method — not to tweak the existing print. Match the existing
`.command().description().argument()/.option().action()` shape when adding commands.

Dependencies of note: `@dfinity/agent`/`@dfinity/candid`/`@dfinity/principal` (canister calls),
`commander` (CLI), `chalk`/`ora`/`inquirer` (UX).

---

## 5. Build, run, and test

### Prerequisites
- **`dfx`** (DFINITY SDK) for canisters. Local replica binds to `127.0.0.1:8080` (see `dfx.json`).
- **Node 20+** + npm for the CLI. TypeScript 5, `ts-node` for dev.

### Canisters
```bash
dfx start --background        # start local replica (port 8080)
dfx deploy                    # build + deploy all canisters in dfx.json
dfx deploy identity           # build/deploy a single canister
dfx canister call identity register   # invoke a method
```
`dfx.json` networks: `local` (ephemeral, 127.0.0.1:8080) and `ic` (mainnet, persistent).
A bare `dfx build` is the fastest way to surface the §3.3 compile errors.

### CLI
```bash
cd lemniskit/cli
npm install
npm run dev -- --help         # run via ts-node (src/cli.ts)
npm run build                 # tsc → dist/
npm test                      # jest (no tests exist yet)
```

**No tests, no CI yet** — no `*.test.ts`, no Motoko tests, no workflow under `.github/`. If you add
non-trivial logic, add tests in the same change: `jest` for the CLI/SDK, and `dfx canister call`
checks (or PocketIC / `mo:test`) for canisters.

---

## 6. Adding a new canister (keep these in sync)

A new service is not just a `.mo` file. Do all of:
1. `protocol-28/<name>/main.mo` — follow the §3.1 template (state, `shared(msg)` mutations with
   ownership checks, `query` reads, `Result` returns).
2. Add a `canisters.<name>` entry to `dfx.json` (`"main": "protocol-28/<name>/main.mo"`,
   `"type": "motoko"`).
3. Add a CLI surface in `lemniskit/cli/src/cli.ts` (a `commander` command).
4. Update the README "Project Structure" + the relevant `docs/` file if behavior is documented.

Keep canisters single-responsibility — don't merge two services into one actor.

---

## 7. Conventions

**Motoko**
- 4-space indent; explicit `Result` returns for fallible methods; ownership via `Principal.equal`;
  `query` functions for caller-independent reads; one service per actor.

**TypeScript**
- Strict mode, type everything, `commander` for new commands (match the existing chain shape),
  `chalk` for user-facing output.

**General engineering**
1. Ship working code, not prototypes-on-top-of-prototypes. No leftover `TODO`s — if it's not done,
   say so in the PR description.
2. Name things explicitly: `getUserBalance()` not `getData()`.
3. Functions do one thing; extract when they grow past ~40 lines.
4. Error handling is mandatory — never let errors bubble silently (in Motoko, return `#err`).
5. No magic numbers — constants at the top of the file (see `billing/main.mo`'s cycle constants,
   `getCyclePrice` at lines 119–125, for the pattern).
6. Comments explain **why**, not what.

**Security**
- Never hardcode secrets, keys, or generated canister IDs. `.gitignore` already excludes `.env*`,
  `canister_ids.json`, and `.dfx/` — keep it that way.
- Validate all external input. Enforce caller authorization on every state-mutating canister
  method (the §3.1 ownership check). See `docs/SECURITY.md` for the intended threat model.

**Git workflow**
- Branch naming: `feat/...`, `fix/...`, `chore/...`, `refactor/...`.
- **Conventional commits**: `feat:`, `fix:`, `chore:`, `refactor:`, `docs:`. One logical change per
  commit.
- Never push directly to `main` — always via PR. Open PRs as **drafts**.

---

## 8. Documentation map

The long-form docs describe the *intended* system, not necessarily what's built:

- `docs/ARCHITECTURE.md` — full 15-section whitepaper; canonical for "how is X *supposed* to work."
- `docs/GOVERNANCE.md` — DAO committees (Technical / Treasury / Grants).
- `docs/PRICING.md` — plan tiers and the cost model vs AWS.
- `docs/ROADMAP.md` — quarterly milestones (Q1 MVP → Q4 GA).
- `docs/SECURITY.md` — security posture.

When you change behavior these docs describe, update the relevant doc in the same PR.

---

## 9. When you're stuck

1. Read the actual code — don't guess. The canister and CLI patterns are small and consistent.
2. Check whether a feature is *implemented* vs *only described in docs* before building on it.
3. Reuse existing patterns (the five canisters are near-identical templates).
4. If a task is ambiguous, make the most reasonable choice, note it in the PR, and keep moving.
5. Never leave the build broken: `dfx build` for canisters, `npm run build` for the CLI must pass.
