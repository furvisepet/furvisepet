import { generateContextAwareAskResponse, type GenerateAskReasoningInput } from "./ask-reasoning";

export async function generateAskResponse(input: GenerateAskReasoningInput) {
  return generateContextAwareAskResponse(input);
}
