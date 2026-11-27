/**
 * A small mark per store: its brand colour and initials. These are not the stores'
 * logos; they are a neutral stand-in that reads as "this store" at icon size.
 * Unknown stores get a neutral mark.
 */
export interface Brand {
  color: string;
  ink: string;
}

const BRANDS: Record<string, Brand> = {
  elgiganten: { color: "#1F4E8C", ink: "#FFFFFF" },
  netonnet: { color: "#3A3F47", ink: "#FFFFFF" },
  power: { color: "#A8323E", ink: "#FFFFFF" },
  webhallen: { color: "#4E4380", ink: "#FFFFFF" },
  inet: { color: "#245E80", ink: "#FFFFFF" },
  komplett: { color: "#D9B323", ink: "#1D1F24" },
  cdon: { color: "#1E6F66", ink: "#FFFFFF" },
  clasohlson: { color: "#2C5848", ink: "#FFFFFF" },
  proshop: { color: "#22304A", ink: "#FFFFFF" },
  superdeals: { color: "#E4007C", ink: "#FFFFFF" },
  hjartat: { color: "#B8334A", ink: "#FFFFFF" },
  apotekhjartat: { color: "#B8334A", ink: "#FFFFFF" },
  apotea: { color: "#2E7D5B", ink: "#FFFFFF" },
  kronans: { color: "#1B5E7A", ink: "#FFFFFF" },
  apoteket: { color: "#1F6B45", ink: "#FFFFFF" },
  lyko: { color: "#222222", ink: "#FFFFFF" },
};

const NEUTRAL: Brand = { color: "#2A2A2A", ink: "#FFFFFF" };

export function brandOf(storeId: string): Brand {
  return BRANDS[storeId] ?? NEUTRAL;
}

/** Stores whose initials would collide ("Apoteket" and "Apotea" are both "A"). */
const MARKS: Record<string, string> = { apoteket: "At", apotea: "Ae", apotekhjartat: "H", kronans: "K", trapshop: "F" };

export function markOf(storeId: string, name: string): string {
  return MARKS[storeId] ?? initials(name);
}

/** "Clas Ohlson" → "CO", "CDON" → "C", "Elgiganten" → "E". */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return `${words[0]?.[0] ?? ""}${words[1]?.[0] ?? ""}`.toUpperCase();
  return (words[0]?.[0] ?? "?").toUpperCase();
}
