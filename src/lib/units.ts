/** Unit conversion helpers — metric is the canonical storage format */

export const KG_PER_LB = 0.45359237;
export const CM_PER_IN = 2.54;

export function kgToLb(kg: number): number {
  return kg / KG_PER_LB;
}

export function lbToKg(lb: number): number {
  return lb * KG_PER_LB;
}

export interface FtIn {
  ft: number;
  in: number;
}

export function cmToFtIn(cm: number): FtIn {
  const totalIn = cm / CM_PER_IN;
  let ft = Math.floor(totalIn / 12);
  let inch = Math.round(totalIn - ft * 12);
  if (inch >= 12) {
    ft += 1;
    inch = 0;
  }
  return { ft, in: inch };
}

export function ftInToCm(ft: number, inch: number): number {
  return (ft * 12 + inch) * CM_PER_IN;
}

/** Display helpers */
export function formatWeight(kg: number, unitSystem: string): string {
  if (unitSystem === "imperial") return `${(Math.round(kgToLb(kg) * 10) / 10).toLocaleString("en-US")} lb`;
  return `${Math.round(kg * 10) / 10} kg`;
}

export function formatHeight(cm: number, unitSystem: string): string {
  if (unitSystem === "imperial") {
    const { ft, in: inch } = cmToFtIn(cm);
    return `${ft}' ${inch}"`;
  }
  return `${Math.round(cm)} cm`;
}

/** Weekly rate display: kg/week ↔ lb/week */
export function formatWeeklyRate(kgPerWeek: number, unitSystem: string): string {
  if (unitSystem === "imperial") return `${(Math.round(kgToLb(kgPerWeek) * 100) / 100).toFixed(2)} lb`;
  return `${kgPerWeek} kg`;
}
