import yaml from 'js-yaml';
import { z } from 'zod';

const SIZE_PATTERN = /^(\d+(?:\.\d+)?)(Mi|Gi|Ti)$/i;
const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const SUSPICIOUS_SECRET_KEY = /(SECRET|PASSWORD|PASSWD|TOKEN|PRIVATE_KEY|API_KEY|DATABASE_URL|AUTH_KEY)/i;

/** Convert Kubernetes-style byte size string (e.g. "512Mi", "8Gi", "1Ti") into MiB. */
export function parseSizeToMiB(raw: string): number {
  const match = SIZE_PATTERN.exec(raw.trim());
  if (!match) {
    throw new Error(`Invalid size "${raw}". Expected suffixes Mi, Gi, or Ti (e.g. "512Mi", "8Gi").`);
  }
  const value = Number(match[1]);
  const unit = match[2].toLowerCase();
  if (unit === 'mi') return Math.round(value);
  if (unit === 'gi') return Math.round(value * 1024);
  return Math.round(value * 1024 * 1024);
}

const SizeSchema = z.string().refine((val) => SIZE_PATTERN.test(val.trim()), {
  message: 'Expected size with unit Mi, Gi, or Ti (e.g. "8Gi", "512Mi")',
});

const ExposeSchema = z.object({
  port: z.number().int().min(1).max(65535),
  as: z.number().int().min(1).max(65535).optional(),
  to: z.array(z.string().min(1)).optional(),
});

const GpuSchema = z.object({
  model: z.enum(['h100', 'a100', 'l40s']),
  count: z.number().int().min(1).max(8),
});

const UsageSchema = z.object({
  egress: SizeSchema.optional(),
  from_aws: SizeSchema.optional(),
});

const ServiceSchema = z.object({
  image: z.string().min(3).max(256),
  cpu: z.number().min(0.1).max(64),
  memory: SizeSchema,
  storage: SizeSchema.default('10Gi'),
  gpu: GpuSchema.optional(),
  expose: z.array(ExposeSchema).default([]),
  env: z.record(z.string(), z.string()).default({}),
  command: z.array(z.string()).optional(),
  placement: z.string().regex(SLUG_PATTERN, 'Placement group must be a lowercase slug').default('default'),
  today: z.object({ aws: z.string().min(2) }).optional(),
  usage: UsageSchema.optional(),
  max_monthly_price: z.number().positive().optional(),
});

export const LemnisManifestSchema = z.object({
  version: z.union([z.literal('1'), z.literal('1.0')]).default('1'),
  project: z.string().regex(SLUG_PATTERN, 'Project name must be 2-63 lowercase alphanumeric chars or hyphens'),
  region: z.string().min(2).max(32).optional(),
  services: z.record(
    z.string().regex(SLUG_PATTERN, 'Service name must be a lowercase slug'),
    ServiceSchema,
  ).refine((svcs) => Object.keys(svcs).length > 0, {
    message: 'At least one service must be declared under services:',
  }),
});

export type ServiceManifest = z.infer<typeof ServiceSchema>;
export type LemnisManifest = z.infer<typeof LemnisManifestSchema>;

export interface ManifestParseResult {
  manifest: LemnisManifest;
  warnings: string[];
}

/**
 * Parse and validate a lemnis.yaml string, returning both the typed manifest
 * and security/confidentiality warnings (e.g. secret-looking env keys).
 */
export function parseLemnisYaml(yamlContent: string): ManifestParseResult {
  let raw: unknown;
  try {
    raw = yaml.load(yamlContent, { schema: yaml.JSON_SCHEMA });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`YAML syntax error: ${msg}`);
  }

  const parsed = LemnisManifestSchema.safeParse(raw);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'root'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid lemnis.yaml: ${details}`);
  }

  const warnings = collectManifestWarnings(parsed.data);
  return { manifest: parsed.data, warnings };
}

function collectManifestWarnings(manifest: LemnisManifest): string[] {
  const warnings: string[] = [];
  for (const [serviceName, svc] of Object.entries(manifest.services)) {
    if (svc.image.endsWith(':latest') || !svc.image.includes(':')) {
      warnings.push(`Service "${serviceName}" uses an unpinned image tag ("${svc.image}"). Pin an explicit version tag or digest.`);
    }
    for (const envKey of Object.keys(svc.env)) {
      if (SUSPICIOUS_SECRET_KEY.test(envKey)) {
        warnings.push(
          `Service "${serviceName}" defines env "${envKey}". Never place plaintext secrets in lemnis.yaml — Akash providers can inspect container env vars.`,
        );
      }
    }
    if (svc.usage?.from_aws && !manifest.region) {
      warnings.push(
        `Service "${serviceName}" declares usage.from_aws without a pinned region. Set "region: us-east" to keep latency low near AWS.`,
      );
    }
  }
  return warnings;
}

export function createStarterManifestYaml(projectName: string): string {
  const safeName = projectName
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'my-lemnis-app';

  return `version: "1"
project: ${safeName}
region: us-east
services:
  api:
    image: ghcr.io/lemnis-cloud/demo-api:1.2.0
    cpu: 2
    memory: 8Gi
    storage: 20Gi
    expose:
      - port: 8080
        as: 80
    env:
      NODE_ENV: production
      LOG_LEVEL: info
    today:
      aws: m7i.large
    usage:
      egress: 500Gi
      from_aws: 50Gi
`;
}
