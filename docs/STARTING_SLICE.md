# Albany Winter Relief — Starting Slice Contract

Status: active product milestone  
Scope owner: Albany fresh journey → The Wolf-Winter → truthful Albany return  
Machine-readable ledger: [`starting_slice_causal_matrix.json`](starting_slice_causal_matrix.json)

## Product promise

This slice is AdventureForge's defining demo: a compact opening that establishes
the gameplay grammar and quality bar for everything built afterward, in the way
a great standalone demo can define the finished game.

The comparison target is **greater systemic role-playing depth and reactivity
per scene than Baldur's Gate 3 inside this bounded opening footprint**. It is an
engineering and playtest criterion, not a claim about total content volume.
More rooms, towns, prose, endings, or dormant flags do not satisfy it.

A choice counts as depth only when a reachable counterfactual changes
non-presentational state and later changes at least one of:

- legal actions or solution families;
- risk, resource pressure, or encounter state;
- NPC behaviour, availability, cost, or relationship state;
- failure recovery;
- an overworld service, scene, opportunity, or persistent outcome.

The player must see truthful feedback when the change happens and when it is
consumed. A text-only variant, score-only difference, duplicate route, mandatory
pickup, unused flag, or last-line ending label does not count.

## Fixed scope

Included:

- the fresh Albany journey and player-role introduction;
- Albany's six districts, their authored discovery, and preparation;
- the roads and travel pressure immediately surrounding Wolf-Winter;
- Cade's steading and every Wolf-Winter resolution family;
- the return to Albany and its mechanically changed state.

Excluded until this milestone is certified:

- new towns;
- unrelated quest ports or new quest chains;
- broad rewrites of the other eleven shipped quests;
- world-map growth used as a substitute for local depth.

A typical blind completion of the first Albany goal must remain at or below 45
meaningful decisions. Optionality, interaction, and consequences create depth;
mandatory length does not.

## Local canon and player role

Albany is a functioning civic and transport corridor serving hill communities
whose final miles still depend on stable yards, hand tools, and local knowledge
when winter closes roads or strands powered equipment. Rail, buses, I-90,
municipal counters, old byres, issued spears, and supernatural wildlife hazards
belong to one jurisdiction; Wolf-Winter is not a portal into an unrelated
fantasy world. The Albany relief spear is a repairable close-quarters livestock
defence tool issued to a courier, not evidence that the city ceased to be modern.

The player begins as a traveller registering under Albany's emergency relief
compact. Albany can provision and provisionally deputize that person, but the
player chooses who they were before the docket, what authority they accept, and
which promises bind them. Background is persistent lived history, not a class or
a separate game mode.

The starting cast grows from Albany's existing six district contacts and Cade:

| Character                             | Starting-slice agenda and memory                                                                                              |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Rowan Quill — Municipal Ledger        | Wants a defensible public record; remembers certified claims, lies, and unauthorized dispatch.                                |
| Jamie Tanner — Merchants Exchange     | Protects scarce winter stock; remembers purchases, coercion, credit, and diverted goods.                                      |
| Hayden Hale — Road Wardens            | Prioritizes corridor relief; remembers wagon promises and abandoned travellers.                                               |
| Reese Pryce — Ironhands Local         | Protects workers and the only repair shift; remembers which asset received it.                                                |
| Emery Sloane — Greenway Stewards      | Protects people without destroying the wildlife corridor; remembers evidence custody and needless killing.                    |
| Blair Drake — Survey College          | Wants accurate hazard evidence published; remembers findings shared or concealed.                                             |
| Old Cade — hill steading              | Protects household and cattle; remembers truth, demands, promises, trespass, and violence.                                    |
| June Pike — proposed Road Warden ally | Has independent relief priorities and can refuse, leave, improvise, or remain available according to trust and kept promises. |

At least five of these people must remain mechanically relevant after
Wolf-Winter. June is the initial ally grammar; implementation may rename her
only if the replacement preserves the same authored role and agency contract.

