# Albany Winter Relief — Starting Slice Contract

Status: `active_unproven` — structural depth is proven; fleet certification is not

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

The proof-hashed opening goal remains “Find one local lead in Albany and see it
through.” Shared player guidance states the mechanical boundary separately:
completing one Albany quest satisfies the goal, while jobs, events, and sites
may reveal leads but do not finish it themselves.

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

| Character                         | Starting-slice agenda and memory                                                                                                                                        |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rowan Quill — Municipal Ledger    | Wants a defensible public record; remembers certified claims, lies, and unauthorized dispatch.                                                                          |
| Jamie Tanner — Merchants Exchange | Protects scarce winter stock; remembers purchases, coercion, credit, and diverted goods.                                                                                |
| Hayden Hale — Road Wardens        | Prioritizes corridor relief; remembers wagon promises and abandoned travellers.                                                                                         |
| Reese Pryce — Ironhands Local     | Protects workers and the only repair shift; remembers which asset received it.                                                                                          |
| Emery Sloane — Greenway Stewards  | Protects people without destroying the wildlife corridor; remembers evidence custody and needless killing.                                                              |
| Blair Drake — Survey College      | Wants accurate hazard evidence published; remembers findings shared or concealed.                                                                                       |
| Old Cade — hill steading          | Protects household and cattle; remembers truth, demands, promises, trespass, and violence.                                                                              |
| June Pike — Road Warden ally      | Has independent cattle-first authority; she can refuse unequal terms, leave after the first wolf death, solve herd pressure differently, and change return opportunity. |

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
- Cade's finite feed now supports a fully noncombat three-encounter route and a
  bounded one-fight hybrid recovery;
- cattle alarm is a visible three-band pressure track whose threshold changes
  cattle survival, ending identity, Albany memory, and a later service;
- a risky saved-brace choice can beat or lose to the safe pin under different
  fixed rolls;
- saved wood creates an equal-score post-hunt tradeoff whose world fact now
  changes a one-time Albany service;
- Albany's dawn dispatch creates a mutually exclusive return fork between
  Jamie's Market resupply credit and Emery's Greenway rest claim;
- eleven truthful non-death victory identities reach Albany's campaign
  presentation.

Relevant guards include
[`wolf_winter_cross_encounter_agency.test.ts`](../tests/regression/wolf_winter_cross_encounter_agency.test.ts)
and
[`wolf_winter_post_hunt_consequence.test.ts`](../tests/regression/wolf_winter_post_hunt_consequence.test.ts).

The current slice now satisfies the twelve-fork structural proof threshold, but
it is **not yet milestone-certified**:

- Wolf-Winter is now withheld from Albany's FIFO discovery and requires one of
  three certified source packets. Albany Works and Civic are the first two of
  six district jobs converted to authored scenes. Works' exclusive return
  priority can cross a 13-standing threshold for a Civic recovery cot; Civic's
  first authored event fixes a public-or-protected policy before Wolf-Winter,
  then its return docket exposes exactly one lawful closure from that policy
  and the truthful held-or-evacuated outcome. Four jobs and five checklist
  events remain generic;
- Albany authors four permanent registration profiles. Road-Warden and Ledger
  sponsorship now change the actual terms of their matching source packet, and
  the Road-Warden retains its fieldcraft import. Ironhands Repairer,
  Unaffiliated Courier, and Ledger Advocate now also have distinct Repair,
  Streetwise, and Mediation preparation consumers; broader balance across all
  four completed resolution families remains unproven;
- June Pike now supplies the first persistent ally grammar: her visible
  cattle-first contract, subordinate-role refusal, independent Wolf action,
  first-wolf-death departure, promise state, testimony, and Station opportunity all
  replay across the Albany/quest boundary. The wider cast still needs more
  independent agendas and mechanically changed availability;
- Wolf-Winter's saved-wood and clean living-pack facts now change Albany
  services, but its remaining Cade memories and loss facts still lack later
  opportunity consumers;
- fieldcraft now crosses the trusted boundary into both defence and the visible
  lure check, two certified reports alter combat routes, and three preparation
  skills change distinct checks or recoveries; campaign health remains outside
  the combat import to protect its guarantee, but the gate wound now exports
  back into persistent health and Cade's finite drive rig provides an
  origin-honest quest-local equipment pattern;
- prepared combat, fully noncombat diversion, bounded mixed recovery,
  drive/evacuate, and fortify/outlast now supply four distinct resolution
  families; all twelve counted forks have paired deterministic proof, while
  fleet-level strategy balance and the final numeric quality bar remain
  unproven;
- Wolf-Winter now starts through one visible, replay-bound hill-route choice
  whose exact time, supplies, fatigue, Hayden memory, quest import, first-cast
  risk, cattle pressure, ending, and return record diverge. A separate Station
  dispatch now spends Albany's last relief wagon and crew on exactly one of
  three named needs, changing the field or the truthful return. The opening
  relief oath now has paired proof for three binding terms, three different
  field consumers, unchanged failure recoveries, promise resolution, and three
  conditional return services;
