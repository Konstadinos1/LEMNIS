# Passkey / Universal Link web credentials

These files must be served verbatim (no redirect, no auth) from
`https://conduit.app/.well-known/` with `Content-Type: application/json`.

## Before going to production

### `apple-app-site-association`
Replace `TEAMID` with your 10-character Apple Developer Team ID.
It appears in App Store Connect → Membership → Team ID.

### `assetlinks.json`
Replace `REPLACE_WITH_RELEASE_KEYSTORE_SHA256_FINGERPRINT` with the
SHA-256 fingerprint of your Android release keystore signing certificate:

```
keytool -list -v -keystore release.jks -alias <alias> | grep 'SHA256:'
```

## Deployment checklist
- [ ] Served at `https://conduit.app/.well-known/apple-app-site-association` (no `.json` extension)
- [ ] Served at `https://conduit.app/.well-known/assetlinks.json`
- [ ] HTTP 200, `Content-Type: application/json`, no redirect
- [ ] `webcredentials` domain in iOS entitlement matches: `webcredentials:conduit.app`
- [ ] `rpId` in `expo-passkeys` matches: `conduit.app`
- [ ] Verify with: `curl -I https://conduit.app/.well-known/apple-app-site-association`
