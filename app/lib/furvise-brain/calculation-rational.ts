import { units } from "./calculation-units.ts";
export type Fraction={n:bigint;d:bigint};
const gcd=(a:bigint,b:bigint):bigint=>b?gcd(b,a%b):a<BigInt(0)?-a:a;
export const fraction=(n:bigint,d=BigInt(1)):Fraction=>{if(!d)throw Error("zero_denominator");const g=gcd(n,d);return {n:n/g*(d<BigInt(0)?-BigInt(1):BigInt(1)),d:d/g*(d<BigInt(0)?-BigInt(1):BigInt(1))};};
export const decimal=(text:string):Fraction=>{
 if(!/^[+-]?\d+(?:\.\d+)?$/.test(text)||text.length>60)throw Error("numeric_literal");
 const decimals=text.split(".")[1]?.length||0;
 return fraction(BigInt(text.replace(".","")),BigInt(10)**BigInt(decimals));
};
export const add=(a:Fraction,b:Fraction)=>fraction(a.n*b.d+b.n*a.d,a.d*b.d);
export const neg=(a:Fraction)=>fraction(-a.n,a.d);
export const mul=(a:Fraction,b:Fraction)=>fraction(a.n*b.n,a.d*b.d);
export const div=(a:Fraction,b:Fraction)=>fraction(a.n*b.d,a.d*b.n);
export const factor=(name:string):Fraction=>{
 const u=units[name];if(!u)throw Error("unit");
 const seconds:Record<string,number>={second:1,minute:60,hour:3600,day:86400,week:604800};
 return decimal(String(u.dimension==="time"?seconds[u.canonical]:u.scale));
};
export const finite=(q:Fraction)=>{const n=Number(q.n)/Number(q.d);if(!Number.isFinite(n)||Math.abs(n)>1e12)throw Error("nonfinite_or_overflow");return n;};
export type Exact={numerator:string;denominator:string};
export const exact=(q:Fraction):Exact=>({numerator:String(q.n),denominator:String(q.d)});
export function rational(q:Exact):Fraction{
 if(!q||!/^[-]?\d{1,2000}$/.test(q.numerator)||!/^\d{1,2000}$/.test(q.denominator))throw Error("invalid_exact");
 return fraction(BigInt(q.numerator),BigInt(q.denominator));
}
/** No floating-point coercion participates in ordering, equality or filtering. */
export const compare=(a:Fraction,b:Fraction)=>{const delta=a.n*b.d-b.n*a.d;return delta<BigInt(0)?-1:delta>BigInt(0)?1:0;};
