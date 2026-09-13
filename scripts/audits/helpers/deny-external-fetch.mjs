const originalFetch=globalThis.fetch;
globalThis.fetch=(input,init)=>{const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);if(!['localhost','127.0.0.1','[::1]'].includes(url.hostname))throw new Error('OFFLINE_TEST_EXTERNAL_FETCH_BLOCKED');return originalFetch(input,init);};
