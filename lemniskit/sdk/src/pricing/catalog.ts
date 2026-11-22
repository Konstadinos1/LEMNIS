/**
 * Verified Cloud Pricing Catalog (Checked November 2026)
 * All AWS baselines are us-east-1 on-demand list prices.
 * Monetary amounts use exact USD numbers in catalog definitions and micro-USD (1 USD = 1_000_000)
 * when converted for on-chain Protocol 28 billing calls.
 */

export const CATALOG_VERSION = '2026-11-22';
export const CATALOG_CHECKED_AT = '2026-11-11';
export const HOURS_PER_MONTH = 730;
export const MICRO_USD_PER_USD = 1_000_000;
export const DEFAULT_MARKUP_PERCENT = 20;
export const MAX_MARKUP_PERCENT = 25;
export const TARGET_SAVINGS_RATIO = 0.5;

export type PriceConfidence = 'verified' | 'estimate';

export interface AwsInstanceSpec {
  readonly id: string;
  readonly family: 'm7i' | 'c7i' | 'r7i' | 't3a';
  readonly vcpu: number;
  readonly memoryGiB: number;
  readonly hourlyUsd: number;
  readonly burstable: boolean;
  readonly sourceUrl: string;
  readonly checkedAt: string;
}

export interface GpuRateSpec {
  readonly model: 'h100' | 'a100' | 'l40s';
  readonly displayName: string;
  readonly awsOnDemandHourlyUsd: number;
  readonly aws3YrSavingsHourlyUsd: number;
  readonly akashMedianHourlyUsd: number;
  readonly akashMinHourlyUsd: number;
  readonly akashMaxHourlyUsd: number;
  readonly confidence: PriceConfidence;
  readonly sourceUrl: string;
}

export const AWS_X86_INSTANCES: readonly AwsInstanceSpec[] = [
  { id: 't3a.micro', family: 't3a', vcpu: 2, memoryGiB: 1, hourlyUsd: 0.0094, burstable: true, sourceUrl: 'https://aws.amazon.com/ec2/pricing/on-demand/', checkedAt: CATALOG_CHECKED_AT },
  { id: 't3a.small', family: 't3a', vcpu: 2, memoryGiB: 2, hourlyUsd: 0.0188, burstable: true, sourceUrl: 'https://aws.amazon.com/ec2/pricing/on-demand/', checkedAt: CATALOG_CHECKED_AT },
  { id: 't3a.medium', family: 't3a', vcpu: 2, memoryGiB: 4, hourlyUsd: 0.0376, burstable: true, sourceUrl: 'https://aws.amazon.com/ec2/pricing/on-demand/', checkedAt: CATALOG_CHECKED_AT },
  { id: 't3a.large', family: 't3a', vcpu: 2, memoryGiB: 8, hourlyUsd: 0.0752, burstable: true, sourceUrl: 'https://aws.amazon.com/ec2/pricing/on-demand/', checkedAt: CATALOG_CHECKED_AT },
  { id: 't3a.xlarge', family: 't3a', vcpu: 4, memoryGiB: 16, hourlyUsd: 0.1504, burstable: true, sourceUrl: 'https://aws.amazon.com/ec2/pricing/on-demand/', checkedAt: CATALOG_CHECKED_AT },
  { id: 'c7i.large', family: 'c7i', vcpu: 2, memoryGiB: 4, hourlyUsd: 0.0893, burstable: false, sourceUrl: 'https://aws.amazon.com/ec2/pricing/on-demand/', checkedAt: CATALOG_CHECKED_AT },
  { id: 'm7i.large', family: 'm7i', vcpu: 2, memoryGiB: 8, hourlyUsd: 0.1008, burstable: false, sourceUrl: 'https://www.doit.com/compute/spot/us-east-1/m7i.large', checkedAt: CATALOG_CHECKED_AT },
  { id: 'r7i.large', family: 'r7i', vcpu: 2, memoryGiB: 16, hourlyUsd: 0.1323, burstable: false, sourceUrl: 'https://aws.amazon.com/ec2/pricing/on-demand/', checkedAt: CATALOG_CHECKED_AT },
  { id: 'c7i.xlarge', family: 'c7i', vcpu: 4, memoryGiB: 8, hourlyUsd: 0.1785, burstable: false, sourceUrl: 'https://aws.amazon.com/ec2/pricing/on-demand/', checkedAt: CATALOG_CHECKED_AT },
  { id: 'm7i.xlarge', family: 'm7i', vcpu: 4, memoryGiB: 16, hourlyUsd: 0.2016, burstable: false, sourceUrl: 'https://aws.amazon.com/ec2/pricing/on-demand/', checkedAt: CATALOG_CHECKED_AT },
  { id: 'r7i.xlarge', family: 'r7i', vcpu: 4, memoryGiB: 32, hourlyUsd: 0.2646, burstable: false, sourceUrl: 'https://aws.amazon.com/ec2/pricing/on-demand/', checkedAt: CATALOG_CHECKED_AT },
  { id: 'c7i.2xlarge', family: 'c7i', vcpu: 8, memoryGiB: 16, hourlyUsd: 0.357, burstable: false, sourceUrl: 'https://aws.amazon.com/ec2/pricing/on-demand/', checkedAt: CATALOG_CHECKED_AT },
  { id: 'm7i.2xlarge', family: 'm7i', vcpu: 8, memoryGiB: 32, hourlyUsd: 0.4032, burstable: false, sourceUrl: 'https://aws.amazon.com/ec2/pricing/on-demand/', checkedAt: CATALOG_CHECKED_AT },
  { id: 'r7i.2xlarge', family: 'r7i', vcpu: 8, memoryGiB: 64, hourlyUsd: 0.5292, burstable: false, sourceUrl: 'https://aws.amazon.com/ec2/pricing/on-demand/', checkedAt: CATALOG_CHECKED_AT },
  { id: 'c7i.4xlarge', family: 'c7i', vcpu: 16, memoryGiB: 32, hourlyUsd: 0.714, burstable: false, sourceUrl: 'https://aws.amazon.com/ec2/pricing/on-demand/', checkedAt: CATALOG_CHECKED_AT },
  { id: 'm7i.4xlarge', family: 'm7i', vcpu: 16, memoryGiB: 64, hourlyUsd: 0.8064, burstable: false, sourceUrl: 'https://aws.amazon.com/ec2/pricing/on-demand/', checkedAt: CATALOG_CHECKED_AT },
  { id: 'r7i.4xlarge', family: 'r7i', vcpu: 16, memoryGiB: 128, hourlyUsd: 1.0584, burstable: false, sourceUrl: 'https://aws.amazon.com/ec2/pricing/on-demand/', checkedAt: CATALOG_CHECKED_AT },
];

