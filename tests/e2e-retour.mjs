import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const B = process.env.BASE ?? 'http://localhost:5180', A = 'http://127.0.0.1:4010', OUT = process.argv[2] ?? '/tmp/shots';
fs.mkdirSync(OUT, { recursive: true });
const ok = (m) => console.log('✓', m);
const TOKEN = 'v9ogxYVLzAt3WbrTncEdBZtn5dZtieSyoTn0pKAM4Dg';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
await ctx.route('https://checkout.fedapay.test/**', (r) => r.fulfill({ contentType: 'text/html', body: '<h1 id="fed">FedaPay</h1>' }));
const errs = []; const urls = [];
const open = async (ref, extra = '', memo) => {
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  p.on('framenavigated', (f) => f === p.mainFrame() && urls.push(f.url()));
  await p.addInitScript(() => sessionStorage.setItem('jci:checkout:leadership-impact', JSON.stringify({ qty: { c1: 2 }, buyer: { firstName: 'Koffi', lastName: 'A', phone: '1', email: 'k@e.bj' }, idemKey: 'old-key-old-key-old-key' })));
  if (memo) await p.addInitScript(([r, m]) => sessionStorage.setItem('jci:order:' + r, JSON.stringify(m)), [ref, memo]);
  await p.goto(`${B}/commande/${ref}?token=${TOKEN}&status=approved&id=541736${extra}`);
  return p;
};
const calls = async () => (await fetch(A + '/__calls')).json();

// 1) paiement réussi : vérification → payé → préparation des billets → liens
await fetch(A + '/__reset');
let p = await open('CMD-PAID', '', { slug: 'leadership-impact', email: 'koffi@exemple.bj' });
await p.waitForSelector('text=Nous vérifions votre paiement');
assert.match(await p.locator('main').innerText(), /Ne fermez pas cette page\./); assert.match(await p.locator('main').innerText(), /valide uniquement après la confirmation de notre serveur/);
assert.match(await p.locator('.cd').innerText(), /^1[45]:\d\d$/); ok('vérification + compte à rebours de réservation');
await p.waitForTimeout(300);
assert.equal(new URL(p.url()).search, ''); assert.equal(p.url().includes('token'), false); ok('jeton (et ?status=&id=) retirés de la barre d’adresse');
await p.screenshot({ path: `${OUT}/20-verification.png` });
await p.waitForSelector('text=Paiement confirmé', { timeout: 15000 });
assert.deepEqual(await p.evaluate(() => Object.keys(sessionStorage).filter((k) => k.startsWith('jci:'))), []); ok('après paiement : panier, coordonnées, clé d’idempotence et mémoire de commande effacés');
assert.match(await p.locator('main').innerText(), /Commande CMD-PAID, 6 000 FCFA\.\s*Vos billets ont été envoyés à koffi@exemple\.bj\./); ok('« Paiement confirmé » + e-mail mémorisé');
assert.match(await p.locator('main').innerText(), /Préparation de vos billets…/); ok('PAID sans fichiers prêts : « Préparation de vos billets… »');
await p.waitForSelector('text=Préparation de vos billets…', { state: 'detached', timeout: 8000 }); ok('polling continue jusqu’à filesReady');
await p.screenshot({ path: `${OUT}/21-paye.png` });
const gets = (await calls()).filter((c) => c.method === 'GET' && c.path.endsWith('/orders/CMD-PAID')).length;
await p.waitForTimeout(3500); assert.equal((await calls()).filter((c) => c.method === 'GET' && c.path.endsWith('/orders/CMD-PAID')).length, gets); ok('polling arrêté au statut final (' + gets + ' appels)');
await p.getByRole('button', { name: 'Voir mes billets' }).click();
assert.equal(await p.locator('.tk').count(), 2);
assert.match(await p.locator('.tk').first().innerText(), /JCI-2026-000121[\s\S]*KOFFI AHOUSSOU[\s\S]*Standard[\s\S]*non transférable/);
const hrefs = await p.locator('.tk').first().locator('a.btn').evaluateAll((a) => a.map((x) => [x.textContent.trim(), x.href, x.target, x.rel]));
assert.deepEqual(hrefs.map((h) => h[0]), ['Image', 'PDF', 'Partager sur WhatsApp']); assert.ok(hrefs.every((h) => h[2] === '_blank' && /noopener/.test(h[3]))); ok('billets : Image / PDF / partage, nouvel onglet noopener');
await p.screenshot({ path: `${OUT}/22-billets.png`, fullPage: true });
const pop = ctx.waitForEvent('page'); await p.locator('.tk').first().getByText('Partager sur WhatsApp').click(); const np = await pop; await np.waitForURL(/files/);
assert.match(np.url(), /\/files\/s1\.jpg/); ok('partage : repli en nouvel onglet quand le partage de fichier n’est pas possible'); await np.close();
await p.getByRole('button', { name: 'Commande' }).click(); await p.getByRole('link', { name: 'Retour à l’événement' }).click(); await p.waitForURL(B + '/evenements/leadership-impact'); ok('retour à l’événement (slug mémorisé)');

