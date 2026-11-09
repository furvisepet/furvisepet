/** Display instants in the reader's local zone; retain zone names across DST folds. */
export function formatAskCitationDate(value:string,locale?:string,timeZone?:string) {
 const date=new Date(value);
 if(!Number.isFinite(date.getTime()))return "Date unavailable";
 return new Intl.DateTimeFormat(locale,{dateStyle:"medium",timeStyle:"long",...(timeZone?{timeZone}:{})}).format(date);
}
