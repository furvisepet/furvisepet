import {runWithAiAdmission} from '../../app/lib/ai/usage-guard/context.ts';
import {exercise} from './helpers/lifetime-harness.mjs';
import {fixturePets,rows} from './fixtures/ask-benchmark-200.mjs';
import {emptyProposedSemanticFrame} from '../../app/lib/intelligence/semantic-frame/extract-frame.ts';
const r=await runWithAiAdmission({async beginProviderCall(){return {reservation:{}}},async recordProviderUsage(){},recordProviderFailure(){}},()=>exercise('Can we just chat?',{fixturePets,rows,petId:'nori',conversationPetId:'nori',messages:[],history:true,interpretationProposal:{operation:'general',readOperation:'general',selection:'summary',subject:'non_pet',petNames:[],topic:'conversation',terms:[],from:null,to:null,episodeTopic:null,ordinal:null,frame:emptyProposedSemanticFrame()}}));
console.log(r.result.reasoning.answer.summary);
