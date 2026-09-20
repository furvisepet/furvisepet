-- Ask writes now require a confirmed capability and the existing Heart receipt
-- adapter. Heart does not call this former phrase-authorized entry point.
-- Keep historical migrations immutable; retire only this function, no CASCADE.
drop function if exists public.persist_ask_owner_note(uuid,uuid,uuid,uuid,text,timestamptz,text);
