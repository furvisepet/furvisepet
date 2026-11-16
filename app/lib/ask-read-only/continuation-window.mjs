import {namedOwnedPets} from "./subject-scope.mjs";
import {explicitCalendarWindow} from "./calendar-scope.mjs";
const months=["january","february","march","april","may","june","july","august","september","october","november","december"];
/** A shared year applies to both ends of one explicit month range. */
export function sharedYearMonthRange(question){
 const text=String(question);
 if(/["\x60]/.test(text))return null;
 const names=months.join("|"),pattern=new RegExp("\\b("+names+")\\s+(?:through|to)\\s+("+names+")\\s+((?:19|20|21)\\d{2}|2200)\\b","gi");
 const matches=[...text.matchAll(pattern)];
 if(matches.length!==1||[...text.matchAll(new RegExp("\\b(?:"+names+")\\b","gi"))].length!==2||[...text.matchAll(/\b(?:19|20|21)\d{2}\b/g)].length!==1)return null;
 const [,left,right,year]=matches[0],a=months.indexOf(left.toLowerCase()),b=months.indexOf(right.toLowerCase());
 if(a>b)return null;
 return {from:year+"-"+String(a+1).padStart(2,"0")+"-01",to:year+"-"+String(b+1).padStart(2,"0")+"-"+new Date(Date.UTC(Number(year),b+1,0)).getUTCDate(),precision:"range"};
}
/** The current owner's explicit interval outranks an older omitted interval.
 * Keep the fingerprint validation anchor and the old outstanding omissions. */
export function bindExplicitContinuationWindow(request,question,pets){
 if(!request.continuation||request.kind!=="history")return request;
 const named=namedOwnedPets(question,pets);
 if(named.length!==1||named[0].id!==request.pet.id)return request;
 const scope=sharedYearMonthRange(question)??explicitCalendarWindow(question);
 if(!scope)return request;
 const {axis}=request.continuation.range,anchor=request.continuation.anchorRequest;
 const lo=axis==="recorded"?"recordedFrom":"from",hi=axis==="recorded"?"recordedTo":"to";
 // This repair is confined to the previously authorized enclosing interval.
 if(!anchor[lo]||!anchor[hi]||scope.from<anchor[lo]||scope.to>anchor[hi])return request;
 if(request[lo]===scope.from&&request[hi]===scope.to)return request;
 return {...request,[lo]:scope.from,[hi]:scope.to,offset:0,explicitIntervalOverride:true,
  continuation:{...request.continuation,range:{axis,from:scope.from,to:scope.to}}};
}

/** An explicit narrower continuation changes bounds, not its established axis. */
export function reconcileContinuationAxis(first,plan,references,question,pets){
 if(!plan||!sharedYearMonthRange(question)||/\b(?:instead|switch|change)\b.{0,30}\b(?:event|saved|recorded)\b/iu.test(question))return null;
 const named=namedOwnedPets(question,pets);if(named.length!==1)return null;
 const eligible=plan.filter(t=>t.kind==="saved_continuation"&&t.needsHistory&&t.reference&&t.pets.length===1&&t.pets[0]===named[0].handle&&t.missing.includes("date_meaning")&&t.missing.every(k=>k==="date_meaning"));
 if(eligible.length!==1)return null;
 const ref=references.find(r=>r.handle===eligible[0].reference),basis=ref?.request?.orderBy;
 if(!["event","recorded"].includes(basis))return null;
 if(first.historyIntent?.timeBasis!=="ambiguous"&&first.historyIntent?.timeBasis!==basis)return null;
 return {first:{...first,text:"",historyIntent:{...first.historyIntent,requested:true,timeBasis:basis}},plan:plan.map(t=>t===eligible[0]?{...t,missing:[]}:t)};
}
