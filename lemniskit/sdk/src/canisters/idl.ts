/**
 * Protocol 28 Candid IDL Factories & Typed ICP Actor Client
 * Matches the hardened Motoko canisters under protocol-28/{identity,compute,storage,database,billing}/main.mo.
 */

import { Actor, HttpAgent, type ActorSubclass, type Identity } from '@icp-sdk/core/agent';
import { IDL } from '@icp-sdk/core/candid';
import type { Principal } from '@icp-sdk/core/principal';

export type CanisterResult<T> = { ok: T } | { err: string };

export type OrgRole = { owner: null } | { developer: null } | { viewer: null };
export type InstanceStatus = { running: null } | { stopped: null } | { terminated: null };
export type ComputeTarget = { icp: null } | { akash: null };
export type DeploymentState =
  | { pending: null }
  | { creating: null }
  | { active: null }
  | { updating: null }
  | { closing: null }
  | { closed: null }
  | { failed: null };

export interface Protocol28CanisterIds {
  identity?: string;
  compute?: string;
  storage?: string;
  database?: string;
  billing?: string;
}

export const identityIdlFactory: IDL.InterfaceFactory = ({ IDL: T }) => {
  const Role = T.Variant({ owner: T.Null, developer: T.Null, viewer: T.Null });
  const User = T.Record({
    id: T.Principal,
    createdAt: T.Int,
    email: T.Opt(T.Text),
    projects: T.Vec(T.Text),
  });
  const Organization = T.Record({
    id: T.Text,
    name: T.Text,
    owner: T.Principal,
    members: T.Vec(T.Tuple(T.Principal, Role)),
    createdAt: T.Int,
  });
  const AuthResult = T.Variant({ ok: User, err: T.Text });
  const OrgResult = T.Variant({ ok: Organization, err: T.Text });

  return T.Service({
    register: T.Func([], [AuthResult], []),
    updateEmail: T.Func([T.Opt(T.Text)], [AuthResult], []),
    addProject: T.Func([T.Text], [AuthResult], []),
    getUser: T.Func([], [T.Opt(User)], ['query']),
    isAuthenticated: T.Func([], [T.Bool], ['query']),
    createOrganization: T.Func([T.Text], [OrgResult], []),
    listMyOrganizations: T.Func([], [T.Vec(Organization)], ['query']),
    getOrganization: T.Func([T.Text], [OrgResult], ['query']),
    setMemberRole: T.Func([T.Text, T.Principal, Role], [OrgResult], []),
    removeMember: T.Func([T.Text, T.Principal], [OrgResult], []),
    createLinkCode: T.Func([T.Text, Role, T.Text], [T.Variant({ ok: T.Int, err: T.Text })], []),
    redeemLinkCode: T.Func([T.Text], [OrgResult], []),
    roleOf: T.Func([T.Text, T.Principal], [T.Opt(Role)], ['query']),
    getUserCount: T.Func([], [T.Variant({ ok: T.Nat, err: T.Text })], ['query']),
  });
};

