#!/usr/bin/env bash
# Builds the Rust conduit-crypto static library for all iOS/macOS targets
# and produces a universal XCFramework for Xcode.
# Run from the module root: ./ios/build-rust.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
RUST_DIR="$SCRIPT_DIR/../rust"
OUT_DIR="$SCRIPT_DIR/RustLib"

TARGETS=(
  "aarch64-apple-ios"
  "aarch64-apple-ios-sim"
  "x86_64-apple-ios"       # optional simulator intel
)

mkdir -p "$OUT_DIR"

for target in "${TARGETS[@]}"; do
  rustup target add "$target" 2>/dev/null || true
  cargo build --manifest-path "$RUST_DIR/Cargo.toml" \
              --release \
              --target "$target"
done

# Merge sim slices into a fat lib
CARGO_TARGET="$RUST_DIR/target"
lipo -create \
  "$CARGO_TARGET/aarch64-apple-ios-sim/release/libconduit_crypto.a" \
  "$CARGO_TARGET/x86_64-apple-ios/release/libconduit_crypto.a" \
  -output "$OUT_DIR/libconduit_crypto_sim.a"

# XCFramework: device + simulator
xcodebuild -create-xcframework \
  -library "$CARGO_TARGET/aarch64-apple-ios/release/libconduit_crypto.a" \
  -headers "$SCRIPT_DIR" \
  -library "$OUT_DIR/libconduit_crypto_sim.a" \
  -headers "$SCRIPT_DIR" \
  -output "$OUT_DIR/ConduitCrypto.xcframework"

echo "Built: $OUT_DIR/ConduitCrypto.xcframework"
