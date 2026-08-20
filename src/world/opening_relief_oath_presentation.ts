import type { CampaignCharacterState } from "./campaign_character_state.js";
import type {
  JourneyReliefOathStoryChoiceOptions,
  JourneyStoryChoiceProgressiveDisclosure,
  JourneyStoryChoicePrompt,
} from "./journey_contract.js";
import type { OpeningLeadSource } from "./opening_lead_source.js";
import type { OpeningRegistration, OpeningStartingDoctrine } from "./opening_registration.js";
import {
  formatOpeningReliefOathCost,
  parseOpeningReliefOath,
  type OpeningReliefOath,
} from "./opening_relief_oath.js";
import { presentOpeningChoiceOption } from "./opening_choice_receipt.js";

export type OpeningReliefOathStandardPacketContext = Readonly<{
  registration: OpeningRegistration;
  leadSource: OpeningLeadSource;
}>;

export const OPENING_RELIEF_OATH_CUSTOMIZE_REVEAL_ID = "customize_duty_and_evidence" as const;
export const OPENING_RELIEF_OATH_CUSTOMIZE_LABEL = "Customize promise and report" as const;
export const OPENING_RELIEF_OATH_CUSTOMIZE_DESCRIPTION =
  "Open the four-plan outcome compass; this records only the review, then lets you choose a promise and report separately." as const;
export const OPENING_RELIEF_OATH_FIELD_OUTCOME_COMPASS =
  "HUNT — Outcome: hold Cade's ground, herd, relief stores in combat. Cost or risk: wolves may die; failure risks cattle/line. Later: bloodshed alters Greenway work; damage remains. LURE — Outcome: move pack beyond breach; keep herd. Cost or risk: Cade's last feed, broken paling; first-cast foul risks two cattle. Later: broken boundary or scattered cattle alter Station response. DRIVE — Outcome: move people and herd clear; force the living pack away. Cost or risk: abandon the outer steading; crisis costs a wound, two cattle, or the rig. Later: the line and chosen loss remain. FORTIFY — Outcome: keep household, herd, and pack apart until dawn. Cost or risk: no retreat; expose property for Cade's help or spend public seals without it. Later: terms remain; a no-loss hold opens no Cade repair dispatch. No plan is recommended or committed. Review recorded; no choice or decision accepted." as const;

/**
 * Project the authored four-plan compass only after the session has accepted
 * this prompt's durable reveal receipt. The canonical pre-reveal prompt keeps
 * only the short affordance, so full, compact, terminal, and UI surfaces share
 * the same disclosure boundary without placing presentation copy in save data.
 */
export function withOpeningReliefOathFieldOutcomeCompass(
  prompt: JourneyStoryChoicePrompt,
  revealId: string,
): JourneyStoryChoicePrompt {
  const disclosure = prompt.progressiveDisclosure;
  if (
    prompt.kind !== "relief_oath" ||
    !disclosure ||
    disclosure.reveal.id !== OPENING_RELIEF_OATH_CUSTOMIZE_REVEAL_ID ||
    revealId !== disclosure.reveal.id
  ) {
    return prompt;
  }
  const { progressiveDisclosure: _progressiveDisclosure, ...withoutDisclosure } = prompt;
  return Object.freeze({
    ...withoutDisclosure,
    message: `${prompt.message} ${OPENING_RELIEF_OATH_FIELD_OUTCOME_COMPASS}`,
  }) as JourneyStoryChoicePrompt;
}

const STANDARD_PACKET_SUPPORT_COPY: Readonly<
  Record<
    string,
    Readonly<{
      dispatchLabel: string;
      expectedProfileId: string;
      expectedReliefOathOptionId: string;
      expectedReliefOathTitle: string;
      expectedLeadSourceOptionId: string;
      expectedLeadSourceTitle: string;
      expectedTriggerCategory: string;
      outcome: string;
    }>
  >
