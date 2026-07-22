import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateAskUsageLimit,
  evaluateShopSearchUsageLimit,
  evaluatePetLimit,
  getPaidGateMessage,
  getPlanCapabilities,
  getUserPlan,
  isEarlyAccessFreeUnlockEnabled,
} from "../app/lib/billing/plan-limits.ts";
import {
  AskUsageReadError,
  getAskUsageMonthKey,
  getAskUsageStatus,
  incrementAskUsage,
  readAskUsageCount,
} from "../app/lib/billing/ask-usage.ts";
import {
  getShopSearchUsageMonthKey,
  getShopSearchUsageStatus,
  incrementShopSearchUsage,
  readShopSearchUsageCount,
} from "../app/lib/billing/shop-usage.ts";

function createUsageSupabase(rows = []) {
  const store = rows.map((row) => ({ ...row }));
  return {
    store,
    from(table) {
      assert.equal(table, "ask_furvise_usage");
      return new Query(store);
    },
  };
}

function createFailingUsageSupabase(error) {
  return {
    from(table) {
      assert.equal(table, "ask_furvise_usage");
      return new FailingQuery(error);
    },
  };
}

function createShopUsageSupabase(rows = []) {
  const store = rows.map((row) => ({ ...row }));
  return {
    store,
    from(table) {
      assert.equal(table, "shop_search_usage");
      return new Query(store);
    },
  };
}

class Query {
  constructor(store) {
    this.store = store;
    this.filters = [];
    this.payload = null;
  }

  select() {
    return this;
  }

  eq(field, value) {
    this.filters.push({ field, value });
    return this;
  }

  upsert(payload) {
    this.payload = payload;
    const existing = this.store.find(
      (row) => row.user_id === payload.user_id && row.month_key === payload.month_key,
    );
    if (existing) Object.assign(existing, payload);
    else this.store.push({ id: `usage-${this.store.length + 1}`, created_at: "2026-07-01T00:00:00Z", ...payload });
    return this;
  }

  maybeSingle() {
    const row = this.store.find((item) =>
      this.filters.every((filter) => item[filter.field] === filter.value),
    );
    return { data: row ? { ...row } : null, error: null };
  }

  single() {
    return { data: { ...this.store[this.store.length - 1] }, error: null };
  }
}

class FailingQuery {
  constructor(error) {
    this.error = error;
  }

  select() {
    return this;
  }

  eq() {
    return this;
  }

  maybeSingle() {
    return { data: null, error: this.error };
  }
}

test("plan capabilities define generous free and future plus limits", () => {
  const free = getPlanCapabilities("free");
  const plus = getPlanCapabilities("plus");
  const unknown = getPlanCapabilities("enterprise");

  assert.equal(free.maxPets, 1);
  assert.equal(free.careLog, "unlimited");
  assert.equal(free.dashboard, true);
  assert.equal(free.curatedProducts, true);
  assert.equal(free.askFurviseMonthlyLimit, 20);
  assert.equal(free.shopSearchMonthlyLimit, 20);
  assert.equal(free.longHistoryPatternDetection, false);
  assert.equal(free.vetPrepExports, false);
  assert.equal(free.liveProductResearch, false);
  assert.equal(plus.askFurviseMonthlyLimit, 200);
  assert.equal(plus.shopSearchMonthlyLimit, 200);
  assert.equal(plus.longHistoryPatternDetection, true);
  assert.equal(plus.vetPrepExports, true);
  assert.equal(plus.liveProductResearch, true);
  assert.equal(unknown.id, "free");
});

test("early access unlock affects hard gates only", () => {
  assert.equal(isEarlyAccessFreeUnlockEnabled({ NEXT_PUBLIC_EARLY_ACCESS_FREE_UNLOCKS: "true" }), true);
  assert.equal(isEarlyAccessFreeUnlockEnabled({ EARLY_ACCESS_FREE_UNLOCKS: "true" }), true);
  assert.equal(isEarlyAccessFreeUnlockEnabled({}), false);

  const freeCore = getPlanCapabilities("free");
  assert.equal(freeCore.careLog, "unlimited");
  assert.equal(freeCore.dashboard, true);
  assert.equal(freeCore.curatedProducts, true);
});

