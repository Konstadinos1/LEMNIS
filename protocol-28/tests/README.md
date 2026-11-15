# Protocol 28 canister tests

Integration tests that install the real canister Wasm into [PocketIC](https://github.com/dfinity/pocketic)
and call it as different principals (controller, attacker, anonymous, service canister).

## Run

```bash
cd protocol-28/tests
npm ci          # also downloads the PocketIC server (.pocket-ic-version)
npm test        # compiles canisters with moc, then runs vitest
```

`npm test` uses the `moc` compiler and base library bundled with `dfx`. If `dfx` isn't
available (or its binary needs a newer glibc than your host has), point the build script
at a standalone toolchain:

```bash
MOC=/path/to/moc MOTOKO_BASE=/path/to/motoko-base/src npm test
```

> On npm 11+, install scripts are opt-in. `package.json` already allowlists
> `@dfinity/pic`; if the PocketIC binary is still missing, run `npm rebuild @dfinity/pic`.

## Billing: authorizing service canisters

`billing.charge()` only accepts calls from principals on a controller-managed allowlist,
which is **empty on a fresh deploy**. After deploying, authorize each service canister
that bills users:

```bash
dfx canister call billing addAuthorizedCharger "(principal \"$(dfx canister id compute)\")"
dfx canister call billing listAuthorizedChargers
```
