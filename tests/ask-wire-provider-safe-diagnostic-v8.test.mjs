import test from 'node:test';
import assert from 'node:assert/strict';
import {safeStructuredValidationReason} from '../app/lib/ai/ask-provider.ts';
test('V8 strict graph codes are reported as bounded contract-owned diagnostics',()=>{
 for(const code of ['ASK_WIRE_WIRE_SCHEMA','ASK_WIRE_INVALID_EDGE','ASK_WIRE_UNREACHABLE_NODES','ASK_RECURSIVE_INDEXED_ENVELOPE']) assert.equal(safeStructuredValidationReason(Error(code)),code);
});
test('unknown error messages are never copied into diagnostic logs',()=>{
 const secret='private owner response: extremely-sensitive-text';
 assert.equal(safeStructuredValidationReason(Error(secret)),'STRUCTURED_CONTRACT_INVALID');
 assert.equal(safeStructuredValidationReason(new SyntaxError(secret)),'JSON_SYNTAX');
});
test('unsupported wire codes are not treated as safe',()=>{
 assert.equal(safeStructuredValidationReason(Error('ASK_WIRE_PRIVATE_RECORD_123')),'STRUCTURED_CONTRACT_INVALID');
});
