/** Fixed diagnostic vocabulary; never copy database messages, values or IDs. */
export function claimFailureCategory(error:unknown):string {
 const own=(key:string):unknown=>{
  try{return error&&typeof error==="object"?Object.getOwnPropertyDescriptor(error,key)?.value:undefined;}catch{return undefined;}
 };
 const name=own("name"),rawCode=own("code"),rawStatus=own("status"),message=own("message");
 const code=typeof rawCode==="string"?rawCode:"";
 const status=typeof rawStatus==="number"?rawStatus:0;
 if(name==="AbortError"||name==="TimeoutError"||code==="ETIMEDOUT"||code==="UND_ERR_CONNECT_TIMEOUT")return "BACKEND_TIMEOUT";
 if(["PGRST000","PGRST001","PGRST002","PGRST003"].includes(code))return "BACKEND_CONNECTION";
 if(["ECONNRESET","ECONNREFUSED"].includes(code)||[502,503,504].includes(status))return "BACKEND_TRANSPORT";
 if(message==="IDEMPOTENCY_ADMIN_CONFIGURATION_MISSING")return "BACKEND_CONFIGURATION";
 if([401,403].includes(status))return "BACKEND_AUTHORIZATION";
 if(typeof code==="string"&&/^(?:22|23|28|42|PGRST)/.test(code))return "BACKEND_DATABASE";
 return "BACKEND_UNCLASSIFIED";
}
