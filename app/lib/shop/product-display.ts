import type { MockProduct } from "../petwise";

export function formatProductResultCount(count: number) {
  return `Found ${count} careful ${count === 1 ? "match" : "matches"}`;
}

export function getProductDifferentiator(product: MockProduct) {
  if (product.category === "food" && product.subcategory === "wet_food") {
    return "Wet food option. Softer texture with more moisture.";
  }
  if (product.category === "food" && product.subcategory === "dry_food") {
    return "Dry food option. Easier storage with crunchy texture.";
  }
  if (product.category === "grooming" && product.subcategory === "shampoo") {
    return getShampooFormulaDifference(product) || "Bath-time shampoo option.";
  }
  if (product.category === "grooming" && product.subcategory === "wipes") {
    return "Quick cleanup option between baths.";
  }
  if (product.subcategory === "dental_treat") {
    return "Chew-style dental treat option.";
  }
  if (product.category === "grooming") {
    return "Non-food grooming tool option.";
  }
  return "Another product format to consider.";
}

function getShampooFormulaDifference(product: MockProduct) {
  const productText = [
    product.id,
    product.name,
    product.shortDescription,
    ...(product.ingredientHighlights || []),
    ...(product.tags || []),
  ]
    .join(" ")
    .toLowerCase();

  if (productText.includes("oatmeal") && productText.includes("aloe")) {
    return "Oatmeal and aloe formula aimed at dry, itchy, sensitive skin.";
  }
  if (productText.includes("hypoallergenic") && productText.includes("fragrance-free")) {
    return "Fragrance-free option for sensitive-skin grooming.";
  }

  return null;
}
