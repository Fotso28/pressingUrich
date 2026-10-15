import { expect, test, type Page } from "@playwright/test";

const ADMIN = process.env.E2E_ADMIN_USER ?? "gerant";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "gerant123";
const AGENT = `e2e${Date.now().toString(36)}`;
const AGENT_PASSWORD = "agent-e2e-1";
const PHONE = `6${String(Date.now()).slice(-8)}`;

async function login(page: Page, user: string, password: string) {
  await page.goto("/login");
  await page.fill("#login", user);
  await page.fill("#password", password);
  await page.click("button[type=submit]");
  await page.waitForURL("/");
}

test.describe.serial("Parcours du comptoir", () => {
  let orderUrl = "";

  test("le gérant crée un agent", async ({ page }) => {
    await login(page, ADMIN, ADMIN_PASSWORD);
    await page.goto("/parametres/utilisateurs");
    await page.getByRole("button", { name: "Nouveau compte" }).click();
    const dlg = page.getByRole("dialog");
    await dlg.getByLabel("Nom").fill("Agent Test");
    await dlg.getByLabel("Identifiant").fill(AGENT);
    await dlg.getByLabel("Mot de passe provisoire").fill(AGENT_PASSWORD);
    await dlg.getByRole("button", { name: "Créer le compte" }).click();
    await expect(page.getByText(`@${AGENT}`)).toBeVisible();
  });

  test("dépôt complet avec acompte", async ({ page }) => {
    await login(page, AGENT, AGENT_PASSWORD);
    // Ouverture de caisse depuis l'accueil
    await page.getByLabel("Fond de caisse").fill("10000");
    await page.getByRole("button", { name: "Ouvrir" }).click();
    await expect(page.getByText("Votre caisse n'est pas ouverte")).toBeHidden();

    await page.goto("/depot/nouveau");
    await page.getByRole("button", { name: "Nouveau client" }).click();
    const dlg = page.getByRole("dialog");
    await dlg.getByLabel("Nom complet").fill("Ngono Marie Test");
    await dlg.getByLabel("Téléphone").fill(PHONE);
    await dlg.getByRole("button", { name: "Créer le client" }).click();
    await expect(page.getByText("Ngono Marie Test").first()).toBeVisible();

    // 2 chemises en lavage + repassage, 1 pantalon
    await page.getByRole("button", { name: "Chemise", exact: true }).click();
    await page.getByRole("button", { name: /Lavage \+ repassage/ }).click();
    await page.getByRole("button", { name: "Plus" }).first().click();
    await page.getByRole("button", { name: "Pantalon", exact: true }).click();
    await page.getByRole("button", { name: /Lavage \+ repassage/ }).click();

    await page.getByLabel("Acompte").fill("1000");
    // Double clic : une seule commande doit être créée (RG-08)
    const submit = page.getByRole("button", { name: "Valider le dépôt" });
    await submit.dblclick();
    await page.waitForURL(/\/depot\/confirmation\//);
    await expect(page.getByText("Dépôt enregistré · Ticket n°")).toBeVisible();
    await page.getByRole("link", { name: "Voir la commande" }).click();
    await page.waitForURL(/\/commandes\//);
    orderUrl = page.url();
    await expect(page.getByText("Ngono Marie Test")).toBeVisible();
  });

  test("traitement puis retrait avec encaissement du solde", async ({ page }) => {
    await login(page, AGENT, AGENT_PASSWORD);
    await page.goto(orderUrl);
    await page.getByRole("button", { name: "Démarrer le traitement" }).click();
    await page.getByRole("button", { name: "Marquer prête" }).click();
    await expect(page.getByText("Prête", { exact: true }).first()).toBeVisible();

    await page.getByRole("button", { name: /Encaisser/ }).click();
    const dlg = page.getByRole("dialog");
    await dlg.getByRole("radio", { name: "MTN MoMo" }).click();
    await dlg.getByRole("button", { name: /^Encaisser/ }).click();
    await expect(page.getByText("Paiement enregistré.")).toBeVisible();

    await page.getByRole("button", { name: "Remettre au client" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Confirmer le retrait" }).click();
    await expect(page.getByText("Retirée", { exact: true }).first()).toBeVisible();
  });

  test("clôture de caisse sans écart", async ({ page }) => {
    await login(page, AGENT, AGENT_PASSWORD);
    await page.goto("/caisse");
    const rows = page.locator("tbody tr");
    const expected = async (label: string) => (await rows.filter({ hasText: label }).locator("td").last().innerText()).replace(/\D/g, "");
    const cash = await expected("Espèces"), momo = await expected("MTN MoMo"), om = await expected("Orange Money");
    await page.getByRole("button", { name: "Clôturer la caisse" }).click();
    const dlg = page.getByRole("dialog");
    await dlg.getByLabel("Compté Espèces").fill(cash);
    await dlg.getByLabel("Compté MTN MoMo").fill(momo);
    await dlg.getByLabel("Compté Orange Money").fill(om);
    await dlg.getByRole("button", { name: "Confirmer la clôture" }).click();
    await page.waitForURL(/\/caisse\/.+\?cloture=1/);
    await expect(page.getByText("Caisse clôturée.").first()).toBeVisible();
  });

  test("un agent n'accède pas aux pages du gérant", async ({ page }) => {
    await login(page, AGENT, AGENT_PASSWORD);
    await page.goto("/rapports");
    await page.waitForURL(/\/\?refus=1/);
    await expect(page.getByText("Cette page est réservée au gérant.")).toBeVisible();
    const res = await page.request.get("/api/export/commandes");
    expect(res.status()).toBe(403);
  });
});
