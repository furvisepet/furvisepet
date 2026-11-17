// Fake provider encoding through the current production transport, with no hosted IO.
export function providerFixturePlan(prepared) {
  const transport = prepared.transport;
  return {
    schema: transport.schema,
    instructions: transport.instructions,
    encode: value => transport.encode(value, () => {}),
    decode: value => transport.decode(value, () => {}),
  };
}
