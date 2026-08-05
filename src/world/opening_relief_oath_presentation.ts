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
      "Fieldcraft 4; a bloodless LURE skips one alarm; after an unbound rail split, HUNT may use Hayden's brace.",
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
          label: `Role shortcut — ${doctrineOath!.title} + ${doctrineSource!.title}`,
          commitment: `Skips the separate evidence choice; no field plan is chosen. Support: ${summarizeStartingDoctrineSupport(doctrine)}`,
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
              "HUNT defends herd and relief stores, but wolves may die and a failed hold can lose cattle or the line. LURE aims to keep herd and pack alive, but spends Cade's last feed and risks the paling and cattle. DRIVE moves people and the living pack clear, but abandons the outer line and its Crisis costs a wound, cattle, or the rig. FORTIFY keeps home, herd, and pack through dawn, but exposes Cade's property or spends public seals. No plan is recommended or committed. After this read-only comparison, choose one duty or the role shortcut; evidence follows unless the shortcut binds it.",
            optionIds,
          }),
        });
      })()
    : undefined;

  return Object.freeze({
    id: parsed.id,
    kind: "relief_oath" as const,
    message: standardPacket
      ? `${parsed.title}. Your role shortcut can bind its matched duty and evidence now without choosing a field plan. Customize only if you want a different duty or source. ${parsed.message}`
      : `${parsed.title}. ${parsed.message}`,
    options,
    ...(progressiveDisclosure ? { progressiveDisclosure } : {}),
  });
}
