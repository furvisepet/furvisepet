import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDashboardCareSectionState,
  getSevereSymptomCautionMessage,
  formatCareNotePreview,
  resolveCareLogInitialPetId,
  sortCareEntriesNewestFirst,
  validateCareEntryDraft,
} from "../app/lib/care-log.mjs";
import {
  buildDashboardCareEntries,
  buildNextSteps,
  buildProfileStatus,
  buildRecentActivity,
  getPetCareLogHref,
} from "../app/lib/dashboard.ts";
import { formatPetDisplayName } from "../app/lib/petwise.ts";
import {
  createCareEntry,
  createCareEntryUnlessDuplicate,
  deleteCareEntry,
  listCareEntriesForPet,
  listRecentCareEntries,
  updateCareEntry,
} from "../app/lib/supabase.ts";
import {
  buildPetMemoryContext,
  summarizeRecentChanges,
} from "../app/lib/pet-memory.ts";

function createFakeSupabase({ dogProfiles = [], petCareEntries = [] }) {
  const store = {
    dog_profiles: dogProfiles.map((row) => ({ ...row })),
    pet_care_entries: petCareEntries.map((row) => ({ ...row })),
  };

  function from(table) {
    return new Query(table);
  }

  class Query {
    constructor(table) {
      this.table = table;
      this.filters = [];
      this.op = "select";
      this.payload = null;
      this.orderField = "";
      this.orderAscending = false;
      this.limitCount = null;
    }

    select() {
      return this;
    }

    insert(payload) {
      this.op = "insert";
      this.payload = Array.isArray(payload) ? payload : [payload];
      return this;
    }

    update(payload) {
      this.op = "update";
      this.payload = payload;
      return this;
    }

    delete() {
      this.op = "delete";
      return this;
    }

    eq(field, value) {
      this.filters.push({ field, kind: "eq", value });
      return this;
    }

    in(field, values) {
      this.filters.push({ field, kind: "in", values });
      return this;
    }

    gte(field, value) {
      this.filters.push({ field, kind: "gte", value });
      return this;
    }

    order(field, options = {}) {
      this.orderField = field;
      this.orderAscending = Boolean(options.ascending);
      return this;
    }

    limit(count) {
      this.limitCount = count;
      return this;
    }

    returns() {
      return { data: this.resolve(), error: null };
    }

    then(resolve, reject) {
      return Promise.resolve({ data: this.resolve(), error: null }).then(resolve, reject);
    }

    maybeSingle() {
      const rows = this.resolve();
      return { data: rows[0] ?? null, error: null };
    }

    single() {
      const rows = this.resolve();
      if (rows.length !== 1) {
        return {
          data: null,
          error: { code: "PGRST116", message: "Result does not contain exactly one row." },
        };
      }
      return { data: rows[0], error: null };
    }

    resolve() {
      const rows = store[this.table].map((row) => ({ ...row }));
      const filtered = rows.filter((row) =>
        this.filters.every((filter) => {
          if (filter.kind === "eq") return row[filter.field] === filter.value;
          if (filter.kind === "gte") return new Date(row[filter.field]).getTime() >= new Date(filter.value).getTime();
          return filter.values.includes(row[filter.field]);
        }),
      );

      if (this.op === "insert") {
        const inserted = this.payload.map((row) => {
          const next = {
            ...row,
            created_at: row.created_at || row.updated_at || new Date("2026-06-23T10:00:00Z").toISOString(),
            updated_at: row.updated_at || new Date("2026-06-23T10:00:00Z").toISOString(),
            id: row.id || `generated-${store[this.table].length + 1}`,
          };
          store[this.table].push(next);
          return { ...next };
        });
        return inserted;
      }

      if (this.op === "update") {
        const updated = [];
        store[this.table] = store[this.table].map((row) => {
          const matches = this.filters.every((filter) => {
            if (filter.kind === "eq") return row[filter.field] === filter.value;
            if (filter.kind === "gte") return new Date(row[filter.field]).getTime() >= new Date(filter.value).getTime();
            return filter.values.includes(row[filter.field]);
          });
          if (!matches) return row;
          const next = { ...row, ...this.payload };
          updated.push({ ...next });
          return next;
        });
        return updated;
      }

      if (this.op === "delete") {
        const removed = [];
        store[this.table] = store[this.table].filter((row) => {
          const matches = this.filters.every((filter) => {
            if (filter.kind === "eq") return row[filter.field] === filter.value;
            if (filter.kind === "gte") return new Date(row[filter.field]).getTime() >= new Date(filter.value).getTime();
            return filter.values.includes(row[filter.field]);
          });
          if (matches) {
            removed.push({ ...row });
            return false;
          }
          return true;
        });
        return removed;
      }

      let result = filtered;
      if (this.orderField) {
        result = result.sort((left, right) => {
          const leftValue = new Date(left[this.orderField]).getTime();
          const rightValue = new Date(right[this.orderField]).getTime();
          return this.orderAscending ? leftValue - rightValue : rightValue - leftValue;
        });
      }

      if (this.limitCount !== null) {
        result = result.slice(0, this.limitCount);
      }

      return result;
    }
  }

  return { from, store };
}

