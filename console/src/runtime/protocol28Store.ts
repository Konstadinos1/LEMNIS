/**
 * Protocol 28 Runtime State Machine
 * Faithful client-side behavioral mirror of all five hardened Motoko canisters
 * (identity, compute, storage, database, billing) persisted in localStorage,
 * plus live ICP replica connectivity probing via @lemnis/sdk.
 */

import {
  DEFAULT_MARKUP_PERCENT,
  HOURS_PER_MONTH,
  MAX_MARKUP_PERCENT,
  estimateProjectSavings,
  parseLemnisYaml,
  parseSizeToMiB,
  usdToMicroUsd,
} from '@lemnis/sdk';

export const ANONYMOUS_PRINCIPAL = '2vxsx-fae';

export interface Persona {
  id: string;
  label: string;
  principal: string;
  isController: boolean;
  isAnonymous: boolean;
  description: string;
}

export const DEMO_PERSONAS: readonly Persona[] = [
  {
    id: 'controller',
    label: 'Owner / Controller',
    principal: 'k47ab-7qaaa-aaaaa-qaac4-cai',
    isController: true,
    isAnonymous: false,
    description: 'Authenticated Internet Identity principal with canister controller rights',
  },
  {
    id: 'developer',
    label: 'Developer Teammate',
    principal: 'm82xy-3iaaa-aaaaa-qaadq-cai',
    isController: false,
    isAnonymous: false,
    description: 'Non-controller teammate principal (can deploy and redeem org link codes)',
  },
  {
    id: 'attacker',
    label: 'External User (Untrusted)',
    principal: 'z99zz-6yaaa-aaaaa-qaaeq-cai',
    isController: false,
    isAnonymous: false,
    description: 'Separate tenant principal — useful for verifying isolation and authorization guards',
  },
  {
    id: 'anonymous',
    label: 'Anonymous (2vxsx-fae)',
    principal: ANONYMOUS_PRINCIPAL,
    isController: false,
    isAnonymous: true,
    description: 'Unauthenticated ICP principal — blocked by all Protocol 28 mutations & private reads',
  },
];

export type Role = 'owner' | 'developer' | 'viewer';
export type InstanceStatus = 'running' | 'stopped' | 'terminated';
export type DeploymentState = 'pending' | 'creating' | 'active' | 'updating' | 'closing' | 'closed' | 'failed';

export interface UserProfile {
  id: string;
  email: string | null;
  projects: string[];
  createdAt: number;
}

export interface OrganizationRecord {
  id: string;
  name: string;
  owner: string;
  members: Array<{ principal: string; role: Role }>;
  createdAt: number;
}

export interface LinkCodeEntry {
  code: string;
  orgId: string;
  role: Role;
  createdBy: string;
  expiresAt: number;
}

export interface ComputeInstanceRecord {
  id: string;
  owner: string;
  status: InstanceStatus;
  memoryBytes: number;
  cyclesBalance: number;
  createdAt: number;
  updatedAt: number;
}

export interface DeploymentRecord {
  id: string;
  project: string;
  service: string;
  owner: string;
  target: 'akash' | 'icp';
  image: string;
  cpuMilli: number;
  memoryMiB: number;
  storageMiB: number;
  gpuCount: number;
  region: string;
  awsHourlyMicroUsd: number;
  maxHourlyMicroUsd: number;
  actualHourlyMicroUsd: number | null;
  providerUri: string | null;
  providerName: string | null;
  dseq: string | null;
  state: DeploymentState;
  lastError: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface StorageObjectRecord {
  key: string;
  content: string;
  contentType: string;
  size: number;
  owner: string;
  createdAt: number;
  updatedAt: number;
}

export interface BucketRecord {
  id: string;
  owner: string;
  isPublic: boolean;
  objectCount: number;
  totalSize: number;
  createdAt: number;
  objects: Record<string, StorageObjectRecord>;
}

export interface DbRecordEntry {
  id: string;
  data: Array<[string, string]>;
  createdAt: number;
  updatedAt: number;
}

export interface DbTableRecord {
  name: string;
  owner: string;
  recordCount: number;
  nextCounter: number;
  createdAt: number;
  records: Record<string, DbRecordEntry>;
}

export interface BillingAccountRecord {
  owner: string;
  balanceCycles: number;
  totalDepositedCycles: number;
  totalSpentCycles: number;
  creditsMicroUsd: number;
  grantedMicroUsd: number;
  spentMicroUsd: number;
  awsEquivalentMicroUsd: number;
  createdAt: number;
}

export interface UsageLedgerRecord {
  idempotencyKey: string;
  owner: string;
  service: string;
  cyclesCharged: number;
  akashCostMicroUsd: number;
  chargedMicroUsd: number;
  awsEquivalentMicroUsd: number;
  timestamp: number;
}

export interface Protocol28State {
  users: Record<string, UserProfile>;
  organizations: Record<string, OrganizationRecord>;
  linkCodes: Record<string, LinkCodeEntry>;
  orgCounter: number;
  instances: Record<string, ComputeInstanceRecord>;
  instanceCounter: number;
  deployments: Record<string, DeploymentRecord>;
  deploymentCounter: number;
  buckets: Record<string, BucketRecord>;
  tables: Record<string, DbTableRecord>;
  accounts: Record<string, BillingAccountRecord>;
  authorizedChargers: string[];
  usageKeys: Record<string, UsageLedgerRecord>;
  usageHistory: Record<string, UsageLedgerRecord[]>;
  markupBps: number;
  microUsdPerTrillionCycles: number;
}

export type OpResult<T> = { ok: true; value: T } | { ok: false; error: string };

const STORAGE_KEY = 'lemnis_protocol28_state_v1';
const BUCKET_SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])$/;
const TABLE_NAME_RE = /^[a-z0-9_-]{3,63}$/;
const MIN_MEMORY_BYTES = 67_108_864;
const MAX_MEMORY_BYTES = 68_719_476_736;
const MAX_OBJECT_BYTES = 2_097_152;
const LINK_CODE_TTL_MS = 10 * 60 * 1_000;

