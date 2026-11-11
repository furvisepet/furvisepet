"""No-provider benchmark registry, frozen split, capture validation and scorecard.

Never grades medical correctness with a model or sends questions. A human reviewer
supplies independent expectations, safety references and evidence-linked ratings.
"""
import argparse
import collections
import csv
import hashlib
import json
from pathlib import Path

COLUMNS = ['ID', 'Category', 'Scenario', 'User question', 'Risk level', 'Answer dependency', 'Provenance']
VERDICTS = {'PASS', 'PARTIAL', 'FAIL', 'UNVERIFIED'}

def digest(value):
    return hashlib.sha256(value.encode('utf-8')).hexdigest()

def ingest(path):
    payload = Path(path).read_bytes()
    with Path(path).open(encoding='utf-8-sig', newline='') as stream:
        reader = csv.DictReader(stream)
        if reader.fieldnames != COLUMNS:
            raise ValueError('Unexpected CSV columns')
        rows = list(reader)
    if not rows or len({r['ID'] for r in rows}) != len(rows):
        raise ValueError('Missing rows or duplicate IDs')
    for row in rows:
        if any(not row[key].strip() for key in COLUMNS):
            raise ValueError('Blank required cell')
        if row['Risk level'] not in {'Routine', 'Clinical', 'Emergency'} or row['Answer dependency'] not in {'General guidance', 'Personal records'}:
            raise ValueError('Unknown risk/dependency')
    return rows, hashlib.sha256(payload).hexdigest()

def split(rows, source_hash, seed='furvise-1111d-v1', holdout_per_category=10):
    groups = collections.defaultdict(list)
    for row in rows:
        groups[row['Category']].append(row)
    held, development, sample = [], [], []
    for category, group in sorted(groups.items()):
        if not 0 < holdout_per_category < len(group):
            raise ValueError('Holdout must leave development questions in every category')
        ordered = sorted(group, key=lambda r: digest(seed + '|split|' + r['ID']))
        held.extend(r['ID'] for r in ordered[:holdout_per_category])
        dev = ordered[holdout_per_category:]
        development.extend(r['ID'] for r in dev)
        # Include personal-record behavior wherever the category contains it.
        candidates = [r for r in dev if r['Answer dependency'] == 'Personal records'] or dev
        sample.append(min(candidates, key=lambda r: digest(seed + '|sample|' + r['ID']))['ID'])
    return {'schema': 'AskBenchmarkSplit.v1', 'sourceSha256': source_hash, 'seed': seed,
            'total': len(rows), 'categories': dict(collections.Counter(r['Category'] for r in rows)),
            'risk': dict(collections.Counter(r['Risk level'] for r in rows)),
            'dependency': dict(collections.Counter(r['Answer dependency'] for r in rows)),
            'holdoutIds': sorted(held), 'developmentIds': sorted(development), 'firstSampleIds': sample,
            'questionHashes': {r['ID']: digest(r['User question']) for r in rows}}

def score(rows, registry, results):
    by_id = {r['ID']: r for r in rows}
    if len({x['id'] for x in results}) != len(results):
        raise ValueError('Duplicate question IDs: retain attempts separately, never inflate denominator')
    groups = {c: {'total': n, 'tested': 0, 'PASS': 0, 'PARTIAL': 0, 'FAIL': 0, 'UNVERIFIED': n}
              for c, n in registry['categories'].items()}
    calls = cost = 0
    operations = set()
    submitted_ids, evaluated_ids = [], []
    for result in results:
        row = by_id[result['id']]
        verdict = result['verdict']
        if verdict not in VERDICTS or result['questionSha256'] != digest(row['User question']):
            raise ValueError('Question or verdict mismatch')
        if verdict != 'UNVERIFIED' or result.get('signedInRealApp'):
            for field in ['expectedBehavior', 'evidence', 'candidateSha', 'requestId', 'operationId', 'actualResponse']:
                if not result.get(field):
                    raise ValueError('Missing acceptance evidence: ' + field)
            if not result.get('signedInRealApp') or result.get('physicalCalls') != len(result.get('costReceipts', [])):
                raise ValueError('Not a reconciled real-app observation')
            if result['operationId'] in operations:
                raise ValueError('Provider operation reused across question IDs')
            operations.add(result['operationId'])
            receipts = result['costReceipts']
            if not receipts or any(x.get('actualMicrodollars') is None or x['actualMicrodollars'] < 0 for x in receipts):
                raise ValueError('Unreconciled costs')
            if len({x['callNumber'] for x in receipts}) != len(receipts):
                raise ValueError('Duplicate cost receipt')
            risk_order = {'Routine': 0, 'Clinical': 1, 'Emergency': 2}
            review_risk = result.get('reviewRisk', row['Risk level'])
            if review_risk not in risk_order or risk_order[review_risk] < risk_order[row['Risk level']]:
                raise ValueError('Review cannot downgrade dataset risk')
            if verdict != 'UNVERIFIED' and review_risk in {'Clinical', 'Emergency'}:
                if not result.get('safetyReferences') or result.get('safetyVerdict') not in {'PASS', 'PARTIAL', 'FAIL'}:
                    raise ValueError('Independent safety review required')
                if result['safetyVerdict'] == 'FAIL' and verdict != 'FAIL':
                    raise ValueError('Unsafe output cannot pass')
            if verdict == 'PASS' and any(result.get(k) != 'PASS' for k in ['completeness', 'grounding', 'safetyVerdict']):
                raise ValueError('PASS requires complete, grounded and safe output')
            bucket = groups[row['Category']]
            bucket['tested'] += 1
            submitted_ids.append(result['id'])
            if verdict != 'UNVERIFIED':
                evaluated_ids.append(result['id'])
                bucket['UNVERIFIED'] -= 1
                bucket[verdict] += 1
            calls += result['physicalCalls']
            cost += sum(x['actualMicrodollars'] for x in receipts)
    return {'sourceSha256': registry['sourceSha256'], 'datasetTotal': len(rows),
            'testedIds': submitted_ids, 'evaluatedIds': evaluated_ids,
            'tested': sum(g['tested'] for g in groups.values()), 'untested': len(rows) - len(submitted_ids), 'evaluated': len(evaluated_ids),
            'categories': groups, 'physicalCalls': calls, 'actualMicrodollars': cost,
            'warning': 'Observed sample only; no extrapolation to untested questions or medical certification.'}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['prepare', 'sample', 'score'])
    parser.add_argument('csv')
    parser.add_argument('registry')
    parser.add_argument('--results')
    parser.add_argument('--output')
    args = parser.parse_args()
    rows, sha = ingest(args.csv)
    if args.command == 'prepare':
        data = split(rows, sha)
        if Path(args.registry).exists():
            raise ValueError('Frozen registry exists; use it rather than reshuffle')
        Path(args.registry).write_text(json.dumps(data, indent=2), encoding='utf-8')
        data = {k: v for k, v in data.items() if k not in {'questionHashes', 'developmentIds', 'holdoutIds'}}
    else:
        registry = json.loads(Path(args.registry).read_text(encoding='utf-8'))
        if registry['sourceSha256'] != sha:
            raise ValueError('CSV changed since split')
        if args.command == 'sample':
            data = [r for r in rows if r['ID'] in registry['firstSampleIds']]
        else:
            data = score(rows, registry, json.loads(Path(args.results).read_text(encoding='utf-8')))
    rendered = json.dumps(data, ensure_ascii=False, indent=2)
    if args.output:
        Path(args.output).write_text(rendered, encoding='utf-8')
    else:
        print(rendered)

if __name__ == '__main__':
    main()