- four early decisions now drive replay-bound services through reusable
  world-fact, story-choice, companion, and promise predicates, but the other
  return facts still lack mechanical NPC and opportunity consumers.

The causal ledger marks all twelve material forks as structurally proven. That
does not certify the greater-than-BG3 target: certification still requires the
current deep crawl, 100-player pure fleet, numeric thresholds, and severity
audit named below.

## Reusable foundation first

The first implementation sequence is:

1. **Campaign character state** _(foundation landed)_ — one versioned, validated
   campaign record: background, skills, values, health/wounds, equipment, money,
   abilities, knowledge, promises, crimes, NPC relationships, companions, and
   faction standing.
2. **Quest boundary contract** _(inbound and outbound foundation landed)_ —
   inject allowlisted state into an embedded quest and fold back only validated,
   explicit changes without resetting the protagonist or leaking quest-local
   objects.
3. **Data-driven consequences** _(outbound boundary and first service consumer
   landed)_ — quest content declares reusable, validated character/world
   effects; campaign code consumes generic state rather than adding
   Wolf-specific ending conditionals.
4. **Authored Albany** _(2/6 district jobs and 1/6 events converted)_ — replace
   the visible slice's generic local transactions with scenes whose evidence,
   time, relationships, resources, and promises alter Wolf-Winter and its
   return.
5. **Systemic Wolf-Winter** — combat, fully noncombat, and hybrid solutions share
   pressure state and produce truthful, mechanically distinct Albany returns.

The setting introduction must also explain the player's role and the coexistence
of contemporary New York infrastructure with the steading-scale TTRPG crisis.
That explanation must be playable context, not a lore dump.

Foundation status: campaign-character v1 now has strict canonical schemas,
deterministic cloning/serialization, overworld snapshot v9 persistence, explicit
v8 migration, full/UI read-only projection, bounded compact projection, and
tamper guards. A generic quest-export catalog applies relationship
memories/floors and derives historical world facts from canonical outcome ids;
character-conditioned effects additionally resolve promises and add or remove
companions in canonical completion order.
Wolf-Winter's eleven non-death endings create distinct Cade, Emery, and Hayden
memories plus byre/gate/timber/wolf/cattle/property/relief-stock facts; restore replays the character result,
rejects forged outcome/journal/state combinations, and fences prior manifests
to one exact migration target. Generic campaign service rules can now consume
those trusted facts or canonical story choices at an authored town and area,
project an optional same-district named provider, expose bounded one-time terms,
and bind consumption to replayed journal evidence across save/restore.

The trusted inbound boundary is also landed. Quest manifests declare strict,
pack-validated import rules; only the private overworld bridge supplies detached
campaign state; material imports occur before the opening observation and carry
a canonical receipt through save/hash/trace replay; public/direct starts remain
pack-default; and UI/MCP reset determinism is proven. Imported-only flags and
items participate in source validation, every catalog retains an
import-independent structural victory, and health imports are prohibited on a
`combat_guaranteed` pack until an authored minimum/recovery contract exists.
Wolf-Winter therefore maps `skill:fieldcraft` to its defence floor and its
publicly visible lure check, and maps the two exclusive Albany reports to
authored quest-local flags. The tempting Albany-kit
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
costs 35 minutes and $6, reduced to 15 minutes and $0 by Ledger sponsorship. Without
committing Cade's finite feed plan, it alone opens the feed-hauler crawlboard as a
rail-free combat drop after the yearling falls. Cade can independently teach the same
physical board only as the second cast of his irreversible nonlethal plan; that local
instruction neither imports Jamie's evidence nor grants Jamie's combat opening. Hayden
Hale's report costs 20 minutes, reduced to 5 by
Road-Warden sponsorship; after a failed rail check it alone rewards leaving the
split rail unbound with an exposed high-variance frost-brace sequence. The
selection persists through save/restore. Each private report also changes its
source NPC's memory, crosses the trusted quest boundary, and is named at its
consumer; Rowan preserves the import-independent routes. Paired proof lives in
[`lead_source_counterfactual.test.ts`](../tests/starting_slice/lead_source_counterfactual.test.ts).

The informed-dispatch follow-up keeps that causal structure while removing a
blind planning interval exposed by the first authenticated fleet diagnostic.
Before registration binds, the journey surface reuses Wolf-Winter's authored
discovery as a concrete mission preview and names the five-decision dispatch
plan in plain role, duty, evidence, preparation, and relief-allocation terms.
Each later prompt identifies the completed and still-open decisions, while the
fifth preserves June Pike's optional field-team follow-up. Source certification
now reveals the real quest card and a compact, authored cost/tradeoff comparison
of both hill approaches while the preparation choice is pending; full tactical
route detail remains on the actual launch choice. Preparation and relief
allocation remain mandatory launch gates. Exact pending-preparation saves from
the earlier timing are normalized by certified source and offer proofs, while a
resolved save with the discovery removed remains invalid. Presentation and state proof live in
[`opening_dispatch_briefing.test.ts`](../tests/starting_slice/opening_dispatch_briefing.test.ts),
[`lead_source_counterfactual.test.ts`](../tests/starting_slice/lead_source_counterfactual.test.ts),
and
[`opening_preparation_snapshot_integrity.test.ts`](../tests/regression/opening_preparation_snapshot_integrity.test.ts).

