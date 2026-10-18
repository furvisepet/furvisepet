import {registerHooks,createRequire} from 'node:module';
import fs from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url)),req=createRequire(root+'package.json');
registerHooks({resolve(s,c,next){
 if(s==='server-only')return {shortCircuit:true,url:'data:text/javascript,export {}'};
 if(s.startsWith('@/'))s=pathToFileURL(root+s.slice(2)).href;
 try{return next(s,c)}catch(e){
  if(!['ERR_MODULE_NOT_FOUND','ERR_UNSUPPORTED_DIR_IMPORT'].includes(e?.code))throw e;
  if(!s.startsWith('.')&&!s.startsWith('file:'))return next(pathToFileURL(req.resolve(s)).href,c);
  const u=new URL(s,c.parentURL);for(const ext of ['.ts','.mjs','.js','/index.ts'])if(fs.existsSync(fileURLToPath(u)+ext))return next(u.href+ext,c);throw e;
 }
}});