export const computeIdlFactory: IDL.InterfaceFactory = ({ IDL: T }) => {
  const InstanceStatusT = T.Variant({ running: T.Null, stopped: T.Null, terminated: T.Null });
  const ComputeInstance = T.Record({
    id: T.Text,
    owner: T.Principal,
    status: InstanceStatusT,
    createdAt: T.Int,
    updatedAt: T.Int,
    cyclesBalance: T.Nat,
    memory: T.Nat,
  });
  const ComputeTargetT = T.Variant({ icp: T.Null, akash: T.Null });
  const DeploymentStateT = T.Variant({
    pending: T.Null,
    creating: T.Null,
    active: T.Null,
    updating: T.Null,
    closing: T.Null,
    closed: T.Null,
    failed: T.Null,
  });
  const DeploymentRequest = T.Record({
    project: T.Text,
    target: ComputeTargetT,
    image: T.Text,
    cpuMilli: T.Nat,
    memoryMiB: T.Nat,
    storageMiB: T.Nat,
    gpuCount: T.Nat,
    region: T.Opt(T.Text),
    awsHourlyMicroUsd: T.Nat,
    maxHourlyMicroUsd: T.Nat,
  });
  const Deployment = T.Record({
    id: T.Text,
    project: T.Text,
    owner: T.Principal,
    target: ComputeTargetT,
    image: T.Text,
    cpuMilli: T.Nat,
    memoryMiB: T.Nat,
    storageMiB: T.Nat,
    gpuCount: T.Nat,
    region: T.Opt(T.Text),
    awsHourlyMicroUsd: T.Nat,
    maxHourlyMicroUsd: T.Nat,
    actualHourlyMicroUsd: T.Opt(T.Nat),
    providerUri: T.Opt(T.Text),
    dseq: T.Opt(T.Text),
    state: DeploymentStateT,
    lastError: T.Opt(T.Text),
    createdAt: T.Int,
    updatedAt: T.Int,
  });

  return T.Service({
    createInstance: T.Func([T.Nat], [T.Variant({ ok: ComputeInstance, err: T.Text })], []),
    getInstance: T.Func([T.Text], [T.Variant({ ok: ComputeInstance, err: T.Text })], ['query']),
    listInstances: T.Func([], [T.Vec(ComputeInstance)], ['query']),
    stopInstance: T.Func([T.Text], [T.Variant({ ok: T.Null, err: T.Text })], []),
    startInstance: T.Func([T.Text], [T.Variant({ ok: T.Null, err: T.Text })], []),
    terminateInstance: T.Func([T.Text], [T.Variant({ ok: T.Null, err: T.Text })], []),
    requestDeployment: T.Func([DeploymentRequest], [T.Variant({ ok: Deployment, err: T.Text })], []),
    listDeployments: T.Func([], [T.Vec(Deployment)], ['query']),
    getDeployment: T.Func([T.Text], [T.Variant({ ok: Deployment, err: T.Text })], ['query']),
    requestCloseDeployment: T.Func([T.Text], [T.Variant({ ok: Deployment, err: T.Text })], []),
    getAvailableCycles: T.Func([], [T.Variant({ ok: T.Nat, err: T.Text })], ['query']),
  });
};

export const storageIdlFactory: IDL.InterfaceFactory = ({ IDL: T }) => {
  const StorageObject = T.Record({
    key: T.Text,
    data: T.Vec(T.Nat8),
    contentType: T.Text,
    size: T.Nat,
    owner: T.Principal,
    createdAt: T.Int,
    updatedAt: T.Int,
  });
  const Bucket = T.Record({
    id: T.Text,
    owner: T.Principal,
    isPublic: T.Bool,
    objectCount: T.Nat,
    totalSize: T.Nat,
    createdAt: T.Int,
  });

  return T.Service({
    createBucket: T.Func([T.Text], [T.Variant({ ok: Bucket, err: T.Text })], []),
    setBucketVisibility: T.Func([T.Text, T.Bool], [T.Variant({ ok: Bucket, err: T.Text })], []),
    listBuckets: T.Func([], [T.Vec(Bucket)], ['query']),
    deleteBucket: T.Func([T.Text], [T.Variant({ ok: T.Null, err: T.Text })], []),
    uploadObject: T.Func([T.Text, T.Text, T.Vec(T.Nat8), T.Text], [T.Variant({ ok: StorageObject, err: T.Text })], []),
    getObject: T.Func([T.Text, T.Text], [T.Variant({ ok: StorageObject, err: T.Text })], ['query']),
    listObjects: T.Func([T.Text], [T.Variant({ ok: T.Vec(T.Text), err: T.Text })], ['query']),
    deleteObject: T.Func([T.Text, T.Text], [T.Variant({ ok: T.Null, err: T.Text })], []),
  });
};

export const databaseIdlFactory: IDL.InterfaceFactory = ({ IDL: T }) => {
  const DbRecord = T.Record({
    id: T.Text,
    data: T.Vec(T.Tuple(T.Text, T.Text)),
    createdAt: T.Int,
    updatedAt: T.Int,
  });
  const Table = T.Record({
    name: T.Text,
    owner: T.Principal,
    recordCount: T.Nat,
    createdAt: T.Int,
  });

  return T.Service({
    createTable: T.Func([T.Text], [T.Variant({ ok: Table, err: T.Text })], []),
    listTables: T.Func([], [T.Vec(Table)], ['query']),
    deleteTable: T.Func([T.Text], [T.Variant({ ok: T.Null, err: T.Text })], []),
    insert: T.Func([T.Text, T.Vec(T.Tuple(T.Text, T.Text))], [T.Variant({ ok: DbRecord, err: T.Text })], []),
    get: T.Func([T.Text, T.Text], [T.Variant({ ok: DbRecord, err: T.Text })], ['query']),
    queryByField: T.Func([T.Text, T.Text, T.Text], [T.Variant({ ok: T.Vec(DbRecord), err: T.Text })], ['query']),
    update: T.Func([T.Text, T.Text, T.Vec(T.Tuple(T.Text, T.Text))], [T.Variant({ ok: DbRecord, err: T.Text })], []),
    delete: T.Func([T.Text, T.Text], [T.Variant({ ok: T.Null, err: T.Text })], []),
    list: T.Func([T.Text], [T.Variant({ ok: T.Vec(DbRecord), err: T.Text })], ['query']),
  });
};