test("pet limit gates new pets but never edits existing pets", () => {
  assert.equal(evaluatePetLimit({ isEditingExistingPet: false, petCount: 0, planId: "free", earlyAccessUnlocked: false }).allowed, true);
  const blocked = evaluatePetLimit({ isEditingExistingPet: false, petCount: 1, planId: "free", earlyAccessUnlocked: false });
  assert.equal(blocked.hardBlocked, true);
  assert.equal(blocked.message, "Your free plan includes 1 pet. Upgrade will unlock additional pets.");
  assert.doesNotMatch(blocked.message || "", new RegExp(`2\\s+${"pets"}|two\\s+${"pets"}|more\\s+${"pets"}`, "i"));
  assert.equal(evaluatePetLimit({ isEditingExistingPet: true, petCount: 5, planId: "free", earlyAccessUnlocked: false }).allowed, true);

  const early = evaluatePetLimit({ isEditingExistingPet: false, petCount: 1, planId: "free", earlyAccessUnlocked: true });
  assert.equal(early.allowed, true);
  assert.match(early.softNotice || "", /Early access/);
  assert.match(early.softNotice || "", /1 pet/);
});

test("Ask Furvise usage gate allows 20 free messages and early access bypass", () => {
  assert.equal(evaluateAskUsageLimit({ monthlyCount: 19, planId: "free", earlyAccessUnlocked: false }).allowed, true);
  const blocked = evaluateAskUsageLimit({ monthlyCount: 20, planId: "free", earlyAccessUnlocked: false });
  assert.equal(blocked.hardBlocked, true);
  assert.equal(blocked.remaining, 0);
  const early = evaluateAskUsageLimit({ monthlyCount: 30, planId: "free", earlyAccessUnlocked: true });
  assert.equal(early.allowed, true);
  assert.match(early.softNotice || "", /extra Ask Furvise messages/);
});

test("Shop search usage gate allows 20 free AI interpretations and early access bypass", () => {
  assert.equal(evaluateShopSearchUsageLimit({ monthlyCount: 19, planId: "free", earlyAccessUnlocked: false }).allowed, true);
  const blocked = evaluateShopSearchUsageLimit({ monthlyCount: 20, planId: "free", earlyAccessUnlocked: false });
  assert.equal(blocked.hardBlocked, true);
  assert.equal(blocked.remaining, 0);
  assert.match(blocked.message || "", /included Shop searches/);
  const early = evaluateShopSearchUsageLimit({ monthlyCount: 30, planId: "free", earlyAccessUnlocked: true });
  assert.equal(early.allowed, true);
  assert.match(early.softNotice || "", /extra Shop searches/);
});

test("Ask usage reads current month, increments successful answers, and resets by month key", async () => {
  const supabase = createUsageSupabase([
    { user_id: "user-1", month_key: "2026-06", count: 20 },
    { user_id: "user-1", month_key: "2026-07", count: 19 },
  ]);

  assert.equal(getAskUsageMonthKey(new Date("2026-07-13T12:00:00Z")), "2026-07");
  const status = await getAskUsageStatus({
    earlyAccessUnlocked: false,
    monthlyLimit: getPlanCapabilities("free").askFurviseMonthlyLimit,
    monthKey: "2026-07",
    planId: "free",
    supabase,
    userId: "user-1",
  });
  assert.equal(status.count, 19);
  assert.equal(status.remaining, 1);

  await incrementAskUsage({ monthKey: "2026-07", previousCount: status.count, supabase, userId: "user-1" });
  const after = await getAskUsageStatus({
    earlyAccessUnlocked: false,
    monthlyLimit: getPlanCapabilities("free").askFurviseMonthlyLimit,
    monthKey: "2026-07",
    planId: "free",
    supabase,
    userId: "user-1",
  });
  assert.equal(after.count, 20);
  assert.equal(after.allowed, false);

  const reset = await getAskUsageStatus({
    earlyAccessUnlocked: false,
    monthlyLimit: getPlanCapabilities("free").askFurviseMonthlyLimit,
    monthKey: "2026-08",
    planId: "free",
    supabase,
    userId: "user-1",
  });
  assert.equal(reset.count, 0);
  assert.equal(reset.remaining, 20);
});

test("Ask usage treats a missing monthly row as zero for new users", async () => {
  const supabase = createUsageSupabase([]);

  assert.equal(await readAskUsageCount({ monthKey: "2026-07", supabase, userId: "new-user" }), 0);

  const status = await getAskUsageStatus({
    earlyAccessUnlocked: false,
    monthlyLimit: getPlanCapabilities("free").askFurviseMonthlyLimit,
    monthKey: "2026-07",
    planId: "free",
    supabase,
    userId: "new-user",
  });

  assert.equal(status.count, 0);
  assert.equal(status.allowed, true);
  assert.equal(supabase.store.length, 0);
});

