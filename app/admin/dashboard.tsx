"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import styles from "./dashboard.module.css";
type DashboardData = {
 updatedAt:string;trackingStartedAt:string;overview:Record<string,number>;
 users:{id:string;email:string;created_at:string;account_days:number;last_seen:string|null;plan:string;subscription_status:string;excluded:boolean;cancel_at_period_end:boolean}[];
 features:{feature:string;total:number;completed:number;released:number;pending:number}[];
 daily:{day:string;signups:number;active:number}[];
 costs:{actual:number;pendingReserved:number;calls:number;unreconciled:number};
 errorGroups:{feature:string;count:number}[];
 errors:{created_at:string;event_type:string;feature:string;severity:string;error_code:string|null;route:string|null;request_id:string|null;duration_ms:number|null}[];
 askOutcomes:{outcome:string;count:number}[];
};
const date=(value:string|null)=>value ? new Date(value).toLocaleString(undefined,{dateStyle:"medium",timeStyle:"short"}) : "Not recorded";
export default function Dashboard(){
 const [days,setDays]=useState(7),[includeTests,setIncludeTests]=useState(false),[refresh,setRefresh]=useState(0);
 const [data,setData]=useState<DashboardData|null>(null),[error,setError]=useState(""),[loading,setLoading]=useState(true),[busy,setBusy]=useState<string|null>(null);
 useEffect(()=>{
  let alive=true,controller:AbortController|undefined;
  async function load(){
   controller?.abort();controller=new AbortController();
   try{
    const response=await fetch(`/api/admin/dashboard?days=${days}&includeTests=${includeTests}`,{cache:"no-store",signal:controller.signal});
    if(!response.ok){
     const accessDenied=response.status===401 || response.status===403 || response.status===404;
     if(alive && accessDenied)setData(null);
     throw new Error(accessDenied ? "Access unavailable. Sign in with the owner account." : "Metrics could not refresh. The last successful snapshot may be out of date.");
    }
    const next=await response.json();if(alive){setData(next);setError("");}
   }catch(cause){if(alive && !(cause instanceof DOMException && cause.name==="AbortError"))setError(cause instanceof Error?cause.message:"Metrics unavailable.");}
   finally{if(alive)setLoading(false);}
  }
  void load();const tick=()=>{if(document.visibilityState==="visible")void load();};
  const timer=setInterval(tick,60000);document.addEventListener("visibilitychange",tick);
  return()=>{alive=false;controller?.abort();clearInterval(timer);document.removeEventListener("visibilitychange",tick);};
 },[days,includeTests,refresh]);
 function changeRange(value:number){setData(null);setLoading(true);setDays(value);}
 async function exclude(userId:string,excluded:boolean){
  setBusy(userId);
  try{const r=await fetch("/api/admin/exclusions",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({userId,excluded})});if(!r.ok)throw new Error();setRefresh(n=>n+1);}
  catch{setError("Could not update test-account filter.");}finally{setBusy(null);}
 }
 return <main className={styles.main}>
  <header className={styles.header}><div><p className={styles.eyebrow}>FURVISE · OWNER ONLY</p><h1>App overview</h1><p>A quiet place to see how Furvise is doing.</p></div><Link href="/today">Back to Furvise ↗</Link></header>
  <div className={styles.toolbar}><label>Period <select value={days} onChange={e=>changeRange(Number(e.target.value))}><option value={1}>Last 24 hours</option><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option></select></label><label><input type="checkbox" checked={includeTests} onChange={e=>{setData(null);setLoading(true);setIncludeTests(e.target.checked);}}/> Include owner & marked test accounts</label><button onClick={()=>setRefresh(n=>n+1)}>Refresh</button><small>Refreshes every minute while visible · Timestamps use your local time</small></div>
  {error && <p role="alert" className={styles.alert}>{error}</p>}
  {!data && <p role="status">{loading?"Loading your dashboard…":"No snapshot available. Use Refresh to try again."}</p>}
  {data && <>
   <p className={styles.caption}>Updated {date(data.updatedAt)}. Activity, costs and operational errors tracked from {date(data.trackingStartedAt)}. Timezone: {Intl.DateTimeFormat().resolvedOptions().timeZone}.</p>
   <section className={styles.cards} aria-label="Key metrics">{[
    ["Accounts",data.overview.users,"Current total"],["New signups",data.overview.signups,"Selected period"],["Free accounts",data.overview.free,"Current billing plan"],["Active subscribers",data.overview.subscribers,"Active, unexpired Plus"],["Active users",data.overview.active,"Visible app activity, UTC days"],["Returning users",data.overview.returning,"Seen on 2+ UTC days"],
   ].map(([label,value,note])=><article className={styles.card} key={label}><span>{label}</span><strong>{value}</strong><small>{note}</small></article>)}</section>
   <div className={styles.columns}>
    <section className={styles.panel}><h2>Subscriptions</h2><dl><div><dt>Canceling at period end</dt><dd>{data.overview.canceling}</dd></div><div><dt>Past due / unpaid</dt><dd>{data.overview.paymentTrouble}</dd></div><div><dt>Unconfirmed accounts</dt><dd>{data.overview.unconfirmed}</dd></div></dl><p className={styles.caption}>Current billing state, not a payment-event count. Promotional access may differ from billing plans.</p></section>
    <section className={styles.panel}><h2>AI provider costs</h2><strong className={styles.money}>${Number(data.costs.actual).toFixed(4)}</strong><p>{data.costs.calls} tracked calls · {data.costs.unreconciled} awaiting final usage</p><p className={styles.caption}>All traffic, including tests. Unreconciled reservations: ${Number(data.costs.pendingReserved).toFixed(4)}. Provider usage estimates, not your invoice. Historical spend is unavailable here.</p></section>
   </div>
   <section className={styles.panel}><h2>Feature usage</h2><p className={styles.caption}>AI credit ledger in the selected period. A released credit is not necessarily an error; a completed credit does not prove the answer was good.</p><div className={styles.scroll}><table><thead><tr><th>Feature</th><th>Requests</th><th>Completed</th><th>Released</th><th>Reserved</th></tr></thead><tbody>{data.features.map(f=><tr key={f.feature}><td>{f.feature.replaceAll("_"," ")}</td><td>{f.total}</td><td>{f.completed}</td><td>{f.released}</td><td>{f.pending}</td></tr>)}</tbody></table></div>{!data.features.length && <p>No recorded AI requests for this filter.</p>}<h3>Ask outcomes · all traffic in the selected period</h3><div className={styles.pills}>{data.askOutcomes.map(a=><span key={a.outcome}>{a.outcome.replaceAll("_"," ")}: <b>{a.count}</b></span>)}</div>{!data.askOutcomes.length && <p className={styles.caption}>No tracked Ask outcomes yet. This does not mean historical answers all succeeded.</p>}</section>
   <section className={styles.panel}><h2>Errors by area</h2><p className={styles.caption}>All traffic, including test accounts. Instrumented server events and browser reports; not a complete record of every failure. Browser reports are unverified. Showing the latest 100 events in the selected period.</p><div className={styles.pills}>{data.errorGroups.map(g=><span key={g.feature}>{g.feature}: <b>{g.count}</b></span>)}</div>{!data.errors.length?<p>No captured errors in this period.</p>:<div className={styles.scroll}><table><thead><tr><th>When (local)</th><th>Area / route</th><th>Error</th><th>Reference</th></tr></thead><tbody>{data.errors.map((e,i)=><tr key={`${e.request_id}-${e.created_at}-${i}`}><td>{date(e.created_at)}</td><td>{e.feature}<small>{e.route}</small></td><td>{e.error_code || e.event_type}<small>{e.severity} · {e.event_type}</small></td><td><code>{e.request_id || "Browser report"}</code></td></tr>)}</tbody></table></div>}</section>
   <section className={styles.panel}><h2>People</h2><p className={styles.caption}>Newest {data.users.length} of {data.overview.users} accounts matching the filter. Account age is time since signup, not time continuously on Free. Historical plan duration is not recorded. Enable test accounts above to restore an excluded account.</p><div className={styles.scroll}><table><thead><tr><th>Account</th><th>Plan / status</th><th>Account age</th><th>Last activity (local)</th><th>Test filter</th></tr></thead><tbody>{data.users.map(u=><tr key={u.id}><td>{u.email || "No email"}<small>Joined {date(u.created_at)}</small></td><td>{u.plan}<small>{u.subscription_status}{u.cancel_at_period_end?" · canceling":""}</small></td><td>{u.account_days} days</td><td>{date(u.last_seen)}</td><td><button disabled={busy===u.id} onClick={()=>void exclude(u.id,!u.excluded)}>{u.excluded?"Restore":"Mark test"}</button></td></tr>)}</tbody></table></div></section>
   <details className={styles.panel}><summary>Daily signups and activity</summary><p className={styles.caption}>UTC calendar days; activity before tracking began is unavailable.</p><div className={styles.scroll}><table><thead><tr><th>Day</th><th>Signups</th><th>Active users</th></tr></thead><tbody>{data.daily.map(d=><tr key={d.day}><td>{d.day}</td><td>{d.signups}</td><td>{d.day<data.trackingStartedAt.slice(0,10)?"Not recorded":d.active}</td></tr>)}</tbody></table></div></details>
  </>}
 </main>;
}
