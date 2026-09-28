/** Complete absolute read-boundary syntax, shared by provider schema and Binder.
 * Calendar validity is lexical: Date.parse may compare already-valid instants,
 * but must never authorize host-local time or normalize an impossible date.
 */
const leapYear = String.raw`(?:\d{2}(?:0[48]|[2468][048]|[13579][26])|(?:[02468][048]|[13579][26])00)`;
const calendarDate = String.raw`(?:\d{4}-(?:(?:01|03|05|07|08|10|12)-(?:0[1-9]|[12]\d|3[01])|(?:04|06|09|11)-(?:0[1-9]|[12]\d|30)|02-(?:0[1-9]|1\d|2[0-8]))|${leapYear}-02-29)`;
// The final assertion requires actual end-of-input, including no final newline.
export const completeInstantSchema = {
  type: "string",
  pattern: String.raw`^${calendarDate}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)(?![\s\S])`,
};
const completeInstant = new RegExp(completeInstantSchema.pattern);
export const isCompleteInstant = (value: unknown): value is string =>
  typeof value === "string" && completeInstant.test(value);
