# mixture-of-agents — Unit Test Plan

> Plan only — no tests are implemented yet. This defines what to test, how, and the targets.

## Tooling

- **Runner:** [Vitest](https://vitest.dev).
- **Fakes:** `FakeExtensionAPI` (captures `setModel`, notifications, footer status, `/moa` command registration); a fake `ctx.modelRegistry` whose `find(provider, id)` is scripted to return a model, `undefined` (missing), or a model with no API key; **seeded RNG** so pool picks are deterministic.
- `npm test` → `vitest run`; add a `test` step to CI.

## Units & cases

### 1. Pool selection
- Returns a model that exists in the pool.
- With a seeded RNG and a current model set, **prefers switching away** — never returns the current model when alternatives are available.
- Single-item pool with that item current → no switch (see #3).

### 2. Apply on `turn_start`
- On `turn_start`, `pi.setModel()` is called with the picked model before the LLM call.

### 3. Redundant-switch guard
- When the pick equals the current model, `setModel` is **not** called and no notification fires.

### 4. Missing model
- `modelRegistry.find` returns `undefined` → warn **once**, skip, and retry with the remaining pool for that turn.

### 5. Missing API key
- Model present but no key → same skip-and-retry behavior.

### 6. `/moa` toggle
- Toggles enabled ↔ disabled; reports current state **and** the pool.

### 7. `--no-moa` flag
- Session starts disabled; no `setModel` on `turn_start` until toggled on.

### 8. Footer status
- Footer shows `MoA: <label>` for the active model.

### Edge cases
- Empty pool or **all** models unavailable → no crash; MoA is a no-op for that turn.

## Coverage targets

- Selection + guard logic: **≥ 90%** lines.
- Command/flag handling: **≥ 80%** lines.
