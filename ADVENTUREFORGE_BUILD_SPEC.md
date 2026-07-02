> ## ⚠️ AUTHORITATIVE OVERRIDE — TRUST, BUT VERIFY (supersedes this document)
>
> By an explicit, durable decision of the project owner, AdventureForge runs on
> **trust, but verify**. Read this as the lens over everything below:
>
> - **Trust (removed constraints):** the coding agent has **free rein over the
>   entire game** — engine, schemas, DSLs, mechanics, content. The **§14
>   engine-extension gate** and the **§0 human-approval gate** are gone: new
>   mechanics/verbs/effects need no review ceremony or six-item bundle, and the
>   agent decides _what_ to build.
> - **Verify (kept in force):** the **automated verification is the bar**. §0
>   "tests mandatory," the **§8.5 determinism contract** (enforced by the property
>   tests), the **validator** (no soft-locks / reachable endings), **trace replay +
>   regression** (committed traces replay; fixed bugs stay fixed), and **save
>   integrity** all still hold and still block red work in CI and the autonomous
>   loop. §16 content-as-validated-data remains.
>
> The governing principle: **don't route around the verifier** — change _what the
> game does_ freely, but never weaken a check just to pass. The governing charter
> is `AGENTS.md`. Sections below are retained as design context.

---

# AdventureForge — BUILD SPEC: AI-Authored, Deterministic Text-Adventure Engine

**Project name:** AdventureForge
**Document type:** Complete build specification + agent brief (single self-contained file).
**Intended reader:** A frontier coding agent (e.g. Claude Code with Opus 4.8, Codex with GPT-5.5, or Gemini 3.5 Flash via Antigravity) plus its human supervisor.
**Compiled:** 2026-05-31.
**Goal of the project:** Prove, end to end, that an AI can author a text adventure, compile it into a schema-valid game, run it on a deterministic headless engine, play it through a structured action API, test it, record its experience, find design/logic flaws, fix them, and lock the fix with a regression test.
**Instruction to the coding agent:** Read top to bottom, then build. Start at Stage 0, then Stage 1 (CYOA). Hold the line on determinism, strict schemas, full validation, and a headless core at every stage. Do not advance a stage until its acceptance criteria pass in CI.

---

## 0. HOW TO USE THIS DOCUMENT

You are building a real software project from scratch. Treat this file as the source of truth for _what_ to build and _in what order_. You decide the low-level implementation details, but you must honor:

1. **The architecture in §3** (the LLM is never the game engine).
2. **The data schemas in §7** (single source of truth for content).
3. **The determinism contract in §8.5**.
4. **The acceptance criteria** at the end of each stage in §13. Do not advance to the next stage until the current stage's criteria pass in CI.

Working rules for the build:

- **Typed everywhere. Tests mandatory.** No stage is "done" until its tests are green.
- **Build the smallest strict thing first.** A small engine the AI fully understands but cannot corrupt beats a large permissive one.
- **Mechanics live in deterministic code. Content lives in validated, AI-generated data.** Never blur this line.
- **Every generated content pack must pass the validator before it is playable.** Validation failure is a hard error, not a warning.
- **Every bug becomes a replayable artifact and a regression test.** (See §15.)
- **Frontier agents are capable but not flawless.** Do not assume generated content, AI-proposed fixes, or even engine code are correct because a strong model produced them — the validator, property tests, replay, and regression suite are what _establish_ correctness. Keep a **human approval gate** on risky changes: engine-rule edits, schema migrations, and anything that could weaken determinism or corrupt saves.
- **Mock agents by default.** Tests and CI must run with deterministic mock agents and must never require live LLM calls or committed secrets; real providers sit behind environment variables (see §12.7) and are skipped when keys are absent.
- **Treat all AI-generated content and AI-proposed patches as untrusted input** (see §16): validate before use; never let content execute code or shell; apply patches with deterministic code, not model-issued commands.
- Commit in small, reviewable increments. Each commit should leave the repo in a green state.

If a requirement here is ambiguous, prefer the interpretation that makes the engine _stricter_ and the content _more validated_.

---

## 1. PROJECT THESIS

The proof path, in increasing order of mechanical complexity, is:

```
Choose-Your-Own-Adventure (CYOA)
  → Zork-style parser adventure (controlled verb/object model)
    → Sierra-Quest-style adventure (inventory + puzzles + score)
      → Hero's-Quest-style RPG/adventure hybrid (stats, skills, combat-lite)
        → graphical / web UI, and later a 3D renderer
```

The engine stays **headless and structured the entire time.** UI is the _last_ concern, bolted onto a stable structured core. Stages 1 and 2 (CYOA, then Zork-style) are the minimum viable proof and the focus of this spec. Stages 3+ are specified at lower resolution because they reuse the same core.

**The order is deliberate:** story first → mechanics second → schema adaptation third → engine validation fourth → AI playtesting fifth → human UI last.

---

## 2. WHY THIS DESIGN (evidence base)

This architecture is not a guess. Two facts settle it.