## Honest baseline — 2026-07-14

The engine foundation is unusually strong. A 6,000-step pre-change crawl reached
247/247 overworld nodes, 344/344 edges, all 12 boards, and entered all 12 quests.
Deterministic replay, save integrity, action legality, UI/MCP projection, blind
playtest receipts, and exhaustive journey proofs already have substantial
coverage.

Wolf-Winter is the strongest existing gameplay proof:

- preparation affects three linked fights;
- a failed rail check creates a salvage route;
- a risky saved-brace choice can beat or lose to the safe pin under different
  fixed rolls;
- saved wood creates an equal-score post-hunt tradeoff;
- three stable victory identities reach Albany's campaign presentation.

Relevant guards include
[`wolf_winter_cross_encounter_agency.test.ts`](../tests/regression/wolf_winter_cross_encounter_agency.test.ts)
and
[`wolf_winter_post_hunt_consequence.test.ts`](../tests/regression/wolf_winter_post_hunt_consequence.test.ts).

The current slice does **not** yet meet the full contract:

- Wolf-Winter is now withheld from Albany's FIFO discovery and requires one of
  three certified source packets, but the other visible Albany jobs/sites/events
  remain mostly one-click time/renown transactions;
- Albany authors four permanent registration profiles. Road-Warden and Ledger
  sponsorship now change the actual terms of their matching source packet, and
  the Road-Warden also retains its fieldcraft import; Ironhands Repairer and
  Unaffiliated Courier still need distinct preparation consumers before concept
  balance is proven;
- Wolf-Winter now exports explicit Old Cade memories and world facts, but those
  consequences do not yet change an Albany service, opportunity, or NPC action;
- fieldcraft and two certified knowledge reports now cross the trusted inbound
  boundary; health is deferred to protect the combat guarantee, and Albany
  equipment still needs an origin-honest quest-local representation before it
  can alter play;
- Wolf-Winter's successful routes still require defeating the same three wolves;
- most return reactivity is authored presentation routed through quest-specific
  campaign code rather than reusable state and consequences.

The causal ledger marks existing partial proofs honestly. No fork counts toward
the target until its later mechanical consumer and paired counterfactual test are
both present.

## Reusable foundation first

The first implementation sequence is:

1. **Campaign character state** _(foundation landed)_ — one versioned, validated
   campaign record: background, skills, values, health/wounds, equipment, money,
   abilities, knowledge, promises, crimes, NPC relationships, and faction
   standing.
2. **Quest boundary contract** _(inbound and outbound foundation landed)_ —
   inject allowlisted state into an embedded quest and fold back only validated,
   explicit changes without resetting the protagonist or leaking quest-local
   objects.
3. **Data-driven consequences** _(outbound boundary landed)_ — quest content
   declares reusable, validated character/world effects; campaign code consumes
   generic state rather than adding Wolf-specific ending conditionals.
4. **Authored Albany** — replace the visible slice's generic local transactions
   with scenes whose evidence, time, relationships, resources, and promises
   alter Wolf-Winter.
5. **Systemic Wolf-Winter** — combat, fully noncombat, and hybrid solutions share
   pressure state and produce truthful, mechanically distinct Albany returns.

The setting introduction must also explain the player's role and the coexistence
of contemporary New York infrastructure with the steading-scale TTRPG crisis.
That explanation must be playable context, not a lore dump.

Foundation status: campaign-character v1 now has strict canonical schemas,
deterministic cloning/serialization, overworld snapshot v9 persistence, explicit
v8 migration, full/UI read-only projection, bounded compact projection, and
tamper guards. A generic, monotonic quest-export catalog applies relationship
memories/floors and derives historical world facts from canonical outcome ids.
Wolf-Winter's three successful endings create distinct Old Cade memories and
byre/gate/timber facts; restore replays the character result, rejects forged
outcome/journal/state combinations, and fences prior manifests to one exact
migration target.

