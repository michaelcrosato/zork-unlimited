export const RPG_STATE_HASH_MISMATCH_REASON =
  "State hash mismatch; refresh the current observation or action menu.";
export const RPG_PUBLIC_STATE_HASH_LENGTH = 24;

export type RpgStateUnchanged = {
  state_hash: string;
  unchanged: true;
};

export type RpgStateHashRejection = {
  ok: false;
  state_hash: string;
  rejection_reason: string;
};

export function publicRpgStateHash(stateHash: string): string {
  return stateHash.slice(0, RPG_PUBLIC_STATE_HASH_LENGTH);
}

export function rpgStateHashMatches(expectedStateHash: string, stateHash: string): boolean {
  return expectedStateHash === stateHash || expectedStateHash === publicRpgStateHash(stateHash);
}

export function rpgStateUnchanged(stateHash: string): RpgStateUnchanged {
  return {
    state_hash: publicRpgStateHash(stateHash),
    unchanged: true,
  };
}

export function rpgStateHashRejection(stateHash: string): RpgStateHashRejection {
  return {
    ok: false,
    state_hash: publicRpgStateHash(stateHash),
    rejection_reason: RPG_STATE_HASH_MISMATCH_REASON,
  };
}
