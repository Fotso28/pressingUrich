import { z } from "zod";

export const methodSchema = z.enum(["ESPECES", "MTN_MOMO", "ORANGE_MONEY"], { message: "Mode de paiement invalide." });
export const amountSchema = z.number({ message: "Montant invalide." }).int("Montant entier attendu.").min(0, "Montant négatif.").max(100_000_000, "Montant trop élevé.");
export const positiveAmount = z.number({ message: "Montant invalide." }).int("Montant entier attendu.").positive("Le montant doit être positif.").max(100_000_000, "Montant trop élevé.");
export const reasonSchema = z.string().trim().min(3, "Motif obligatoire (3 caractères min.).").max(500);
export const optText = z.string().trim().max(500).optional().transform((v) => (v ? v : null));
