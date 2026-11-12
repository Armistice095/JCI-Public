import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const B = process.env.BASE ?? 'http://localhost:5180', A = 'http://127.0.0.1:4010';
const ok = (m) => console.log('✓', m);
const browser = await chromium.launch();
const p = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));

await fetch(A + '/__reset');
await p.goto(B + '/', { waitUntil: 'networkidle' });
const n = await p.locator('a.card').count();
assert.ok(n >= 3); ok(`accueil : ${n} événements publiés (clôturé/annulé absents)`);
assert.equal(await p.locator('a.card[href="/evenements/ended"]').count(), 0);
assert.equal(await p.locator('a.card[href="/evenements/soldout"]').locator('text=Billets épuisés').count(), 1); ok('épuisé signalé');
assert.equal(await p.locator('a.card[href="/evenements/soon"]').locator('text=Bientôt ouverte').count(), 1); ok('bientôt ouverte');
assert.ok((await p.locator('a.card').first().innerText()).includes('À partir de')); ok('prix « À partir de »');
assert.match(await p.locator('link[rel=canonical]').getAttribute('href'), /\/$/); ok('canonical');
await p.locator('a.card[href="/evenements/leadership-impact"]').click();
await p.waitForURL('**/evenements/leadership-impact'); ok('clic → page événement');

const sm = await fetch(B + '/sitemap.xml');
assert.equal(sm.status, 200); assert.match(sm.headers.get('content-type'), /xml/);
const xml = await sm.text();
assert.match(xml, /<loc>[^<]*\/evenements\/leadership-impact<\/loc><lastmod>2026-11-01T10:00:00.000Z<\/lastmod>/);
assert.ok(!xml.includes('/evenements/ended')); ok('sitemap.xml avec lastmod');
const rb = await (await fetch(B + '/robots.txt')).text();
assert.match(rb, /Sitemap: .*\/sitemap\.xml/); assert.match(rb, /Disallow: \/commande\//); ok('robots.txt + Sitemap');
assert.deepEqual(errs.filter((e) => !/favicon|Turnstile|challenges/.test(e)), []); ok('aucune erreur console');
await browser.close(); console.log('TOUT OK (accueil)');