> = Object.freeze({
  "albany:doctrine_fortify_breach": Object.freeze({
    dispatchLabel: "Ready-made dispatch — Full Compact promise + Rowan's civic report",
    expectedProfileId: "albany:ironhands_repairer",
    expectedReliefOathOptionId: "albany:oath_full_compact_duty",
    expectedReliefOathTitle: "Take Full Compact Duty",
    expectedLeadSourceOptionId: "albany:source_rowan_civic_docket",
    expectedLeadSourceTitle: "Leave on Rowan's Civic Docket",
    expectedTriggerCategory: "Repair 4; first public-seal fortification check is 2 DC easier.",
    outcome: "Reinforce Cade's failing boundary under Albany's public promise.",
  }),
  "albany:doctrine_road_warden_aid_route": Object.freeze({
    dispatchLabel: "Ready-made dispatch — Aid-Only promise + Hayden's frost report",
    expectedProfileId: "albany:road_warden",
    expectedReliefOathOptionId: "albany:oath_limited_aid_only",
    expectedReliefOathTitle: "Negotiate Aid-Only Duty",
    expectedLeadSourceOptionId: "albany:source_hayden_frost_report",
    expectedLeadSourceTitle: "Take Hayden's Frost-Heave Report",
    expectedTriggerCategory:
      "Fieldcraft 4 sets DEF 4; Aid-Only skips clean LURE's last alarm; Hayden conditionally braces split-rail HUNT.",
    outcome: "Carry winter-road judgment and flexible, life-first aid to Cade's steading.",
  }),
  "albany:doctrine_independent_drive": Object.freeze({
    dispatchLabel: "Ready-made dispatch — personal bond + Rowan's civic report",
    expectedProfileId: "albany:unaffiliated_courier",
    expectedReliefOathOptionId: "albany:oath_unaffiliated_personal_bond",
    expectedReliefOathTitle: "Remain an Unaffiliated Helper",
    expectedLeadSourceOptionId: "albany:source_rowan_civic_docket",
    expectedLeadSourceTitle: "Leave on Rowan's Civic Docket",
    expectedTriggerCategory: "Streetwise 4; first shutter-signal check drops from DC 12 to DC 10.",
    outcome: "Keep the dispatch independent and work through back roads and shutter signals.",
  }),
});

function matchesKnownStartingDoctrineMapping(
  doctrine: OpeningStartingDoctrine,
  oathTitle: string,
  sourceTitle: string,
): boolean {
  const copy = STANDARD_PACKET_SUPPORT_COPY[doctrine.id];
  return (
    copy?.expectedProfileId === doctrine.profile_id &&
    copy.expectedReliefOathOptionId === doctrine.relief_oath_option_id &&
    copy.expectedReliefOathTitle === oathTitle &&
    copy.expectedLeadSourceOptionId === doctrine.lead_source_option_id &&
    copy.expectedLeadSourceTitle === sourceTitle
  );
}

function summarizeStartingDoctrineOutcome(
  doctrine: OpeningStartingDoctrine,
  oathTitle: string,
  sourceTitle: string,
): string {
  const copy = STANDARD_PACKET_SUPPORT_COPY[doctrine.id];
  return matchesKnownStartingDoctrineMapping(doctrine, oathTitle, sourceTitle) &&
    copy?.expectedTriggerCategory === doctrine.trigger_category
    ? copy.outcome
    : `Pairs ${reliefOathDisplayLabel(oathTitle)} with ${sourceTitle}.`;
}

function startingDoctrineDispatchLabel(
  doctrine: OpeningStartingDoctrine,
  oathTitle: string,
  sourceTitle: string,
): string {
  const copy = STANDARD_PACKET_SUPPORT_COPY[doctrine.id];
  const matchesKnownCopy = matchesKnownStartingDoctrineMapping(doctrine, oathTitle, sourceTitle);
  return matchesKnownCopy && copy
    ? copy.dispatchLabel
    : `Ready-made dispatch — ${oathTitle.replace(/\bDuty\b/u, "promise")} + ${sourceTitle}`;
}

function reliefOathDisplayLabel(title: string): string {
  return title.replace(/\bDuty\b/gu, "Promise");
}

