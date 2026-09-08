import {explicitHistoryDays} from './explicit-history-dates.ts';
/** An explicit date list, not a inferred period or first/latest selection. */
export function requestedHistoryTimelineDays(question: string, year: number): string[] | null {
 if(!/\b(?:list|show)\b/i.test(question) || !/\bchronological(?:ly)?\b/i.test(question)
   || /\b(?:before|after|until|since|between|from|through|only|first\s+\d|last\s+\d)\b/i.test(question))return null;
 const days=explicitHistoryDays(question,year,8);
 return days.length>=3 && new Set(days).size===days.length ? [...days].sort() : null;
}
