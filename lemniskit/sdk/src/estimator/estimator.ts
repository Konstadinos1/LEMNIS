import {
  AKASH_ESTIMATED_UNIT_RATES,
  AWS_UNIT_RATES,
  AWS_X86_INSTANCES,
  CATALOG_CHECKED_AT,
  CATALOG_VERSION,
  DEFAULT_MARKUP_PERCENT,
  GPU_CATALOG,
  HOURS_PER_MONTH,
  MAX_MARKUP_PERCENT,
  TARGET_SAVINGS_RATIO,
  type AwsInstanceSpec,
  type PriceConfidence,
} from '../pricing/catalog.js';
import { type LemnisManifest, type ServiceManifest, parseSizeToMiB } from '../schema/manifest.js';

export interface ServiceEstimateLine {
  service: string;
  specSummary: string;
  awsBaselineLabel: string;
  awsMonthlyUsd: number;
  akashBaseMonthlyUsd: number;
  lemnisMonthlyUsd: number;
  bidCapMonthlyUsd: number;
  bidCapHourlyUsd: number;
  savedMonthlyUsd: number;
  savedPercent: number;
  confidence: PriceConfidence;
  belowTargetSavings: boolean;
  gpuSavingsPlanNote?: string;
}

export interface ProjectSavingsEstimate {
  project: string;
  region?: string;
  catalogVersion: string;
  pricesCheckedAt: string;
  markupPercent: number;
  services: ServiceEstimateLine[];
  internetEgressGiB: number;
  awsEgressMonthlyUsd: number;
  fromAwsGiB: number;
  fromAwsStillPaidToAwsUsd: number;
  totalAwsMonthlyUsd: number;
  totalLemnisMonthlyUsd: number;
  totalSavedMonthlyUsd: number;
  totalSavedPercent: number;
  notes: string[];
}

function matchAwsBaseline(svc: ServiceManifest): { label: string; monthlyUsd: number } {
  const memoryGiB = parseSizeToMiB(svc.memory) / 1024;
  const storageGiB = parseSizeToMiB(svc.storage) / 1024;
  const diskUsd = storageGiB * AWS_UNIT_RATES.ebsGp3PerGiBMonthUsd;

  if (svc.gpu) {
    const gpu = GPU_CATALOG[svc.gpu.model];
    const computeUsd = gpu.awsOnDemandHourlyUsd * svc.gpu.count * HOURS_PER_MONTH;
    return {
      label: `AWS ${gpu.displayName} (${svc.gpu.count}x on-demand)`,
      monthlyUsd: computeUsd + diskUsd,
    };
  }

  if (svc.today?.aws) {
    const requested = svc.today.aws.toLowerCase().trim();
    if (requested === 'fargate') {
      const fargateUsd =
        (svc.cpu * AWS_UNIT_RATES.fargateVcpuHourlyUsd + memoryGiB * AWS_UNIT_RATES.fargateMemoryGiBHourlyUsd) *
        HOURS_PER_MONTH;
      return { label: 'AWS Fargate (runs today)', monthlyUsd: fargateUsd + diskUsd };
    }
    const exact = AWS_X86_INSTANCES.find((inst) => inst.id === requested);
    if (exact) {
      return { label: `${exact.id} (runs today)`, monthlyUsd: exact.hourlyUsd * HOURS_PER_MONTH + diskUsd };
    }
  }

  const candidate = findCheapestNonBurstableX86(svc.cpu, memoryGiB);
  if (candidate) {
    return {
      label: `${candidate.id} (matched x86)`,
      monthlyUsd: candidate.hourlyUsd * HOURS_PER_MONTH + diskUsd,
    };
  }

  // Fallback linear scaling for extra-large shapes above 16 vCPU / 128 GiB
  const largest = AWS_X86_INSTANCES[AWS_X86_INSTANCES.length - 1];
  const scaleFactor = Math.max(svc.cpu / largest.vcpu, memoryGiB / largest.memoryGiB);
  return {
    label: `Scaled x86 (~${scaleFactor.toFixed(1)}x ${largest.id})`,
    monthlyUsd: largest.hourlyUsd * scaleFactor * HOURS_PER_MONTH + diskUsd,
  };
}