The trusted inbound boundary is also landed. Quest manifests declare strict,
pack-validated import rules; only the private overworld bridge supplies detached
campaign state; material imports occur before the opening observation and carry
a canonical receipt through save/hash/trace replay; public/direct starts remain
pack-default; and UI/MCP reset determinism is proven. Imported-only flags and
items participate in source validation, every catalog retains an
import-independent structural victory, and health imports are prohibited on a
`combat_guaranteed` pack until an authored minimum/recovery contract exists.
Wolf-Winter therefore maps `skill:fieldcraft` to its defence floor and the two
exclusive Albany reports to authored quest-local flags. The tempting Albany-kit
→ steading-brace alias remains rejected because it would lie about where saved
timber came from.

The first authored Albany increment is now landed. Speaking with Rowan after
the first civic lead writes a durable registration offer rather than relying on
an initial modal. The player chooses one of four complete canonical packages;
the choice survives save/restore, changes Rowan and the selected sponsor's
memory-conditioned responses, and crosses the private quest bridge. The
Road-Warden's Fieldcraft 4 raises Wolf-Winter's visible starting DEF from 3 to 4. With the same d20 roll of 7 at the broken paling, that profile braces the
rail while a Ledger Advocate at default DEF 3 splits it and receives the
authored bind-the-rail recovery action. Direct quest starts remain exact pack
defaults. Paired proof lives in
[`character_background_counterfactual.test.ts`](../tests/starting_slice/character_background_counterfactual.test.ts).

The second authored Albany increment replaces Wolf-Winter's FIFO reveal with a
blocking, irreversible source certification. Rowan's public docket costs no
time or money and preserves the established routes. Jamie Tanner's testimony
costs 35 minutes and $6, reduced to 15 minutes and $0 by Ledger sponsorship; it
alone opens a rail-free feed-hauler crawlboard into the established committed
loft drop after the yearling falls. Hayden Hale's report costs 20 minutes, reduced to 5 by
Road-Warden sponsorship; after a failed rail check it alone rewards leaving the
split rail unbound with an exposed high-variance frost-brace sequence. The
selection persists through save/restore. Each private report also changes its
source NPC's memory, crosses the trusted quest boundary, and is named at its
consumer; Rowan preserves the import-independent routes. Paired proof lives in
[`lead_source_counterfactual.test.ts`](../tests/starting_slice/lead_source_counterfactual.test.ts).

Legacy migration is deliberately fail-closed at this causal boundary. An
untouched registration-era save receives the real source prompt. Every progressed
post-registration suffix is rejected rather than being falsely certified as
source-free: mutable saves cannot prove that a zero-effect source decision was
not deleted before an otherwise plausible later action. Legacy source markers
are rejected for the same reason. Opaque pre-registration quest progress is also
rejected because it has no replayable registration-and-source path and would
otherwise load into an unwinnable starting-slice goal.

This proves `SS-F01-character-background` and `SS-F03-lead-source`: two of the
twelve required material forks. It does not prove that all four concepts are
mechanically balanced, that Albany preparation is broadly systemic, that combat
can be avoided, or that an early choice changes a return service. Those remain
the next work, not implied credit for source-specific combat routes.

## Required resolution families

The four primary signatures diverge during Albany preparation, not at the last
input:

| Signature             | Method                                                      | Principal costs and risks                                         |
| --------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------- |
| `hunt_and_hold`       | Prepared tactical combat against the pack                   | wounds, damaged gear, Greenway standing, and time                 |
| `lure_and_divert`     | Fully noncombat bait and spoor work that redirects the pack | market stock, route knowledge, and cattle risk if late            |
| `fortify_and_outlast` | Fully noncombat sealing and pressure management until dawn  | Works capacity, relief supplies, and exposed outer property       |
| `drive_and_evacuate`  | Hybrid noise/fire drive while moving cattle                 | wagon condition, ally trust, fatigue, and possible limited combat |