Legacy migration is deliberately fail-closed at this causal boundary. An
untouched registration-era save receives the real source prompt. Every progressed
post-registration suffix is rejected rather than being falsely certified as
source-free: mutable saves cannot prove that a zero-effect source decision was
not deleted before an otherwise plausible later action. Legacy source markers
are rejected for the same reason. Opaque pre-registration quest progress is also
rejected because it has no replayable registration-and-source path and would
otherwise load into an unwinnable starting-slice goal.

The third authored increment makes Wolf-Winter's equal-score timber decision
matter after the return. Carrying sound guard wood into dawn returns Hayden's
unused repair-wagon stores for a one-time 15-minute Station Quarter resupply;
committing that wood to the cattle gate releases a one-time 15-minute Road
Warden rest cot instead. The alternative remains the ordinary 45-minute
resupply or 180-minute minimum rest. Full, compact, and UI views state the cause
and terms before use; a rule-and-area journal proof consumes the offer through
save/restore. Paired reachable states prove that neither branch dominates:
retained timber wins when supplies are low, while the barred gate wins after
identical road strain creates fatigue. Proof lives in
[`saved_wood_world_state_counterfactual.test.ts`](../tests/starting_slice/saved_wood_world_state_counterfactual.test.ts).

The fourth authored increment makes Albany's post-Wolf allocation mechanically
real. Sending the only dawn wagon back to Cade leaves the player carrying
Hedrick's packet alone and causes Jamie Tanner to hold a one-time Market
road-store credit: a 15-minute resupply instead of 45. Sending the wagon and
wardens north causes Emery Sloane to hold a mutually exclusive Greenway
watch-shelter claim: a 15-minute rest instead of 180. Both terms are visible
before commitment; the selected goal remains their trusted source even after it
moves into goal history. Full, compact, UI, save/restore, migration, and causal
replay proofs reject contradictory branches or retroactive service use. The
paired runs visit all six Albany districts, use the same Wolf-Winter strategy
and ending, and differ only at the dispatch. Proof lives in
[`albany_return_counterfactual.test.ts`](../tests/starting_slice/albany_return_counterfactual.test.ts).

The fifth authored increment removes the mandatory three-kill path. Cade gives
a free explanation before a separate, explicit commitment of one finite
winter-feed sack across the paling, loft, and outer scent gate. A reusable
`pressure_tracks` authoring primitive projects the ordinary `cattle_alarm`
variable as Steady, Restless, or
Breaking in full MCP, compact MCP, and the browser. A clean route leaves every
wolf alive and the herd whole. A failed first cast cannot repeat: spending a
failed split rail preserves the noncombat route but loses two cattle, while
fighting only the yearling creates a truthful mixed ending with the other two
wolves alive and the same cattle loss. Each identity has distinct Cade/Emery
memory and world facts; only the all-alive, whole-herd return unlocks Emery's
one-time Greenway nonlethal-response cache. Same-character/source/seed paired
proof, RPG save/replay, journey foldback, compact/full/UI parity, overworld
restore, and service consumption live in
[`wolf_strategy_return_e2e.test.ts`](../tests/starting_slice/wolf_strategy_return_e2e.test.ts).

The sixth authored increment makes Albany preparation a durable, finite choice
instead of a promise in the matrix. After source certification, every one of the
four backgrounds can select any of three affordable specialist packets. Reese's
Works sequence replaces the public paling wedge with a Repair check and turns a
miss into a noisy deterministic cold-set. Emery's drover route creates a
one-shot Streetwise recovery after a failed first lure cast. Jamie's relief
protocol creates a one-shot Mediation pressure adjustment only after the public
split-rail recovery. The three plans import as knowledge plus their actual
background skill, remember their providers, retain direct-start defaults, and
do not add or relabel an ending. On a truthful held-byre return they respectively
unlock one 15-minute Works resupply, Campus rest, or Civic resupply. Paired
reachable low-supply and fatigue states include preparation cost, shortest
Albany relocation, and both alternatives' best matching service; each plan
beats both others somewhere and none dominates globally. The irreversible
choice is replay-locked for all profiles. The representative Drover route
proves overworld restore, RPG save/replay, quest foldback, full/compact MCP,
and browser-engine parity; paired core proofs cover all three consumers and
return services. Proof lives in
[`preparation_profiles_counterfactual.test.ts`](../tests/starting_slice/preparation_profiles_counterfactual.test.ts)
and
[`preparation_profiles_return_e2e.test.ts`](../tests/starting_slice/preparation_profiles_return_e2e.test.ts).

