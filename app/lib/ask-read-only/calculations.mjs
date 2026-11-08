/** Parse literal measurements once; model output selects handles, never supplies numbers. */
export function readSourceMeasurements(body,source,kind="history") {
 const values=[];
 if(kind==="profile"){
  let row;try{row=JSON.parse(body);}catch{return values;}
  for(const [field,unitField] of [["weight_value","weight_unit"],["age_value","age_unit"]]){
   const value=row?.[field],rawUnit=row?.[unitField];
   if(typeof value!=="number"||!Number.isFinite(value)||typeof rawUnit!=="string"||!/^(kg|g|lb|lbs|oz|years?|months?)$/i.test(rawUnit))continue;
   const unit=rawUnit.toLowerCase().replace(/^lbs$/,"lb").replace(/^years?$/,"years").replace(/^months?$/,"months");
   values.push({handle:source+":m"+(values.length+1),field,excerpt:field+": "+value+" "+rawUnit,value,unit});
  }
  return values;
 }

 const pattern=/[+-]?(?:\d+(?:\.\d+)?|\.\d+)\s*(kg|g|lbs?|oz|cm|mm|m|ml|l|in)\b/gi;
 for(const match of body.matchAll(pattern)){
  const before=body[match.index-1]??"";
  if(/[0-9.+-]/.test(before))continue;
  const parts=/^([+-]?(?:\d+(?:\.\d+)?|\.\d+))\s*(.+)$/.exec(match[0]),value=Number(parts[1]);
  if(!Number.isFinite(value)||values.length>=32||match[0].length>80)continue;
  values.push({handle:source+":m"+(values.length+1),excerpt:match[0],value,unit:parts[2].toLowerCase().replace(/^lbs$/,"lb")});
 }
 return values;
}
export function calculateReadSources(calculations,sources) {
 if(!Array.isArray(calculations)||calculations.length>4)throw new Error("ASK_READ_CALC_INVALID");
 const known=sources.flatMap(source=>(source.measurements??readSourceMeasurements(source.body,source.handle,source.kind)).map(measurement=>({...measurement,source:source.handle,time:Date.parse(source.eventAt)})));
 return calculations.map(calculation=>{
  if(!calculation||Object.keys(calculation).sort().join(",")!=="operands,operation"
   ||!["difference","absolute_difference","percent_change","sum","mean"].includes(calculation.operation)
   ||!Array.isArray(calculation.operands)||calculation.operands.length<2||calculation.operands.length>16)throw new Error("ASK_READ_CALC_INVALID");
  const values=calculation.operands.map(handle=>{
   const value=typeof handle==="string"?known.find(value=>value.handle===handle):null;
   if(!value||!Number.isFinite(value.time))throw new Error("ASK_READ_CALC_SOURCE");
   return {...value};
  });
  if(values.some(value=>value.unit!==values[0].unit))throw new Error("ASK_READ_CALC_UNITS");
  const unit=values[0].unit,format=value=>String(Number(value.toPrecision(12)));
  let result,label;
  if(calculation.operation==="sum"||calculation.operation==="mean"){
   result=values.reduce((sum,value)=>sum+value.value,0)/(calculation.operation==="mean"?values.length:1);
   label=calculation.operation==="sum"?"Sum":"Mean";
  }else if(calculation.operation==="absolute_difference"){
   if(values.length!==2)throw new Error("ASK_READ_CALC_INVALID");
   result=Math.abs(values[1].value-values[0].value);label="Absolute difference";
  }else{
   if(values.length!==2||values[0].time===values[1].time)throw new Error("ASK_READ_CALC_AMBIGUOUS");
   values.sort((a,b)=>a.time-b.time);
   if(calculation.operation==="percent_change"){
    if(values[0].value===0)throw new Error("ASK_READ_CALC_ZERO_BASE");
    result=(values[1].value-values[0].value)/Math.abs(values[0].value)*100;label="Change from earlier to later (%)";
   }else{result=values[1].value-values[0].value;label="Change from earlier to later";}
  }
  if(!Number.isFinite(result))throw new Error("ASK_READ_CALC_INVALID");
  return {text:label+": "+format(result)+(calculation.operation==="percent_change"?"%":" "+unit),
   sourceHandles:values.map(value=>value.source),value:Number(format(result)),unit:calculation.operation==="percent_change"?"%":unit};
 });
}
