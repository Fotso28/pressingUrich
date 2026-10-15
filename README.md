# Continental Pressing

Application de gestion du pressing (PWA) : dépôts, suivi atelier, retraits, paiements (espèces, MTN MoMo,
Orange Money), caisse et clôture, **dépenses et salaires**, tableau de bord et rapports.
Elle suit le dossier de conception (PRD, TRD, App Flow, UI/UX, schéma, plan d'implémentation).

| | |
|---|---|
| Framework | Next.js 16 (App Router, Server Components, Server Actions), TypeScript strict |
| UI | Tailwind CSS 4, composants maison façon shadcn/ui (Radix Dialog), Lucide |
| Données | Postgres (Neon en production) via Drizzle ORM, migrations SQL versionnées |
| Auth | Better Auth (identifiant + mot de passe, plugins `username` et `admin`, rôles `ADMIN` / `AGENT`) |
| PWA | Serwist : seul le shell est mis en cache, aucune donnée métier |
| Tests | Vitest (logique métier), Playwright (parcours du comptoir) |

## Fonctionnalités

- **Dépôt** en deux colonnes (PC) ou en 4 étapes (téléphone) : client (recherche téléphone/nom, création rapide,
  alerte doublon), articles fréquents en boutons, observations par ligne, express, remise plafonnée pour l'agent,
  acompte. Enregistrement transactionnel et **idempotent** (un double clic ne crée qu'une commande).
- **Commandes** : onglets par statut, filtres (retard, impayées, dates), actions unitaires et par lot.
- **Détail** : reste à payer en grand, encaissement, remise au client (forcée par le gérant avec motif),
  modification tracée, annulation, retour d'étape, annulation de paiement, historique complet.
- **Impression 80 mm** : ticket, étiquettes par pièce, reçu de retrait, récapitulatif de clôture.
- **Caisse** : ouverture avec fond, dépenses du comptoir, clôture avec écart calculé en direct.
- **Dépenses** (gérant) : sorties d'argent hors caisse — achats d'intrants, **salaires** (employé + mois),
  loyer, électricité/eau, entretien, taxes —, répartition par catégorie, bénéfice du mois.
- **Rapports** : ventes / dépenses / bénéfice sur 12 mois (graphique + tableau), répartition des dépenses,
  CA par mode de paiement, impayés, commandes en souffrance, historique des clôtures, exports CSV.
- **Paramètres** : infos du ticket, délais et taux, grille de prix article × service éditable, comptes.
- Recherche globale (touche `/`), bandeau hors ligne qui désactive les enregistrements.

## Démarrage local

```bash
pnpm install
cp .env.example .env            # renseigner DATABASE_URL, BETTER_AUTH_SECRET, SEED_ADMIN_PASSWORD
pnpm db:migrate                 # crée les tables (extensions pg_trgm et unaccent incluses)
pnpm db:seed                    # premier gérant, paramètres, catalogue de base
pnpm db:seed-demo               # facultatif : 1 an de données de démonstration
pnpm dev
```

`DATABASE_URL` accepte un Postgres local (driver `pg`) ou Neon (driver serverless, détecté via `.neon.tech`).

### Données de démonstration

`pnpm db:seed-demo` génère, de novembre 2025 à aujourd'hui (`DEMO_START` pour changer) : ~235 clients aux noms
camerounais dont **70 % d'habitués**, ~1 300 commandes, un CA encaissé de **400 000 à 700 000 FCFA par mois
(moyenne ≈ 580 000)**, deux agents (`paul`, `brigitte`, mot de passe `DEMO_AGENT_PASSWORD`, défaut `agent123`),
une caisse par agent et par jour, dépenses, salaires, loyer, factures et achats d'intrants.
`DEMO_RESET=1` efface les données métier avant de régénérer.

## Déploiement (Vercel + Neon)

1. **Neon** : créer un projet en région `aws-eu-central-1` (Francfort) et copier la chaîne de connexion.
   Le plus simple : intégration Neon depuis le Marketplace Vercel (elle crée aussi des branches pour les previews).
2. **Vercel** : importer ce dépôt GitHub. Framework Next.js détecté ; `vercel.json` fixe la région `fra1`
   et la commande de build `pnpm vercel-build` (migrations puis build).
3. **Variables d'environnement** (Production et Preview) :
   - `DATABASE_URL` — chaîne Neon (`sslmode=require`)
   - `BETTER_AUTH_SECRET` — `openssl rand -base64 32`
   - `BETTER_AUTH_URL` — URL de production, ex. `https://continental-pressing.vercel.app`
4. Déployer, puis créer le gérant une fois depuis un poste :
   ```bash
   DATABASE_URL="<chaîne Neon>" SEED_ADMIN_USERNAME=gerant SEED_ADMIN_PASSWORD="<mot de passe>" SEED_ADMIN_NAME="Ulrich" pnpm db:seed
   DATABASE_URL="<chaîne Neon>" pnpm db:seed-demo   # facultatif
   ```

## Scripts

| Commande | Rôle |
|---|---|
| `pnpm dev` / `pnpm build` / `pnpm start` | Développement, build (webpack, requis par Serwist), production |
| `pnpm db:generate` | Génère une migration après modification de `src/server/db/schema.ts` |
| `pnpm db:migrate` | Applique les migrations |
| `pnpm db:seed` / `pnpm db:seed-demo` | Données initiales / démonstration |
| `pnpm test` | Tests unitaires de `src/lib/domain` |
| `pnpm test:e2e` | Parcours Playwright (app lancée, base seedée) |
| `pnpm lint` / `pnpm typecheck` | ESLint / TypeScript |

## Organisation

```
src/
  app/(app)/          pages protégées (accueil, dépôt, commandes, clients, caisse, dépenses, rapports, paramètres)
  app/print/          gabarits d'impression 80 mm
  app/login/          connexion
  server/actions/     Server Actions : session → rôle → Zod → transaction → revalidatePath → { ok, data | error }
  server/queries/     lectures (Server Components)
  server/db/          schéma Drizzle et connexion
  lib/domain/         logique pure testée (totaux, statuts, dates Africa/Douala, caisse, formats)
drizzle/              migrations SQL
scripts/              migrate, seed, seed-demo
e2e/                  tests Playwright
```

Écarts au TRD : Next.js 16 (le middleware s'appelle désormais `proxy.ts`) ; les tableaux sont rendus sans
TanStack Table (filtrage et pagination côté serveur) ; ajout du module « Dépenses » (sorties hors caisse et salaires).
