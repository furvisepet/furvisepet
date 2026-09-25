import { units } from "./calculation-units.ts";
import { decimal, finite, type Fraction } from "./calculation-rational.ts";

export type SourceSpan = Readonly<{start:number;end:number}>;
export type MeasurementCandidate = Readonly<{
 literal:string; numericText:string; exact:Fraction; value:number;
 unit:string; sourceUnit:string; dimension:string; sourceSpan:SourceSpan;
 contextSpan:SourceSpan; context:string;
}>;

/** Offsets are half-open UTF-16 indexes into the unchanged certified body.
 * Context ends at newline, comma, semicolon, pipe, !, ?, or sentence period.
 * Colons stay attached to labels. Periods between digits are not boundaries.
 * Scanning starts outside the entire numeric+unit token, so no delimiter can
 * split that token. No nearest-label inference or cross-segment inheritance. */
function localContext(body:string,start:number,end:number):SourceSpan {
 const boundary=(i:number)=>/[\r\n,;|!?]/.test(body[i])
  ||body[i]==="."&&!(/\d/.test(body[i-1]??"")&&/\d/.test(body[i+1]??""));
 let from=start,to=end;
 while(from>0&&!boundary(from-1))from--;
 while(to<body.length&&!boundary(to))to++;
 return {start:from,end:to};
}

/** Candidate enumeration only; the caller supplies a canonical dimension. */
export function measurementCandidates(body:string,dimension:string):MeasurementCandidate[] {
 return [...body.matchAll(/(?<![\p{L}\p{N}_.,/+\u2212-])([+\u2212-]?\d+(?:\.\d+)?)\s*([A-Za-z]+)(?![\p{L}\p{N}_/])/gu)]
  .filter(m=>Object.hasOwn(units,m[2].toLowerCase())&&units[m[2].toLowerCase()].dimension===dimension)
  .map(m=>{
   const sourceUnit=m[2].toLowerCase(),sourceSpan={start:m.index,end:m.index+m[0].length};
   const contextSpan=localContext(body,sourceSpan.start,sourceSpan.end);
   // Parse only the selected candidate; ambiguity precedes numeric validation,
   // as in G1, and unrelated candidates cannot supply arithmetic authority.
   return {literal:m[0],numericText:m[1],
    get exact(){return decimal(m[1].replace("\u2212","-"));},
    get value(){return finite(this.exact);},sourceUnit,
    unit:units[sourceUnit].canonical,dimension,sourceSpan,contextSpan,context:body.slice(contextSpan.start,contextSpan.end)};
  });
}
