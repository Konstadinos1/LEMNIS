#!/usr/bin/env bash
# Extract SHA-256 SPKI hashes for certificate pinning.
#
# Usage:
#   ./scripts/extract-spki-pins.sh relay.conduit.app
#   ./scripts/extract-spki-pins.sh api.conduit.app
#
# Copy the output hashes into:
#   - app.json  → expo.ios.infoPlist.NSPinnedDomains.<host>.NSPinnedLeafIdentities
#   - plugins/withCertificatePinning.ts  → PINNED_DOMAINS[*].pins
#
# Pin the leaf cert + at least one intermediate or backup rotation cert.

set -euo pipefail

HOST="${1:?Usage: $0 <hostname>}"
PORT="${2:-443}"

echo "Fetching certificate chain from ${HOST}:${PORT}..."
echo ""

# Fetch all certs in the chain
CHAIN=$(echo | openssl s_client -connect "${HOST}:${PORT}" -servername "${HOST}" \
  -showcerts 2>/dev/null)

# Extract each PEM cert and compute its SPKI hash
CERT_NUM=0
while IFS= read -r line; do
  if [[ "$line" == "-----BEGIN CERTIFICATE-----" ]]; then
    CERT=""
    IN_CERT=1
  fi
  if [[ "${IN_CERT:-0}" == "1" ]]; then
    CERT+="$line"$'\n'
  fi
  if [[ "$line" == "-----END CERTIFICATE-----" ]]; then
    IN_CERT=0
    CERT_NUM=$((CERT_NUM + 1))

    SUBJECT=$(echo "$CERT" | openssl x509 -noout -subject 2>/dev/null | sed 's/subject=//')
    HASH=$(echo "$CERT" \
      | openssl x509 -pubkey -noout 2>/dev/null \
      | openssl pkey -pubin -outform DER 2>/dev/null \
      | openssl dgst -sha256 -binary \
      | base64)

    echo "Cert #${CERT_NUM}: ${SUBJECT}"
    echo "  SPKI SHA-256 (base64): ${HASH}"
    echo ""
  fi
done <<< "$CHAIN"

echo "Done. Pin cert #1 (leaf) + one backup (cert #2 or next rotation leaf)."
