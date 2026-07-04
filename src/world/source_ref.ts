/** Compact canonical source identity shared by saves, traces, and source resolution. */
export type CompactSourceRef = ["wq", string] | ["gen", number] | ["pack", string];
