// Anti-robots (Turnstile) : réseau lent, action demandée à l'acheteur, erreur avec code.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const B = process.env.BASE ?? 'http://localhost:5180', A = 'http://127.0.0.1:4010';
const ok = (m) => console.log('✓', m);
const browser = await chromium.launch();
const cats = (await (await fetch(A + '/api/v1/public/events/leadership-impact')).json()).categories;

async function recap(script) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.route('https://challenges.cloudflare.com/**', (r) => r.fulfill({ contentType: 'text/javascript', body: script }));
  await ctx.route('https://checkout.fedapay.test/**', (r) => r.fulfill({ contentType: 'text/html', body: '<h1 id="fed">FedaPay</h1>' }));
  await ctx.addInitScript((cats) => sessionStorage.setItem('jci:checkout:leadership-impact', JSON.stringify({ qty: { c1: 1 }, cats,
    buyer: { firstName: 'Koffi', lastName: 'A', phone: '+229 01 97 00 00 00', email: 'k@e.bj' }, holders: [{ firstName: 'Koffi', lastName: 'A' }], meIdx: 0 })), cats);
  const p = await ctx.newPage(); await p.goto(B + '/evenements/leadership-impact/recap'); await p.waitForSelector('h1:has-text("Vérifiez")');
  await p.locator('.chk input').check({ force: true });
  return { ctx, p };
}

// A) jeton très lent (17 s : l'ancien délai de 15 s échouait)
let { ctx, p } = await recap(`window.turnstile = { render(el, o) { setTimeout(() => o.callback('TOK-slow'), 17000); return 'w'; }, reset() {}, remove() {} };`);
await p.getByRole('button', { name: /^Payer/ }).first().click();
await p.getByRole('button', { name: 'Vérification…' }).first().waitFor(); assert.equal(await p.locator('button .sp:visible').count(), 1); ok('pastille de chargement (spinner) dans le bouton Payer');
await p.waitForSelector('#fed', { timeout: 30000 }); ok('jeton lent (17 s) : le paiement aboutit, bouton « Vérification… » pendant l’attente'); await ctx.close();

// B) Cloudflare demande une action : le widget est montré et amené à l'écran, puis le paiement part
({ ctx, p } = await recap(`window.turnstile = { render(el, o) { window.__o = o; setTimeout(() => o['before-interactive-callback']?.(), 100); return 'w'; }, reset() {}, remove() {} };`));
await p.getByRole('button', { name: /^Payer/ }).first().click();
await p.waitForSelector('.cap.show .caph'); assert.match(await p.locator('.caph').innerText(), /cochez la case/i); ok('vérification interactive : widget montré avec consigne');
await p.evaluate(() => window.__o.callback('TOK-solved')); await p.waitForSelector('#fed', { timeout: 10000 }); ok('après action de l’acheteur : paiement lancé'); await ctx.close();

// C) erreur Cloudflare avec code : message clair + widget visible, nouvel essai possible
({ ctx, p } = await recap(`window.turnstile = { render(el, o) { window.__o = o; setTimeout(() => o['error-callback']('110200'), 100); return 'w'; }, reset() {}, remove() {} };`));
await p.getByRole('button', { name: /^Payer/ }).first().click();
await p.waitForSelector('.ban'); assert.match(await p.locator('.ban').innerText(), /code 110200/); assert.ok(await p.locator('.cap.show').count()); ok('erreur Cloudflare : message avec code, widget visible'); await ctx.close();
await browser.close(); console.log('TOUT OK (captcha)');
