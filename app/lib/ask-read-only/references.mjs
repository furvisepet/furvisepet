import { createHash } from "node:crypto";
import { EVIDENCE_GOALS } from "./retrieval.mjs";
const date=value=>value===null||typeof value==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+"T00:00:00Z"))&&new Date(value+"T00:00:00Z").toISOString().slice(0,10)===value&&value>="1900-01-01"&&value<="2200-12-31";
const text=(value,length)=>typeof value==="string"&&value.length>0&&value.length<=length&&!/[\u0000-\u001f]/.test(value);
const fingerprint=source=>({id:source.id,hash:createHash("sha256").update(source.body).digest("hex"),eventAt:source.eventAt,recordedAt:source.recordedAt});

/** References are navigation hints, not saved facts or capabilities. They are
 * re-bound to today's authorized pets and every use requires a new data read. */
export function restoreReadReferences(value,pets) {
 if(!value||value.version!==1||!Array.isArray(value.entries)||value.entries.length>4)return [];
 const restored=[];
 for(const entry of value.entries){
  if(!entry||!["profile","history"].includes(entry.kind))continue;
  if(typeof entry.timeZone!=="string"||entry.timeZone.length>100)continue;
  try{new Intl.DateTimeFormat("en",{timeZone:entry.timeZone});}catch{continue;}
  const pet=pets.find(pet=>pet.id===entry.petId);if(!pet)continue;
  if(![entry.from,entry.to,entry.recordedFrom,entry.recordedTo].every(date)||entry.from&&entry.to&&entry.from>entry.to||entry.recordedFrom&&entry.recordedTo&&entry.recordedFrom>entry.recordedTo)continue;
  if(!["event","recorded"].includes(entry.orderBy)||!["asc","desc"].includes(entry.order)||!EVIDENCE_GOALS.includes(entry.goal))continue;
  if(!Array.isArray(entry.terms)||entry.terms.length>3||entry.terms.some(term=>!text(term,160)))continue;
  if(!Array.isArray(entry.sources)||!entry.sources.length||entry.sources.length>8||entry.sources.some(source=>!source||!text(source.id,128)||!/^([a-f0-9]{64})$/.test(source.hash)||!Number.isFinite(Date.parse(source.eventAt))||!Number.isFinite(Date.parse(source.recordedAt))))continue;
  restored.push({handle:"r"+(restored.length+1),request:{kind:entry.kind,pet,from:entry.from,to:entry.to,recordedFrom:entry.recordedFrom,recordedTo:entry.recordedTo,orderBy:entry.orderBy,order:entry.order,goal:entry.goal,terms:[...entry.terms],offset:0,sourceIds:entry.sources.map(source=>source.id),referenceTimeZone:entry.timeZone,referenceLimited:entry.limited===true,expectedSources:entry.sources.map(source=>({id:source.id,hash:source.hash,eventAt:source.eventAt,recordedAt:source.recordedAt}))}});
 }
 return restored;
}
export function describeReadReferences(references) {
 return references.map(({handle,request})=>({reference:handle,pet:request.pet.name,petHandle:request.pet.handle,kind:request.kind,goal:request.goal,
  from:request.from,to:request.to,recordedFrom:request.recordedFrom,recordedTo:request.recordedTo,orderBy:request.orderBy,queryHints:request.terms,
  timeZone:request.referenceTimeZone,sourceCount:request.expectedSources.length,selectionLimited:request.referenceLimited,sourceDates:request.expectedSources.slice(0,4).map(source=>({eventAt:source.eventAt,recordedAt:source.recordedAt}))}));
}
export function carryReadReferences(previous,bound,sources,answer,timeZone) {
 const entries=[];
 for(const call of bound){
  const request=call.request;
  const selected=sources.filter(source=>source.petId===request.pet.id&&source.kind===request.kind&&answer.sources.includes(source.handle)&&call.sourceHandles?.includes(source.handle));
  if(!selected.length)continue;
  entries.push({kind:request.kind,petId:request.pet.id,timeZone:request.referenceTimeZone??timeZone,goal:request.goal??"relevant_records",from:request.from??null,to:request.to??null,
   recordedFrom:request.recordedFrom??null,recordedTo:request.recordedTo??null,orderBy:request.orderBy??"event",order:request.order??"desc",terms:request.terms??[],limited:selected.length>8||request.referenceLimited===true,sources:selected.slice(0,8).map(fingerprint)});
 }
 // General turns carry the bounded state forward without adding another query.
 for(const {request} of previous)entries.push({kind:request.kind,petId:request.pet.id,timeZone:request.referenceTimeZone??timeZone,goal:request.goal,from:request.from,to:request.to,
  recordedFrom:request.recordedFrom,recordedTo:request.recordedTo,orderBy:request.orderBy,order:request.order,terms:request.terms,limited:request.referenceLimited===true,sources:request.expectedSources});
 const unique=[];
 for(const entry of entries){
  if(!unique.some(other=>JSON.stringify(other)===JSON.stringify(entry)))unique.push(entry);
  if(unique.length===4)break;
 }
 return {version:1,entries:unique};
}
export function checkReferencedSources(result,request) {
 if(!request.expectedSources)return result;
 const sources=result.sources.filter(source=>request.expectedSources.some(expected=>{
  const actual=fingerprint(source);
  return ["id","hash","eventAt","recordedAt"].every(key=>expected[key]===actual[key]);
 }));
 return {...result,sources,staleReference:sources.length!==result.sources.length||!!result.scopeExhausted&&sources.length!==request.expectedSources.length};
}
