import { describe, expect, it } from 'vitest';
import {
  createStarterManifestYaml,
  estimateProjectSavings,
  generateAkashSdl,
  parseLemnisYaml,
  parseSizeToMiB,
} from '../index.js';

describe('@lemnis/sdk — manifest schema & validation', () => {
  it('parses starter manifest with zero warnings', () => {
    const yaml = createStarterManifestYaml('Shop API');
    const { manifest, warnings } = parseLemnisYaml(yaml);
    expect(manifest.project).toBe('shop-api');
    expect(manifest.services.api.cpu).toBe(2);
    expect(warnings).toEqual([]);
  });

  it('warns when secret-like env keys or unpinned image tags are present', () => {
    const yaml = `
version: "1"
project: test-app
services:
  web:
    image: nginx:latest
    cpu: 1
    memory: 2Gi
    env:
      DATABASE_URL: postgres://user:pass@host/db
    usage:
      from_aws: 200Gi
`;
    const { warnings } = parseLemnisYaml(yaml);
    expect(warnings.some((w) => w.includes('unpinned image tag'))).toBe(true);
    expect(warnings.some((w) => w.includes('DATABASE_URL'))).toBe(true);
    expect(warnings.some((w) => w.includes('without a pinned region'))).toBe(true);
  });

  it('rejects invalid memory strings and empty services', () => {
    expect(() => parseSizeToMiB('100GB')).toThrow();
    expect(() => parseLemnisYaml('version: "1"\nproject: app\nservices: {}')).toThrow();
  });
});

describe('@lemnis/sdk — honest AWS vs LEMNIS estimator', () => {
  it('computes accurate API + H100 GPU + egress + from_aws savings with disclosures', () => {
    const yaml = `
version: "1"
project: ai-platform
region: us-east
services:
  api:
    image: ghcr.io/acme/api:1.4.2
    cpu: 2
    memory: 8Gi
    storage: 20Gi
    today:
      aws: m7i.large
    usage:
      egress: 500Gi
      from_aws: 100Gi
  infer:
    image: ghcr.io/acme/infer:2.0.0
    cpu: 8
    memory: 32Gi
    storage: 100Gi
    gpu:
      model: h100
      count: 1
    placement: gpu
`;
    const { manifest } = parseLemnisYaml(yaml);
    const est = estimateProjectSavings(manifest, 20);

    expect(est.services).toHaveLength(2);
    const api = est.services.find((s) => s.service === 'api')!;
    const infer = est.services.find((s) => s.service === 'infer')!;

    // m7i.large = $0.1008 * 730 = $73.584 + 20 GiB gp3 ($1.60) = $75.18
    expect(api.awsMonthlyUsd).toBeCloseTo(75.18, 1);
    expect(api.savedPercent).toBeGreaterThanOrEqual(60);

    // 1x H100 = $6.88 * 730 = $5,022.40 + 100 GiB gp3 ($8.00) = $5,030.40
    expect(infer.awsMonthlyUsd).toBeCloseTo(5030.4, 1);
    expect(infer.savedPercent).toBeGreaterThanOrEqual(50);
    expect(infer.gpuSavingsPlanNote).toContain('3-yr AWS Savings Plan');

    // Egress: 500 GiB - 100 GiB free = 400 * $0.09 = $36.00
    expect(est.awsEgressMonthlyUsd).toBeCloseTo(36.0, 2);
    // from_aws: 100 GiB * $0.09 = $9.00 added to LEMNIS column
    expect(est.fromAwsStillPaidToAwsUsd).toBeCloseTo(9.0, 2);
    expect(est.totalSavedPercent).toBeGreaterThanOrEqual(50);
  });

  it('rejects markup above the 25% protocol ceiling', () => {
    const { manifest } = parseLemnisYaml(createStarterManifestYaml('cap-check'));
    expect(() => estimateProjectSavings(manifest, 30)).toThrow(/25%/);
  });
});

describe('@lemnis/sdk — deterministic Akash SDL v2.0 generator', () => {
  it('generates valid deterministic SDL with placement groups, GPUs, and bid caps', () => {
    const { manifest } = parseLemnisYaml(`
version: "1"
project: inference-stack
region: eu-west
services:
  api:
    image: ghcr.io/acme/api:1.0.0
    cpu: 2
    memory: 4Gi
    storage: 10Gi
    expose:
      - port: 8080
        as: 80
  worker:
    image: ghcr.io/acme/worker:1.0.0
    cpu: 4
    memory: 16Gi
    gpu:
      model: h100
      count: 1
    placement: gpu-pool
`);
    const sdl1 = generateAkashSdl(manifest, 20);
    const sdl2 = generateAkashSdl(manifest, 20);
    expect(sdl1).toBe(sdl2);
    expect(sdl1).toContain('version: \'2.0\'');
    expect(sdl1).toContain('region: eu-west');
    expect(sdl1).toContain('model: h100');
    expect(sdl1).toContain('gpu-pool:');
    expect(sdl1).toContain('denom: uact');
  });
});
