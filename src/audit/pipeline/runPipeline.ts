/**
 * Runs the audit one step at a time, without stopping:
 *
 *   Phase 1: Step 1 → Step 3 → Step 2      (save Phase 1)
 *   Phase 2: Step 4 → Step 5 → Step 6      (save Phase 2)
 *   Phase 3: Step 7 → Step 8               (save Phase 3)
 *   Phase 4: Step 9                        (save Phase 4)
 *   Phase 5: Step 10                       (save Phase 5)
 *
 * Every model call is a new prompt (no conversation carries over), and calls
 * run one at a time. A step uses as many prompts as its data needs: data is
 * split into batches that fit DATA_BUDGET, each batch goes in its own prompt,
 * and the code merges the replies. A reply cut off at the length limit is
 * retried as two smaller batches.
 *
 * Steps without a prompt file are skipped (see steps.ts). Real names and emails
 * found by Step 1 are replaced by person IDs before data is sent to later
 * prompts, and the identity mapping itself is never saved.
 */
import type { DriveFile } from '../googleDrive.types';
import { type AuditRecord, fileBlock, type ReadFile, type ReadResult } from '../readAuditFiles';
import { AuditRunError, estimateTokens, type ModelClient } from './modelClient';
import { phaseDocuments, PHASES, STEPS, type StepDef, stepPrompt, systemPrompt } from './steps';

/** Estimated tokens of data per prompt. Small enough for most providers' models, with room for the brief and the reply. */
const DATA_BUDGET = 60_000;
/** CSV/text records per group when records have no work-item key. */
const UNKEYED_CHUNK = 150;

type Json = Record<string, unknown>;

export interface StepStatus {
  step: number;
  phase: number;
  title: string;
  status: 'done' | 'skipped' | 'failed' | 'not run';
  reason?: string;
  prompts: number;
}

export interface PipelineResult {
  steps: StepStatus[];
  /** Every file produced, across phases. */
  files: DriveFile[];
}

interface CallLog {
  step: number;
  part: string;
  attempt: number;
  stop_reason: string | null;
  model: string;
  input_tokens: number | null;
  output_tokens: number | null;
  valid_json: boolean;
}

interface Person {
  person_id: string;
  team_id: string | null;
  /** Real identifiers — internal only, never saved or sent after Step 1's identity prompt. */
  identifiers: string[];
}

interface Identity {
  people: Person[];
  /** Per file: which columns/properties identify people and work items. */
  fileFields: Map<string, { person: string[]; team: string | null; workItem: string[] }>;
  /** Record handle → person IDs it belongs to. */
  recordPeople: Map<string, string[]>;
  scrub: (text: string) => string;
}

interface Ctx {
  client: ModelClient;
  auditName: string;
  data: ReadResult;
  signal?: AbortSignal;
  progress: (message: string) => void;
  /** Saved form of each finished step's output. */
  outputs: Map<number, Json>;
  /** Working sections (named working_*) passed to later steps but never saved. */
  working: Map<number, Json>;
  identity: Identity | null;
  calls: CallLog[];
  /** Replies that weren't valid JSON even after a retry, kept for a human to read. */
  rawReplies: DriveFile[];
}

