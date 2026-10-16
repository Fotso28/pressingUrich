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
    await dlg.getByLabel("Lavage + repassage").fill("1550");
    await expect(dlg.getByText("Multiple de 100 FCFA.")).toBeVisible();
    await expect(dlg.getByRole("button", { name: "Enregistrer" })).toBeDisabled();
    await dlg.getByLabel("Lavage + repassage").fill("2500");
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

  test("salaire : l'employé est choisi parmi les comptes utilisateurs", async ({ page }) => {
    await login(page);
    await page.goto("/depenses");
    await page.getByRole("button", { name: "Payer un salaire" }).click();
    const dlg = page.getByRole("dialog");
    const select = dlg.getByLabel("Employé");
    const first = await select.locator("option:not([disabled])").first();
    const name = (await first.textContent())!.split(" — ")[0];
    await select.selectOption({ label: (await first.textContent())! });
    await dlg.getByLabel("Montant").fill("45000");
    await dlg.getByRole("button", { name: /Enregistrer/ }).click();
    await expect(page.getByText("Salaire enregistré.")).toBeVisible();
    await expect(page.getByText(`Salaire ${name}`).first()).toBeVisible();
  });

  test("encaissements du jour : page de détail accessible depuis l'accueil", async ({ page }) => {
    await login(page);
    await page.getByRole("link", { name: "Détail" }).click();
    await expect(page).toHaveURL(/\/encaissements/);
    await expect(page.getByRole("heading", { name: "Encaissements du jour" })).toBeVisible();
  });
});
