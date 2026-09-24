import { historyCompletionLimits, UNVERIFIED_EVENT_LIMITATION } from "./evidence-need-coverage.ts";
import { calendarDateInZone } from "../ask-time-zone.ts";
import { unquotedOwnerText, analyzeOwnerAssertions } from "../ai/owner-assertion.ts";
import { splitSentencesPreservingFacts } from "../ai/text-segmentation.ts";
import { parseSinceAnchorRead } from "./history-anchor-read.ts";
import { relativeYearsAgoWindow } from "./history-periods.ts";
import { units } from "./history-calculation.ts";
import { parseHistoryNarrative, type HistoryNarrative } from "./history-narrative.ts";
import { eligibleAnswerSources, type AskEvidenceContract } from "./ask-evidence.ts";
import type { HistoryCalculation } from "./history-calculation.ts";
import { explicitHistoryDays, explicitHistoryMonths } from "./history-dates.ts";
import { historyQueryRelevance, historyQueryTerms } from "./history-query-relevance.ts";
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
function humanDate(value: string | null | undefined, timeZone: string) {
  if (!value || !Number.isFinite(Date.parse(value))) return "date not recorded";
  try { return new Intl.DateTimeFormat("en-US",{month:"short",day:"numeric",year:"numeric",timeZone}).format(new Date(value)); }
  catch { return new Date(value).toISOString().slice(0,10); }
}
function humanDateTime(value: string | null | undefined, timeZone: string) {
  if (!value || !Number.isFinite(Date.parse(value))) return "save time not recorded";
  try {
    const date=humanDate(value,timeZone);
    const time=new Intl.DateTimeFormat("en-US",{hour:"numeric",minute:"2-digit",timeZone}).format(new Date(value));
    return `${date} at ${time}`;
  } catch { return humanDate(value,"UTC"); }
}
function careNoteBody(text: string) {
  const measurement=bodyMeasurement(text); if(!measurement) return text.trim();
  const start=text.indexOf(measurement.literal); if(start<0) return text.trim();
  const end=text.indexOf(".",start+measurement.literal.length); return end>=0?text.slice(end+1).trim():text.trim();
}
function displayCareNoteBody(text: string) {
  return splitSentencesPreservingFacts(careNoteBody(text)).filter(sentence =>
    !/^(?:please\s+)?(?:save|log|record|remember|add|note)\b/i.test(sentence.trim())
    && !/^(?:please\s+)?(?:save|log|record|remember)\s+(?:that|this|it)\b/i.test(sentence.trim()))
    .join(" ").trim();
}
function humanList(values: string[]) {
  if (values.length < 2) return values[0] || "";
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0,-1).join(", ")}, and ${values.at(-1)}`;
}
const decimalPlaces = (value: string) => /\.(\d+)/.exec(value)?.[1].length || 0;
const csv = (cell: string) => /[",\r\n]/.test(cell) ? '"' + cell.replaceAll('"','""') + '"' : cell;
function quotedSourceHints(text: string) {
  return [...text.matchAll(/["ΓÇ£]([^"ΓÇ¥\r\n]{3,120})["ΓÇ¥]/g)].map(match => match[1].trim().toLocaleLowerCase()).filter(Boolean);
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
  // Typed retrieval has already selected and ordered its records. Legacy phrase
  // projections must not reinterpret that scope or substitute another subset.
  if (request?.readTicket) return null;
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
        text:`${name} went from ${past.measurement.literal} on ${humanDate(past.source.occurredAt,evidence.timeZone || "UTC")} to ${present.measurement.literal} now, ${changeText}.`,
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
    && evidence.scope.authorizedPetIds.length > 1 && (/\b(?:weights?|weighed|body mass)\b/i.test(requestText) || /\b(?:gained|lost|increased|decreased)\b[^.!?]{0,40}\b(?:kg|kilograms?|g|grams?|lb|lbs|pounds?)\b/i.test(requestText))
    && (!request.outputFormat || ["prose","bullets","table","csv"].includes(request.outputFormat))) {
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
          if (threshold && /\bwhich(?:\s+of\b[^.!?]{0,30})?\s+pets?\b/i.test(requestText)) {
            const thresholdUnit = units[threshold[3].toLowerCase()];
            if (thresholdUnit?.dimension === target.dimension) {
              const boundary = Number(threshold[2]) * thresholdUnit.scale / target.scale;
              const high = /^(?:more than|over|above)$/i.test(threshold[1]);
              const selected = complete.filter(row => high ? value(row,0) > boundary : value(row,0) < boundary);
              const sourceIds = complete.map(row => row.byDay[0][0].source.sourceId);
              const exactWeights = /\b(?:exact|weights?|what were|how much)\b/i.test(requestText);
              const selectedText = selected.map(row => `${row.name} ${row.byDay[0][0].measurement.literal}`);
              const text = selected.length
                ? exactWeights
                  ? `${selectedText.join(selected.length === 2 ? " and " : ", ")} ${selected.length === 1 ? "was" : "were"} ${threshold[1].toLowerCase()} ${threshold[2]} ${thresholdUnit.canonical} on ${humanDate(days[0]+"T12:00:00Z",evidence.timeZone || "UTC")}.`
                  : `${selected.map(row => row.name).join(selected.length === 2 ? " and " : ", ")} ${selected.length === 1 ? "was" : "were"} ${threshold[1].toLowerCase()} ${threshold[2]} ${thresholdUnit.canonical} on ${humanDate(days[0]+"T12:00:00Z",evidence.timeZone || "UTC")}.`
                : `No pet was ${threshold[1].toLowerCase()} ${threshold[2]} ${thresholdUnit.canonical} on ${humanDate(days[0]+"T12:00:00Z",evidence.timeZone || "UTC")}.`;
              return parseHistoryNarrative({sentences:[{text,sourceIds,calculations:[]}]}) || null;
            }
          }
          if (/\bhighest\b/i.test(requestText) && /\blowest\b/i.test(requestText)) {
            const ordered=[...complete].sort((a,b)=>value(b,0)-value(a,0));
            const highest=ordered[0], lowest=ordered[ordered.length-1];
            return parseHistoryNarrative({sentences:[{text:`On ${humanDate(days[0]+"T12:00:00Z",evidence.timeZone || "UTC")}, ${highest.name} was highest at ${highest.byDay[0][0].measurement.literal}. ${lowest.name} was lowest at ${lowest.byDay[0][0].measurement.literal}.`,
              sourceIds:[highest.byDay[0][0].source.sourceId,lowest.byDay[0][0].source.sourceId],calculations:[]}]}) || null;
          }
        } else {
          const deltas=complete.map(row=>({row,change:Number((value(row,1)-value(row,0)).toFixed(8))}));
          const sourceIds=complete.flatMap(row=>row.byDay.map(matches=>matches[0].source.sourceId));
          const threshold=/\b(?:at least|more than|over|above)\s+(-?\d+(?:\.\d+)?)\s*(kg|kilograms?|g|grams?|lb|lbs|pounds?)\b/i.exec(requestText);
          const descriptor=/\b(?:that|same)\s+(?:\d{4}\s+)?([a-z][a-z -]{2,50}?)\s+(?:pet|dog|cat|animal)\b/i.exec(requestText)?.[1]
            ?.toLowerCase().split(/[^a-z]+/).filter(term=>term.length>=4&&!["that","same","recorded","weight"].includes(term));
          if(descriptor?.length){
            const matched=deltas.filter(item=>descriptor.every(term=>item.row.byDay[0][0].source.text.toLowerCase().includes(term)));
            if(matched.length===1){ const item=matched[0]; return parseHistoryNarrative({sentences:[{text:`${item.row.name} weighed ${item.row.byDay[1][0].measurement.literal} on ${humanDate(days[1]+"T12:00:00Z",evidence.timeZone || "UTC")}. That was ${Math.abs(item.change)} ${target.canonical} ${item.change>=0?"higher":"lower"} than ${item.row.byDay[0][0].measurement.literal} on ${humanDate(days[0]+"T12:00:00Z",evidence.timeZone || "UTC")}.`,sourceIds,calculations:[]}]})||null; }
          }
          if(/\bwhich(?:\s+of\b[^.!?]{0,30})?\s+pets?\b/i.test(requestText)&&/\b(?:lost|gained|decreased|increased)\b/i.test(requestText)){
            const wantsLoss=/\b(?:lost|decreased)\b/i.test(requestText);
            let selected=deltas.filter(item=>wantsLoss?item.change<0:item.change>0);
            if(threshold){ const u=units[threshold[2].toLowerCase()]; if(u?.dimension===target.dimension){ const min=Number(threshold[1])*u.scale/target.scale; selected=selected.filter(item=>Math.abs(item.change)>=min); }}
            const from=humanDate(days[0]+"T12:00:00Z",evidence.timeZone || "UTC"), to=humanDate(days[1]+"T12:00:00Z",evidence.timeZone || "UTC");
            const text=selected.length?selected.map(item=>`${item.row.name} ${wantsLoss?"lost":"gained"} ${Math.abs(item.change)} ${target.canonical}`).join(selected.length===2?" and ":", ")+` from ${from} to ${to}.`
              : `No pet matched that weight-change condition from ${from} to ${to}.`;
            return parseHistoryNarrative({sentences:[{text,sourceIds,calculations:[]}]})||null;
          }
          if(/\b(?:largest|greatest|biggest)\b/i.test(requestText)&&/\b(?:increase|gain|change)\b/i.test(requestText)){
            const absolute=/\babsolute\b/i.test(requestText);
            const ranked=[...deltas].sort((a,b)=>(absolute?Math.abs(b.change)-Math.abs(a.change):b.change-a.change));
            const best=ranked[0];
            if(best) return parseHistoryNarrative({sentences:[{text:`${best.row.name} had the largest ${absolute?"absolute ":""}increase, gaining ${Math.abs(best.change)} ${target.canonical} from ${best.row.byDay[0][0].measurement.literal} on ${humanDate(days[0]+"T12:00:00Z",evidence.timeZone || "UTC")} to ${best.row.byDay[1][0].measurement.literal} on ${humanDate(days[1]+"T12:00:00Z",evidence.timeZone || "UTC")}.`,sourceIds,calculations:[]}]})||null;
          }
          if(complete.length===2&&/\b(?:how much did each|whose gain|whose change|larger by how much|compare)\b/i.test(requestText)){
            const [a,b]=deltas; const larger=a.change>=b.change?a:b, smaller=larger===a?b:a; const gap=Number(Math.abs(larger.change-smaller.change).toFixed(8));
            const describe=(item:typeof a)=>`${item.row.name} ${item.change>=0?"gained":"lost"} ${Math.abs(item.change)} ${target.canonical}.`;
            const text=`${describe(a)} ${describe(b)} ${larger.row.name} gained ${gap} ${target.canonical} more.`;
            return parseHistoryNarrative({sentences:[{text,sourceIds,calculations:[]}]})||null;
          }
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
        const termGroups=terms.map(term=>historyQueryTerms([term],Object.values(evidence.petNames||{}))).filter(group=>group.length);
        if(/\bwhich(?:\s+of\b[^.!?]{0,30})?\s+pets?\b/i.test(requestText)&&termGroups.length){
          const selected=perPet.filter(row=>termGroups.every(group=>historyQueryRelevance(row.matches[0].text,group)>0));
          if(selected.length){
            const text=selected.map(row=>`${row.name}: ${row.matches[0].text}`).join(" ");
            return parseHistoryNarrative({sentences:[{text,sourceIds:selected.map(row=>row.matches[0].sourceId),calculations:[]}]})||null;
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

  // Relative-year body-mass comparisons use one server-owned historical
  // endpoint window plus an independent latest-history endpoint. Conversation
  // state may identify the pet/topic, but never supplies either numeric value.
  const relativeYears = relativeYearsAgoWindow(requestText,new Date(),evidence.timeZone || "UTC");
  if (relativeYears && evidence.scope.readOnlyRecall && request?.mode === "read" && request.evidenceBasis === "saved_history"
    && evidence.scope.authorizedPetIds.length === 1
    && (/\b(?:weight|weigh(?:ed|s|ing)?|body mass)\b/i.test(requestText)
      || /\b(?:weight|body mass)\b/i.test(evidence.scope.requestedTopic || ""))
    && /\b(?:compare|comparison|versus|vs\.?|change|different|difference|how does that compare)\b/i.test(requestText)) {
    const petId=evidence.scope.authorizedPetIds[0], pair=evidence.history?.endpointPairs?.find(item=>item.petId===petId);
    const sources=eligibleAnswerSources(evidence);
    if(pair && !pair.blocked && pair.earliestIds.length && pair.latestIds.length){
      const endpoint=(ids:string[])=>sources.filter(source=>source.petId===petId&&source.sourceType==="care_update"&&ids.includes(source.sourceId))
        .flatMap(source=>{const measurement=bodyMeasurement(source.text);return measurement&&source.occurredAt?[{source,measurement}]:[];});
      const old=endpoint(pair.earliestIds), latest=endpoint(pair.latestIds), name=evidence.petNames?.[petId];
      if(name&&old.length===1&&latest.length===1&&old[0].measurement.unit.dimension===latest[0].measurement.unit.dimension){
        const target=old[0].measurement.unit;
        const oldValue=old[0].measurement.value;
        const latestValue=latest[0].measurement.value*latest[0].measurement.unit.scale/target.scale;
        const change=Number((latestValue-oldValue).toFixed(8));
        const sourceIds=[old[0].source.sourceId,latest[0].source.sourceId];
        const text=`${name} was ${old[0].measurement.literal} on ${humanDate(old[0].source.occurredAt,evidence.timeZone||"UTC")} and ${latest[0].measurement.literal} on ${humanDate(latest[0].source.occurredAt,evidence.timeZone||"UTC")}. That is ${change>=0?"+":""}${change} ${target.canonical}.`;
        return parseHistoryNarrative({sentences:[{text,sourceIds,calculations:[{operation:"difference",expression:null,
          operands:[{sourceId:latest[0].source.sourceId,field:"text",literal:latest[0].measurement.literal},{sourceId:old[0].source.sourceId,field:"text",literal:old[0].measurement.literal}],
          value:change,unit:target.canonical}]}]})||null;
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
    const sentences = rows.map(row => {
      const firstDate=humanDate(row.firstDate+"T12:00:00Z",evidence.timeZone || "UTC");
      const lastDate=humanDate(row.lastDate+"T12:00:00Z",evidence.timeZone || "UTC");
      const changeText=`${row.change >= 0 ? "+" : ""}${row.change} ${target.canonical}`;
      return { text: format === "bullets"
        ? `- ${row.name}: ${row.firstLiteral} on ${firstDate} to ${row.lastLiteral} on ${lastDate}. Change: ${changeText}.`
        : `${row.name}: ${row.firstLiteral} on ${firstDate} to ${row.lastLiteral} on ${lastDate}. Change: ${changeText}.`,
        sourceIds: row.sourceIds, calculations: [row.calculation] };
    });
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
    if (/\b(?:gained? the most|lost the most|which[^.!?]{0,80}(?:gained?|lost)[^.!?]{0,40}most)\b/i.test(requestText)) {
      const gainers=[...rows].filter(row=>row.change>0).sort((a,b)=>b.change-a.change);
      const losers=[...rows].filter(row=>row.change<0).sort((a,b)=>a.change-b.change);
      const rankText=(gainers.length?`${gainers[0].name} gained the most at +${gainers[0].change} ${target.canonical}`:"No pet gained weight")
        + ". " + (losers.length?`${losers[0].name} lost the most at ${losers[0].change} ${target.canonical}`:"No pet lost weight") + ".";
      sentences.push({text:rankText,sourceIds:[...new Set(rows.flatMap(row=>row.sourceIds))],calculations:[]});
    }
    if (/\b(?:after today|future[- ]dated)\b/i.test(requestText)) {
      const today=calendarDateInZone(new Date().toISOString(), evidence.timeZone || "UTC");
      const future=rows.filter(row=>row.firstDate>today || row.lastDate>today);
      sentences.push({text:future.length ? `Endpoint dates after today: ${future.map(row=>row.name).join(", ")}.` : "None of these endpoint dates is after today.",
        sourceIds:[...new Set(rows.flatMap(row=>row.sourceIds))],calculations:[]});
    }
    if (/\b(?:full timeline|window you used|search(?:ed)?[^.!?]{0,40}timeline)\b/i.test(requestText)) {
      const access=evidence.historyAccess;
      const full=evidence.scope.authorizedPetIds.every(id=>evidence.history?.perPet?.some(item=>item.petId===id && item.exhausted && item.status!=="unavailable"));
      const text=full ? "I searched the full accessible timeline for each of these pets."
        : access ? `I used endpoint searches across the accessible history window from ${humanDate(access.from,"UTC")} through ${humanDate(new Date(Date.parse(access.to)-1).toISOString(),"UTC")}, not a full row-by-row scan.`
          : "I used endpoint searches rather than a full row-by-row timeline scan.";
      sentences.push({text,sourceIds:[...new Set(rows.flatMap(row=>row.sourceIds))],calculations:[]});
    }
    if (/\b(?:corrects?|corrected|correction|replaces?|replacement)\b/i.test(requestText)) {
      const replacements=new Set((evidence.history?.provenance || []).filter(item=>item.status==="effective_replacement").map(item=>item.sourceId));
      const usedReplacement=rows.some(row=>row.sourceIds.some(id=>id.startsWith("care:claim-") && replacements.has("claim:"+id.slice("care:claim-".length))));
      const text=usedReplacement ? "A corrected or replacement record is used for at least one endpoint."
        : evidence.history?.corrections==="complete" ? "No endpoint correction or replacement was needed."
          : "I didn’t find a confirmed correction for these endpoints.";
      sentences.push({text,sourceIds:[...new Set(rows.flatMap(row=>row.sourceIds))],calculations:[]});
    }
    diagnostic?.({ stage: "endpoint_cohort_projected", rowCount: rows.length, petCount: rows.length });
    return parseHistoryNarrative({ sentences }) || null;
  }

  // Pre-vet prep is a core V1 read: once semantic interpretation has resolved
  // one pet and a historical+current saved-history scope, compile the answer
  // from grounded records instead of paying for a second writer and a third
  // verifier. The interpretation model still owns ambiguous language/scope.
  const preVetRead = /\b(?:checkup|check-up|appointment|visit)\b/i.test(requestText)
    && /\bwhat changed since (?:the )?(?:last|previous) visit\b/i.test(requestText)
    && /\b(?:give me|give|list|suggest|prepare)\s+(?:exactly\s+)?(?:[2-5]|two|three|four|five)\s+questions?\b/i.test(requestText)
    && /\b(?:vet|veterinarian|clinic)\b/i.test(requestText);
  if (preVetRead && evidence.scope.readOnlyRecall && request?.mode === "read" && request.evidenceBasis === "saved_history"
    && request.temporalScope === "historical_and_current" && evidence.scope.authorizedPetIds.length === 1
    && evidence.history?.corrections !== "unavailable" && (!request.outputFormat || request.outputFormat === "prose")) {
    const petId=evidence.scope.authorizedPetIds[0];
    const sourceTime=(source:ReturnType<typeof eligibleAnswerSources>[number])=>{
      const recorded="recordedAt" in source ? source.recordedAt : null;
      const value=recorded && Number.isFinite(Date.parse(recorded)) ? recorded : source.occurredAt;
      return value && Number.isFinite(Date.parse(value)) ? Date.parse(value) : Number.NEGATIVE_INFINITY;
    };
    const care=eligibleAnswerSources(evidence).filter(source=>source.petId===petId && source.sourceType==="care_update")
      .sort((a,b)=>sourceTime(b)-sourceTime(a));
    const distinct:Array<{source:typeof care[number];detail:string}>=[];
    const seen=new Set<string>();
    for(const source of care){
      const detail=(displayCareNoteBody(source.text)||source.text.trim()).replace(/\s+/g," ").trim();
      const key=detail.toLocaleLowerCase();
      if(!detail||seen.has(key)) continue;
      seen.add(key); distinct.push({source,detail});
    }
    if(distinct.length>=2){
      const latest=distinct[0];
      const urgent=/\b(?:difficulty breathing|trouble breathing|collapse[ds]?|unconscious|seizure|poison(?:ed|ing)?|heavy bleeding|unable to urinate|cannot urinate)\b/i;
      if(!urgent.test(latest.detail)){
        const visit=distinct.slice(1).find(row=>{
          const title=evidence.recordTitles?.[row.source.sourceId] || "";
          return /\b(?:visit|wellness|checkup|check-up|exam|veterinary|veterinarian|clinic)\b/i.test(title+" "+row.source.text);
        });
        const previous=visit || distinct[1], zone=evidence.timeZone || "UTC";
        const dateOf=(row:typeof latest)=>{
          const recorded="recordedAt" in row.source ? row.source.recordedAt : null;
          return humanDate(row.source.occurredAt || recorded || null,zone);
        };
        const latestDate=dateOf(latest), previousDate=dateOf(previous);
        const base=visit
          ? `The last recorded visit I found is from ${previousDate}. The newer ${latestDate === "date not recorded" ? "saved" : latestDate} note adds: ${latest.detail}`
          : `I didn't find a separate visit label in the retrieved notes, so I'm comparing with the previous saved note from ${previousDate}. The newer ${latestDate === "date not recorded" ? "saved" : latestDate} note adds: ${latest.detail}`;
        const context=`The earlier note said: ${previous.detail}`;
        const countToken=/\b(?:give me|give|list|suggest|prepare)\s+(?:exactly\s+)?(\d+|two|three|four|five)\s+questions?\b/i.exec(requestText)?.[1]?.toLowerCase() || "3";
        const countWords:Record<string,number>={two:2,three:3,four:4,five:5};
        const count=Math.min(5,Math.max(2,Number(countToken)||countWords[countToken]||3));
        const templates:string[]=[];
        if(/\b(?:appetite|eat|eating|food|meal|breakfast|dinner)\b/i.test(latest.detail))
          templates.push("Is the appetite change in the newer note something you want me to keep tracking before the visit?");
        if(/\b(?:activity|walk|slower|energy|play|exercise)\b/i.test(latest.detail))
          templates.push("Is the activity change in the newer note something you want me to track more closely before the visit?");
        templates.push("What details would be most useful to record if any of these changes happen again?");
        templates.push("What changes would make you want me to call sooner rather than wait for the appointment?");
        templates.push("Would a short log of meals, activity, or symptoms be useful to bring to the visit?");
        const questions=[...new Set(templates)].slice(0,count);
        const sourceIds=[...new Set([latest.source.sourceId,previous.source.sourceId])];
        const sentences=[
          {text:base,sourceIds,calculations:[]},
          {text:context,sourceIds:[previous.source.sourceId],calculations:[]},
          {text:"Questions for the vet:",sourceIds,calculations:[]},
          ...questions.map((text,index)=>({text:`${index+1}. ${text}`,sourceIds,calculations:[]})),
        ];
        return parseHistoryNarrative({sentences}) || null;
      }
    }
  }

  const sinceAnchor = evidence.scope.readOnlyRecall && request?.mode === "read" && request.evidenceBasis === "saved_history"
    && evidence.scope.authorizedPetIds.length === 1
    ? parseSinceAnchorRead(requestText,Object.values(evidence.petNames||{})) : null;
  if(sinceAnchor && (!request?.outputFormat || ["prose","bullets"].includes(request.outputFormat))){
    const petId=evidence.scope.authorizedPetIds[0];
    const sources=eligibleAnswerSources(evidence).filter(source=>source.petId===petId && source.sourceType==="care_update");
    const anchors=sources.filter(source=>historyQueryRelevance(source.text,sinceAnchor.anchorTerms)>0)
      .sort((a,b)=>Date.parse(b.occurredAt||"")-Date.parse(a.occurredAt||""));
    const anchor=anchors[0];
    if(anchor?.occurredAt){
      const topic=sources.filter(source=>source.occurredAt && Date.parse(source.occurredAt)>=Date.parse(anchor.occurredAt!)
        && historyQueryRelevance(source.text,sinceAnchor.topicTerms)>0)
        .sort((a,b)=>Date.parse(a.occurredAt||"")-Date.parse(b.occurredAt||""));
      if(topic.length){
        const sentences=[{text:`I used the ${sinceAnchor.anchorLabel} note on ${humanDate(anchor.occurredAt,evidence.timeZone||"UTC")} as the starting point.`,
          sourceIds:[anchor.sourceId],calculations:[] as HistoryCalculation[]}];
        for(const source of topic){
          const detail=displayCareNoteBody(source.text)||source.text.trim();
          sentences.push({text:`${humanDate(source.occurredAt,evidence.timeZone||"UTC")}: ${detail}`,sourceIds:[source.sourceId],calculations:[]});
        }
        return parseHistoryNarrative({sentences})||null;
      }
    }
  }

  // A thin-file food question should still return the one saved food detail
  // we can verify. An unsupported comparison premise must not erase useful
  // evidence or promote an old food note into a current-profile fact.
  const asksFoodRecall = /\b(?:food|diet|kibble|wet[- ]?food|dry[- ]?food|feeding|meal)\b/i.test(requestText)
    && /\b(?:what did i (?:write|log|save)|what(?:'s| is) in (?:my )?notes?|what did i write down|different|same|last month|current|now)\b/i.test(requestText);
  if (evidence.scope.readOnlyRecall && request?.mode === "read" && request.evidenceBasis === "saved_history"
    && evidence.scope.authorizedPetIds.length === 1 && asksFoodRecall
    && (!request.outputFormat || ["prose","bullets"].includes(request.outputFormat))) {
    const petId=evidence.scope.authorizedPetIds[0], name=evidence.petNames?.[petId] || "This pet";
    const foodSources=eligibleAnswerSources(evidence).filter(source=>source.petId===petId && source.sourceType==="care_update"
      && /\b(?:food|diet|kibble|wet[- ]?food|dry[- ]?food|feeding|meal|turkey)\b/i.test(source.text));
    const dated=[...foodSources].filter(source=>source.occurredAt && Number.isFinite(Date.parse(source.occurredAt)))
      .sort((a,b)=>Date.parse(b.occurredAt!)-Date.parse(a.occurredAt!));
    const latest=dated[0] || foodSources[0];
    if(latest){
      const detail=displayCareNoteBody(latest.text) || latest.text.trim();
      const date=latest.occurredAt ? humanDate(latest.occurredAt,evidence.timeZone || "UTC") : "an undated entry";
      const sentences=[{text:`The latest food note I found for ${name} is from ${date}: ${detail}`,sourceIds:[latest.sourceId],calculations:[]}];
      if(/\blast month\b/i.test(requestText)){
        const zone=evidence.timeZone || "UTC";
        const parts=new Intl.DateTimeFormat("en-CA",{timeZone:zone,year:"numeric",month:"2-digit"}).formatToParts(new Date());
        const year=Number(parts.find(part=>part.type==="year")?.value), month=Number(parts.find(part=>part.type==="month")?.value);
        const previous=new Date(Date.UTC(month===1?year-1:year,month===1?11:month-2,1));
        const previousKey=`${previous.getUTCFullYear()}-${String(previous.getUTCMonth()+1).padStart(2,"0")}`;
        const previousLabel=new Intl.DateTimeFormat("en-US",{month:"long",year:"numeric",timeZone:"UTC"}).format(previous);
        const prior=dated.filter(source=>source.occurredAt?.slice(0,7)===previousKey);
        if(!prior.length){
          sentences.push({text:`I don't see a food note for ${name} from ${previousLabel}, so I can't confirm a food switch from last month.`,sourceIds:[latest.sourceId],calculations:[]});
        }else{
          const priorSource=prior[0], priorDetail=displayCareNoteBody(priorSource.text) || priorSource.text.trim();
          sentences.push({text:`The ${previousLabel} food note says: ${priorDetail} These saved notes do not by themselves prove that the food changed unless a switch is explicitly recorded.`,sourceIds:[priorSource.sourceId],calculations:[]});
        }
      }else if(/\b(?:different|same|current|now)\b/i.test(requestText)){
        sentences.push({text:`That saved note alone does not establish whether ${name}'s food is different now.`,sourceIds:[latest.sourceId],calculations:[]});
      }
      return parseHistoryNarrative({sentences}) || null;
    }
  }

  const latestSingleWeight=/\b(?:latest|last|most recent|newest)\s+(?:recorded\s+)?(?:weight|body mass)\b/i.test(requestText)
    && !/\btwo\s+(?:weights?|body masses?)\b/i.test(requestText)
    && !/\b(?:compare|comparison|versus|difference|change|profile|current profile)\b/i.test(requestText);
  if(latestSingleWeight && evidence.scope.readOnlyRecall && request?.mode==="read" && request.evidenceBasis==="saved_history"
    && evidence.scope.authorizedPetIds.length===1){
    const petId=evidence.scope.authorizedPetIds[0],name=evidence.petNames?.[petId]||"This pet";
    const rows=eligibleAnswerSources(evidence).filter(source=>source.petId===petId&&source.sourceType==="care_update"&&source.occurredAt)
      .flatMap(source=>{const measurement=bodyMeasurement(source.text);return measurement?[{source,measurement}]:[];})
      .sort((a,b)=>Date.parse(b.source.occurredAt||"")-Date.parse(a.source.occurredAt||"")
        || Date.parse(("recordedAt" in b.source&&b.source.recordedAt)||"")-Date.parse(("recordedAt" in a.source&&a.source.recordedAt)||""));
    const latest=rows[0];
    if(latest) return parseHistoryNarrative({sentences:[{text:`${name}'s latest recorded weight is ${latest.measurement.literal} from ${humanDate(latest.source.occurredAt,evidence.timeZone||"UTC")}.`,
      sourceIds:[latest.source.sourceId],calculations:[]}]})||null;
  }

    const lastTwoWeights = /\b(?:last|latest|most recent|newest)\s+two\s+(?:recorded\s+)?(?:weights?|body masses?)\b/i.test(requestText);
  if (lastTwoWeights && evidence.scope.readOnlyRecall && request?.mode === "read" && request.evidenceBasis === "saved_history"
    && evidence.scope.authorizedPetIds.length === 1) {
    const petId=evidence.scope.authorizedPetIds[0], name=evidence.petNames?.[petId] || "This pet";
    const rows=eligibleAnswerSources(evidence).filter(source=>source.petId===petId&&source.sourceType==="care_update"&&source.occurredAt)
      .flatMap(source=>{const measurement=bodyMeasurement(source.text);return measurement?[{source,measurement}]:[];})
      .sort((a,b)=>Date.parse(b.source.occurredAt||"")-Date.parse(a.source.occurredAt||"")
        || Date.parse(("recordedAt" in b.source && b.source.recordedAt)||"")-Date.parse(("recordedAt" in a.source && a.source.recordedAt)||""));
    const latest=rows.slice(0,2);
    if(latest.length===2){
      const sentences=[
        {text:`${name}\'s two latest recorded weights are:`,sourceIds:latest.map(row=>row.source.sourceId),calculations:[] as HistoryCalculation[]},
        ...latest.map(row=>({text:`${humanDate(row.source.occurredAt,evidence.timeZone||"UTC")}: ${row.measurement.literal}`,sourceIds:[row.source.sourceId],calculations:[] as HistoryCalculation[]})),
      ];
      if(/\b(?:this|that)\s+note\b[^.!?]{0,80}\b(?:include|includes|included|contain|contains|contained|have|has|had)\b[^.!?]{0,30}\bweight\b|\bwhether\s+(?:this|that)\s+note\b[^.!?]{0,50}\bweight\b/i.test(requestText)){
        const note=evidence.completedOwnerNote?.note;
        const currentIds=new Set((evidence.completedOwnerNote?.entryIds || []).map(id=>`care:${id}`));
        const currentSource=eligibleAnswerSources(evidence).find(source=>source.petId===petId&&currentIds.has(source.sourceId));
        if(note && currentSource){
          const hasWeight=Boolean(bodyMeasurement(note));
          sentences.push({text:`The note you just saved ${hasWeight ? "does include" : "does not include"} a weight.`,sourceIds:[currentSource.sourceId],calculations:[]});
        }
      }
      return parseHistoryNarrative({sentences})||null;
    }
  }

  // "Last thing I saved" is ordered by the persisted save timestamp, not by
  // the event date. Retrieval has already correction-validated one effective
  // boundary record per pet. Publish only what that receipt itself establishes;
  // a recorded value is not silently promoted into a current profile mutation.
  const latestSavedCareRequest = /\b(?:last|latest|most recent|newest)\s+(?:care[- ]history\s+)?(?:receipt|entry|note|record)\b/i.test(requestText)
    || /\b(?:last|latest|most recent|newest)\s+thing\s+(?:i|we)\s+(?:saved|logged|recorded)\b/i.test(requestText);
  if (evidence.scope.readOnlyRecall && request?.mode === "read" && request.evidenceBasis === "saved_history"
    && latestSavedCareRequest && evidence.scope.authorizedPetIds.length > 0
    && (!request.outputFormat || ["prose","bullets"].includes(request.outputFormat))) {
    const sources = eligibleAnswerSources(evidence);
    const rows = evidence.scope.authorizedPetIds.map(petId => {
      const name = evidence.petNames?.[petId];
      const boundary = evidence.history?.chronology?.find(item => item.petId === petId);
      if (!name || !boundary || boundary.blocked || boundary.boundaryIds.length !== 1) return null;
      const matches = sources.filter(source => source.petId === petId && source.sourceType === "care_update"
        && boundary.boundaryIds.includes(source.sourceId));
      if (matches.length !== 1) return null;
      return { name, source: matches[0] };
    });
    if (rows.every(Boolean)) {
      const complete = (rows as Array<{name:string;source:typeof sources[number]}>).map(({name,source}) => {
        const weight = bodyMeasurement(source.text);
        const foodChange = /\b(?:food|diet|kibble|wet food|dry food|feeding|meal|treat)\b[^.!?]{0,80}\b(?:changed?|switched?|transition(?:ed)?|replaced?|started|stopped)\b|\b(?:changed?|switched?|transition(?:ed)?|replaced?|started|stopped)\b[^.!?]{0,80}\b(?:food|diet|kibble|feeding|meal)\b/i.test(source.text);
        const lifecycleChange = /\b(?:died|passed away|euthani[sz]ed|put (?:to sleep|down)|marked? deceased|lifecycle status changed)\b/i.test(source.text);
        const recordedAt = "recordedAt" in source ? source.recordedAt : null;
        return { name, source, weight, foodChange, lifecycleChange, detail: displayCareNoteBody(source.text),
          occurred: humanDate(source.occurredAt || null,evidence.timeZone || "UTC"), saved: humanDateTime(recordedAt,evidence.timeZone || "UTC") };
      });
      const groups = new Map<string, typeof complete>();
      for (const row of complete) {
        const key=JSON.stringify([row.occurred,row.saved,row.detail]);
        groups.set(key,[...(groups.get(key)||[]),row]);
      }
      const repeatedGroups=[...groups.values()].filter(group=>group.length>1);
      const groupedNames=new Set(repeatedGroups.flatMap(group=>group.map(row=>row.name)));
      const sharedNoChanges = complete.every(row=>!row.foodChange&&!row.lifecycleChange);
      const sentences = complete.map(row => {
        const facts=[`${row.name}: ${row.weight ? row.weight.literal : "no weight in this entry"}.`];
        if(!groupedNames.has(row.name)){
          facts.push(row.occurred==="date not recorded" ? "No entry date is recorded." : `Entry dated ${row.occurred}.`);
          if(row.saved!=="save time not recorded") facts.push(`Saved ${row.saved}.`);
          if(row.detail) facts.push(row.detail);
        }
        if(!sharedNoChanges) facts.push(`Food change: ${row.foodChange ? "recorded" : "not recorded"}. Life-status change: ${row.lifecycleChange ? "recorded" : "not recorded"}.`);
        return { text:facts.join(" "), sourceIds:[row.source.sourceId], calculations:[] };
      });
      for(const group of repeatedGroups){
        const first=group[0], names=humanList(group.map(row=>row.name));
        const facts=[`${names} have entries ${first.occurred==="date not recorded" ? "with no date recorded" : `dated ${first.occurred}`}.`];
        if(first.saved!=="save time not recorded") facts.push(`They were saved ${first.saved}.`);
        if(first.detail) facts.push(first.detail);
        sentences.push({text:facts.join(" "),sourceIds:group.map(row=>row.source.sourceId),calculations:[]});
      }
      const summary: string[]=[];
      if (sharedNoChanges) summary.push("None of these latest entries shows a food or life-status change.");
      if (complete.some(row=>row.weight)) summary.push("The weights shown come from the saved entries, but the entries do not say that saving them changed the current weight.");
      if (/\b(?:profile defaults?|don['ΓÇÖ]?t use profile|do not use profile)\b/i.test(requestText)) summary.push("I only used saved care history and did not fill in missing details from the profile.");
      if (/\b(?:death record|recorded as deceased)\b/i.test(requestText)) summary.push("These latest entries do not tell us whether an older death record exists.");
      if(summary.length) sentences.push({text:summary.join(" "),sourceIds:complete.map(row=>row.source.sourceId),calculations:[]});
      return parseHistoryNarrative({sentences}) || null;
    }
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
      const firstDate=humanDate(first.source.occurredAt,evidence.timeZone || "UTC"), lastDate=humanDate(last.source.occurredAt,evidence.timeZone || "UTC");
      const changeText=change>0?`gained ${Math.abs(change)} ${requestedUnit}`:change<0?`lost ${Math.abs(change)} ${requestedUnit}`:`stayed the same`;
      return parseHistoryNarrative({sentences:[
        {text:`${name} was ${first.measurement.literal} on ${firstDate} and ${last.measurement.literal} on ${lastDate}.`,sourceIds,calculations:[]},
        {text:`That means ${name} ${changeText}.`,sourceIds,
          calculations:[{operation:"difference",operands:[last,first].map(row => ({sourceId:row.source.sourceId,field:"text",literal:row.measurement.literal})),value:change,unit:requestedUnit}]},
      ]}) || null;
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