export async function runAuditPipeline({
  client,
  auditName,
  data,
  signal,
  onProgress,
  onPhaseComplete,
}: {
  client: ModelClient;
  auditName: string;
  data: ReadResult;
  signal?: AbortSignal;
  onProgress?: (message: string) => void;
  /** Called after each phase with that phase's files, e.g. to save them to Drive. */
  onPhaseComplete?: (phase: number, files: DriveFile[]) => Promise<void>;
}): Promise<PipelineResult> {
  if (!data.files.length) throw new AuditRunError('None of the files in this folder could be read.');
  const ctx: Ctx = {
    client,
    auditName,
    data,
    signal,
    progress: (m) => onProgress?.(m),
    outputs: new Map(),
    working: new Map(),
    identity: null,
    calls: [],
    rawReplies: [],
  };
  const statuses: StepStatus[] = STEPS.map((d) => ({ step: d.step, phase: d.phase, title: d.title, status: 'not run', prompts: 0 }));
  const allFiles: DriveFile[] = [];

  for (const phase of PHASES) {
    const phaseSteps = STEPS.filter((d) => d.phase === phase);
    const startedAt = new Date();
    const callsBefore = ctx.calls.length;
    const rawBefore = ctx.rawReplies.length;
    let failure: unknown = null;

    for (const def of phaseSteps) {
      const status = statuses.find((s) => s.step === def.step)!;
      if (!stepPrompt(def)) {
        status.status = 'skipped';
        status.reason = `No prompt yet (audit_process/phase_${def.phase}/step_${def.step}_prompt.txt).`;
        continue;
      }
      const before = ctx.calls.length;
      try {
        const output = await runStep(ctx, def);
        const { saved, working } = splitWorking(output);
        ctx.outputs.set(def.step, saved);
        ctx.working.set(def.step, working);
        status.status = 'done';
      } catch (e) {
        if (signal?.aborted) throw e;
        status.status = 'failed';
        status.reason = e instanceof Error ? e.message : String(e);
        failure = e;
      } finally {
        status.prompts = ctx.calls.length - before;
      }
      if (failure) break;
    }

    // Save the phase: each finished step's output, unreadable replies, and a log.
    const ran = phaseSteps.filter((d) => ctx.outputs.has(d.step));
    if (ran.length || failure) {
      const files: DriveFile[] = ran.map((d) => ({
        name: `phase_${phase}_step_${d.step}_output.json`,
        mimeType: 'application/json',
        content: JSON.stringify(ctx.outputs.get(d.step), null, 2),
      }));
      files.push(...ctx.rawReplies.slice(rawBefore));
      files.push({
        name: `phase_${phase}_log.json`,
        mimeType: 'application/json',
        content: JSON.stringify(
          {
            audit_name: auditName,
            phase,
            started_at: startedAt.toISOString(),
            finished_at: new Date().toISOString(),
            provider: client.provider.label,
            model: client.model,
            steps: statuses.filter((s) => s.phase === phase),
            prompts: ctx.calls.slice(callsBefore),
            ...(phase === 1 ? { files_included: data.files.map((f) => ({ id: f.id, path: f.path, kind: f.kind, records: f.records.length })), files_skipped: data.skipped } : {}),
          },
          null,
          2,
        ),
      });
      allFiles.push(...files);
      ctx.progress(`Saving Phase ${phase}…`);
      await onPhaseComplete?.(phase, files);
    }
    if (failure) {
      throw failure instanceof AuditRunError ? failure : new AuditRunError(`Phase ${phase} stopped: ${String((failure as Error)?.message ?? failure)}`);
    }
  }
  return { steps: statuses, files: allFiles };
}

/** Sections named working_* go to later steps only; everything else is saved. */
function splitWorking(output: Json): { saved: Json; working: Json } {
  const saved: Json = {};
  const working: Json = {};
  for (const [k, v] of Object.entries(output)) (k.startsWith('working_') ? working : saved)[k] = v;
  return { saved, working };
}

function runStep(ctx: Ctx, def: StepDef): Promise<Json> {
  switch (def.strategy) {
    case 'timelines':
      return runTimelines(ctx, def);
    case 'tasks':
      return runTasks(ctx, def);
    case 'byTeam':
      return runByTeam(ctx, def);
    default:
      return runOnOutputs(ctx, def);
  }
}

// ---------------------------------------------------------------------------
// Prompts and batching
// ---------------------------------------------------------------------------

const RETRY_NOTE =
  'PIPELINE NOTE: Your previous reply to this prompt was not a valid JSON object. Reply again with only the JSON object, nothing before or after it.';

/** One prompt (plus one retry if the reply isn't JSON). Returns null if it never gave JSON. */
async function ask(ctx: Ctx, def: StepDef, part: string, blocks: string[]): Promise<{ json: Json | null; cutOff: boolean }> {
  const label = `Phase ${def.phase} · Step ${def.step} · ${part}`;
  let lastText = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    ctx.progress(`${label}${attempt ? ' (retry)' : ''}…`);
    const reply = await ctx.client.call({
      system: systemPrompt(def),
      blocks: [...phaseDocuments(def.phase), ...blocks, ...(attempt ? [RETRY_NOTE] : [])],
      signal: ctx.signal,
      onChars: (n) => ctx.progress(`${label}${attempt ? ' (retry)' : ''} · ${n ? `${Math.round(n / 1000)}K characters written` : 'thinking…'}`),
    });
    const json = reply.json && typeof reply.json === 'object' && !Array.isArray(reply.json) ? (reply.json as Json) : null;
    ctx.calls.push({
      step: def.step,
      part,
      attempt,
      stop_reason: reply.stopReason,
      model: reply.model,
      input_tokens: reply.usage.inputTokens,
      output_tokens: reply.usage.outputTokens,
      valid_json: !!json,
    });
    if (json) return { json, cutOff: false };
    lastText = reply.text;
    if (reply.stopReason === 'max_tokens') return { json: null, cutOff: true };
  }
  ctx.rawReplies.push({
    name: `phase_${def.phase}_step_${def.step}_${part.replace(/\W+/g, '_').toLowerCase()}_raw.txt`,
    mimeType: 'text/plain',
    content: lastText,
  });
  return { json: null, cutOff: false };
}

