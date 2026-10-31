// Export only the pinned production runtime from immutable local Git blobs.
// The review working tree is deliberately not the production source.
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'docs/releases/ask-20261018-runtime-manifest.json'),'utf8'));
const h=b=>crypto.createHash('sha256').update(b).digest('hex');
const entries=Object.entries(manifest.files).sort(([a],[b])=>a<b?-1:a>b?1:0);
assert.equal(entries.length,658);
assert.equal(h(JSON.stringify(Object.fromEntries(entries))),manifest.runtimeInclusionSHA256);
assert(/^[a-f0-9]{40}$/.test(manifest.productionGitCommit),'Pinned production commit required');
for(const [rel]of entries)
 assert(!path.isAbsolute(rel)&&!rel.split('/').includes('..')&&!/[\\\r\n]/.test(rel)&&!/^(?:\.git|node_modules)(?:\/|$)/.test(rel));

const specs=entries.map(([rel])=>manifest.productionGitCommit+':'+rel).join('\n')+'\n';
// No fetch, hook, filter or checkout. Read only the exact positive-list objects.
const batch=execFileSync('git',['--no-replace-objects','-C',root,'cat-file','--batch'],
 {input:Buffer.from(specs),maxBuffer:128*1024*1024});
const runtime=new Map();let offset=0;
for(const [rel,pin]of entries){
 const newline=batch.indexOf(10,offset);assert(newline>=offset,'Missing Git object header');
 const header=batch.subarray(offset,newline).toString('ascii');
 const match=/^[a-f0-9]{40,64} blob ([0-9]+)$/.exec(header);assert(match,'Missing or non-blob production object: '+rel);
 const size=Number(match[1]);assert(Number.isSafeInteger(size)&&size>=0&&size<=64*1024*1024,'Production object size bound');
 const start=newline+1,end=start+size;assert(end<batch.length&&batch[end]===10,'Truncated Git object: '+rel);
 const bytes=batch.subarray(start,end);assert.equal(h(bytes),pin,rel);runtime.set(rel,bytes);offset=end+1;
}
assert.equal(offset,batch.length,'Unexpected trailing Git objects');
const identity={runtimeFiles:658,productionGitCommit:manifest.productionGitCommit,sourceSHA256:manifest.sourceSHA256,
 uploadSHA256:manifest.runtimeInclusionSHA256,source:'pinned_local_git_blobs',workingTreeUsed:false};
if(process.argv[2]==='--check')console.log(JSON.stringify({verified:true,...identity}));
else{
 assert(process.argv.length===3,'Usage: node scripts/export-ask-runtime-20261018.mjs <new-external-directory>|--check');
 const dest=path.resolve(process.argv[2]),a=path.relative(root,dest),b=path.relative(dest,root);
 const outside=p=>p==='..'||p.startsWith('..'+path.sep)||path.isAbsolute(p);
 assert(outside(a)&&outside(b),'Destination must be outside checkout and not its ancestor');
 assert(!fs.existsSync(dest),'Destination must not exist');
 fs.mkdirSync(dest);
 for(const[rel,pin]of entries){
  const out=path.join(dest,rel);fs.mkdirSync(path.dirname(out),{recursive:true});
  fs.writeFileSync(out,runtime.get(rel),{flag:'wx'});assert.equal(h(fs.readFileSync(out)),pin);
 }
 console.log(JSON.stringify({exported:true,...identity}));
}
