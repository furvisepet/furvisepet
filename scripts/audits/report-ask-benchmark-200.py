"""Build review artifacts from frozen questions, real-call outputs and manual scores."""
from pathlib import Path
import csv, json, html, statistics, hashlib
from collections import Counter
root = Path(__file__).resolve().parents[2]
p = root / 'docs/ask-benchmark-200'
questions = json.loads((p/'questions.json').read_text(encoding='utf-8'))
run = json.loads((p/'results.json').read_text(encoding='utf-8'))
budget = json.loads((p/'budget.json').read_text(encoding='utf-8'))
reviews = json.loads((p/'reviews.json').read_text(encoding='utf-8'))
turns = run['turns']
assert len({t['id'] for t in turns}) == len(turns)
assert set(reviews) == {str(t['id']) for t in turns}, 'Every attempted case needs review'
assert hashlib.sha256((p/'questions.json').read_bytes()).hexdigest() == run['datasetSha256']
order = ['good','partial','fail','error','harness_blocked']
counts = Counter(reviews[str(t['id'])][0] for t in turns)
statuses = Counter(t['status'] for t in turns)
categories = list(dict.fromkeys(q['category'] for q in questions))
bycat = {c:Counter(reviews[str(t['id'])][0] for t in turns if t['category']==c) for c in categories}
def percentile(values, pct):
    a=sorted(values); i=(len(a)-1)*pct; lo=int(i)
    return a[lo]+(a[min(lo+1,len(a)-1)]-a[lo])*(i-lo) if a else None
latencies=[t['elapsedMs']/1000 for t in turns if t['status']=='answered']
calls=budget['calls']; unknown=[c for c in calls if c.get('measuredUsd') is None]
new_cost=sum(c.get('measuredUsd',c.get('reservedUsd',0)) for c in calls)
metrics={'attempted':len(turns),'planned':len(questions),'scores':dict(counts),'statuses':dict(statuses),'categories':{c:dict(v) for c,v in bycat.items()},'calls':len(calls),'callPhases':dict(Counter(c['phase'] for c in calls)),'inputTokens':sum(c.get('inputTokens',0) for c in calls),'outputTokens':sum(c.get('outputTokens',0) for c in calls),'estimatedNewUsd':new_cost,'priorUsd':budget['priorMeasuredUsd'],'accountedTotalUsd':budget['accountedUsd'],'unknownUsageCalls':len(unknown),'answeredLatencySeconds':{'p50':percentile(latencies,.5),'p95':percentile(latencies,.95),'max':max(latencies) if latencies else None},'errorCodes':dict(Counter(t.get('code','unknown') for t in turns if t['status']=='error'))}
metrics['settledNewUsd']=sum(c.get('measuredUsd') or 0 for c in calls)
metrics['unresolvedReservedUsd']=sum(c['reservedUsd'] for c in unknown)
(p/'metrics.json').write_text(json.dumps(metrics,indent=2)+'\n',encoding='utf-8')
qmap={q['id']:q for q in questions}
rows=[]
for t in sorted(turns,key=lambda t:t['id']):
    score,reason=reviews[str(t['id'])]
    visible='\n\n'.join(filter(None,[t.get('answer',''),*['\n'.join([s.get('heading',''),*s.get('items',[])]) for s in t.get('sections',[])],t.get('safetyNote')]))
    rows.append({'id':t['id'],'category':t['category'],'question':t['question'],'expected':qmap[t['id']]['expected'],'status':t['status'],'score':score,'reason':reason,'finalAnswer':visible,'errorCode':t.get('code',''),'elapsedSeconds':round(t['elapsedMs']/1000,3),'providerCalls':t.get('providerCalls'),'petId':t.get('petId'),'writeProposals':json.dumps(t.get('writes',{}),ensure_ascii=False)})
with (p/'all-questions.csv').open('w',encoding='utf-8-sig',newline='') as f:
    writer=csv.DictWriter(f,fieldnames=list(rows[0])); writer.writeheader(); writer.writerows(rows)