interface Unit {
  text: string;
}

/** Packs units into batches of about DATA_BUDGET tokens. A unit bigger than the budget goes alone. */
function pack<T extends Unit>(units: T[]): T[][] {
  const batches: T[][] = [];
  let cur: T[] = [];
  let size = 0;
  for (const u of units) {
    const t = estimateTokens(u.text.length);
    if (cur.length && size + t > DATA_BUDGET) {
      batches.push(cur);
      cur = [];
      size = 0;
    }
    cur.push(u);
    size += t;
  }
  if (cur.length) batches.push(cur);
  return batches;
}

/**
 * Sends units in as many prompts as needed and merges the replies. A batch whose
 * reply was cut off is split in two and sent again.
 */
async function runBatches<T extends Unit>(
  ctx: Ctx,
  def: StepDef,
  units: T[],
  build: (batch: T[], index: number, total: number) => string[],
): Promise<Json> {
  const queue = pack(units);
  const results: Json[] = [];
  let sent = 0;
  let failed = 0;
  while (queue.length) {
    const batch = queue.shift()!;
    sent++;
    const total = sent + queue.length;
    const r = await ask(ctx, def, `prompt ${sent} of ${total}`, build(batch, sent, total));
    if (r.cutOff && batch.length > 1) {
      const mid = Math.ceil(batch.length / 2);
      queue.unshift(batch.slice(0, mid), batch.slice(mid));
      continue;
    }
    if (r.json) results.push(r.json);
    else failed++;
  }
  if (!results.length) throw new AuditRunError(`Step ${def.step} produced no usable output (${failed} prompt(s) failed).`);
  const merged = mergeResults(results);
  if (failed) merged.pipeline_warnings = [`${failed} of ${sent} prompts in this step gave no usable JSON; their raw replies are saved.`];
  return merged;
}

/** Arrays are concatenated across prompts; anything else is kept per prompt. */
function mergeResults(list: Json[]): Json {
  if (list.length === 1) return list[0];
  const out: Json = {};
  for (const r of list) {
    for (const [k, v] of Object.entries(r)) {
      if (Array.isArray(v)) out[k] = [...((out[k] as unknown[]) ?? []), ...v];
      else ((out[`${k}_by_prompt`] ??= []) as unknown[]).push(v);
    }
  }
  return out;
}

const task = (def: StepDef, part: string, body: string) => `PIPELINE TASK (Step ${def.step}, ${part})\n${body}`;

// ---------------------------------------------------------------------------
// Step 1 (timelines): field map → identities → timelines by person
// ---------------------------------------------------------------------------

