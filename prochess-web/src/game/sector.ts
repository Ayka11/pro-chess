const TWO_PI = Math.PI * 2;
export const SECTOR_COUNT = 6;
export const SECTOR_ANGLE = Math.PI / SECTOR_COUNT;
export const SECTOR_PALETTE = [0, 2, 1, 0, 2, 1];

function normalizeAngle(angle: number): number {
  let result = angle % TWO_PI;
  if (result < 0) result += TWO_PI;
  return result;
}

export function sectorIndexFromCoords(x: number, z: number): number {
  const angle = normalizeAngle(Math.atan2(z, x));
  return Math.floor(angle / SECTOR_ANGLE) % SECTOR_COUNT;
}

export function sectorCenterAngle(index: number): number {
  return (index + 0.5) * SECTOR_ANGLE;
}

export function normalizedAngularDifference(angle: number, reference: number): number {
  const diff = normalizeAngle(angle) - normalizeAngle(reference);
  if (diff > Math.PI) {
    return diff - TWO_PI;
  }
  if (diff < -Math.PI) {
    return diff + TWO_PI;
  }
  return diff;
}

export function colorIndexForSector(index: number): number {
  return SECTOR_PALETTE[((index % SECTOR_PALETTE.length) + SECTOR_PALETTE.length) % SECTOR_PALETTE.length];
}
