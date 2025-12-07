# LEMNIS 🌀

> **The Decentralized Cloud Platform**  
> AWS/GCP/Azure alternative running on ICP + Akash

[![ICP](https://img.shields.io/badge/Internet%20Computer-Protocol-blueviolet)](https://internetcomputer.org)
[![Akash](https://img.shields.io/badge/Akash-Network-red)](https://akash.network)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)

---

## 🚀 What is LEMNIS?

LEMNIS is a **fully decentralized cloud platform** providing AWS/GCP/Azure-equivalent services on blockchain infrastructure. No single points of failure. No censorship. 65-85% cost savings.

| Traditional Cloud | LEMNIS |
|-------------------|--------|
| AWS outages take down the internet | Multi-node consensus, no SPOF |
| Locked into proprietary APIs | Open protocols, portable |
| Deplatformed at provider's discretion | Permissionless, unstoppable |
| Unpredictable bills | Transparent on-chain metering |
| Zero governance input | DAO-governed platform |

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         LEMNIS CLOUD                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                   LEMNISKIT (SDK)                        │    │
│  │         CLI • Client Libraries • Dev Portal             │    │
│  └───────────────────────────┬─────────────────────────────┘    │
│                              │                                   │
│  ┌───────────────────────────▼─────────────────────────────┐    │
│  │                   PROTOCOL 28 (Core)                     │    │
│  │                                                          │    │
│  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ │    │
│  │  │Identity│ │Compute │ │Storage │ │Database│ │Billing │ │    │
│  │  └────────┘ └────────┘ └────────┘ └────────┘ └────────┘ │    │
│  │                                                          │    │
│  └──────────────────────────┬───────────────────────────────┘    │
│                             │                                    │
│         ┌───────────────────┼───────────────────┐               │
│         ▼                   ▼                   ▼               │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐         │
│  │     ICP     │    │    AKASH    │    │IPFS/Arweave│         │
│  │  Canisters  │    │ Containers  │    │  Storage   │         │
│  └─────────────┘    └─────────────┘    └─────────────┘         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Three-Tier Structure

| Layer | Name | Purpose |
|-------|------|---------|
| 🎨 **Brand** | **LEMNIS** | User-facing cloud platform |
| ⚙️ **Backend** | **Protocol 28** | Core canister infrastructure |
| 🛠️ **Tooling** | **Lemniskit** | CLI, SDKs, dev tools |

---

## ⚡ Quick Start

```bash
# Install CLI
npm install -g @lemnis/lemniskit

# Login with Internet Identity
lemniskit auth login

# Create a project
lemniskit projects create my-app

# Deploy
lemniskit deploy
```

---

## 📦 Services

| Service | Description | Backend |
|---------|-------------|---------|
| **Compute** | Containers & WASM | ICP + Akash |
| **Storage** | S3-compatible buckets | IPFS + Arweave |
| **Database** | Key-value store | ICP Stable Memory |
| **Identity** | Auth & IAM | Internet Identity |
| **Billing** | Usage metering | Stablecoin |

---

## 💰 Pricing

### Indie Developer Plans

| Plan | Price | Compute | Storage | Bandwidth |
|------|-------|---------|---------|-----------|
| **Free** | $0/mo | 100M cycles | 1 GB | 10 GB |
| **Indie** | $9/mo | 5B cycles | 20 GB | 100 GB |
| **Pro** | $29/mo | 20B cycles | 100 GB | 500 GB |

### vs AWS (65-85% savings)

| Workload | AWS | LEMNIS |
|----------|-----|--------|
| API (10M req/mo) | $50 | $15 |
| Container (24/7) | $100 | $30 |
| GPU (100 hrs) | $433 | $140 |

---

## 🗳️ DAO Governance

LEMNIS is governed by token holders through:
- **Technical Committee** - Protocol upgrades
- **Treasury Committee** - Budget allocation
- **Grants Committee** - Developer funding

[Learn more →](docs/ARCHITECTURE.md#section-3-dao-governance-architecture)

---

## 📁 Project Structure

```
lemnis/
├── protocol-28/           # Core canisters (Motoko)
│   ├── identity/          # IAM + Auth
│   ├── compute/           # Deployment management
│   ├── storage/           # Object storage
│   ├── database/          # Key-value store
│   └── billing/           # Cycles management
│
├── lemniskit/             # Developer tools
│   ├── cli/               # Command-line interface
│   └── sdk/               # Client libraries
│
├── console/               # Web dashboard
│
├── docs/                  # Documentation
│   └── ARCHITECTURE.md    # Full whitepaper
│
├── dfx.json               # ICP config
└── README.md
```

---

## 🛠️ Development

```bash
# Clone
git clone https://github.com/Konstadinos1/LEMNIS.git
cd LEMNIS

# Start local ICP replica
dfx start --background

# Deploy canisters
dfx deploy

# Run CLI
cd lemniskit/cli
npm install
npm run dev -- --help
```

---

## 📅 Roadmap

| Quarter | Milestone |
|---------|-----------|
| **Q1** | MVP Launch - Auth, Compute, Console |
| **Q2** | Storage + SDKs |
| **Q3** | Observability + Autoscaling |
| **Q4** | GA Launch + Enterprise |

---

## 📖 Documentation

- [**Full Architecture Whitepaper**](docs/ARCHITECTURE.md) - 15 sections, enterprise-grade
- [Internet Computer Docs](https://internetcomputer.org/docs)
- [Akash Network Docs](https://akash.network/docs)

---

## 📜 License

Apache 2.0 - See [LICENSE](LICENSE)

---

<p align="center">
  <strong>True Decentralization. No Compromises.</strong><br>
  <em>Built on ICP + Akash</em>
</p>
