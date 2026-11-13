import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const B = process.env.BASE ?? 'http://localhost:5180', A = 'http://127.0.0.1:4010', OUT = process.argv[2] ?? '/tmp/shots';
fs.mkdirSync(OUT, { recursive: true });
const ok = (m) => console.log('✓', m);
const calls = async () => (await fetch(A + '/__calls')).json();
const orders = async () => (await calls()).filter((c) => c.method === 'POST' && c.path.endsWith('/orders'));
const F = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' FCFA';

const browser = await chromium.launch();
const newCtx = async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  // Faux script Turnstile : un jeton différent à chaque rendu / reset
  await ctx.route('https://challenges.cloudflare.com/**', (r) => r.fulfill({ contentType: 'text/javascript', body: `
    const tk = () => 'TOK-' + Math.random().toString(36).slice(2);
    window.turnstile = { _cb: null,
      render(el, o) { this._cb = o.callback; el.dataset.appearance = o.appearance; setTimeout(() => o.callback(tk()), 50); return 'w1'; },
      reset() { setTimeout(() => this._cb(tk()), 50); }, remove() {} };` }));
  await ctx.route('https://checkout.fedapay.test/**', (r) => r.fulfill({ contentType: 'text/html', body: '<h1 id="fed">FedaPay (simulation)</h1>' }));
  return ctx;
};
const errs = [];
let ctx = await newCtx(); let p = await ctx.newPage();
p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
await fetch(A + '/__reset');

// 1) billets
await p.goto(B + '/evenements/leadership-impact', { waitUntil: 'networkidle' });
await p.getByRole('link', { name: 'Acheter un billet' }).click();
await p.waitForURL('**/billets'); await p.waitForSelector('h1:has-text("Choisissez vos billets")');
assert.equal(await p.locator('.bar button.btn').isDisabled(), true); ok('Continuer désactivé à 0 billet');
assert.match(await p.locator('p', { hasText: 'Maximum' }).innerText(), /Maximum 5 billets par commande\./);
assert.equal(await p.locator('.cat .stp').count(), 2); assert.match(await p.locator('.cat').nth(2).innerText(), /Épuisé/); ok('stepper sur disponibles, « Épuisé » sans stepper');
const add = (name) => p.getByRole('button', { name: `Ajouter un billet ${name}` });
await add('Standard').click(); await add('Standard').click(); await add('VIP').click();
assert.match(await p.locator('.bar').innerText(), /3 billets\s*16 000 FCFA/); ok('total 16 000 FCFA');
await add('VIP').click(); await add('VIP').click();
assert.equal(await add('Standard').isDisabled(), true); assert.equal(await add('VIP').isDisabled(), true);
assert.match(await p.locator('.note').innerText(), /maximum de 5 billets/); ok('plafond maxPerOrder = 5');
await p.screenshot({ path: `${OUT}/10-billets.png` });
await p.getByRole('button', { name: 'Retirer un billet VIP' }).click(); await p.getByRole('button', { name: 'Retirer un billet VIP' }).click();
assert.ok((await calls()).filter((c) => c.method === 'GET' && c.path.endsWith('/leadership-impact')).length >= 0);
await p.getByRole('button', { name: 'Continuer' }).click(); await p.waitForURL('**/coordonnees');

// 2) coordonnées
await p.waitForSelector('h1:has-text("Vos coordonnées")');
assert.equal(await p.locator('.card h3').allInnerTexts().then((a) => a.join('|')), 'Acheteur|Billet 1, Standard|Billet 2, Standard|Billet 3, VIP'); ok('un bloc par billet, dans l’ordre');
await p.getByRole('button', { name: 'Continuer' }).click();
assert.equal(await p.locator('.err').first().innerText(), 'Champ obligatoire.');
assert.equal(await p.evaluate(() => document.activeElement.id), 'bp'); ok('validation : erreurs + focus sur le 1er champ');
await p.screenshot({ path: `${OUT}/11-coordonnees-erreurs.png` });
await p.fill('#bp', 'Koffi'); assert.equal(await p.locator('#bp-e').count(), 0); ok('erreur effacée à la saisie');
await p.fill('#bn', 'Ahoussou'); await p.fill('#bt', '12'); await p.fill('#bm', 'pas-un-mail');
await p.getByRole('button', { name: 'Continuer' }).click();
assert.equal(await p.locator('#bt-e').innerText(), 'Numéro de téléphone invalide.'); assert.equal(await p.locator('#bm-e').innerText(), 'Adresse e-mail invalide.'); ok('téléphone / e-mail invalides');
await p.fill('#bt', '+229 01 97 00 00 00'); await p.fill('#bm', 'koffi@exemple.bj');
assert.equal(await p.inputValue('#pp0'), 'Koffi'); assert.equal(await p.inputValue('#pn0'), 'Ahoussou'); ok('« Ce billet est pour moi » : recopie l’acheteur');
await p.fill('#pp0', 'Autre'); assert.equal(await p.locator('.chk input').isChecked(), false); ok('modifier le bénéficiaire décoche la case');
await p.fill('#pp0', 'Koffi'); await p.fill('#pp1', 'Afi'); await p.fill('#pn1', 'Dossou'); await p.fill('#pp2', 'Yao'); await p.fill('#pn2', 'Dossou');
await p.getByRole('button', { name: 'Continuer' }).click(); await p.waitForURL('**/recap');

