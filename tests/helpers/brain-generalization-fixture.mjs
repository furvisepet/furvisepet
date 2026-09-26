// Typed semantic oracle construction only. No utterance is parsed to choose a plan.
export const pets=['Aster','Bramble','Echo'].map((name,i)=>({id:`owned-${i}`,name,user_id:'owner',species:'dog',lifecycle_status:'active'}));
export const clause=(direction='desc',count=1)=>({orderBy:[{field:'event_at',direction}],take:{count,per:'group'}});
export const ticket=(union=[clause()])=>({subjectScope:'named',operation:'read',temporal:{from:null,to:null,anchor:null,calendar:null},
  predicates:[{kind:'text_any',terms:['weight','weighed','body mass']}],outputs:{completeness:'sufficient',ordering:'desc',limit:null},
  selection:{groupBy:['subject'],union},episode:null,searchHints:null,probes:[]});
export const context=utterance=>({owner:{userId:'owner'},pet:pets[0],eligiblePets:pets,currentMessage:utterance,
  currentTurn:{id:'current',role:'user',text:utterance,createdAt:'2035-06-01T12:00:00Z'},currentTimestamp:'2035-06-01T12:00:00Z',timeZone:'UTC',
  conversationTurns:[{id:'prior-user',role:'user',text:'Bramble is the pet I mean.',createdAt:'2035-05-31T12:00:00Z'}],
  lifecycleActionState:{ownerId:'owner',complete:true,actions:[]},
  concernReferences:[{ref:'concern-handle',ownerId:'owner',petId:pets[0].id,concernId:'00000000-0000-4000-8000-000000000001',status:'active',title:'Tracked condition'}]});
export const base=utterance=>({version:'ask-request.v2',mode:'read',question:utterance,requirements:[],referenceTurnIds:[],
  scope:'named',petNames:['Aster'],operation:'recall',selection:'summary',quantity:'records',topic:'recorded facts',terms:[],from:null,to:null,
  episodeTopic:null,ordinal:null,frame:null,evidenceBasis:'saved_history',premiseQuotes:[],outputFormat:'prose',temporalScope:null,
  calculatePlan:null,storedRead:null,removeJob:null,stateTransitionJob:null,fieldMutationJob:null,lifecyclePlan:null,appendJob:null,
  readTicket:ticket(),writeJob:null,task:null,mutationIntent:null,recordSelection:null,profileFields:[],projection:null,evidenceNeeds:[],excludedPetNames:[]});
