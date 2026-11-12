import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const B = process.env.BASE ?? 'http://localhost:5180', A = 'http://127.0.0.1:4010', OUT = process.argv[2] ?? '/tmp/shots';
import fs from 'node:fs'; fs.mkdirSync(OUT, { recursive: true });
const calls = async () => (await fetch(A + '/__calls')).json();
const browser = await chromium.launch();
const ok = (m) => console.log('✓', m);

// 1) Page ouverte, bureau
let ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1, reducedMotion: 'no-preference' });
let p = await ctx.newPage();
const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
await fetch(A + '/__reset');
await p.goto(B + '/evenements/leadership-impact', { waitUntil: 'networkidle' });
await p.waitForTimeout(500);
assert.equal(await p.locator('h1').innerText(), 'Leadership & Impact');
assert.match(await p.locator('.facts').innerText(), /Samedi 28 novembre 2026\s*08h00 à 17h00/); ok('date/horaires en heure du Bénin');
assert.match(await p.locator('.facts').innerText(), /Centre des Congrès de Comé\s*Comé, Bénin/);
const rows = await p.locator('.cat').allInnerTexts();
assert.equal(rows.length, 3);
assert.match(rows[0], /3 000 FCFA\s*Disponible/); assert.match(rows[1], /10 000 FCFA\s*Plus que 4 places/); assert.match(rows[2], /Épuisé/); ok('catégories, prix, disponibilité');
assert.match(await p.locator('.pg').innerText(), /08h00\s*Accueil/); ok('programme 08h00');
assert.match(await p.locator('.bar').innerText(), /À partir de\s*3 000 FCFA/);
assert.equal(await p.locator('.bar a.btn').getAttribute('href'), '/evenements/leadership-impact/billets');
assert.equal(await p.locator('a[href^="https://wa.me/"]').getAttribute('href'), 'https://wa.me/2290197000000'); ok('WhatsApp wa.me chiffres');
const csp = (await (await fetch(B + '/evenements/leadership-impact')).headers.get('content-security-policy'));
assert.match(csp, /connect-src 'self' https:\/\/challenges\.cloudflare\.com http:\/\/127\.0\.0\.1:4010/); assert.doesNotMatch(csp, /connect-src[^;]*\shttps:(;|\s)/); ok('CSP : origine de l’API lue dans PUBLIC_API_URL, plus de https: générique');
assert.equal(await p.locator('details').count(), 5); // 3 informations + 2 FAQ
assert.equal(await p.locator('h2:has-text("Questions fréquentes")').count(), 1); ok('FAQ en accordéon sous Informations');
const hits = (await calls()).filter((c) => c.method === 'POST' && c.path.endsWith('/views'));
assert.equal(hits.length, 1); ok('1 seule vue, comptée par le navigateur');
assert.ok((await calls()).filter((c) => c.method === 'GET').length <= 1);
assert.equal(await p.evaluate(() => getComputedStyle(document.querySelector('#v')).getPropertyValue('--acc')), '#1553b8'); ok('accentColor appliqué');
// images: seule la couverture + la suivante chargées
const imgs = await p.locator('.sl img.main').count(); assert.equal(imgs, 2); ok('chargement différé des affiches (' + imgs + ' img)');
await p.screenshot({ path: `${OUT}/01-desktop-open.png`, fullPage: false });
// carrousel : flèche droite, pause
await p.locator('.car').focus(); await p.keyboard.press('ArrowRight'); await p.waitForTimeout(800);
assert.equal(await p.locator('.d.on').count(), 1);
assert.equal(await p.locator('.sl[aria-hidden="false"]').count(), 1);
assert.equal(await p.locator('.sl .fit').count(), 1); ok('image paysage : variante flou « fit »');
await p.screenshot({ path: `${OUT}/02-desktop-landscape-slide.png` });
await p.locator('.cc .ib').click(); const label = await p.locator('.cc .ib').getAttribute('aria-label'); assert.match(label, /Reprendre/);
const before = await p.locator('.d.on').count(); await p.waitForTimeout(5000);
assert.equal(await p.locator('.sl[aria-hidden="false"] .fit').count(), 1); ok('pause fonctionne (pas de défilement)');
await p.locator('.cc .ib').click(); await p.waitForTimeout(5200);
assert.equal(await p.locator('.sl[aria-hidden="false"] .fit').count(), 0); ok('autoplay 4,5 s reprend');
await p.evaluate(() => scrollTo(0, 99999)); await p.waitForTimeout(200);
await p.screenshot({ path: `${OUT}/03-desktop-bottom.png` });
// partage : repli presse-papiers
await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
await p.evaluate(() => { Object.defineProperty(navigator, 'share', { value: undefined, configurable: true }); scrollTo(0, 0); });
await p.locator('button[aria-label="Partager l’événement"]').click(); await p.waitForTimeout(300);
assert.equal(await p.locator('.toast').innerText(), 'Lien copié');
assert.equal(await p.evaluate(() => navigator.clipboard.readText()), B + '/evenements/leadership-impact'); ok('partage → lien copié');
assert.deepEqual(errs.filter((e) => !/ERR_|favicon/.test(e)), [], 'erreurs console'); ok('aucune erreur console');
await ctx.close();