async function ensureIdentity(ctx: Ctx, def: StepDef): Promise<{ identity: Identity; meta: Json }> {
  if (ctx.identity) return { identity: ctx.identity, meta: {} };
  const files = ctx.data.files;

  // 1. Field map, from the first records of each file.
  const samples = files.map((f) => `${fileBlock(f, f.records.slice(0, 15))}\n(${f.records.length} records in this file in total)`);
  const fm = await ask(ctx, def, 'field map', [
    task(
      def,
      'field map',
      'You are seeing only the first records of each file. Build the field map and readiness notes described in the brief. ' +
        'Return only this JSON:\n' +
        '{"field_map":[{"concept":"","file_id":"","fields":[""],"unit":"","transformation":"","status":"found|candidate|missing"}],' +
        '"files":[{"file_id":"F1","person_fields":[""],"team_field":null,"work_item_fields":[""]}],' +
        '"assumptions":[""],"open_questions":[""]}\n' +
        'person_fields: the exact column names (CSV) or property names (calendar: ORGANIZER, ATTENDEE) that identify a person. ' +
        'team_field: the column naming the person\'s team, or null. work_item_fields: columns holding a project, engagement, booking or work-item code.',
    ),
    samples.join('\n\n'),
  ]);
  if (!fm.json) throw new AuditRunError('Step 1 could not build a field map from these files.');

  const fileFields = new Map<string, { person: string[]; team: string | null; workItem: string[] }>();
  for (const f of (fm.json.files as any[]) ?? []) {
    if (!f?.file_id) continue;
    fileFields.set(String(f.file_id), {
      person: Array.isArray(f.person_fields) ? f.person_fields.map(String) : [],
      team: typeof f.team_field === 'string' ? f.team_field : null,
      workItem: Array.isArray(f.work_item_fields) ? f.work_item_fields.map(String) : [],
    });
  }

  // 2. Identities, from the distinct identifier values only (not the full records).
  const tuples = collectIdentityTuples(files, fileFields);
  if (!tuples.length) throw new AuditRunError('Step 1 found no columns identifying people, so timelines cannot be built. Phase 1 needs a person identifier.');
  const tupleText = tuples
    .map((t) => `${t.example} ${t.fields.join('/')}: ${t.values.join(' | ')}${t.team ? ` (team: ${t.team})` : ''} ×${t.count}`)
    .join('\n');

  let people: Person[];
  let review: unknown[] = [];
  let method: string;
  if (estimateTokens(tupleText.length) <= DATA_BUDGET * 2) {
    const id = await ask(ctx, def, 'identities', [
      task(
        def,
        'identities',
        'Below is every distinct combination of person identifiers in the data, with an example record handle and a count. ' +
          'Resolve who is who following the brief\'s identity rules (merge only at probability >= 0.95; borderline pairs stay separate and go on the review list). ' +
          'Assign person IDs P001, P002, … in order. Copy identifier values exactly as written; every value listed must belong to exactly one person. ' +
          'Return only this JSON:\n' +
          '{"people":[{"person_id":"P001","team_id":null,"identifiers":[""]}],"identity_review":[{"records":["F1:R3","F2:E7"],"match_probability":0.8,"reason":""}]}',
      ),
      tupleText,
    ]);
    if (!id.json) throw new AuditRunError('Step 1 could not resolve identities.');
    people = ((id.json.people as any[]) ?? [])
      .filter((p) => p?.person_id)
      .map((p) => ({
        person_id: String(p.person_id),
        team_id: p.team_id == null ? null : String(p.team_id),
        identifiers: Array.isArray(p.identifiers) ? p.identifiers.map(String) : [],
      }));
    review = Array.isArray(id.json.identity_review) ? id.json.identity_review : [];
    method = 'Model, from distinct identifier combinations';
  } else {
    people = exactMatchPeople(tuples);
    method = 'Exact matching in code only (too many identities for one prompt); no fuzzy matches were made';
  }

  // Identifiers the model left out still need a person, so nothing silently drops.
  // First attach them to a person they share an exact value with (repeating until
  // nothing changes, so links through other records are followed), then group the
  // rest by exact shared values.
  const known = new Map<string, string>();
  const byId = new Map(people.map((p) => [p.person_id, p]));
  for (const p of people) for (const v of p.identifiers) known.set(norm(v), p.person_id);
  for (let changed = true; changed; ) {
    changed = false;
    for (const t of tuples) {
      const hit = t.values.find((v) => known.has(norm(v)));
      if (!hit) continue;
      const person = byId.get(known.get(norm(hit))!)!;
      for (const v of t.values) {
        if (known.has(norm(v))) continue;
        person.identifiers.push(v);
        known.set(norm(v), person.person_id);
        changed = true;
      }
    }
  }
  const rest = tuples.filter((t) => !t.values.some((v) => known.has(norm(v))));
  const added = exactMatchPeople(rest).map((p, i) => ({ ...p, person_id: `P${String(people.length + i + 1).padStart(3, '0')}` }));
  for (const p of added) {
    people.push(p);
    byId.set(p.person_id, p);
    for (const v of p.identifiers) known.set(norm(v), p.person_id);
  }
  // A person with no team yet takes the team from any of their records that names one.
  for (const t of tuples) {
    const person = t.team ? byId.get(known.get(norm(t.values[0])) ?? '') : undefined;
    if (person && !person.team_id) person.team_id = t.team;
  }

  // 3. Which records belong to whom.
  const recordPeople = new Map<string, string[]>();
  for (const f of files) {
    for (const r of f.records) {
      const ids = new Set<string>();
      for (const v of identifiersIn(f, r, fileFields.get(f.id))) {
        const pid = known.get(norm(v));
        if (pid) ids.add(pid);
      }
      if (ids.size) recordPeople.set(r.handle, [...ids]);
    }
  }

  ctx.identity = { people, fileFields, recordPeople, scrub: makeScrubber(people) };
  return {
    identity: ctx.identity,
    meta: {
      field_map: fm.json.field_map ?? [],
      assumptions: fm.json.assumptions ?? [],
      open_questions: fm.json.open_questions ?? [],
      identity_method: method,
      ...(added.length ? { identities_added_by_code: added.length } : {}),
      identity_review: review,
    },
  };
}