function createDeps(userId, store) {
  const client = createFakeSupabase(store);
  return {
    client,
    deps: {
      getClient: () => client,
      getCurrentUser: async () => ({ id: userId, email: `${userId}@example.com` }),
    },
  };
}

test("createCareEntry stores an owned entry and rejects another user's pet", async () => {
  const { client, deps } = createDeps("user-1", {
    dogProfiles: [{ id: "pet-1", user_id: "user-1", name: "Milo" }],
    petCareEntries: [],
  });

  const created = await createCareEntry(
    {
      petProfileId: "pet-1",
      category: "activity",
      note: "Walked calmly for 20 minutes.",
      occurredAt: "2026-06-23T09:15",
      severity: null,
      title: "Morning walk",
    },
    deps,
  );

  assert.equal(created.pet_profile_id, "pet-1");
  assert.equal(created.user_id, "user-1");
  assert.equal(created.category, "activity");
  assert.equal(created.title, "Morning walk");
  assert.equal(created.note, "Walked calmly for 20 minutes.");
  assert.equal(client.store.pet_care_entries.length, 1);

  await assert.rejects(
    () =>
      createCareEntry(
        {
          petProfileId: "pet-2",
          category: "activity",
          note: "Should fail.",
          occurredAt: "2026-06-23T09:15",
          severity: null,
          title: "Unauthorized",
        },
        deps,
      ),
    /could not find that pet/i,
  );
});

test("care log pet preselect chooses only filtered, scoped, or single-pet defaults", () => {
  const profiles = [
    { id: "pet-1", name: "Milo" },
    { id: "pet-2", name: "Otis" },
  ];

  assert.equal(resolveCareLogInitialPetId({ editingPetId: "entry-pet" }), "entry-pet");
  assert.equal(resolveCareLogInitialPetId({ isPetScope: true, petProfileId: "pet-1", profiles }), "pet-1");
  assert.equal(resolveCareLogInitialPetId({ profiles, selectedPet: "pet-2" }), "pet-2");
  assert.equal(resolveCareLogInitialPetId({ profiles, selectedPet: "all" }), "");
  assert.equal(resolveCareLogInitialPetId({ profiles: [profiles[0]], selectedPet: "all" }), "pet-1");
});

