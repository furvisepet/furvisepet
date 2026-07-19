import test from "node:test";
import assert from "node:assert/strict";
import { buildOnboardingHeaderControls } from "../app/onboarding/header-controls.ts";

test("onboarding header loading state is deterministic", () => {
  const controls = buildOnboardingHeaderControls({
    authStatus: "loading",
    hasStartOver: true,
    onStartOver: () => {},
    userEmail: "milo@example.com",
  });

  assert.deepEqual(controls.actions, []);
  assert.equal(controls.backFallbackHref, "/");
});

test("authenticated onboarding header keeps navigation actions out of header controls", () => {
  const controls = buildOnboardingHeaderControls({
    authStatus: "authenticated",
    hasStartOver: true,
    onStartOver: () => {},
    userEmail: "milo@example.com",
  });

  assert.deepEqual(
    controls.actions.map((action) => action.label),
    [],
  );
  assert.equal(controls.backFallbackHref, "/dashboard");
});

test("anonymous onboarding header keeps sign-in out of header controls", () => {
  const controls = buildOnboardingHeaderControls({
    authStatus: "anonymous",
    hasStartOver: false,
    onStartOver: () => {},
    userEmail: "",
  });

  assert.deepEqual(
    controls.actions.map((action) => action.label),
    [],
  );
  assert.equal(controls.backFallbackHref, "/");
});