async function runTimelines(ctx: Ctx, def: StepDef): Promise<Json> {
  const { identity, meta } = await ensureIdentity(ctx, def);
  const byPerson = groupRecords(ctx.data.files, (r) => identity.recordPeople.get(r.handle) ?? []);
  const unassigned = ctx.data.files.reduce((n, f) => n + f.records.filter((r) => !identity.recordPeople.has(r.handle)).length, 0);

  const units = identity.people
    .filter((p) => byPerson.has(p.person_id))
    .map((p) => ({
      id: p.person_id,
      text:
        `<person id="${p.person_id}" team="${p.team_id ?? ''}">\n` +
        groupBlocks(ctx.data.files, byPerson.get(p.person_id)!, identity.scrub) +
        '\n</person>',
    }));

  const result = await runBatches(ctx, def, units, (batch, i, n) => [
    task(
      def,
      `timelines, prompt ${i} of ${n}`,
      `Identity resolution is done. Each person below is final, with their records grouped under them, and names and emails already replaced by person IDs. ` +
        `Build the timeline for each person in this prompt (${batch.map((u) => u.id).join(', ')}) following the brief's Step 1 rules. ` +
        'Return only this JSON:\n' +
        '{"timelines":[/* one entry per person, as the brief\'s output contract defines */],"excluded_records":[{"handle":"","reason":""}],"open_questions":[""]}',
    ),
    batch.map((u) => u.text).join('\n\n'),
  ]);

  const { identity_review, open_questions, ...runMeta } = meta;
  return {
    run_metadata: {
      ...runMeta,
      files_used: ctx.data.files.map((f) => ({ id: f.id, path: f.path, kind: f.kind, records: f.records.length })),
      files_skipped: ctx.data.skipped,
      records_without_a_person: unassigned,
    },
    people: identity.people.map((p) => ({
      person_id: p.person_id,
      team_id: p.team_id,
      source_files: [...new Set(ctx.data.files.filter((f) => f.records.some((r) => identity.recordPeople.get(r.handle)?.includes(p.person_id))).map((f) => f.id))],
    })),
    identity_review: identity_review ?? [],
    ...result,
    open_questions: [...((open_questions as unknown[]) ?? []), ...((result.open_questions as unknown[]) ?? [])],
  };
}

// ---------------------------------------------------------------------------
// Step 3 (tasks): events grouped by work-item key
// ---------------------------------------------------------------------------

