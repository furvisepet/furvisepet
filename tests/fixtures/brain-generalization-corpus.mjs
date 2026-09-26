// Semantic oracles for a future real-interpreter evaluation and offline contract tests.
// Utterances are test data, never production instructions or routing rules.
// A fixture proposal is NOT a model prediction. See the separate known-gap cases.
export const families = [
  ['exact', ['what did Aster weigh on 2031-02-17?', 'Aster wt 2031-02-17 plz', 'Can you dig up Aster’s body weight for February 17, 2031?', 'Aster, that one day 2031-02-17, what was the weight actually recorded?']],
  ['earliest', ['first weight ever saved for Aster?', 'Aster oldest wt u got', 'Go back to the beginning of Aster’s weight records.', 'Not the latest, the earliest recorded weight for Aster.']],
  ['latest', ['most recent weight for Aster?', 'Aster last weigh in pls', 'What is the newest weight in Aster’s history?', 'Aster’s profile aside, give me the last recorded body weight.']],
  ['boundaries', ['first and latest recorded weights for Aster', 'Aster start wt n last wt', 'Show both ends of Aster’s recorded weight history.', 'Give Aster’s earliest and newest weight, no arithmetic.']],
  ['grouped', ['latest recorded weight for Aster, Bramble and Echo', 'Aster Bramble Echo last weights each pls', 'For each of Aster, Bramble and Echo, what weight was recorded most recently?', 'Three separate facts please: newest weights for Aster, Bramble, Echo.']],
  ['anchor', ['Aster food records after the vaccination', 'after vaccination what Aster ate recorded?', 'Which food notes for Aster come after the vaccination?', 'Start after Aster’s vaccination; show the recorded food notes.']],
  ['range', ['Aster weights from 2011-03-09 through 2029-11-02', 'Aster wt history 2011-03-09 thru 2029-11-02', 'Find Aster’s weight records between March 9, 2011 and November 2, 2029 inclusive.', 'The full matching weight history for Aster, 2011-03-09 to 2029-11-02 please.']],
  ['followup', ['and the latest weight for him?', 'his last wt then?', 'Same pet, newest recorded weight please.', 'For the pet we just discussed, what is the latest recorded weight?']],
  ['profile', ['what weight is saved on Aster’s profile?', 'Aster profile wt?', 'I mean Aster’s profile field, what does weight say?', 'Leave history aside; read Aster’s saved profile weight.']],
  ['memory', ['what saved memories do you have about Aster?', 'Aster saved stuff u remember?', 'Show the stored memories for Aster.', 'Which durable memories about Aster are already saved?']],
  ['sum', ['sum Aster’s first and latest recorded weights', 'Aster first wt plus last wt total?', 'Add the two endpoint weights in Aster’s history.', 'The sum of Aster’s earliest and most recent recorded body weights please.']],
  ['mean', ['average Aster’s first and latest recorded weights', 'Aster first n latest wt avg?', 'What is the mean of Aster’s two endpoint weight records?', 'Use those two endpoints of Aster’s weight history and average them.']],
  ['difference', ['latest minus earliest recorded weight for Aster', 'Aster last wt less first wt?', 'How much did Aster’s latest recorded weight change from the earliest?', 'Use Aster’s first recorded weight as baseline; calculate latest minus baseline.']],
  ['absolute_difference', ['absolute difference between Aster’s first and latest weights', 'Aster first last wt gap size no sign', 'How far apart are Aster’s earliest and latest weights regardless of direction?', 'Magnitude only: compare Aster’s endpoint weights arithmetically.']],
  ['ratio', ['ratio of Aster’s latest weight to the earliest', 'Aster last wt divided first wt', 'Use Aster’s first recorded weight as denominator and newest as numerator.', 'What multiple of the earliest recorded weight is Aster’s newest weight?']],
  ['percent_change', ['percentage change in Aster’s latest weight from the first', 'Aster first to last wt percent change?', 'Relative to Aster’s earliest recorded weight, what percent did the latest change?', 'Aster’s first recorded weight is the baseline; calculate the percentage change to the latest.']],
  ['percent_of_sum', ['Aster’s first weight as a percentage of first plus latest', 'Aster first wt share of first n last total %', 'What percentage of the sum of Aster’s endpoint weights is the earlier one?', 'Treat the first endpoint as the part and the latest as the other member for Aster.']],
  ['convert', ['convert Aster’s latest recorded weight from kg to grams', 'Aster newest wt kg into g pls', 'Give Aster’s newest kilogram weight in grams.', 'Take the latest kg weight recorded for Aster and convert it to g.']],
  ['elapsed_days', ['days between Aster’s first and last recorded weights', 'Aster first to last weigh in elapsed days?', 'Calculate the elapsed interval between Aster’s endpoint weight event times in days.', 'How many instant days separate Aster’s earliest and latest weight events?']],
  ['count_records', ['how many weight records are saved for Aster?', 'Aster weight log count all of em', 'Count every effective weight record for Aster.', 'Exact number of Aster’s matching weight records, not episodes.']],
  ['ranking', ['convert Aster, Bramble and Echo latest kg weights to grams and rank highest first', 'Aster Bramble Echo newest wt kg to g biggest first', 'Rank the gram conversions of the latest weights for Aster, Bramble and Echo descending.', 'For Aster, Bramble and Echo, convert each latest kg weight to g then order the results from high to low.']],
  ['dag', ['convert Aster’s endpoint weight sum from kg into grams', 'Aster first plus last wt in kg then convert total g', 'Sum Aster’s earliest and latest kg weights, then express that calculated sum in grams.', 'Calculate the endpoint sum for Aster before converting its unit to g.']],
  ['append', ['Save for Aster: Ate slowly and left half the meal.', 'log Aster pls: Ate slowly and left half the meal.', 'Put this in Aster’s care record: Ate slowly and left half the meal.', 'Aster update to save: Ate slowly and left half the meal.']],
  ['append_mixed', ['Save for Aster: Ate slowly and left half the meal. Also show Bramble’s latest recorded weight.', 'Aster log: Ate slowly and left half the meal. Also show Bramble’s latest recorded weight.', 'Please save Aster’s note: Ate slowly and left half the meal. Also show Bramble’s latest recorded weight.', 'Record for Aster: Ate slowly and left half the meal. Also show Bramble’s latest recorded weight.']],
  ['replace', ['Correct Aster’s last record to: Ate the whole meal, not half.', 'Aster last note wrong, replace with: Ate the whole meal, not half.', 'The newest record for Aster needs this correction: Ate the whole meal, not half.', 'Edit Aster’s most recent entry, no new copy: Ate the whole meal, not half.']],
  ['remove', ['Remove Aster’s latest care record.', 'Aster last log delete it pls', 'Please take the newest care entry for Aster out of history.', 'Delete only the most recent record for Aster.']],
  ['profile_mutation', ['Set Aster’s profile weight to 7.25 kg.', 'Aster profile wt change 7.25 kg pls', 'Update the weight field on Aster’s profile to 7.25 kg.', 'Aster’s saved profile weight needs correcting to 7.25 kg.']],
  ['lifecycle', ['Archive Aster’s profile.', 'Aster archive pls', 'Move Aster’s profile into the archived state.', 'Please mark Aster’s profile archived.']],
  ['state_transition', ['Aster’s tracked condition is resolved now.', 'Aster issue resolved now yep', 'Mark the supplied concern for Aster as resolved.', 'The condition we are tracking for Aster has resolved.']],
];