export function createInitialProtocol28State(): Protocol28State {
  const now = Date.now();
  const owner = DEMO_PERSONAS[0].principal;
  const dev = DEMO_PERSONAS[1].principal;

  return {
    users: {
      [owner]: {
        id: owner,
        email: 'ops@lemnis.cloud',
        projects: ['acme-saas-api', 'neural-inference'],
        createdAt: now - 86_400_000 * 14,
      },
    },
    organizations: {
      'org-0': {
        id: 'org-0',
        name: 'Acme Cloud Ops',
        owner,
        members: [
          { principal: owner, role: 'owner' },
          { principal: dev, role: 'developer' },
        ],
        createdAt: now - 86_400_000 * 14,
      },
    },
    linkCodes: {},
    orgCounter: 1,
    instances: {
      'compute-0': {
        id: 'compute-0',
        owner,
        status: 'running',
        memoryBytes: 536_870_912, // 512 MiB
        cyclesBalance: 4_500_000_000_000,
        createdAt: now - 86_400_000 * 6,
        updatedAt: now - 86_400_000 * 2,
      },
    },
    instanceCounter: 1,
    deployments: {
      'dep-0': {
        id: 'dep-0',
        project: 'acme-saas-api',
        service: 'api',
        owner,
        target: 'akash',
        image: 'ghcr.io/acme/saas-api:2.4.1',
        cpuMilli: 2000,
        memoryMiB: 8192,
        storageMiB: 20480,
        gpuCount: 0,
        region: 'us-east',
        awsHourlyMicroUsd: 102_986,     // ~$75.18/mo (m7i.large + 20Gi gp3)
        maxHourlyMicroUsd: 51_493,      // 50% cap
        actualHourlyMicroUsd: 31_726,   // ~$23.16/mo settled (69% saved!)
        providerUri: 'https://api-dseq19402.provider.us-east.akash.pub',
        providerName: 'provider.d3akash.cloud (audited · us-east)',
        dseq: '19402841',
        state: 'active',
        lastError: null,
        createdAt: now - 86_400_000 * 9,
        updatedAt: now - 3_600_000 * 2,
      },
      'dep-1': {
        id: 'dep-1',
        project: 'neural-inference',
        service: 'vllm',
        owner,
        target: 'akash',
        image: 'vllm/vllm-openai:v0.6.4',
        cpuMilli: 8000,
        memoryMiB: 32768,
        storageMiB: 122880,
        gpuCount: 1,
        region: 'us-east',
        awsHourlyMicroUsd: 6_893_150,   // ~$5,032/mo (1x H100 + disk)
        maxHourlyMicroUsd: 3_446_575,
        actualHourlyMicroUsd: 2_880_000, // $2.88/hr incl. 20% markup (58% saved)
        providerUri: 'https://vllm-dseq19409.gpu.us-east.akash.pub',
        providerName: 'provider.europlots.akash (audited · H100)',
        dseq: '19409112',
        state: 'active',
        lastError: null,
        createdAt: now - 86_400_000 * 3,
        updatedAt: now - 3_600_000,
      },
    },
    deploymentCounter: 2,
    buckets: {
      'app-config': {
        id: 'app-config',
        owner,
        isPublic: false,
        objectCount: 1,
        totalSize: 138,
        createdAt: now - 86_400_000 * 10,
        objects: {
          'routes.json': {
            key: 'routes.json',
            content: '{\n  "version": "1.2",\n  "regions": ["us-east", "eu-west"],\n  "bidCapRatio": 0.5,\n  "requirePinnedImages": true\n}',
            contentType: 'application/json',
            size: 138,
            owner,
            createdAt: now - 86_400_000 * 5,
            updatedAt: now - 86_400_000 * 5,
          },
        },
      },
    },
    tables: {
      feature_flags: {
        name: 'feature_flags',
        owner,
        recordCount: 2,
        nextCounter: 2,
        createdAt: now - 86_400_000 * 8,
        records: {
          'rec-0': {
            id: 'rec-0',
            data: [
              ['flag', 'enforce_50pct_bid_cap'],
              ['enabled', 'true'],
              ['env', 'production'],
            ],
            createdAt: now - 86_400_000 * 7,
            updatedAt: now - 86_400_000 * 7,
          },
          'rec-1': {
            id: 'rec-1',
            data: [
              ['flag', 'chain_key_ecdsa_pilot'],
              ['enabled', 'false'],
              ['env', 'staging'],
            ],
            createdAt: now - 86_400_000 * 4,
            updatedAt: now - 86_400_000 * 4,
          },
        },
      },
    },
    accounts: {
      [owner]: {
        owner,
        balanceCycles: 12_400_000_000_000, // 12.4T cycles
        totalDepositedCycles: 15_000_000_000_000,
        totalSpentCycles: 2_600_000_000_000,
        creditsMicroUsd: 412_500_000,      // $412.50 remaining
        grantedMicroUsd: 600_000_000,      // $600.00 granted
        spentMicroUsd: 187_500_000,        // $187.50 spent
        awsEquivalentMicroUsd: 438_200_000, // $438.20 AWS equiv (~57% saved)
        createdAt: now - 86_400_000 * 14,
      },
    },
    authorizedChargers: ['rrkah-fqaaa-aaaaa-aaaaq-cai'], // compute canister principal
    usageKeys: {},
    usageHistory: {
      [owner]: [
        {
          idempotencyKey: 'dep-0:2026-11-22T20:00Z',
          owner,
          service: 'acme-saas-api/api (Akash 24h)',
          cyclesCharged: 0,
          akashCostMicroUsd: 634_520,
          chargedMicroUsd: 761_424,
          awsEquivalentMicroUsd: 2_471_664,
          timestamp: now - 7_200_000,
        },
        {
          idempotencyKey: 'dep-1:2026-11-22T21:00Z',
          owner,
          service: 'neural-inference/vllm (Akash H100 1h)',
          cyclesCharged: 0,
          akashCostMicroUsd: 2_400_000,
          chargedMicroUsd: 2_880_000,
          awsEquivalentMicroUsd: 6_893_150,
          timestamp: now - 3_600_000,
        },
      ],
    },
    markupBps: DEFAULT_MARKUP_PERCENT * 100, // 2000 bps = 20%
    microUsdPerTrillionCycles: 1_400_000,    // $1.40 / 1T cycles
  };
}

