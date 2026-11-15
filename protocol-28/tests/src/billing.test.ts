import { resolve } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PocketIc, PocketIcServer, createIdentity, type Actor } from '@dfinity/pic';
import { Principal } from '@icp-sdk/core/principal';
import {
    billingIdlFactory,
    serviceProxyIdlFactory,
    type BillingService,
    type ServiceProxyService,
} from './declarations';

const BUILD_DIR = resolve(import.meta.dirname, '..', '.build');
const BILLING_WASM = resolve(BUILD_DIR, 'billing.wasm');
const SERVICE_PROXY_WASM = resolve(BUILD_DIR, 'service_proxy.wasm');

// Large enough for the proxy to fund deposits while paying its own fees.
const PROXY_CYCLES = 10_000_000_000_000n;
const DEPOSIT_AMOUNT = 1_000_000_000n;
const CHARGE_AMOUNT = 250_000_000n;

const ERR_UNAUTHORIZED_CHARGER = 'Unauthorized: caller is not an authorized charger';
const ERR_NOT_CONTROLLER = 'Unauthorized: only canister controllers can manage chargers';
const ERR_ZERO_AMOUNT = 'Charge amount must be greater than zero';
const ERR_ANONYMOUS_CHARGER = 'The anonymous principal cannot be an authorized charger';

const controller = createIdentity('billing-controller');
const attacker = createIdentity('attacker');
const serviceIdentity = createIdentity('compute-service');

