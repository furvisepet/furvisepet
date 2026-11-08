import {spawn} from "node:child_process";

// Work around reproduced Windows Node 24.19 test crashes: the default
// engine failed while --no-opt passed. Preserve the real runner/loader,
// and bound worker count on the 16 GiB engineering machine. Linux stays native.
const args=process.argv.slice(2);
const flags=process.platform==="win32"?["--no-opt"]:[];
if(!args.some(arg=>arg.startsWith("--test-concurrency")))flags.push("--test-concurrency=2");
// Bound otherwise indefinitely pending tests; timeout is a failure, never a skip.
if(!args.some(arg=>arg.startsWith("--test-timeout")))flags.push("--test-timeout=600000");
const bootstrap=new URL("../tests/helpers/test-bootstrap.mjs",import.meta.url).href;
// An explicitly launched runner owns its workers; do not inherit a parent worker context.
const env={...process.env};delete env.NODE_TEST_CONTEXT;
const child=spawn(process.execPath,[...flags,"--import="+bootstrap,"--test",...args],{stdio:"inherit",env});
child.once("error",error=>{console.error(error.message);process.exitCode=1;});
child.once("exit",code=>{process.exitCode=code??1;});
for(const signal of ["SIGINT","SIGTERM"])process.on(signal,()=>child.kill(signal));
