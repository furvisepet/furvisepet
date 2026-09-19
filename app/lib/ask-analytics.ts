export type AskAnalyticsEvent =
  | "conversation_started"
  | "conversation_reopened"
  | "question_submitted"
  | "follow_up_submitted"
  | "clarification_requested"
  | "suggestion_selected"
  | "tracking_started"
  | "memory_save_suggested"
  | "memory_saved"
  | "vet_brief_started"
  | "answer_failed"
  | "ask_furvise_question"
  | "ask_furvise_follow_up"
  | "suggested_question_selected"
  | "answer_action_selected"
  | "answer_saved"
  | "vet_note_created"
  | "missing_detail_added"
  | "urgent_guidance_shown"
  | "answer_error";

type SafeAskAnalyticsProperties = {
  action?: string;
  answerType?: string;
  source?: "composer" | "empty_state" | "response_suggestion";
};

/**
 * Emits only enumerated interaction metadata. Questions, pet concerns, answers,
 * profile details, and care-history text are intentionally not accepted.
 */
export function trackAskEvent(event: AskAnalyticsEvent, properties: SafeAskAnalyticsProperties = {}) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("furvise:analytics", {
      detail: { event, properties },
    }),
  );
}
