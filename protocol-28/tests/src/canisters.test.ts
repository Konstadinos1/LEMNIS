import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const mo = require('motoko');
const basePkg = require('motoko/packages/latest/base.json');

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROTOCOL_DIR = resolve(__dirname, '../..');

const CANISTERS = ['identity', 'compute', 'storage', 'database', 'billing'] as const;
type CanisterName = (typeof CANISTERS)[number];

interface CompiledCanister {
  name: CanisterName;
  source: string;
  diagnostics: Array<{ severity: number; code: string; message: string }>;
  candid: string;
}

const compiled = new Map<CanisterName, CompiledCanister>();

beforeAll(() => {
  mo.loadPackage(basePkg);
  for (const name of CANISTERS) {
    const source = readFileSync(resolve(PROTOCOL_DIR, name, 'main.mo'), 'utf8');
    const virtualPath = `${name}.mo`;
    mo.write(virtualPath, source);
    const diagnostics = mo.check(virtualPath);
    const candid = mo.candid(virtualPath);
    compiled.set(name, { name, source, diagnostics, candid });
  }
}, 30_000);

describe('Protocol 28 Motoko Canisters — Compilation & Candid Verification', () => {
  for (const name of CANISTERS) {
    it(`compiles ${name}/main.mo with zero errors and zero warnings`, () => {
      const entry = compiled.get(name)!;
      expect(entry.diagnostics).toEqual([]);
      expect(entry.candid).toContain('service :');
    });

    it(`compiles ${name}/main.mo to valid ICP WebAssembly`, () => {
      const result = mo.wasm(`${name}.mo`, 'ic');
      expect(result.wasm).toBeInstanceOf(Uint8Array);
      // Verify WebAssembly binary magic header: \0asm
      expect(Array.from(result.wasm.slice(0, 4))).toEqual([0x00, 0x61, 0x73, 0x6d]);
      expect(result.wasm.length).toBeGreaterThan(10_000);
    }, 20_000);
  }
});

describe('Protocol 28 Security & Architecture Regression Guards', () => {
  it('enforces persistent actor and transient constants across all five canisters', () => {
    for (const name of CANISTERS) {
      const { source } = compiled.get(name)!;
      expect(source).toMatch(/^persistent actor\s+/m);
      expect(source).toContain('transient let ');
      expect(source).toContain('Principal.isAnonymous');
    }
  });

  it('identity exposes org/role IAM, link codes, and controller-gated user count', () => {
    const { candid, source } = compiled.get('identity')!;
    expect(candid).toContain('createOrganization: (name: text) ->');
    expect(candid).toContain('setMemberRole: (orgId: OrgId, member: UserId, role: Role) ->');
    expect(candid).toContain('createLinkCode: (orgId: OrgId, role: Role, code: text) ->');
    expect(candid).toContain('redeemLinkCode: (code: text) ->');
    expect(candid).toContain('roleOf: (orgId: OrgId, "principal": UserId) -> (opt Role) query;');
    expect(candid).toMatch(/getUserCount: \(\) -> \(Result(?:_\d+)?\) query;/);
    expect(source).toContain('Principal.isController(msg.caller)');
  });

  it('compute exposes strict lifecycle methods and Akash deployment registry with bid cap', () => {
    const { candid, source } = compiled.get('compute')!;
    expect(candid).toContain('startInstance: (id: text) ->');
    expect(candid).toContain('stopInstance: (id: text) ->');
    expect(candid).toContain('terminateInstance: (id: text) ->');
    expect(candid).toContain('requestDeployment: (req: DeploymentRequest) ->');
    expect(candid).toContain('transitionDeployment:');
    expect(source).toContain('Provider lease rate exceeds deployment bid cap');
    expect(source).toContain('Cannot restart a terminated instance');
  });

  it('storage isolates objects in nested per-bucket maps with visibility controls', () => {
    const { candid, source } = compiled.get('storage')!;
    expect(candid).toContain('setBucketVisibility: (bucketId: BucketId, isPublic: bool) ->');
    expect(candid).toContain('listBuckets: () -> (vec Bucket) query;');
    expect(candid).toContain('deleteBucket: (bucketId: BucketId) ->');
    expect(source).toContain('Map.Map<BucketId, Map.Map<ObjectKey, StorageObject>>');
    expect(source).not.toContain('bucketId # "/" # key');
  });

  it('database isolates records in nested per-table maps and authorizes update/delete', () => {
    const { candid, source } = compiled.get('database')!;
    expect(candid).toContain('update: (tableName: TableName, recordId: RecordId, data:');
    expect(candid).toContain('delete: (tableName: TableName, recordId: RecordId) ->');
    expect(candid).toContain('queryByField: (tableName: TableName, field: text, value: text) ->');
    expect(source).toContain('Map.Map<TableName, Map.Map<RecordId, Record>>');
    expect(source).not.toContain('shared(_msg)');
    expect(source).toContain('break scan');
  });

  it('billing restricts charge/recordUsage to allowlisted chargers and fixes cycle pricing', () => {
    const { candid, source } = compiled.get('billing')!;
    expect(candid).toContain('addAuthorizedCharger: (charger: principal) ->');
    expect(candid).toContain('removeAuthorizedCharger: (charger: principal) ->');
    expect(candid).toContain('listAuthorizedChargers: () -> (vec principal) query;');
    expect(candid).toContain('grantCredits: (user: principal, amountMicroUsd: nat');
    expect(candid).toContain('recordUsage: (idempotencyKey: text, user: principal');
    expect(candid).toContain('getSavingsSummary: () ->');
    expect(source).toContain('isAuthorizedCharger(msg.caller)');
    expect(source).toContain('DEFAULT_MICRO_USD_PER_TRILLION_CYCLES : Nat = 1_400_000');
  });
});
