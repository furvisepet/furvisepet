// Standalone Node test compatibility only; never imported by application code.
import {registerHooks} from 'node:module';
import {existsSync} from 'node:fs';
registerHooks({resolve(specifier,context,next){
  if(specifier==='server-only')return {url:'data:text/javascript,export {};',format:'module',shortCircuit:true};
  if(specifier.startsWith('.')&&context.parentURL?.startsWith('file:')){
    for(const suffix of ['.ts','/index.ts']){
      const url=new URL(specifier+suffix,context.parentURL);
      if(existsSync(url))return next(url.href,context);
    }
  }
  return next(specifier,context);
}});
globalThis.fetch=async()=>{throw Error('BRAIN_GENERALIZATION_OFFLINE_ONLY');};