export function loadProtocol28State(): Protocol28State {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createInitialProtocol28State();
    return JSON.parse(raw) as Protocol28State;
  } catch {
    return createInitialProtocol28State();
  }
}

export function saveProtocol28State(state: Protocol28State): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore quota errors in private browsing mode
  }
}

export function resetProtocol28State(): Protocol28State {
  const fresh = createInitialProtocol28State();
  saveProtocol28State(fresh);
  return fresh;
}

// --- Pure Protocol 28 Canister Operations ---

export function isAnonymousCaller(persona: Persona): boolean {
  return persona.isAnonymous || persona.principal === ANONYMOUS_PRINCIPAL;
}

export function opRegisterUser(state: Protocol28State, caller: Persona): OpResult<{ state: Protocol28State; user: UserProfile }> {
  if (isAnonymousCaller(caller)) return { ok: false, error: 'Anonymous principal is not permitted' };
  const existing = state.users[caller.principal];
  if (existing) return { ok: true, value: { state, user: existing } };
  const user: UserProfile = { id: caller.principal, email: null, projects: [], createdAt: Date.now() };
  return { ok: true, value: { state: { ...state, users: { ...state.users, [caller.principal]: user } }, user } };
}

export function opCreateOrganization(
  state: Protocol28State,
  caller: Persona,
  name: string,
): OpResult<{ state: Protocol28State; org: OrganizationRecord }> {
  if (isAnonymousCaller(caller)) return { ok: false, error: 'Anonymous principal is not permitted' };
  const trimmed = name.trim();
  if (trimmed.length < 2 || trimmed.length > 64) return { ok: false, error: 'Organization name must be 2-64 characters' };
  const id = `org-${state.orgCounter}`;
  const org: OrganizationRecord = {
    id,
    name: trimmed,
    owner: caller.principal,
    members: [{ principal: caller.principal, role: 'owner' }],
    createdAt: Date.now(),
  };
  return {
    ok: true,
    value: {
      state: {
        ...state,
        orgCounter: state.orgCounter + 1,
        organizations: { ...state.organizations, [id]: org },
      },
      org,
    },
  };
}

