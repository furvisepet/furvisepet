The 262-vector ask-wire-codec.json corpus remains byte-identical (SHA-256 2264ae927ccd4769d81e8dacea639ba1e319f29e186179ee02267a71b8b1da5a).

Its independently generated Python wire bytes describe revision 18f2c066665e5011266193e1fb0cc6d9a9eb689d. The current canonical grammar has additive fields and stricter authority/branch relationships, so historical inputs cannot all be accepted as current requests.

The archived schemas were reconstructed from git archive of that revision's app/lib, importing its askRequestProviderSchema, askRequestSchema, proposedSemanticFrameJsonSchema, factorProviderEnumSchemas and factorProviderCompoundSchemas. Each original context (plus undefined no_context) was compiled without alteration. The current codec and policy reproduce all 262 original wire vectors exactly against these schemas. The deterministic gzip and manifest pin original corpus, schema contents and revision.

Only frozen ABI tests use historical-wire-schema.mjs. Runtime planning, native source grammar tests, Binder, ownership and physical-call tests use the current production contract. The archive grants no source authority. No historical expected wire bytes were regenerated or rewritten.
