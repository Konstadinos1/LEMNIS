import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from '../App';
import {
  DEMO_PERSONAS,
  createInitialProtocol28State,
  opCreateLinkCode,
  opRedeemLinkCode,
  opSetMarkupBps,
  runSecurityAuditProbes,
} from '../runtime/protocol28Store';

beforeEach(() => {
  localStorage.clear();
  window.location.hash = '#/';
});

describe('Protocol 28 Client Runtime Security Probes', () => {
  it('passes all 7 adversarial security probes', () => {
    const results = runSecurityAuditProbes();
    expect(results).toHaveLength(7);
    for (const r of results) {
      expect(r.passed, `Expected probe ${r.id} to pass: ${r.detail}`).toBe(true);
    }
  });

  it('enforces single-use link code consumption and markup ceiling <= 25%', () => {
    const base = createInitialProtocol28State();
    const owner = DEMO_PERSONAS[0];
    const external = DEMO_PERSONAS[2];

    const mint = opCreateLinkCode(base, owner, 'org-0', 'developer');
    expect(mint.ok).toBe(true);
    if (!mint.ok) return;

    const firstRedeem = opRedeemLinkCode(mint.value.state, external, mint.value.entry.code);
    expect(firstRedeem.ok).toBe(true);
    if (!firstRedeem.ok) return;

    const replay = opRedeemLinkCode(firstRedeem.value.state, external, mint.value.entry.code);
    expect(replay.ok).toBe(false);

    const tooHighMarkup = opSetMarkupBps(base, owner, 3000);
    expect(tooHighMarkup.ok).toBe(false);
  });
});

describe('LEMNIS Website & Cloud Console App UI', () => {
  it('navigates across Website, Estimator Studio, Protocol 28 Explorer, Whitepaper v3.1, and Cloud Console', () => {
    render(<App />);

    // 1. Landing Website
    expect(screen.getByRole('heading', { name: /Move your containers/i })).toBeInTheDocument();

    // 2. Estimator Studio + Akash SDL tab
    fireEvent.click(document.getElementById('nav-estimator')!);
    expect(screen.getByRole('heading', { name: /Inspect real numbers before you sign up/i })).toBeInTheDocument();
    fireEvent.click(document.getElementById('tab-sdl')!);
    expect(screen.getByText(/denom: uact/i)).toBeInTheDocument();

    // 3. Protocol 28 Explorer
    fireEvent.click(document.getElementById('nav-architecture')!);
    expect(screen.getByRole('heading', { name: /On-chain control plane architecture/i })).toBeInTheDocument();

    // 4. Whitepaper v3.1 Reader
    fireEvent.click(document.getElementById('nav-whitepaper')!);
    expect(screen.getByRole('heading', { name: /LEMNIS Decentralized Cloud Specification/i })).toBeInTheDocument();
    expect(screen.getAllByText(/Audit Changelog/i).length).toBeGreaterThan(0);

    // 5. Launch Blockchain Cloud Console & run Security Audit
    fireEvent.click(document.getElementById('nav-launch-console')!);
    expect(screen.getByRole('heading', { name: /LEMNIS Cloud Console/i })).toBeInTheDocument();

    fireEvent.click(document.getElementById('console-nav-audit')!);
    expect(screen.getByText(/7 \/ 7 Passed/i)).toBeInTheDocument();
  });
});