async function runTasks(ctx: Ctx, def: StepDef): Promise<Json> {
  const { identity } = await ensureIdentity(ctx, def);
  const groups = new Map<string, Map<string, AuditRecord[]>>();
  const add = (key: string, fileId: string, r: AuditRecord) => {
    const g = groups.get(key) ?? new Map<string, AuditRecord[]>();
    g.set(fileId, [...(g.get(fileId) ?? []), r]);
    groups.set(key, g);
  };

  for (const f of ctx.data.files) {
    const fields = identity.fileFields.get(f.id);
    f.records.forEach((r, i) => {
      let key = '';
      if (f.kind === 'csv' && fields?.workItem.length) {
        key = fields.workItem.map((c) => r.cells?.[c] ?? '').filter(Boolean).join(' / ');
      } else if (f.kind === 'ics') {
        // Recurring meetings share a title; dates and numbers are dropped so each series groups together.
        key = (r.text.match(/SUMMARY[^:]*:([^|]+)/)?.[1] ?? '').toLowerCase().replace(/[\d/.-]+/g, '').trim();
      }
      add(key ? `work item: ${key}` : `${f.id} records without a work-item key, part ${Math.floor(i / UNKEYED_CHUNK) + 1}`, f.id, r);
    });
  }

  const files = new Map(ctx.data.files.map((f) => [f.id, f]));
  const units = [...groups.entries()].map(([key, byFile]) => ({
    text:
      `<group key="${identity.scrub(key).replace(/"/g, "'")}">\n` +
      [...byFile.entries()].map(([fid, recs]) => fileBlock(files.get(fid)!, recs.map((r) => ({ ...r, text: identity.scrub(r.text) })))).join('\n') +
      '\n</group>',
  }));
  const peopleList = identity.people.map((p) => `${p.person_id}${p.team_id ? ` (team ${p.team_id})` : ''}`).join('; ');

  const result = await runBatches(ctx, def, units, (_batch, i, n) => [
    task(
      def,
      `task records, prompt ${i} of ${n}`,
      'The events below are grouped by shared work-item key (or by file where they have none), with names and emails already replaced by person IDs. ' +
        `PEOPLE: ${peopleList}\n` +
        'Create task records for these events only, following the brief\'s Step 3 rules. A task record may cite only handles in this prompt. ' +
        'Return only this JSON:\n{"task_records":[/* as the brief defines */],"open_questions":[""]}',
    ),
    _batch.map((u) => u.text).join('\n\n'),
  ]);
  return { run_metadata: { grouping: 'Events grouped by work-item key; calendar events by title; records without a key in file-order chunks', groups: units.length }, ...result };
}

// ---------------------------------------------------------------------------
// Steps that work team by team (Step 4)
// ---------------------------------------------------------------------------

async function runByTeam(ctx: Ctx, def: StepDef): Promise<Json> {
  const { identity } = await ensureIdentity(ctx, def);
  const timelines = (ctx.outputs.get(1)?.timelines as any[]) ?? [];
  const tasks = (ctx.outputs.get(3)?.task_records as any[]) ?? [];
  const otherInputs = def.inputs
    .filter((s) => s !== 1 && s !== 3 && ctx.outputs.has(s))
    .map((s) => `<step_${s}_output>\n${JSON.stringify(ctx.outputs.get(s))}\n</step_${s}_output>`);

  const teams = new Map<string, Person[]>();
  for (const p of identity.people) {
    const key = p.team_id ?? '(no team in the data)';
    teams.set(key, [...(teams.get(key) ?? []), p]);
  }

  /** One person's Phase 1 timeline and task records, plus their raw records (scrubbed). */
  const memberText = (m: Person) => {
    const records = groupRecords(ctx.data.files, (r) => ((identity.recordPeople.get(r.handle) ?? []).includes(m.person_id) ? [m.person_id] : []));
    return (
      `<person id="${m.person_id}">\n` +
      `<phase1_timeline>${JSON.stringify(timelines.filter((t) => t?.person_id === m.person_id))}</phase1_timeline>\n` +
      `<phase1_task_records>${JSON.stringify(tasks.filter((t) => (t?.participants ?? []).some((p: any) => p?.actor_id === m.person_id)))}</phase1_task_records>\n` +
      `<raw_records>\n${groupBlocks(ctx.data.files, records.get(m.person_id) ?? [], identity.scrub)}\n</raw_records>\n</person>`
    );
  };

  const small: { team: string; text: string }[] = [];
  const results: Json[] = [];
  for (const [team, members] of teams) {
    const parts = members.map((m) => ({ id: m.person_id, text: memberText(m) }));
    const text = `<team id="${team}" people="${members.map((m) => m.person_id).join(',')}">\n${parts.map((p) => p.text).join('\n')}\n</team>`;
    if (estimateTokens(text.length) <= DATA_BUDGET) {
      small.push({ team, text });
      continue;
    }

    // Too big for one prompt: person-level values a few people at a time, then one prompt combines them for the team.
    const partResults = await runBatches(ctx, def, parts, (batch, i, n) => [
      task(
        def,
        `team ${team}, part ${i} of ${n}`,
        `Team ${team} has too much data for one prompt, so it is split into ${n} parts; this part holds ${batch.map((b) => b.id).join(', ')}. ` +
          'Compute the person-level values behind every Step 4 measure for these people only. Do not compute team-level results; a later prompt combines the parts. ' +
          'Return only this JSON:\n{"working_person_values":[{"team_id":"","measure_id":"","person_id":"","value":0,"unit":""}],' +
          '"working_part_notes":{"rows_excluded":[{"handle":"","reason":""}],"readiness":{}},"open_questions":[""]}',
      ),
      ...otherInputs,
      batch.map((b) => b.text).join('\n\n'),
    ]);
    const combine = await ask(ctx, def, `team ${team}, combine`, [
      task(
        def,
        `team ${team}, combine`,
        `Below are the person-level values and notes for all ${members.length} people in team ${team}, computed in separate prompts from their records. ` +
          'Produce this step\'s team-level sections for this team from them. Keep working_person_values in your reply unchanged so later steps can use them. ' +
          'Return only a JSON object with the sections this step produces.',
      ),
      JSON.stringify(partResults),
    ]);
    if (combine.json) results.push(combine.json);
    else results.push({ pipeline_warnings: [`Team ${team}: the combining prompt gave no usable JSON; its raw reply is saved.`] });
  }

  if (small.length) {
    results.push(
      await runBatches(ctx, def, small, (batch, i, n) => [
        task(
          def,
          `teams ${batch.map((u) => u.team).join(', ')}, prompt ${i} of ${n}`,
          'This prompt holds the data for the team(s) below only: their Phase 1 timelines and task records, and their raw records with names and emails replaced by person IDs. ' +
            'Do this step for these teams only; comparisons across all teams happen in a later step. ' +
            'Return only a JSON object with the sections this step produces.',
        ),
        ...otherInputs,
        batch.map((u) => u.text).join('\n\n'),
      ]),
    );
  }
  return mergeResults(results);
}