test("care history-created entries reload for dashboard and Ask Furvise memory", async () => {
  const profile = {
    id: "pet-rocky",
    user_id: "user-1",
    name: "Rocky",
    species: "dog",
    breed: "Mixed / unknown",
    age_value: 4,
    age_unit: "years",
    weight_value: 42,
    weight_unit: "lb",
    current_food: "Salmon kibble",
    main_concern: "General wellness",
    avoid_ingredients: [],
    monthly_budget: 80,
    created_at: "2026-07-14T08:00:00Z",
    updated_at: "2026-07-14T08:00:00Z",
  };
  const { client, deps } = createDeps("user-1", {
    dogProfiles: [profile],
    petCareEntries: [],
  });

  const created = await createCareEntry(
    {
      petProfileId: "pet-rocky",
      category: "general",
      note: "Added from Care history page.",
      occurredAt: "2026-07-14T09:30",
      severity: null,
      title: "Test care log button",
    },
    deps,
  );

  assert.equal(client.store.pet_care_entries.length, 1);
  const reloaded = await listRecentCareEntries(10, deps);
  assert.equal(reloaded.filter((entry) => entry.id === created.id).length, 1);
  assert.equal(reloaded[0].title, "Test care log button");
  assert.equal(reloaded[0].pet_name, "Rocky");

  const dashboardRows = buildDashboardCareEntries(reloaded);
  assert.equal(dashboardRows[0].title, "Test care log button");

  const memory = buildPetMemoryContext({
    careEntries: reloaded,
    now: new Date("2026-07-14T12:00:00Z"),
    profile,
  });
  const recent = summarizeRecentChanges(memory);
  const recentItems = recent.sections.flatMap((section) => section.items).join("\n");
  assert.match(recentItems, /Test care log button/);
  assert.match(recentItems, /Added from Care history page/);
});

test("Ask Furvise care-history saves skip duplicate generated notes within 24 hours", async () => {
  const now = new Date().toISOString();
  const profile = { id: "pet-rocky", user_id: "user-1", name: "Rocky" };
  const input = {
    petProfileId: "pet-rocky",
    category: "general",
    note: "Furvise-generated note, not veterinary advice. Prepared a vet summary from saved profile details and recent behavior update: \"Too sad - been sitting whole day.\"",
    occurredAt: "2026-07-18T09:30",
    severity: null,
    title: "Furvise vet prep summary",
  };
  const { client, deps } = createDeps("user-1", {
    dogProfiles: [profile],
    petCareEntries: [
      {
        id: "existing-furvise",
        user_id: "user-1",
        pet_profile_id: "pet-rocky",
        category: "general",
        title: input.title,
        note: input.note,
        severity: null,
        occurred_at: now,
        created_at: now,
        updated_at: now,
      },
    ],
  });

  const duplicate = await createCareEntryUnlessDuplicate(input, deps);
  assert.equal(duplicate.action, "duplicate");
  assert.equal(duplicate.entry.id, "existing-furvise");
  assert.equal(client.store.pet_care_entries.length, 1);
});

test("Ask Furvise duplicate check still allows different useful summaries", async () => {
  const now = new Date().toISOString();
  const profile = { id: "pet-rocky", user_id: "user-1", name: "Rocky" };
  const { client, deps } = createDeps("user-1", {
    dogProfiles: [profile],
    petCareEntries: [
      {
        id: "existing-furvise",
        user_id: "user-1",
        pet_profile_id: "pet-rocky",
        category: "general",
        title: "Furvise vet prep summary",
        note: "Furvise-generated note, not veterinary advice. Prepared a vet summary from saved profile details and recent behavior update: \"Too sad - been sitting whole day.\"",
        severity: null,
        occurred_at: now,
        created_at: now,
        updated_at: now,
      },
    ],
  });

  const created = await createCareEntryUnlessDuplicate(
    {
      petProfileId: "pet-rocky",
      category: "food",
      note: "Furvise-generated note, not veterinary advice. Summarized saved food context from food update: \"Ate dinner normally\".",
      occurredAt: "2026-07-18T10:30",
      severity: null,
      title: "Furvise food notes summary",
    },
    deps,
  );

  assert.equal(created.action, "created");
  assert.equal(client.store.pet_care_entries.length, 2);
});