The seventh authored increment makes June Pike a persistent ally rather than a
proposed cast note. After preparation, the Station Quarter presents three exact
terms: spend 15 minutes and grant June cattle-first authority, spend 5 minutes
asking for a subordinate relay that she refuses, or leave solo without delay.
Direct departure without contacting her also stays truthfully solo. The accepted
contract records June as a companion plus an active promise and imports only
that state into Wolf-Winter. Before June permits an uncommitted crossing into
the paling, she holds the north gate and states that Cade's ordinary rail is a
hunt-and-hold combat funnel whose first wolf death ends her agreement. Keeping the
cattle-first terms leaves lure, drive, and fortification available; explicit
acknowledgement opens the disclosed uncommitted crossing, while living commitments
remain available until crossing. If a committed lure's one
feed cast fouls, either a successful brace turned into a scent-pen or the
existing failed-rail bind recovery redirects the yearling alive with distinct
provenance. The ordinary rail remains combat-only. A first spear strike after
the fouled lure irreversibly commits the hybrid line and retires every living
recovery; June's agreement breaks only when the wolf dies. On a living recovery, June's
named legal conversation blocks the final cast until she refuses the old-grey
line, independently takes the lower cattle rail, and lowers cattle alarm by 1.
That changes the identical route from a scattered herd to a whole-herd return.
The first wolf death removes the action but preserves hybrid/combat completion, then
resolves the promise broken and June out of the party. Clean cooperation,
negotiated refusal, explicit solo, and relationship loss produce distinct
memories, Station testimony, and one-time service availability. Companion and
promise state, chronological quest replay, RPG import receipts, overworld and
RPG save/restore, and full/compact/UI parity are tamper-checked. Proof lives in
[`ally_commitment_counterfactual.test.ts`](../tests/starting_slice/ally_commitment_counterfactual.test.ts)
and
[`ally_content_gameplay.test.ts`](../tests/starting_slice/ally_content_gameplay.test.ts),
with the paired rail proof in
[`wolf_strategy_counterfactual.test.ts`](../tests/starting_slice/wolf_strategy_counterfactual.test.ts).

The eighth authored increment adds `drive_and_evacuate` as a complete third
resolution family rather than renaming the failed-lure hybrid. Cade first
explains, then takes an explicit mutually exclusive commitment to a finite
two-charge signal-and-rope plan. Its preview discloses that committing starts
the moving herd immediately: preparation and the outer yard close behind the
player, and the route can no longer switch to lure or spear combat. The player
also knowingly forfeits the steading's outer defense line on every completion
so the moving herd and pack can separate. The player turns the yearling at the
broken paling and the flank wolf at the byre door while the visible Pack Drive
track advances. A missed opening cannot be retried: it reaches Crisis early and
opens one authored loose-hurdle recovery. At the byre mouth, the player must choose
one irreversible priority before the only matching evacuation becomes legal:
keep the whole herd and returned rig by taking an untreated gate wound, save
every person and return the rig while two cattle scatter, or keep people and
the whole herd unharmed by sacrificing the rig. All three drive the living pack
away bloodlessly. June, when present, first exercises her remembered
cattle-first authority at the lower gate. The hard commitment withholds every
enemy and combat action before the first signal, through failed-signal recovery,
and at the threshold. The ordinary spear route remains available only when the
player declines the drive before the cattle move, so combat cannot be sampled
and folded back into a bloodless ending.

The three endings export distinct cattle, wound, and reserve facts. The wound
crosses into persistent campaign health, while returned-rig and whole-herd
facts independently gate one-time Station rest and Greenway resupply offers.
June and Emery retain outcome-specific testimony. Same-boundary proofs vary
only the ending and preserve those differences through chronological journey
foldback, current/predecessor snapshot integrity, full/compact MCP, UI, and
service consumption. Proof lives in
[`crisis_priority_counterfactual.test.ts`](../tests/starting_slice/crisis_priority_counterfactual.test.ts)
and
[`drive_crisis_return_counterfactual.test.ts`](../tests/starting_slice/drive_crisis_return_counterfactual.test.ts).

The ninth authored increment completes `fortify_and_outlast` and rewrites
`SS-F08-cade-trust` as an honest conduct fork. Cade discloses two mutually
exclusive stances before commitment: accept his household boundary and take two
shutters with his failed-seal help, or invoke lawful Albany authority and take
finite public relief seals while he refuses that recovery. The commitment
closes lure, drive, preparation, retreat, and combat. A visible Winter Siege
track then advances through an outer repair and a separate threshold seal. The
outer Repair check is one-shot: a miss raises pressure and opens only the
stance-specific deterministic recovery, never an identical retry. June, when
present, independently holds the lower cattle brace without erasing or changing
the siege pressure. Both routes outlast all three living wolves and keep the
whole herd safe.

Cade's route truthfully leaves outer property exposed and returns Albany's
public seals unused; the authority route protects that property by spending the
public seals and records Cade's refusal. Two endings export those facts into
distinct Cade, Hayden, and June memories, every Albany dawn dispatch preserves
the selected cost, and Hayden offers a mutually exclusive Station resupply or
rest. Best/worst repair, solo/June, RPG save/replay, chronological foldback,
full/compact/browser parity, current/predecessor migration, and one-use service
consumption are covered by
[`cade_trust_counterfactual.test.ts`](../tests/starting_slice/cade_trust_counterfactual.test.ts)
and
[`fortify_outlast_return_e2e.test.ts`](../tests/starting_slice/fortify_outlast_return_e2e.test.ts).

