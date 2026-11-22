import { useState } from 'react';
import { KeyRound, Plus, UserCheck, Users } from 'lucide-react';
import {
  type Persona,
  type Protocol28State,
  type Role,
  opCreateLinkCode,
  opCreateOrganization,
  opRedeemLinkCode,
  opRegisterUser,
} from '../../runtime/protocol28Store';

interface IdentitySectionProps {
  state: Protocol28State;
  persona: Persona;
  onStateChange: (next: Protocol28State, notice: { tone: 'emerald' | 'danger'; text: string }) => void;
}

export function IdentitySection({ state, persona, onStateChange }: IdentitySectionProps) {
  const [orgName, setOrgName] = useState('');
  const [inviteRole, setInviteRole] = useState<Role>('developer');
  const [redeemInput, setRedeemInput] = useState('');
  const [latestCode, setLatestCode] = useState<string | null>(null);

  const user = state.users[persona.principal];
  const myOrgs = Object.values(state.organizations).filter(
    (org) => org.members.some((m) => m.principal === persona.principal) || persona.isController,
  );
  const activeCodes = Object.values(state.linkCodes);

  function handleRegister() {
    const res = opRegisterUser(state, persona);
    if (!res.ok) {
      onStateChange(state, { tone: 'danger', text: `identity.register() -> #err("${res.error}")` });
      return;
    }
    onStateChange(res.value.state, { tone: 'emerald', text: `Principal ${persona.principal} registered in identity canister.` });
  }

  function handleCreateOrg(e: React.FormEvent) {
    e.preventDefault();
    const res = opCreateOrganization(state, persona, orgName);
    if (!res.ok) {
      onStateChange(state, { tone: 'danger', text: `identity.createOrganization() -> #err("${res.error}")` });
      return;
    }
    setOrgName('');
    onStateChange(res.value.state, { tone: 'emerald', text: `Created organization "${res.value.org.name}" (${res.value.org.id}).` });
  }

  function handleMintLinkCode(orgId: string) {
    const res = opCreateLinkCode(state, persona, orgId, inviteRole);
    if (!res.ok) {
      onStateChange(state, { tone: 'danger', text: `identity.createLinkCode() -> #err("${res.error}")` });
      return;
    }
    setLatestCode(res.value.entry.code);
    onStateChange(res.value.state, {
      tone: 'emerald',
      text: `Minted single-use 128-bit link code for ${orgId} (role: #${inviteRole}, expires in 10 min).`,
    });
  }

  function handleRedeem(e: React.FormEvent) {
    e.preventDefault();
    const res = opRedeemLinkCode(state, persona, redeemInput);
    if (!res.ok) {
      onStateChange(state, { tone: 'danger', text: `identity.redeemLinkCode() -> #err("${res.error}")` });
      return;
    }
    setRedeemInput('');
    onStateChange(res.value.state, {
      tone: 'emerald',
      text: `Link code redeemed and consumed! Principal joined "${res.value.org.name}".`,
    });
  }

  return (
    <div className="stack-lg">
      {/* Caller Profile */}
      <div className="sheet sheet-pad row-between">
        <div className="stack-sm" style={{ gap: 4 }}>
          <div className="row-wrap">
            <UserCheck size={17} color="var(--accent)" />
            <h2 style={{ fontSize: 18 }}>Active Principal Profile</h2>
            <span className={`badge ${user ? 'badge-emerald' : 'badge-amber'}`}>
              {user ? 'Registered' : 'Unregistered'}
            </span>
          </div>
          <div className="mono" style={{ fontSize: 13, color: 'var(--ink-secondary)' }}>{persona.principal}</div>
          <div style={{ fontSize: 12.5, color: 'var(--ink-muted)' }}>{persona.description}</div>
        </div>
        <button id="btn-register-principal" type="button" className="btn btn-primary btn-sm" onClick={handleRegister}>
          Call identity.register()
        </button>
      </div>

      {/* Organizations & RBAC */}
      <div className="grid-2" style={{ alignItems: 'start' }}>
        <div className="sheet sheet-pad stack-md">
          <div className="row-wrap">
            <Users size={16} color="var(--accent)" />
            <h3 style={{ fontSize: 17 }}>Organizations ({myOrgs.length})</h3>
          </div>

          <form onSubmit={handleCreateOrg} className="row-wrap">
            <input
              id="input-org-name"
              type="text"
              className="input"
              style={{ flex: 1, minWidth: 160 }}
              placeholder="New organization name..."
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
            />
            <button type="submit" className="btn btn-primary btn-sm">
              <Plus size={14} /> Create Org
            </button>
          </form>

          <div className="stack-sm">
            {myOrgs.map((org) => (
              <div key={org.id} className="recessed stack-sm" style={{ gap: 10 }}>
                <div className="row-between">
                  <div>
                    <strong>{org.name}</strong>
                    <span className="mono" style={{ fontSize: 11.5, color: 'var(--ink-muted)', marginLeft: 8 }}>{org.id}</span>
                  </div>
                  <div className="row-wrap">
                    <select
                      aria-label="Invite role"
                      className="select"
                      style={{ width: 120, padding: '5px 8px', fontSize: 12.5 }}
                      value={inviteRole}
                      onChange={(e) => setInviteRole(e.target.value as Role)}
                    >
                      <option value="developer">#developer</option>
                      <option value="viewer">#viewer</option>
                      <option value="owner">#owner</option>
                    </select>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => handleMintLinkCode(org.id)}
                    >
                      <KeyRound size={13} /> Mint Link Code
                    </button>
                  </div>
                </div>

                <div className="stack-sm" style={{ gap: 4 }}>
                  {org.members.map((m) => (
                    <div key={m.principal} className="row-between" style={{ fontSize: 12.5 }}>
                      <code style={{ color: 'var(--ink-secondary)' }}>{m.principal}</code>
                      <span className={`badge ${m.role === 'owner' ? 'badge-accent' : 'badge-neutral'}`}>#{m.role}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Link Codes (CLI / Team Invites) */}
        <div className="sheet sheet-pad stack-md">
          <div>
            <h3 style={{ fontSize: 17 }}>One-Time CLI Link &amp; Invite Codes</h3>
            <p style={{ fontSize: 13, color: 'var(--ink-muted)', marginTop: 4 }}>
              128-bit single-use codes bridge your local CLI principal (<code>lemniskit auth link &lt;code&gt;</code>)
              or invite a teammate. Switch active persona in the header to test redeeming a code.
            </p>
          </div>

          {latestCode && (
            <div className="callout callout-emerald">
              <div>
                <strong>Active Link Code (single-use, 10 min TTL):</strong>
                <div className="mono" style={{ fontSize: 12.5, marginTop: 4, wordBreak: 'break-all' }}>{latestCode}</div>
              </div>
            </div>
          )}

          <form onSubmit={handleRedeem} className="stack-sm">
            <label htmlFor="input-redeem-code" className="field-label">Redeem Link Code as Active Principal</label>
            <div className="row-wrap">
              <input
                id="input-redeem-code"
                type="text"
                className="input mono"
                style={{ flex: 1, fontSize: 12.5 }}
                placeholder="lmn_..."
                value={redeemInput}
                onChange={(e) => setRedeemInput(e.target.value)}
              />
              <button type="submit" className="btn btn-accent btn-sm">Redeem Code</button>
            </div>
          </form>

          <div className="recessed" style={{ fontSize: 12.5 }}>
            <strong>Unconsumed Link Codes ({activeCodes.length}):</strong>
            {activeCodes.length === 0 ? (
              <div style={{ color: 'var(--ink-muted)', marginTop: 4 }}>No pending codes.</div>
            ) : (
              activeCodes.map((c) => (
                <div key={c.code} className="mono" style={{ marginTop: 6, fontSize: 11.5, wordBreak: 'break-all' }}>
                  {c.code} → {c.orgId} (#{c.role})
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