test("listCareEntriesForPet only returns the signed-in user's rows", async () => {
  const { deps } = createDeps("user-1", {
    dogProfiles: [
      { id: "pet-1", user_id: "user-1", name: "Milo" },
      { id: "pet-2", user_id: "user-2", name: "Otis" },
    ],
    petCareEntries: [
      {
        id: "entry-1",
        user_id: "user-1",
        pet_profile_id: "pet-1",
        category: "general",
        title: null,
        note: "Shared note",
        severity: null,
        occurred_at: "2026-06-23T10:00:00Z",
        created_at: "2026-06-23T10:00:00Z",
        updated_at: "2026-06-23T10:00:00Z",
      },
      {
        id: "entry-2",
        user_id: "user-2",
        pet_profile_id: "pet-1",
        category: "general",
        title: null,
        note: "Other user's note",
        severity: null,
        occurred_at: "2026-06-23T11:00:00Z",
        created_at: "2026-06-23T11:00:00Z",
        updated_at: "2026-06-23T11:00:00Z",
      },
    ],
  });

  const rows = await listCareEntriesForPet("pet-1", deps);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].user_id, "user-1");
});

test("listRecentCareEntries only returns entries owned by the signed-in user", async () => {
  const { deps } = createDeps("user-1", {
    dogProfiles: [
      { id: "pet-1", user_id: "user-1", name: "Milo" },
      { id: "pet-2", user_id: "user-2", name: "Otis" },
    ],
    petCareEntries: [
      {
        id: "entry-1",
        user_id: "user-1",
        pet_profile_id: "pet-1",
        category: "activity",
        title: "Walk",
        note: "20 minutes.",
        severity: null,
        occurred_at: "2026-06-23T10:00:00Z",
        created_at: "2026-06-23T10:00:00Z",
        updated_at: "2026-06-23T10:00:00Z",
      },
      {
        id: "entry-2",
        user_id: "user-2",
        pet_profile_id: "pet-2",
        category: "food",
        title: "Dinner",
        note: "Different account.",
        severity: null,
        occurred_at: "2026-06-23T11:00:00Z",
        created_at: "2026-06-23T11:00:00Z",
        updated_at: "2026-06-23T11:00:00Z",
      },
    ],
  });

  const rows = await listRecentCareEntries(5, deps);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].pet_name, "Milo");
});

test("listCareEntriesForPet rejects another user's pet", async () => {
  const { deps } = createDeps("user-1", {
    dogProfiles: [{ id: "pet-2", user_id: "user-2", name: "Otis" }],
    petCareEntries: [],
  });

  await assert.rejects(() => listCareEntriesForPet("pet-2", deps), /could not find that pet/i);
});

test("updateCareEntry edits the stored row", async () => {
  const { client, deps } = createDeps("user-1", {
    dogProfiles: [{ id: "pet-1", user_id: "user-1", name: "Milo" }],
    petCareEntries: [
      {
        id: "entry-1",
        user_id: "user-1",
        pet_profile_id: "pet-1",
        category: "general",
        title: null,
        note: "Original note",
        severity: null,
        occurred_at: "2026-06-23T10:00:00Z",
        created_at: "2026-06-23T10:00:00Z",
        updated_at: "2026-06-23T10:00:00Z",
      },
    ],
  });

  const updated = await updateCareEntry(
    "entry-1",
    {
      petProfileId: "pet-1",
      category: "symptom",
      note: "Updated note",
      occurredAt: "2026-06-23T12:00",
      severity: "moderate",
      title: "Changed",
    },
    deps,
  );

  assert.equal(updated.category, "symptom");
  assert.equal(client.store.pet_care_entries[0].note, "Updated note");
});

test("deleteCareEntry removes the user's row and rejects others", async () => {
  const { client, deps } = createDeps("user-1", {
    dogProfiles: [{ id: "pet-1", user_id: "user-1", name: "Milo" }],
    petCareEntries: [
      {
        id: "entry-1",
        user_id: "user-1",
        pet_profile_id: "pet-1",
        category: "general",
        title: null,
        note: "Delete me",
        severity: null,
        occurred_at: "2026-06-23T10:00:00Z",
        created_at: "2026-06-23T10:00:00Z",
        updated_at: "2026-06-23T10:00:00Z",
      },
      {
        id: "entry-2",
        user_id: "user-2",
        pet_profile_id: "pet-1",
        category: "general",
        title: null,
        note: "Do not delete",
        severity: null,
        occurred_at: "2026-06-23T11:00:00Z",
        created_at: "2026-06-23T11:00:00Z",
        updated_at: "2026-06-23T11:00:00Z",
      },
    ],
  });

  await deleteCareEntry("entry-1", deps);
  assert.equal(client.store.pet_care_entries.length, 1);
  await assert.rejects(() => deleteCareEntry("entry-2", deps), /could not find that care entry/i);
});