**(a) The builder is capable.** As of the compile date, frontier coding agents handle exactly this class of work — typed, test-backed, long-horizon, repo-scale engineering. Verified launch/system-card figures bear this out: Claude Opus 4.8 scores **69.2% on SWE-Bench Pro** (the contamination-resistant variant, ~10 pts ahead of GPT-5.5's 58.6%) and GPT-5.5 scores **82.7% on Terminal-Bench 2.0** (state of the art for command-line agentic work). Model IDs, pricing, and the role split are in §12.7. These figures are dated and are _not_ something the build depends on.

**(b) The model must not be the engine.** Research on LLMs operating _inside_ interactive environments converges on one conclusion: **LLMs are excellent content generators and poor rule engines.**

- **RPGBench** (arXiv 2502.00595, 2025) evaluated LLMs _as_ RPG engines across Game Creation and Game Simulation tasks. Finding: state-of-the-art LLMs produce engaging stories but **struggle to implement consistent, verifiable game mechanics, especially in long or complex scenarios.** Its recommended remedy is a **structured event-state representation** plus **automated validity checking** — exactly the architecture below. It splits evaluation into _objective_ mechanical checks (deterministic) and _subjective_ quality judgments (LLM-as-judge). We mirror that split.

- **TALES** (Text Adventure Learning Environment Suite, arXiv 2504.14128, 2025; Microsoft Research) unified TextWorld, TextWorld-Express, ALFWorld, ScienceWorld, and Jericho. Finding: even the strongest LLM-driven agents **fail to reach ~15–20% on games designed for human enjoyment**, and **struggle immensely with human-written Zork1** even though they ace synthetic games. Implication: do not expect the LLM to brute-force a raw parser; give it structured state and legal actions.

- **Jericho** (Microsoft) is the canonical agent interface to interactive-fiction games (Zork, etc.). Its key ideas we adopt: **template/legal-action generation** (collapsing a ~240-billion-action raw space down by orders of magnitude), **world-object representation**, **deterministic seeds**, **save/restore**, and **stable integer IDs** for locations/objects instead of fragile text parsing.

- **TextWorld / TextWorld-Express** (Microsoft) generate games parameterized by map size, object count, quest length, and description richness — a model for procedurally scaling difficulty once the core is stable.

- **TextQuests** (arXiv 2507.23701, 2025) reinforces the point and adds a crucial caveat: **Zork is almost certainly in LLM training data**, so playing classic games measures memorization as much as reasoning. A _freshly generated_ game — which is exactly what this project produces — is therefore a cleaner test of genuine capability.

**Net design rule:** keep mechanics in deterministic code that the AI cannot corrupt; let the AI generate _content_ into a validated schema; expose to the AI only **structured state + legal actions + event logs**, never a raw parser it must guess at.

---

## 3. CORE ARCHITECTURE — THREE LAYERS

```
┌──────────────────────────────────────────────────────────────┐
│ LAYER 1 — STORY (human/AI-readable narrative)                  │
│   chapters · scenes · characters · locations · themes · tone   │
│   canon · plot beats                                           │
│   → produced by the WRITER agent, drafted like prose           │
└──────────────────────────────────────────────────────────────┘
                         │  ADAPTER agent
                         ▼
┌──────────────────────────────────────────────────────────────┐
│ LAYER 2 — GAME DESIGN (structured, schema-valid content)       │
│   scenes/rooms · choices · items · puzzles · NPCs · dialogue   │
│   conditions · effects · flags · vars · quest stages · cutscenes│
│   → this is the "content pack" the engine consumes             │
└──────────────────────────────────────────────────────────────┘
                         │  COMPILER + VALIDATOR (deterministic code)
                         ▼
┌──────────────────────────────────────────────────────────────┐
│ LAYER 3 — ENGINE (deterministic execution, headless)           │
│   state machine · action validator · event reducer · save/load │
│   trace record/replay · legal-action generator · test harness  │
│   content compiler · renderer API                              │
│   → pure code. No LLM in the loop. Same input ⇒ same output.   │
└──────────────────────────────────────────────────────────────┘
```

LLMs operate heavily in Layers 1 and 2. The engine **enforces** Layer 3. The boundary between Layer 2 (data) and Layer 3 (code) is the single most important invariant in the system.

---

## 4. RECOMMENDED TECH STACK

Pick **one** primary language and commit to it. Recommendation and rationale follow; a fully-supported alternative is documented so the supervisor can override.

### 4.1 Primary (recommended): TypeScript

Rationale: the arc terminates in a web/graphical UI, and a single language across engine + content tooling + UI removes an integration seam. Runtime schema validation (Zod) doubles as the content schema, giving one source of truth for "AI writes content → validator checks it."

| Concern                     | Choice                                                                     |
| --------------------------- | -------------------------------------------------------------------------- |
| Language / runtime          | TypeScript on Node.js 22+ (ESM)                                            |
| Schema + runtime validation | **Zod** (schemas are the canonical content contract)                       |
| Unit tests                  | **Vitest**                                                                 |
| Property-based tests        | **fast-check**                                                             |
| Content format on disk      | **YAML** (authoring) compiled to validated JSON (runtime)                  |
| CLI runner                  | a thin `bin/` entrypoint (commander or node `util.parseArgs`)              |
| Determinism                 | seeded PRNG (e.g. a small xorshift/mulberry32), no `Math.random` in engine |
| Hashing (state hash)        | stable canonical-JSON serialize → SHA-256                                  |
| LLM access                  | provider-agnostic adapter (see §12.7)                                      |
| Web UI (Stage 5+)           | React + Vite, talking only to the structured API                           |

### 4.2 Alternative: Python

Equivalently valid; preferable if you intend to benchmark against Jericho/TextWorld directly (mature Python IF tooling).

| Concern                  | Choice                                                      |
| ------------------------ | ----------------------------------------------------------- |
| Language                 | Python 3.12+                                                |
| Schema + validation      | **Pydantic v2**                                             |
| Unit tests               | **pytest**                                                  |
| Property-based tests     | **Hypothesis**                                              |
| Content format           | YAML → validated JSON                                       |
| CLI runner               | `argparse` / `typer`                                        |
| Determinism              | seeded `random.Random(seed)` instance; never the global RNG |
| Optional IF benchmarking | `jericho`, `textworld` (Linux, Python 3.12+, spaCy)         |
| TUI (optional)           | Textual                                                     |

**Everything in §5–§15 except this section is language-agnostic.** Schemas, interfaces, validation rules, agent roles, and acceptance criteria apply identically to both stacks.

---

## 5. REPOSITORY STRUCTURE

Target layout (TypeScript naming shown; mirror for Python):

```
/ (repo root)
├─ README.md                      # quickstart, how to run a game, how to validate
├─ AGENTS.md                      # agent conventions: don't bypass tests, no secrets, content is never code (§16)
├─ AI_TEXT_ADVENTURE_BUILD_SPEC.md # this document
├─ package.json / pyproject.toml
├─ src/
│  ├─ core/
│  │  ├─ state.ts                  # GameState type + pure transitions
│  │  ├─ conditions.ts             # condition DSL evaluator (pure)
│  │  ├─ effects.ts                # effect reducer (pure)
│  │  ├─ events.ts                 # event types + event log
│  │  ├─ rng.ts                    # seeded PRNG (engine's only randomness source)
│  │  ├─ hash.ts                   # canonical serialize + state hash
│  │  └─ engine.ts                 # step(state, action) -> {state, events}
│  ├─ cyoa/                        # Stage 1 specifics
│  │  ├─ schema.ts                 # Scene/Choice schemas
│  │  └─ runner.ts                 # CYOA observation + step wiring
│  ├─ parser/                      # Stage 2 specifics
│  │  ├─ schema.ts                 # Room/Object/NPC/Dialogue schemas
│  │  ├─ legal_actions.ts          # legal-action generator
│  │  └─ command_map.ts            # controlled verb/object → structured action
│  ├─ api/
│  │  ├─ observation.ts            # build the AI-facing observation object
│  │  └─ types.ts                  # Observation / Action / StepResult types
│  ├─ validate/
│  │  ├─ cyoa_validator.ts
│  │  ├─ parser_validator.ts
│  │  └─ report.ts                 # ValidationReport type + formatter
│  ├─ trace/
│  │  ├─ record.ts                 # write a Trace
│  │  └─ replay.ts                 # deterministically replay a Trace
│  ├─ persist/
│  │  └─ save_load.ts              # serialize/deserialize a save
│  ├─ mcp/                         # optional MCP server exposing the engine as tools (§9.4)
│  │  ├─ server.ts
│  │  └─ tools.ts                  # load_pack / new_game / step_action / replay_trace …
│  └─ index.ts
├─ agents/                         # AI roles (each is a thin LLM-driven script)
│  ├─ writer.ts
│  ├─ adapter.ts
│  ├─ debugger.ts
│  ├─ fixer.ts
│  └─ llm/                         # provider-agnostic client: per-role keyless mock default (e.g. MockAuthorProvider) + optional OpenAI/Anthropic/Google adapters (§12.7)
├─ content/
│  ├─ engine_contract.yaml         # capabilities the writer is given (§11)
│  ├─ cyoa/
│  │  ├─ story/                    # Layer 1 narrative drafts
│  │  └─ pack/                     # Layer 2 schema-valid content packs
│  ├─ parser/
│  │  ├─ story/
│  │  └─ pack/
│  └─ broken-fixtures/             # packs that MUST fail validation (negative tests, §10.4)
├─ traces/                         # recorded playthroughs + bug artifacts
│  └─ bugs/
├─ tests/
│  ├─ unit/
│  ├─ property/                    # fast-check / Hypothesis
│  └─ regression/                  # one test per fixed bug (§15)
└─ bin/
   ├─ play          # interactive human play (CLI)
   ├─ validate      # run validator on a content pack
   ├─ replay        # replay a trace / bug artifact
   ├─ adapt-story   # story draft → schema-valid content pack (mock adapter by default)
   └─ inspect       # summarize a pack or a trace (stats, reachability, suspected bugs)
```

---

## 6. UNIFIED STATE MODEL (shared by all stages)

A single state shape carries the game from CYOA all the way to RPG. Stages add _fields_, never replace the model.

```ts
type GameState = {
  // identity / determinism
  seed: number;
  step: number; // monotonically increasing action counter

  // location
  current: string; // scene_id (CYOA) or room_id (parser)
  visited: Record<string, boolean>;

  // world state
  flags: Record<string, boolean>; // boolean switches
  vars: Record<string, number>; // numeric variables / stats (HP, gold, skills…)
  inventory: string[]; // object ids carried by the player
  objectState: Record<string, ObjectRuntime>; // open/locked/contents per object (parser+)

  // narrative
  journal: string[]; // append-only player-visible log
  questStage: Record<string, string>; // questId -> current stage id (Stage 3+)

  // termination
  ended: boolean;
  endingId: string | null;
};

type ObjectRuntime = {
  open?: boolean;
  locked?: boolean;
  contents?: string[]; // object ids inside a container
  takenBy?: "player" | "world"; // location bookkeeping
};
```

**Save = the full `GameState` plus the content-pack id and its content hash.** A save is only loadable against a matching content hash.

---

## 7. CONTENT SCHEMAS (Layer 2 — the single source of truth)

All content is authored in YAML and compiled to validated JSON. Define these as Zod/Pydantic schemas; the schema **is** the contract. Reject anything that does not parse.

### 7.1 Shared mini-DSLs

**Conditions** (all pure, evaluated against `GameState`):

```yaml
# any condition node is one of:
- has_flag: <flag>
- not_flag: <flag>
- has_item: <object_id>
- not_item: <object_id>
- visited: <node_id>
- not_visited: <node_id>
- var_gte: { name: <var>, value: <number> }
- var_lte: { name: <var>, value: <number> }
- var_eq: { name: <var>, value: <number> }
- all_of: [<condition>, ...] # AND
- any_of: [<condition>, ...] # OR
- none_of: [<condition>, ...] # NOR / NOT
```

**Effects** (all pure; applied by the reducer, each emits an event):

```yaml
- set_flag: <flag>
- clear_flag: <flag>
- add_item: <object_id>
- remove_item: <object_id>
- set_var: { name: <var>, value: <number> }
- inc_var: { name: <var>, by: <number> }
- dec_var: { name: <var>, by: <number> }
- add_journal: <string>
- goto: <scene_id> # CYOA scene transition
- unlock_exit: { from: <room_id>, to: <room_id> } # parser
- open_object: <object_id>
- set_object_locked: { id: <object_id>, locked: <bool> }
- narrate: <string> # pure flavor text event, no state change
- end_game: <ending_id>
```

The condition/effect vocabulary is intentionally small and closed. Content cannot introduce new verbs — only the engine can, and only with the gate in §14.

### 7.2 CYOA schema (Stage 1)

```yaml
# content/cyoa/pack/<name>.yaml
meta:
  id: forest_pack_v1
  title: "The Watchtower Road"
  start: forest_crossroads
  vars_init: { suspicion: 0 } # optional initial numeric vars
  flags_init: [] # optional initial flags

scenes:
  - id: forest_crossroads
    title: "The Forest Crossroads"
    text: >
      The road splits beneath the black pines. To the east, smoke rises from a
      ruined watchtower. To the west, a brook cuts through the moss.
    on_enter: [] # effects fired when scene is entered
    is_ending: false
    choices:
      - id: go_east
        text: "Go toward the ruined watchtower."
        conditions: []
        effects: [{ set_flag: saw_watchtower }]
        next: ruined_watchtower
      - id: go_west
        text: "Follow the brook."
        conditions: []
        effects: []
        next: mossy_brook
      - id: inspect_ground
        text: "Inspect the muddy ground."
        conditions: [{ not_flag: found_bootprints }]
        effects:
          - set_flag: found_bootprints
          - add_journal: "Someone dragged a heavy object toward the watchtower."
        next: forest_crossroads # self-loop: re-presents the scene with new state

endings:
  - id: ending_escape
    title: "You slipped away into the dark."
    text: "..."
```

**Scene rules the validator enforces:** every `next`/`goto` targets an existing scene or ending; an ending scene has `is_ending: true` and no outgoing choices; non-ending scenes have ≥1 choice that is reachable under some satisfiable condition.

### 7.3 Parser schema (Stage 2 — Zork-style)

```yaml
# content/parser/pack/<name>.yaml
meta:
  id: chapel_pack_v1
  title: "The Sealed Crypt"
  start_room: forest_path
  vars_init: {}
  flags_init: []

rooms:
  - id: old_well
    name: "Old Well"
    description: >
      A moss-covered well stands behind the ruined chapel. An iron ring is
      bolted to its rim.
    objects: [old_well, rusted_bucket]
    exits:
      - { direction: north, to: ruined_chapel }
      - { direction: south, to: forest_path }
      - direction: down
        to: well_bottom
        conditions: [{ has_flag: rope_attached_to_well }] # locked until satisfied
        locked_msg: "It's too far to climb down without a rope."

objects:
  - id: rope
    name: "coil of rope"
    aliases: [rope, coil]
    description: "A sturdy coil of hemp rope."
    takeable: true
    quest_critical: true # validator guards against permanent loss
  - id: old_well
    name: "old well"
    aliases: [well]
    description: "Deep, dark, and quiet."
    takeable: false
    interactions:
      - verb: USE
        item: rope
        target: old_well
        conditions: [{ not_flag: rope_attached_to_well }]
        effects:
          - set_flag: rope_attached_to_well
          - unlock_exit: { from: old_well, to: well_bottom }
          - narrate: "You tie the rope to the iron ring. It drops into the dark."
  - id: brass_key
    name: "brass key"
    aliases: [key, brass]
    description: "A small brass key, green with age."
    takeable: true
  - id: oak_chest
    name: "oak chest"
    aliases: [chest]
    description: "A banded oak chest."
    takeable: false
    container: true
    openable: true
    locked: true
    key_id: brass_key
    contents: [silver_coin]

npcs:
  - id: innkeeper
    name: "the innkeeper"
    description: "A broad woman polishing a tankard."
    dialogue:
      root: greet
      nodes:
        - id: greet
          npc_text: "You look lost, traveler."
          topics:
            - { id: crypt, prompt: "Ask about the sealed crypt", goto: about_crypt }
            - { id: bye, prompt: "Say goodbye", end: true }
        - id: about_crypt
          npc_text: "The crypt? Only the bell rope opens it. Not a key in sight."
          effects: [{ set_flag: heard_crypt_rumor }]
          topics:
            - { id: bye, prompt: "Say goodbye", end: true }

win_conditions:
  - id: reach_catacombs
    conditions: [{ visited: catacombs }]
    ending: ending_victory

endings:
  - id: ending_victory
    title: "Into the Catacombs"
    text: "..."
```

**Object/room rules the validator enforces:** see §10.2.

---

## 8. ENGINE SPECIFICATION (Layer 3)

### 8.1 The one public engine function

```ts
function step(state: GameState, action: Action): StepResult;

type StepResult = {
  state: GameState; // NEW state (engine is pure; input state unmutated)
  events: GameEvent[]; // ordered list of what happened
  ok: boolean; // false if action was illegal/rejected
  rejectionReason?: string; // human-readable, for illegal actions
};
```

The engine is a **pure reducer**: `step` must not mutate its input, must not perform I/O, and must not read any clock or global RNG. All randomness flows through the seeded PRNG carried in/derived from `state.seed` and `state.step`.

### 8.2 Action types

```ts
type Action =
  // CYOA
  | { type: "CHOOSE"; choiceId: string }
  // Parser (Stage 2+)
  | { type: "LOOK"; target?: string }
  | { type: "MOVE"; direction: string }
  | { type: "TAKE"; item: string }
  | { type: "DROP"; item: string }
  | { type: "OPEN"; target: string }
  | { type: "CLOSE"; target: string }
  | { type: "UNLOCK"; target: string; with: string }
  | { type: "USE"; item: string; target: string }
  | { type: "TALK"; npc: string }
  | { type: "ASK"; npc: string; topic: string }
  | { type: "GIVE"; item: string; npc: string }
  | { type: "READ"; target: string }
  | { type: "INSPECT"; target: string }
  | { type: "INVENTORY" };
```

### 8.3 Event log

Every action produces an ordered event list. Events are the system's universal record — used for narration, the AI's experience log, testing, and debugging.

```jsonc
{
  "action": { "type": "USE", "item": "rope", "target": "old_well" },
  "ok": true,
  "events": [
    { "type": "state_change", "effect": "set_flag", "flag": "rope_attached_to_well" },
    { "type": "unlock_exit", "from": "old_well", "to": "well_bottom" },
    { "type": "narration", "text": "You tie the rope to the iron ring. It drops into the dark." },
  ],
  "new_state_hash": "8f3a19c4",
}
```

Event `type` values: `state_change`, `narration`, `unlock_exit`, `open_object`, `move`, `take`, `drop`, `dialogue`, `ending`, `rejected`.

### 8.4 Resolution order within a single `step`

1. Validate the action against the **legal-action set** for the current state (§9). If not legal → return `ok:false` with a `rejected` event and reason. **No state change.**
2. Evaluate the action's `conditions`. If unmet → `ok:false`, `rejected` event with the relevant `locked_msg`/reason. No state change.
3. Apply effects **in declared order** through the pure reducer, emitting one event per effect.
4. Apply any `on_enter` effects triggered by a resulting scene/room transition.
5. Check win/lose/ending conditions; if met, set `ended`, emit `ending` event.
6. Increment `step`, recompute `new_state_hash`.

### 8.5 DETERMINISM CONTRACT (non-negotiable)

> **Same seed + same initial state + same action sequence ⇒ identical final state, identical state-hash sequence, and identical event sequence — on any machine, any run.**

Enforced by a property test (§14 testing strategy): generate random valid action sequences, run twice, assert byte-identical traces. Any nondeterminism (clock, global RNG, map/set iteration order, JSON key order) is a bug.

### 8.6 State hash

Canonical-serialize `GameState` (keys sorted, sets serialized as sorted arrays) → SHA-256 → first 8 hex chars for logs, full hash for save integrity. Two states with identical hashes are identical games.

### 8.7 Save / load

`save(state, packId, contentHash) -> bytes`; `load(bytes) -> {state, packId, contentHash}`. Loading **must** verify `contentHash` matches the loaded pack; mismatch is a hard error (prevents replaying a save against edited content and silently corrupting it).

### 8.8 Trace record / replay

A **Trace** is a fully replayable artifact:

```jsonc
{
  "trace_id": "tr_0001",
  "pack_id": "chapel_pack_v1",
  "content_hash": "ab12...",
  "seed": 88123,
  "initial_state_ref": "start", // or an embedded save
  "actions": [
    { "type": "MOVE", "direction": "north" },
    { "type": "TAKE", "item": "rope" },
  ],
  "expected_final_hash": "8f3a19c4", // optional; asserted on replay
}
```

`replay(trace)` reconstructs the initial state and applies actions through `step`, asserting the final hash if present. This is the backbone of regression testing and bug reproduction.

---

## 9. THE AI-FACING ACTION API (the only way an LLM touches the game)

The LLM **never** sees raw engine internals and **never** invents parser syntax. On each turn it receives a structured **Observation** and returns an **Action** chosen from `available_actions`. This is the Jericho "legal-action" idea: collapse the action space to a small enumerated set.

### 9.1 Observation (CYOA)

```jsonc
{
  "mode": "cyoa",
  "scene_id": "forest_crossroads",
  "text": "The road splits beneath the black pines...",
  "state": { "flags": [], "vars": {}, "inventory": [], "journal": [] },
  "available_actions": [
    { "id": "go_east", "text": "Go toward the ruined watchtower." },
    { "id": "go_west", "text": "Follow the brook." },
    { "id": "inspect_ground", "text": "Inspect the muddy ground." },
  ],
}
```

The LLM returns: `{ "action_id": "inspect_ground" }` → mapped to `{ type: "CHOOSE", choiceId: "inspect_ground" }`.

### 9.2 Observation (parser)

The legal-action generator computes every currently-valid command and exposes both a stable `id` and a human-style `command` string (for the human CLI), plus the structured action.

```jsonc
{
  "mode": "parser",
  "room": "old_well",
  "description": "A moss-covered well stands behind the ruined chapel.",
  "visible_objects": [
    { "id": "old_well", "name": "Old Well" },
    { "id": "rusted_bucket", "name": "Rusted Bucket" },
  ],
  "exits": [
    { "direction": "north", "to": "ruined_chapel" },
    { "direction": "south", "to": "forest_path" },
  ],
  "inventory": ["rope", "flint"],
  "available_actions": [
    {
      "id": "look_old_well",
      "command": "look at old well",
      "action": { "type": "LOOK", "target": "old_well" },
    },
    {
      "id": "take_bucket",
      "command": "take rusted bucket",
      "action": { "type": "TAKE", "item": "rusted_bucket" },
    },
    {
      "id": "use_rope_on_well",
      "command": "use rope on old well",
      "action": { "type": "USE", "item": "rope", "target": "old_well" },
    },
    { "id": "go_north", "command": "go north", "action": { "type": "MOVE", "direction": "north" } },
    { "id": "go_south", "command": "go south", "action": { "type": "MOVE", "direction": "south" } },
  ],
}
```

The LLM returns `{ "action_id": "use_rope_on_well" }`. The runner looks up the structured action and calls `step`.

### 9.3 The human-facing parser (Stage 2)

Humans get the classic feel via a **controlled** verb/object parser (NOT open natural language in v1). It accepts commands like `look`, `go north`, `take lantern`, `open chest`, `unlock door with brass key`, `talk to innkeeper`, `use rope on well`, and maps them to the same structured `Action` type via `parser/command_map.ts`. Unrecognized commands return a friendly "I don't understand…" and, optionally, a hint listing example verbs. The legal-action set is the ground truth either way.

### 9.4 MCP server interface (how external agents connect)

Expose the engine as an optional local **MCP server** (`src/mcp/`). MCP (Model Context Protocol) is the current de-facto agent-tool standard — Linux Foundation–governed, with native clients in Claude Code, Codex, Gemini CLI, GitHub Copilot, Cursor, and Windsurf — so a single MCP surface lets any of those harnesses play, validate, test, and debug the game with no bespoke glue. Each tool is a thin wrapper over functions you already built; the engine stays the source of truth.

Tools to expose (JSON-serializable in/out):

| Tool                      | In → Out                                                           |
| ------------------------- | ------------------------------------------------------------------ |
| `load_pack`               | pack path → metadata + validation report                           |
| `validate_pack`           | pack path → validation report                                      |
| `new_game`                | pack path, seed → session id, initial observation, state hash      |
| `get_observation`         | session id → current AI-facing observation                         |
| `list_legal_actions`      | session id → legal actions                                         |
| `step_action`             | session id, action_id → action result, new observation, state hash |
| `save_game` / `load_game` | session id ↔ serialized save (+ content-hash check, §8.7)          |
| `replay_trace`            | trace path → replay result + first divergent step if any           |
| `inspect_trace`           | trace path → summary, steps, suspected bugs                        |
| `adapt_story`             | story text, target mode → draft content pack + adaptation report   |
| `apply_content_patch`     | pack path, patch proposal → modified pack + validation report      |

MCP rules: explicit input schemas for every tool; never expose the filesystem outside the project root; content and patches never run shell or code (§16); handlers are unit-tested directly, without needing a live MCP client.

---

## 10. VALIDATION SPECIFICATION

The validator is deterministic code that runs over a compiled content pack and returns a `ValidationReport`. **A pack with any `error`-severity finding is unplayable.** Authoring agents iterate until the report is green.

### 10.1 CYOA validator (Stage 1) — the graph is fully analyzable

Run these checks:

- **Schema validity**: pack parses against the CYOA schema.
- **Reference integrity**: every `next`/`goto`/ending reference resolves.
- **Reachability**: BFS from `start` reaches every scene; report unreachable scenes.
- **Ending reachability**: every declared ending is reachable on some path; every terminal path ends in an ending or an intentional documented loop.
- **No dead ends**: every non-ending scene has ≥1 choice satisfiable under some reachable state.
- **Flag feasibility**: every flag referenced by a `has_flag`/`var_gte`/etc. condition can actually be set somewhere upstream (no impossible gates).
- **Item feasibility**: any item required by a condition can be obtained before it is required, on at least one path.
- **No soft-locks**: no reachable state where the player can take no progress-making action and no ending is reachable.
- **Contradictory conditions**: flag a choice whose conditions can never all be true.
- **Duplicate endings**: warn on endings that are structurally identical.

CYOA is the best first proof precisely because **the entire game is a graph** and these are exhaustively checkable.

### 10.2 Parser validator (Stage 2) — state space is larger; check invariants

Graph traversal is necessary but insufficient (inventory + object interactions multiply states). Add:

- All rooms reachable from `start_room`.
- All exits target existing rooms.
- Every locked exit has a satisfiable unlock condition reachable before it is needed.
- Every door/container with `locked: true` has a `key_id` that points to an obtainable key, **or** another satisfiable unlock path.
- Every takeable object is obtainable on some path.
- Every object required by an interaction/condition is obtainable **before** it is required.
- **`quest_critical` objects can never be permanently lost** (cannot be dropped into an irretrievable place, destroyed, or consumed) unless a replacement source exists. (This is the classic adventure soft-lock; guard it hard.)
- Every container that must be opened to win can be opened.
- Every NPC dialogue `topic` references an existing node; `goto` targets exist; trees terminate.
- Every puzzle's dependency chain is satisfiable.
- Every `win_condition` is reachable.
- No required item can be irreversibly destroyed unless replaceable.

### 10.3 Report shape

```jsonc
{
  "pack_id": "chapel_pack_v1",
  "ok": false,
  "findings": [
    {
      "severity": "error",
      "code": "SOFTLOCK_QUEST_ITEM",
      "message": "bell_rope can be dropped into old_well before the crypt puzzle, making ending_victory unreachable.",
      "where": ["object:bell_rope", "room:old_well"],
    },
    {
      "severity": "warning",
      "code": "UNCLEAR_PUZZLE",
      "message": "crypt requires bell_rope but no in-world clue points to it.",
      "where": ["object:sealed_crypt"],
    },
  ],
}
```

### 10.4 Negative fixtures (the validator must fail these)

A validator that never rejects anything is worthless, so ship deliberately-broken packs in `content/broken-fixtures/` and assert each fails with a specific error code: missing scene/room reference; door locked by a nonexistent key; choice gated on an unsettable flag; unreachable or impossible win condition; required quest item that is removable and unrecoverable; duplicate ID; ambiguous object alias; empty text field; unknown effect type; and an undeclared non-terminal loop. These double as the CI proof that validation actually bites.

---

## 11. THE ENGINE CONTRACT (what the WRITER agent is given before writing)

Before drafting, the writer receives a compact, machine-readable statement of what the engine can and cannot do. This keeps stories loosely inside the engine's reach without forcing prose into rigid schema form. Store at `content/engine_contract.yaml`.

```yaml
engine_capabilities:
  structure:
    - scenes
    - rooms
    - exits
    - choices
    - flags
    - numeric_vars
    - inventory
    - npc_dialogue
    - simple_puzzles
    - cutscenes

  supported_actions:
    - look
    - move
    - take
    - drop
    - use_item_on_target
    - talk
    - ask_about_topic
    - give_item_to_npc
    - open
    - close
    - unlock
    - read
    - inspect

  unsupported_in_v1:
    - real_time_combat
    - stealth_simulation
    - physics
    - companion_ai
    - complex_emotional_relationship_systems
    - arbitrary_crafting
    - free_form_spellcasting

  allowed_workarounds:
    - cutscene
    - narrative_summary
    - branching_choice
    - scripted_event
    - future_mechanic_flag # mark a desired mechanic for a later stage
```

After drafting, the **adapter** agent classifies every scene/beat as exactly one of:

- `fully_supported`
- `supported_with_minor_rewrite`
- `requires_cutscene`
- `requires_engine_extension` (triggers the gate in §14)
- `too_expensive_for_prototype` (deferred)

Worked example of the adaptation decision (from the design notes):

```
Story moment: "The hero hides under the bridge while soldiers pass overhead."
Engine cannot support stealth yet. Options:
  1. Add a stealth mechanic            (→ requires_engine_extension; gated)
  2. Convert to a cutscene             (→ requires_cutscene)
  3. Convert to a branching choice     (hide / confront / flee into reeds)
  4. Convert to a flag-based branch    (if wearing guard_cloak → pass; else capture)
```

That is exactly how game writing works under production constraints: draft like a writer, adapt like a designer.

---

## 12. AI AGENT ROLES

Each role is a thin, well-prompted LLM driver around the deterministic core. None of them _is_ the engine; they read/write data and call engine functions.

### 12.1 Writer (Layer 1)

Input: premise, tone, target length, the engine contract.
Output: chaptered prose story + a beat list. Drafts freely; does not need schema fluency.

### 12.2 Adapter (Layer 1 → Layer 2)

Input: story + beats + engine contract + content schema.
Output: a schema-valid content pack, plus a per-beat classification (§11). Extracts scenes, locations, characters, props, conflicts, key decisions; maps them to scenes/rooms/objects/flags/puzzles/cutscenes/quests.

### 12.3 Validator-runner

Pure code (not an LLM). Compiles the pack and produces the `ValidationReport`. The adapter loops against it until green.

### 12.4 Playtester (blind LLM playtest)

Input each turn: current observation, current objective, inventory, known map, quest log, recent event history — and **nothing else**: the playtester is a fresh subagent with no repo access that touches the game only through the `mcp__adventureforge__*` tools.
Output each turn (structured): `chosen_action`, `reason`, `expected_result`, plus per-step diagnostics. After the run it emits a **playtest record** (§12.6) — game log, step count, choices made, and qualitative feedback (clarity / pacing / confusion). This blind LLM playtest is the **only** judge of player-facing quality; structural soundness (reachable endings, no soft-locks) is proven separately by the validator + exhaustive solver (the dev tests, §12.8).

### 12.5 Debugger + Fixer

Debugger: turns a failed/odd playthrough into a **bug artifact** (replayable trace + diagnosis). Fixer: patches exactly one of `{content, engine_rule, validator, test, hint_text, quest_structure}` and adds a regression test (§15). Engine-rule changes are gated (§14).

### 12.6 Playtest record formats

Good step (progress):

```yaml
step: 42
location: old_well
objective: find_entrance_to_catacombs
available_actions: [look_old_well, use_rope_on_well, go_north, go_south]
chosen_action: use_rope_on_well
expected: "unlock access to the lower area"
actual:
  - rope_attached_to_well flag set
  - exit to well_bottom unlocked
result: progress
notes: "Puzzle is understandable: rope found nearby; description mentions an iron ring."
```

Bad puzzle (design flaw, not a code bug):

```yaml
step: 71
location: chapel
objective: open_sealed_crypt
chosen_action: use_silver_key_on_crypt
actual: no effect
issue: "Player has no clue the crypt needs the bell rope, not the silver key."
severity: medium
recommendation:
  - add a hint to the chapel mural
  - add an NPC rumor
  - rename 'silver key' so it doesn't imply crypt access
```

The point: the AI does not just check _whether_ the game works — it records _what it experienced_ and pinpoints _where the design is unclear._

### 12.7 LLM client (provider-agnostic)

Implement one interface (e.g. `completeJson<T>({system, user, schemaName, schema})`) with multiple backends. The **default is a deterministic, keyless per-role mock** (e.g. `MockAuthorProvider`) that returns canned/heuristic JSON, so the authoring agent roles — writer, adapter, debugger, fixer — run in tests and CI with **no live calls and no API keys**. Real adapters (OpenAI / Anthropic / Google) sit behind environment variables and are skipped when keys are absent. As of this writing the relevant frontier models are (verify IDs/pricing at provider docs before wiring):

- **Anthropic Claude Opus 4.8** (`claude-opus-4-8`, released 2026-05-28; ~$5/$25 per 1M tokens, 1M context). Leads issue-level coding — **69.2% SWE-Bench Pro** (vs GPT-5.5's 58.6%), 88.6% SWE-Bench Verified — and reports ~4× fewer self-introduced code defects vs 4.7, with configurable Effort Modes. **Dynamic Workflows** (research preview in Claude Code) can fan a task across up to ~1,000 parallel subagents (16 concurrent) with built-in verification. Best fit for the **builder/debugger** role and large content-validation sweeps.
- **OpenAI GPT-5.5** (Codex `gpt-5.5`, released 2026-04-23; ~$5/$30 per 1M tokens, 1M context). Leads terminal/CLI workflows — **82.7% Terminal-Bench 2.0** (state of the art) — and is strong on long debug/test/validate loops; 58.6% SWE-Bench Pro. Co-leads the **builder/debugger** role, especially for the CLI runner and test harness.
- **Google Gemini 3.5 Flash** (`gemini-3.5-flash`, GA 2026-05-19; ~$1.50/$9 per 1M tokens, 1M context / 65k output, no Computer Use). Fast and cheap with strong agentic + tool-use. Best fit for the **writer** and the **blind LLM playtest** runs, where you want throughput at low cost.

The role split above is a suggestion, not a constraint — keep the client abstraction so any model can be swapped per role.

> Caveat backed by the research in §2: do not over-trust _any_ model as the live rule engine. The whole point of the structured API + validator is that the engine, not the model, guarantees correctness.

### 12.8 The two-mode testing model

Testing collapses to exactly **two** complementary modes. (The earlier heuristic
**playtester persona roster** — eight in-process player bots — and the
`run_playtest` coverage/random-walk bot have been **removed** in favor of these two;
they conflated full-knowledge structural checking with player-facing quality, and a
heuristic bot was never an honest proxy for either.)

1. **Dev tests (full knowledge, specific assertions).** The Vitest unit/regression
   suite + the validators (`validateCyoa` / `validateParser` / `validateRpg`) + the
   **exhaustive BFS solver**. Together these _prove_ the structural properties a
   persona roster could only ever sample for: every declared ending is reachable, no
   reachable state soft-locks, ordering is order-independent where claimed, and the
   score economy is sound (reachable max == declared max). They run in `npm run
health` and are deterministic — the same play orders the dropper / out-of-order
   personas used to probe are now covered exhaustively, not heuristically.
2. **Blind LLM playtest (§12.4).** A fresh subagent with **no repo access** plays a
   pack purely through the `mcp__adventureforge__*` tools and reports its game log,
   step count, choices made, and qualitative feedback (clarity / pacing / confusion).
   This is the **only** judge of player-facing quality (signposting, pacing, fun) —
   the part no deterministic check can score. It lives in `blind-tester/`, follows
   `docs/blind_playtest_protocol.md`, and is run per-cycle by the autonomous loop,
   rotating across packs.

Net: structural soundness is _proven_ by mode 1; player experience is _judged_ by
mode 2. Nothing relies on a heuristic bot pretending to be a player.

---

## 13. STAGE-BY-STAGE BUILD PLAN + ACCEPTANCE CRITERIA

### STAGE 0 — Scaffolding

Build: repo (§5), tooling (§4), the unified `GameState` (§6), the condition/effect DSL evaluators (§7.1), `rng`, `hash`, `save_load`, `trace record/replay`, the pure `step` skeleton, CI that runs lint + tests.
**Done when:** `bin/replay` round-trips a hand-written trace; determinism property test passes; CI is green.

### STAGE 1 — CYOA engine (the minimum viable proof)

Build the CYOA schema, runner, observation builder, full CYOA validator, human CLI (`bin/play`), and the writer→adapter→validator→playtester→debugger→fixer loop for CYOA.

Target first content pack:

- 20 scenes, 3 endings, 2 inventory items, 5 flags, 1 NPC conversation, 1 condition-locked choice, 1 hidden scene, save/load, trace recording.

**Stage 1 acceptance — the end-to-end proof must demonstrate, in CI or a recorded run:**

1. AI writes a 20-scene branching story.
2. AI adapts it into a schema-valid pack.
3. Engine validates the pack (green report).
4. AI playtester plays every major route.
5. AI records its experience as playtest records + traces.
6. AI identifies at least one confusing or broken branch.
7. AI fixes it (content/hint/structure).
8. A regression test is added and passes.
9. Determinism holds: replaying every recorded trace reproduces identical hashes.

This single loop is the whole thesis in miniature. Do not move on until it passes.

### STAGE 2 — Zork-style parser adventure

Build the parser schema, legal-action generator, controlled command parser (human side), parser validator, and the structured action API for the AI. Reuse the entire Stage-0 core and the agent loop.

Target first content pack:

- 10 rooms, 8 objects, 2 containers, 2 locked doors, 1 NPC with a dialogue tree, 2 puzzles, 1 win condition, controlled parser, legal-action API, trace replay, exhaustive-solver coverage, and a blind LLM playtest (§12.8).

**Stage 2 acceptance:**

1. Pack passes the full parser validator (§10.2), including the `quest_critical` soft-lock guard.
2. A human can complete the game through the controlled CLI parser.
3. The AI completes the game using only the structured legal-action API (no raw-parser guessing).
4. Soft-locks and out-of-order play are proven **absent** by the dev tests (§12.8) — the validator's `quest_critical` / unreachable-state checks plus the exhaustive BFS solver (every ending reachable, no reachable soft-lock); a real one found during development is fixed and regression-tested. A blind LLM playtest (§12.8) plays the pack over MCP and reports player-facing clarity/pacing.
5. Determinism holds across all recorded traces.
6. At least one bug becomes a `traces/bugs/` artifact and a regression test (§15).

### STAGE 3 — Sierra-Quest style (inventory + puzzles + score + death/restore)

Add: a score variable and scoring effects, "death" endings with restore, multi-step puzzle chains, more object interactions. Reuse all prior layers. Extend the validator to check score reachability and that death states are always recoverable via load.

### STAGE 4 — Hero's-Quest style (RPG/adventure hybrid)

Add via the gate (§14): character stats in `vars` (HP, skills, gold), deterministic skill checks (seeded), simple turn-based combat resolved in code, quest stages. The engine stays deterministic; combat randomness flows through the seeded PRNG so every fight is replayable.

### STAGE 5 — Human UI, then renderer

Only now add a UI. Web (React + Vite) for Stages 1–4 content, talking exclusively to the structured API and the same `step` function. A 3D renderer, if pursued, is a presentation layer over identical structured state. **The engine remains headless; the UI is a view.**

---

## 14. ENGINE-EXTENSION GATE (how the engine grows without rotting)

The AI _may_ propose engine extensions (new mechanics/verbs). Every extension MUST ship with all of:

1. An explicit mechanic spec (states, transitions, edge cases).
2. A schema update (new condition/effect/object fields).
3. Unit tests for the new mechanic.
4. At least one scenario test exercising it in a real pack.
5. A backward-compatibility check (all existing packs still validate; all existing traces still replay to identical hashes).
6. A fresh playtest trace using the new mechanic.

Without the gate the engine bloats and loses determinism. With it, the engine becomes _more_ robust over time.

**Testing strategy across all stages** — coverage is necessary but not sufficient; the determinism and purity _properties_ below are what actually guarantee correctness, so do not treat a coverage percentage as the goal:

- **Unit tests**: each condition, each effect, each action type.
- **Property tests** (fast-check / Hypothesis): (a) determinism — random valid action sequences run twice produce identical traces; (b) purity — `step` never mutates input; (c) save/load round-trips to an identical state hash; (d) the legal-action set never contains an action that `step` then rejects as _illegal_ (conditions may still fail, but legality must agree).
- **Validator + exhaustive BFS solver**: prove, over the whole reachable state space, that every declared ending is reachable, no state soft-locks, and the score economy is sound (the structural net; see §12.8 mode 1).
- **Regression tests**: one per fixed bug (§15).
- **Blind LLM playtest** (§12.8 mode 2): a no-repo-access subagent plays over MCP and reports player-facing clarity/pacing; the only judge of subjective quality.

---

## 15. BUG ARTIFACT + REGRESSION FORMAT

Every failure becomes a replayable artifact in `traces/bugs/`, then a regression test. Example:

```yaml
bug_id: bug_0147
pack_id: chapel_pack_v1
content_hash: ab12cd34
seed: 88123
initial_state: save_before_chapel # or "start"
trace:
  - { type: MOVE, direction: north }
  - { type: TAKE, item: bell_rope }
  - { type: MOVE, direction: south }
  - { type: USE, item: bell_rope, target: old_well } # dropped into the well
  - { type: MOVE, direction: north }
  - { type: USE, item: silver_key, target: sealed_crypt }
failure:
  type: soft_lock
  description: >
    Player can sink the bell rope into the well before the crypt puzzle,
    making the main quest impossible.
expected:
  - prevent losing a quest_critical item irreversibly, OR
  - provide an alternate rope source, OR
  - make the rope recoverable from the well
fix:
  layer: validator # one of: content | engine_rule | validator | test | hint_text | quest_structure
  summary: "Add SOFTLOCK_QUEST_ITEM check; mark bell_rope quest_critical; make well non-destination for it."
regression_test: tests/regression/bug_0147_quest_item_softlock.test.ts
```

The matching regression test asserts, e.g.: _"A player cannot permanently lose a quest-critical item before the crypt puzzle."_ Run it forever.

---

## 16. SECURITY & UNTRUSTED-CONTENT POSTURE

An AI-content pipeline has a threat model, and it must be designed in, not bolted on. Treat every byte the model produces — content packs _and_ proposed fixes — as untrusted input.

- **Content is data, never code.** Packs are YAML/JSON validated by the schema. No `eval`, no embedded scripts, no shell. The engine interprets a closed condition/effect vocabulary (§7.1) and nothing else.
- **Patches are applied by deterministic code, not by the model.** The fixer proposes a structured `ContentPatchProposal`; your code validates and applies it. A model never runs shell or writes files directly.
- **Separate content, tools, and runtime authority** (prompt-injection defense). A malicious or confused content file must not be able to escalate into tool calls, filesystem access, or new engine verbs. Indirect prompt injection via crafted content/asset files is a documented, real attack on coding agents — assume hostile inputs.
- **Least privilege + sandboxing.** Run agent workspaces and the MCP server with the minimum permissions; never expose the filesystem outside the project root (§9.4); no secrets in the repo, in content, or in logs.
- **Human approval gate for sensitive operations** — engine-rule changes, schema migrations, anything touching determinism or saves (ties to the §0 rule and the §14 gate). "A strong model wrote it" is not a safety argument.
- **Integrity at load.** Save/load verifies the content hash (§8.7); replay detects altered content (§8.8). A save or trace that no longer matches its pack is a hard error, not a silent re-interpretation.

Reference frameworks: OWASP Top 10 for LLM Applications (esp. LLM01 Prompt Injection) and the NIST AI Risk Management Framework Generative-AI Profile.

---

## 17. CONTENT DESIGN RULES (guardrails for the writer/adapter agents)

These keep AI-generated content _fun and solvable_, not just schema-valid. Bake them into the writer/adapter prompts and, where checkable, into the validator and the blind LLM playtest (§12.8).

1. Every puzzle has **at least two clue sources** (e.g. a room description and an NPC line).
2. Red herrings are signposted **in the narrative**, never by hidden designer intent.
3. Required items are **always recoverable**; failure endings are allowed, soft-locks are not.
4. The player should never have to guess parser syntax — legal actions reveal what's _possible_ without spoiling _how_.
5. NPC dialogue carries **actionable** hints; `inspect`/`look` reward curiosity.
6. Loops are intentional and declared; every other path terminates.
7. A player who follows the main objective can always finish; an explorer finds optional content; an out-of-order player gets coherent feedback.
8. Structural problems are caught by the validator + exhaustive solver **before** runtime (the dev tests); the blind LLM playtest surfaces _confusion_, not just crashes.

---

## 18. DIRECT ANSWERS TO THE FEASIBILITY QUESTIONS (settled — build accordingly)

- **Can frontier coding agents build a robust Zork engine?** Yes. A modest, strict, typed, test-backed Zork-like engine is well within current frontier coding-agent capability. The hard part is not the first draft — it is making the engine strict enough that generated content cannot break it. This spec front-loads that strictness.
- **Can an LLM interface with the game, play it, test it, and record its experience?** Yes; adjacent systems (Jericho, TextWorld, TALES) already expose text games to agents. This project goes further by exposing **structured state + legal actions + traces + validation reports** instead of a raw parser.
- **Can the AI write content into the engine's parameters?** Yes — the cleanest production mode: AI receives schema + canon + engine contract → produces a content pack → validator checks it → AI revises until green.
- **Can the AI write a story first, then adapt it?** Yes, and this is the better creative workflow: prose first for coherence, then a designer-style adaptation pass into scenes/rooms/objects/flags/puzzles/cutscenes/quests.
- **Can the engine expand when the story needs something new?** Yes — but only through the gate in §14.

---

## 19. REFERENCES (verify before relying on version-specific details)

Research / tooling:

- RPGBench — _Evaluating LLMs as Role-Playing Game Engines_, arXiv:2502.00595 (2025).
- TALES — _Text Adventure Learning Environment Suite_, arXiv:2504.14128 (2025); https://microsoft.github.io/tale-suite/ ; https://github.com/microsoft/tale-suite
- Jericho — Microsoft Research IF agent environment; https://github.com/microsoft/jericho ; Hausknecht et al., _Interactive Fiction Games: A Colossal Adventure_ (AAAI 2020), arXiv:1909.05398.
- TextWorld / TextWorld-Express — Microsoft Research.
- TextQuests — _How Good are LLMs at Text-Based Video Games?_, arXiv:2507.23701 (2025).
- ZorkGPT — community LLM-IF agent using the Jericho interface (illustrative architecture); https://github.com/stickystyle/ZorkGPT

Agent protocol & schemas:

- Model Context Protocol — https://modelcontextprotocol.io (spec 2025-06-18; Linux Foundation–governed; native in Claude Code, Codex, Gemini CLI, GitHub Copilot, Cursor, Windsurf).
- Zod — https://zod.dev (runtime schema validation = the content contract).

Security / governance:

- OWASP Top 10 for LLM Applications, esp. LLM01 Prompt Injection — https://genai.owasp.org/llm-top-10/
- NIST AI Risk Management Framework, Generative-AI Profile — https://www.nist.gov/itl/ai-risk-management-framework

Frontier models (figures as of 2026-05; confirm current IDs/pricing/limits at vendor docs):

- Anthropic — _Claude Opus 4.8_ (`claude-opus-4-8`), 2026-05-28; SWE-Bench Pro 69.2%, SWE-Bench Verified 88.6%, Dynamic Workflows research preview. Source: Anthropic Opus 4.8 release + system card.
- OpenAI — _GPT-5.5_ (Codex `gpt-5.5`), 2026-04-23; Terminal-Bench 2.0 82.7%, SWE-Bench Pro 58.6%. Source: OpenAI "Introducing GPT-5.5".
- Google — _Gemini 3.5 Flash_ (`gemini-3.5-flash`), GA 2026-05-19; agentic/coding/tool-use, 1M/65k, no Computer Use. Source: Google AI for Developers.

---

## 20. ONE-PARAGRAPH SUMMARY FOR THE BUILDER

Build a deterministic, headless, strictly-typed text-adventure engine whose mechanics live entirely in pure code and whose content lives entirely in AI-generated, schema-validated data. Start with a fully-analyzable CYOA graph and prove the complete loop — AI writes a story, adapts it to a validated pack, the engine validates it, an AI plays every route through a structured legal-action API, records its experience, finds a flaw, fixes it, and locks the fix with a regression test — then graduate the same core to a Zork-style parser adventure with a controlled command model, then to Sierra-Quest puzzles, then to a Hero's-Quest stat/RPG hybrid, and only at the very end attach a human UI and (optionally) a renderer. The engine must satisfy the determinism contract at every stage, every content pack must pass the validator before it is playable, every engine extension must pass the §14 gate, and every bug must become a replayable artifact plus a regression test. Keep the engine small enough that the AI fully understands it, but strict enough that the AI cannot accidentally corrupt the game world.
