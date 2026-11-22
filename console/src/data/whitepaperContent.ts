export interface CanisterSpec {
  id: 'identity' | 'compute' | 'storage' | 'database' | 'billing';
  name: string;
  file: string;
  role: string;
  persistence: string;
  methods: Array<{ name: string; kind: 'update' | 'query'; signature: string; auth: string }>;
  hardeningFixes: string[];
}

export interface WhitepaperSection {
  id: string;
  number: string;
  title: string;
  summary: string;
  paragraphs: string[];
  bullets?: string[];
  callout?: { tone: 'emerald' | 'amber' | 'neutral'; title: string; body: string };
  table?: { headers: string[]; rows: string[][] };
  code?: { label: string; snippet: string };
}

export interface ManifestPreset {
  id: string;
  label: string;
  tagline: string;
  yaml: string;
}

export const MANIFEST_PRESETS: readonly ManifestPreset[] = [
  {
    id: 'saas-api',
    label: 'SaaS API + Egress',
    tagline: '2 vCPU / 8 GiB web API with 500 GiB internet egress and 50 GiB hybrid AWS DB traffic',
    yaml: `version: "1"
project: acme-saas-api
region: us-east
services:
  api:
    image: ghcr.io/acme/saas-api:2.4.1
    cpu: 2
    memory: 8Gi
    storage: 20Gi
    expose:
      - port: 8080
        as: 80
    env:
      NODE_ENV: production
      LOG_LEVEL: info
    today:
      aws: m7i.large
    usage:
      egress: 500Gi
      from_aws: 50Gi`,
  },
  {
    id: 'h100-inference',
    label: 'H100 LLM Inference',
    tagline: 'Production API paired with an NVIDIA H100 80GB inference worker in its own GPU placement group',
    yaml: `version: "1"
project: neural-inference
region: us-east
services:
  gateway:
    image: ghcr.io/acme/inference-gateway:1.8.0
    cpu: 2
    memory: 8Gi
    storage: 20Gi
    expose:
      - port: 8080
        as: 80
    env:
      UPSTREAM_MODE: streaming
    today:
      aws: m7i.large
    usage:
      egress: 800Gi
  vllm:
    image: vllm/vllm-openai:v0.6.4
    cpu: 8
    memory: 32Gi
    storage: 120Gi
    gpu:
      model: h100
      count: 1
    placement: gpu-h100
    expose:
      - port: 8000
        to: [gateway]`,
  },
  {
    id: 'microservices',
    label: 'Multi-Service Worker Stack',
    tagline: 'API + background queue worker + Redis cache migrating off AWS Fargate & EC2',
    yaml: `version: "1"
project: commerce-core
region: eu-west
services:
  api:
    image: ghcr.io/acme/commerce-api:3.1.2
    cpu: 4
    memory: 16Gi
    storage: 40Gi
    expose:
      - port: 3000
        as: 80
    today:
      aws: m7i.xlarge
    usage:
      egress: 1200Gi
      from_aws: 150Gi
  worker:
    image: ghcr.io/acme/commerce-worker:3.1.2
    cpu: 2
    memory: 4Gi
    storage: 15Gi
    today:
      aws: fargate`,
  },
];