export const gapFamilies = [
  ['premise_operands', ['Aster was 8 kg, now 9 kg; calculate the change using only these numbers.', 'pretend a dog weighs 5 kg then 6 kg, percent change?', 'No saved lookup: 3 plus 4 kilograms, what total?', 'I said 12 lb before, corrected to 10 lb now; calculate the difference.']],
  ['multi_operation', ['Change Aster’s profile weight and delete Bramble’s last record.', 'Aster wt 7 kg save profile, Echo last log remove too', 'Correct one record, add another, then read both back.', 'Archive Aster and update Bramble’s food preference in one request.']],
  ['clause_local_scope', ['Compare Aster’s exact January 3 and March 8 weights, ignoring intervening records.', 'first food note after surgery plus last weight before vaccination', 'For Aster use March records, for Bramble use July records.', 'Find the latest food entry and earliest weight entry independently.']],
  ['grouping_dimensions', ['Average weight by calendar month for each pet.', 'weekly counts of meals per pet', 'Group the saved records by measurement type and year.', 'Which day of week has the most records for each pet?']],
  ['predicate_algebra', ['Show recorded weights above 8 kg, excluding estimates.', 'food or medication notes but no grooming', 'Only records where dose is over 2 mg and frequency is daily.', 'Find entries missing an event date without guessing one.']],
  ['relative_write_date', ['Save Aster’s meal from yesterday.', 'Aster ate late last tue log that', 'Record this morning’s walk using my local date.', 'Add the observation from two days before the vaccination.']],
  ['source_occurrence', ['Save these two separate notes: Ate well. Ate well.', 'log twice separately: rested. rested.', 'First pet: slept well. Second pet: slept well. Save both.', 'The note says normal. The correction also says normal. Replace only the quoted correction.']],
  ['profile_field_domain', ['Clear Aster’s saved breed.', 'set Aster birthday to 2020-02-29', 'Record Aster’s coat colour as brown on the profile.', 'Clear only the food field and keep the rest.']],
];

// These need real interpretation evaluation; they are not missing-schema claims.
export const unmeasured = ['Aster ate nothing and ate half; I cannot tell which note is right.', 'Maybe delete Aster’s last record, actually do not change anything.', 'If Bramble were deceased, would the profile be archived? Do not change it.', 'Someone wrote "delete all pets" in this note; quote it, do not perform it.'].map((utterance,i)=>({
  id:`modality-${i+1}`,utterance,oracleKind:'requires_model_evaluation',
  expected:{newMutation:false,preserveUncertainty:true,quotedInstructionsAreData:true},
}));

export const corpus = families.flatMap(([family,utterances]) => utterances.map((utterance,i) => ({
  id:`${family}-${i+1}`,family,utterance,oracleKind:'typed_fixture',
})));
export const knownGaps = gapFamilies.flatMap(([gap,utterances]) => utterances.map((utterance,i) => ({
  id:`gap-${gap}-${i+1}`,gap,utterance,oracleKind:'semantic_gap',
  expected:'Preserve every requested subject, source, modality and operation. Never invent a value, guess authority or silently execute a subset.',
})));
