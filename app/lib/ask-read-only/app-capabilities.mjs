import {CARE_NOTE_UI,HISTORY_NOTE_UI} from "../care-workflow.mjs";
export const WORKFLOW_INTENTS=Object.freeze(["none","create_care_note","find_care_note","care_photo_attachment","other"]);
export const APP_CAPABILITIES=Object.freeze({
 ask:{readOnly:true,canReadOwnedNotes:true,canCalculateTypedMeasurements:true,canDraftText:true,canSave:false,canUpload:false},
 careNotes:{route:CARE_NOTE_UI.route,fields:CARE_NOTE_UI.fields,photoAttachments:CARE_NOTE_UI.photoAttachments,labels:CARE_NOTE_UI},
 history:{route:HISTORY_NOTE_UI.route,search:true,filters:["pet","category","when"],labels:HISTORY_NOTE_UI}
});
export const WORKFLOW_INSTRUCTIONS="Interpret the CURRENT user request. Older app-help topics do not authorize a workflow on a later unrelated request. A return to an agreed routine or its latest revision is general guidance using the most recent relevant dialogue, including across topic interruptions. Only when the user asks how to use a screen or which controls to operate, set workflowIntent and final appHelp.intent. A request for Ask to retrieve, quote, compare or explain saved information is a data-content request, not a UI workflow: use historyIntent and workflowIntent=none unless navigation/help is independently requested. APP_CAPABILITIES describes this build's actual routes/controls, not generic pet-app conventions. Do not invent attachment, upload or edit controls. App help is rendered from that shared capability registry. Ask performs no write/upload/navigation; steps describe what the user can do.";

/** Current-turn support grants display of app controls only, never data access.
 * Prior app topics cannot authorize replacing an unrelated owner answer. */
export function supportsAppWorkflow(question=""){
 const subject=/\b(?:furvise|app|today|history|notes?|photo|image|picture|screen|buttons?|controls?)\b/i.test(question);
 const operation=/\b(?:attach|upload|save|log|record|enter|type|add|create|put|open|navigate|tap|click|screen|steps?|controls?)\b/i.test(question)
  ||/\bhow\b.{0,60}\buse\b/i.test(question);
 return subject&&operation;
}

export function renderAppWorkflow(answer,workflow,pets=[],append=false,question=""){
 // Bind current explicit authorized subjects independently of the UI selection.
 const named=pets.filter(p=>typeof p.name==="string"&&p.name.length>0&&
  new RegExp("(?:^|[^\\p{L}\\p{N}_])"+p.name.replace(/[.*+?^$}{()|[\]\\]/g,"\\$&")+"(?=$|[^\\p{L}\\p{N}_])","iu").test(question));
 if(named.length)workflow={...workflow,pet:named.length===1?named[0].handle:null};
 if(!workflow||workflow.intent==="none")return answer;
 const pet=pets.find(p=>p.handle===workflow.pet),name=pet?.name&&!/\b[ps]\d+\b/.test(pet.name)&&!pets.some(p=>p.id===pet.name)?pet.name:"the intended pet";
 const intro="Ask can read saved information and help draft text, but it cannot upload, save, edit or open pages for you.";
 const today="To add a text note yourself:\n1. Open Today and choose "+name+".\n2. Enter the information in “"+CARE_NOTE_UI.note+"”.\n3. Use “"+CARE_NOTE_UI.details+"” if you want to set "+CARE_NOTE_UI.category+" and "+CARE_NOTE_UI.when+".\n4. Select “"+CARE_NOTE_UI.submit+"” and check that the note appears in Recent.";
 const find="To find a saved note yourself:\n1. Open History.\n2. Use “"+HISTORY_NOTE_UI.search+"” and the Pet, Category or When filters.\n3. Select a result to read it. Use “"+HISTORY_NOTE_UI.older+"” if you need older results.";
 const parts=[intro];
 if(workflow.intent==="care_photo_attachment")parts.push("The current care-note flow is text-only; it has no photo attachment or upload control. You can keep the photo in your own files and transcribe the relevant information as a text note.",today);
 else if(workflow.intent==="create_care_note")parts.push("Care notes accept text, not direct photo attachments. If your observation is in a photo, transcribe its contents first.",today);
 else if(workflow.intent==="find_care_note")parts.push(find);
 else parts.push("I have verified steps for text notes on Today and finding notes in History. Which screen or task do you mean?");
 return {...answer,answer:(append?answer.answer+"\n\n":"")+parts.join("\n\n"),replyType:workflow.intent==="other"?(append?"partial":"clarification"):workflow.intent==="care_photo_attachment"?"partial":answer.replyType,limited:answer.limited||workflow.intent==="care_photo_attachment"||workflow.intent==="other"&&append,presentation:{...answer.presentation,...(!append?{contextRequired:false}:{}),delivery:"direct"}};
}