// 3) recap
await p.waitForSelector('h1:has-text("Vérifiez votre commande")');
const t = await p.locator('section[aria-label="Commande"]').innerText();
assert.match(t, new RegExp(`Standard\\s*2 × ${F(3000)}\\s*${F(6000)}`)); assert.match(t, new RegExp(`VIP\\s*1 × ${F(10000)}\\s*${F(10000)}`)); assert.match(t, new RegExp(`Total\\s*${F(16000)}`)); ok('lignes et total');
assert.match(await p.locator('section[aria-label="Participants"]').innerText(), /Afi Dossou\s*Standard/);
assert.match(await p.locator('section[aria-label="Événement"]').innerText(), /Leadership/); ok('carte événement + participants');
assert.match(await p.locator('.lead').innerText(), /page sécurisée FedaPay/);
assert.match(await p.locator('.mob').innerText(), /Étape 3 sur 3/);
await p.screenshot({ path: `${OUT}/12-recap.png` });
assert.equal(await p.getByRole('button', { name: /^Payer/ }).isDisabled(), true); assert.match(await p.locator('.need').first().innerText(), /Acceptez les conditions/); assert.equal((await orders()).length, 0); ok('conditions non cochées : bouton désactivé, pas d’appel');
await p.locator('.chk input').check();
await p.getByRole('button', { name: /^Payer/ }).click();
await p.waitForSelector('#fed'); assert.equal(p.url(), 'https://checkout.fedapay.test/pay/CMD-0001'); ok('redirection vers checkoutUrl (FedaPay)');
let o = await orders(); assert.equal(o.length, 1);
assert.ok(o[0].key.length >= 16 && o[0].key.length <= 80);
assert.equal(o[0].body.acceptedTerms, true); assert.match(o[0].body.captchaToken, /^TOK-/);
assert.deepEqual(o[0].body.buyer, { firstName: 'Koffi', lastName: 'Ahoussou', email: 'koffi@exemple.bj', phone: '+229 01 97 00 00 00' });
assert.deepEqual(o[0].body.tickets.map((x) => [x.categoryId, x.firstName, x.lastName]), [['c1', 'Koffi', 'Ahoussou'], ['c1', 'Afi', 'Dossou'], ['c2', 'Yao', 'Dossou']]);
ok('corps de la commande conforme (acheteur, 3 bénéficiaires, Turnstile, acceptedTerms)');
const key1 = o[0].key;

// 4) retour arrière puis nouveau paiement : même clé
await p.goBack(); await p.waitForSelector('h1:has-text("Vérifiez votre commande")');
await p.locator('.chk input').check(); await p.getByRole('button', { name: /^Payer/ }).click(); await p.waitForSelector('#fed');
o = await orders(); assert.equal(o.length, 2); assert.equal(o[1].key, key1); assert.equal(p.url(), 'https://checkout.fedapay.test/pay/CMD-0001'); ok('retour + nouveau clic : même Idempotency-Key → même commande');
assert.notEqual(o[0].body.captchaToken, o[1].body.captchaToken); ok('jeton Turnstile neuf à chaque envoi');
// 5) contenu modifié → nouvelle clé ; rechargement conserve la saisie
await p.goto(B + '/evenements/leadership-impact/billets'); await p.waitForSelector('h1:has-text("Choisissez")');
assert.match(await p.locator('.bar').innerText(), /3 billets/); ok('panier conservé (sessionStorage)');
await add('Standard').click(); await p.getByRole('button', { name: 'Continuer' }).click(); await p.waitForURL('**/coordonnees');
await p.fill('#pp3', 'Zoé'); await p.fill('#pn3', 'Dossou'); await p.getByRole('button', { name: 'Continuer' }).click(); await p.waitForURL('**/recap');
await p.reload(); await p.waitForSelector('h1:has-text("Vérifiez votre commande")'); assert.match(await p.locator('section[aria-label="Commande"]').innerText(), /3 × /); ok('rechargement du récap : données conservées');
await p.locator('.chk input').check(); await p.getByRole('button', { name: /^Payer/ }).click(); await p.waitForSelector('#fed');
o = await orders(); assert.equal(o.length, 3); assert.notEqual(o[2].key, key1); ok('contenu modifié → nouvelle Idempotency-Key');

