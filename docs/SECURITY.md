# LEMNIS Security & Compliance

## Defense in Depth

```
┌───────────────────────────────────────────────────────────────┐
│ LAYER 1: EDGE                                                  │
│ • Cloudflare WAF                                               │
│ • DDoS protection                                              │
│ • Bot detection                                                │
├───────────────────────────────────────────────────────────────┤
│ LAYER 2: IDENTITY                                              │
│ • Internet Identity (passwordless)                             │
│ • FIDO2 WebAuthn                                               │
│ • MFA required for production                                  │
├───────────────────────────────────────────────────────────────┤
│ LAYER 3: ENCRYPTION                                            │
│ • TLS 1.3 in transit                                           │
│ • AES-256-GCM at rest                                          │
│ • Customer-managed keys (BYOK)                                 │
├───────────────────────────────────────────────────────────────┤
│ LAYER 4: NETWORK                                               │
│ • Private subnets                                              │
│ • Service mesh                                                 │
│ • Zero-trust networking                                        │
├───────────────────────────────────────────────────────────────┤
│ LAYER 5: RUNTIME                                               │
│ • WASM sandboxing (ICP)                                        │
│ • Container isolation (Akash)                                  │
│ • Immutable infrastructure                                     │
└───────────────────────────────────────────────────────────────┘
```

---

## Compliance Roadmap

| Framework | Status | Target |
|-----------|--------|--------|
| **GDPR** | 🟡 In Progress | Q1 Year 1 |
| **SOC 2 Type I** | 🔴 Planned | Q2 Year 1 |
| **SOC 2 Type II** | 🔴 Planned | Q4 Year 1 |
| **ISO 27001** | 🔴 Planned | Q2 Year 2 |
| **HIPAA** | 🔴 Future | Q4 Year 2 |

---

## Data Residency

| Region | Code | Description |
|--------|------|-------------|
| US East | `us-east` | N. Virginia |
| US West | `us-west` | Oregon |
| EU West | `eu-west` | Ireland (GDPR) |
| EU Central | `eu-central` | Frankfurt |
| APAC East | `apac-east` | Tokyo |
| Global | `global` | Multi-region |

---

## Audit Logging

- **Immutable**: Append-only, blockchain-style hash chain
- **Retention**: 90 days default, configurable
- **Export**: SIEM integration (Splunk, Datadog)
- **Coverage**: All auth, data access, admin actions

---

## Security Practices

### Code Security
- Automated dependency scanning (Snyk)
- SAST on every PR
- Third-party smart contract audits

### Infrastructure
- No production SSH access
- All secrets encrypted at rest
- Automated key rotation

### Incident Response
- 24/7 on-call rotation
- <1 hour response for critical issues
- Post-mortem for all incidents

---

## Reporting Vulnerabilities

Email: security@lemnis.cloud

We follow responsible disclosure. Bounties available for critical vulnerabilities.

---

*See [ARCHITECTURE.md](ARCHITECTURE.md) for full security details.*
