// Read-only inventory: no app imports, environment loading, provider calls or DB access.
// Run from the repository root. Output goes to stdout for review, not to live services.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';

const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
const tracked = new Set(files);
const entries = [];
const edges = [];
const definitions = new Map();
const sources = new Map();
const normalize = value => path.posix.normalize(value.replaceAll('\\', '/'));
function resolve(from, specifier) {
  if (!specifier.startsWith('.') && !specifier.startsWith('@/')) return null;
  const base = normalize(specifier.startsWith('@/') ? specifier.slice(2) : path.posix.join(path.posix.dirname(from), specifier));
  // Bundler prefers TS; extensionless files remain separate Node runtime bridges.
  return [base + '.ts', base + '.tsx', base + '.js', base + '.mjs', base, base + '/index.ts', base + '/index.tsx', base + '/index.js'].find(p => tracked.has(p)) || null;
}
for (const file of files) {
  if (!fs.existsSync(file)) continue;
  const bytes = fs.readFileSync(file);
  const binary = bytes.includes(0) || /\.(png|webp|jpg|ico|pdf)$/i.test(file);
  const source = binary ? '' : bytes.toString('utf8');
  sources.set(file, source);
  const entry = { file, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex'), binary,
    lines: binary ? null : source.split('\n').length, imports: [], exports: [], http: [], rpc: [], tables: [], sql: [], flags: [], references: [] };
  const code = /\.(tsx?|m?[jc]s)$/.test(file) || (file.startsWith('app/lib/') && !path.posix.extname(file));
  if (code) {
    const ast = ts.createSourceFile(file + (path.posix.extname(file) ? '' : '.js'), source, ts.ScriptTarget.Latest, true);
    const addImport = (specifier, kind) => {
      const target = resolve(file, specifier);
      entry.imports.push({ specifier, kind, target });
      if (target) edges.push({ from: file, to: target, kind });
    };
    function visit(node) {
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier))
        addImport(node.moduleSpecifier.text, ts.isExportDeclaration(node) ? 're-export' : node.importClause?.isTypeOnly ? 'type-import' : 'import');
      if (ts.isCallExpression(node)) {
        const name = node.expression.getText(ast);
        const arg = node.arguments[0];
        if (arg && ts.isStringLiteralLike(arg)) {
          if (name === 'require' || node.expression.kind === ts.SyntaxKind.ImportKeyword) addImport(arg.text, 'dynamic-import');
          if (name.endsWith('.rpc')) entry.rpc.push(arg.text);
          if (name.endsWith('.from')) entry.tables.push(arg.text);
        }
      }
      if (ts.isStringLiteralLike(node) || ts.isTemplateExpression(node)) {
        const value = ts.isTemplateExpression(node) ? node.head.text + node.templateSpans.map(span => '${*}' + span.literal.text).join('') : node.text;
        if (value.startsWith('/api/') || value.startsWith('/auth/')) entry.http.push(value);
        if (tracked.has(value)) entry.references.push(value);
        if (tracked.has('public' + value)) { entry.references.push('public' + value); edges.push({from:file,to:'public'+value,kind:'asset-url'}); }
      }
      if (node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword) && node.name) entry.exports.push(node.name.getText(ast));
      ts.forEachChild(node, visit);
    }
    visit(ast);
  }
  for (const match of source.matchAll(/process\.env\.([A-Z][A-Z0-9_]+)/g)) entry.flags.push(match[1]);
  if (file.endsWith('.sql')) {
    for (const match of source.matchAll(/\b(?:on|table|into|update|from|join|references)\s+(?:if\s+not\s+exists\s+)?public\.([a-z_][a-z0-9_]*)/gi)) entry.tables.push(match[1]);
    for (const match of source.matchAll(/\b(create\s+(?:or\s+replace\s+)?(?:function|table|view|trigger|policy)|alter\s+table|grant|revoke|cron\.schedule)\s+([^\n;]+)/gi)) entry.sql.push(match[0].trim());
    for (const match of source.matchAll(/create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?([a-z_][a-z0-9_]*)/gi)) {
      const name = match[1]; definitions.set(name, [...(definitions.get(name) || []), file]);
    }
  }
  // Text references include script argv, CSS URLs, config paths, markdown links and asset manifests.
  for (const match of source.matchAll(/(?:app|scripts|tests|supabase|data|public|output|tmp)\/[a-zA-Z0-9_./\[\]-]+/g)) if (tracked.has(match[0])) entry.references.push(match[0]);
  if (/\.(css|json|webmanifest|md|yml)$/.test(file)) for (const asset of files.filter(p => p.startsWith('public/'))) {
    if (source.includes(asset.slice(7))) entry.references.push(asset);
  }
  for (const field of ['exports','http','rpc','tables','sql','flags','references']) entry[field] = [...new Set(entry[field])];
  for (const to of entry.references) edges.push({from:file,to,kind:'text-reference'});
  entry.framework = /(?:^|\/)(page|layout|route|loading|error|global-error|not-found|default|template|sitemap|robots|icon|apple-icon|opengraph-image|twitter-image)\.[^.]+$/.test(file) && file.startsWith('app/') && !file.startsWith('app/lib/') && !file.startsWith('app/components/') || /^(proxy|instrumentation|instrumentation-client|sentry\..*\.config|next.config)\.[^.]+$/.test(file) || file === 'app/favicon.ico';
  entries.push(entry);
}
for (const e of entries) for (const rpc of e.rpc) for (const to of definitions.get(rpc) || []) edges.push({from:e.file,to,kind:'rpc:'+rpc});
const routes = entries.filter(e => /\/route\.[^.]+$/.test(e.file)).map(e => ({file:e.file,url:e.file.replace(/^app/,'').replace(/\/route\.[^.]+$/,'')}));
for (const e of entries) for (const url of e.http) for (const route of routes) {
  const pattern = '^' + route.url.replace(/\[[^\]]+\]/g, '[^/]+') + '$';
  if (new RegExp(pattern).test(url.split('?')[0])) edges.push({from:e.file,to:route.file,kind:'http'});
}
// A SQL symbol reference is conservative: includes trigger/function bodies and
// policy expressions, and links every historical definition, not just the last.
for (const e of entries.filter(e => e.file.endsWith('.sql'))) for (const [symbol, targets] of definitions) {
  if (new RegExp('\\b' + symbol + '\\s*\\(', 'i').test(sources.get(e.file))) for (const to of targets)
    if (to !== e.file) edges.push({from:e.file,to,kind:'sql-symbol:'+symbol});
}
const runtime = new Set(entries.filter(e => e.framework).map(e=>e.file));
let change = true;
while(change) { change=false; for(const edge of edges) if (runtime.has(edge.from) && !runtime.has(edge.to) && edge.kind !== 'text-reference') { runtime.add(edge.to); change=true; } }
const incoming = new Map();
for (const edge of edges) incoming.set(edge.to,[...(incoming.get(edge.to)||[]),{from:edge.from,kind:edge.kind}]);
for (const entry of entries) { entry.runtimeReachable=runtime.has(entry.file); entry.incoming=incoming.get(entry.file)||[]; }
const pkg = JSON.parse(fs.readFileSync('package.json','utf8'));
process.stdout.write(JSON.stringify({commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
  scope:'All existing tracked file bytes scanned; AST dependency analysis for JS/TS, lexical SQL/config/data references. Not a proof of dynamic reachability or SQL execution.',
  counts:{tracked:files.length,scanned:entries.length,runtimeDependencies:Object.keys(pkg.dependencies).length,devDependencies:Object.keys(pkg.devDependencies).length,lockfilePackages:Object.keys(JSON.parse(fs.readFileSync('package-lock.json','utf8')).packages).filter(k=>k!=='').length},entries,edges},null,2)+'\n');
