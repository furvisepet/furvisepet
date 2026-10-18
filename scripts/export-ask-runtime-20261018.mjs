// Export the reviewed runtime only; never export the whole checkout or local configuration.
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {fileURLToPath} from 'node:url';import assert from 'node:assert/strict';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'docs/releases/ask-20261018-runtime-manifest.json'),'utf8'));
const h=b=>crypto.createHash('sha256').update(b).digest('hex');
const entries=Object.entries(manifest.files).sort(([a],[b])=>a<b?-1:a>b?1:0);
assert.equal(entries.length,658);assert.equal(h(JSON.stringify(Object.fromEntries(entries))),manifest.runtimeInclusionSHA256);
const runtime=new Map();
for(const [rel,pin]of entries){
 assert(!path.isAbsolute(rel)&&!rel.split('/').includes('..')&&!rel.includes('\\')&&!/^(?:\.git|node_modules)(?:\/|$)/.test(rel));
 const p=path.join(root,rel);assert(fs.lstatSync(p).isFile()&&!fs.lstatSync(p).isSymbolicLink());
 let bytes=fs.readFileSync(p);
 if(h(bytes)!==pin){
  const variant=manifest.typeOnlyReviewVariants?.[rel];
  assert(variant&&variant.productionSHA256===pin&&h(bytes)===variant.reviewSHA256,'Unreviewed runtime bytes: '+rel);
  assert(/^[a-f0-9]{40}$/.test(manifest.productionGitCommit),'Pinned production commit required');
  // Read an already-present immutable Git blob. Never fetch, execute a hook, or deploy.
  bytes=execFileSync('git',['--no-replace-objects','-C',root,'cat-file','blob',manifest.productionGitCommit+':'+rel],{maxBuffer:64*1024*1024});
 }
 assert.equal(h(bytes),pin,rel);runtime.set(rel,bytes);
}
if(process.argv[2]==='--check'){console.log(JSON.stringify({verified:true,runtimeFiles:658,sourceSHA256:manifest.sourceSHA256,uploadSHA256:manifest.runtimeInclusionSHA256}));}
else{
 assert(process.argv.length===3,'Usage: node scripts/export-ask-runtime-20261018.mjs <new-external-directory>|--check');
 const dest=path.resolve(process.argv[2]),a=path.relative(root,dest),b=path.relative(dest,root);assert(a.startsWith('..')&&b.startsWith('..'),'Destination must be outside checkout and not its ancestor');assert(!fs.existsSync(dest),'Destination must not exist');
 fs.mkdirSync(dest);for(const[rel,pin]of entries){const out=path.join(dest,rel);fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,runtime.get(rel),{flag:'wx'});assert.equal(h(fs.readFileSync(out)),pin);}
 console.log(JSON.stringify({exported:true,runtimeFiles:658,sourceSHA256:manifest.sourceSHA256,uploadSHA256:manifest.runtimeInclusionSHA256}));
}
