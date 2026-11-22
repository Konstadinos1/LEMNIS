import yaml from 'js-yaml';
import { estimateProjectSavings } from '../estimator/estimator.js';
import { DEFAULT_MARKUP_PERCENT, HOURS_PER_MONTH } from '../pricing/catalog.js';
import { type LemnisManifest, type ServiceManifest, parseSizeToMiB } from '../schema/manifest.js';

// Akash blocks average ~6 seconds -> ~600 blocks/hour -> ~438,000 blocks/month.
const AKASH_BLOCKS_PER_HOUR = 600;
const MICRO_UUSD_PER_USD = 1_000_000;

interface SdlExposeEntry {
  port: number;
  as?: number;
  to: Array<{ global?: boolean; service?: string }>;
}

/**
 * Deterministically generate an Akash SDL v2.0 deployment manifest from a validated
 * lemnis.yaml specification, enforcing per-service 50% savings bid caps.
 */
export function generateAkashSdl(
  manifest: LemnisManifest,
  markupPercent: number = DEFAULT_MARKUP_PERCENT,
): string {
  const estimate = estimateProjectSavings(manifest, markupPercent);
  const capByService = new Map(estimate.services.map((line) => [line.service, line.bidCapHourlyUsd]));
  const markupFactor = 1 + markupPercent / 100;

  const services: Record<string, unknown> = {};
  const computeProfiles: Record<string, unknown> = {};
  const placementGroups = new Map<string, Record<string, { denom: string; amount: number }>>();
  const deployment: Record<string, Record<string, { profile: string; count: number }>> = {};

  for (const name of Object.keys(manifest.services).sort()) {
    const svc = manifest.services[name];
    services[name] = buildSdlService(svc);
    computeProfiles[name] = buildComputeProfile(svc);

    const customerHourlyCap = capByService.get(name) ?? 0.05;
    const providerHourlyCapUsd = customerHourlyCap / markupFactor;
    const uusdPerBlock = Math.max(1, Math.floor((providerHourlyCapUsd * MICRO_UUSD_PER_USD) / AKASH_BLOCKS_PER_HOUR));

    const group = svc.placement;
    const pricingMap = placementGroups.get(group) ?? {};
    pricingMap[name] = { denom: 'uact', amount: uusdPerBlock };
    placementGroups.set(group, pricingMap);

    deployment[name] = {
      [group]: { profile: name, count: 1 },
    };
  }

  const placement: Record<string, unknown> = {};
  for (const groupName of Array.from(placementGroups.keys()).sort()) {
    const attributes: Record<string, string> = {};
    if (manifest.region) {
      attributes.region = manifest.region;
    }
    placement[groupName] = {
      ...(Object.keys(attributes).length > 0 ? { attributes } : {}),
      signedBy: { anyOf: ['akash1365yvmc4s7awdyj3n2sav7xfx76adc6dnmlx63'] },
      pricing: placementGroups.get(groupName),
    };
  }

  const sdlDoc = {
    version: '2.0',
    services,
    profiles: {
      compute: computeProfiles,
      placement,
    },
    deployment,
  };

  const header = [
    `# Generated deterministically by @lemnis/sdk for project "${manifest.project}"`,
    `# Enforces <=50% of AWS on-demand baseline (or custom max_monthly_price) across ${HOURS_PER_MONTH}h/mo`,
  ].join('\n');

  return `${header}\n${yaml.dump(sdlDoc, { noRefs: true, lineWidth: 100, sortKeys: false })}`;
}

function buildSdlService(svc: ServiceManifest): Record<string, unknown> {
  const expose: SdlExposeEntry[] = svc.expose.map((rule) => {
    const targets: Array<{ global?: boolean; service?: string }> = [];
    if (rule.as !== undefined) {
      targets.push({ global: true });
    }
    if (rule.to) {
      for (const peer of rule.to) {
        targets.push({ service: peer });
      }
    }
    if (targets.length === 0) {
      targets.push({ global: true });
    }
    return {
      port: rule.port,
      ...(rule.as !== undefined ? { as: rule.as } : {}),
      to: targets,
    };
  });

  const envList = Object.entries(svc.env)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`);

  return {
    image: svc.image,
    ...(svc.command ? { command: svc.command } : {}),
    ...(envList.length > 0 ? { env: envList } : {}),
    ...(expose.length > 0 ? { expose } : {}),
  };
}

function buildComputeProfile(svc: ServiceManifest): Record<string, unknown> {
  const memoryMiB = parseSizeToMiB(svc.memory);
  const storageMiB = parseSizeToMiB(svc.storage);

  const resources: Record<string, unknown> = {
    cpu: { units: svc.cpu },
    memory: { size: `${memoryMiB}Mi` },
    storage: [{ size: `${storageMiB}Mi` }],
  };

  if (svc.gpu) {
    resources.gpu = {
      units: svc.gpu.count,
      attributes: {
        vendor: {
          nvidia: [{ model: svc.gpu.model }],
        },
      },
    };
  }

  return { resources };
}