The tenth authored increment turns `SS-F07-hill-route` into the actual
Wolf-Winter launch instead of adding a detached travel menu. Hayden's Station
Quarter dispatch presents two exact commitments on the quest card. The exposed
ridge costs 30 minutes, one supply, and 25 fatigue. Its open crest reveals the
crosswind, lowering the first feed cast to DC 10, but the visible descent starts
cattle alarm at 1. The sheltered stockway costs 75 minutes, two supplies, and
10 fatigue. Its lee keeps the herd calm at arrival but conceals the crosswind,
leaving the first cast at DC 12. Both cards disclose actual cost, projected
arrival time, remaining supplies, resulting fatigue/condition, known field
effect, and any blocked reason before commitment.

Choosing either card is the quest-start decision itself. A generic atomic
launch contract prepares the route's resource and campaign-character effects,
boots the embedded RPG from that post-choice state, and only then commits one
route-qualified journey action. Exactly one route knowledge and Hayden memory
persist; the generic campaign import catalog produces exactly one quest flag
and one legal last-mile action. Direct structural starts retain the old neutral
entry, while contradictory route flags fail closed. The route action replaces
the old first local movement input, so it adds systemic optionality without
raising first-goal length.

The human UI and pure MCP share that session-owned launch. MCP names the normal
player bridge `start_overworld_session_quest`; compact `context.quest_starts`
lists its exact currently executable quest-and-approach tuples. `start_world_quest`
bypasses that state and remains a structural QA drop-in, never a pure-play action.

At seed 9 the ridge's DC 10 cast succeeds while the stockway's DC 12 cast fails
and enters the authored no-retry split-rail recovery, proving the faster route's
advantage. At seed 26 both casts succeed, but the ridge's clean three-cast line
reaches alarm 4 and scatters two cattle while the stockway reaches alarm 3 and
keeps the whole herd, proving the sheltered route's advantage. Launch costs,
proof boundary, relationship memory, import receipt, outcome, and exact return
summary survive RPG/overworld replay, chronological foldback, full/compact MCP,
browser and CLI parity, and exact F11 migration. Proof lives in
[`hill_approach_gameplay.test.ts`](../tests/starting_slice/hill_approach_gameplay.test.ts),
[`hill_approach_return_e2e.test.ts`](../tests/starting_slice/hill_approach_return_e2e.test.ts),
and
[`hill_approach_migration_integrity.test.ts`](../tests/regression/hill_approach_migration_integrity.test.ts).

The eleventh authored increment turns `SS-F06-relief-allocation` into a finite
public-capacity decision rather than a decorative reserve meter. After
preparation, reaching the Station Quarter auto-offers the dispatch before the
optional June contact, so direct no-contact and explicit solo departures remain
valid. Albany has one unassigned winter-relief wagon and crew. Every option
costs five minutes, and every card names both what it protects and the two needs
left exposed: send Emery's fodder and drovers to Cade's herd, keep Jamie's
Market warm room staffed for vulnerable residents, or hold Hayden's wagon as a
mobile failure crew. The selection is blocking, irreversible, and mutually
exclusive; it records one allocation knowledge, one provider memory, one
journey decision, and no invented stock meter.

Each allocation has a different delayed consumer. Cade's pre-feed changes only
a successful first lure cast from the exposed ridge: at seed 26 it suppresses
one ordinary cattle-alarm step, reaching alarm 3 and the whole-herd ending where
the identical resident allocation reaches alarm 4 and scatters two cattle. It
does not create feed, a retry, or protection from a fouled cast or the sheltered
route. The resident allocation adds no Wolf action; after a return carrying the
trusted `fact:wolf_winter_byre_held` outcome, its exact story-choice proof opens
one 15-minute Market fatigue recovery instead of the ordinary 240-minute rest.
The mobile allocation imports one failure-crew flag. Only after the first
fortification seat has failed and Cade's help or Albany's emergency strip has
already recovered that same seam can the crew act once, lower Winter Siege
pressure by 1, preserve the failed-check and stance-cost record, and reach a
truthful mobile-stabilized dawn branch. On the same byre-held return, its exact
choice proof instead opens one 15-minute Campus resupply instead of the ordinary
45-minute service. Thus resident shelter and mobile reserve are advantageous in
different return states, while Cade's wagon is advantageous on the clean
exposed-ridge lure line; none gates hunt, lure, drive, or fortify commitment.

Allocation offer, five-minute cost, provider memory, quest import, field
consumer, return fact, and service eligibility replay across save/restore and
the overworld-to-quest-to-overworld boundary. Exact F12 predecessor saves have a
bounded migration path: an unstarted Wolf-Winter save receives the real current
offer with no retroactive effect. If that save already selected June, the later
allocation composes after the preserved ally proof and a second restore retains
both the ally commitment and allocation effects. A started save instead keeps
its exact approach proof and receives one neutral legacy marker bound to the
pre-start boundary, without allocation knowledge, memory, time, field aid, or
service. Paired proof lives in
[`relief_allocation_counterfactual.test.ts`](../tests/starting_slice/relief_allocation_counterfactual.test.ts),
and the predecessor boundary lives in
[`relief_allocation_migration_integrity.test.ts`](../tests/regression/relief_allocation_migration_integrity.test.ts).