(p/'reviewed-results.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
lines=['# Furvise Ask: 200-question baseline','',f"Application baseline: `{run['baseline']}`. Real model: `{run['model']}`. Synthetic clock: `{run['clock']}`.",'','## Result','',f"Attempted {len(turns)}/{len(questions)} questions. Good answers: **{counts['good']}/{len(turns)} ({counts['good']/len(turns):.1%})**. Partial answers are not counted as passes.",'','| Rating | Count | Share |','|---|---:|---:|']
lines += [f'| {s} | {counts[s]} | {counts[s]/len(turns):.1%} |' for s in order]
lines += ['',f"Returned an answer: {statuses['answered']}/{len(turns)} ({statuses['answered']/len(turns):.1%}). Completion is not correctness.",'','## By category','', '| Category | Good | Partial | Fail | Error | Harness blocked |','|---|---:|---:|---:|---:|---:|']
lines += ['| '+c+' | '+' | '.join(str(bycat[c][s]) for s in order)+' |' for c in categories]
lines += ['','## Cost and latency','',f"New run: {len(calls)} provider attempts, estimated **USD{new_cost:.6f}**. Prior tests: USD{budget['priorMeasuredUsd']:.6f}. Accounted cumulative spend/reservations: **USD{budget['accountedUsd']:.6f}**, within the USD5 authorization. Unknown-usage attempts: {len(unknown)}.",f"Answered-turn elapsed time: median **{percentile(latencies,.5):.2f}s**, p95 **{percentile(latencies,.95):.2f}s**, max **{max(latencies):.2f}s**. These include callback/provider processing against a synthetic database, not production network, browser or database latency.",'','Prices use returned token usage at [official GPT-5.4 mini rates](https://developers.openai.com/api/docs/models/gpt-5.4-mini), ignoring cached-input discounts. This is an estimate, not an invoice; unrelated external key usage is not observable.','', '## Error categories','']
lines += [f'- `{c}`: {n}' for c,n in metrics['errorCodes'].items()]
lines += ['','## Scope and interpretation','', 'Every completed output, section and safety note was manually reviewed by one assistant against the frozen fixture. This is not blinded or expert clinical review. Questions cover 20 categories, ten each, including a shared ten-turn follow-up conversation. Category weights are designed, not representative of user traffic. One attempt per prompt does not establish repeatability.', '', 'Real interpretation, generation and optional verification models ran through the production callback and serializer. Auth, retrieval database boundaries and persistence were synthetic. This is not an authenticated furvise.com or full HTTP-route test. No production writes occurred. Upstream emergency shortcuts were not exercised. The unchanged application baseline was not repaired during testing.', '', 'The initial harness setup failure made no paid calls and is preserved separately under setup-failure; it is excluded from the scored run. Provisional scoring occurred during collection and was finalized after collection; no expectations or prompts were changed.', '', 'See findings.md for demonstrated mechanisms and limits, all-questions.csv for every answer and score, budget.json for token accounting, and results.json for the production callback outputs. The broad benchmark exposes real callback failures but does not prove all production behaviors or universal question coverage.']
lines += ['', 'Execution note: the original conservative USD4.50 stop paused after199 cases at USD4.390437 accounted. After the process completed, one separate continuation ran only the unattempted case200 under a USD4.75 stop, within the unchanged USD5 authorization. Initial199 ledgers are preserved; no question was retried.', '', 'Verification:2295 default tests pass; typecheck and lint pass (two existing persist-learnings warnings); runner/harness syntax and diff checks pass. Application, SQL and dependencies are unchanged from the baseline. Findings are not repaired by this benchmark.', '', 'Launch assessment: this baseline does not support calling Ask broadly reliable for V1. Priorities are recoverable planning, relevance and correction scope, conversation-chain recovery, and final-answer safety/usefulness. Full-route/live-database validation remains separate.']
(p/'report.md').write_text('\n'.join(lines)+'\n',encoding='utf-8')
esc=lambda x:html.escape(str(x))
page=['<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Furvise Ask benchmark</title><style>body{font:16px/1.6 system-ui;max-width:1000px;margin:40px auto;padding:0 20px;background:#faf8f2;color:#17382d}h1{line-height:1.15}input,select{padding:12px;border:1px solid #aaa;border-radius:8px;margin:5px}article{background:white;border:1px solid #ddd;border-left:5px solid #aaa;border-radius:9px;padding:18px;margin:18px 0}article[data-score=good]{border-left-color:#26865c}article[data-score=partial]{border-left-color:#c58821}article[data-score=fail],article[data-score=error]{border-left-color:#bd4949}pre{white-space:pre-wrap;font:inherit}small{color:#58645d}.controls{position:sticky;top:0;background:#faf8f2;padding:10px 0}summary{cursor:pointer;font-weight:600}</style><h1>Furvise Ask: 200-question benchmark</h1>',f'<p>{len(turns)} attempted · {counts["good"]} good · {counts["partial"]} partial · {counts["fail"]} failed answers · {counts["error"]} errors</p>', '<p>Real model, synthetic database, production callback. One attempt per prompt. Manual scores; not a full production-site or clinical validation.</p>', '<div class="controls"><input id="search" aria-label="Search" placeholder="Search questions and answers"><select id="score" aria-label="Score"><option value="">All scores</option>'+''.join(f'<option>{s}</option>' for s in order)+'</select><select id="category" aria-label="Category"><option value="">All categories</option>'+''.join(f'<option>{c}</option>' for c in categories)+'</select><span id="count"></span></div>']
for r in rows:
    page.append(f'<article data-score="{esc(r["score"])}" data-category="{esc(r["category"])}"><small>#{r["id"]} · {esc(r["category"])} · {esc(r["score"])} · {r["elapsedSeconds"]}s</small><h2>{esc(r["question"])}</h2><p>{esc(r["reason"])}</p><details><summary>Final answer and expectation</summary><pre>{esc(r["finalAnswer"] or r["errorCode"])}</pre><small>Expectation: {esc(r["expected"])}</small></details></article>')
page.append('<script>const search=document.getElementById("search"),score=document.getElementById("score"),category=document.getElementById("category");function filter(){let n=0;document.querySelectorAll("article").forEach(a=>{a.hidden=!!((score.value&&a.dataset.score!==score.value)||(category.value&&a.dataset.category!==category.value)||!a.textContent.toLowerCase().includes(search.value.toLowerCase()));if(!a.hidden)n++});document.getElementById("count").textContent=n+" cases"} [search,score,category].forEach(x=>x.addEventListener("input",filter));filter();</script></html>')
(p/'benchmark.html').write_text('\n'.join(page)+'\n',encoding='utf-8')
print(json.dumps(metrics,indent=2))