export const GPU_CATALOG: Readonly<Record<'h100' | 'a100' | 'l40s', GpuRateSpec>> = {
  h100: {
    model: 'h100',
    displayName: 'NVIDIA H100 80GB',
    awsOnDemandHourlyUsd: 6.88,      // p5.48xlarge ($55.04/hr / 8), post-June 2025 cut
    aws3YrSavingsHourlyUsd: 3.1,     // 3-year Compute Savings Plan reference
    akashMedianHourlyUsd: 2.4,       // Oct-Nov 2026 market median (range $1.45-$2.73)
    akashMinHourlyUsd: 1.45,
    akashMaxHourlyUsd: 2.73,
    confidence: 'verified',
    sourceUrl: 'https://computeprices.com/providers/akash/gpus/h100',
  },
  a100: {
    model: 'a100',
    displayName: 'NVIDIA A100 80GB',
    awsOnDemandHourlyUsd: 3.67,      // p4de.24xlarge per-GPU share
    aws3YrSavingsHourlyUsd: 1.85,
    akashMedianHourlyUsd: 1.15,
    akashMinHourlyUsd: 0.85,
    akashMaxHourlyUsd: 1.55,
    confidence: 'verified',
    sourceUrl: 'https://akash.network/explore/compare/akash-vs-aws/',
  },
  l40s: {
    model: 'l40s',
    displayName: 'NVIDIA L40S 48GB',
    awsOnDemandHourlyUsd: 2.24,      // g6e.2xlarge reference
    aws3YrSavingsHourlyUsd: 1.18,
    akashMedianHourlyUsd: 0.78,
    akashMinHourlyUsd: 0.55,
    akashMaxHourlyUsd: 1.05,
    confidence: 'estimate',
    sourceUrl: 'https://akash.network/explore/compare/akash-vs-aws/',
  },
};

export const AWS_UNIT_RATES = {
  fargateVcpuHourlyUsd: 0.04048,
  fargateMemoryGiBHourlyUsd: 0.004445,
  ebsGp3PerGiBMonthUsd: 0.08,
  s3StandardPerGiBMonthUsd: 0.023,
  egressFreeTierGiBMonth: 100,
  egressPerGiBUsd: 0.09,
} as const;

export const AKASH_ESTIMATED_UNIT_RATES = {
  // Reverse-auction estimates calibrated against multi-provider reports;
  // marked 'estimate' until a live provider bid confirms the lease.
  vcpuHourlyUsd: 0.005,
  memoryGiBHourlyUsd: 0.002,
  storageGiBMonthUsd: 0.02,
  confidence: 'estimate' as PriceConfidence,
} as const;

export const ICP_RATES = {
  usdPerTrillionCycles: 1.4,         // 1T cycles = 1 XDR (~$1.40)
  storagePerGiBYearUsd: 5.35,        // ~4T cycles / GiB / yr (~$0.446/GB-mo)
  ipfsPinnedPerGiBMonthUsd: 0.05,
} as const;

export function usdToMicroUsd(usd: number): bigint {
  return BigInt(Math.max(0, Math.round(usd * MICRO_USD_PER_USD)));
}

export function microUsdToUsd(microUsd: bigint | number): number {
  return Number(microUsd) / MICRO_USD_PER_USD;
}
