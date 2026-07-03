# mixture-of-agents

[![CI](https://github.com/AustinDKB/mixture-of-agents/actions/workflows/ci.yml/badge.svg)](https://github.com/AustinDKB/mixture-of-agents/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-informational.svg)](./LICENSE)
[![pi extension](https://img.shields.io/badge/pi-extension-4f46e5.svg)](https://pi.dev)

> A [pi](https://pi.dev) global extension that routes **each turn's LLM call to a random model** from a configurable pool — a lightweight "mixture-of-agents" that spreads work across models you already have configured.

Part of the [**AgentStack**](https://github.com/AustinDKB/AgentStack) agentic-engineering setup.

## Why

Different models have different strengths and failure modes. Rotating the model per turn diversifies reasoning, avoids getting stuck in one model's blind spots, and spreads usage across a subscription's pool — without you having to switch by hand.

## Behavior

- On `turn_start` (before each LLM call) it picks a random model from the pool and `pi.setModel()`s it. If the pick equals the current model the switch is skipped (prefers switching away).
- Footer shows the active model: `MoA: <label>`.
- A brief notification fires on each real switch.
- `/moa` toggles the mixture on/off and reports state + pool.
- `--no-moa` starts the session with MoA disabled.
- Missing models / missing API keys are reported once, then that pick is skipped and another is drawn from the remaining pool.

## Configure the pool

Edit the pool list at the top of `mixture-of-agents.ts`. Each entry is `{ provider, id, label }` and the models must already be configured (via `~/.pi/agent/models.json`, another extension, or a built-in provider):

```ts
const POOL: MoaEntry[] = [
  { provider: "zhipu",    id: "glm-5.2",         label: "GLM-5.2" },
  { provider: "deepseek", id: "deepseek-v4-pro", label: "DeepSeek V4 Pro" },
  { provider: "moonshot", id: "kimi-k2.7-code",  label: "Kimi K2.7 Code" },
];
```

## Install

```jsonc
// ~/.pi/agent/settings.json
{
  "packages": [
    "npm:mixture-of-agents"
  ]
}
```

Or drop it at `~/.pi/agent/extensions/mixture-of-agents.ts` (global) or `.pi/extensions/mixture-of-agents.ts` (project-local) for auto-discovery. Hot-reload with `/reload`.

```
pi            # MoA on by default
pi --no-moa   # start disabled
/moa          # toggle / show state
```

## License

[MIT](./LICENSE) © Austin Bakanec
