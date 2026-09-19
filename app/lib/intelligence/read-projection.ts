import { receiptCompletionText } from "./receipt-completion.ts";
import { historyCompletionLimits, UNVERIFIED_EVENT_LIMITATION } from "./evidence-need-coverage.ts";
import { calendarDateInZone } from "../ask-time-zone.ts";
import { unquotedOwnerText, analyzeOwnerAssertions } from "../ai/owner-assertion.ts";
import { units } from "./history-calculation.ts";
import { parseHistoryNarrative, type HistoryNarrative } from "./history-narrative.ts";
import { eligibleAnswerSources, type AskEvidenceContract } from "./ask-evidence.ts";
import type { HistoryCalculation } from "./history-calculation.ts";
import { explicitHistoryDays, explicitHistoryMonths } from "./history-dates.ts";
export type ReadProjection = { nameHeader: string; valueHeader: string; quantity: "body_mass"; unit: string; order: "name_ascending" | "name_descending" | "value_ascending" | "value_descending" | "scope" };
export const readProjectionSchema = { type: ["object", "null"], additionalProperties: false,
  required: ["nameHeader", "valueHeader", "quantity", "unit", "order"], properties: {
    nameHeader: { type:"string",minLength:1,maxLength:80 }, valueHeader: { type:"string",minLength:1,maxLength:80 },
    quantity: { type:"string",enum:["body_mass"] }, unit: { type:"string",enum:["kg","g","mg","lb"] },
    order: { type:"string",enum:["name_ascending","name_descending","value_ascending","value_descending","scope"] },
  } };
export function parseReadProjection(value: unknown): ReadProjection | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const p = value as Record<string,unknown>;
  if (Object.keys(p).sort().join() !== readProjectionSchema.required.slice().sort().join()
    || p.quantity !== "body_mass" || !["kg","g","mg","lb"].includes(String(p.unit))
    || !readProjectionSchema.properties.order.enum.includes(String(p.order))
    || [p.nameHeader,p.valueHeader].some(v=>typeof v!=="string"||!v.trim()||v.length>80||/[|\r\n]/.test(v))) return null;
  return { ...p } as ReadProjection;
}
/** Domain measurement reader, not a query matcher. Ambiguous, corrected,
 * equipment-inclusive or multiple measurements are left to semantic generation.
 * This produces a draft: independent review must still verify task semantics. */
