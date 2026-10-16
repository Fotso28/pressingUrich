import { expect, test } from "@playwright/test";

const ADMIN = process.env.E2E_ADMIN_USER ?? "gerant";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "gerant123";

test("mode hors ligne : l'app s'ouvre sans réseau, dépôt enregistré puis synchronisé", async ({ page, context }) => {
  await page.goto("/login");
  await page.fill("#login", ADMIN);
  await page.fill("#password", ADMIN_PASSWORD);
  await page.click("button[type=submit]");
  await page.waitForURL("/");
  // Service worker installé et copie locale prête (catalogue, clients, numéros réservés).
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect.poll(async () => page.evaluate(async () => {
    return new Promise<number>((resolve) => {
      const req = indexedDB.open("keyval-store");
      req.onsuccess = () => {
        const tx = req.result.transaction("keyval", "readonly").objectStore("keyval").get("cp-offline-v1");
        tx.onsuccess = () => resolve((tx.result?.numbers?.length as number) ?? 0);
        tx.onerror = () => resolve(0);
      };
      req.onerror = () => resolve(0);
    });
  }), { timeout: 20_000 }).toBeGreaterThan(0);
  await page.reload(); // le service worker contrôle désormais la page

  // Coupure réseau : l'application s'ouvre quand même, en mode hors ligne.
  await context.setOffline(true);
  await page.goto("/");
  await expect(page).toHaveURL(/\/hors-ligne$/);
  await expect(page.getByText("Hors ligne", { exact: true })).toBeVisible();

  // Caisse ouverte si besoin, puis dépôt avec acompte.
  await page.getByRole("button", { name: "Caisse" }).click();
  const open = page.getByRole("button", { name: "Ouvrir" });
  if (await open.isVisible()) {
    await page.getByLabel("Fond de caisse").fill("5000");
    await open.click();
  }
  await page.getByRole("button", { name: "Nouveau dépôt" }).click();
  await page.getByRole("button", { name: "Nouveau client" }).click();
  const phone = `69${String(Date.now()).slice(-7)}`;
  await page.getByRole("dialog").getByLabel("Nom complet").fill("Client Hors Ligne");
  await page.getByRole("dialog").getByLabel("Téléphone").fill(phone);
  await page.getByRole("dialog").getByRole("button", { name: "Créer le client" }).click();
  await page.getByRole("button", { name: "Chemise", exact: true }).first().click();
  await page.getByRole("button", { name: /Lavage \+ repassage/ }).first().click();
  await page.getByLabel("Acompte").fill("500");
  await page.getByRole("button", { name: /Valider le dépôt/ }).click();
  const confirm = page.getByText(/Dépôt enregistré · Ticket n°/);
  await expect(confirm).toBeVisible();
  const ticket = (await confirm.innerText()).replace(/\D/g, "");

  // Retour du réseau : synchronisation automatique, le dépôt arrive sur le serveur avec son numéro réservé.
  await context.setOffline(false);
  await page.getByRole("button", { name: "Commandes" }).click();
  await expect(page.getByText("En ligne", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("non synchronisée")).toHaveCount(0, { timeout: 30_000 });
  await expect(page).toHaveURL(/\/hors-ligne$/); // pas de rechargement intempestif au retour du réseau
  const res = await page.request.get("/api/offline/snapshot");
  const snap = await res.json();
  expect(snap.orders.some((o: { number: number; customerName: string }) => String(o.number).padStart(6, "0").endsWith(ticket.slice(-6)) && o.customerName === "Client Hors Ligne")).toBe(true);
});
