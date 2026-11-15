#!/usr/bin/env bash
# Compiles the Wasm modules the integration tests install into PocketIC.
#
# Uses the moc compiler and base library bundled with dfx by default. Override
# with MOC=/path/to/moc and MOTOKO_BASE=/path/to/motoko-base/src when dfx is
# unavailable (e.g. hosts whose glibc is too old for the dfx binary).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TESTS_DIR="$(dirname "$SCRIPT_DIR")"
PROTOCOL_DIR="$(dirname "$TESTS_DIR")"
OUT_DIR="$TESTS_DIR/.build"

if [[ -z "${MOC:-}" || -z "${MOTOKO_BASE:-}" ]]; then
    if ! command -v dfx >/dev/null 2>&1; then
        echo "error: set MOC and MOTOKO_BASE, or install dfx" >&2
        exit 1
    fi
    DFX_CACHE="$(dfx cache show)"
    MOC="${MOC:-$DFX_CACHE/moc}"
    MOTOKO_BASE="${MOTOKO_BASE:-$DFX_CACHE/base}"
fi

if [[ ! -x "$MOC" ]]; then
    echo "error: moc compiler not found or not executable at $MOC" >&2
    exit 1
fi
if [[ ! -f "$MOTOKO_BASE/Principal.mo" ]]; then
    echo "error: Motoko base library not found at $MOTOKO_BASE" >&2
    exit 1
fi

mkdir -p "$OUT_DIR"

build() {
    local name="$1" source="$2"
    echo "moc: building $name"
    "$MOC" --package base "$MOTOKO_BASE" "$source" -o "$OUT_DIR/$name.wasm"
}

build billing "$PROTOCOL_DIR/billing/main.mo"
build service_proxy "$TESTS_DIR/fixtures/service_proxy.mo"