export function opCreateLinkCode(
  state: Protocol28State,
  caller: Persona,
  orgId: string,
  role: Role,
): OpResult<{ state: Protocol28State; entry: LinkCodeEntry }> {
  if (isAnonymousCaller(caller)) return { ok: false, error: 'Anonymous principal is not permitted' };
  const org = state.organizations[orgId];
  if (!org) return { ok: false, error: 'Organization not found' };
  const isOwner = org.members.some((m) => m.principal === caller.principal && m.role === 'owner');
  if (!isOwner) return { ok: false, error: 'Not authorized' };

  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const code = `lmn_${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
  const entry: LinkCodeEntry = {
    code,
    orgId,
    role,
    createdBy: caller.principal,
    expiresAt: Date.now() + LINK_CODE_TTL_MS,
  };
  return {
    ok: true,
    value: { state: { ...state, linkCodes: { ...state.linkCodes, [code]: entry } }, entry },
  };
}

export function opRedeemLinkCode(
  state: Protocol28State,
  caller: Persona,
  code: string,
): OpResult<{ state: Protocol28State; org: OrganizationRecord }> {
  if (isAnonymousCaller(caller)) return { ok: false, error: 'Anonymous principal is not permitted' };
  const entry = state.linkCodes[code.trim()];
  if (!entry) return { ok: false, error: 'Invalid or expired link code' };
  const nextCodes = { ...state.linkCodes };
  delete nextCodes[code.trim()];
  if (Date.now() > entry.expiresAt) {
    return { ok: false, error: 'Invalid or expired link code' };
  }
  const org = state.organizations[entry.orgId];
  if (!org) return { ok: false, error: 'Organization not found' };
  const alreadyMember = org.members.some((m) => m.principal === caller.principal);
  const updatedOrg: OrganizationRecord = alreadyMember
    ? org
    : { ...org, members: [...org.members, { principal: caller.principal, role: entry.role }] };

  return {
    ok: true,
    value: {
      state: {
        ...state,
        linkCodes: nextCodes,
        organizations: { ...state.organizations, [org.id]: updatedOrg },
      },
      org: updatedOrg,
    },
  };
}

export function opCreateInstance(
  state: Protocol28State,
  caller: Persona,
  memoryBytes: number,
  attachedCycles: number,
): OpResult<{ state: Protocol28State; instance: ComputeInstanceRecord }> {
  if (isAnonymousCaller(caller)) return { ok: false, error: 'Anonymous principal is not permitted' };
  if (memoryBytes < MIN_MEMORY_BYTES || memoryBytes > MAX_MEMORY_BYTES) {
    return { ok: false, error: 'Memory must be between 64 MiB and 64 GiB' };
  }
  const id = `compute-${state.instanceCounter}`;
  const now = Date.now();
  const instance: ComputeInstanceRecord = {
    id,
    owner: caller.principal,
    status: 'running',
    memoryBytes,
    cyclesBalance: Math.max(0, attachedCycles),
    createdAt: now,
    updatedAt: now,
  };
  return {
    ok: true,
    value: {
      state: {
        ...state,
        instanceCounter: state.instanceCounter + 1,
        instances: { ...state.instances, [id]: instance },
      },
      instance,
    },
  };
}

export function opMutateInstance(
  state: Protocol28State,
  caller: Persona,
  id: string,
  action: 'stop' | 'start' | 'terminate',
): OpResult<{ state: Protocol28State; instance: ComputeInstanceRecord }> {
  if (isAnonymousCaller(caller)) return { ok: false, error: 'Anonymous principal is not permitted' };
  const inst = state.instances[id];
  if (!inst) return { ok: false, error: 'Instance not found' };
  if (inst.owner !== caller.principal) return { ok: false, error: 'Not authorized' };

  if (action === 'stop') {
    if (inst.status === 'stopped') return { ok: false, error: 'Instance is already stopped' };
    if (inst.status === 'terminated') return { ok: false, error: 'Cannot stop a terminated instance' };
  }
  if (action === 'start') {
    if (inst.status === 'running') return { ok: false, error: 'Instance is already running' };
    if (inst.status === 'terminated') return { ok: false, error: 'Cannot restart a terminated instance' };
  }
  if (action === 'terminate' && inst.status === 'terminated') {
    return { ok: false, error: 'Instance is already terminated' };
  }

  const nextStatus: InstanceStatus = action === 'stop' ? 'stopped' : action === 'start' ? 'running' : 'terminated';
  const updated: ComputeInstanceRecord = { ...inst, status: nextStatus, updatedAt: Date.now() };
  return {
    ok: true,
    value: { state: { ...state, instances: { ...state.instances, [id]: updated } }, instance: updated },
  };
}

export function opDeployFromManifest(
  state: Protocol28State,
  caller: Persona,
  yamlText: string,
  simulateBidAboveCap = false,
): OpResult<{ state: Protocol28State; created: DeploymentRecord[] }> {
  if (isAnonymousCaller(caller)) return { ok: false, error: 'Anonymous principal is not permitted' };
  let parsed;
  try {
    parsed = parseLemnisYaml(yamlText);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  const markupPct = state.markupBps / 100;
  const estimate = estimateProjectSavings(parsed.manifest, markupPct);
  const now = Date.now();
  let counter = state.deploymentCounter;
  const nextDeployments = { ...state.deployments };
  const created: DeploymentRecord[] = [];

  for (const line of estimate.services) {
    const svc = parsed.manifest.services[line.service];
    const id = `dep-${counter}`;
    counter += 1;
    const awsHourlyMicro = Number(usdToMicroUsd(line.awsMonthlyUsd / HOURS_PER_MONTH));
    const maxHourlyMicro = Number(usdToMicroUsd(line.bidCapHourlyUsd));
    const settledHourlyMicro = simulateBidAboveCap
      ? Math.round(maxHourlyMicro * 1.18)
      : Number(usdToMicroUsd(line.lemnisMonthlyUsd / HOURS_PER_MONTH));

    const exceeded = settledHourlyMicro > maxHourlyMicro;
    const dseq = String(19_410_000 + counter * 37);
    const region = parsed.manifest.region ?? 'us-east';
    const dep: DeploymentRecord = {
      id,
      project: parsed.manifest.project,
      service: line.service,
      owner: caller.principal,
      target: 'akash',
      image: svc.image,
      cpuMilli: Math.round(svc.cpu * 1000),
      memoryMiB: parseSizeToMiB(svc.memory),
      storageMiB: parseSizeToMiB(svc.storage),
      gpuCount: svc.gpu?.count ?? 0,
      region,
      awsHourlyMicroUsd: awsHourlyMicro,
      maxHourlyMicroUsd: maxHourlyMicro,
      actualHourlyMicroUsd: exceeded ? null : settledHourlyMicro,
      providerUri: exceeded ? null : `https://${line.service}-${dseq}.provider.${region}.akash.pub`,
      providerName: exceeded ? null : `provider.lemnis-${region}.akash (audited)`,
      dseq: exceeded ? null : dseq,
      state: exceeded ? 'failed' : 'active',
      lastError: exceeded
        ? `Provider lease rate exceeds deployment bid cap (best bid $${((settledHourlyMicro * HOURS_PER_MONTH) / 1e6).toFixed(2)}/mo > limit $${line.bidCapMonthlyUsd.toFixed(2)}/mo)`
        : null,
      createdAt: now,
      updatedAt: now,
    };
    nextDeployments[id] = dep;
    created.push(dep);
  }

  return {
    ok: true,
    value: {
      state: { ...state, deploymentCounter: counter, deployments: nextDeployments },
      created,
    },
  };
}

