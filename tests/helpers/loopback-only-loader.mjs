// Offline child scripts may reach only the exact server created by their test.
const allowed=process.env.FURVISE_OFFLINE_ORIGIN;
if(!/^http:\/\/127\.0\.0\.1:[1-9][0-9]{0,4}$/.test(allowed||''))throw Error('OFFLINE_LOOPBACK_ORIGIN_REQUIRED');
const nativeFetch=globalThis.fetch;
globalThis.fetch=(input,init={})=>{
 const url=new URL(typeof input==='string'||input instanceof URL?input:input.url);
 if(url.origin!==allowed||url.username||url.password)throw Error('OFFLINE_REGRESSION_NETWORK_FORBIDDEN');
 return nativeFetch(input,{...init,redirect:'error'});
};
