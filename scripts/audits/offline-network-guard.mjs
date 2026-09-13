// Preserve local mock HTTP servers; forbid external fetch in every test child.
const nativeFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('OFFLINE_TEST_NETWORK_FORBIDDEN');
  return nativeFetch(input, init);
};