// ---------------------------------------------------------------------------
// Steps that read earlier outputs (Steps 2, 5–10)
// ---------------------------------------------------------------------------

async function runOnOutputs(ctx: Ctx, def: StepDef): Promise<Json> {
  const inputs = def.inputs
    .map((s) => ({ step: s, out: { ...(ctx.outputs.get(s) ?? {}), ...(ctx.working.get(s) ?? {}) } }))
    .filter((x) => Object.keys(x.out).length);
  if (!inputs.length) {
    throw new AuditRunError(`Step ${def.step} needs output from step(s) ${def.inputs.join(', ')}, and none of them ran.`);
  }
  const whole = inputs.map((x) => `<step_${x.step}_output>\n${JSON.stringify(x.out)}\n</step_${x.step}_output>`).join('\n\n');
  const intro = `Below are the saved outputs of earlier steps (${inputs.map((x) => `Step ${x.step}`).join(', ')}). Do this step using them. Return only a JSON object with the sections this step produces.`;

  if (estimateTokens(whole.length) <= DATA_BUDGET) {
    const r = await ask(ctx, def, 'prompt 1 of 1', [task(def, 'prompt 1 of 1', intro), whole]);
    if (!r.json) throw new AuditRunError(`Step ${def.step} produced no usable output.`);
    return r.json;
  }

  // Too big for one prompt: every prompt gets the small sections, and the list items are split across prompts.
  const shared: string[] = [];
  const units: { text: string }[] = [];
  for (const x of inputs) {
    const small: Json = {};
    for (const [k, v] of Object.entries(x.out)) {
      if (Array.isArray(v)) {
        for (const item of v) units.push({ text: `{"from":"step_${x.step}.${k}","item":${JSON.stringify(item)}}` });
      } else small[k] = v;
    }
    if (Object.keys(small).length) shared.push(`<step_${x.step}_summary>\n${JSON.stringify(small)}\n</step_${x.step}_summary>`);
  }
  return runBatches(ctx, def, units, (batch, i, n) => [
    task(
      def,
      `prompt ${i} of ${n}`,
      `${intro} The earlier outputs were too large for one prompt, so their list items are split across ${n} prompts; this prompt holds part ${i}. ` +
        'Work only from what is in this prompt; the app combines the parts.',
    ),
    ...shared,
    batch.map((u) => u.text).join('\n'),
  ]);
}

// ---------------------------------------------------------------------------
// Record helpers
// ---------------------------------------------------------------------------

interface Tuple {
  fields: string[];
  values: string[];
  team: string | null;
  count: number;
  example: string;
}

const norm = (v: string) => v.trim().toLowerCase().replace(/^mailto:/, '');

