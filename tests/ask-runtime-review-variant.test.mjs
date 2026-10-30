import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {execFileSync,spawnSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const manifest=JSON.parse(fs.readFileSync(path.join(root,'docs/releases/ask-20261018-runtime-manifest.json'),'utf8'));
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');

test('review-only legend changes exactly two separators; actual structural codec stays identical',async()=>{
 const v=manifest.reviewOnlyLegendVariant;
 assert.equal(v.path,'app/lib/intelligence/ask-wire-subject-state.mjs');assert.equal(v.notDeployed,true);
 const original=execFileSync('git',['--no-replace-objects','-C',root,'cat-file','blob',manifest.productionGitCommit+':'+v.path]);
 const review=fs.readFileSync(path.join(root,v.path));
 assert.equal(hash(original),v.productionSHA256);assert.equal(hash(review),v.reviewSHA256);
 assert.equal(original.toString().split(' — ').length-1,2);
 assert.equal(review.toString(),original.toString().replaceAll(' — ',': '),'all code and description words must otherwise be byte-identical');
 let old=original.toString();
 for(const name of ['ask-wire-codec.mjs','ask-wire-exact-sharing.mjs'])
  old=old.replace("from './"+name+"'","from "+JSON.stringify(pathToFileURL(path.join(root,'app/lib/intelligence',name)).href));
 assert.ok(!old.includes("from './"));
 const prior=await import('data:text/javascript;base64,'+Buffer.from(old).toString('base64'));
 const current=await import(pathToFileURL(path.join(root,v.path)).href);
 assert.equal(current.SUBJECT_STATE_WIRE_LEGEND,prior.SUBJECT_STATE_WIRE_LEGEND.replaceAll(' — ',': '));
 const requirement={type:'object',additionalProperties:false,required:['pendingDisposition','transition','requiredSubjectState','authorizationQuote'],
  properties:{pendingDisposition:{type:'string',enum:['keep']},transition:{type:'null'},requiredSubjectState:{type:'string',enum:['active']},authorizationQuote:{type:['string','null']}}};
 const schema={type:'object',additionalProperties:false,required:['lifecyclePlan'],properties:{lifecyclePlan:{anyOf:[{type:'null'},requirement]}}};
 const a=prior.compileSubjectStateTransport(schema),b=current.compileSubjectStateTransport(schema);
 assert.deepEqual(a.schema,b.schema);
 for(const lifecyclePlan of [null,{pendingDisposition:'keep',transition:null,requiredSubjectState:'active',authorizationQuote:'Only active subjects.'}]){
  const canonical={lifecyclePlan},wire=a.encode(canonical);assert.deepEqual(b.encode(canonical),wire);
  assert.deepEqual(a.decode(wire),canonical);assert.deepEqual(b.decode(wire),canonical);
 }
 for(const invalid of [{},{lifecyclePlan:{pendingDisposition:'keep',transition:'archive',requiredSubjectState:'active',authorizationQuote:null}},{lifecyclePlan:null,extra:true}])
  for(const codec of [a,b])assert.throws(()=>codec.encode(invalid));
 // Model instruction bytes differ. No claim that these structural checks prove model compliance.
});

test('actual exporter reconstructs exact production blobs, refuses collisions and never exports the review tree',()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'furvise-runtime-proof-')),dest=path.join(temp,'runtime');
 const script=path.join(root,'scripts/export-ask-runtime-20261018.mjs');
 const result=JSON.parse(execFileSync(process.execPath,[script,dest],{cwd:root,encoding:'utf8',timeout:60000}));
 assert.equal(result.exported,true);assert.equal(result.workingTreeUsed,false);
 assert.equal(result.productionGitCommit,'4e1bb4a3a54b137cf2737094a67987f88130b541');
 assert.equal(result.uploadSHA256,manifest.runtimeInclusionSHA256);
 const listed=[];
 const walk=p=>{for(const name of fs.readdirSync(p)){const f=path.join(p,name),s=fs.lstatSync(f);assert.equal(s.isSymbolicLink(),false);if(s.isDirectory())walk(f);else{assert.ok(s.isFile());listed.push(path.relative(dest,f).split(path.sep).join('/'));}}};
 walk(dest);assert.deepEqual(listed.sort(),Object.keys(manifest.files).sort());assert.equal(listed.length,658);
 for(const [name,pin]of Object.entries(manifest.files))assert.equal(hash(fs.readFileSync(path.join(dest,name))),pin,name);
 const review=manifest.reviewOnlyLegendVariant;
 assert.notEqual(hash(fs.readFileSync(path.join(dest,review.path))),review.reviewSHA256);
 const collision=spawnSync(process.execPath,[script,dest],{cwd:root,encoding:'utf8',timeout:60000});
 assert.equal(collision.status,1);assert.match(collision.stderr,/Destination must not exist/);
 const inside=spawnSync(process.execPath,[script,root],{cwd:root,encoding:'utf8',timeout:60000});
 assert.equal(inside.status,1);assert.match(inside.stderr,/Destination must be outside checkout/);
 const prefixTrap=path.join(root,'..still-inside-checkout');assert.equal(fs.existsSync(prefixTrap),false);
 const trap=spawnSync(process.execPath,[script,prefixTrap],{cwd:root,encoding:'utf8',timeout:60000});
 assert.equal(trap.status,1);assert.match(trap.stderr,/Destination must be outside checkout/);
 assert.equal(fs.existsSync(prefixTrap),false,'a double-dot name is not a parent path component');
 for(const [name,pin]of Object.entries(manifest.files))assert.equal(hash(fs.readFileSync(path.join(dest,name))),pin);
 // Deliberately retain this uniquely created fixture; never delete user files or evidence.
});
