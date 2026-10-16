import { expect, test, type Page } from "@playwright/test";

const ADMIN = process.env.E2E_ADMIN_USER ?? "gerant";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "gerant123";

async function login(page: Page) {
  await page.goto("/login");
  await page.fill("#login", ADMIN);
  await page.fill("#password", ADMIN_PASSWORD);
  await page.click("button[type=submit]");
  await page.waitForURL("/");
}

test.describe.serial("Gestion du gérant", () => {
  const ITEM = `Nappe ${Date.now().toString(36)}`;

  test("catalogue : créer un article avec ses tarifs, puis le supprimer", async ({ page }) => {
    await login(page);
    await page.goto("/parametres/catalogue");
    await page.getByRole("button", { name: "Article" }).click();
    const dlg = page.getByRole("dialog");
    await dlg.getByLabel("Nom").fill(ITEM);
    await dlg.getByLabel("Prix Lavage + repassage", { exact: true }).fill("1550");
    await expect(dlg.getByText("Multiple de 100 FCFA.")).toBeVisible();
    await expect(dlg.getByRole("button", { name: "Enregistrer" })).toBeDisabled();
    await dlg.getByLabel("Prix Lavage + repassage", { exact: true }).fill("2500");
    await dlg.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page.getByText("Article créé.")).toBeVisible();
    const row = page.getByRole("row", { name: new RegExp(ITEM) });
    await expect(row.getByLabel("Prix").first()).toHaveValue(/^2\s?500$/);

    // L'article est immédiatement proposé au dépôt.
    await page.goto("/depot/nouveau");
    await expect(page.getByText(ITEM).first()).toBeVisible();

    await page.goto("/parametres/catalogue");
    await page.getByRole("button", { name: new RegExp(ITEM) }).first().click();
    await page.getByRole("dialog").getByRole("button", { name: "Supprimer" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Confirmer la suppression" }).click();
    await expect(page.getByText("Article supprimé.")).toBeVisible();
    await expect(page.getByRole("row", { name: new RegExp(ITEM) })).toHaveCount(0);
  });

  test("salaires : salaire de base, paiement prérempli, modification et suppression", async ({ page }) => {
    await login(page);
    await page.goto("/depenses");
    const who = "Paul Essomba";
    // Salaire de base (création / modification)
    await page.getByRole("button", { name: `Salaire de base de ${who}` }).click();
    let dlg = page.getByRole("dialog");
    await dlg.getByLabel("Salaire mensuel").fill("80000");
    await dlg.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page.getByText("Salaire de base enregistré.")).toBeVisible();
    const row = page.locator("li", { hasText: who }).first();
    await expect(row).toContainText(/80\s?000/);

    // Paiement : montant prérempli avec le salaire de base (le mois peut déjà être payé : on supprime d'abord)
    while (await page.getByRole("button", { name: `Supprimer le paiement de ${who}` }).count()) {
      await page.getByRole("button", { name: `Supprimer le paiement de ${who}` }).first().click();
      await page.getByRole("dialog").getByRole("textbox").fill("Test e2e : remise à zéro");
      await page.getByRole("dialog").getByRole("button", { name: "Supprimer" }).click();
      await expect(page.getByText("Paiement supprimé.").first()).toBeVisible();
    }
    await row.getByRole("button", { name: "Payer" }).click();
    dlg = page.getByRole("dialog");
    await expect(dlg.getByLabel("Montant")).toHaveValue(/80\s?000/);
    await dlg.getByRole("button", { name: /Enregistrer/ }).click();
    await expect(page.getByText("Salaire enregistré.")).toBeVisible();

    // Modification du paiement
    await page.getByRole("button", { name: `Modifier le paiement de ${who}` }).click();
    dlg = page.getByRole("dialog");
    await dlg.getByLabel("Montant").fill("85000");
    await dlg.getByRole("button", { name: /Enregistrer/ }).click();
    await expect(page.getByText("Modification enregistrée.")).toBeVisible();
    await expect(page.locator("li", { hasText: who }).first()).toContainText(/85\s?000/);

    // Suppression du paiement, puis retour au salaire de base d'origine
    await page.getByRole("button", { name: `Supprimer le paiement de ${who}` }).click();
    await page.getByRole("dialog").getByRole("textbox").fill("Test e2e : paiement en double");
    await page.getByRole("dialog").getByRole("button", { name: "Supprimer" }).click();
    await expect(page.getByText("Paiement supprimé.")).toBeVisible();
    await page.getByRole("button", { name: `Salaire de base de ${who}` }).click();
    await page.getByRole("dialog").getByLabel("Salaire mensuel").fill("75000");
    await page.getByRole("dialog").getByRole("button", { name: "Enregistrer" }).click();
    await expect(page.getByText("Salaire de base enregistré.")).toBeVisible();
  });

  test("encaissements : accessibles depuis l'accueil, filtres jour / mois / période", async ({ page }) => {
    await login(page);
    await page.getByRole("link", { name: "Détail" }).click();
    await expect(page).toHaveURL(/\/encaissements/);
    await expect(page.getByRole("heading", { name: "Encaissements" })).toBeVisible();
    await expect(page.getByText("Aujourd'hui", { exact: true })).toBeVisible();
    // Filtre par mois puis par période personnalisée.
    await page.getByLabel("Période", { exact: true }).selectOption("mois");
    await expect(page).toHaveURL(/periode=mois&mois=\d{4}-\d{2}/);
    await expect(page.getByText(/Total encaissé/)).toBeVisible();
    await page.getByLabel("Période", { exact: true }).selectOption("perso");
    await expect(page).toHaveURL(/periode=perso&du=/);
  });
});