/** Project Albany's disclosed access-and-duty terms onto the journey choice surface. */
export function presentOpeningReliefOath(
  scene: OpeningReliefOath,
  character: CampaignCharacterState,
  packetContext?: OpeningReliefOathStandardPacketContext,
): JourneyStoryChoicePrompt {
  const parsed = parseOpeningReliefOath(scene);
  const doctrine = packetContext?.registration.doctrines?.find(
    (candidate) => candidate.profile_id === character.background,
  );
  const doctrineOath = doctrine
    ? parsed.options.find((candidate) => candidate.id === doctrine.relief_oath_option_id)
    : undefined;
  const doctrineSource = doctrine
    ? packetContext?.leadSource.options.find(
        (candidate) => candidate.id === doctrine.lead_source_option_id,
      )
    : undefined;
  if (doctrine && (!doctrineOath || !doctrineSource)) {
    throw new Error(`Opening quick setup "${doctrine.id}" has an invalid duty/source mapping.`);
  }
  const standardPacket = doctrine
    ? (() => {
        const exactReceipt = presentOpeningChoiceOption({
          id: doctrine.id,
          label: startingDoctrineDispatchLabel(
            doctrine,
            doctrineOath!.title,
            doctrineSource!.title,
          ),
          commitment: summarizeStartingDoctrineOutcome(
            doctrine,
            doctrineOath!.title,
            doctrineSource!.title,
          ),
          exactBenefit: doctrine.trigger_category,
          immediateCost: doctrine.immediate_cost,
          giveUp: "Other duty/evidence pairs close.",
        });
        return Object.freeze({
          ...exactReceipt,
          summary: Object.freeze({
            ...exactReceipt.summary!,
            tradeoff: "Other promise/report pairs close.",
          }),
        });
      })()
    : null;
  const oathOptions = Object.freeze(
    parsed.options.map((option) => {
      const cost = formatOpeningReliefOathCost(option.terms);
      if (option.trigger_category === undefined) {
        return Object.freeze({
          id: option.id,
          label: reliefOathDisplayLabel(option.title),
          summary: Object.freeze({
            commitment: option.summary,
            fieldTrigger: option.preview,
            immediateCost: cost,
            tradeoff: option.tradeoff,
          }),
          consequence:
            `${option.summary} ${option.preview} Access: ${option.access} Duty: ${option.duty} ` +
            `Actual cost: ${cost}. ${option.consequence}`,
        });
      }
      return presentOpeningChoiceOption({
        id: option.id,
        label: reliefOathDisplayLabel(option.title),
        commitment: option.summary,
        exactBenefit: option.trigger_category,
        immediateCost: cost,
        giveUp: option.tradeoff,
      });
    }),
  );
  const options = Object.freeze([
    ...(standardPacket ? [standardPacket] : []),
    ...oathOptions,
  ]) as JourneyReliefOathStoryChoiceOptions;
  const progressiveDisclosure: JourneyStoryChoiceProgressiveDisclosure | undefined = standardPacket
    ? (() => {
        const firstOathOption = oathOptions[0];
        if (!firstOathOption) throw new Error("Opening relief oath requires at least one duty.");
        const optionIds: JourneyStoryChoiceProgressiveDisclosure["reveal"]["optionIds"] =
          Object.freeze([firstOathOption.id, ...oathOptions.slice(1).map((option) => option.id)]);
        return Object.freeze({
          initialOptionIds: Object.freeze([standardPacket.id]),
          reveal: Object.freeze({
            id: OPENING_RELIEF_OATH_CUSTOMIZE_REVEAL_ID,
            label: OPENING_RELIEF_OATH_CUSTOMIZE_LABEL,
            description: OPENING_RELIEF_OATH_CUSTOMIZE_DESCRIPTION,
            optionIds,
          }),
        });
      })()
    : undefined;

  return Object.freeze({
    id: parsed.id,
    kind: "relief_oath" as const,
    message: standardPacket
      ? `${parsed.title}. The ready-made dispatch pairs one Wolf-Winter promise with one report; customization lets you mix them. Every field plan stays open. ${parsed.message}`
      : `${parsed.title}. ${parsed.message}`,
    options,
    ...(progressiveDisclosure ? { progressiveDisclosure } : {}),
  });
}
