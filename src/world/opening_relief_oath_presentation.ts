import type { CampaignCharacterState } from "./campaign_character_state.js";
import type {
  JourneyReliefOathStoryChoiceOptions,
  JourneyStoryChoiceProgressiveDisclosure,
  JourneyStoryChoicePrompt,
} from "./journey_contract.js";
import type { OpeningLeadSource } from "./opening_lead_source.js";
import type { OpeningRegistration } from "./opening_registration.js";
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
    throw new Error(`Opening standard packet "${doctrine.id}" has an invalid duty/source mapping.`);
  }
  const standardPacket = doctrine
    ? Object.freeze({
        ...presentOpeningChoiceOption({
          id: doctrine.id,
          label: `Standard packet — ${doctrine.title}`,
          commitment:
            `${doctrine.summary} Duty: ${doctrineOath!.title}; ` +
            `evidence: ${doctrineSource!.title}.`,
          exactBenefit: doctrine.trigger_category,
          immediateCost: doctrine.immediate_cost,
          giveUp: "Other duty/source choices close; later field planning remains open.",
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
    ? Object.freeze({
        initialOptionIds: Object.freeze([
          standardPacket.id,
        ]) as JourneyStoryChoiceProgressiveDisclosure["initialOptionIds"],
        reveal: Object.freeze({
          id: "customize_duty_and_evidence",
          label: "Compare individual duties",
          description:
            "Review individual duties without choosing; selecting one leads to its evidence choice.",
          optionIds: Object.freeze(
            oathOptions.map((option) => option.id),
          ) as JourneyStoryChoiceProgressiveDisclosure["reveal"]["optionIds"],
        }),
      })
    : undefined;

  return Object.freeze({
    id: parsed.id,
    kind: "relief_oath" as const,
    message: standardPacket
      ? `${parsed.title}. Use your role's standard packet to bind duty and evidence together, or customize duty and evidence; an individual duty is chosen now and its evidence source follows. ${parsed.message}`
      : `${parsed.title}. ${parsed.message}`,
    options,
    ...(progressiveDisclosure ? { progressiveDisclosure } : {}),
  });
}
