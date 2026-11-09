import {registerHooks} from "node:module";
registerHooks({resolve(specifier,context,next){
 if(context.parentURL?.includes("/api/ask/")&&specifier.includes("authenticated-api-server"))
  return {shortCircuit:true,url:"data:text/javascript,export const getAuthenticatedApiContext=async()=>globalThis.__readOnlyMutationAuth"};
 return next(specifier,context);
}});
export const {POST}=await import("../../app/api/ask/actions/[messageId]/route.ts");
export const {PATCH}=await import("../../app/api/ask/suggestions/[id]/route.ts");
export const messageId="11111111-1111-4111-8111-111111111111";
export const request=(method="POST")=>new Request("https://fixture.invalid/api/ask/disabled",{method,body:JSON.stringify({actionId:messageId,ownerId:"other-owner",decision:"confirm",action:"save"})});
