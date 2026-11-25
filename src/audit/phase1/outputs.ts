/** The files a Phase 1 run produces, and a browser download fallback for them. */
import { Platform } from 'react-native';
import { AUDIT_MATERIALS } from '../generated/auditMaterials';
import type { DriveFile } from '../googleDrive.types';
import type { ReadResult } from '../readAuditFiles';
import type { Phase1Result } from './runPhase1';

export interface Phase1Outputs {
  files: DriveFile[];
  /** Set when the output needs a human look (cut off, or not valid JSON). */
  warning?: string;
}

export function phase1Outputs({
  auditName,
  startedAt,
  data,
  result,
}: {
  auditName: string;
  startedAt: Date;
  data: ReadResult;
  result: Phase1Result;
}): Phase1Outputs {
  const files: DriveFile[] = [];
  let warning: string | undefined;

  if (result.output !== null) {
    files.push({ name: 'phase_1_output.json', mimeType: 'application/json', content: JSON.stringify(result.output, null, 2) });
  } else {
    warning =
      result.stopReason === 'max_tokens'
        ? 'The model hit its output limit before finishing, so the output is incomplete. It was saved as raw text.'
        : "The model's reply wasn't valid JSON. It was saved as raw text so you can check it.";
    files.push({ name: 'phase_1_output_raw.txt', mimeType: 'text/plain', content: result.rawText });
  }

  const log = {
    audit_name: auditName,
    phase: 1,
    started_at: startedAt.toISOString(),
    finished_at: new Date().toISOString(),
    provider: result.provider,
    model: result.model,
    stop_reason: result.stopReason,
    // null where the provider didn't report usage.
    usage: { input_tokens: result.usage.inputTokens, output_tokens: result.usage.outputTokens },
    size_check: { input_tokens: result.inputCheck.tokens, estimated: result.inputCheck.estimated },
    output_valid_json: result.output !== null,
    materials: {
      prompt: 'audit_process/phase_1/p1_prompt.txt',
      documents: (AUDIT_MATERIALS[1]?.documents ?? []).map((d) => `audit_process/phase_1/${d.name}`),
    },
    files_included: data.files.map((f) => ({ id: f.id, path: f.path, kind: f.kind, records: f.records })),
    files_skipped: data.skipped,
  };
  files.push({ name: 'phase_1_run_log.json', mimeType: 'application/json', content: JSON.stringify(log, null, 2) });

  return { files, warning };
}

export const canDownload = Platform.OS === 'web';

/** Web only: saves each file through the browser's downloads. */
export function downloadFiles(files: DriveFile[], prefix: string): void {
  if (!canDownload) return;
  const safe = prefix.replace(/[^\w.-]+/g, '_').slice(0, 60);
  for (const f of files) {
    const url = URL.createObjectURL(new Blob([f.content], { type: f.mimeType }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${safe}_${f.name}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
