import type { MockProduct } from "../petwise";

export type ProductComparisonDetails = {
  checkFirst: string;
  goodWhen: string;
  keyDifference: string;
  typeLabel: string;
};

export type ProductComparisonItem = ProductComparisonDetails & {
  id: string;
  name: string;
};

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
    return "Bath-time shampoo option.";
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
  return "Another product format to compare.";
}

export function getProductComparisonDetails(product: MockProduct): ProductComparisonDetails {
  const typeLabel = product.productTypeLabel || formatComparisonType(product);

  if (product.category === "food" && product.subcategory === "wet_food") {
    return {
      checkFirst: "Check portion size and ingredients.",
      goodWhen: "Your pet prefers wet food or needs a softer texture.",
      keyDifference: "Softer texture with more moisture.",
      typeLabel,
    };
  }
  if (product.category === "food" && product.subcategory === "dry_food") {
    return {
      checkFirst: "Check transition directions and ingredients.",
      goodWhen: "Your pet already eats kibble or you prefer easier storage.",
      keyDifference: "Crunchy texture with easier storage.",
      typeLabel,
    };
  }
  if (product.category === "grooming" && product.subcategory === "shampoo") {
    return {
      checkFirst: "Check ingredients and label directions before bathing.",
      goodWhen: "A full bath fits the current grooming routine.",
      keyDifference: "Used during bath time and rinsed from the coat.",
      typeLabel,
    };
  }
  if (product.category === "grooming" && product.subcategory === "wipes") {
    return {
      checkFirst: "Check ingredients, fragrance, and areas to avoid.",
      goodWhen: "You need quick cleanup between baths.",
      keyDifference: "No-rinse cleanup for paws or coat.",
      typeLabel,
    };
  }
  if (product.subcategory === "dental_treat") {
    return {
      checkFirst: "Check the size guide, ingredients, and chewing directions.",
      goodWhen: "A chew fits the pet's routine and weight range.",
      keyDifference: "Edible chew format for routine dental care.",
      typeLabel,
    };
  }
  if (product.category === "grooming") {
    return {
      checkFirst: "Check coat type, tool directions, and skin condition before use.",
      goodWhen: "A reusable tool fits the grooming task.",
      keyDifference: "Non-food tool for hands-on grooming.",
      typeLabel,
    };
  }

  return {
    checkFirst: "Check the label, directions, and saved ingredient avoids.",
    goodWhen: "This product format fits the pet's current routine.",
    keyDifference: getProductDifferentiator(product),
    typeLabel,
  };
}

export function buildProductComparisons(products: MockProduct[]): ProductComparisonItem[] {
  return products.map((product) => ({
    id: product.id,
    name: product.name,
    ...getProductComparisonDetails(product),
  }));
}

function formatComparisonType(product: MockProduct) {
  const subcategory = product.subcategory?.replace(/_/g, " ");
  return subcategory || product.category.replace(/_/g, " ");
}