The twelfth authored increment proves `SS-F02-relief-oath` as the final counted
fork. Immediately after permanent registration
and before source certification, Rowan requires one exact Wolf-Winter term. Full
Compact Duty costs ten minutes and records public duty, Relief Compact standing,
Rowan's official memory, a boundary-annex knowledge import, and an active
full-duty promise. Aid-Only Duty costs five minutes and records bounded
authority, limited Compact standing, Rowan's negotiated memory, a witnessed-count
knowledge import, and an active limited promise. The Unaffiliated Personal Bond
costs no time and records voluntary aid, Independent Carriers standing, Rowan's
personal-bond memory, an ash-lane knowledge import, and an active return promise.
Each term is a dispatch obligation, not a replacement background or sponsor, and
the source screen cannot appear until one has been selected.

The three field consumers are narrow and nonexclusive. Full Duty lowers only the
first Albany-authority public-seal Repair check by 2 DC: ordinary DC 14 becomes
12 and Works-prepared DC 12 becomes 10. Cade still refuses the failed-seat hand,
the attempt and public stock are still spent, and the Albany-strip recovery is
unchanged. Aid-Only suppresses only the final ordinary +1 cattle-alarm step on a
wholly bloodless lure; it erases no approach pressure, failed cast, or recovery
cost. The Unaffiliated Bond lowers only the first drive
shutter from DC 12 to 10; its finite charge, miss pressure, no-retry rule, and
loose-hurdle recovery stay intact. Hunt, lure, drive, fortify, June, and solo
play remain legal under all three terms. An oath changes advantage and
accountability, not the set of available strategy families.

Return foldback closes the promises truthfully. Full Duty is kept on its lawful
line and broken if the player substitutes Cade's household shutters for the
required public-seal fortification. Aid-Only is kept unless the player invokes
Albany property authority, which releases the narrow promise with Rowan's bend
memory. The Unaffiliated Bond is kept unless that same authority claim breaks
it. If the permanent background is Unaffiliated Courier, its separate
registration emergency-tag promise also closes as kept on any truthful
Wolf-Winter return, regardless of the selected dispatch term; other backgrounds
never acquire that promise. A kept oath promise plus the matching outcome facts can open one bounded
15-minute service: a Civic resupply audit after lawful full-duty authority
fortification, a Market rest after an aid-only living-pack/whole-herd return, or
a Greenway resupply after a qualifying unaffiliated living-drive returned-rig
line. Nonmatching outcomes and bent or broken promises do not receive those
services. Equivalent same-counter claims do not duplicate stock or recovery:
Jamie's Relief Protocol consolidates with the full-duty Civic cache, the
Resident Shelter cot consolidates with the aid-only Market rest, and a
whole-herd drive consolidates the unaffiliated returned-rig claim with Emery's
existing Greenway cache. Each oath card discloses that consolidation before the
player commits.

Unit, schema, chronology, and UI evidence covers the authored choice, durable
character effects, journal ordering, lead-source handoff, generic value and
faction floors, and the three-card presentation. The dedicated paired
field/return proof at
[`relief_oath_counterfactual.test.ts`](../tests/starting_slice/relief_oath_counterfactual.test.ts)
uses identical rolls to isolate all three consumers, proves established
miss/recovery paths remain intact, resolves kept/released/broken promises, and
checks positive and negative eligibility for every conditional service. Exact
predecessor migration, anti-relabel rejection, repeated restore, and the shared
Independent Carriers standing case live in
[`relief_oath_migration_integrity.test.ts`](../tests/regression/relief_oath_migration_integrity.test.ts).
The causal row is therefore `implemented`, `proven`, and counted.

This proves `SS-F01-character-background`, `SS-F02-relief-oath`, `SS-F03-lead-source`,
`SS-F04-ally-commitment`, `SS-F05-preparation-profile`,
`SS-F06-relief-allocation`, `SS-F07-hill-route`, `SS-F08-cade-trust`,
`SS-F09-wolf-strategy`, `SS-F10-crisis-priority`, `SS-F11-saved-wood`, and
`SS-F12-albany-return`: all twelve required material forks. It proves
the ally-agency clause, three preparation profiles, all four resolution
families, and distinct consumers for all four concepts. It does not yet prove
fleet-level balance, verified player-completion/clarity/enjoyment/continuation
thresholds, or the absence of recurring severe issues. Those remain the next
work; twelve deterministic fork proofs are necessary evidence, not final
greater-than-BG3 certification.

## Required resolution families

The four primary signatures must diverge well before the last input. The current
combat and lure routes diverge at Cade; Albany preparation now changes their
opening checks, recoveries, pressure, and return services without turning
background into a class lock:

