import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
const dir=new URL('../fixtures/',import.meta.url);
const manifest=JSON.parse(readFileSync(new URL('ask-wire-codec-schemas.v1.manifest.json',dir),'utf8'));
const sha=data=>createHash('sha256').update(data).digest('hex');
const archive=readFileSync(new URL('ask-wire-codec-schemas.v1.json.gz',dir)),data=gunzipSync(archive);
assert.equal(sha(archive),manifest.archiveSha256);
assert.equal(sha(data),manifest.uncompressedSha256);
assert.equal(sha(readFileSync(new URL('ask-wire-codec.json',dir))),manifest.corpusSha256);
const bundle=JSON.parse(data);
assert.equal(bundle.revision,manifest.sourceRevision);
// Exact historical schemas make the independently generated wire bytes meaningful.
// They are used only by ABI tests, never runtime planning or source authorization.
export function historicalWireSchema(name,kind='canonical'){
 assert.ok(Object.hasOwn(bundle.contexts,name),name);
 return structuredClone(bundle.contexts[name][kind]);
}