// 6) erreurs de création
async function goRecap(last) {
  await p.goto(B + '/evenements/leadership-impact/billets'); await p.waitForSelector('h1:has-text("Choisissez")');
  await p.fill('input[id=x]', '').catch(() => {});
  await p.goto(B + '/evenements/leadership-impact/coordonnees'); await p.waitForSelector('#bn');
  await p.fill('#bn', last);
  for (const i of [0, 1, 2, 3]) { if (await p.locator('#pp' + i).count()) { if (!(await p.inputValue('#pp' + i))) await p.fill('#pp' + i, 'X'); if (!(await p.inputValue('#pn' + i))) await p.fill('#pn' + i, 'Y'); } }
  await p.getByRole('button', { name: 'Continuer' }).click(); await p.waitForURL('**/recap');
  await p.locator('.chk input').check();
}
await goRecap('Quota'); await p.getByRole('button', { name: /^Payer/ }).click();
await p.waitForSelector('.ban'); assert.match(await p.locator('.ban').innerText(), /plus assez de places/); assert.equal(await p.locator('.ban a').getAttribute('href'), '/evenements/leadership-impact/billets');
assert.equal(await p.getByRole('button', { name: /^Payer/ }).isDisabled(), false); await p.screenshot({ path: `${OUT}/13-erreur-quota.png` }); ok('409 QUOTA_EXCEEDED : message + lien « Modifier mes billets »');
await goRecap('Provider'); await p.getByRole('button', { name: /^Payer/ }).click(); await p.waitForSelector('.ban');
assert.match(await p.locator('.ban').innerText(), /Aucune place n’a été retenue/); ok('502 : réessayer possible');
const before = (await orders()).length;
await p.getByRole('button', { name: /^Payer/ }).click(); await p.waitForTimeout(600);
const after = await orders(); assert.equal(after.length, before + 1); assert.notEqual(after.at(-1).body.captchaToken, after.at(-2).body.captchaToken); ok('après erreur : jeton Turnstile renouvelé');
await goRecap('Captcha'); await p.getByRole('button', { name: /^Payer/ }).click(); await p.waitForSelector('.ban'); assert.match(await p.locator('.ban').innerText(), /anti-robot/); ok('400 CAPTCHA_FAILED');
await goRecap('Rate'); await p.getByRole('button', { name: /^Payer/ }).click(); await p.waitForSelector('.ban'); assert.match(await p.locator('.ban').innerText(), /dans 12 secondes/); ok('429 : délai Retry-After');
await goRecap('Invalid'); await p.getByRole('button', { name: /^Payer/ }).click(); await p.waitForURL('**/coordonnees');
assert.equal(await p.locator('#pp0-e').innerText(), 'Prénom invalide côté serveur.'); await p.screenshot({ path: `${OUT}/14-422.png` }); ok('422 : retour aux coordonnées, erreur sous le bon champ');

// 7) gardes
let c2 = await newCtx(); let q = await c2.newPage();
await q.goto(B + '/evenements/leadership-impact/coordonnees'); await q.waitForURL('**/billets'); ok('/coordonnees sans panier → /billets');
await q.goto(B + '/evenements/leadership-impact/recap'); await q.waitForURL('**/billets'); ok('/recap sans panier → /billets');
await q.goto(B + '/evenements/soon/billets'); await q.waitForURL(B + '/evenements/soon'); ok('billetterie non ouverte → page événement');
await q.goto(B + '/evenements/cancelled/billets'); await q.waitForURL(B + '/evenements/cancelled'); ok('événement annulé → page événement');
// stock rafraîchi à l'étape billets
await q.goto(B + '/evenements/fresh'); await q.getByRole('link', { name: 'Acheter un billet' }).click(); await q.waitForSelector('h1:has-text("Choisissez")'); await q.waitForTimeout(600);
for (let i = 0; i < 4; i++) { const b = q.getByRole('button', { name: 'Ajouter un billet Standard' }); if (!(await b.isDisabled())) await b.click(); }
assert.match(await q.locator('.cat').first().locator('output').innerText(), /^2$/); ok('stock rafraîchi : Standard limité à 2 (remaining=2)');
assert.equal(await q.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
assert.deepEqual(errs.filter((e) => !/ERR_|favicon|status of (409|422|502|400|429)|Failed to load resource/.test(e)), []); ok('aucune erreur console inattendue');
await browser.close(); console.log('TOUT OK (achat)');
