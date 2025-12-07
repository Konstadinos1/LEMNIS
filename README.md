# LEMNIS 🌀

> **The Decentralized Cloud Platform on the Internet Computer**

[![ICP](https://img.shields.io/badge/Internet%20Computer-Protocol-blueviolet)](https://internetcomputer.org)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)

---

## 🏗️ Three-Tier Architecture

| Layer | Name | Purpose |
|-------|------|---------|
| 🎨 **Brand** | **LEMNIS** | The Platform - User-facing cloud services |
| ⚙️ **Backend** | **Protocol 28** | The Architecture - Core canister infrastructure |
| 🛠️ **Tooling** | **Lemniskit** | The SDK - Developer tools and CLI |

---

## 🌐 What is LEMNIS?

LEMNIS is a **fully decentralized cloud platform** built on the Internet Computer Protocol (ICP). It provides AWS-equivalent services that run entirely on-chain, offering:

- 🔒 **Censorship Resistance** - No single point of failure
- 🌍 **Global Distribution** - Replicated across ICP subnets
- 💰 **Predictable Costs** - Pay with cycles, no surprise bills
- ⚡ **Web Speed** - Sub-second response times
- 🔐 **Built-in Security** - Chain-key cryptography

---

## 📦 Services

### Currently Planned

| Service | AWS Equivalent | Status |
|---------|---------------|--------|
| **LEMNIS Compute** | EC2 / Lambda | 🔜 Planned |
| **LEMNIS Storage** | S3 | 🔜 Planned |
| **LEMNIS DB** | DynamoDB / RDS | 🔜 Planned |
| **LEMNIS Identity** | IAM / Cognito | 🔜 Planned |
| **LEMNIS CDN** | CloudFront | 🔜 Planned |
| **LEMNIS Functions** | Lambda | 🔜 Planned |

---

## 🏛️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         LEMNIS PLATFORM                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
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
│   │  │ Billing  │  │   CDN    │  │Functions │  │ Metrics  │ │   │
│   │  │ Canister │  │ Canister │  │ Canister │  │ Canister │ │   │
│   │  └──────────┘  └──────────┘  └──────────┘  └──────────┘ │   │
│   │                                                          │   │
│   └─────────────────────────────────────────────────────────┘   │
│                              │                                  │
│                              ▼                                  │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │              INTERNET COMPUTER PROTOCOL                  │   │
│   │         Subnets • Nodes • Chain-Key Crypto              │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                 │
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
├── dfx.json                  # ICP canister config
└── README.md
```

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
```

---

## 📜 License

Apache 2.0 - See [LICENSE](LICENSE) for details.

---

## 🔗 Links

- [Internet Computer](https://internetcomputer.org)
- [DFINITY Developer Docs](https://internetcomputer.org/docs)
- [ICP Dashboard](https://dashboard.internetcomputer.org)

---

<p align="center">
  <strong>Built with 🌀 on the Internet Computer</strong>
</p>