function findCheapestNonBurstableX86(vcpu: number, memoryGiB: number): AwsInstanceSpec | undefined {
  return AWS_X86_INSTANCES
    .filter((inst) => !inst.burstable && inst.vcpu >= vcpu && inst.memoryGiB >= memoryGiB)
    .sort((a, b) => a.hourlyUsd - b.hourlyUsd)[0];
}

function estimateAkashServiceBaseMonthly(svc: ServiceManifest): { monthlyUsd: number; confidence: PriceConfidence } {
  const memoryGiB = parseSizeToMiB(svc.memory) / 1024;
  const storageGiB = parseSizeToMiB(svc.storage) / 1024;

  const cpuRamDisk =
    (svc.cpu * AKASH_ESTIMATED_UNIT_RATES.vcpuHourlyUsd +
      memoryGiB * AKASH_ESTIMATED_UNIT_RATES.memoryGiBHourlyUsd) *
      HOURS_PER_MONTH +
    storageGiB * AKASH_ESTIMATED_UNIT_RATES.storageGiBMonthUsd;

  if (svc.gpu) {
    const gpu = GPU_CATALOG[svc.gpu.model];
    const gpuMonthly = gpu.akashMedianHourlyUsd * svc.gpu.count * HOURS_PER_MONTH;
    return { monthlyUsd: gpuMonthly + cpuRamDisk * 0.25, confidence: gpu.confidence };
  }

  return { monthlyUsd: cpuRamDisk, confidence: AKASH_ESTIMATED_UNIT_RATES.confidence };
}

function computeAwsEgressUsd(totalGiB: number, includeFreeTier: boolean): number {
  const billable = includeFreeTier ? Math.max(0, totalGiB - AWS_UNIT_RATES.egressFreeTierGiBMonth) : totalGiB;
  return billable * AWS_UNIT_RATES.egressPerGiBUsd;
}

/**
 * Produce an honest, sourced monthly cost & savings estimate comparing AWS on-demand
 * against LEMNIS (Akash + transparent markup + any residual from_aws egress).
 */
