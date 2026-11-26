/**
 * The ten consulting steps, in the order the pipeline runs them, and the
 * prompts and documents each one is sent with.
 *
 * A step runs only if audit_process/phase_<P>/step_<S>_prompt.txt exists. Add
 * that file (and rebuild) to turn a step on; steps without one are skipped and
 * logged. Phase 1 runs Step 3 before Step 2, as the architecture recommends:
 * skills are inferred from finished task records, not chat noise.
 */
import { AUDIT_MATERIALS } from '../generated/auditMaterials';
import { pdfRecords } from '../readAuditFiles';

export type Strategy =
  /** Field map → identities → one prompt per batch of people. */
  | 'timelines'
  /** One prompt per batch of events that share a work-item key. */
  | 'tasks'
  /** One prompt per batch of teams. */
  | 'byTeam'
  /** The listed earlier outputs, split across prompts only if they don't fit in one. */
  | 'outputs';

export interface StepDef {
  step: number;
  phase: number;
  title: string;
  strategy: Strategy;
  /** Earlier steps whose outputs this step reads (for byTeam and outputs). */
  inputs: number[];
}

export const STEPS: StepDef[] = [
  { step: 1, phase: 1, title: "Timelines of each person's work", strategy: 'timelines', inputs: [] },
  { step: 3, phase: 1, title: 'Task records', strategy: 'tasks', inputs: [1] },
  { step: 2, phase: 1, title: 'Work and skill signals', strategy: 'outputs', inputs: [1, 3] },
  { step: 4, phase: 2, title: 'Time allocation and wait time', strategy: 'byTeam', inputs: [1, 3] },
  { step: 5, phase: 2, title: 'Aggregate and compare teams', strategy: 'outputs', inputs: [4] },
  { step: 6, phase: 2, title: 'Reach, Acquire, Convert, Expand', strategy: 'outputs', inputs: [3, 5] },
  { step: 7, phase: 3, title: 'Find the bottlenecks', strategy: 'outputs', inputs: [4, 5, 6] },
  { step: 8, phase: 3, title: 'ROI: what each bottleneck costs', strategy: 'outputs', inputs: [4, 7] },
  { step: 9, phase: 4, title: 'Fixes', strategy: 'outputs', inputs: [7, 8] },
  { step: 10, phase: 5, title: 'Report and scorecard', strategy: 'outputs', inputs: [5, 7, 8, 9] },
];

export const PHASES = [1, 2, 3, 4, 5];

/** The step's own prompt, or null if it has none (the step is skipped). */
export function stepPrompt(def: StepDef): string | null {
  return AUDIT_MATERIALS[def.phase]?.stepPrompts[def.step] ?? null;
}

/** System prompt for every call in a step: the phase prompt, then the step's instructions. */
export function systemPrompt(def: StepDef): string {
  const phase = AUDIT_MATERIALS[def.phase]?.prompt;
  const step = stepPrompt(def) ?? '';
  return [
    phase,
    `--- STEP ${def.step} INSTRUCTIONS ---\n` +
      `This prompt covers Step ${def.step} (${def.title}) only, and is one of several separate prompts. ` +
      'Where anything above asks for the full output of the phase, these step instructions and the PIPELINE TASK in the message take precedence.\n\n' +
      step,
  ]
    .filter(Boolean)
    .join('\n\n');
}

const pdfText = new Map<string, string>();

/** The phase's reference documents (briefs), as message blocks. PDFs are turned into text once. */
export function phaseDocuments(phase: number): string[] {
  const m = AUDIT_MATERIALS[phase];
  if (!m) return [];
  const docs = m.documents.map((d) => ({ name: d.name, text: d.text }));
  for (const p of m.pdfs) {
    let text = pdfText.get(p.name);
    if (text === undefined) {
      try {
        const bytes = Uint8Array.from(atob(p.base64), (ch) => ch.charCodeAt(0));
        text = pdfRecords('D', bytes)
          .map((r) => r.text)
          .join('\n');
      } catch {
        text = '';
      }
      pdfText.set(p.name, text);
    }
    if (text) docs.push({ name: p.name, text });
  }
  return docs.map((d) => `<reference_document name="${d.name}">\n${d.text}\n</reference_document>`);
}
