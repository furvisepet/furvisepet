import test from "node:test";
import assert from "node:assert/strict";
import {formatAskCitationDate} from "../app/lib/ask-citation-date.ts";
test("citation dates distinguish the two repeated local hours at a DST boundary",()=>{
 const before=formatAskCitationDate("2026-11-01T08:30:00Z","en-US","America/Los_Angeles");
 const after=formatAskCitationDate("2026-11-01T09:30:00Z","en-US","America/Los_Angeles");
 assert.match(before,/1:30:00/);assert.match(after,/1:30:00/);
 assert.match(before,/PDT/);assert.match(after,/PST/);assert.notEqual(before,after);
});
test("event and recording instants preserve different local calendar days",()=>{
 assert.match(formatAskCitationDate("2026-09-16T06:30:00Z","en-US","America/Los_Angeles"),/Sep 15, 2026/);
 assert.match(formatAskCitationDate("2026-09-16T08:30:00Z","en-US","America/Los_Angeles"),/Sep 16, 2026/);
 assert.equal(formatAskCitationDate("invalid"),"Date unavailable");
});
