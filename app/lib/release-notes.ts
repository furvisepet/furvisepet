export type ReleaseNote = {
  id: string;
  version: string;
  status: "draft" | "published";
  publishedAt: string | null;
  title: string;
  summary: string;
  sections: readonly { id: string; title: string; paragraphs: readonly string[] }[];
};

// Publish only in the reviewed launch commit, after the shipped app and Ask pass.
export const FURVISE_V1_RELEASE: ReleaseNote = {
  id: "furvise-v1",
  version: "V1",
  status: "draft",
  publishedAt: null,
  title: "Your pet's story, in your own words",
  summary: "A journal-first companion for everyday life with your pets, with Ask alongside your notes.",
  sections: [
    {
      id: "v1-journal",
      title: "Write naturally",
      paragraphs: ["Keep the small things you want to remember: a walk, a food change, a quiet afternoon or something that seemed unusual. Write a free-form note in your own words, with optional details when they help."],
    },
    {
      id: "v1-profiles",
      title: "A space for each pet",
      paragraphs: ["Keep each pet's profile and care history together. Choose the pet you mean before adding a note or asking a question."],
    },
    {
      id: "v1-today-history",
      title: "Today and History",
      paragraphs: ["Use Today to add a quick note and see recent updates. Return to History to browse earlier entries and open the original words.", "Review changes before editing a saved note. If a newer edit conflicts with yours, keep your draft and reopen the latest saved version."],
    },
    {
      id: "v1-ask",
      title: "Ask about pet care and your own notes",
      paragraphs: ["Ask everyday pet-care questions or questions about what you have recorded for your pet. Check important details against the original entries.", "An incomplete record cannot establish that something never happened. Answers can be incomplete or wrong, and uncertainty should be clear."],
    },
    {
      id: "v1-boundaries",
      title: "Keep your judgment, and your vet, in the loop",
      paragraphs: ["Furvise helps you organize observations and questions. It does not diagnose your pet, decide treatment or replace veterinary care.", "If your pet seems seriously unwell, contact a veterinarian or emergency clinic. Report a problem if an answer or a basic task does not make sense."],
    },
  ],
};

export function getV1ReleaseForPage({ preview = false }: { preview?: boolean } = {}): ReleaseNote | null {
  if (FURVISE_V1_RELEASE.status === "draft") return preview ? FURVISE_V1_RELEASE : null;
  if (!FURVISE_V1_RELEASE.publishedAt || !/^\d{4}-\d{2}-\d{2}$/.test(FURVISE_V1_RELEASE.publishedAt)) return null;
  return FURVISE_V1_RELEASE;
}