describe('billing canister: charge() authorization', () => {
    let server: PocketIcServer;
    let pic: PocketIc;
    let billing: Actor<BillingService>;
    let billingId: Principal;
    let victimProxy: Actor<ServiceProxyService>;
    let victimId: Principal;

    beforeAll(async () => {
        server = await PocketIcServer.start();
    });

    afterAll(async () => {
        await server.stop();
    });

    beforeEach(async () => {
        pic = await PocketIc.create(server.getUrl());

        const billingFixture = await pic.setupCanister<BillingService>({
            idlFactory: billingIdlFactory,
            wasm: BILLING_WASM,
            sender: controller.getPrincipal(),
        });
        billing = billingFixture.actor;
        billingId = billingFixture.canisterId;

        // The "victim" is any funded account; a canister is used because only
        // canisters can attach cycles to deposit().
        const proxyFixture = await pic.setupCanister<ServiceProxyService>({
            idlFactory: serviceProxyIdlFactory,
            wasm: SERVICE_PROXY_WASM,
        });
        victimProxy = proxyFixture.actor;
        victimId = proxyFixture.canisterId;
        await pic.addCycles(victimId, PROXY_CYCLES);

        const deposit = await victimProxy.depositCycles(billingId, DEPOSIT_AMOUNT);
        expect(deposit).toEqual({ ok: DEPOSIT_AMOUNT });
    });

    afterEach(async () => {
        await pic.tearDown();
    });

    const authorizeServiceIdentity = async (): Promise<void> => {
        billing.setIdentity(controller);
        expect(await billing.addAuthorizedCharger(serviceIdentity.getPrincipal())).toEqual({ ok: null });
    };

    it('test_fresh_deploy_has_no_authorized_chargers', async () => {
        expect(await billing.listAuthorizedChargers()).toEqual([]);
    });

    it('test_unauthorized_caller_cannot_drain_another_users_balance', async () => {
        billing.setIdentity(attacker);

        const result = await billing.charge(victimId, DEPOSIT_AMOUNT, 'exploit');

        expect(result).toEqual({ err: ERR_UNAUTHORIZED_CHARGER });
        expect(await billing.getBalance(victimId)).toBe(DEPOSIT_AMOUNT);
    });

    it('test_anonymous_caller_cannot_charge', async () => {
        billing.setPrincipal(Principal.anonymous());

        const result = await billing.charge(victimId, 1n, 'exploit');

        expect(result).toEqual({ err: ERR_UNAUTHORIZED_CHARGER });
        expect(await billing.getBalance(victimId)).toBe(DEPOSIT_AMOUNT);
    });

    it('test_controller_is_not_implicitly_an_authorized_charger', async () => {
        billing.setIdentity(controller);

        const result = await billing.charge(victimId, CHARGE_AMOUNT, 'admin');

        expect(result).toEqual({ err: ERR_UNAUTHORIZED_CHARGER });
    });

    it('test_unlisted_canister_cannot_charge_even_its_own_account', async () => {
        const result = await victimProxy.chargeUser(billingId, victimId, CHARGE_AMOUNT);

        expect(result).toEqual({ err: ERR_UNAUTHORIZED_CHARGER });
        expect(await billing.getBalance(victimId)).toBe(DEPOSIT_AMOUNT);
    });

    it('test_non_controller_cannot_add_authorized_charger', async () => {
        billing.setIdentity(attacker);

        const result = await billing.addAuthorizedCharger(attacker.getPrincipal());

        expect(result).toEqual({ err: ERR_NOT_CONTROLLER });
        expect(await billing.listAuthorizedChargers()).toEqual([]);
    });

    it('test_non_controller_cannot_remove_authorized_charger', async () => {
        await authorizeServiceIdentity();
        billing.setIdentity(attacker);

        const result = await billing.removeAuthorizedCharger(serviceIdentity.getPrincipal());

        expect(result).toEqual({ err: ERR_NOT_CONTROLLER });
        expect(await billing.listAuthorizedChargers()).toEqual([serviceIdentity.getPrincipal()]);
    });

    it('test_anonymous_principal_cannot_be_allowlisted', async () => {
        billing.setIdentity(controller);

        const result = await billing.addAuthorizedCharger(Principal.anonymous());

        expect(result).toEqual({ err: ERR_ANONYMOUS_CHARGER });
        expect(await billing.listAuthorizedChargers()).toEqual([]);
    });

    it('test_authorized_charger_debits_balance_and_records_spend', async () => {
        await authorizeServiceIdentity();
        billing.setIdentity(serviceIdentity);

        const result = await billing.charge(victimId, CHARGE_AMOUNT, 'compute');

        expect(result).toEqual({ ok: null });
        expect(await billing.getBalance(victimId)).toBe(DEPOSIT_AMOUNT - CHARGE_AMOUNT);
    });

    it('test_authorized_service_canister_can_charge', async () => {
        billing.setIdentity(controller);
        expect(await billing.addAuthorizedCharger(victimId)).toEqual({ ok: null });

        const result = await victimProxy.chargeUser(billingId, victimId, CHARGE_AMOUNT);

        expect(result).toEqual({ ok: null });
        expect(await billing.getBalance(victimId)).toBe(DEPOSIT_AMOUNT - CHARGE_AMOUNT);
    });

    it('test_authorized_charger_cannot_charge_zero', async () => {
        await authorizeServiceIdentity();
        billing.setIdentity(serviceIdentity);

        expect(await billing.charge(victimId, 0n, 'compute')).toEqual({ err: ERR_ZERO_AMOUNT });
    });

    it('test_charge_exceeding_balance_is_rejected_without_debit', async () => {
        await authorizeServiceIdentity();
        billing.setIdentity(serviceIdentity);

        const result = await billing.charge(victimId, DEPOSIT_AMOUNT + 1n, 'compute');

        expect(result).toEqual({ err: 'Insufficient balance' });
        expect(await billing.getBalance(victimId)).toBe(DEPOSIT_AMOUNT);
    });

    it('test_charge_for_unknown_account_is_rejected', async () => {
        await authorizeServiceIdentity();
        billing.setIdentity(serviceIdentity);

        const result = await billing.charge(attacker.getPrincipal(), 1n, 'compute');

        expect(result).toEqual({ err: 'Account not found' });
    });

    it('test_removed_charger_loses_access', async () => {
        await authorizeServiceIdentity();
        expect(await billing.removeAuthorizedCharger(serviceIdentity.getPrincipal())).toEqual({ ok: null });
        billing.setIdentity(serviceIdentity);

        const result = await billing.charge(victimId, CHARGE_AMOUNT, 'compute');

        expect(result).toEqual({ err: ERR_UNAUTHORIZED_CHARGER });
        expect(await billing.listAuthorizedChargers()).toEqual([]);
    });

    it('test_allowlist_and_balances_survive_canister_upgrade', async () => {
        await authorizeServiceIdentity();

        // Enhanced orthogonal persistence requires `keep`; dfx sets it implicitly.
        await pic.upgradeCanister({
            canisterId: billingId,
            wasm: BILLING_WASM,
            sender: controller.getPrincipal(),
            upgradeModeOptions: { skip_pre_upgrade: [], wasm_memory_persistence: [{ keep: null }] },
        });

        expect(await billing.listAuthorizedChargers()).toEqual([serviceIdentity.getPrincipal()]);
        expect(await billing.getBalance(victimId)).toBe(DEPOSIT_AMOUNT);
        billing.setIdentity(attacker);
        expect(await billing.charge(victimId, 1n, 'exploit')).toEqual({ err: ERR_UNAUTHORIZED_CHARGER });
    });
});