export function estimateProjectSavings(
  manifest: LemnisManifest,
  markupPercent: number = DEFAULT_MARKUP_PERCENT,
): ProjectSavingsEstimate {
  if (markupPercent < 0 || markupPercent > MAX_MARKUP_PERCENT) {
    throw new Error(`Markup must be between 0% and ${MAX_MARKUP_PERCENT}% (protocol ceiling).`);
  }

  const markupFactor = 1 + markupPercent / 100;
  const lines: ServiceEstimateLine[] = [];
  const notes: string[] = [];
  let totalInternetEgressGiB = 0;
  let totalFromAwsGiB = 0;
  let hasEstimatedCpu = false;

  for (const [serviceName, svc] of Object.entries(manifest.services)) {
    const memoryGiB = parseSizeToMiB(svc.memory) / 1024;
    const storageGiB = parseSizeToMiB(svc.storage) / 1024;
    const aws = matchAwsBaseline(svc);
    const akash = estimateAkashServiceBaseMonthly(svc);
    const lemnisMonthlyUsd = roundCurrency(akash.monthlyUsd * markupFactor);
    const awsMonthlyUsd = roundCurrency(aws.monthlyUsd);

    const defaultCap = roundCurrency(awsMonthlyUsd * TARGET_SAVINGS_RATIO);
    const bidCapMonthlyUsd = svc.max_monthly_price ? roundCurrency(svc.max_monthly_price) : defaultCap;
    const bidCapHourlyUsd = Number((bidCapMonthlyUsd / HOURS_PER_MONTH).toFixed(4));
    const savedMonthlyUsd = roundCurrency(awsMonthlyUsd - lemnisMonthlyUsd);
    const savedPercent = awsMonthlyUsd > 0 ? Math.round((savedMonthlyUsd / awsMonthlyUsd) * 100) : 0;

    if (akash.confidence === 'estimate') hasEstimatedCpu = true;
    if (svc.usage?.egress) totalInternetEgressGiB += parseSizeToMiB(svc.usage.egress) / 1024;
    if (svc.usage?.from_aws) totalFromAwsGiB += parseSizeToMiB(svc.usage.from_aws) / 1024;

    let gpuSavingsPlanNote: string | undefined;
    if (svc.gpu) {
      const gpu = GPU_CATALOG[svc.gpu.model];
      const spMonthly = roundCurrency(gpu.aws3YrSavingsHourlyUsd * svc.gpu.count * HOURS_PER_MONTH);
      const diffPct = Math.round(((spMonthly - lemnisMonthlyUsd) / spMonthly) * 100);
      gpuSavingsPlanNote =
        diffPct >= 0
          ? `3-yr AWS Savings Plan ($${gpu.aws3YrSavingsHourlyUsd.toFixed(2)}/GPU-hr) narrows savings on "${serviceName}" to ~${diffPct}% (no commitment on LEMNIS).`
          : `With a 3-yr AWS Savings Plan ($${gpu.aws3YrSavingsHourlyUsd.toFixed(2)}/GPU-hr), AWS would be ~${Math.abs(diffPct)}% cheaper for "${serviceName}".`;
      notes.push(gpuSavingsPlanNote);
    }

    const gpuTag = svc.gpu ? ` · ${svc.gpu.count}x ${svc.gpu.model.toUpperCase()}` : '';
    lines.push({
      service: serviceName,
      specSummary: `${svc.cpu} vCPU · ${formatGiB(memoryGiB)} · ${formatGiB(storageGiB)}${gpuTag}`,
      awsBaselineLabel: aws.label,
      awsMonthlyUsd,
      akashBaseMonthlyUsd: roundCurrency(akash.monthlyUsd),
      lemnisMonthlyUsd,
      bidCapMonthlyUsd,
      bidCapHourlyUsd,
      savedMonthlyUsd,
      savedPercent,
      confidence: akash.confidence,
      belowTargetSavings: savedPercent < 50,
      gpuSavingsPlanNote,
    });
  }

  const awsEgressMonthlyUsd = roundCurrency(computeAwsEgressUsd(totalInternetEgressGiB, true));
  const fromAwsStillPaidToAwsUsd = roundCurrency(computeAwsEgressUsd(totalFromAwsGiB, false));

  const servicesAwsTotal = lines.reduce((sum, l) => sum + l.awsMonthlyUsd, 0);
  const servicesLemnisTotal = lines.reduce((sum, l) => sum + l.lemnisMonthlyUsd, 0);
  const totalAwsMonthlyUsd = roundCurrency(servicesAwsTotal + awsEgressMonthlyUsd);
  const totalLemnisMonthlyUsd = roundCurrency(servicesLemnisTotal + fromAwsStillPaidToAwsUsd);
  const totalSavedMonthlyUsd = roundCurrency(totalAwsMonthlyUsd - totalLemnisMonthlyUsd);
  const totalSavedPercent =
    totalAwsMonthlyUsd > 0 ? Math.round((totalSavedMonthlyUsd / totalAwsMonthlyUsd) * 100) : 0;

  if (hasEstimatedCpu) {
    notes.unshift('CPU/RAM prices marked (*) are reverse-auction estimates until a live Akash provider bid confirms them.');
  }
  if (totalFromAwsGiB > 0 && !manifest.region) {
    notes.push('Data pulled from AWS (usage.from_aws) is included in the LEMNIS column. Pin "region: us-east" to minimize latency.');
  }
  if (lines.some((l) => l.belowTargetSavings)) {
    notes.push('One or more services are estimated below the 50% target saving; LEMNIS bid caps prevent overpaying at deploy time.');
  }

  return {
    project: manifest.project,
    region: manifest.region,
    catalogVersion: CATALOG_VERSION,
    pricesCheckedAt: CATALOG_CHECKED_AT,
    markupPercent,
    services: lines,
    internetEgressGiB: Math.round(totalInternetEgressGiB),
    awsEgressMonthlyUsd,
    fromAwsGiB: Math.round(totalFromAwsGiB),
    fromAwsStillPaidToAwsUsd,
    totalAwsMonthlyUsd,
    totalLemnisMonthlyUsd,
    totalSavedMonthlyUsd,
    totalSavedPercent,
    notes,
  };
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

function formatGiB(gib: number): string {
  return gib >= 1 ? `${Number(gib.toFixed(1))} GiB` : `${Math.round(gib * 1024)} MiB`;
}