// 2) échec → réessayer
p = await open('CMD-FAIL', '', { slug: 'leadership-impact', email: 'k@e.bj' });
await p.waitForSelector('text=Le paiement n’a pas abouti'); assert.match(await p.locator('main').innerText(), /Le paiement a été refusé\. Aucun billet n’a été émis\./);
await p.screenshot({ path: `${OUT}/23-echec.png` });
await p.getByRole('link', { name: 'Contacter l’organisation' }).waitFor(); assert.equal(await p.getByRole('link', { name: 'Contacter l’organisation' }).getAttribute('href'), 'https://wa.me/2290197000000'); ok('échec : message API + contact organisation (WhatsApp)');
await p.getByRole('button', { name: 'Réessayer le paiement' }).click(); await p.waitForSelector('#fed'); assert.equal(p.url(), 'https://checkout.fedapay.test/retry/CMD-FAIL'); ok('« Réessayer » → retry-payment → nouveau checkoutUrl');
// sans mémoire (autre appareil) : pas de bouton sans destination
p = await open('CMD-FAIL'); await p.waitForSelector('text=Le paiement n’a pas abouti');
assert.equal(await p.getByRole('button', { name: 'Réessayer le paiement' }).count(), 0); ok('sans mémoire de l’événement : pas de bouton inutilisable');

// 2b) annulé chez FedaPay : la commande reste « en attente » côté serveur → on propose de réessayer
p = await ctx.newPage(); await p.goto(`${B}/commande/CMD-CANCEL?token=${TOKEN}&status=canceled&id=1`);
await p.waitForSelector('text=Le paiement n’a pas été finalisé'); assert.match(await p.locator('.cd').innerText(), /^1[45]:\d\d$/);
await p.screenshot({ path: `${OUT}/25-annule.png` });
assert.equal(await p.getByRole('button', { name: 'Réessayer le paiement' }).count(), 1); ok('paiement annulé : bouton « Réessayer » malgré statut serveur en attente');
await p.getByRole('button', { name: 'Réessayer le paiement' }).click(); await p.waitForURL('https://checkout.fedapay.test/retry/CMD-CANCEL'); ok('… et il reprend le paiement');
p = await ctx.newPage(); await p.goto(`${B}/commande/CMD-CANCEL?token=${TOKEN}&status=approved&id=1`); await p.waitForSelector('text=Nous vérifions votre paiement');
assert.equal(await p.getByRole('button', { name: 'Réessayer le paiement' }).count(), 0); ok('retour « approved » : jamais de bouton avant 45 s, simple vérification');

// 2c) en attente / échec : on garde le panier (l'acheteur peut réessayer)
p = await open('CMD-FAIL', '', { slug: 'leadership-impact', email: 'k@e.bj' }); await p.waitForSelector('text=Le paiement n’a pas abouti');
assert.equal(await p.evaluate(() => sessionStorage.getItem('jci:checkout:leadership-impact') !== null), true); ok('échec : panier conservé pour réessayer');

// 3) expirée → recommencer ; remboursement ; remboursée
p = await open('CMD-EXP', '', { slug: 'leadership-impact', email: 'k@e.bj' });
await p.waitForSelector('text=Commande expirée'); await p.screenshot({ path: `${OUT}/24-expiree.png` });
await p.getByRole('button', { name: 'Recommencer ma commande' }).click(); await p.waitForURL('**/evenements/leadership-impact/billets'); ok('expirée → recommencer (nouvel achat)');
p = await open('CMD-REFUND', '', { slug: 'leadership-impact', email: 'k@e.bj' });
await p.waitForSelector('text=Votre paiement sera remboursé'); assert.match(await p.locator('main').innerText(), /L’organisation vous rembourse/);
assert.equal(await p.getByRole('button', { name: /Réessayer|Recommencer/ }).count(), 0); ok('REFUND_REQUIRED : message seul, aucune relance');
p = await open('CMD-WEIRD'); await p.waitForSelector('text=Commande remboursée'); ok('REFUNDED');

// 4) jeton invalide / absent
p = await ctx.newPage(); await p.goto(`${B}/commande/CMD-PAID?token=court`); await p.waitForSelector('text=Commande introuvable'); ok('jeton absent/invalide : « Commande introuvable »');
p = await ctx.newPage(); await p.goto(`${B}/commande/CMD-INCONNUE?token=${TOKEN}`); await p.waitForSelector('text=Commande introuvable'); ok('commande inconnue (404) : même message');
const rp = await ctx.newPage(); const hdr = await (await rp.request.get(`${B}/commande/CMD-PAID?token=${TOKEN}`)).headers(); assert.equal(hdr['referrer-policy'], 'no-referrer'); ok('Referrer-Policy: no-referrer');
assert.deepEqual(errs.filter((e) => !/status of (404|409)|Failed to load resource|ERR_/.test(e)), []); ok('aucune erreur console inattendue');
await browser.close(); console.log('TOUT OK (retour)');
