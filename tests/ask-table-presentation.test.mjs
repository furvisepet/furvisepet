import test from "node:test";
import assert from "node:assert/strict";
import {parsePlainTable} from "../app/lib/furvise-output.ts";

test("blank template rows render after component whitespace is flattened",()=>{
 const table={headers:["Day","Activity"],rows:[["",""],["",""]]};
 assert.deepEqual(parsePlainTable("| Day | Activity |\n| --- | --- |\n| | |\n| | |"),table);
 assert.deepEqual(parsePlainTable("| Day | Activity | | --- | --- | | | | | | |"),table);
 assert.equal(parsePlainTable("| Day | Activity | | a | b |"),null);
});