// 2) mobile + sombre
ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: 'dark', isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
p = await ctx.newPage();
await p.goto(B + '/evenements/leadership-impact', { waitUntil: 'networkidle' }); await p.waitForTimeout(400);
assert.match(await p.locator('.cc .ib').getAttribute('aria-label'), /Reprendre/); ok('prefers-reduced-motion → carrousel en pause');
assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true); ok('pas de défilement horizontal (390 px)');
await p.screenshot({ path: `${OUT}/04-mobile-dark.png` });
await p.screenshot({ path: `${OUT}/05-mobile-dark-full.png`, fullPage: true });
await ctx.close();

// 3) états
ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
p = await ctx.newPage();
const exp = { soon: ['Billetterie bientôt ouverte', 'Bientôt disponible'], ended: ['Ventes terminées', 'Ventes terminées'], cancelled: ['Événement annulé', 'Événement annulé'], soldout: ['Billets épuisés', 'Billets épuisés'] };
for (const [slug, [pill, btn]] of Object.entries(exp)) {
  await p.goto(`${B}/evenements/${slug}`, { waitUntil: 'networkidle' });
  assert.match(await p.locator('.pill').nth(1).innerText(), new RegExp(pill));
  assert.equal(await p.locator('.bar button.btn').isDisabled(), true);
  assert.equal(await p.locator('.bar button.btn').innerText(), btn);
  assert.equal(await p.locator('.bar a.btn').count(), 0);
  assert.equal(await p.locator('.cat small').count(), 0 + (await p.locator('.cat small').count()) - (await p.locator('.cat .pr small').count()), 'ok');
  assert.equal(await p.locator('.cat .pr small').count(), 0, 'pas de disponibilité hors billetterie ouverte');
  if (slug === 'cancelled') assert.match(await p.locator('.ban').innerText(), /remboursés par e-mail/);
  await p.screenshot({ path: `${OUT}/06-state-${slug}.png` });
  ok('état ' + slug);
}
// 4) minimal : sections masquées
await p.goto(`${B}/evenements/minimal`, { waitUntil: 'networkidle' });
assert.equal(await p.locator('details').count(), 3); assert.equal(await p.locator('h2:has-text("Questions fréquentes")').count(), 0); assert.equal(await p.locator('a[href^="https://wa.me"]').count(), 0);
assert.equal(await p.locator('.car').count(), 0); assert.equal(await p.locator('h2:has-text("Programme")').count(), 0);
assert.equal(await p.locator('h2:has-text("Organisé par")').count(), 0); assert.equal(await p.locator('h2:has-text("À propos")').count(), 0);
assert.equal(await p.evaluate(() => document.querySelector('#v').style.getPropertyValue('--acc')), '');
ok('sections nulles masquées, pas de carrousel, pas de WhatsApp');
await p.screenshot({ path: `${OUT}/07-minimal.png` });
// 5) XSS / accent invalide
await p.goto(`${B}/evenements/xss`, { waitUntil: 'networkidle' });
assert.equal(await p.evaluate(() => window.__xss), undefined); assert.equal(await p.locator('h1 img').count(), 0);
assert.equal(await p.locator('h1').innerText(), '<img src=x onerror=alert(1)>');
assert.equal(await p.evaluate(() => document.querySelector('#v').style.getPropertyValue('--acc')), ''); ok('texte API échappé, accent invalide ignoré');
// 6) 404 / 500
let r = await p.goto(`${B}/evenements/nope`); assert.equal(r.status(), 404); assert.match(await p.locator('h1').innerText(), /Page introuvable/);
await p.screenshot({ path: `${OUT}/08-404.png` });
r = await p.goto(`${B}/evenements/boom`); assert.equal(r.status(), 503); ok('404 et 503 (API en erreur)');
// 7) cache : N visites = 1 appel API
await fetch(A + '/__reset'); for (let i = 0; i < 5; i++) await (await fetch(`${B}/evenements/soon`)).text();
const g = (await calls()).filter((c) => c.method === 'GET' && c.path.endsWith('/soon')); assert.ok(g.length <= 1); ok('cache serveur : 5 visites → ' + g.length + ' appel API');
await browser.close();
console.log('TOUT OK');
