export const RPG_STATE_HASH_MISMATCH_REASON =
  "State hash mismatch; refresh the current observation or action menu.";

export type RpgStateUnchanged = {
  state_hash: string;
  unchanged: true;
};

export type RpgStateHashRejection = {
  ok: false;
  state_hash: string;
  rejection_reason: string;
};

export function rpgStateUnchanged(stateHash: string): RpgStateUnchanged {
  return {
    state_hash: stateHash,
    unchanged: true,
  };
}

export function rpgStateHashRejection(stateHash: string): RpgStateHashRejection {
  return {
    ok: false,
    state_hash: stateHash,
    rejection_reason: RPG_STATE_HASH_MISMATCH_REASON,
  };
}
