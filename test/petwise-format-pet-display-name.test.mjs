import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToString } from "react-dom/server";

import { formatPetDisplayName } from "../app/lib/petwise";

test("formatPetDisplayName preserves intentional capitalization", () => {
  assert.equal(formatPetDisplayName("rocky"), "Rocky");
  assert.equal(formatPetDisplayName(" Rocky "), "Rocky");
  assert.equal(formatPetDisplayName("AJ"), "AJ");
  assert.equal(formatPetDisplayName("McCloud"), "McCloud");
  assert.equal(formatPetDisplayName("Bo-Jack"), "Bo-Jack");
});

test("formatPetDisplayName falls back for blank or missing values", () => {
  assert.equal(formatPetDisplayName(""), "Unnamed pet");
  assert.equal(formatPetDisplayName(null), "Unnamed pet");
  assert.equal(formatPetDisplayName(undefined), "Unnamed pet");
});

test("care log pet-name rendering smoke test handles rocky without throwing", () => {
  function CareLogPetNameSmoke({ profiles }) {
    const petNameById = React.useMemo(
      () =>
        new Map(
          profiles.map((profile) => [profile.id, formatPetDisplayName(profile.name)]),
        ),
      [profiles],
    );

    return React.createElement("div", null, petNameById.get("pet-1"));
  }

  assert.doesNotThrow(() =>
    renderToString(
      React.createElement(CareLogPetNameSmoke, {
        profiles: [{ id: "pet-1", name: "rocky" }],
      }),
    ),
  );
});