test("display helpers preserve intentional casing and show severe caution", () => {
  assert.equal(formatPetDisplayName("  rocky  "), "Rocky");
  assert.equal(formatPetDisplayName("rOCKY"), "Rocky");
  assert.equal(formatPetDisplayName("mr whiskers"), "Mr Whiskers");
  assert.equal(
    getSevereSymptomCautionMessage({ category: "symptom", severity: "severe" }),
    "Furvise is not a veterinarian. If symptoms are severe, rapidly worsening, or involve emergency signs, contact a veterinarian right away.",
  );
  assert.equal(
    getSevereSymptomCautionMessage({ category: "activity", severity: "severe" }),
    "",
  );
});

test("dashboard helpers render real care activity and keep no-update messaging", () => {
  const createdAt = "2026-06-23T08:00:00Z";
  const addedAt = "2026-06-23T09:00:00Z";
  const editedAt = "2026-06-23T10:00:00Z";

  const activity = buildRecentActivity(
    [
      {
        id: "pet-1",
        user_id: "user-1",
        name: "rocky",
        species: "dog",
        breed: "Mixed / unknown",
        age_value: null,
        age_unit: null,
        weight_value: null,
        weight_unit: null,
        current_food: null,
        main_concern: null,
        avoid_ingredients: null,
        monthly_budget: null,
        created_at: createdAt,
        updated_at: editedAt,
        dog_memories: [],
        dog_product_feedback: [],
      },
    ],
    [
      {
        id: "care-1",
        user_id: "user-1",
        pet_profile_id: "pet-1",
        pet_name: "rocky",
        category: "symptom",
        title: "Morning cough",
        note: "Coughing lightly after the walk.",
        severity: null,
        occurred_at: addedAt,
        created_at: addedAt,
        updated_at: addedAt,
      },
      {
        id: "care-1",
        user_id: "user-1",
        pet_profile_id: "pet-1",
        pet_name: "rocky",
        category: "symptom",
        title: "Morning cough",
        note: "Coughing lightly after the walk.",
        severity: null,
        occurred_at: addedAt,
        created_at: addedAt,
        updated_at: editedAt,
      },
    ],
  );

  assert.equal(activity.some((item) => item.title.includes("Profile updated")), false);
  assert.equal(activity[0].title, "Care update edited for Rocky");
  assert.equal(activity[1].title, "Care update added for Rocky");

  const nextSteps = buildNextSteps(
    [
      {
        id: "pet-1",
        user_id: "user-1",
        name: "rocky",
        species: "dog",
        breed: "Mixed / unknown",
        age_value: 4,
        age_unit: "years",
        weight_value: 18,
        weight_unit: "lb",
        current_food: "Kibble",
        main_concern: "General wellness",
        avoid_ingredients: null,
        monthly_budget: 60,
        created_at: addedAt,
        updated_at: editedAt,
        dog_memories: [],
        dog_product_feedback: [],
      },
    ],
    [
      {
        id: "care-1",
        user_id: "user-1",
        pet_profile_id: "pet-1",
        pet_name: "rocky",
        category: "symptom",
        title: "Morning cough",
        note: "Coughing lightly after the walk.",
        severity: null,
        occurred_at: addedAt,
        created_at: addedAt,
        updated_at: editedAt,
      },
    ],
    null,
    "",
  );

  assert.equal(nextSteps.length, 0);
  assert.equal(
    buildProfileStatus(
      {
        id: "pet-1",
        user_id: "user-1",
        name: "rocky",
        species: "dog",
        breed: "Mixed / unknown",
        age_value: 4,
        age_unit: "years",
        weight_value: 18,
        weight_unit: "lb",
        current_food: "Kibble",
        main_concern: "General wellness",
        avoid_ingredients: null,
        monthly_budget: 60,
        created_at: addedAt,
        updated_at: editedAt,
        dog_memories: [],
        dog_product_feedback: [],
      },
      [
        {
          id: "care-1",
          user_id: "user-1",
          pet_profile_id: "pet-1",
          pet_name: "rocky",
          category: "symptom",
          title: "Morning cough",
          note: "Coughing lightly after the walk.",
          severity: null,
          occurred_at: addedAt,
          created_at: addedAt,
          updated_at: editedAt,
        },
      ],
    ),
    "Profile details saved.",
  );

  const previewRows = buildDashboardCareEntries([
    {
      id: "care-2",
      user_id: "user-1",
      pet_profile_id: "pet-1",
      pet_name: "rocky",
      category: "symptom",
      title: "Morning cough",
      note: "A longer note that should be trimmed for the dashboard preview because it is too long to fit cleanly.",
      severity: "mild",
      occurred_at: addedAt,
      created_at: addedAt,
      updated_at: addedAt,
    },
  ]);

  assert.equal(previewRows[0].pet_name, "Rocky");
  assert.equal(previewRows[0].note_preview, formatCareNotePreview(previewRows[0].note, 96));

  const noCare = buildDashboardCareSectionState({
    hasPets: true,
    entries: [],
    petNameById: new Map(),
  });
  assert.equal(noCare.emptyMessage, "No care updates have been logged yet.");
  assert.equal(getPetCareLogHref("pet-1"), "/care-log?pet=pet-1");
});

