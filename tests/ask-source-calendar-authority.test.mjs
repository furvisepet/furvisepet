import test from 'node:test';
import assert from 'node:assert/strict';
import { explicitLeadingSourceDate, sourceDisplayDate } from '../app/lib/intelligence/source-calendar-date.ts';
import { historyDateBindingHints, historyNarrativeAnchorsSupported } from '../app/lib/intelligence/history-narrative-facts.ts';

test('leading saved calendar date outranks timezone shift for source attribution',()=>{
 const text='September 12, 2026: Sable played with a violet ball for 17 minutes.';
 assert.equal(explicitLeadingSourceDate(text),'2026-09-12');
 assert.equal(sourceDisplayDate(text,'2026-09-12T00:00:00.000Z','America/Vancouver'),'2026-09-12');
 const source={sourceId:'care:play12',text,occurredAt:'2026-09-12T00:00:00.000Z',petId:'sable',sourceType:'care_update'};
 assert.deepEqual(historyDateBindingHints('On September 12, 2026 Sable played 17 minutes.',[source],'America/Vancouver')[0].sourceIds,['care:play12']);
 assert.deepEqual(historyDateBindingHints('On September 11, 2026 Sable played 17 minutes.',[source],'America/Vancouver')[0].sourceIds,[]);
 assert.equal(historyNarrativeAnchorsSupported('On September 11, 2026 Sable played for 17 minutes.',[source],'',[],false,[],undefined,false,[],'America/Vancouver'),false);
});

test('timestamp-only saved note uses owner-local calendar date',()=>{
 const text='Sable seemed more tired than usual and only ate half her breakfast.';
 assert.equal(explicitLeadingSourceDate(text),null);
 assert.equal(sourceDisplayDate(text,'2026-09-16T05:50:26.945Z','America/Vancouver'),'2026-09-15');
 const source={sourceId:'care:tired',text,occurredAt:'2026-09-16T05:50:26.945Z',petId:'sable',sourceType:'care_update'};
 assert.deepEqual(historyDateBindingHints('The September 15, 2026 note says Sable was tired.',[source],'America/Vancouver')[0].sourceIds,['care:tired']);
 assert.deepEqual(historyDateBindingHints('The September 16, 2026 note says Sable was tired.',[source],'America/Vancouver')[0].sourceIds,[]);
});
