// Structural intersections derived from catalog-intent.ts:140-166.
// Contextual ownership, source spans, confirmation and execution remain Binder responsibilities.
export const catalogRules = Object.freeze({
 replace:{job:"writeJob",fields:{operation:["replace"],target:[null]}},
 remove:{job:"removeJob",fields:{operation:["remove"],domain:["care_history"],target:[null]}},
 concern:{job:"stateTransitionJob",fields:{operation:["transition"],domain:["care_concern"],targetRef:[null],toState:["resolved","reopened"]}},
 lifecycle:{job:"lifecyclePlan",fields:{}},
 receipt:{job:"storedRead",fields:{operation:["read"],domain:["operation_receipt"],reference:[null]}}
});
const jobs=["writeJob","removeJob","stateTransitionJob","lifecyclePlan","storedRead","appendJob","fieldMutationJob","task","calculatePlan"];
// Intersection only: null means an empty accepted set, never a substituted payload.
export function restrict(s,c){
 if(s.anyOf){const a=s.anyOf.map(x=>restrict(x,c)).filter(Boolean);return a.length?{...s,anyOf:a}:null;}
 if(Array.isArray(s.type)){const a=s.type.map(type=>restrict({...s,type},c)).filter(Boolean);return a.length?{anyOf:a}:null;}
 if(c.type&&s.type!==c.type)return null;
 let r=structuredClone(s);
 // JSON Schema enum and type intersect. Splitting a nullable type must not
 // retain enum literals that the selected type already excludes.
 const hasType=(x,t)=>t==='null'?x===null:t==='array'?Array.isArray(x):t==='object'?x!==null&&typeof x==='object'&&!Array.isArray(x):t==='integer'?Number.isInteger(x):typeof x===t;
 if(r.enum&&r.type){r.enum=r.enum.filter(x=>hasType(x,r.type));if(!r.enum.length)return null;}
 if(c.values){let values=c.values.filter(x=>(!r.enum||r.enum.includes(x))&&(!r.type||hasType(x,r.type)));if(!values.length)return null;r.enum=values;}
 if(c.exclude){if(!s.enum)throw Error("CATALOG_EXPECTED_ENUM");r.enum=r.enum.filter(x=>!c.exclude.includes(x));if(!r.enum.length)return null;}
 if(c.minItems!==undefined||c.maxItems!==undefined){
  if(s.type!=="array")return null;
  r.minItems=Math.max(s.minItems??0,c.minItems??0);
  if(s.maxItems!==undefined||c.maxItems!==undefined)r.maxItems=Math.min(s.maxItems??Infinity,c.maxItems??Infinity);
  if(r.maxItems!==undefined&&r.minItems>r.maxItems)return null;
 }
 if(c.fields){if(s.type!=="object")return null;for(const[k,v]of Object.entries(c.fields)){if(!r.properties?.[k])throw Error("CATALOG_PROPERTY_MISSING:"+k);const q=restrict(r.properties[k],v);if(!q)return null;r.properties[k]=q;}}
 return r;
}
export function correlateCatalog(root){
 function visit(s){
  if(!s||typeof s!=="object")return s;
  if(s.properties?.version?.enum?.includes("ask-catalog-intent.v1")){
   const variants=[];
   for(const[purpose,rule]of Object.entries(catalogRules)){
    for(const scope of purpose==="receipt"?["subjects","owner_receipt"]:["subjects"]){
    for(const subjectCase of purpose==="lifecycle"?["nonempty","unqualified"]:["standard"]){
     const fields={};
     for(const key of jobs)fields[key]=key===rule.job?{type:"object",fields:Object.fromEntries(Object.entries(rule.fields).map(([k,values])=>[k,{values}]))}:{type:"null"};
     if(purpose!=="lifecycle"){fields.readTicket={type:"null"};fields.mode={exclude:["mixed"]};}
     if(purpose==="receipt")fields[rule.job].fields.scope={values:[scope==="owner_receipt"?"owner":"subjects"]};
     
     const empty={type:"array",minItems:0,maxItems:0};
     const cardinality=["replace","remove","concern"].includes(purpose)?{type:"array",minItems:1,maxItems:1}:{type:"array",minItems:1};
     let subjectConstraint=cardinality,ownerConstraint={type:"null"};
     if(scope==="owner_receipt"){
      subjectConstraint=empty;
      ownerConstraint={type:"object",fields:{basis:{values:["explicit_owner_receipts"]}}};
      fields.petNames=empty;fields.excludedPetNames=empty;fields.scope={values:["none"]};
     }else if(subjectCase==="unqualified"){
      subjectConstraint=empty;fields.petNames=empty;fields.scope={values:["none"]};
      Object.assign(fields.lifecyclePlan.fields,{pendingDisposition:{type:"object",fields:{petNames:{type:"null"}}},transition:{type:"null"},requiredSubjectState:{type:"null"}});
     }else fields.petNames=cardinality;
     const request=restrict(s.properties.request,{fields});
     if(!request)continue;
     const v=structuredClone(s);v.properties.purpose={...v.properties.purpose,enum:[purpose]};v.properties.request=request;
     if(scope)v.properties.scope={...v.properties.scope,enum:[scope]};
     v.properties.subjects=restrict(v.properties.subjects,subjectConstraint);
     v.properties.ownerScope=restrict(v.properties.ownerScope,ownerConstraint);
     if(!v.properties.subjects||!v.properties.ownerScope)continue;
     variants.push(v);
    }
    }
   }
   if(!variants.length)throw Error("CATALOG_NO_VALID_FAMILY");
   return {anyOf:variants};
  }
  if(Array.isArray(s))return s.map(visit);
  return Object.fromEntries(Object.entries(s).map(([k,v])=>[k,visit(v)]));
 }
 return visit(root);
}