export function opCloseDeployment(
  state: Protocol28State,
  caller: Persona,
  id: string,
): OpResult<{ state: Protocol28State; deployment: DeploymentRecord }> {
  if (isAnonymousCaller(caller)) return { ok: false, error: 'Anonymous principal is not permitted' };
  const dep = state.deployments[id];
  if (!dep) return { ok: false, error: 'Deployment not found' };
  if (dep.owner !== caller.principal) return { ok: false, error: 'Not authorized' };
  if (dep.state === 'closed' || dep.state === 'failed') return { ok: false, error: 'Deployment is already finalized' };

  const updated: DeploymentRecord = { ...dep, state: 'closed', updatedAt: Date.now() };
  return {
    ok: true,
    value: { state: { ...state, deployments: { ...state.deployments, [id]: updated } }, deployment: updated },
  };
}

export function opCreateBucket(
  state: Protocol28State,
  caller: Persona,
  name: string,
): OpResult<{ state: Protocol28State; bucket: BucketRecord }> {
  if (isAnonymousCaller(caller)) return { ok: false, error: 'Anonymous principal is not permitted' };
  if (!BUCKET_SLUG_RE.test(name)) {
    return { ok: false, error: 'Bucket name must be 3-63 lowercase alphanumeric chars or hyphens (no "/")' };
  }
  if (state.buckets[name]) return { ok: false, error: 'Bucket already exists' };
  const bucket: BucketRecord = {
    id: name,
    owner: caller.principal,
    isPublic: false,
    objectCount: 0,
    totalSize: 0,
    createdAt: Date.now(),
    objects: {},
  };
  return {
    ok: true,
    value: { state: { ...state, buckets: { ...state.buckets, [name]: bucket } }, bucket },
  };
}