/** The identifier values in one record: the mapped columns for CSV, organizer/attendees for calendars. */
function identifiersIn(f: ReadFile, r: AuditRecord, fields?: { person: string[] }): string[] {
  if (f.kind === 'csv') return (fields?.person ?? []).map((c) => r.cells?.[c] ?? '').filter((v) => v.trim());
  if (f.kind === 'ics') {
    const out: string[] = [];
    for (const m of r.text.matchAll(/(?:ORGANIZER|ATTENDEE)([^:|]*):([^|]+)/g)) {
      const cn = m[1].match(/CN="?([^;":]+)/)?.[1];
      out.push(m[2].trim().replace(/^mailto:/i, ''));
      if (cn) out.push(cn.trim());
    }
    return out;
  }
  return [];
}

function collectIdentityTuples(files: ReadFile[], fileFields: Identity['fileFields']): Tuple[] {
  const tuples = new Map<string, Tuple>();
  for (const f of files) {
    const fields = fileFields.get(f.id);
    for (const r of f.records) {
      if (f.kind === 'ics') {
        // Each organizer/attendee is its own identity (email plus display name when given).
        for (const m of r.text.matchAll(/(?:ORGANIZER|ATTENDEE)([^:|]*):([^|]+)/g)) {
          const cn = m[1].match(/CN="?([^;":]+)/)?.[1]?.trim();
          const values = [m[2].trim().replace(/^mailto:/i, ''), ...(cn ? [cn] : [])];
          bump(tuples, { fields: ['ORGANIZER/ATTENDEE'], values, team: null, example: r.handle });
        }
        continue;
      }
      const values = identifiersIn(f, r, fields);
      if (!values.length) continue;
      const team = fields?.team ? r.cells?.[fields.team] || null : null;
      bump(tuples, { fields: fields!.person, values, team, example: r.handle });
    }
  }
  return [...tuples.values()];
}

function bump(map: Map<string, Tuple>, t: Omit<Tuple, 'count'>) {
  const key = `${t.values.map(norm).join('|')}#${t.team ?? ''}`;
  const cur = map.get(key);
  if (cur) cur.count++;
  else map.set(key, { ...t, count: 1 });
}

/** Fallback when there are too many identities for one prompt: people share an identity only if they share an exact value. */
function exactMatchPeople(tuples: Tuple[]): Person[] {
  const parent = tuples.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const owner = new Map<string, number>();
  tuples.forEach((t, i) =>
    t.values.forEach((v) => {
      const o = owner.get(norm(v));
      if (o === undefined) owner.set(norm(v), i);
      else parent[find(i)] = find(o);
    }),
  );
  const groups = new Map<number, Tuple[]>();
  tuples.forEach((t, i) => groups.set(find(i), [...(groups.get(find(i)) ?? []), t]));
  return [...groups.values()].map((g, i) => ({
    person_id: `P${String(i + 1).padStart(3, '0')}`,
    team_id: g.find((t) => t.team)?.team ?? null,
    identifiers: [...new Set(g.flatMap((t) => t.values))],
  }));
}

/** Replaces every known identifier (3+ characters) with its person ID, longest first. */
function makeScrubber(people: Person[]): (text: string) => string {
  const pairs = people
    .flatMap((p) => p.identifiers.filter((v) => v.trim().length >= 3).map((v) => [v.trim(), p.person_id] as const))
    .sort((a, b) => b[0].length - a[0].length);
  if (!pairs.length) return (t) => t;
  const lookup = new Map(pairs.map(([v, id]) => [v.toLowerCase(), id]));
  const re = new RegExp(pairs.map(([v]) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'gi');
  return (text) => text.replace(re, (m) => lookup.get(m.toLowerCase()) ?? m);
}

/** Groups each file's records by the keys `keysOf` returns (a record can go under several keys). */
function groupRecords(files: ReadFile[], keysOf: (r: AuditRecord) => string[]): Map<string, { file: ReadFile; record: AuditRecord }[]> {
  const out = new Map<string, { file: ReadFile; record: AuditRecord }[]>();
  for (const file of files) for (const record of file.records) for (const k of keysOf(record)) out.set(k, [...(out.get(k) ?? []), { file, record }]);
  return out;
}

/** File blocks for a set of records, scrubbed of real identifiers. */
function groupBlocks(files: ReadFile[], items: { file: ReadFile; record: AuditRecord }[], scrub: (t: string) => string): string {
  return files
    .map((f) => {
      const recs = items.filter((x) => x.file.id === f.id).map((x) => ({ ...x.record, text: scrub(x.record.text) }));
      return recs.length ? fileBlock({ ...f, header: f.header ? scrub(f.header) : f.header }, recs) : '';
    })
    .filter(Boolean)
    .join('\n');
}