export const PROTOCOL_28_CANISTERS: readonly CanisterSpec[] = [
  {
    id: 'identity',
    name: 'Identity & IAM',
    file: 'protocol-28/identity/main.mo',
    role: 'Principal registry, Organization RBAC (#owner / #developer / #viewer), and 128-bit single-use CLI link codes.',
    persistence: 'persistent actor · OrderedMap<Principal, User> + OrderedMap<OrgId, Organization>',
    methods: [
      { name: 'register', kind: 'update', signature: '() -> Result<User, Text>', auth: 'Non-anonymous' },
      { name: 'createOrganization', kind: 'update', signature: '(Text) -> Result<Organization, Text>', auth: 'Non-anonymous' },
      { name: 'setMemberRole', kind: 'update', signature: '(OrgId, Principal, Role) -> Result<Organization, Text>', auth: 'Org #owner' },
      { name: 'createLinkCode', kind: 'update', signature: '(OrgId, Role, Text) -> Result<Time, Text>', auth: 'Org #owner' },
      { name: 'redeemLinkCode', kind: 'update', signature: '(Text) -> Result<Organization, Text>', auth: 'Non-anonymous (1x)' },
      { name: 'roleOf', kind: 'query', signature: '(OrgId, Principal) -> ?Role', auth: 'Cross-canister IAM' },
      { name: 'getUserCount', kind: 'query', signature: '() -> Result<Nat, Text>', auth: 'Controller only' },
    ],
    hardeningFixes: [
      'Rejects anonymous principal (2vxsx-fae) on every mutation and private read',
      'Controller-gated getUserCount() closes user enumeration leak',
      'Prevents demoting or removing the last organization #owner',
      'Consumes 10-minute link codes atomically on first redemption',
    ],
  },
  {
    id: 'compute',
    name: 'Compute & Deployments',
    file: 'protocol-28/compute/main.mo',
    role: 'ICP instance lifecycle plus Akash container deployment registry with enforced 50% savings bid caps.',
    persistence: 'persistent actor · OrderedMap<Text, ComputeInstance> + OrderedMap<Text, Deployment>',
    methods: [
      { name: 'createInstance', kind: 'update', signature: '(Nat) -> Result<ComputeInstance, Text>', auth: 'Non-anonymous' },
      { name: 'stopInstance / startInstance / terminateInstance', kind: 'update', signature: '(Text) -> Result<(), Text>', auth: 'Owner only' },
      { name: 'requestDeployment', kind: 'update', signature: '(DeploymentRequest) -> Result<Deployment, Text>', auth: 'Non-anonymous' },
      { name: 'transitionDeployment', kind: 'update', signature: '(Text, State, ...) -> Result<Deployment, Text>', auth: 'Bridge / Controller' },
      { name: 'requestCloseDeployment', kind: 'update', signature: '(Text) -> Result<Deployment, Text>', auth: 'Owner only' },
      { name: 'listDeployments', kind: 'query', signature: '() -> [Deployment]', auth: 'Caller-scoped' },
    ],
    hardeningFixes: [
      'Enforces strict state transitions (#terminated cannot be stopped or restarted)',
      'Tracks explicitly attached cycles instead of reporting whole-canister balance',
      'Rejects Akash leases exceeding maxHourlyMicroUsd (50% bid-cap guard)',
      'Validates CPU, memory, storage, GPU, and per-owner quotas on-chain',
    ],
  },
  {
    id: 'storage',
    name: 'Storage (Control-Plane Blobs)',
    file: 'protocol-28/storage/main.mo',
    role: 'Private-by-default replicated buckets for small configs and assets (<=2 MiB/object). Bulk media uses IPFS.',
    persistence: 'persistent actor · Nested OrderedMap<BucketId, OrderedMap<ObjectKey, StorageObject>>',
    methods: [
      { name: 'createBucket', kind: 'update', signature: '(Text) -> Result<Bucket, Text>', auth: 'Non-anonymous' },
      { name: 'setBucketVisibility', kind: 'update', signature: '(BucketId, Bool) -> Result<Bucket, Text>', auth: 'Owner only' },
      { name: 'uploadObject', kind: 'update', signature: '(BucketId, Key, Blob, Text) -> Result<StorageObject, Text>', auth: 'Owner only' },
      { name: 'getObject / listObjects', kind: 'query', signature: '(BucketId, ...) -> Result<..., Text>', auth: 'Owner or Public ACL' },
      { name: 'deleteObject / deleteBucket', kind: 'update', signature: '(BucketId, ...) -> Result<(), Text>', auth: 'Owner only' },
    ],
    hardeningFixes: [
      'Nested per-bucket maps structurally eliminate bucket/key prefix collision attacks',
      'Validates DNS-safe bucket slugs ([a-z0-9-]) and rejects leading "/" or ".." keys',
      'Maintains exact objectCount and totalSize across inserts, overwrites, and deletes',
      'Enforces private-by-default ACLs and 2 MiB object / 64 MiB bucket ceilings',
    ],
  },
  {
    id: 'database',
    name: 'Key-Value Database',
    file: 'protocol-28/database/main.mo',
    role: 'Owner-isolated structured key-value tables persisted in ICP orthogonal stable memory.',
    persistence: 'persistent actor · Nested OrderedMap<TableName, OrderedMap<RecordId, Record>>',
    methods: [
      { name: 'createTable / deleteTable', kind: 'update', signature: '(TableName) -> Result<..., Text>', auth: 'Non-anonymous / Owner' },
      { name: 'insert', kind: 'update', signature: '(TableName, [(Text, Text)]) -> Result<Record, Text>', auth: 'Table owner' },
      { name: 'update / delete', kind: 'update', signature: '(TableName, RecordId, ...) -> Result<..., Text>', auth: 'Table owner' },
      { name: 'get / list / queryByField', kind: 'query', signature: '(TableName, ...) -> Result<..., Text>', auth: 'Owner or Controller' },
    ],
    hardeningFixes: [
      'Closed critical unauthenticated update() and delete() vulnerabilities',
      'Nested per-table maps eliminate cross-table prefix leakage ("app" vs "app-prod")',
      'Deduplicates queryByField matches via labeled inner-loop break',
      'Keeps Table.recordCount exact on insert and delete with bounded field limits',
    ],
  },
  {
    id: 'billing',
    name: 'Billing & Credits Ledger',
    file: 'protocol-28/billing/main.mo',
    role: 'Dual ICP cycles + prepaid micro-USD credits ledger with idempotent usage metering and audited savings.',
    persistence: 'persistent actor · OrderedMap<Principal, Account> + Idempotency Usage Ledger',
    methods: [
      { name: 'getOrCreateAccount', kind: 'update', signature: '() -> Result<Account, Text>', auth: 'Non-anonymous' },
      { name: 'deposit', kind: 'update', signature: '() -> Result<Nat, Text> (cycles)', auth: 'Non-anonymous' },
      { name: 'grantCredits', kind: 'update', signature: '(Principal, Nat, Text) -> Result<Account, Text>', auth: 'Controller only' },
      { name: 'addAuthorizedCharger', kind: 'update', signature: '(Principal) -> Result<(), Text>', auth: 'Controller only' },
      { name: 'charge / recordUsage', kind: 'update', signature: '(...) -> Result<..., Text>', auth: 'Allowlisted Chargers' },
      { name: 'getSavingsSummary', kind: 'query', signature: '() -> Result<SavingsSummary, Text>', auth: 'Caller-scoped' },
    ],
    hardeningFixes: [
      'Closed critical public charge() drain with controller-managed authorizedChargers allowlist',
      'Added idempotencyKey replay protection in recordUsage() so retries never double-charge',
      'Fixed cycle price math ($1.40 / 1T cycles) and enforced on-chain 25% markup cap',
      'Restricted getBalance(user) to account owner or canister controller',
    ],
  },
];

