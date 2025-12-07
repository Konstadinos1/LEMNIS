# LEMNIS 🌀 | NEXUS CLOUD

> **The Decentralized Cloud Platform on the Internet Computer**

[![ICP](https://img.shields.io/badge/Internet%20Computer-Protocol-blueviolet)](https://internetcomputer.org)
[![Akash](https://img.shields.io/badge/Akash-Network-red)](https://akash.network)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)

---

## 🎯 Vision

**LEMNIS** is a decentralized cloud platform (codename: **NEXUS CLOUD**) that provides AWS/GCP/Azure-equivalent services running entirely on decentralized infrastructure.

| Traditional Cloud Problem | LEMNIS Solution |
|---------------------------|-----------------|
| Single point of failure | Multi-node consensus, no AWS-style outages |
| Vendor lock-in | Open protocols, portable deployments |
| Censorship risk | Permissionless, unstoppable backends |
| Geographic restrictions | Global node network, no jurisdiction limits |
| Opaque pricing | Transparent on-chain metering |

---

## 🏗️ Three-Tier Architecture

| Layer | Name | Purpose |
|-------|------|---------|
| 🎨 **Brand** | **LEMNIS** | The Platform - User-facing cloud services |
| ⚙️ **Backend** | **Protocol 28** | The Architecture - Core canister infrastructure |
| 🛠️ **Tooling** | **Lemniskit** | The SDK - Developer tools and CLI |

---

## 🌐 Infrastructure Stack

```
┌─────────────────────────────────────────────────────────────────┐
│                    LEMNIS COMPUTE LAYER                          │
├─────────────────┬─────────────────┬─────────────────────────────┤
│   ICP CANISTERS │  AKASH CONTAINERS │  EDGE FUNCTIONS           │
│   (Persistent)   │  (Kubernetes)     │  (Serverless)            │
├─────────────────┼─────────────────┼─────────────────────────────┤
│ • Stateful      │ • Stateless/ful  │ • Stateless               │
│ • WASM runtime  │ • Docker/OCI     │ • WASM/V8 isolates        │
│ • ~$5/GB/yr     │ • ~$0.01/GB/hr   │ • Per-invocation          │
└─────────────────┴─────────────────┴─────────────────────────────┘
```

---

## 📦 Services

| Service | AWS Equivalent | Status | Backend |
|---------|---------------|--------|---------|
| **LEMNIS Compute** | EC2 / Lambda | 🔜 MVP | ICP + Akash |
| **LEMNIS Storage** | S3 | 🔜 MVP | IPFS + Arweave |
| **LEMNIS DB** | DynamoDB | 🔜 MVP | ICP Stable Memory |
| **LEMNIS Identity** | IAM / Cognito | 🔜 MVP | Internet Identity |
| **LEMNIS Billing** | Cost Explorer | 🔜 MVP | Stablecoin |

---

## 🏛️ Full Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         LEMNIS PLATFORM                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │                     LEMNISKIT (SDK)                      │   │
│   │  CLI Tools • Client Libraries • Developer Portal        │   │
│   └─────────────────────────────────────────────────────────┘   │
│                              │                                  │
│                              ▼                                  │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │                    PROTOCOL 28 (Core)                    │   │
│   │                                                          │   │
│   │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐ │   │
│   │  │ Identity │  │ Compute  │  │ Storage  │  │ Database │ │   │
│   │  │ Canister │  │ Canister │  │ Canister │  │ Canister │ │   │
│   │  └──────────┘  └──────────┘  └──────────┘  └──────────┘ │   │
│   │                                                          │   │
│   │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐ │   │
│   │  │ Billing  │  │ Registry │  │ Gateway  │  │ Metrics  │ │   │
│   │  │ Canister │  │ Canister │  │ Canister │  │ Canister │ │   │
│   │  └──────────┘  └──────────┘  └──────────┘  └──────────┘ │   │
│   │                                                          │   │
│   └─────────────────────────────────────────────────────────┘   │
│                              │                                  │
│         ┌────────────────────┼────────────────────┐             │
│         ▼                    ▼                    ▼             │
│   ┌───────────┐        ┌───────────┐        ┌───────────┐      │
│   │    ICP    │        │   AKASH   │        │   IPFS    │      │
│   │  Mainnet  │        │  Network  │        │ Arweave   │      │
│   └───────────┘        └───────────┘        └───────────┘      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🚀 Quick Start

### Prerequisites
- [DFINITY Canister SDK](https://internetcomputer.org/docs/current/developer-docs/setup/install/)
- [Node.js 18+](https://nodejs.org/)
- ICP tokens for cycles

### Installation

```bash
# Install Lemniskit CLI
npm install -g @lemnis/lemniskit

# Initialize a new project
lemniskit init my-app

# Deploy to ICP
lemniskit deploy
```

### CLI Commands

```bash
# Authentication
lemniskit auth login              # Internet Identity login
lemniskit auth login --wallet     # MetaMask/wallet login

# Projects
lemniskit projects create my-project
lemniskit projects list

# Deployments
lemniskit deploy                  # Deploy from nexus.yaml
lemniskit deployments list
lemniskit deployments logs my-api
lemniskit deployments scale my-api --replicas 3

# Storage
lemniskit storage buckets create my-bucket
lemniskit storage cp ./file.txt gs://my-bucket/

# Billing
lemniskit balance                 # Check cycles balance
```

---

## 📁 Project Structure

```
lemnis/
├── protocol-28/              # Core canister infrastructure
│   ├── identity/             # Internet Identity integration
│   ├── compute/              # Compute service canisters
│   ├── storage/              # Storage service canisters
│   ├── database/             # Database service canisters
│   └── billing/              # Cycles management
│
├── lemniskit/                # Developer tooling
│   ├── cli/                  # Command-line interface
│   ├── sdk/                  # Client SDKs (JS/TS)
│   └── templates/            # Project templates
│
├── console/                  # Web management console
│   ├── src/
│   └── assets/
│
├── docs/                     # Documentation
│   └── ARCHITECTURE.md       # Full technical whitepaper
│
├── dfx.json                  # ICP canister config
└── README.md
```

---

## 💰 Pricing (MVP Target)

| Resource | Price | Notes |
|----------|-------|-------|
| ICP Compute | ~$5.35/GB/year | Stable memory storage |
| Akash Container | ~$0.018/vCPU-hour | 65-85% cheaper than AWS |
| IPFS Storage | ~$0.05/GB/month | Hot object storage |
| Network Egress | ~$0.05/GB | Outbound traffic |

---

## 📅 Roadmap

| Quarter | Budget | Milestone |
|---------|--------|-----------|
| Q1 | $25,000 | **MVP Launch** - Auth, Deploy, Basic Console |
| Q2 | $45,000 | Storage + SDK |
| Q3 | $60,000 | Observability + Autoscaling |
| Q4 | $80,000 | GA Launch + Enterprise |

---

## 🛠️ Development

```bash
# Clone the repository
git clone https://github.com/Konstadinos1/LEMNIS.git
cd LEMNIS

# Start local ICP replica
dfx start --background

# Deploy locally
dfx deploy

# Run CLI in dev mode
cd lemniskit/cli
npm install
npm run dev -- --help
```

---

## 📜 License

Apache 2.0 - See [LICENSE](LICENSE) for details.

---

## 🔗 Links

- [Full Architecture Whitepaper](docs/ARCHITECTURE.md)
- [Internet Computer](https://internetcomputer.org)
- [Akash Network](https://akash.network)
- [DFINITY Developer Docs](https://internetcomputer.org/docs)

---

<p align="center">
  <strong>Built with 🌀 on the Internet Computer + Akash Network</strong><br>
  <em>True Decentralization. No Compromises.</em>
</p>