export const billingIdlFactory: IDL.InterfaceFactory = ({ IDL: T }) => {
  const Account = T.Record({
    owner: T.Principal,
    balance: T.Nat,
    totalDeposited: T.Nat,
    totalSpent: T.Nat,
    creditsMicroUsd: T.Nat,
    grantedMicroUsd: T.Nat,
    spentMicroUsd: T.Nat,
    awsEquivalentMicroUsd: T.Nat,
    createdAt: T.Int,
  });
  const UsageRecord = T.Record({
    idempotencyKey: T.Text,
    owner: T.Principal,
    service: T.Text,
    cyclesCharged: T.Nat,
    akashCostMicroUsd: T.Nat,
    chargedMicroUsd: T.Nat,
    awsEquivalentMicroUsd: T.Nat,
    timestamp: T.Int,
  });
  const SavingsSummary = T.Record({
    remainingCreditsMicroUsd: T.Nat,
    spentMicroUsd: T.Nat,
    awsEquivalentMicroUsd: T.Nat,
    savedMicroUsd: T.Nat,
    markupBps: T.Nat,
  });
  const CyclePrice = T.Record({
    cyclesPerICP: T.Nat,
    microUsdPerTrillionCycles: T.Nat,
  });

  return T.Service({
    getOrCreateAccount: T.Func([], [T.Variant({ ok: Account, err: T.Text })], []),
    getAccount: T.Func([], [T.Opt(Account)], ['query']),
    getBalance: T.Func([T.Principal], [T.Variant({ ok: T.Nat, err: T.Text })], ['query']),
    listUsage: T.Func([], [T.Vec(UsageRecord)], ['query']),
    getSavingsSummary: T.Func([], [T.Variant({ ok: SavingsSummary, err: T.Text })], ['query']),
    getCyclePrice: T.Func([], [CyclePrice], ['query']),
    getMarkupBps: T.Func([], [T.Nat], ['query']),
    listAuthorizedChargers: T.Func([], [T.Vec(T.Principal)], ['query']),
    addAuthorizedCharger: T.Func([T.Principal], [T.Variant({ ok: T.Null, err: T.Text })], []),
    removeAuthorizedCharger: T.Func([T.Principal], [T.Variant({ ok: T.Null, err: T.Text })], []),
    grantCredits: T.Func([T.Principal, T.Nat, T.Text], [T.Variant({ ok: Account, err: T.Text })], []),
  });
};

export interface ReplicaStatusReport {
  host: string;
  reachable: boolean;
  latencyMs: number;
  icApiVersion?: string;
  replicaHealth?: string;
  error?: string;
}

/** Probe a real ICP replica's /api/v2/status endpoint without faking status output. */
export async function checkReplicaStatus(host: string, timeoutMs = 4_000): Promise<ReplicaStatusReport> {
  const normalized = host.replace(/\/+$/, '');
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${normalized}/api/v2/status`, {
      method: 'GET',
      signal: controller.signal,
    });
    const latencyMs = Date.now() - started;
    if (!res.ok) {
      return { host: normalized, reachable: false, latencyMs, error: `HTTP ${res.status}` };
    }
    return {
      host: normalized,
      reachable: true,
      latencyMs,
      replicaHealth: 'healthy',
    };
  } catch (err) {
    const latencyMs = Date.now() - started;
    const message = err instanceof Error ? err.message : String(err);
    return { host: normalized, reachable: false, latencyMs, error: message };
  } finally {
    clearTimeout(timer);
  }
}

export async function createCanisterActor<T>(options: {
  host: string;
  canisterId: string;
  idlFactory: IDL.InterfaceFactory;
  identity?: Identity;
  fetchRootKey?: boolean;
}): Promise<ActorSubclass<T>> {
  const agent = await HttpAgent.create({
    host: options.host,
    identity: options.identity,
    shouldFetchRootKey: options.fetchRootKey ?? options.host.includes('127.0.0.1'),
  });
  return Actor.createActor<T>(options.idlFactory, {
    agent,
    canisterId: options.canisterId,
  });
}

export type { Principal };
