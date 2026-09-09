export const units: Record<string, { dimension: string; scale: number; canonical: string }> = {
  kg: { dimension: "mass", scale: 1000, canonical: "kg" }, g: { dimension: "mass", scale: 1, canonical: "g" },
  mg: { dimension: "mass", scale: .001, canonical: "mg" }, lb: { dimension: "mass", scale: 453.59237, canonical: "lb" },
  lbs: { dimension: "mass", scale: 453.59237, canonical: "lb" },
  ml: { dimension: "volume", scale: 1, canonical: "ml" }, l: { dimension: "volume", scale: 1000, canonical: "l" },
  hour: { dimension: "time", scale: 1, canonical: "hour" }, hours: { dimension: "time", scale: 1, canonical: "hour" },
  minute: { dimension: "time", scale: 1 / 60, canonical: "minute" }, minutes: { dimension: "time", scale: 1 / 60, canonical: "minute" },
  second: { dimension: "time", scale: 1 / 3600, canonical: "second" }, seconds: { dimension: "time", scale: 1 / 3600, canonical: "second" },
  day: { dimension: "time", scale: 24, canonical: "day" }, days: { dimension: "time", scale: 24, canonical: "day" },
  week: { dimension: "time", scale: 168, canonical: "week" }, weeks: { dimension: "time", scale: 168, canonical: "week" },
};
// Explicit currency codes are independent dimensions. No exchange rate or
// ambiguous dollar-symbol interpretation may be inferred from a price.
for (const currency of ["cad", "usd", "eur", "gbp", "aud", "nzd", "jpy", "chf", "cny"]) {
  units[currency] = { dimension: `currency:${currency}`, scale: 1, canonical: currency };
}
// Provider and source spelling share one dimensional registry; spelling is not
// a different unit, and must not cause a correct calculation to fail review.
for (const [alias, canonical] of Object.entries({ kilogram: "kg", kilograms: "kg", gram: "g", grams: "g",
  milligram: "mg", milligrams: "mg", pound: "lb", pounds: "lb", milliliter: "ml", milliliters: "ml",
  millilitre: "ml", millilitres: "ml", liter: "l", liters: "l", litre: "l", litres: "l" })) units[alias] = units[canonical];

for (const [name, scale] of Object.entries({km:1000,m:1,cm:.01,mm:.001})) units[name]={dimension:"length",scale,canonical:name};
for (const [alias, canonical] of Object.entries({h:"hour",hr:"hour",min:"minute",sec:"second",s:"second",kilometer:"km",kilometers:"km",kilometre:"km",kilometres:"km",meter:"m",meters:"m",metre:"m",metres:"m"})) units[alias]=units[canonical];
export function compoundUnit(value: string) {
 const parts=value.toLowerCase().split("/").map(p=>p.trim());
 if(parts.length!==2 || !units[parts[0]] || !units[parts[1]]) return null;
 const numerator=units[parts[0]],denominator=units[parts[1]];
 return {numerator,denominator,scale:numerator.scale/denominator.scale,canonical:numerator.canonical+"/"+denominator.canonical};
}
