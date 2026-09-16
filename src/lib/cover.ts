/**
 * A destination has no photo to show, so its cover is a colour derived from the
 * name: stable for a given place, different between neighbours in a list, and
 * dark enough for white text in every case.
 */
export function coverStyle(seed: string): { background: string } {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) % 360;
  }
  return {
    background: `linear-gradient(135deg, oklch(0.55 0.11 ${hash}), oklch(0.36 0.09 ${(hash + 40) % 360}))`,
  };
}
