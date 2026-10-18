export function getDemoFixtures<T>(demoMode: boolean, fixtures: readonly T[]): T[] {
  return demoMode ? [...fixtures] : [];
}
