# Furvise Plus sandbox E2E launch gate

This gate proves the real revenue path without touching live Stripe or the production Furvise database.

## Safety boundary

Use all three of these at the same time:

1. Stripe **sandbox/test mode** credentials only.
2. A disposable **local Supabase** stack only.
3. The Furvise app running on `http://localhost:3000` or `http://127.0.0.1:3000`.

Never point this gate at the production Supabase project or use an `sk_live_` Stripe key. `npm run billing:sandbox:verify` fails closed if either boundary is violated.

## One-time sandbox setup

The Stripe sandbox must contain one active `Furvise Plus` recurring monthly Price with both currency options:

- CAD 5.49/month
- USD 5.49/month

The sandbox Price ID is configured only through `STRIPE_PLUS_PRICE_ID`. Do not hard-code Stripe secrets in source control.

Enable the Stripe Customer Portal in sandbox mode before testing `/api/billing/portal`. The portal should allow the customer to update payment details and cancel the subscription. Furvise remains the entitlement authority; the portal only changes Stripe state.

## Local environment

Create `.env.billing-sandbox.local`. It is ignored by Git.

Populate it with the normal local Furvise development values plus these billing values:

```text
STRIPE_SECRET_KEY=<sandbox sk_test key>
STRIPE_WEBHOOK_SECRET=<whsec value emitted by the local Stripe listener>
STRIPE_PLUS_PRICE_ID=price_1U4VhkJwUHmDmUYQ2MAjPqZw
FURVISE_BILLING_DISPLAY_MARKET=US

NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<local publishable/anon key>
SUPABASE_SECRET_KEY=<local service-role/secret key>

FURVISE_ALLOWED_DEVELOPMENT_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
FURVISE_CAPTCHA_DEV_BYPASS=true
FURVISE_AI_ENABLED=false
```

Do not paste Stripe secret keys into chat, tickets, commits, screenshots, or test logs.

## Start the isolated stack

From a clean checkout of the exact target commit:

```text
npx supabase start
npx supabase db reset
```

Use `npx supabase status` to obtain the local Supabase URL and local keys for `.env.billing-sandbox.local`.

Start a Stripe sandbox listener in a second terminal and forward only the Furvise billing events:

```text
stripe listen --events checkout.session.completed,customer.subscription.created,customer.subscription.updated,customer.subscription.deleted --forward-to http://localhost:3000/api/billing/webhook
```

Copy the listener's `whsec_...` signing secret into `.env.billing-sandbox.local`, then run:

```text
npm run billing:sandbox:verify
npm run billing:sandbox:dev
```

`billing:sandbox:dev` deliberately loads `.env.billing-sandbox.local` inside a wrapper process before launching Next. Do not invoke Next as `node --env-file=... node_modules/next/dist/bin/next ...`: Next spawns child Node processes and that invocation can propagate `--env-file` through `NODE_OPTIONS`, where Node rejects it.

Do not continue unless `billing:sandbox:verify` prints `PASS`.

## Canonical successful-payment flow

Use a fresh local Furvise account and one pet.

1. Confirm Membership shows Free and 15 Ask/month.
2. Open Membership and start Upgrade.
3. Confirm the returned Stripe Checkout Session is test mode and shows exactly USD 5.49 when `FURVISE_BILLING_DISPLAY_MARKET=US`.
4. Complete Checkout with Stripe's standard successful test card `4242 4242 4242 4242`, any future expiry, and any CVC.
5. Wait for both signed events to reach the local webhook route. Checkout completion verifies association only; `customer.subscription.*` owns lifecycle projection.
6. Reload Membership and then sign out/sign back in.
7. Confirm canonical Furvise state remains Plus after the new session:
   - 55 Ask/month
   - up to 10 pets
   - Vet Brief available
8. Starting Upgrade again must not create a second nonterminal subscription.
9. Repeating the same Checkout request/idempotency key must reuse/reconcile the durable single-flight attempt rather than create a duplicate financial attempt.

Repeat the clean-success flow with a fresh local database/user and `FURVISE_BILLING_DISPLAY_MARKET=CA`; Checkout must show CAD 5.49.

## Customer Portal and cancellation

1. Open Manage Billing from Membership.
2. Confirm Stripe Customer Portal opens in sandbox mode and returns to `/membership`.
3. Request cancellation at period end.
4. After `customer.subscription.updated`, Furvise must remain Plus while Stripe status is `active` and `cancel_at_period_end=true`.
5. Terminal `customer.subscription.deleted` must downgrade Furvise to Free:
   - 15 Ask/month
   - one-pet creation limit
   - Vet Brief unavailable
6. Existing pet/history data must remain intact. Downgrade changes capability, not ownership/history.

## Payment failure and recovery

Use Stripe sandbox/test helpers or a test clock so the subscription reaches a real failed renewal. Do not fabricate browser entitlement state.

Expected projection:

1. `active` -> Plus.
2. First real `past_due` -> raw Stripe projection is Free, but effective Furvise access stays Plus for the bounded seven-day recovery grace.
3. During grace -> 55 Ask, 10-pet limit, Vet Brief available.
4. Repeated `past_due` -> original `past_due_since` is preserved; the grace clock cannot restart.
5. Successful payment recovery -> Stripe returns to `active`, Furvise returns to clean Plus, `past_due_since` clears.
6. `unpaid` or terminal cancellation -> effective Free immediately.
7. `incomplete` -> effective Free and the Membership action manages the existing billing relationship instead of opening a second Checkout.

## Ordering and replay

Replay a previously delivered subscription event and deliver an older event after a newer one.

Required outcomes:

- exact `stripe_event_id` replay -> `replayed`
- event older than `last_stripe_event_created_at` -> `ignored_stale`
- no stale event may alter entitlement, recovery timing, currency, or cancellation state
- Checkout completion alone must never grant Plus

## Final receipt

Record only non-secret evidence:

- exact Git SHA
- Stripe sandbox account name
- sandbox Price ID
- Checkout Session ID(s)
- subscription ID(s)
- event IDs and webhook outcomes
- USD/CAD amounts
- entitlement results before/after refresh and relogin
- cancellation result
- payment-failure/recovery result
- test counts, typecheck, lint, and `git diff --check`

Stop the local app, Stripe listener, and Supabase stack when complete:

```text
npx supabase stop
```

A passing receipt closes the Plus/paywall E2E launch gate. Live Stripe is not part of this test.
