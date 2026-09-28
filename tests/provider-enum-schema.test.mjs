import { assert, test, pets, askRequestProviderSchema } from './helpers/calculation-fixture.mjs';
import Ajv from 'ajv';
import { factorProviderEnumSchemas } from '../app/lib/ai/provider-enum-schema.ts';
import { proposedSemanticFrameJsonSchema } from '../app/lib/intelligence/semantic-frame/schema.ts';

function expand(schema) {
  const definitions = schema.$defs || {};
  function visit(value) {
    if (Array.isArray(value)) return value.map(visit);
    if (!value || typeof value !== 'object') return value;
    if (value.$ref?.startsWith('#/$defs/sharedEnum')) return visit(definitions[value.$ref.split('/').at(-1)]);
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, visit(child)]));
  }
  const { $defs, ...root } = schema;
  const result = visit(root);
  const originalDefinitions = Object.fromEntries(Object.entries($defs || {}).filter(([name]) => !name.startsWith('sharedEnum')));
  if (Object.keys(originalDefinitions).length) result.$defs = visit(originalDefinitions);
  return result;
}
function enumCount(value) {
  if (Array.isArray(value)) return value.reduce((n, child) => n + enumCount(child), 0);
  if (!value || typeof value !== 'object') return 0;
  return (Array.isArray(value.enum) ? value.enum.length : 0) +
    Object.entries(value).filter(([key]) => key !== 'enum').reduce((n, [, child]) => n + enumCount(child), 0);
}
for (const currentMessage of [
  'Compare the recorded ribbon lengths for the two subjects.',
  'Use 8.75 liters and 320 milliliters from this message.',
  'Quote the earlier report and separately attribute the subsequent dispute.',
  'The examples "save 46" and "correct label 83" are only prose.',
]) test('full Ask wire factoring preserves all canonical branches: ' + currentMessage, () => {
  const context = { owner: { userId: 'owner' }, pet: pets[0], eligiblePets: pets,
    currentMessage, conversationTurns: [], currentTurn: { id: 'source', role: 'user', text: currentMessage }, timeZone: 'UTC' };
  const original = askRequestProviderSchema(proposedSemanticFrameJsonSchema, context);
  const before = structuredClone(original);
  const wire = factorProviderEnumSchemas(original);
  assert.ok(enumCount(original) > 1000);
  assert.ok(enumCount(wire) <= 1000);
  assert.deepEqual(expand(wire), original);
  assert.deepEqual(original, before);
  assert.deepEqual(factorProviderEnumSchemas(wire), wire);
  new Ajv({ strict: false }).compile(wire);
});

test('constraints, nullable values, unicode and enum order are preserved', () => {
  const a = { type: ['string', 'null'], enum: ['\u00e9', '\u6c34', null], maxLength: 2 };
  const b = { ...a, maxLength: 1 };
  const original = { type: 'object', properties: { a, a2: a, b, b2: b }, additionalProperties: false };
  const wire = factorProviderEnumSchemas(original);
  assert.notEqual(wire.properties.a.$ref, wire.properties.b.$ref);
  assert.deepEqual(expand(wire), original);
  const ajv = new Ajv({ strict: false });
  const first = ajv.compile(original), second = ajv.compile(wire);
  for (const value of [null, '\u00e9', '\u6c34', '', 'other', 12, '\u00e9\u00e9']) {
    const data = { a: value, a2: value, b: value, b2: value };
    assert.equal(second(data), first(data));
  }
});
test('existing definitions and references are preserved without generated-name collision', () => {
  const leaf = { type: 'string', enum: ['left', 'right'] };
  const original = { type: 'object', $defs: { sharedEnum0: { type: 'integer' }, original: leaf },
    properties: { a: leaf, b: leaf, c: { $ref: '#/$defs/sharedEnum0' } } };
  const wire = factorProviderEnumSchemas(original);
  assert.deepEqual(wire.$defs.sharedEnum0, original.$defs.sharedEnum0);
  assert.equal(wire.properties.c.$ref, '#/$defs/sharedEnum0');
  assert.notEqual(wire.properties.a.$ref, '#/$defs/sharedEnum0');
  const ajv = new Ajv({ strict: false }), first = ajv.compile(original), second = ajv.compile(wire);
  for (const c of [1, 'left', null]) assert.equal(second({ a: 'left', b: 'right', c }), first({ a: 'left', b: 'right', c }));
});
test('annotation and enum data are not interpreted as schemas', () => {
  const data = { type: 'string', enum: ['one', 'two'] };
  const original = { type: 'object', examples: [data, data], default: data,
    properties: { a: { enum: [data, data] }, b: { enum: [data, data] } } };
  assert.deepEqual(factorProviderEnumSchemas(original), original);
});
test('a single enum is unchanged; irreducible capacity overflow fails closed', () => {
  const schema = { type: 'string', enum: Array.from({ length: 1000 }, (_, i) => String(i)) };
  assert.deepEqual(factorProviderEnumSchemas(schema), schema);
  assert.throws(() => factorProviderEnumSchemas({ ...schema, enum: [...schema.enum, 'extra'] }), /ASK_PROVIDER_SCHEMA_ENUM_CAPACITY/);
});
