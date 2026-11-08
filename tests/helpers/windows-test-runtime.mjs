import {setFlagsFromString} from 'node:v8';
// Match the Windows launcher for nested test children that inherit NODE_OPTIONS.
// Test-only; Linux and production execution do not import this workaround.
if(process.platform==='win32')setFlagsFromString('--no-opt');
