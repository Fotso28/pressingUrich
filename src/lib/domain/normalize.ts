/** Nom en minuscules, sans accents, espaces réduits : sert à la recherche (F-CLI-02). */
export function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9' -]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Garde les chiffres et retire l'indicatif camerounais (+237, 00237, 237 devant 9 chiffres) (F-CLI-03). */
export function normalizePhone(phone: string): string {
  let d = phone.replace(/\D/g, "");
  if (d.startsWith("00237")) d = d.slice(5);
  else if (d.startsWith("237") && d.length === 12) d = d.slice(3);
  return d;
}

/** Affichage « 6 99 65 88 38 » pour un numéro à 9 chiffres. */
export function formatPhone(phone: string): string {
  const d = normalizePhone(phone);
  if (d.length !== 9) return phone.trim();
  return `${d[0]} ${d.slice(1, 3)} ${d.slice(3, 5)} ${d.slice(5, 7)} ${d.slice(7, 9)}`;
}

export function isValidPhone(phone: string): boolean {
  return /^\d{9}$/.test(normalizePhone(phone));
}

export type SearchKind = "number" | "phone" | "name" | "empty";

/**
 * Routage de la saisie de recherche (TRD §5) : chiffres → téléphone ou n° de commande ;
 * lettres → nom. 1 à 6 chiffres peuvent être un n° de commande.
 */
export function classifyQuery(q: string): { kind: SearchKind; value: string; words: string[] } {
  const trimmed = q.trim();
  if (!trimmed) return { kind: "empty", value: "", words: [] };
  if (/^[\d\s+\-.()]+$/.test(trimmed)) {
    const digits = normalizePhone(trimmed);
    if (digits.length >= 1 && digits.length <= 6) return { kind: "number", value: digits, words: [] };
    return { kind: "phone", value: digits, words: [] };
  }
  const value = normalizeName(trimmed);
  return { kind: "name", value, words: value.split(" ").filter(Boolean) };
}
