import type { NormalizedSizeUnit } from "./types";

const UNIT_ALIASES: Readonly<Record<string, NormalizedSizeUnit>> = {
  count: "count", counts: "count", ct: "count", g: "g", gram: "g", grams: "g",
  kg: "kg", kilogram: "kg", kilograms: "kg", l: "l", liter: "l", liters: "l", litre: "l", litres: "l",
  lb: "lb", lbs: "lb", pound: "lb", pounds: "lb", ml: "ml", milliliter: "ml", milliliters: "ml",
  oz: "oz", ounce: "oz", ounces: "oz",
};

export function parseSizeText(value: string | null | undefined) {
  const originalSizeText = normalizeText(value);
  if (!originalSizeText) return { originalSizeText: null, packageQuantity: null, sizeUnit: null, sizeValue: null };
  const packageMatch = originalSizeText.match(/^(\d+)\s*[x×]\s*(\d+(?:\.\d+)?)\s*([a-zA-Z]+)(?:\s+.*)?$/);
  if (packageMatch) {
    const unit = normalizeSizeUnit(packageMatch[3]);
    if (unit) return { originalSizeText, packageQuantity: Number(packageMatch[1]), sizeUnit: unit, sizeValue: decimal(packageMatch[2]) };
  }
  const singleMatch = originalSizeText.match(/^(\d+(?:\.\d+)?)\s*([a-zA-Z]+)(?:\s+.*)?$/);
  if (singleMatch) {
    const unit = normalizeSizeUnit(singleMatch[2]);
    if (unit) return { originalSizeText, packageQuantity: null, sizeUnit: unit, sizeValue: decimal(singleMatch[1]) };
  }
  return { originalSizeText, packageQuantity: null, sizeUnit: null, sizeValue: null };
}

export function normalizeSizeUnit(value: string | null | undefined) {
  return UNIT_ALIASES[value?.trim().toLowerCase() || ""] || null;
}

function decimal(value: string) { return String(Number(value)); }
function normalizeText(value: string | null | undefined) { return value?.trim().replace(/\s+/g, " ") || null; }