| Signature             | Method                                                      | Principal costs and risks                                   |
| --------------------- | ----------------------------------------------------------- | ----------------------------------------------------------- |
| `hunt_and_hold`       | Prepared tactical combat against the pack                   | wounds, damaged gear, Greenway standing, and time           |
| `lure_and_divert`     | Fully noncombat bait and spoor work that redirects the pack | market stock, route knowledge, and cattle risk if late      |
| `fortify_and_outlast` | Fully noncombat sealing and pressure management until dawn  | Works capacity, relief supplies, and exposed outer property |
| `drive_and_evacuate`  | Two-charge signal-and-rope drive while evacuating the herd  | untreated wound, scattered cattle, or sacrificed relief rig |

No preparation profile may dominate all four. Each family needs at least one
authored failure-forward recovery and a distinct persistent Albany aftermath.
All four families now have end-to-end proof. The drive uses two finite spatial execution beats, a visible
pressure threshold, a disclosed no-errand spatial commitment, an authored
failed-check recovery, and a three-way crisis;
it is distinct from the failed-lure one-fight recovery. Fortification uses two
mutually exclusive conduct/resources, a one-shot Repair check, stance-specific
failure recovery, a separate threshold seal, and truthful property/public-stock
aftermath; it is not another lure, drive, or last-action label.

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
6. At least one visible pressure system—time, weather, cattle safety, winter
   siege, or pack drive—has multiple thresholds and cross-system effects.
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

Depth Contract #11 remains open. Albany Works proves the reusable authored-job
grammar, one exclusive post-return priority, and a delayed 13-standing Civic
service consumer. Civic adds the reusable authored-event grammar: equal
pre-Wolf terms bind a public-or-protected charter policy, and the post-Wolf job
selects exactly one of four policy/outcome closures with outcome-dependent
duration and policy-dependent standing. The paired held/evacuated, restore,
migration, replay, and surface
proof is
[`winter_return_docket_counterfactual.test.ts`](../tests/starting_slice/winter_return_docket_counterfactual.test.ts).
Four generic district jobs and five checklist events are still visible.

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

### Authenticated milestone fleet

Before spending live-player tokens, fleet preflight freezes the full tracked Git
commit and the canonical fresh-overworld world id/hash. The tracked worktree must
be clean; a dirty tree or Git/provenance error fails before launch. Untracked
notes do not dirty this check. It also freezes the contiguous planned seed range,
current journey contract, default pure fresh-overworld player contract, and the
repository-standard homogeneous Codex `gpt-5.6-terra` model plan.

Spark is the ordinary live fleet launcher's default so routine blind feedback
uses the dedicated Spark allowance. The canonical certification workflow pins
Terra explicitly for both pilot and authority. Exact homogeneous Sol, Terra,
Luna, and Spark plans can certify; Codex aliases, fallback, and mixing are forbidden.
Claude/Sonnet must be selected explicitly, while Claude `mix`, Haiku, and Opus
remain diagnostic. Before the 100-player spend, a fresh ten-player homogeneous
pilot must pass this go/no-go pair:

```bash
npm run fleet -- --provider codex --model gpt-5.6-terra --count 10 --concurrency 4 --seed-base <fresh-pilot-seed-base> --label <fresh-pilot-label> --no-resume --max-retries 0
npm run starting-slice:pilot -- --fleet ai-runs/fleet/<fresh-pilot-label>
```

The pilot requires all ten primary reports to authenticate without resume,
retry, recovery, or failed attempts; ten unique game and provider sessions; one
exact provider-evidence model value; recognized Wolf-Winter
outcomes; at least three organic strategy families; and no family above 7/10.
It also evaluates the slice's completion-speed, clarity, enjoyment,
continuation, stuck, and severity gates. A passing pilot is readiness evidence,
never milestone certification. If the later authority cohort resolves to a
different exact provider model id, run a new pilot before treating that cohort
as comparable. The authority checker validates only the submitted 100-member
bundle; retaining and reviewing the corresponding fresh same-model pilot is an
explicit operational prerequisite rather than an automatically linked authority
field.

Only after that pilot passes, launch the canonical authoritative cohort:

```bash
npm run fleet -- --provider codex --model gpt-5.6-terra --count 100 --concurrency 4 --seed-base <fresh-seed-base> --label <fresh-label> --no-resume --max-retries 0
```

A live fleet label must be fresh and its bundle is a closed cohort; an existing
label directory is rejected rather than appended to or mixed with stale rows.
Resume is enabled by default for diagnostic fleets and may reuse a report only
after reverifying its report and
evidence sidecar: sidecar schema v2, the current journey contract, exact planned
seed, and the exact clean commit and world id/hash must all match the frozen
cohort. Generic evidence readers retain historical schema-v1 readability, but v1
evidence cannot enter or resume this cohort. Manifest rows expose the
authenticated seed, build, world, and canonical quest outcomes so a bundle can
be audited independently. They also retain every ordered launcher attempt and
classify timeouts, launcher/run failures, verifier failures, and success. Before
a retry can overwrite its prefix, all failed artifacts and a diagnostic are
copied into a digest-indexed per-attempt bundle archive. Summary failure and
timeout counts are recomputed from all histories. An eventual success therefore
leaves that label non-certifying. Resume-enabled bundles and skipped slots are
also non-certifying; a new authoritative label must use
`--no-resume --max-retries 0` and run every slot exactly once. A recovered final
report is declared only when the runner's adjacent `.initial-report.txt`,
`.repair.meta.json`, and `.repair.json` bytes form a complete set that
deterministically reproduces it; the rejected original is not another
feedback-discoverable Markdown report. Such a report remains diagnostic-only:
its confusion, bug, stuck, and replay-intent fields were generated after the
primary prose and cannot participate in authoritative certification.

