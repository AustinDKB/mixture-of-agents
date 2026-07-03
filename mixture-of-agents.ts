/**
 * Mixture of Agents (MoA) Extension
 *
 * Each turn, randomly route the LLM call to one model from a configurable
 * pool. The pool is defined below as { provider, id, label } entries — the
 * models must already be configured (via ~/.pi/agent/models.json, another
 * extension, or a built-in provider). This extension only does the routing.
 *
 * Behavior:
 * - On `turn_start` (fires before each LLM call), pick a random model from
 *   the pool and `pi.setModel()` it. If the pick equals the current model,
 *   the switch is skipped (no redundant notification).
 * - Footer status line shows the active MoA model: "MoA: <label>".
 * - A brief notification fires on each actual switch.
 * - `/moa` toggles the mixture on/off and reports state + pool.
 * - `--no-moa` flag starts the session with MoA disabled.
 *
 * Models are looked up via ctx.modelRegistry.find(provider, id); if a model
 * isn't registered or has no API key, the switch is reported and skipped,
 * and another pick is attempted from the remaining pool for that turn.
 *
 * Usage:
 *   pi                       # MoA on by default
 *   pi --no-moa              # start disabled
 *   /moa                     # toggle / show state
 *
 * Place at ~/.pi/agent/extensions/mixture-of-agents.ts (global) or
 * .pi/extensions/mixture-of-agents.ts (project-local) for auto-discovery.
 * Hot-reload with /reload.
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { Model } from "@earendil-works/pi-ai";

// ───────────────────────────────────────────────────────────────────────────
// Pool configuration — edit this list to match your configured models.
// Each entry: { provider, id, label }
//   - provider: the provider key in models.json (e.g. "zhipu", "deepseek")
//   - id:       the model id under that provider (e.g. "glm-5.2")
//   - label:    short human label shown in the footer / notifications
// ───────────────────────────────────────────────────────────────────────────
interface MoaEntry {
	provider: string;
	id: string;
	label: string;
}

// Models are provided by the opencode-go subscription (provider key "opencode-go").
// All three live under that single provider with these ids.
const MOA_POOL: readonly MoaEntry[] = [
	{ provider: "opencode-go", id: "glm-5.2", label: "GLM-5.2" },
	{ provider: "opencode-go", id: "deepseek-v4-pro", label: "DeepSeek V4 Pro" },
	{ provider: "opencode-go", id: "kimi-k2.7-code", label: "Kimi K2.7 Code" },
] as const;

const STATUS_KEY = "moa";

// Module-scoped state (rebound on reload via session_start reset below).
let enabled = true;
let warnedMissing = new Set<string>();
let lastPickedKey: string | undefined;

function modelKey(m: { provider: string; id: string } | undefined): string | undefined {
	return m ? `${m.provider}/${m.id}` : undefined;
}

function pickRandom<T>(arr: readonly T[]): T {
	return arr[Math.floor(Math.random() * arr.length)];
}

/** Update the footer status to reflect the active model + MoA state. */
function updateStatus(ctx: ExtensionContext) {
	const cur = ctx.model;
	const label =
		MOA_POOL.find((e) => e.provider === cur?.provider && e.id === cur?.id)?.label ??
		cur?.id ??
		"no model";
	ctx.ui.setStatus(STATUS_KEY, enabled ? `MoA: ${label}` : `MoA: off (${label})`);
}

export default function (pi: ExtensionAPI) {
	// --no-moa flag: start disabled
	pi.registerFlag("no-moa", {
		description: "Start with the Mixture-of-Agents extension disabled",
		type: "boolean",
		default: false,
	});

	pi.on("session_start", async (_event, ctx) => {
		// Re-init per session instance.
		enabled = !pi.getFlag("no-moa");
		warnedMissing = new Set();
		lastPickedKey = undefined;
		updateStatus(ctx);
	});

	/**
	 * Core hook: fires before each LLM call. Choose a random model and switch
	 * to it before the provider request is built.
	 */
	pi.on("turn_start", async (_event, ctx) => {
		if (!enabled) return;
		if (MOA_POOL.length === 0) return;

		// Build the list of actually-registered models for this turn.
		const available: { entry: MoaEntry; model: Model<any> }[] = [];
		for (const entry of MOA_POOL) {
			const model = ctx.modelRegistry.find(entry.provider, entry.id);
			if (model) {
				available.push({ entry, model });
			} else {
				const key = modelKey(entry);
				if (!warnedMissing.has(key!)) {
					warnedMissing.add(key!);
					ctx.ui.notify(
						`MoA: ${key} not found in registry — configure it in models.json. Skipping.`,
						"warning",
					);
				}
			}
		}

		if (available.length === 0) {
			ctx.ui.setStatus(STATUS_KEY, "MoA: no configured models");
			return;
		}

		// Pick randomly. Prefer switching away from the current model when the
		// pool has more than one option (keeps the mixture mixing).
		let pick = pickRandom(available);
		if (available.length > 1 && modelKey(ctx.model) === modelKey(pick.model)) {
			const others = available.filter(
				(a) => !(a.entry.provider === pick.entry.provider && a.entry.id === pick.entry.id),
			);
			pick = pickRandom(others);
		}

		const pickKey = modelKey(pick.model)!;

		// Already active? Nothing to do.
		if (modelKey(ctx.model) === pickKey) {
			lastPickedKey = pickKey;
			updateStatus(ctx);
			return;
		}

		const success = await pi.setModel(pick.model);
		if (!success) {
			ctx.ui.notify(
				`MoA: no API key for ${pickKey} — staying on ${modelKey(ctx.model) ?? "current"}.`,
				"warning",
			);
			updateStatus(ctx);
			return;
		}

		lastPickedKey = pickKey;
		ctx.ui.notify(`MoA → ${pick.entry.label}`, "info");
		// updateStatus will be refreshed by the model_select handler below too.
	});

	// Keep the footer in sync when the model changes for any reason
	// (MoA switch, /model, Ctrl+P, restore).
	pi.on("model_select", async (_event, ctx) => {
		updateStatus(ctx);
	});

	// /moa command: toggle / report state.
	pi.registerCommand("moa", {
		description: "Toggle Mixture-of-Agents on/off and show the pool + active model",
		handler: async (_args, ctx) => {
			enabled = !enabled;
			const cur = ctx.model;
			const label =
				MOA_POOL.find((e) => e.provider === cur?.provider && e.id === cur?.id)?.label ??
				cur?.id ??
				"none";
			ctx.ui.notify(
				`MoA ${enabled ? "ON" : "OFF"} — active: ${label}\nPool: ${MOA_POOL.map(
					(e) => e.label,
				).join(", ")}`,
				enabled ? "info" : "warning",
			);
			updateStatus(ctx);
		},
	});
}