export function opToggleBucketVisibility(
  state: Protocol28State,
  caller: Persona,
  bucketId: string,
  isPublic: boolean,
): OpResult<{ state: Protocol28State; bucket: BucketRecord }> {
  if (isAnonymousCaller(caller)) return { ok: false, error: 'Anonymous principal is not permitted' };
  const bucket = state.buckets[bucketId];
  if (!bucket) return { ok: false, error: 'Bucket not found' };
  if (bucket.owner !== caller.principal) return { ok: false, error: 'Not authorized' };
  const updated: BucketRecord = { ...bucket, isPublic };
  return { ok: true, value: { state: { ...state, buckets: { ...state.buckets, [bucketId]: updated } }, bucket: updated } };
}

export function opUploadObject(
  state: Protocol28State,
  caller: Persona,
  bucketId: string,
  key: string,
  content: string,
  contentType: string,
): OpResult<{ state: Protocol28State; object: StorageObjectRecord }> {
  if (isAnonymousCaller(caller)) return { ok: false, error: 'Anonymous principal is not permitted' };
  if (!key || key.length > 256 || key.startsWith('/') || key.includes('..')) {
    return { ok: false, error: 'Object key must be 1-256 chars without leading "/" or ".." segments' };
  }
  const bucket = state.buckets[bucketId];
  if (!bucket) return { ok: false, error: 'Bucket not found' };
  if (bucket.owner !== caller.principal) return { ok: false, error: 'Not authorized' };

  const size = new TextEncoder().encode(content).byteLength;
  if (size > MAX_OBJECT_BYTES) return { ok: false, error: 'Object exceeds 2 MiB maximum size' };

  const existing = bucket.objects[key];
  const now = Date.now();
  const obj: StorageObjectRecord = {
    key,
    content,
    contentType: contentType || 'text/plain',
    size,
    owner: caller.principal,
    createdAt: existing ? existing.createdAt : now,
    updatedAt: now,
  };
  const nextCount = existing ? bucket.objectCount : bucket.objectCount + 1;
  const nextSize = existing ? Math.max(0, bucket.totalSize - existing.size) + size : bucket.totalSize + size;

  const updatedBucket: BucketRecord = {
    ...bucket,
    objectCount: nextCount,
    totalSize: nextSize,
    objects: { ...bucket.objects, [key]: obj },
  };
  return {
    ok: true,
    value: { state: { ...state, buckets: { ...state.buckets, [bucketId]: updatedBucket } }, object: obj },
  };
}

export function opDeleteObject(
  state: Protocol28State,
  caller: Persona,
  bucketId: string,
  key: string,
): OpResult<Protocol28State> {
  if (isAnonymousCaller(caller)) return { ok: false, error: 'Anonymous principal is not permitted' };
  const bucket = state.buckets[bucketId];
  if (!bucket) return { ok: false, error: 'Bucket not found' };
  if (bucket.owner !== caller.principal) return { ok: false, error: 'Not authorized' };
  const obj = bucket.objects[key];
  if (!obj) return { ok: false, error: 'Object not found' };

  const nextObjects = { ...bucket.objects };
  delete nextObjects[key];
  const updatedBucket: BucketRecord = {
    ...bucket,
    objectCount: Math.max(0, bucket.objectCount - 1),
    totalSize: Math.max(0, bucket.totalSize - obj.size),
    objects: nextObjects,
  };
  return { ok: true, value: { ...state, buckets: { ...state.buckets, [bucketId]: updatedBucket } } };
}

export function opCreateTable(
  state: Protocol28State,
  caller: Persona,
  name: string,
): OpResult<{ state: Protocol28State; table: DbTableRecord }> {
  if (isAnonymousCaller(caller)) return { ok: false, error: 'Anonymous principal is not permitted' };
  if (!TABLE_NAME_RE.test(name)) {
    return { ok: false, error: 'Table name must be 3-63 lowercase alphanumeric chars, "_" or "-"' };
  }
  if (state.tables[name]) return { ok: false, error: 'Table already exists' };
  const table: DbTableRecord = {
    name,
    owner: caller.principal,
    recordCount: 0,
    nextCounter: 0,
    createdAt: Date.now(),
    records: {},
  };
  return { ok: true, value: { state: { ...state, tables: { ...state.tables, [name]: table } }, table } };
}

export function opInsertRecord(
  state: Protocol28State,
  caller: Persona,
  tableName: string,
  data: Array<[string, string]>,
): OpResult<{ state: Protocol28State; record: DbRecordEntry }> {
  if (isAnonymousCaller(caller)) return { ok: false, error: 'Anonymous principal is not permitted' };
  const table = state.tables[tableName];
  if (!table) return { ok: false, error: 'Table not found' };
  if (table.owner !== caller.principal) return { ok: false, error: 'Not authorized' };
  if (data.length === 0) return { ok: false, error: 'At least one key-value pair is required' };

  const id = `rec-${table.nextCounter}`;
  const now = Date.now();
  const record: DbRecordEntry = { id, data, createdAt: now, updatedAt: now };
  const updated: DbTableRecord = {
    ...table,
    recordCount: table.recordCount + 1,
    nextCounter: table.nextCounter + 1,
    records: { ...table.records, [id]: record },
  };
  return { ok: true, value: { state: { ...state, tables: { ...state.tables, [tableName]: updated } }, record } };
}

