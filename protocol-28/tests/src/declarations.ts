// Candid bindings for the canisters under test. Kept in sync with the
// interfaces emitted by `moc --idl`; a mismatch fails decoding loudly.
import type { IDL as IDLNamespace } from '@icp-sdk/core/candid';
import type { Principal } from '@icp-sdk/core/principal';

export type TextResult<T> = { ok: T } | { err: string };

export interface BillingAccount {
    owner: Principal;
    balance: bigint;
    totalDeposited: bigint;
    totalSpent: bigint;
    createdAt: bigint;
}

export interface BillingService {
    addAuthorizedCharger: (charger: Principal) => Promise<TextResult<null>>;
    removeAuthorizedCharger: (charger: Principal) => Promise<TextResult<null>>;
    listAuthorizedChargers: () => Promise<Principal[]>;
    charge: (user: Principal, amount: bigint, service: string) => Promise<TextResult<null>>;
    getBalance: (user: Principal) => Promise<bigint>;
    getOrCreateAccount: () => Promise<BillingAccount>;
}

export interface ServiceProxyService {
    depositCycles: (billingId: Principal, amount: bigint) => Promise<TextResult<bigint>>;
    chargeUser: (billingId: Principal, user: Principal, amount: bigint) => Promise<TextResult<null>>;
}

type IdlBuilder = Parameters<IDLNamespace.InterfaceFactory>[0]['IDL'];

const unitResult = (IDL: IdlBuilder) => IDL.Variant({ ok: IDL.Null, err: IDL.Text });

export const billingIdlFactory: IDLNamespace.InterfaceFactory = ({ IDL }) => {
    const Account = IDL.Record({
        owner: IDL.Principal,
        balance: IDL.Nat,
        totalDeposited: IDL.Nat,
        totalSpent: IDL.Nat,
        createdAt: IDL.Int,
    });
    return IDL.Service({
        addAuthorizedCharger: IDL.Func([IDL.Principal], [unitResult(IDL)], []),
        removeAuthorizedCharger: IDL.Func([IDL.Principal], [unitResult(IDL)], []),
        listAuthorizedChargers: IDL.Func([], [IDL.Vec(IDL.Principal)], ['query']),
        charge: IDL.Func([IDL.Principal, IDL.Nat, IDL.Text], [unitResult(IDL)], []),
        getBalance: IDL.Func([IDL.Principal], [IDL.Nat], ['query']),
        getOrCreateAccount: IDL.Func([], [Account], []),
    });
};

export const serviceProxyIdlFactory: IDLNamespace.InterfaceFactory = ({ IDL }) =>
    IDL.Service({
        depositCycles: IDL.Func(
            [IDL.Principal, IDL.Nat],
            [IDL.Variant({ ok: IDL.Nat, err: IDL.Text })],
            [],
        ),
        chargeUser: IDL.Func([IDL.Principal, IDL.Principal, IDL.Nat], [unitResult(IDL)], []),
    });
