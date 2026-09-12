import { intelligenceVetBriefJsonSchema } from "./vet-brief.ts";
import type { IntelligenceFeature } from "./types.ts";

export type IntelligenceFeatureMode = {
  feature: IntelligenceFeature;
  creditFeature: "ask" | "vet_brief";
  contextPolicy: {
    careEntryLimit: number;
    conversationLimit: number;
    memoryLimit: number;
    needsConversation: boolean;
  };
  persistencePolicy: {
    allowCareActions: boolean;
    allowMemories: boolean;
  };
  responseSchema: Record<string, unknown> | null;
  responseSchemaName: string;
  promptInstructions: readonly string[];
};

const modes = {
  ask: mode("ask", "ask", null, "furvise_ask_response", { care: true, memories: true, conversation: true }),
  vet_brief: mode("vet_brief", "vet_brief", intelligenceVetBriefJsonSchema, "furvise_vet_brief", {
    care: false, memories: false, conversation: true,
    limits: { care: 300, conversations: 20, memories: 100 },
    instructions: [
      "Organize only the supplied deterministic draft and recorded source facts.",
      "Create a concise appointment preparation brief centered on the explicit visit reason. Do not repeat detailed observations across sections.",
      "visitSummary is a short evidence-backed synopsis, at most three sentences: the main concern, its documented course, and latest recorded observation or important uncertainty. It should save the veterinarian reading time. Do not invent onset, current status, diagnosis, or causation. For sparse records say what is available without overstating its usefulness. The synopsis may refer to key facts detailed in the timeline.",
      "Preserve material symptom progression, resolution, medication records and relevant visits. Omit unrelated routine details.",
      "A normal meal is not a food change. Timing alone is not a repeated pattern or a cause. Do not relabel routine care as a change.",
      "Use empty arrays for empty sections. Group meaningful unknowns in missingInformation. Do not fill space with Not recorded items.",
      "Include up to three useful questions to discuss with the veterinarian; questions must not embed unsupported diagnoses or facts. Retrospective summaries need no questions.",
      "Historical medication or supplement records do not establish current use. Preserve exact doses, dates, quantities, negation and uncertainty.",
      "Never invent medication, treatment, visit, symptom, date, product, or profile details.",
      "Preserve Not recorded whenever the supplied draft has no recorded information.",
      "Keep owner reports attributed as owner-reported information and do not convert suspicions into facts.",
      "sourceRecordIds may contain only IDs supplied in allowedSourceRecordIds.",
    ],
  }),
} satisfies Record<IntelligenceFeature, IntelligenceFeatureMode>;

export function getIntelligenceFeatureMode(feature: IntelligenceFeature): IntelligenceFeatureMode {
  return modes[feature];
}

function mode(
  feature: IntelligenceFeature,
  creditFeature: IntelligenceFeatureMode["creditFeature"],
  responseSchema: Record<string, unknown> | null,
  responseSchemaName: string,
  options: {
    care: boolean;
    memories: boolean;
    conversation?: boolean;
    instructions?: string[];
    limits?: { care?: number; conversations?: number; memories?: number };
  },
): IntelligenceFeatureMode {
  return {
    feature, creditFeature,
    contextPolicy: {
      careEntryLimit: options.limits?.care || 80,
      conversationLimit: options.limits?.conversations || 12,
      memoryLimit: options.limits?.memories || 100,
      needsConversation: Boolean(options.conversation),
    },
    persistencePolicy: { allowCareActions: options.care, allowMemories: options.memories },
    responseSchema, responseSchemaName,
    promptInstructions: options.instructions || [],
  };
}
