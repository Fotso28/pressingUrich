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

`pnpm db:seed-demo` génère, de novembre 2025 à la fermeture du jour courant (`DEMO_START` pour changer) :
~240 clients aux noms camerounais dont **70 % d'habitués**, ~1 600 commandes, deux agents (`paul`, `brigitte`,
mot de passe `DEMO_AGENT_PASSWORD`, défaut `agent123`), une caisse par agent et par jour, et les charges de chaque mois :

| Charge | Montant mensuel (FCFA) |
|---|---|
| Loyer | 75 000 |
| Eau | 15 000 |
| Salaire agent 1 / agent 2 (liés aux comptes utilisateurs) | 75 000 / 45 000 |
| Intrants (produits) | 30 000 – 50 000 |
| Abonnement TV Canal+ | 5 000 |
| Électricité | 30 000 – 50 000 |
| Autres | 10 000 – 30 000 |

Le loyer est réglé **par trimestre (225 000)** en plus de toutes les autres charges, qui reviennent chaque mois :
un mois de loyer coûte ≈ 460 000, un mois normal ≈ 235 000. Le **bénéfice moyen des mois complets est de 440 000 FCFA**
(≈ 290 000 – 340 000 les mois de loyer, ≈ 390 000 – 650 000 les autres) pour un CA encaissé de ≈ 620 000 – 890 000
(moyenne ≈ 760 000) ; les deux derniers mois (dernier mois complet et mois en cours) sont les plus faibles.
Tous les montants sont des multiples de 100 FCFA, le plus souvent de 500.
`DEMO_RESET=1` efface les données métier avant de régénérer. Au build Vercel (`SEED_DEMO=1`), le jeu est
régénéré une seule fois quand `DEMO_VERSION` change dans `scripts/seed-demo.ts` : **retirez `SEED_DEMO`
des variables Vercel avant de saisir de vraies données.**

## Mode hors ligne

L'application installée (PWA) s'ouvre et reste utilisable au comptoir sans connexion internet.

- **Ouverture sans réseau** : le service worker garde l'interface en cache ; toute page ouverte sans
  réseau affiche `/hors-ligne`, qui travaille sur une copie locale (IndexedDB).
- **Copie locale** (`GET /api/offline/snapshot`), rafraîchie au chargement de l'application, toutes les
  5 minutes et au retour du réseau : catalogue et tarifs, clients, commandes en cours, caisse ouverte,
  paramètres du ticket, et la session (valable 7 jours ; au-delà, reconnexion obligatoire).
- **Opérations possibles hors ligne** : ouverture / dépenses / clôture de caisse, nouveaux clients,
  dépôts (avec acompte), encaissements et retraits, impression des tickets et reçus.
- **Numéros de ticket** : chaque compte reçoit un bloc de **200 numéros réservés** sur la séquence des
  tickets (jamais attribués en ligne, donc sans doublon). Un nouveau bloc est ajouté quand 75 % sont
  utilisés. Sans numéro disponible, le dépôt est bloqué : « connectez-vous à internet pour obtenir de
  nouveaux numéros ».
- **Synchronisation** (`POST /api/offline/sync`) : les opérations sont rejouées dans l'ordre, chacune dans
  sa transaction et une seule fois (`offline_ops.op_id`). Une opération refusée est signalée à l'agent.
  Hors périmètre : rapports, dépenses du gérant, paramètres (en ligne uniquement).

## Impression

Le ticket occupe toute la largeur du papier choisi à l'impression (rouleau 80 mm des imprimantes de
mini-factures par défaut, 58 mm, B7, A4…) et continue sur plusieurs pages si besoin. Format de référence et site
internet dans Paramètres › Pressing.

## Passage en production réelle (checklist)

1. **Effacer le jeu de démonstration** : dans Vercel › Settings › Environment Variables (Production), ajouter
   `PURGE_DEMO_DATA=1` et **supprimer `SEED_DEMO`**, puis redéployer. Le build efface commandes, clients,
   caisses, paiements, dépenses, numéros réservés et comptes de démo (`paul`, `brigitte`) ; le catalogue,
   les paramètres et le compte du gérant sont conservés. Retirer ensuite `PURGE_DEMO_DATA`.
   Garde-fou : sans marqueur de démonstration (`app_meta.demo_version`), aucune donnée n'est jamais effacée.
2. **Mots de passe** : le gérant change le sien (Paramètres › Utilisateurs › Changer mon mot de passe,
   8 caractères minimum) et crée les comptes réels des agents, avec leur salaire de base (Dépenses).
3. **Paramètres › Pressing** : nom, adresse, téléphones, site internet, mention du ticket, délais, format du papier.
4. **Catalogue** : vérifier articles, services et tarifs.
5. **Chaque appareil du comptoir** : se connecter une fois avec internet (copie hors ligne + 200 numéros réservés).

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
