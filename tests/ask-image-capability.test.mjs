
import test from "node:test";
import assert from "node:assert/strict";
import {enforceImageCapability} from "../app/lib/ask-read-only/image-capability.ts";
import {APP_CAPABILITIES,WORKFLOW_INSTRUCTIONS} from "../app/lib/ask-read-only/app-capabilities.mjs";
for(const prose of [
 "If you have a clear photo of the tag, I can help read it.",
 "I can inspect your screenshot.",
 "Upload an image and I will analyze it.",
 "Send me a photo. I can read it.",
 "We could interpret the image.",
 "Ask can view the picture.",
 "I’ll read your photo.",
 "I can help you read the image."
])test("blocks unsupported image capability: "+prose,()=>{
 const result=enforceImageCapability("The inscription is unknown. "+prose);
 assert.equal(result.changed,true);assert.equal(result.text,"The inscription is unknown.");
});
for(const prose of [
 "I can’t inspect photos here. Type the words instead.",
 "I cannot read an image.",
 "If you transcribe the text from a photo, I can explain it.",
 "You can send a photo to your veterinarian.",
 "Keep the photo in your own files and transcribe the relevant information.",
 "Cameras record images by detecting light.",
 "If collapse occurs, contact an emergency vet immediately.",
 "The historical note mentions a photograph.",
 "Line one.\n\nLine two: 6.13 kg."
])test("preserves supported/negated unrelated prose byte for byte: "+prose,()=>{
 assert.deepEqual(enforceImageCapability(prose),{text:prose,changed:false});
});
test("verified original quote stays opaque while surrounding offer is removed",()=>{
 const quote="If you have a photo, I can read it.";
 const result=enforceImageCapability('Saved quote: "'+quote+'". I can inspect your picture.',[quote]);
 assert.equal(result.changed,true);assert.ok(result.text.includes(quote));assert.doesNotMatch(result.text,/inspect your picture/);
});
test("both model phases receive the actual registry capability",()=>{
 assert.equal(APP_CAPABILITIES.ask.canReadImages,false);
 assert.match(WORKFLOW_INSTRUCTIONS,/cannot receive, inspect, read or interpret images/);
});
