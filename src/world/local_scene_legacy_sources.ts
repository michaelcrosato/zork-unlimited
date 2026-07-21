/**
 * Exact manifest epochs for generic Albany roots that later became authored
 * scenes. These sets are cumulative because an unchanged generic root remains
 * valid evidence across unrelated world-manifest revisions until its own
 * authored conversion lands.
 *
 * Keep this module data-only. Event, job, and restore code all consume the same
 * sets so a new conversion cannot silently drift from the migration gate.
 */

const PRE_AUTHORED_WORKS_WORLD_HASHES = [
  "39d32c027d2e826f476dd299bb95cc3911994ec92b4fbf297be8d1216e5b6151",
  "b9416e3c43d9d54085ed9465b4d875811daebaf9834793d3f4a1ffca93b486c4",
  "cad75dafc291709f1d5c756dd70dd1002260bb06ca87d8e1e90aaf905f5f05c7",
  "1d12330f65743a8a2c124f9dae3cf145e6fdcbca9ec59a4c699ecd8757e8e47b",
  "07c2864bcad6eaadbd32e8ecff4460ddb7b63e6ed36b0316f4264aa866c1aa44",
  "2dbc97e2de8063be7b3a49fe3cb9108e8f80270d7d118efd781381659dba97c4",
  "742aa205a254b6f4382749fb63742caf1606024a1f6c044c2f433fda8dac6090",
  "f5835e15e6ccf5432ea6b39b87edf957ebc3ffb8a2518b48b46098f09aa92572",
  "2d10f959279a12166d521a774779acc46481fb6ff40d5982f9c955a30677a7b6",
  "1e74d32c28c3d563f6e8103034768506e25f13ff1f8e410b190cbb344589add8",
  "abd3b623a502b688a501bceae68994a4eb0e591d450420b5093532b5dae22179",
  "634fd4e93143343fd813edd9c59d3a8c098c0d78b94497cf689988492de154e3",
  "50350884ebb7d118849fca040256a19c0c63ed4bfe3353d4cd202ee7a6ba8e7f",
  "a2ddc6e9042a208f2821451f10b0152874ef55bc77b0f7801f3ea58591357474",
] as const;

/** Exact manifest immediately before Albany Works gained its first authored job. */
export const OVERWORLD_AUTHORED_LOCAL_JOB_PREDECESSOR_WORLD_HASH =
  "69604947643a24fc2d7c2377a85963742282ac7f83e7cec18a58bfc5eb8f53fc";
/** First authored-Works manifest, before its delayed service consumer landed. */
export const OVERWORLD_AUTHORED_LOCAL_JOB_FIRST_SCENE_WORLD_HASH =
  "9b8cc75b05e77af160f46dbcd177333cc0f27af89e56f504af0bf6c6a2422c31";
/** Exact manifest immediately before Civic's Winter Return Docket conversion. */
export const WINTER_RETURN_DOCKET_PREDECESSOR_WORLD_HASH =
  "815a138cbeeafbc9595c04e37260ccaba9d2d52d6a3341b3c38afe9eade62636";
/** Exact manifest immediately before Albany Campus gained its archive scene. */
export const AUTHORED_ALBANY_CAMPUS_PREDECESSOR_WORLD_HASH =
  "db23dea42bb2cd62beb8ac5871e4b5c74ee127c05b36941b4e170247ab8a5858";
/** Exact manifest immediately before preparation moved from Civic to Station. */
export const OVERWORLD_FIELD_TIMED_PREPARATION_PREDECESSOR_WORLD_HASH =
  "be2bb804d5e107449aeab1fd6e96cbfb6f0b71d587ee40283d0aac8b28298f6f";
/** Exact manifest immediately before Albany Station gained Cade's return packet. */
export const AUTHORED_ALBANY_STATION_PREDECESSOR_WORLD_HASH =
  "a27b2db04b359e9ca38380ca2b0b7a328df4008d1f899bf65e1332d0998aa6b2";
/** Exact manifest immediately before Albany Market gained its winter-price policy. */
export const AUTHORED_ALBANY_MARKET_PREDECESSOR_WORLD_HASH =
  "9ae4b2be87d9f5bf0ede03aed8c7c775bdd7ac327dfd96c2f1e4b2154ee610f0";
/** Exact manifest immediately before Albany Greenway gained its trail policy. */
export const AUTHORED_ALBANY_GREENWAY_PREDECESSOR_WORLD_HASH =
  "8e0bd691f77d7be3154866531b18c5e8c2920e51317beab97bf8d267ae6d6bfa";

export const AUTHORED_ALBANY_WORKS_GENERIC_PREDECESSOR_WORLD_HASHES: ReadonlySet<string> = new Set([
  ...PRE_AUTHORED_WORKS_WORLD_HASHES,
  OVERWORLD_AUTHORED_LOCAL_JOB_PREDECESSOR_WORLD_HASH,
]);

export const WINTER_RETURN_DOCKET_GENERIC_PREDECESSOR_WORLD_HASHES: ReadonlySet<string> = new Set([
  ...AUTHORED_ALBANY_WORKS_GENERIC_PREDECESSOR_WORLD_HASHES,
  OVERWORLD_AUTHORED_LOCAL_JOB_FIRST_SCENE_WORLD_HASH,
  WINTER_RETURN_DOCKET_PREDECESSOR_WORLD_HASH,
]);

export const AUTHORED_ALBANY_CAMPUS_GENERIC_PREDECESSOR_WORLD_HASHES: ReadonlySet<string> = new Set(
  [
    ...WINTER_RETURN_DOCKET_GENERIC_PREDECESSOR_WORLD_HASHES,
    AUTHORED_ALBANY_CAMPUS_PREDECESSOR_WORLD_HASH,
  ],
);

export const AUTHORED_ALBANY_STATION_GENERIC_PREDECESSOR_WORLD_HASHES: ReadonlySet<string> =
  new Set([
    ...AUTHORED_ALBANY_CAMPUS_GENERIC_PREDECESSOR_WORLD_HASHES,
    OVERWORLD_FIELD_TIMED_PREPARATION_PREDECESSOR_WORLD_HASH,
    AUTHORED_ALBANY_STATION_PREDECESSOR_WORLD_HASH,
  ]);

export const AUTHORED_ALBANY_MARKET_GENERIC_PREDECESSOR_WORLD_HASHES: ReadonlySet<string> = new Set(
  [
    ...AUTHORED_ALBANY_STATION_GENERIC_PREDECESSOR_WORLD_HASHES,
    AUTHORED_ALBANY_MARKET_PREDECESSOR_WORLD_HASH,
  ],
);

export const AUTHORED_ALBANY_GREENWAY_GENERIC_PREDECESSOR_WORLD_HASHES: ReadonlySet<string> =
  new Set([
    ...AUTHORED_ALBANY_MARKET_GENERIC_PREDECESSOR_WORLD_HASHES,
    AUTHORED_ALBANY_GREENWAY_PREDECESSOR_WORLD_HASH,
  ]);
