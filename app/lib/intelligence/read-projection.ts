/** Legacy input declaration only. No projection executor or factual authority. */
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