export function opUpdateRecord(
  state: Protocol28State,
  caller: Persona,
  tableName: string,
  recordId: string,
  data: Array<[string, string]>,
): OpResult<{ state: Protocol28State; record: DbRecordEntry }> {
  if (isAnonymousCaller(caller)) return { ok: false, error: 'Anonymous principal is not permitted' };
  const table = state.tables[tableName];
  if (!table) return { ok: false, error: 'Table not found' };
  if (table.owner !== caller.principal) return { ok: false, error: 'Not authorized' };
  const existing = table.records[recordId];
  if (!existing) return { ok: false, error: 'Record not found' };

  const record: DbRecordEntry = { ...existing, data, updatedAt: Date.now() };
  const updated: DbTableRecord = { ...table, records: { ...table.records, [recordId]: record } };
  return { ok: true, value: { state: { ...state, tables: { ...state.tables, [tableName]: updated } }, record } };
}

export function opDeleteRecord(
  state: Protocol28State,
  caller: Persona,
  tableName: string,
  recordId: string,
): OpResult<Protocol28State> {
  if (isAnonymousCaller(caller)) return { ok: false, error: 'Anonymous principal is not permitted' };
  const table = state.tables[tableName];
  if (!table) return { ok: false, error: 'Table not found' };
  if (table.owner !== caller.principal) return { ok: false, error: 'Not authorized' };
  if (!table.records[recordId]) return { ok: false, error: 'Record not found' };

  const nextRecords = { ...table.records };
  delete nextRecords[recordId];
  const updated: DbTableRecord = {
    ...table,
    recordCount: Math.max(0, table.recordCount - 1),
    records: nextRecords,
  };
  return { ok: true, value: { ...state, tables: { ...state.tables, [tableName]: updated } } };
}

export function opGrantCredits(
  state: Protocol28State,
  caller: Persona,
  targetPrincipal: string,
  amountUsd: number,
): OpResult<{ state: Protocol28State; account: BillingAccountRecord }> {
  if (!caller.isController) return { ok: false, error: 'Unauthorized: only canister controllers can perform this action' };
  if (targetPrincipal === ANONYMOUS_PRINCIPAL) return { ok: false, error: 'Anonymous principal is not permitted' };
  if (!Number.isFinite(amountUsd) || amountUsd <= 0) return { ok: false, error: 'Amount must be greater than zero' };

  const micro = Math.round(amountUsd * 1_000_000);
  const existing = state.accounts[targetPrincipal] ?? {
    owner: targetPrincipal,
    balanceCycles: 0,
    totalDepositedCycles: 0,
    totalSpentCycles: 0,
    creditsMicroUsd: 0,
    grantedMicroUsd: 0,
    spentMicroUsd: 0,
    awsEquivalentMicroUsd: 0,
    createdAt: Date.now(),
  };
  const account: BillingAccountRecord = {
    ...existing,
    creditsMicroUsd: existing.creditsMicroUsd + micro,
    grantedMicroUsd: existing.grantedMicroUsd + micro,
  };
  return { ok: true, value: { state: { ...state, accounts: { ...state.accounts, [targetPrincipal]: account } }, account } };
}

export function opChargeCycles(
  state: Protocol28State,
  caller: Persona,
  targetPrincipal: string,
  amountCycles: number,
): OpResult<Protocol28State> {
  if (!state.authorizedChargers.includes(caller.principal)) {
    return { ok: false, error: 'Unauthorized: caller is not an authorized charger' };
  }
  if (amountCycles <= 0) return { ok: false, error: 'Amount must be greater than zero' };
  const acc = state.accounts[targetPrincipal];
  if (!acc) return { ok: false, error: 'Account not found' };
  if (acc.balanceCycles < amountCycles) return { ok: false, error: 'Insufficient balance' };

  const updated: BillingAccountRecord = {
    ...acc,
    balanceCycles: acc.balanceCycles - amountCycles,
    totalSpentCycles: acc.totalSpentCycles + amountCycles,
  };
  return { ok: true, value: { ...state, accounts: { ...state.accounts, [targetPrincipal]: updated } } };
}

export function opSetMarkupBps(
  state: Protocol28State,
  caller: Persona,
  nextBps: number,
): OpResult<Protocol28State> {
  if (!caller.isController) return { ok: false, error: 'Unauthorized: only canister controllers can perform this action' };
  if (nextBps < 0 || nextBps > MAX_MARKUP_PERCENT * 100) {
    return { ok: false, error: 'Markup cannot exceed 2500 bps (25%)' };
  }
  return { ok: true, value: { ...state, markupBps: nextBps } };
}

