import fs from "node:fs";import path from "node:path";import ts from "typescript";
const root=process.cwd(),files=[];
function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){if(["node_modules",".next",".git"].includes(e.name))continue;const p=path.join(dir,e.name);if(e.isDirectory())walk(p);else if(/\.(?:mjs|js|ts|tsx)$/.test(e.name))files.push(path.resolve(p));}}
for(const dir of ["app","tests","scripts"])walk(dir);
const config=ts.readConfigFile("tsconfig.json",ts.sys.readFile);const parsed=ts.parseJsonConfigFileContent(config.config,ts.sys,root);
const allowed=new Set(files),edges=new Map(),reverse=new Map();
for(const p of files){const sf=ts.createSourceFile(p,fs.readFileSync(p,"utf8"),ts.ScriptTarget.Latest,true),deps=[];
 function edge(spec){const direct=path.resolve(root,spec);if(allowed.has(direct)){deps.push(direct);if(!reverse.has(direct))reverse.set(direct,[]);reverse.get(direct).push(p);}const resolved=ts.resolveModuleName(spec,p,parsed.options,ts.sys).resolvedModule?.resolvedFileName;const q=resolved&&path.resolve(resolved);if(q&&allowed.has(q)){deps.push(q);if(!reverse.has(q))reverse.set(q,[]);reverse.get(q).push(p);}}
 function visit(n){if(ts.isImportTypeNode(n)&&ts.isLiteralTypeNode(n.argument)&&ts.isStringLiteral(n.argument.literal))edge(n.argument.literal.text);if((ts.isImportDeclaration(n)||ts.isExportDeclaration(n))&&n.moduleSpecifier&&ts.isStringLiteral(n.moduleSpecifier))edge(n.moduleSpecifier.text);else if(ts.isCallExpression(n)&&n.arguments.length&&ts.isStringLiteral(n.arguments[0])&&(n.expression.kind===ts.SyntaxKind.ImportKeyword||ts.isIdentifier(n.expression)&&n.expression.text==="require"))edge(n.arguments[0].text);ts.forEachChild(n,visit);}visit(sf);edges.set(p,deps);
}
const roots=files.filter(p=>p.includes(path.sep+"app"+path.sep)&&/(?:^|[\\/])(?:route|page|layout|error|global-error|loading|not-found|template|default)\.tsx?$/.test(p));
for(const p of ["middleware.ts","proxy.ts"]){if(fs.existsSync(p))roots.push(path.resolve(p));}
const reachable=new Set();function mark(p){if(reachable.has(p))return;reachable.add(p);for(const q of edges.get(p)||[])mark(q);}roots.forEach(mark);
const targets=files.filter(p=>p.includes(path.sep+"app"+path.sep)&&/ask-wire-|interpret-ask\.ts$|intelligence[\\/]ask-request-contract\.ts$/.test(p));
const affected=new Set();function back(p){if(affected.has(p))return;affected.add(p);for(const q of reverse.get(p)||[])back(q);}targets.forEach(back);
function chain(target){const queue=roots.map(p=>[p]),seen=new Set();while(queue.length){const list=queue.shift(),p=list.at(-1);if(p===target)return list.map(p=>path.relative(root,p));if(seen.has(p))continue;seen.add(p);for(const q of edges.get(p)||[])queue.push([...list,q]);}return null;}
const result={source:process.argv[2],rootCount:roots.length,rootReachable:reachable.size,targets:targets.map(p=>({file:path.relative(root,p),reachableIncludingTypes:reachable.has(p),rootChain:chain(p),importers:(reverse.get(p)||[]).map(q=>path.relative(root,q))})),affected:[...affected].map(p=>({file:path.relative(root,p),reachableIncludingTypes:reachable.has(p)}))};
fs.writeFileSync("engineering/v27-read-only-1108z/retirement-type-map.json",JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
