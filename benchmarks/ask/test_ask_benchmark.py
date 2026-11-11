import unittest
from ask_benchmark import digest, split, score

class BenchmarkContracts(unittest.TestCase):
    def setUp(self):
        self.rows = [{'ID': str(i), 'Category': 'A' if i < 6 else 'B',
                      'Risk level': 'Clinical', 'Answer dependency': 'General guidance',
                      'User question': 'Question ' + str(i)} for i in range(12)]
        self.registry = split(self.rows, 'fixture-sha', holdout_per_category=2)

    def record(self):
        return {'id': '0', 'questionSha256': digest('Question 0'), 'verdict': 'PASS',
                'expectedBehavior': 'Independent behavioral rubric', 'evidence': 'Observed output',
                'candidateSha': 'immutable-sha', 'requestId': 'req', 'operationId': 'op',
                'actualResponse': 'Captured prose', 'signedInRealApp': True, 'physicalCalls': 2,
                'costReceipts': [{'callNumber': 1, 'actualMicrodollars': 3}, {'callNumber': 2, 'actualMicrodollars': 4}],
                'safetyReferences': ['independent guideline'], 'safetyVerdict': 'PASS',
                'completeness': 'PASS', 'grounding': 'PASS'}

    def test_frozen_disjoint_balanced_split(self):
        self.assertEqual(self.registry, split(self.rows, 'fixture-sha', holdout_per_category=2))
        self.assertFalse(set(self.registry['holdoutIds']) & set(self.registry['developmentIds']))
        self.assertFalse(set(self.registry['holdoutIds']) & set(self.registry['firstSampleIds']))
        self.assertEqual(len(self.registry['firstSampleIds']), 2)

    def test_no_extrapolation_and_reconciled_denominator(self):
        result = score(self.rows, self.registry, [self.record()])
        self.assertEqual((result['tested'], result['untested'], result['evaluated']), (1, 11, 1))
        self.assertEqual(result['actualMicrodollars'], 7)
        self.assertEqual(result['categories']['B']['UNVERIFIED'], 6)

    def test_missing_cost_or_independent_safety_cannot_pass(self):
        for key in ['safetyReferences', 'costReceipts', 'signedInRealApp']:
            record = self.record()
            record.pop(key)
            with self.assertRaises(ValueError):
                score(self.rows, self.registry, [record])

    def test_exposed_question_cannot_claim_holdout_acceptance(self):
        record = self.record()
        record['sampleType'] = 'holdout'
        self.registry['holdoutIds'] = ['0']
        with self.assertRaises(ValueError):
            score(self.rows, self.registry, [record], exposed_ids=['0'])

    def test_ungraded_paid_observation_still_counts_cost_and_execution(self):
        record = self.record()
        record['verdict'] = 'UNVERIFIED'
        result = score(self.rows, self.registry, [record])
        self.assertEqual(result['tested'], 1)
        self.assertEqual(result['evaluated'], 0)
        self.assertEqual(result['categories']['A']['UNVERIFIED'], 6)
        self.assertEqual(result['actualMicrodollars'], 7)

if __name__ == '__main__':
    unittest.main()