Each live member has an adjacent runner-owned provider-discriminated attestation.
Historical Claude v2 remains compatible. Codex v3 binds its exact CLI-recorded
selected model, provider/session/turn, effort, isolated cwd, completed lifecycle,
unique game session, and all artifact hashes. An exclusive strict capture receipt
binds the copied rollout hash to the exact canonical expected/session/turn cwd and
native filesystem identity; later validation reparses it and rejects
abort/error history or any row after terminal `task_complete`.
Each automatic CLI compaction may add a replay with an exact deep-equal context
payload only in the immediate `compacted` → `world_state` → `turn_context`
sequence before completion. Wrapper keys must match and only the timestamp may
differ; every other duplicate context fails closed.
`turn_context.model` is durable CLI provenance, not a provider-signed
remote-backend snapshot. Diagnostic resume reparses these retained facts;
certification rejects recovery, reuse, links, and path escape.
The cwd receipt is likewise trusted local runner provenance recorded while the
temporary player directory still exists. After cleanup, later validation reparses
the receipt and hashes but cannot re-stat that deleted directory or resist a
privileged actor coherently rewriting the whole bundle; it is not a cryptographic
attestation.

The authoritative check is:

```bash
npm run starting-slice:certify -- --fleet ai-runs/fleet/<label>
```

It reparses and reverifies every report and sidecar instead of trusting summary
counts. Certification requires exactly 100 unique rows for the contiguous
planned seeds, all using one supported homogeneous provider/model plan bound to
one exact provider-evidence model value, all successful and present, under the
frozen pure/default/build/world contract, with unique game and provider sessions, `--no-resume`, the cohort's
current-stamp report basename, exactly one verified attempt per slot, and zero
report-recovered rows or artifacts. The ten-player pilot uses a separate result
kind and artifact and can never satisfy this 100-player authority boundary.
Malformed or unauthenticated evidence exits 2; a valid
cohort that misses a quality threshold exits 1; a pass exits 0.

Wolf-Winter outcomes map to strategy families as follows:

| Strategy family       | Accepted Wolf-Winter ending ids                                                                     |
| --------------------- | --------------------------------------------------------------------------------------------------- |
| `hunt_and_hold`       | `ending_held_gate_barred`, `ending_held_timber_saved`, `ending_held`                                |
| `lure_and_divert`     | `ending_pack_diverted`, `ending_pack_diverted_cattle_scattered`, `ending_pack_diverted_after_blood` |
| `fortify_and_outlast` | `ending_fortified_cade_terms`, `ending_fortified_albany_authority`                                  |
| `drive_and_evacuate`  | `ending_drive_cattle_wounded`, `ending_drive_person_cattle_lost`, `ending_drive_reserve_spent`      |

`ending_pack_diverted_after_blood` is the lure family's bounded hybrid
recovery, not a fifth strategy. A missing Wolf-Winter outcome is an incomplete
starting-goal run. A death ending or any unknown Wolf-Winter ending invalidates
the certification bundle rather than being silently bucketed.

Final experiential certification requires all of these gates simultaneously:

- verified starting-goal completion at or above 90%;
- median meaningful decisions to first-goal completion at or below 45;
- `got_stuck` at or below 5%;
- mean clarity at or above 4.2 and mean enjoyment at or above 4.2;
- continuation at the initial goal-completion choice at or above 70%;
- at least three of the four strategy families observed organically, with no
  family above 75% of completed runs;
- no in-scope S3/S4 issue and no in-scope S2 cluster present in five or more
  distinct runs.

`would_replay` is a separate post-exit attitude and never substitutes for the
game-recorded continuation choice. The certifier uses only this authenticated
fleet and treats ambiguous issue scope conservatively; global historical
feedback and compiler aggregates remain useful diagnosis, never certification
evidence. This tooling enables the later diagnostic and authoritative 100-player
fleets. It does not change the current `active_unproven` status by itself.

## Increment discipline

Each increment must create one reusable or player-visible causal improvement,
update the matrix truthfully, preserve unrelated work, pass the repository's
gates, produce a fresh pure report, and prepend a terse result to
`AI_LOOP_STATE.md`. Green increments may be committed locally on a short-lived
branch; they are not pushed or proposed for merge without explicit instruction.

The milestone is complete only when current evidence proves every contract item.
Until then, the next move is the highest-leverage missing foundation inside this
fixed slice—not another map node, quest port, or prose-only branch.
