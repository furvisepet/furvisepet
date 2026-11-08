import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
const root=process.cwd(),files=[];
function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){if(e.name==="node_modules"||e.name===".next"||e.name===".git")continue;const p=path.join(dir,e.name);if(e.isDirectory())walk(p);else if(/\.(?:mjs|js|ts|tsx)$/.test(e.name))files.push(p);}}
walk(path.join(root,"app"));
const set=new Set(files.map(p=>p.toLowerCase())),edges=new Map(),reverse=new Map();
function resolve(p,s){let b=path.resolve(path.dirname(p),s);for(const x of [b,b+".ts",b+".tsx",b+".mjs",b+".js",path.join(b,"index.ts"),path.join(b,"index.tsx"),path.join(b,"index.mjs")])if(set.has(x.toLowerCase()))return files.find(f=>f.toLowerCase()===x.toLowerCase());return null;}
for(const p of files){const sf=ts.createSourceFile(p,fs.readFileSync(p,"utf8"),ts.ScriptTarget.Latest,true),deps=[];
 function edge(spec){if(!spec?.startsWith("."))return;const q=resolve(p,spec);if(q){deps.push(q);if(!reverse.has(q))reverse.set(q,[]);reverse.get(q).push(p);}}
 function visit(n){
  if(ts.isImportDeclaration(n)&&ts.isStringLiteral(n.moduleSpecifier)){
   const c=n.importClause;if(!c||!c.isTypeOnly&&!(c.namedBindings&&ts.isNamedImports(c.namedBindings)&&!c.name&&c.namedBindings.elements.every(e=>e.isTypeOnly)))edge(n.moduleSpecifier.text);
  }else if(ts.isExportDeclaration(n)&&!n.isTypeOnly&&n.moduleSpecifier&&ts.isStringLiteral(n.moduleSpecifier))edge(n.moduleSpecifier.text);
  else if(ts.isCallExpression(n)&&n.arguments.length&&ts.isStringLiteral(n.arguments[0])&&(n.expression.kind===ts.SyntaxKind.ImportKeyword||ts.isIdentifier(n.expression)&&n.expression.text==="require"))edge(n.arguments[0].text);
  ts.forEachChild(n,visit);
 }visit(sf);edges.set(p,deps);
}
const roots=files.filter(p=>/(?:^|[\\/])(?:route|page|layout|error|global-error|loading|not-found|template|default)\.tsx?$/.test(p));
const reachable=new Set();function mark(p){if(reachable.has(p))return;reachable.add(p);for(const q of edges.get(p)||[])mark(q);}roots.forEach(mark);
const selected=files.filter(p=>/interpret-ask|ask-wire-|ask-request-contract|planning-context|replace-job|remove-job|append-turn|field-mutation-turn|state-transition-turn|ask-read-only/.test(p));
const result={roots:roots.length,files:files.length,selected:selected.map(p=>({file:path.relative(root,p),reachable:reachable.has(p),importers:(reverse.get(p)||[]).map(q=>path.relative(root,q))}))};
fs.writeFileSync("read-only-import-reachability.json",JSON.stringify(result,null,2));process.stdout.write(JSON.stringify(result,null,2));
