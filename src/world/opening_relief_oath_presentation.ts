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

const STANDARD_PACKET_SUPPORT_COPY: Readonly<
  Record<
    string,
    Readonly<{
      expectedTriggerCategory: string;
      support: string;
    }>
  >
> = Object.freeze({
  "albany:doctrine_fortify_breach": Object.freeze({
    expectedTriggerCategory: "Repair 4; first public-seal fortification check is 2 DC easier.",
    support: "Repair 4; FORTIFY's first public-seal check is 2 DC easier.",
  }),
  "albany:doctrine_road_warden_aid_route": Object.freeze({
    expectedTriggerCategory:
      "Fieldcraft 4 sets DEF 4; Aid-Only skips clean LURE's last alarm; Hayden conditionally braces split-rail HUNT.",
    support:
      "Fieldcraft 4 sets DEF 4 and supplies DRIVE/LURE checks; Aid-Only skips clean LURE's last alarm and fits Cade's FORTIFY terms; after a public wedge splits, Hayden can brace HUNT. All four plans remain legal.",
  }),
  "albany:doctrine_independent_drive": Object.freeze({
    expectedTriggerCategory: "Streetwise 4; first shutter-signal check drops from DC 12 to DC 10.",
    support: "Streetwise 4; DRIVE's first shutter-signal check is 2 DC easier.",
  }),
});

function summarizeStartingDoctrineSupport(doctrine: OpeningStartingDoctrine): string {
  const copy = STANDARD_PACKET_SUPPORT_COPY[doctrine.id];
  return copy?.expectedTriggerCategory === doctrine.trigger_category
    ? copy.support
    : doctrine.trigger_category;
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
    ? Object.freeze({
        ...presentOpeningChoiceOption({
          id: doctrine.id,
          label: `Quick setup — ${doctrine.title}: ${doctrineOath!.title} + ${doctrineSource!.title}`,
          commitment: `Applies the matched duty and evidence together; no field plan is chosen. Support: ${summarizeStartingDoctrineSupport(doctrine)}`,
          exactBenefit: doctrine.trigger_category,
          immediateCost: doctrine.immediate_cost,
          giveUp: "Other duty/evidence pairs close; every field plan stays open.",
        }),
      })
    : null;
  const oathOptions = Object.freeze(
    parsed.options.map((option) => {
      const cost = formatOpeningReliefOathCost(option.terms);
      if (option.trigger_category === undefined) {
        return Object.freeze({
          id: option.id,
          label: option.title,
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
        label: option.title,
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
            id: "customize_duty_and_evidence",
            label: "Customize duty and evidence — compare all four field outcomes",
            description:
              "HUNT — Outcome: hold Cade's ground, herd, and relief stores through prepared combat. Cost: wolves may die; failure can lose cattle or the line. Later: bloodshed changes Greenway work and damage remains. LURE — Outcome: move the pack beyond the breach and keep the herd. Cost: Cade's last feed, broken paling, and two cattle risked on a first-cast foul. Later: broken boundary or scattered cattle change Station response. DRIVE — Outcome: move people and herd clear while forcing the living pack away. Cost: abandon the outer steading; if the drive reaches its crisis, take a wound, lose two cattle, or lose the rig. Later: the line and chosen loss remain. FORTIFY — Outcome: keep household, herd, and pack apart until dawn. Cost: no retreat; expose property for Cade's help or spend public seals without it. Later: the terms remain, and a no-loss hold opens no Cade repair dispatch. No plan is recommended or committed. This comparison changes no state; choose one duty or the quick setup afterward, and evidence follows unless the setup binds it.",
            optionIds,
          }),
        });
      })()
    : undefined;

  return Object.freeze({
    id: parsed.id,
    kind: "relief_oath" as const,
    message: standardPacket
      ? `${parsed.title}. Your quick setup binds matched duty and evidence, not a field plan. Customize only for a different duty or source. HUNT, LURE, DRIVE, and FORTIFY remain open. ${parsed.message}`
      : `${parsed.title}. ${parsed.message}`,
    options,
    ...(progressiveDisclosure ? { progressiveDisclosure } : {}),
  });
}