export const operand=(petName='Aster',clause=0,item=0,role='member',field='measurement',unit='kg')=>({petName,clause,item,role,field,unit,measurementSelector:null});
export function calculation(operator,subjects=['Aster']) {
  const roles={difference:['reference','target'],ratio:['reference','target'],percent_change:['reference','target'],percent_of_sum:['part','member'],elapsed_days:['start','end']};
  return subjects.map((petName,i)=>({id:`calculation_${i}`,operator,resultUnit:operator==='convert'?'g':operator==='ratio'?'scalar':
    ['percent_change','percent_of_sum'].includes(operator)?'%':operator==='elapsed_days'?'day':operator==='count_records'?'records':'kg',precision:null,
    operands:operator==='count_records'?[]:operator==='convert'?[operand(petName,0,0,'source')]:[0,1].map(c=>operand(petName,c,0,roles[operator]?.[c]??'member',operator==='elapsed_days'?'event_at':'measurement',operator==='elapsed_days'?null:'kg'))}));
}
export function fixture(entry) {
  const {family,utterance}=entry,c=context(utterance),p=base(utterance);
  const calc=['sum','mean','difference','absolute_difference','ratio','percent_change','percent_of_sum','convert','elapsed_days','count_records','ranking','dag'];
  if(calc.includes(family)) {
    const operator=family==='ranking'?'convert':family==='dag'?'sum':family;
    p.quantity='measurement';p.temporalScope='historical';
    p.readTicket.selection.union=operator==='convert'?[clause()]:[clause('asc'),clause('desc')];
    if(family==='ranking')p.petNames=pets.map(pet=>pet.name);
    p.calculatePlan={operation:'calculate',resultSelection:family==='ranking'?{filter:null,orderBy:{direction:'desc'},take:null}:null,calculations:calculation(operator,p.petNames)};
    if(operator==='count_records'){p.readTicket.selection=null;p.readTicket.outputs={completeness:'exhaustive',ordering:'asc',limit:null,strategy:null};}
    if(family==='dag')p.calculatePlan.calculations.push({id:'converted',operator:'convert',operands:[{kind:'result',role:'source',calculationId:'calculation_0'}],resultUnit:'g',precision:null});
  } else if(family==='latest')p.readTicket.selection.union=[clause('desc')];
  else if(family==='earliest')p.readTicket.selection.union=[clause('asc')];
  else if(family==='boundaries')p.readTicket.selection.union=[clause('asc'),clause('desc')];
  else if(family==='grouped')p.petNames=pets.map(pet=>pet.name);
  else if(family==='exact')Object.assign(p.readTicket.temporal,{from:'2031-02-17T00:00:00Z',to:'2031-02-18T00:00:00Z'});
  else if(family==='range'){p.readTicket.selection=null;p.readTicket.outputs={completeness:'exhaustive',ordering:'asc',limit:null,strategy:null};Object.assign(p.readTicket.temporal,{from:'2011-03-09T00:00:00Z',to:'2029-11-03T00:00:00Z'});}
  else if(family==='anchor'){p.readTicket.operation='read_since_event';p.readTicket.temporal.anchor={concept:'vaccination',relation:'after'};p.readTicket.predicates=[{kind:'text_any',terms:['food','meal','ate']}];p.readTicket.selection=null;p.readTicket.outputs={completeness:'exhaustive',ordering:'asc',limit:null,strategy:null};}
  else if(family==='followup'){p.scope='conversation';p.petNames=['Bramble'];p.referenceTurnIds=['prior-user'];p.readTicket.subjectScope='conversation';p.question='What was Bramble’s latest recorded weight?';}
  else if(family==='profile'){p.evidenceBasis='saved_profile';p.profileFields=['weight'];p.readTicket=null;p.quantity=null;p.temporalScope='current';}
  else if(family==='memory'){p.evidenceBasis='stored';p.readTicket=null;p.quantity=null;p.storedRead={operation:'read',domain:'memory',scope:'subjects',reference:null,projection:'records'};}
  else {
    Object.assign(p,{mode:'update',evidenceBasis:null,operation:'general',quantity:null,readTicket:null,outputFormat:null,premiseQuotes:['remove','profile_mutation','state_transition'].includes(family)?null:[]});
    if(family==='append'||family==='append_mixed') {
      p.appendJob={operation:'append',petName:'Aster',items:[{bodyQuote:'Ate slowly and left half the meal.',dateQuote:null,occurredAt:null}],companionQuote:null};
      if(family==='append_mixed'){p.appendJob.companionQuote='Also show Bramble’s latest recorded weight.';Object.assign(p,{mode:'mixed',evidenceBasis:'saved_history',readTicket:ticket(),petNames:['Bramble']});}
    } else if(family==='replace'){p.mutationIntent='correct_record';p.writeJob={operation:'replace',target:'last_event_for_subject',petName:'Aster',instructionQuote:utterance,bodyQuote:'Ate the whole meal, not half.',constraints:[]};}
    else if(family==='remove')p.removeJob={operation:'remove',domain:'care_history',target:'last_event_for_subject',petName:'Aster',instructionQuote:utterance};
    else if(family==='profile_mutation')p.fieldMutationJob={domain:'pet_profile',operation:'set_field',petName:'Aster',field:'weight',instructionQuote:utterance,valueQuote:'7.25 kg'};
    else if(family==='lifecycle')p.lifecyclePlan={pendingDisposition:'keep',transition:{targetPetName:'Aster',toState:'archived'},requiredSubjectState:null,authorizationQuote:utterance};
    else if(family==='state_transition')p.stateTransitionJob={domain:'care_concern',operation:'transition',targetRef:'concern-handle',petName:'Aster',toState:'resolved',authorizationQuote:utterance};
    else throw Error('Unknown oracle family '+family);
  }
  return {context:c,proposal:p};
}
