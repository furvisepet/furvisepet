import assert from 'node:assert/strict';
import{createHash}from'node:crypto';
const sha=s=>createHash('sha256').update(s).digest('hex');
export function verifyCurrentPolicy(bundle,instructions,review){
 assert.equal(review.schema,'ReviewedCurrentProducerContract.v1');
 assert.equal(review.sourceSections.length,68);assert.equal(review.compiledRules.length,53);assert.equal(review.annotationHashes.length,67);
 assert.deepEqual(instructions.split('\n'),review.sourceSections,'every current source section');
 assert.deepEqual(bundle.sourceHashes,review.sourceSections.map(sha),'source audit completeness');
 assert.deepEqual(bundle.rules,review.compiledRules,'every emitted policy rule');
 assert.deepEqual(bundle.annotationHashes,review.annotationHashes,'closed annotation dispositions');
 assert.equal(new Set(bundle.annotationHashes).size,bundle.annotationHashes.length);
 const rules=bundle.rules.join('\n');
 for(const term of ['effective_fact','stored_report','target/reference','source:anchor','CURRENT-TURN OPERATION BOUNDARY','AND across predicates','missing/invalid limited','no implicit/self/forward/unknown producers/read-slot aliases','ambiguous','probes','no model answers'])assert.ok(rules.includes(term),term);
}
export function assertFinalReadGuidance(instructions){
 for(const text of ['READ PROPOSITION CONTRACT.','source_ref identifies exact supplied cited sources','Keep explicit literal restrictions AND with identity.','No calendar, episode, probes, effective-fact calculations or legacy strategy.','Attributed recorded-value arithmetic uses the typed calculatePlan recorded operands'])assert.ok(instructions.includes(text),text);
 assert.ok(!instructions.includes('No calendar, episode, probes, calculations or legacy strategy.'),'no global recorded-calculation prohibition');
}