export function opDepositCycles(
  state: Protocol28State,
  caller: Persona,
  trillions: number,
): OpResult<Protocol28State> {
  if (isAnonymousCaller(caller)) return { ok: false, error: 'Anonymous principal is not permitted' };
  if (!Number.isFinite(trillions) || trillions <= 0) return { ok: false, error: 'Deposit must be greater than zero' };
  const cycles = Math.round(trillions * 1_000_000_000_000);
  const existing = state.accounts[caller.principal] ?? {
    owner: caller.principal,
    balanceCycles: 0,
    totalDepositedCycles: 0,
    totalSpentCycles: 0,
    creditsMicroUsd: 0,
    grantedMicroUsd: 0,
    spentMicroUsd: 0,
    awsEquivalentMicroUsd: 0,
    createdAt: Date.now(),
  };
  const updated: BillingAccountRecord = {
    ...existing,
    balanceCycles: existing.balanceCycles + cycles,
    totalDepositedCycles: existing.totalDepositedCycles + cycles,
  };
  return { ok: true, value: { ...state, accounts: { ...state.accounts, [caller.principal]: updated } } };
}

export interface SecurityProbeResult {
  id: string;
  canister: string;
  title: string;
  passed: boolean;
  detail: string;
}

/** Run live behavioral security regression checks mirroring protocol-28 canister fixes. */
export function runSecurityAuditProbes(): SecurityProbeResult[] {
  const base = createInitialProtocol28State();
  const owner = DEMO_PERSONAS[0];
  const attacker = DEMO_PERSONAS[2];
  const anon = DEMO_PERSONAS[3];

  const r1 = opRegisterUser(base, anon);
  const r2 = opChargeCycles(base, attacker, owner.principal, 1_000_000);
  const r3 = opCreateBucket(base, attacker, 'app-config/sub');
  const r4 = opUploadObject(base, owner, 'app-config', '../escape.txt', 'bad', 'text/plain');
  const r5 = opUpdateRecord(base, attacker, 'feature_flags', 'rec-0', [['flag', 'hacked']]);
  const r6Term = opMutateInstance(base, owner, 'compute-0', 'terminate');
  const r6Restart = r6Term.ok ? opMutateInstance(r6Term.value.state, owner, 'compute-0', 'start') : null;
  const r7 = opDeployFromManifest(
    base,
    owner,
    'version: "1"\nproject: cap-test\nservices:\n  api:\n    image: ghcr.io/acme/api:1.0.0\n    cpu: 2\n    memory: 8Gi',
    true,
  );

  return [
    {
      id: 'anon-reject',
      canister: 'identity',
      title: 'Reject anonymous principal (2vxsx-fae) on registration',
      passed: !r1.ok && r1.error.includes('Anonymous'),
      detail: r1.ok ? 'FAIL: anonymous allowed' : `Blocked: "${r1.error}"`,
    },
    {
      id: 'billing-charge-auth',
      canister: 'billing',
      title: 'Block unauthorized caller from draining victim cycles via charge()',
      passed: !r2.ok && r2.error.includes('authorized charger'),
      detail: r2.ok ? 'FAIL: balance drained' : `Blocked: "${r2.error}"`,
    },
    {
      id: 'storage-bucket-slash',
      canister: 'storage',
      title: 'Block cross-bucket slash injection ("app-config/sub")',
      passed: !r3.ok && r3.error.includes('Bucket name'),
      detail: r3.ok ? 'FAIL: slash bucket created' : `Blocked: "${r3.error}"`,
    },
    {
      id: 'storage-key-traversal',
      canister: 'storage',
      title: 'Block path traversal object key ("../escape.txt")',
      passed: !r4.ok && r4.error.includes('Object key'),
      detail: r4.ok ? 'FAIL: traversal allowed' : `Blocked: "${r4.error}"`,
    },
    {
      id: 'db-owner-update',
      canister: 'database',
      title: 'Block external user from overwriting another tenant’s DB record',
      passed: !r5.ok && r5.error.includes('Not authorized'),
      detail: r5.ok ? 'FAIL: unauthorized overwrite' : `Blocked: "${r5.error}"`,
    },
    {
      id: 'compute-state-machine',
      canister: 'compute',
      title: 'Prevent restarting a #terminated compute instance',
      passed: r6Restart !== null && !r6Restart.ok && r6Restart.error.includes('terminated'),
      detail: r6Restart && !r6Restart.ok ? `Blocked: "${r6Restart.error}"` : 'FAIL: state violated',
    },
    {
      id: 'compute-bid-cap',
      canister: 'compute',
      title: 'Reject Akash provider bids exceeding the 50% AWS savings bid cap',
      passed: r7.ok && r7.value.created[0]?.state === 'failed' && Boolean(r7.value.created[0]?.lastError?.includes('bid cap')),
      detail:
        r7.ok && r7.value.created[0]?.lastError
          ? `Enforced (#failed): ${r7.value.created[0].lastError}`
          : 'FAIL: overpriced bid accepted',
    },
  ];
}