No preparation profile may dominate all four. Each family needs at least one
authored failure-forward recovery and a distinct persistent Albany aftermath.

## Depth Contract v1

Certification requires all of the following simultaneously:

1. At least 12 material fork sites. At least 8 have delayed consequences, 5
   cross system boundaries, and 3 cross an Albany/Wolf/return phase boundary.
2. At least four materially different non-death resolution strategies, including
   combat, fully noncombat, and hybrid routes with distinct prior actions, costs,
   risks, and aftermaths.
3. At least four viable character concepts and three preparation/build profiles;
   deterministic counterexamples prove that no profile or route dominates every
   reachable state.
4. At least five named NPCs remember specific conduct. Three have independent
   agendas, and two remain mechanically relevant after Wolf-Winter.
5. At least one ally relationship has independent agency: the ally can refuse,
   leave, disagree, or solve a problem differently because of remembered conduct.
6. At least one visible pressure system—time, weather, cattle safety, public
   trust, or relief capacity—has multiple thresholds and cross-system effects.
   It is never a hidden real-time trap.
7. Combat can be avoided, shortened, redirected, surrendered from, or transformed
   by earlier play. The mandatory three-kill golden path is removed.
8. Every failed check has an authored complication, altered route, or recovery;
   it never offers an unchanged repeat-until-success loop.
9. At least three irreversible tradeoffs have deterministic counterexamples
   showing either side can be advantageous under different reachable conditions.
10. At least three early decisions mechanically alter returned Albany state,
    including NPC availability, services/prices, resources, faction state,
    jobs/events, or the next opportunity.
11. Generic one-click Albany jobs and checklist events are absent from the
    visible slice; authored scenes replace them.
12. One playthrough cannot expose every meaningful scene, relationship state,
    resolution family, or outcome.

## Evidence contract

The causal matrix is the source of truth for counted forks. Each row records:

- the visible choice and phase;
- immediate state deltas;
- delayed mechanical consumers;
- player-visible feedback at both points;
- systems crossed and persistence boundaries crossed;
- paired deterministic counterfactual tests;
- implementation and proof status.

`counts_toward_contract` stays `false` until the implementation exists and its
test would fail if the delayed consumer were removed. Planned rows are design
commitments, not evidence.

Required proof:

- paired counterfactual tests for every counted fork;
- end-to-end traces for every resolution family and at least three seeded
  failure-forward routes;
- schema validation, a negative fixture, and a synthetic or second-quest proof
  for every new reusable consequence primitive;
- save/restore, seed determinism, compact/full MCP parity, UI parity, action
  legality, journey proofs, and the documented fail-closed legacy snapshot
  compatibility boundary;
- `npm run crawl:smoke` before and after every increment;
- one canonical pure fresh-overworld blind playtest and `npm run health` before
  each green commit;
- milestone `npm run crawl:deep -- --seconds 120 --workers 8` and a current
  100-player pure fleet.

Final experiential evidence requires at least 90% verified first-goal completion,
got-stuck at or below 5%, mean clarity and enjoyment at least 4.2, and at least
70% continuation at the first completion choice. At least three solution
signatures must arise organically, no one signature may exceed 75% of completed
runs, no S3/S4 starting-slice issue may remain, and no recurring S2 cluster may
affect 5% or more of runs.

## Increment discipline

Each increment must create one reusable or player-visible causal improvement,
update the matrix truthfully, preserve unrelated work, pass the repository's
gates, produce a fresh pure report, and prepend a terse result to
`AI_LOOP_STATE.md`. Green increments may be committed locally on a short-lived
branch; they are not pushed or proposed for merge without explicit instruction.

The milestone is complete only when current evidence proves every contract item.
Until then, the next move is the highest-leverage missing foundation inside this
fixed slice—not another map node, quest port, or prose-only branch.