export const WHITEPAPER_SECTIONS: readonly WhitepaperSection[] = [
  {
    id: 'changelog',
    number: '00',
    title: 'Audit Changelog (v3.0 → v3.1)',
    summary: 'Every factual, economic, architectural, and security correction applied during the November 2026 audit.',
    paragraphs: [
      'Version 3.1 reconciles the LEMNIS whitepaper with verified November 2026 cloud market prices and the hardened Protocol 28 Motoko codebase. Rather than inflating savings with inaccurate hyperscaler baselines, every figure is traceable and conservative.',
    ],
    bullets: [
      'Corrected AWS S3 Standard 100 GB storage baseline from an erroneous $25/mo to $2.30/mo ($0.023/GB-mo) and explicitly disclosed that ICP on-chain storage (~$44.60/mo per 100 GB) is ~19x more expensive than S3.',
      'Corrected Akash compute unit rates ($0.018/vCPU-hr + $0.009/GB-hr previously exceeded AWS m7i.large) to calibrated reverse-auction estimates (~$0.005/vCPU-hr + ~$0.002/GB-hr), clearly flagged as estimates until confirmed by live bids.',
      'Updated H100 pricing to post-June-2025 AWS on-demand ($6.88/GPU-hr) vs Akash ($1.45-$2.73/GPU-hr) and added mandatory 3-year AWS Savings Plan (~$3.10/GPU-hr) and hybrid AWS data-gravity (from_aws) disclosures.',
      'Fixed a 1,000x cycle allowance typo in pricing tiers (100M cycles is $0.00014; corrected to 100B / 5T / 20T / 100T cycles).',
      'Fixed inaccurate blockchain comparison (Solana/L2s do persist state; ICP differentiates on large low-cost orthogonal memory, native HTTP serving, HTTPS outcalls, timers, reverse gas, and Chain-Key ECDSA).',
      'Renamed legacy "Nexus Resource Name (NRN)" to LEMNIS Resource Name (LRN), added the ICP-to-Akash Bridge & Chain-Key path, documented the ICP/Akash confidentiality threat model, and added ICP SNS governance safeguards.',
    ],
  },
  {
    id: 'overview',
    number: '01',
    title: 'Executive Overview & Two-Plane Architecture',
    summary: 'Combining an Internet Computer control plane with Akash Network container and GPU compute.',
    paragraphs: [
      'LEMNIS is built for engineering teams whose AWS/GCP/Azure bill has outgrown their budget without the predictability to sign 3-year hyperscaler lock-in contracts. Customers keep their existing Docker images and deploy with one manifest (lemnis.yaml).',
      'Instead of forcing every workload onto a single network, LEMNIS matches each layer to the infrastructure where it mathematically wins: ICP (Protocol 28) runs the replicated, tamper-proof control plane (IAM, deployment registry, prepaid USD/cycles ledger), while Akash Network runs stateless Docker APIs, workers, and H100/A100 GPU inference at 50-75% below AWS on-demand.',
    ],
    table: {
      headers: ['Layer', 'Infrastructure', 'Why It Belongs Here'],
      rows: [
        ['Control Plane (Protocol 28)', 'Internet Computer (ICP)', 'Orthogonal persistent state, reverse gas, certified web hosting, Chain-Key signing'],
        ['Container & GPU Compute', 'Akash Network', '60-75% cheaper CPU containers, 52-68% cheaper H100 GPUs vs AWS on-demand, $0 egress markup'],
        ['Bulk Object Storage (Q2)', 'IPFS / Storacha / Arweave', '$0.05/GB-mo pinned storage with zero AWS $0.09/GB egress tax'],
      ],
    },
  },
  {
    id: 'compute-bridge',
    number: '02',
    title: 'Compute, 50% Bid Caps & ICP-to-Akash Bridge',
    summary: 'How on-chain deployment intent reconciles into live Akash leases without ever exceeding half the AWS baseline.',
    paragraphs: [
      'Every deployment submitted to protocol-28/compute/main.mo carries both its matched AWS on-demand baseline (awsHourlyMicroUsd) and an enforced maximum bid cap (maxHourlyMicroUsd = 50% of AWS baseline by default). Both the off-chain bridge and the canister transitionDeployment() function reject any lease above that ceiling.',
      'Phase 1 operates a stateless off-chain akash-bridge holding the operator Akash API key or managed wallet behind a pluggable AkashClient interface. Because all state lives in Protocol 28 canisters, the bridge can crash and resume cleanly, runs hourly idempotent metering, caps escrow runway to 24h, and sweeps orphaned deployments.',
      'Phase 2 replaces operator key custody with native ICP Chain-Key ECDSA (sign_with_ecdsa) + HTTPS Outcalls so Protocol 28 canisters sign Cosmos/Akash lease transactions directly on-chain.',
    ],
    callout: {
      tone: 'emerald',
      title: 'Enforced Savings Promise',
      body: 'If no Akash provider submits a bid under maxHourlyMicroUsd during the bid window, LEMNIS transitions the deployment to #failed with the best bid seen rather than silently charging above 50% of AWS.',
    },
  },
  {
    id: 'pricing',
    number: '03',
    title: 'Verified Economics & Pricing Honesty',
    summary: 'November 2026 us-east-1 AWS on-demand baselines, micro-USD accounting, and full disclosure of where AWS still wins.',
    paragraphs: [
      'All on-chain USD balances and usage records are denominated in integer micro-USD (1 USD = 1,000,000) to avoid floating-point drift. LEMNIS applies a configurable platform markup defaulting to 20% and strictly capped at 25% (2500 bps) inside protocol-28/billing/main.mo.',
    ],
    table: {
      headers: ['Monthly Workload (730 hrs)', 'AWS On-Demand', 'LEMNIS (incl. 20%)', 'Savings', 'Honesty Note'],
      rows: [
        ['API Server (2 vCPU / 8 GiB / 20 GiB)', '$75.18 (m7i.large + gp3)', '~$23.16*', '~69%', '*Estimate until live provider bid settles'],
        ['API + 500 GiB Internet Egress', '$111.18 (+$36 egress)', '~$23.16*', '~79%', 'Bandwidth included in Akash provider bid'],
        ['H100 GPU (100 hrs/mo)', '$688.00 ($6.88/hr)', '~$288.00 ($2.88/hr)', '~58%', '3-yr AWS Savings Plan (~$3.10/hr) narrows gap'],
        ['100 GB Bulk Storage (low egress)', '$2.30 (S3 Standard)', '$5.00 IPFS / $44.60 ICP', 'AWS wins', 'ICP storage is NOT marketed as an S3 replacement'],
      ],
    },
    callout: {
      tone: 'amber',
      title: 'Hybrid Data Gravity (from_aws)',
      body: 'If your Akash container still pulls data from an AWS RDS database or S3 bucket, AWS charges $0.09/GB egress. LEMNIS explicitly counts usage.from_aws in the LEMNIS cost column so hidden hyperscaler bills never distort your savings estimate.',
    },
  },
  {
    id: 'security',
    number: '04',
    title: 'Security Posture & Confidentiality Threat Model',
    summary: 'Hardened Protocol 28 isolation controls plus explicit boundaries around canister and container confidentiality.',
    paragraphs: [
      'During the November 2026 audit, critical vulnerabilities across all five original canisters were identified and patched: public billing.charge() drains, unauthenticated database update()/delete(), cross-bucket path traversal via flat string keys, cross-table prefix collisions, public reads of private data, missing anonymous-principal checks, and stale counters.',
      'Equally important is confidentiality honesty: ICP subnet node providers can inspect canister memory, and Akash compute providers can inspect container environment variables. Plaintext customer secrets MUST NEVER be placed in lemnis.yaml or canister state. Production secrets use external KMS/Vault over mTLS today and ICP vetKD threshold encryption + TEE providers in Phase 2.',
    ],
    code: {
      label: 'LEMNIS Resource Name (LRN) Grammar — Corrected from v3.0 NRN',
      snippet: `lrn:{partition}:{service}:{region}:{org-id}:{resource-type}/{resource-id}

lrn:lemnis:compute:us-east:org-0:deployment/dep-14
lrn:lemnis:storage:icp-mainnet:org-0:bucket/app-config
lrn:lemnis:database:icp-mainnet:org-0:table/feature_flags`,
    },
  },
  {
    id: 'governance',
    number: '05',
    title: 'Progressive ICP SNS DAO Governance',
    summary: 'Controller-operated MVP with auditable on-chain guardrails transitioning to SNS neuron governance post-PMF.',
    paragraphs: [
      'No token launches until product-market fit is verified. During MVP, Protocol 28 enforces transparent on-chain guardrails — billing.listAuthorizedChargers() is publicly auditable and markup is code-capped at 25%.',
      'Post-PMF, canister controller authority transfers to an Internet Computer Service Nervous System (SNS) DAO. Protocol upgrades require 66% neuron approval with a 7-day timelock and reproducible Wasm SHA-256 verification. Emergency 7-of-11 Security Council pauses require 48-hour community ratification and carry an automatic 7-day sunset clause.',
    ],
    table: {
      headers: ['Proposal Class', 'Quorum', 'Approval', 'Timelock', 'Anti-Capture Guard'],
      rows: [
        ['Parameter Change', '5%', '50% + 1', '24 hours', 'On-chain 25% markup ceiling'],
        ['Canister Wasm Upgrade', '10%', '66%', '7 days', 'Reproducible Wasm hash verification'],
        ['Emergency Security Pause', 'Council', '7-of-11', 'Immediate', '48h ratification + 7-day auto-sunset'],
        ['Treasury Allocation', '10%', '60%', '48 hours', '<= 5% treasury cap per quarter'],
      ],
    },
  },
];
