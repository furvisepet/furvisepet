/** Conservative literal meaning; units alone never establish a metric. */
function historyMetric(prefix,unit,subjectName){
 const tail=prefix.slice(Math.max(prefix.lastIndexOf("\n")+1,prefix.lastIndexOf(";")+1,prefix.lastIndexOf(". ")+1)).trim();
 const mass=/^(kg|g|lb|lbs|oz)$/i.test(unit);
 const explicit=/\bbody\s+weight\s*(?:(?:was|is|of|at)\s*|:\s*)?(?:(?:about|approximately)\s*)?$/i.test(tail)||/^weight\s*(?:(?:was|is|of|at)\s*|:\s*)?(?:(?:about|approximately)\s*)?$/i.test(tail);
 const namedWeight=/^(.+?)\s+(?:weighed|weighs)\s*(?:(?:was|is|at)\s*|:\s*)?(?:(?:about|approximately)\s*)?$/i.exec(tail);
 const named=namedWeight&&typeof subjectName==="string"&&namedWeight[1].trim().toLowerCase()===subjectName.trim().toLowerCase();
 if(mass&&(explicit||named))return "body_weight";
 if(mass&&/(?:food(?:\s+(?:amount|quantity|weight))?|kibble|ration|meal|ate|fed|eaten|consumed)\s*(?:(?:was|is|of)\s*|:\s*)?$/i.test(tail))return "food_mass";
 if(/^(cm|mm|m|in)$/i.test(unit)&&/(?:body\s+length|body\s+height)\s*(?:(?:was|is|of)\s*|:\s*)?$/i.test(tail))return "body_length";
 return null;
}
/** Parse literal measurements once; model output selects handles, never supplies numbers. */
export function readSourceMeasurements(body,source,kind="history",subjectName=null) {
 const values=[];
 if(kind==="profile"){
  let row;try{row=JSON.parse(body);}catch{return values;}
  for(const [field,unitField] of [["weight_value","weight_unit"],["age_value","age_unit"]]){
   const value=row?.[field],rawUnit=row?.[unitField];
   if(typeof value!=="number"||!Number.isFinite(value)||typeof rawUnit!=="string"||!/^(kg|g|lb|lbs|oz|years?|months?)$/i.test(rawUnit))continue;
   const unit=rawUnit.toLowerCase().replace(/^lbs$/,"lb").replace(/^years?$/,"years").replace(/^months?$/,"months");
   values.push({handle:source+":m"+(values.length+1),field,metric:field==="weight_value"?"profile_weight":"profile_age",excerpt:field+": "+value+" "+rawUnit,value,unit});
  }
  return values;
 }
 // Consume the whole numeric token. Never recover only the suffix of a
 // grouped/ambiguous number such as 1,234 kg or scientific notation.
 const pattern=/[+-]?(?:\d+(?:[.,]\d+)?|[.,]\d+)\s*(kg|g|lbs?|oz|cm|mm|m|ml|l|in)\b/giu;
 for(const match of body.matchAll(pattern)){
  const prefix=body.slice(0,match.index),before=prefix.at(-1)??"";
  if(/[\p{L}\p{N}.,/+\-−–\u2014⁄∕]/u.test(before)
   ||/[/⁄∕−–\u2014]\s*$/u.test(prefix)
   ||/\d[ \u00a0\u202f]+$/u.test(prefix))continue;
  const parts=/^([+-]?(?:\d+(?:[.,]\d+)?|[.,]\d+))\s*(.+)$/.exec(match[0]);
  if(parts[1].includes(",")&&!/,[0-9]{1,2}$/.test(parts[1]))continue;
  const value=Number(parts[1].replace(",","."));
  if(!Number.isFinite(value)||values.length>=32||match[0].length>80)continue;
  values.push({handle:source+":m"+(values.length+1),metric:historyMetric(prefix,parts[2],subjectName),context:body.slice(Math.max(body.lastIndexOf("\n",match.index)+1,match.index-60),Math.min(body.indexOf("\n",match.index)<0?body.length:body.indexOf("\n",match.index),match.index+match[0].length+60)),excerpt:match[0],value,unit:parts[2].toLowerCase().replace(/^lbs$/,"lb")});
 }
 return values;
}
const units=Object.freeze({
 kg:{dimension:"mass",factor:1,base:"kg"},g:{dimension:"mass",factor:.001,base:"kg"},
 lb:{dimension:"mass",factor:.45359237,base:"kg"},oz:{dimension:"mass",factor:.028349523125,base:"kg"},
 cm:{dimension:"length",factor:1,base:"cm"},mm:{dimension:"length",factor:.1,base:"cm"},
 m:{dimension:"length",factor:100,base:"cm"},in:{dimension:"length",factor:2.54,base:"cm"},
 ml:{dimension:"volume",factor:1,base:"ml"},l:{dimension:"volume",factor:1000,base:"ml"},
 years:{dimension:"age",factor:12,base:"months"},months:{dimension:"age",factor:1,base:"months"}
});
export function calculateReadSources(calculations,sources) {
 if(!Array.isArray(calculations)||calculations.length>4)throw new Error("ASK_READ_CALC_INVALID");
 const known=sources.flatMap(source=>(source.measurements??readSourceMeasurements(source.body,source.handle,source.kind,source.petName)).map((measurement,index)=>({...measurement,source:source.handle,measurementKey:source.kind+":"+(source.id??source.handle)+":"+index,petId:source.petId,eventTime:Date.parse(source.eventAt),recordedTime:Date.parse(source.recordedAt)})));
 return calculations.map(calculation=>{
  if(!calculation||!["operands,operation","operands,operation,timeBasis"].includes(Object.keys(calculation).sort().join(","))
   ||!["difference","absolute_difference","percent_change","sum","mean"].includes(calculation.operation)
   ||!Array.isArray(calculation.operands)||calculation.operands.length<2||calculation.operands.length>16)throw new Error("ASK_READ_CALC_INVALID");
  const timeBasis=calculation.timeBasis??"event";
  if(!["event","recorded"].includes(timeBasis))throw new Error("ASK_READ_CALC_INVALID");
  const values=calculation.operands.map(handle=>{
   const value=typeof handle==="string"?known.find(value=>value.handle===handle):null;
   if(!value||!Number.isFinite(value[timeBasis+"Time"])||!Number.isFinite(value.value))throw new Error("ASK_READ_CALC_SOURCE");
   return {...value,time:value[timeBasis+"Time"]};
  });
  const unavailable=(text,unit)=>({text,sourceHandles:values.map(value=>value.source),value:null,unit,available:false});
  if(new Set(values.map(value=>value.measurementKey)).size!==values.length)return unavailable("The same measurement was selected more than once; this calculation is unavailable.",null);
  const metrics=values.map(value=>value.metric);
  if(metrics.some(metric=>!metric))return unavailable("The saved measurement meaning is unclear; compatible units alone cannot authorize this calculation.",null);
  if(new Set(metrics).size>1)return unavailable("These measurements describe different saved metrics, so this calculation is unavailable.",null);
  if(["difference","percent_change"].includes(calculation.operation)&&new Set(values.map(value=>value.petId)).size>1)return unavailable("A change over time requires measurements for the same pet. Compare different pets with an absolute difference instead.",null);
  if(values.some(value=>!units[value.unit]))return unavailable("These units are not supported for this calculation.",null);
  let unit=values[0].unit;
  if(values.some(value=>value.unit!==unit)){
   const dimensions=values.map(value=>units[value.unit]);
   if(dimensions.some(value=>!value||value.dimension!==dimensions[0]?.dimension))
    return unavailable("These measurements use incompatible units, so this calculation is unavailable.",null);
   unit=dimensions[0].base;
   for(const value of values)value.value*=units[value.unit].factor;
  }
  const format=value=>String(Number(value.toPrecision(12)));
  let result,label;
  if(calculation.operation==="sum"||calculation.operation==="mean"){
   result=values.reduce((sum,value)=>sum+value.value,0)/(calculation.operation==="mean"?values.length:1);
   label=calculation.operation==="sum"?"Sum":"Mean";
  }else if(calculation.operation==="absolute_difference"){
   if(values.length!==2)throw new Error("ASK_READ_CALC_INVALID");
   result=Math.abs(values[1].value-values[0].value);label="Absolute difference";
  }else{
   if(values.length!==2)throw new Error("ASK_READ_CALC_INVALID");
   if(values[0].time===values[1].time)
    return unavailable("A change from earlier to later cannot be established because both measurements have the same event time.",unit);
   values.sort((a,b)=>a.time-b.time);
   if(calculation.operation==="percent_change"){
    if(values[0].value===0)return unavailable("Percentage change is undefined because the earlier measurement is zero.","%");
    result=(values[1].value-values[0].value)/Math.abs(values[0].value)*100;label="Change from earlier to later (%)";
   }else{result=values[1].value-values[0].value;label="Change from earlier to later";}
  }
  if(!Number.isFinite(result))return unavailable("The calculation exceeds the supported numeric range.",unit);
  const metric=metrics[0].replaceAll("_"," ");
  const provenance=values.map(value=>new Date(value.time).toISOString()+": "+format(value.value)+" "+unit).join(" → ");
  return {text:metric+" — "+label+": "+format(result)+(calculation.operation==="percent_change"?"%":" "+unit)+" ("+timeBasis+" dates; "+provenance+")",
   metric:metrics[0],timeBasis,operandCount:values.length,sourceHandles:values.map(value=>value.source),value:Number(format(result)),unit:calculation.operation==="percent_change"?"%":unit};
 });
}
