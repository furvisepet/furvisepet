import assert from "node:assert/strict";
import { test } from "node:test";
import { PDFDocument, PDFName } from "pdf-lib";
import { readPetRecordsForExport } from "../app/lib/operations/user-data-export.ts";
import { renderPetRecordsPdf } from "../app/lib/operations/pet-records-pdf.ts";

test("the PDF data read requests only owner pet fields and nonremoved care notes", async () => {
  const calls = [];
  const client = {
    from(table) {
      const call = { table, filters: [] };
      calls.push(call);
      return {
        select(columns) { call.columns = columns; return this; },
        eq(...filter) { call.filters.push(filter); return this; },
        is(...filter) { call.filters.push(filter); return this; },
        order() { return this; },
        range() { return { data: [], count: 0, error: null }; },
      };
    },
  };
  assert.deepEqual(await readPetRecordsForExport(client, { id: "owner-a" }), { pets: [], entries: [] });
  assert.deepEqual(calls.map(call => call.table), ["dog_profiles", "pet_care_entries"]);
  assert.deepEqual(calls.map(call => call.filters), [[["user_id", "owner-a"]], [["user_id", "owner-a"], ["deleted_at", null]]]);
  assert.ok(calls.every(call => !call.columns.includes("*")));
});

test("the renderer builds a PDF index with clickable links to every pet and paginates history", async () => {
  const pets = [{id:"a",name:"Aster",species:"dog"},{id:"b",name:"Bramble",species:"cat"}];
  const entries = Array.from({length:48},(_,i)=>({
    id: String(i), pet_profile_id: "a", occurred_at: "2026-11-20T16:44:00Z", category: "general",
    title: "Care note " + i, note: "Daily routine unchanged. 🐕",
  }));
  const pdf = await PDFDocument.load(await renderPetRecordsPdf({pets,entries},{date:new Date("2026-11-21T00:00:00Z"),timeZone:"America/Vancouver"}));
  const [index] = pdf.getPages();
  assert.equal(index.node.Annots().size(), 2);
  for (let i=0;i<2;i++) {
    const link = pdf.context.lookup(index.node.Annots().get(i));
    assert.equal(link.get(PDFName.of("Subtype")).toString(), "/Link");
    assert.ok(link.get(PDFName.of("Dest")).get(0));
  }
  assert.ok(pdf.getPageCount()>3);
});