function bodyMeasurement(text: string) {
  const matches = [...text.matchAll(/\b(?:body (?:weight|mass) (?:was|is)|had (?:a )?recorded body (?:weight|mass) of|weighed|weight(?: on (?:our|the|a) (?:home )?scale)? registered at)\s+(-?\d+(?:\.\d+)?)\s+(kg|kilograms?|g|grams?|lb|lbs|pounds?)\b/gi)];
  if (matches.length !== 1 || !analyzeOwnerAssertions(text).clauseSpans.some(clause =>
    unquotedOwnerText(clause.text).includes(matches[0][0]) && clause.isCertain && !clause.isNegated && !clause.isQuestion && !clause.isAttributed && !clause.isConditional)
    || /\b(?:estimated|approximately)\b/i.test(text) || /\b(?:correction|corrected|carrier|harness|equipment|parcel)\b/i.test(text)
    && !/\b(?:without equipment|no carrier or harness included)\b/i.test(text)) return null;
  const m = matches[0], unit = units[m[2].toLowerCase()], value=Number(m[1]);
  if (!unit || !Number.isFinite(value) || value<=0) return null;
  return { value, unit, literal: m[1]+" "+m[2] };
}
function profileBodyMeasurement(text: string) {
  const match = /^\s*(-?\d+(?:\.\d+)?)\s+(kg|kilograms?|g|grams?|lb|lbs|pounds?)\s*$/i.exec(text);
  const unit = match && units[match[2].toLowerCase()], value = match ? Number(match[1]) : Number.NaN;
  return match && unit && Number.isFinite(value) && value > 0 ? { value, unit, literal: `${match[1]} ${match[2]}` } : null;
}
const decimalPlaces = (value: string) => /\.(\d+)/.exec(value)?.[1].length || 0;
const csv = (cell: string) => /[",\r\n]/.test(cell) ? '"' + cell.replaceAll('"','""') + '"' : cell;
function quotedSourceHints(text: string) {
  return [...text.matchAll(/["“]([^"”\r\n]{3,120})["”]/g)].map(match => match[1].trim().toLocaleLowerCase()).filter(Boolean);
}
function narrowMeasurementsByQuotedSource<T extends { source: { text: string } }>(rows: T[], requestText: string) {
  if (rows.length <= 1) return rows;
  const hints = quotedSourceHints(requestText);
  if (!hints.length) return rows;
  const matched = rows.filter(row => hints.some(hint => row.source.text.toLocaleLowerCase().includes(hint)));
  return matched.length ? matched : rows;
}
export function deterministicReadProjection(evidence: AskEvidenceContract, diagnostic?: (detail: Record<string, string | number | boolean | null>) => void): HistoryNarrative | null {
  const request = evidence.interpretation?.request, projection = request?.projection;
  if (evidence.scope.readOnlyRecall && request?.mode === "read"
    && historyCompletionLimits(evidence).includes("requested_transition_not_retrieved")) {
    // This server limitation asserts no care fact and cites no observation as
    // an event. Do not pay to synthesize text publication must later withhold.
    return { sentences: [{ text: UNVERIFIED_EVENT_LIMITATION, sourceIds: [], calculations: [] }] };
  }
  // A request-linked receipt is a separate evidence channel from a history search.
  // A lexical query returning no notes must not erase an existing write receipt.
  const requestText = evidence.scope.requestText;
  diagnostic?.({ stage: "eligibility", readOnly: evidence.scope.readOnlyRecall,
    profileWeight: Boolean(request?.profileFields?.includes("weight")), temporalScope: request?.temporalScope || null,
    outputFormat: request?.outputFormat || null, petCount: evidence.scope.authorizedPetIds.length });
  // A current profile field is the authoritative present endpoint when the
  // owner explicitly compares it with one dated body-mass report. Later care
  // notes are observations, not substitutes for that requested profile value.
  if (evidence.scope.readOnlyRecall && request?.profileFields?.includes("weight")
    && request.profileFields.every(field => field === "weight")
    && request.temporalScope === "historical_and_current" && (!request.outputFormat || request.outputFormat === "prose")
    && evidence.scope.authorizedPetIds.length === 1 && /\b(?:weights?|weigh(?:ed|s|ing)?|body mass)\b/i.test(requestText)
    && /\b(?:change|difference|compare)\b/i.test(requestText) && !/\b(?:why|cause|because|diagnos|recommend|trend)\b/i.test(requestText)) {
    const days = explicitHistoryDays(requestText, new Date().getUTCFullYear(), 8);
    const months = days.length === 0 ? explicitHistoryMonths(requestText) : [];
    const month = months.length === 1 && !/\b(?:before|after|since|until|between)\b/i.test(requestText) ? months[0] : null;
    const petId = evidence.scope.authorizedPetIds[0], name = evidence.petNames?.[petId];
    const sources = eligibleAnswerSources(evidence).filter(source => source.petId === petId);
    const historical = days.length === 1 || month ? narrowMeasurementsByQuotedSource(sources.flatMap(source => {
      const date = source.occurredAt?.slice(0,10);
      const inPeriod = days.length === 1 ? date === days[0] : Boolean(date && month && date.startsWith(month + '-'));
      const measurement = source.sourceType === "care_update" && inPeriod ? bodyMeasurement(source.text) : null;
      return measurement ? [{source,measurement}] : [];
    }), requestText) : [];
    const current = sources.flatMap(source => {
      const measurement = source.sourceType === "profile" && source.sourceId.endsWith(":weight") ? profileBodyMeasurement(source.text) : null;
      return measurement ? [{source,measurement}] : [];
    });
    diagnostic?.({ stage: "weight_endpoints", dayCount: days.length, monthCount: months.length,
      sourceCount: sources.length, historicalCount: historical.length, currentCount: current.length, named: Boolean(name) });
    if (name && historical.length === 1 && current.length === 1) {
      const past = historical[0], present = current[0];
      const target = /\b(?:grams?|g)\b/i.test(requestText) ? units.g
        : /\b(?:pounds?|lbs?)\b/i.test(requestText) ? units.lb : present.measurement.unit;
      const rawChange = (present.measurement.value * present.measurement.unit.scale - past.measurement.value * past.measurement.unit.scale) / target.scale;
      const rawPercent = (present.measurement.value * present.measurement.unit.scale - past.measurement.value * past.measurement.unit.scale)
        / (past.measurement.value * past.measurement.unit.scale) * 100;
      const change = Number(rawChange.toFixed(Math.min(3, Math.max(2, decimalPlaces(present.measurement.literal), decimalPlaces(past.measurement.literal)))));
      const percent = Number(rawPercent.toFixed(1));
      const direction = change > 0 ? "an increase" : change < 0 ? "a decrease" : "no change";
      const sourceIds = [past.source.sourceId, present.source.sourceId];
      const changeText = change === 0 ? `no change (0%)` : `${direction} of ${Math.abs(change)} ${target.canonical} (${Math.abs(percent)}%)`;
      return parseHistoryNarrative({sentences:[{
        text:`${name}'s recorded body weight changed from ${past.measurement.literal} on ${past.source.occurredAt!.slice(0,10)} to the current profile value of ${present.measurement.literal}: ${changeText}.`,
        sourceIds, calculations:[
          {operation:"difference",expression:null,operands:[present,past].map(row => ({sourceId:row.source.sourceId,field:"text" as const,literal:row.measurement.literal})),value:change,unit:target.canonical},
          {operation:"percent_change",expression:null,operands:[past,present].map(row => ({sourceId:row.source.sourceId,field:"text" as const,literal:row.measurement.literal})),value:percent,unit:"%"},
        ],
      }]}) || null;
    }
  }
  // Exact-date body-mass cohort questions are deterministic database reads.
  // Once every requested pet has exactly one represented measurement at each
  // requested day, filtering/ranking/directional comparison is arithmetic, not
  // a language-generation task. This keeps "which pets?" semantics out of the
  // prompt/reviewer path and prevents false partial answers when coverage is complete.
  if (evidence.scope.readOnlyRecall && request?.mode === "read" && request.evidenceBasis === "saved_history"
    && evidence.scope.authorizedPetIds.length > 1 && /\b(?:weights?|weighed|body mass)\b/i.test(requestText)
    && (!request.outputFormat || ["prose","bullets"].includes(request.outputFormat))) {
    const days = explicitHistoryDays(requestText, new Date().getUTCFullYear(), 8).sort();
    if (days.length === 1 || days.length === 2) {
      const target = /\b(?:pounds?|lbs?)\b/i.test(requestText) ? units.lb
        : /\b(?:grams?|g)\b/i.test(requestText) ? units.g : units.kg;
      const sources = eligibleAnswerSources(evidence).filter(source => source.sourceType === "care_update" && !!source.occurredAt);
      const rows = evidence.scope.authorizedPetIds.map(petId => {
        const name = evidence.petNames?.[petId];
        const byDay = days.map(day => sources.filter(source => source.petId === petId && source.occurredAt!.slice(0,10) === day)
          .flatMap(source => {
            const measurement = bodyMeasurement(source.text);
            return measurement && measurement.unit.dimension === target.dimension ? [{source,measurement}] : [];
          }));
        if (!name || byDay.some(matches => matches.length !== 1)) return null;
        return {petId,name,byDay};
      });
      if (rows.every(Boolean)) {
        const complete = rows as NonNullable<typeof rows[number]>[];
        const value = (row: NonNullable<typeof rows[number]>, index: number) =>
          row.byDay[index][0].measurement.value * row.byDay[index][0].measurement.unit.scale / target.scale;
        if (days.length === 1) {
          const threshold = /\b(more than|over|above|less than|under|below)\s+(-?\d+(?:\.\d+)?)\s*(kg|kilograms?|g|grams?|lb|lbs|pounds?)\b/i.exec(requestText);
          if (threshold && /\bwhich\s+pets?\b/i.test(requestText)) {
            const thresholdUnit = units[threshold[3].toLowerCase()];
            if (thresholdUnit?.dimension === target.dimension) {
              const boundary = Number(threshold[2]) * thresholdUnit.scale / target.scale;
              const high = /^(?:more than|over|above)$/i.test(threshold[1]);
              const selected = complete.filter(row => high ? value(row,0) > boundary : value(row,0) < boundary);
              const sourceIds = complete.map(row => row.byDay[0][0].source.sourceId);
              const text = selected.length
                ? `${selected.map(row => row.name).join(selected.length === 2 ? " and " : ", ")} ${selected.length === 1 ? "was" : "were"} ${threshold[1].toLowerCase()} ${threshold[2]} ${thresholdUnit.canonical} on ${days[0]}.`
                : `None of the requested pets were ${threshold[1].toLowerCase()} ${threshold[2]} ${thresholdUnit.canonical} on ${days[0]}.`;
              return parseHistoryNarrative({sentences:[{text,sourceIds,calculations:[]}]}) || null;
            }
          }
          if (/\bhighest\b/i.test(requestText) && /\blowest\b/i.test(requestText)) {
            const ordered=[...complete].sort((a,b)=>value(b,0)-value(a,0));
            const highest=ordered[0], lowest=ordered[ordered.length-1];
            return parseHistoryNarrative({sentences:[{text:`On ${days[0]}, ${highest.name} had the highest recorded weight at ${highest.byDay[0][0].measurement.literal}, and ${lowest.name} had the lowest at ${lowest.byDay[0][0].measurement.literal}.`,
              sourceIds:[highest.byDay[0][0].source.sourceId,lowest.byDay[0][0].source.sourceId],calculations:[]}]}) || null;
          }
        } else if (/\bwhich\s+pets?\b/i.test(requestText) && /\b(?:lost|gained|decreased|increased)\b/i.test(requestText)) {
          const wantsLoss=/\b(?:lost|decreased)\b/i.test(requestText);
          const selected=complete.filter(row => wantsLoss ? value(row,1) < value(row,0) : value(row,1) > value(row,0));
          const sourceIds=complete.flatMap(row=>row.byDay.map(matches=>matches[0].source.sourceId));
          const verb=wantsLoss?"lost weight":"gained weight";
          const text=selected.length ? `${selected.map(row=>row.name).join(selected.length===2?" and ":", ")} ${verb} from ${days[0]} to ${days[1]}.`
            : `None of the requested pets ${verb} from ${days[0]} to ${days[1]}.`;
          return parseHistoryNarrative({sentences:[{text,sourceIds,calculations:[]}]}) || null;
        }
      }
    }
  }

  // Exact-day cohort care-note summaries can also be resolved without a model
  // when every pet has exactly one represented record for that day. A "which
  // pets?" lookup selects only records containing every grounded lexical term;
  // an all-pet summary is allowed only when the non-measurement note body is
  // byte-identical across the cohort.
  if (evidence.scope.readOnlyRecall && request?.mode === "read" && request.evidenceBasis === "saved_history"
    && evidence.scope.authorizedPetIds.length > 1 && !/\b(?:weights?|weighed|body mass)\b/i.test(requestText)) {
    const days=explicitHistoryDays(requestText,new Date().getUTCFullYear(),8).sort();
    if(days.length===1){
      const day=days[0], sources=eligibleAnswerSources(evidence).filter(source=>source.sourceType==="care_update"&&source.occurredAt?.slice(0,10)===day);
      const perPet=evidence.scope.authorizedPetIds.map(petId=>({petId,name:evidence.petNames?.[petId],
        matches:sources.filter(source=>source.petId===petId)}));
      const perPetReady=perPet.every(row=>row.name&&row.matches.length===1);

      if(perPetReady){
        const terms=[...new Set((request.evidenceNeeds||[]).flatMap(need=>need.terms).map(term=>term.trim().toLowerCase()).filter(term=>term.length>=4))];
        if(/\bwhich\s+pets?\b/i.test(requestText)&&terms.length){
          const selected=perPet.filter(row=>terms.every(term=>row.matches[0].text.toLowerCase().includes(term)));
          if(selected.length){
            return parseHistoryNarrative({sentences:[{text:`${selected.map(row=>row.name).join(selected.length===2?" and ":", ")} matched the requested recorded detail on ${day}.`,
              sourceIds:selected.map(row=>row.matches[0].sourceId),calculations:[]}]})||null;
          }
        }
        const noteBody=(text:string)=>{ const measurement=bodyMeasurement(text); if(!measurement) return text.trim(); const start=text.indexOf(measurement.literal); if(start<0) return text.trim(); const end=text.indexOf(".",start+measurement.literal.length); return end>=0?text.slice(end+1).trim():text.trim(); };
        const bodies=perPet.map(row=>noteBody(row.matches[0].text));

        if(bodies[0]&&bodies.every(body=>body===bodies[0])&&/\b(?:reviews?|notes?|entries|records?)\b/i.test(requestText)){
          return parseHistoryNarrative({sentences:[{text:bodies[0],sourceIds:perPet.map(row=>row.matches[0].sourceId),calculations:[]}]})||null;
        }
      }
    }
  }

  // For a cohort-wide "which pet?" factual lookup, a unique represented source
  // that contains every grounded lexical evidence term can be published
  // verbatim with its owned pet name. This is deliberately conservative: if
  // zero or multiple sources satisfy the grounded terms, generation/review
  // remains responsible instead of guessing.
  if (evidence.scope.readOnlyRecall && request?.mode === "read" && request.evidenceBasis === "saved_history"
    && evidence.scope.authorizedPetIds.length > 1 && /\bwhich\s+pet\b/i.test(requestText)
    && !/\b(?:weights?|body mass|highest|lowest|more than|less than|over|under)\b/i.test(requestText)) {
    const terms=[...new Set((request.evidenceNeeds||[]).flatMap(need=>need.terms).map(term=>term.trim().toLowerCase()).filter(term=>term.length>=4))];
    if (terms.length) {
      const matches=eligibleAnswerSources(evidence).filter(source=>source.sourceType==="care_update"
        && terms.every(term=>source.text.toLowerCase().includes(term)));
      if (matches.length===1) {
        const source=matches[0], name=evidence.petNames?.[source.petId];
        if (name) return parseHistoryNarrative({sentences:[{text:`${name}: ${source.text}`,sourceIds:[source.sourceId],calculations:[]}]}) || null;
      }
    }
  }

  // Earliest-to-latest body mass across a multi-pet cohort is a database
  // projection, not a prompt-budget problem. Retrieval already reads both ends;
  // require both correction-validated endpoint sets for every pet and compute
  // each signed difference from the cited source literals.
  if (evidence.scope.readOnlyRecall && request?.mode === "read" && request.evidenceBasis === "saved_history"
    && evidence.scope.authorizedPetIds.length > 1 && /\b(?:weights?|body mass)\b/i.test(requestText)
    && /\b(?:earliest|first)\b/i.test(requestText) && /\b(?:latest|last|most recent|newest)\b/i.test(requestText)
    && !/\b(?:why|cause|because|diagnos|recommend|trend)\b/i.test(requestText)
    && (!request.outputFormat || ["prose", "bullets", "table", "csv"].includes(request.outputFormat))) {
    const target = /\b(?:pounds?|lbs?)\b/i.test(requestText) ? units.lb
      : /\b(?:grams?|g)\b/i.test(requestText) ? units.g : units.kg;
    const sources = eligibleAnswerSources(evidence);
    const rows: Array<{ name: string; firstDate: string; firstLiteral: string; lastDate: string; lastLiteral: string;
      change: number; sourceIds: string[]; calculation: HistoryCalculation }> = [];
    for (const petId of evidence.scope.authorizedPetIds) {
      const pair = evidence.history?.endpointPairs?.find(item => item.petId === petId);
      if (!pair || pair.blocked || !pair.earliestIds.length || !pair.latestIds.length) {
        diagnostic?.({ stage: "endpoint_cohort_boundary", petId, hasPair: Boolean(pair), blocked: pair?.blocked || false,
          earliestCount: pair?.earliestIds.length || 0, latestCount: pair?.latestIds.length || 0 });
        return null;
      }
      const endpoint = (ids: string[]) => sources.filter(source => source.petId === petId && source.sourceType === "care_update"
        && ids.includes(source.sourceId)).flatMap(source => {
          const measurement = bodyMeasurement(source.text);
          return measurement && source.occurredAt ? [{ source, measurement }] : [];
        });
      const first = endpoint(pair.earliestIds), last = endpoint(pair.latestIds);
      const name = evidence.petNames?.[petId];
      if (!name || first.length !== 1 || last.length !== 1
        || first[0].measurement.unit.dimension !== target.dimension || last[0].measurement.unit.dimension !== target.dimension) {
        diagnostic?.({ stage: "endpoint_cohort_measurement", petId, named: Boolean(name),
          earliestMeasurementCount: first.length, latestMeasurementCount: last.length });
        return null;
      }
      const firstValue = first[0].measurement.value * first[0].measurement.unit.scale / target.scale;
      const lastValue = last[0].measurement.value * last[0].measurement.unit.scale / target.scale;
      const change = Number((lastValue - firstValue).toFixed(8));
      const sourceIds = [...new Set([first[0].source.sourceId, last[0].source.sourceId])];
      rows.push({ name, firstDate: first[0].source.occurredAt!.slice(0, 10), firstLiteral: first[0].measurement.literal,
        lastDate: last[0].source.occurredAt!.slice(0, 10), lastLiteral: last[0].measurement.literal, change, sourceIds,
        calculation: { operation: "difference", expression: null,
          operands: [{ sourceId: last[0].source.sourceId, field: "text", literal: last[0].measurement.literal },
            { sourceId: first[0].source.sourceId, field: "text", literal: first[0].measurement.literal }],
          value: change, unit: target.canonical } });
    }
    if (!rows.length) return null;
    const compareChanges = /\b(?:how much (?:larger|greater|more)|difference between (?:their|the|those) (?:body[- ]weight )?changes?|which (?:change|increase)[^.!?]{0,80}\blarger)\b/i.test(requestText);
    if (compareChanges && rows.length !== 2) return null;
    const format = request.outputFormat || "prose";
    if (format === "table" || format === "csv") {
      const cells = [["Pet","Earliest","Earliest date","Latest","Latest date",`Change (${target.canonical})`],
        ...rows.map(row => [row.name,row.firstLiteral,row.firstDate,row.lastLiteral,row.lastDate,String(row.change)])];
      const text = format === "csv" ? cells.map(line => line.map(csv).join(",")).join("\n")
        : ["| Pet | Earliest | Earliest date | Latest | Latest date | Change |", "| --- | --- | --- | --- | --- | --- |",
          ...rows.map(row => `| ${row.name} | ${row.firstLiteral} | ${row.firstDate} | ${row.lastLiteral} | ${row.lastDate} | ${row.change} ${target.canonical} |`)].join("\n");
      diagnostic?.({ stage: "endpoint_cohort_projected", rowCount: rows.length, petCount: rows.length });
      return parseHistoryNarrative({ sentences: [{ text, sourceIds: rows.flatMap(row => row.sourceIds),
        calculations: rows.map(row => row.calculation) }] }) || null;
    }
    const sentences = rows.map(row => ({ text: format === "bullets"
        ? `- ${row.name}: ${row.firstLiteral} on ${row.firstDate}; ${row.lastLiteral} on ${row.lastDate}; change ${row.change >= 0 ? "+" : ""}${row.change} ${target.canonical}.`
        : `${row.name}: ${row.firstLiteral} on ${row.firstDate}; ${row.lastLiteral} on ${row.lastDate}; change ${row.change >= 0 ? "+" : ""}${row.change} ${target.canonical}.`,
      sourceIds: row.sourceIds, calculations: [row.calculation] }));
    if (compareChanges) {
      const largerIndex = rows[0].change >= rows[1].change ? 0 : 1;
      const smallerIndex = largerIndex === 0 ? 1 : 0;
      const larger = rows[largerIndex], smaller = rows[smallerIndex];
      const gap = Number(Math.abs(larger.change - smaller.change).toFixed(8));
      const operands = [...larger.calculation.operands, ...smaller.calculation.operands];
      sentences.push({
        text: `${larger.name}'s change was ${gap} ${target.canonical} larger than ${smaller.name}'s.`,
        sourceIds: [...new Set([...larger.sourceIds, ...smaller.sourceIds])],
        calculations: [{ operation: "expression", expression: [0, 1, "subtract", 2, 3, "subtract", "subtract"],
          operands, value: gap, unit: target.canonical }],
      });
    }
    diagnostic?.({ stage: "endpoint_cohort_projected", rowCount: rows.length, petCount: rows.length });
    return parseHistoryNarrative({ sentences }) || null;
  }

  // Latest body mass across a multi-pet cohort is a database projection, not
  // a language-generation task. Require an unblocked authoritative boundary for
  // every requested pet and exactly one verified measurement at that boundary.
  if (evidence.scope.readOnlyRecall && request?.mode === "read" && request.evidenceBasis === "saved_history"
    && evidence.scope.authorizedPetIds.length > 1 && /\b(?:weights?|body mass)\b/i.test(requestText)
    && /\b(?:latest|most recent|newest)\b/i.test(requestText)
    && !/\b(?:why|cause|because|diagnos|recommend|trend)\b/i.test(requestText)
    && (!request.outputFormat || ["prose", "bullets", "table", "csv"].includes(request.outputFormat))) {
    diagnostic?.({ stage: "latest_cohort_candidate", readOnly: true,
      selection: evidence.interpretation?.selection || null, quantity: request.quantity || null,
      petCount: evidence.scope.authorizedPetIds.length });
    const rows: Array<{ name: string; date: string; literal: string; sourceId: string }> = [];
    for (const petId of evidence.scope.authorizedPetIds) {
      const boundary = evidence.history?.chronology?.find(item => item.petId === petId);
      if (!boundary || boundary.blocked || !boundary.boundaryIds.length) {
        diagnostic?.({ stage: "latest_cohort_boundary", petId, hasBoundary: Boolean(boundary),
          blocked: boundary?.blocked || false, boundaryCount: boundary?.boundaryIds.length || 0 });
        return null;
      }
      const measurements = eligibleAnswerSources(evidence).filter(source => source.petId === petId
        && source.sourceType === "care_update" && boundary.boundaryIds.includes(source.sourceId)).flatMap(source => {
        const measurement = bodyMeasurement(source.text);
        return measurement && source.occurredAt ? [{ source, measurement }] : [];
      });
      const name = evidence.petNames?.[petId];
      if (!name || measurements.length !== 1) {
        diagnostic?.({ stage: "latest_cohort_measurement", petId, named: Boolean(name), measurementCount: measurements.length });
        return null;
      }
      rows.push({ name, date: measurements[0].source.occurredAt!.slice(0, 10),
        literal: measurements[0].measurement.literal, sourceId: measurements[0].source.sourceId });
    }
    if (!rows.length) return null;
    const format = request.outputFormat || "prose";
    const text = format === "table" ? ["| Pet | Date | Weight |", "| --- | --- | --- |",
      ...rows.map(row => `| ${row.name} | ${row.date} | ${row.literal} |`)].join("\n")
      : format === "csv" ? [["Pet","Date","Weight"], ...rows.map(row => [row.name,row.date,row.literal])]
        .map(line => line.map(csv).join(",")).join("\n")
      : format === "bullets" ? rows.map(row => `- ${row.name}: ${row.literal} on ${row.date}`).join("\n")
      : rows.map(row => `${row.name}: ${row.literal} on ${row.date}.`).join(" ");
    diagnostic?.({ stage: "latest_cohort_projected", rowCount: rows.length, petCount: evidence.scope.authorizedPetIds.length });
    return parseHistoryNarrative({ sentences: [{ text, sourceIds: rows.map(row => row.sourceId), calculations: [] }] }) || null;
  }

  // A two-date body-mass comparison is a bounded database projection, not a
  // language-model arithmetic exercise. It remains a draft for whole-task
  // semantic review, including any additional explanation the user requested.
  if (evidence.scope.readOnlyRecall && request && (!request.outputFormat || request.outputFormat === "prose") && evidence.scope.authorizedPetIds.length === 1
    && /\b(?:weights?|body mass)\b/i.test(requestText) && /\b(?:change|difference|compare)\b/i.test(requestText)) {
    const days = explicitHistoryDays(requestText, new Date().getUTCFullYear(), 8);
    const petId = evidence.scope.authorizedPetIds[0], name = evidence.petNames?.[petId];
    const sources = eligibleAnswerSources(evidence).filter(source => source.petId === petId && source.sourceType === "care_update");
    const rows = days.map(day => narrowMeasurementsByQuotedSource(sources.flatMap(source => {
      const measurement = source.occurredAt?.slice(0,10) === day ? bodyMeasurement(source.text) : null;
      return measurement ? [{source,measurement}] : [];
    }), requestText));
    const requestedUnit = /\b(?:pounds?|lbs?)\b/i.test(requestText) ? "lb" : /\b(?:grams?|g)\b/i.test(requestText) ? "g" : "kg";
    if (name && days.length === 2 && days[0] < days[1] && rows.every(row => row.length === 1)) {
      const [first,last] = rows.map(row => row[0]);
      const change = Number(((last.measurement.value * last.measurement.unit.scale - first.measurement.value * first.measurement.unit.scale) / units[requestedUnit].scale).toFixed(8));
      const sourceIds = [first.source.sourceId,last.source.sourceId];
      return parseHistoryNarrative({sentences:[
        ...[first,last].map(({source}) => ({text:`${name}'s ${source.occurredAt!.slice(0,10)} report: ${JSON.stringify(source.text)}`,sourceIds:[source.sourceId],calculations:[]})),
        {text:`The recorded body-mass change is ${change} ${requestedUnit} (later minus earlier). This arithmetic alone does not establish a cause.`,sourceIds,
          calculations:[{operation:"difference",operands:[last,first].map(row => ({sourceId:row.source.sourceId,field:"text",literal:row.measurement.literal})),value:change,unit:requestedUnit}]},
      ]}) || null;
    }
  }
  if (evidence.scope.readOnlyRecall && (!request?.outputFormat || ["prose", "bullets"].includes(request.outputFormat)) && /\b(?:save|saved|receipts?)\b/i.test(requestText)
    && /\b(?:did|actually|receipts?|confirm|verify)\b/i.test(requestText)) {
    const receipts = evidence.operationReceipts || [];
    const referenced = receipts.filter(receipt => request?.referenceTurnIds.includes(receipt.sourceMessageId));
    const selected = referenced.length ? referenced : receipts.filter(item => /\b(?:save|log|record|add)\b/i.test(item.requestText)).slice(-1);
    if (selected.length) {
      // Mixed linked/unlinked requests need their individual referents explained.
      // A flat receipt list makes earlier readback questions sound like failed
      // writes. Leave all receipts available to generation and independent review;
      // never silently discard an unconfirmed save to make the result look complete.
      if (selected.some(receipt => receipt.records.length) && selected.some(receipt => !receipt.records.length)) return null;
      // Every explicitly referenced operation remains part of the readback.
      // Choosing only the last receipt silently erased earlier saved content.
      if (selected.some(receipt => receipt.actionReceipts?.length)) return null;
      const sources = eligibleAnswerSources(evidence);
      const sentences = [];
      for (const receipt of selected) {
        const records = receipt.records.map(record => ({ record, source: sources.find(source => source.sourceId === `operation:${receipt.sourceMessageId}:record:${record.id}`) }));
        const header = sources.find(source => source.sourceId === `operation:${receipt.sourceMessageId}`);
        if (!header || records.some(item => !item.source)) return null;
        if (records.length) sentences.push({ text: receiptCompletionText(receipt), sourceIds: [header.sourceId], calculations: [] }, ...records.map(({record, source}) => ({
          text: `${calendarDateInZone(record.occurredAt, evidence.timeZone)} linked saved note: ${JSON.stringify(record.note)}`,
          sourceIds: [source!.sourceId], calculations: [],
        })));
        else sentences.push({text:
          "No current care-history entry is linked to that prior request. "
          + (receipt.answerPersisted ? "The conversation answer was saved; that is separate from a care record. " : "No conversation answer was saved for that turn. ")
          + (receipt.actionReceipts ? "No mutation action receipt was found for that turn." : "Action receipt availability is unknown."),
          sourceIds:[header.sourceId],calculations:[]});
      }
      return parseHistoryNarrative({sentences}) || null;
    }
  }

  // Counts can support record selection, but cannot substitute for requested
  // note content or a write receipt. Project them only for an explicit count.
  const inventory = eligibleAnswerSources(evidence).filter(source => source.sourceType === "record_inventory");
  if (evidence.scope.readOnlyRecall && inventory.length && /\b(?:how many|count|number of|total)\b/i.test(requestText)
    && (!request?.outputFormat || ["prose", "bullets"].includes(request.outputFormat))) return parseHistoryNarrative({ sentences: inventory.map(source => ({text: source.text, sourceIds: [source.sourceId], calculations: []})) }) || null;

  if (!projection || !["table","csv"].includes(request.outputFormat || "") || !evidence.history
    || evidence.scope.status !== "resolved" || !evidence.scope.readOnlyRecall || evidence.scope.requestKind === "count"
    || evidence.history.corrections === "unavailable" || evidence.episodes) return null;
  const window=evidence.interpretation?.history;
  // A narrow date avoids silently treating a bounded sample as "latest ever".
  if (!window?.from || !window.to || Date.parse(window.to)-Date.parse(window.from)!==86400000) return null;
  if (Date.parse(window.from)>Date.now()) return null;
  const rows: Array<{ name:string; value:number; sourceId:string; calculation:HistoryCalculation }>=[];
  for(const petId of evidence.scope.authorizedPetIds) {
    const sources=evidence.represented.filter(s=>s.petId===petId && s.sourceType==="care_update"
      && s.start===0 && s.end===s.text.length && !!s.occurredAt && Date.parse(s.occurredAt)>=Date.parse(window.from!) && Date.parse(s.occurredAt)<Date.parse(window.to!)
      && !evidence.losses.some(l=>l.sourceId===s.sourceId)
      && evidence.sources.some(group=>group.petId===petId && group.status!=="unavailable" && group.status!=="not_loaded" && group.loadedIds.includes(s.sourceId))
      && !evidence.history!.provenance.some(p=>p.sourceId===s.sourceId && !["effective_linked","effective_replacement","unverified_legacy"].includes(p.status)));
    const measurements=sources.flatMap(s=>{const m=bodyMeasurement(s.text);return m?[{source:s,measurement:m}]:[];});
    if(measurements.length!==1) return null;
    const {source,measurement}=measurements[0],name=evidence.petNames?.[petId],target=units[projection.unit];
    if(!name || request.outputFormat === "table" && /[|\r\n]/.test(name) || !target || target.dimension!==measurement.unit.dimension) return null;
    const value=Number((measurement.value*measurement.unit.scale/target.scale).toFixed(8));
    rows.push({name,value,sourceId:source.sourceId,calculation:{operation:"convert",operands:[{sourceId:source.sourceId,field:"text",literal:measurement.literal}],value,unit:projection.unit}});
  }
  if(!rows.length) return null;
  const compareNames=(a:string,b:string)=>a.toLowerCase()<b.toLowerCase()?-1:a.toLowerCase()>b.toLowerCase()?1:0;
  if(projection.order!=="scope") rows.sort((a,b)=>projection.order.startsWith("name")
    ? compareNames(a.name,b.name)*(projection.order==="name_descending"?-1:1)
    : (a.value-b.value)*(projection.order==="value_descending"?-1:1)||compareNames(a.name,b.name));
  const cells=[[projection.nameHeader,projection.valueHeader],...rows.map(r=>[r.name,String(r.value)])];
  const text=request.outputFormat==="csv"?cells.map(row=>row.map(csv).join(",")).join("\n")
    : [cells[0],["---","---"],...cells.slice(1)].map(row=>"| "+row.join(" | ")+" |").join("\n");
  return parseHistoryNarrative({sentences:[{text,sourceIds:rows.map(r=>r.sourceId),calculations:rows.map(r=>r.calculation)}]})||null;
}