test("validateCareEntryDraft enforces required fields", () => {
  const result = validateCareEntryDraft({
    petProfileId: "",
    category: "",
    note: "",
    occurredAt: "",
    severity: null,
    title: "",
  });

  assert.equal(result.valid, false);
  assert.equal(Boolean(result.errors.petProfileId), true);
  assert.equal(Boolean(result.errors.category), true);
  assert.equal(Boolean(result.errors.note), true);
  assert.equal(Boolean(result.errors.occurredAt), true);
});

test("dashboard care state renders a real preview and no-pet fallback", () => {
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const todayIso = today.toISOString();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const yesterdayIso = yesterday.toISOString();

  const preview = buildDashboardCareEntries(
    [
      {
        id: "entry-1",
        user_id: "user-1",
        pet_profile_id: "pet-1",
        category: "activity",
        title: "Morning walk",
        note: "Walked 20 minutes.",
        severity: null,
        occurred_at: todayIso,
        created_at: todayIso,
        updated_at: todayIso,
      },
      {
        id: "entry-2",
        user_id: "user-1",
        pet_profile_id: "pet-2",
        category: "food",
        title: "Dinner",
        note: "Ate normally.",
        severity: null,
        occurred_at: yesterdayIso,
        created_at: yesterdayIso,
        updated_at: yesterdayIso,
      },
    ],
    new Map([
      ["pet-1", "Milo"],
      ["pet-2", "Otis"],
    ]),
  );

  assert.equal(preview.length, 2);
  assert.equal(preview[0].pet_name, "Milo");

  const noPet = buildDashboardCareSectionState({ hasPets: false, entries: [], petNameById: new Map() });
  assert.equal(noPet.actionHref, null);
  assert.match(noPet.emptyMessage, /add a pet first/i);

  const sorted = sortCareEntriesNewestFirst([
    {
      id: "entry-1",
      user_id: "user-1",
      pet_profile_id: "pet-1",
      category: "activity",
      title: "Morning walk",
      note: "Walked 20 minutes.",
      severity: null,
      occurred_at: todayIso,
      created_at: todayIso,
      updated_at: todayIso,
    },
    {
      id: "entry-2",
      user_id: "user-1",
      pet_profile_id: "pet-1",
      category: "food",
      title: "Dinner",
      note: "Ate normally.",
      severity: null,
      occurred_at: yesterdayIso,
      created_at: yesterdayIso,
      updated_at: yesterdayIso,
    },
  ]);
  assert.deepEqual(sorted.map((entry) => entry.id), ["entry-1", "entry-2"]);
});