test("Shop search usage increments only fresh AI interpretations and resets by month key", async () => {
  const supabase = createShopUsageSupabase([
    { user_id: "user-1", month_key: "2026-06", count: 20 },
    { user_id: "user-1", month_key: "2026-07", count: 2 },
  ]);

  assert.equal(getShopSearchUsageMonthKey(new Date("2026-07-22T12:00:00Z")), "2026-07");
  const status = await getShopSearchUsageStatus({
    earlyAccessUnlocked: false,
    monthlyLimit: getPlanCapabilities("free").shopSearchMonthlyLimit,
    monthKey: "2026-07",
    planId: "free",
    supabase,
    userId: "user-1",
  });
  assert.equal(status.count, 2);
  assert.equal(status.remaining, 18);

  await incrementShopSearchUsage({ monthKey: "2026-07", previousCount: status.count, supabase, userId: "user-1" });
  assert.equal(await readShopSearchUsageCount({ monthKey: "2026-07", supabase, userId: "user-1" }), 3);

  const reset = await getShopSearchUsageStatus({
    earlyAccessUnlocked: false,
    monthlyLimit: getPlanCapabilities("free").shopSearchMonthlyLimit,
    monthKey: "2026-08",
    planId: "free",
    supabase,
    userId: "user-1",
  });
  assert.equal(reset.count, 0);
  assert.equal(reset.remaining, 20);
});

test("Ask usage read errors log Supabase details and early access falls back safely", async () => {
  const supabaseError = {
    code: "42501",
    details: "RLS rejected the query",
    hint: "Check ask_furvise_usage policies",
    message: "permission denied for table ask_furvise_usage",
  };
  const supabase = createFailingUsageSupabase(supabaseError);
  const originalEnv = process.env.NODE_ENV;
  const originalConsoleError = console.error;
  const logged = [];
  process.env.NODE_ENV = "development";
  console.error = (...args) => logged.push(args);

  try {
    await assert.rejects(
      readAskUsageCount({ monthKey: "2026-07", supabase, userId: "user-1" }),
      AskUsageReadError,
    );
    assert.equal(logged[0][0], "[Ask Furvise usage]");
    assert.deepEqual(logged[0][1], {
      action: "readAskUsageCount",
      code: "42501",
      details: "RLS rejected the query",
      hint: "Check ask_furvise_usage policies",
      message: "permission denied for table ask_furvise_usage",
      table: "ask_furvise_usage",
    });

    const earlyStatus = await getAskUsageStatus({
      earlyAccessUnlocked: true,
      monthlyLimit: getPlanCapabilities("free").askFurviseMonthlyLimit,
      monthKey: "2026-07",
      planId: "free",
      supabase,
      userId: "user-1",
    });
    assert.equal(earlyStatus.count, 0);
    assert.equal(earlyStatus.allowed, true);

    await assert.rejects(
      getAskUsageStatus({
        earlyAccessUnlocked: false,
        monthlyLimit: getPlanCapabilities("free").askFurviseMonthlyLimit,
        monthKey: "2026-07",
        planId: "free",
        supabase,
        userId: "user-1",
      }),
      AskUsageReadError,
    );
  } finally {
    console.error = originalConsoleError;
    if (originalEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalEnv;
  }
});

test("Ask usage still hard gates over-limit users when the usage table works", async () => {
  const supabase = createUsageSupabase([{ user_id: "user-1", month_key: "2026-07", count: 20 }]);
  const status = await getAskUsageStatus({
    earlyAccessUnlocked: false,
    monthlyLimit: getPlanCapabilities("free").askFurviseMonthlyLimit,
    monthKey: "2026-07",
    planId: "free",
    supabase,
    userId: "user-1",
  });

  assert.equal(status.allowed, false);
  assert.equal(status.gate.hardBlocked, true);
  assert.equal(status.remaining, 0);
});

test("plan source defaults safely to free and paid gate messages exist", async () => {
  assert.equal(await getUserPlan("user-1"), "free");
  assert.equal(await getUserPlan("user-1", () => "plus"), "plus");
  assert.equal(await getUserPlan("user-1", () => "unknown"), "free");
  assert.match(getPaidGateMessage("longHistoryPatternDetection"), /Furvise Plus/);
  assert.match(getPaidGateMessage("vetPrepExports"), /Furvise Plus/);
  assert.match(getPaidGateMessage("liveProductResearch"), /once it is built/);
});
