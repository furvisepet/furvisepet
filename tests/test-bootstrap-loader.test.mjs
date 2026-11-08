import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,writeFileSync,rmSync} from "node:fs";
import {dirname,join} from "node:path";
import {fileURLToPath,pathToFileURL} from "node:url";
import {execFileSync} from "node:child_process";
const bootstrap=new URL("./helpers/test-bootstrap.mjs",import.meta.url).href;
function fixture(t){
 const dir=mkdtempSync(join(dirname(fileURLToPath(import.meta.url)),".loader-fixture-"));
 t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const path=join(dir,"value.ts");
 writeFileSync(path,'import type { Missing } from "./not-a-runtime-module";\nexport enum Role { Owner="owner" }\nexport class Identity { constructor(public role:Role){} }\nexport const literal="Exact \\u2014 literal";\nexport const value=new Identity(Role.Owner);');
 return {dir,path,url:pathToFileURL(path).href};
}
test("canonical bootstrap executes typed enums, parameter properties and exact Unicode without native TS flags",t=>{
 const f=fixture(t);
 const result=execFileSync(process.execPath,["--import="+bootstrap,"--input-type=module","-e",
  "const m=await import("+JSON.stringify(f.url)+"); console.log(JSON.stringify({role:m.value.role,literal:m.literal}));"],{encoding:"utf8",timeout:15000});
 assert.deepEqual(JSON.parse(result),{role:"owner",literal:"Exact \u2014 literal"});
});
test("child process propagation retains the same test-only TypeScript loader",t=>{
 const f=fixture(t);
 const inner="const m=await import("+JSON.stringify(f.url)+");console.log(m.value.role);";
 const outer="import{execFileSync}from'node:child_process';process.stdout.write(execFileSync(process.execPath,['--input-type=module','-e',"+JSON.stringify(inner)+"],{encoding:'utf8'}));";
 const result=execFileSync(process.execPath,["--import="+bootstrap,"--input-type=module","-e",outer],{encoding:"utf8",timeout:15000});
 assert.equal(result.trim(),"owner");
});
test("syntax-invalid TypeScript fails before module execution",t=>{
 const f=fixture(t);writeFileSync(f.path,"export const broken: = 1;");
 assert.throws(()=>execFileSync(process.execPath,["--import="+bootstrap,"--input-type=module","-e","await import("+JSON.stringify(f.url)+");"],{encoding:"utf8",timeout:15000,stdio:"pipe"}),error=>String(error.stderr).includes("SyntaxError"));
});
