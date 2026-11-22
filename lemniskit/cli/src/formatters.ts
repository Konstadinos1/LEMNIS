import type { ProjectSavingsEstimate } from '@lemnis/sdk';

export function formatUsd(amount: number): string {
  return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function pad(text: string, width: number, right = false): string {
  if (text.length >= width) return text.slice(0, width);
  const gap = ' '.repeat(width - text.length);
  return right ? `${gap}${text}` : `${text}${gap}`;
}

export function formatEstimateTable(est: ProjectSavingsEstimate): string {
  const lines: string[] = [
    `LEMNIS estimate vs AWS on-demand (us-east-1) · checked ${est.pricesCheckedAt} · markup ${est.markupPercent}%`,
    '',
    `${pad('SERVICE', 14)} ${pad('AWS BASELINE', 28)} ${pad('AWS $/mo', 12, true)} ${pad('LEMNIS $/mo', 13, true)} ${pad('SAVED', 8, true)}`,
    '─'.repeat(79),
  ];

  for (const svc of est.services) {
    const marker = svc.confidence === 'estimate' ? '*' : '';
    const lemnisLabel = `${formatUsd(svc.lemnisMonthlyUsd)}${marker}`;
    lines.push(
      `${pad(svc.service, 14)} ${pad(svc.awsBaselineLabel, 28)} ${pad(formatUsd(svc.awsMonthlyUsd), 12, true)} ${pad(lemnisLabel, 13, true)} ${pad(`${svc.savedPercent}%`, 8, true)}`,
    );
  }

  if (est.internetEgressGiB > 0) {
    lines.push(
      `${pad('egress', 14)} ${pad(`${est.internetEgressGiB} GiB internet`, 28)} ${pad(formatUsd(est.awsEgressMonthlyUsd), 12, true)} ${pad(formatUsd(0), 13, true)} ${pad('100%', 8, true)}`,
    );
  }

  if (est.fromAwsGiB > 0) {
    lines.push(
      `${pad('from_aws', 14)} ${pad(`${est.fromAwsGiB} GiB still paid to AWS`, 28)} ${pad(formatUsd(0), 12, true)} ${pad(formatUsd(est.fromAwsStillPaidToAwsUsd), 13, true)} ${pad('—', 8, true)}`,
    );
  }

  lines.push('─'.repeat(79));
  lines.push(
    `${pad('TOTAL', 14)} ${pad(est.region ? `region: ${est.region}` : 'region: global', 28)} ${pad(formatUsd(est.totalAwsMonthlyUsd), 12, true)} ${pad(formatUsd(est.totalLemnisMonthlyUsd), 13, true)} ${pad(`${est.totalSavedPercent}%`, 8, true)}`,
  );

  if (est.notes.length > 0) {
    lines.push('');
    for (const note of est.notes) {
      lines.push(`  ℹ ${note}`);
    }
  }

  return lines.join('\n');
}
