// Fake-provider encoding only; actual response parsing uses real runtime deadlines.
import { createRecursiveAskWirePlan } from "../../app/lib/intelligence/ask-wire-recursive.mjs";
export function recursiveFixturePlan(plan) {
  const transport = createRecursiveAskWirePlan(plan, () => {});
  return { ...transport, encode: value => transport.encode(value, () => {}),
    decode: value => transport.decode(value, () => {}) };
}
