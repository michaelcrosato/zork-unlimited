export function isGeneratedRpgSeed(seed: unknown): seed is number {
  return typeof seed === "number" && Number.isSafeInteger(seed);
}

export function generatedRpgSeedValidationMessage(label: string, seed: unknown): string {
  return `${label} must be an integer within JavaScript's safe range, got ${JSON.stringify(seed)}.`;
}

export function assertGeneratedRpgSeed(seed: unknown, label: string): asserts seed is number {
  if (!isGeneratedRpgSeed(seed)) {
    throw new Error(generatedRpgSeedValidationMessage(label, seed));
  }
}
