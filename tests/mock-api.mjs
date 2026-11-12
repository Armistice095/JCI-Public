// Faux backend pour les tests : sert /api/v1/public/events/:slug (rendu serveur) et enregistre les appels.
import http from 'node:http';
const PORT = 4010;
const svg = (w, h, c) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="${c}"/><text x="20" y="40" fill="#fff" font-size="28">${w}x${h}</text></svg>`;
const base = (o = {}) => ({
  slug: 'leadership-impact', title: 'Leadership & Impact', category: 'CONFERENCE', accentColor: '#1553b8',
  description: 'Une journée pour inspirer, agir et transformer.\nConférences, ateliers pratiques.',
  status: 'PUBLISHED', salesStatus: 'OPEN', startsAt: '2026-11-28T07:00:00Z', endsAt: '2026-11-28T16:00:00Z',
  venueName: 'Centre des Congrès de Comé', city: 'Comé',
  posters: [
    { url: `http://127.0.0.1:${PORT}/img/p1.svg`, isCover: true },
    { url: `http://127.0.0.1:${PORT}/img/land.svg`, isCover: false },
    { url: `http://127.0.0.1:${PORT}/img/p3.svg`, isCover: false }
  ],
  programme: [{ time: '08:00', label: 'Accueil et installation' }, { time: '10:30', label: 'Conférence : oser diriger' }],
  organizers: [{ name: 'JCI Comé Excellence', description: 'organisation de jeunes citoyens actifs' }],
  categories: [
    { id: 'c1', name: 'Standard', priceXof: 3000, conditions: 'Accès à la conférence et aux ateliers', availability: 'AVAILABLE', remaining: 10, maxPerOrder: 5 },
    { id: 'c2', name: 'VIP', priceXof: 10000, conditions: 'Places réservées', availability: 'AVAILABLE', remaining: 4, maxPerOrder: 5 },
    { id: 'c3', name: 'Étudiant', priceXof: 1500, conditions: 'Justificatif demandé à l’entrée', availability: 'SOLD_OUT', remaining: 0, maxPerOrder: 5 }
  ],
  maxPerOrder: 5, contactEmail: 'contact@exemple.bj', contactPhone: '+229 01 97 00 00 00',
  practicalInfo: 'Ouverture des portes à 07h30.', ticketTerms: 'Billet personnel.', refundPolicy: 'Remboursement si annulation.',
  infoSources: { practicalInfo: 'event', ticketTerms: 'default', refundPolicy: 'default' },
  faq: [{ question: 'Combien de temps mes places sont-elles réservées ?', answer: '15 minutes.' }, { question: 'Puis-je acheter plusieurs billets ?', answer: 'Oui, 5 au maximum.' }],
  og: { title: 'Leadership & Impact · JCI Comé Excellence', description: 'Samedi 28 novembre 2026 à Comé', imageUrl: `http://127.0.0.1:${PORT}/img/p1.svg` },
  ...o
});
const FIX = {
  open: base(),
  soon: base({ slug: 'soon', salesStatus: 'NOT_OPEN' }),
  ended: base({ slug: 'ended', salesStatus: 'CLOSED', status: 'CLOSED' }),
  cancelled: base({ slug: 'cancelled', status: 'CANCELLED', salesStatus: 'CLOSED' }),
  soldout: base({ slug: 'soldout', categories: base().categories.map((c) => ({ ...c, availability: 'SOLD_OUT', remaining: 0 })) }),
  minimal: base({ slug: 'minimal', accentColor: null, posters: [], faq: [], contactPhone: null, programme: [], organizers: [], description: '', og: { title: 'Minimal', description: 'd', imageUrl: null } }),
  fresh: base({ slug: 'fresh' }),
  xss: base({ slug: 'xss', title: '<img src=x onerror=alert(1)>', description: '<script>window.__xss=1</script>', accentColor: 'red;background:url(x)' })
};
export const calls = [];
const orders = new Map();
let freshHits = 0;
http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': 'Retry-After' };
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  if (u.pathname === '/__calls') { res.writeHead(200, { ...cors, 'content-type': 'application/json' }); return res.end(JSON.stringify(calls)); }
  if (u.pathname === '/__reset') { calls.length = 0; res.writeHead(204, cors); return res.end(); }
  if (u.pathname.startsWith('/files/')) { res.writeHead(200, { ...cors, 'content-type': u.pathname.endsWith('.pdf') ? 'application/pdf' : 'image/svg+xml' }); return res.end(svg(10, 10, '#000')); }
  const img = u.pathname.match(/^\/img\/(.+)\.svg$/);
  if (img) { const d = { p1: [400, 500, '#16103f'], p3: [400, 500, '#1553b8'], land: [800, 450, '#17703f'] }[img[1]]; res.writeHead(200, { ...cors, 'content-type': 'image/svg+xml' }); return res.end(svg(...d)); }
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => handle(req, res, u, cors, Buffer.concat(chunks).toString()));
}).listen(PORT, () => console.log('mock api on', PORT));
const seen = new Map();
const tk = (ready) => [1, 2].map((i) => ({ number: 'JCI-2026-00012' + i, holderName: i === 1 ? 'Koffi Ahoussou' : 'Afi Dossou', category: 'Standard', filesReady: ready,
  pdfUrl: ready ? `http://127.0.0.1:${PORT}/files/t${i}.pdf?sig=abc` : null, imageUrl: ready ? `http://127.0.0.1:${PORT}/files/t${i}.png?sig=abc` : null, shareVisualUrl: ready ? `http://127.0.0.1:${PORT}/files/s${i}.jpg?sig=abc` : null }));
function orderStatus(ref, token) {
  const n = (seen.set(ref, (seen.get(ref) ?? 0) + 1), seen.get(ref));
  const base = { reference: ref, eventTitle: 'Leadership & Impact', amountXof: 6000, reservedUntil: new Date(Date.now() + 14 * 60000 + 30000).toISOString(), message: null, tickets: [] };
  if (ref === 'CMD-PAID') return n < 2 ? { ...base, status: 'PENDING_PAYMENT' } : n < 3 ? { ...base, status: 'PAYMENT_IN_PROGRESS' } : n < 4 ? { ...base, status: 'PAID', reservedUntil: null, tickets: tk(false) } : { ...base, status: 'PAID', reservedUntil: null, tickets: tk(true) };
  if (ref === 'CMD-CANCEL') return { ...base, status: 'PENDING_PAYMENT' };
  if (ref === 'CMD-FAIL') return { ...base, status: 'FAILED', message: 'Le paiement a été refusé. Aucun billet n’a été émis.' };
  if (ref === 'CMD-EXP') return { ...base, status: 'EXPIRED', reservedUntil: null, message: 'Le délai de paiement est dépassé.' };
  if (ref === 'CMD-REFUND') return { ...base, status: 'REFUND_REQUIRED', reservedUntil: null, message: 'Votre paiement a bien été reçu mais les places ne sont plus disponibles. L’organisation vous rembourse.' };
  if (ref === 'CMD-WEIRD') return { ...base, status: 'REFUNDED', reservedUntil: null, message: 'Votre commande a été remboursée.' };
  return null;
}
function handle(req, res, u, cors, raw) {
  const body = raw ? JSON.parse(raw) : null;
  calls.push({ method: req.method, path: u.pathname, xff: req.headers['x-forwarded-for'] ?? null, key: req.headers['idempotency-key'] ?? null, body });
  const json = (st, o) => { res.writeHead(st, { ...cors, 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
  const om = u.pathname.match(/^\/api\/v1\/public\/events\/([^/]+)\/orders$/);
  if (om && req.method === 'POST') {
    const last = body.buyer.lastName;
    if (last === 'Quota') return json(409, { code: 'QUOTA_EXCEEDED', message: 'Il ne reste plus assez de places pour cette catégorie.' });
    if (last === 'Invalid') return json(422, { code: 'VALIDATION_ERROR', message: 'Certaines données sont invalides.', details: { fields: { 'tickets.0.firstName': 'Prénom invalide côté serveur.' } } });
    if (last === 'Provider') return json(502, { code: 'PAYMENT_PROVIDER_ERROR', message: 'Indisponible' });
    if (last === 'Captcha') return json(400, { code: 'CAPTCHA_FAILED', message: 'La vérification anti-robot a échoué.' });
    if (last === 'Rate') { res.writeHead(429, { ...cors, 'content-type': 'application/json', 'retry-after': '12' }); return res.end(JSON.stringify({ code: 'RATE_LIMITED', message: 'Trop de requêtes.' })); }
    const key = req.headers['idempotency-key'];
    if (!orders.has(key)) orders.set(key, 'CMD-' + String(orders.size + 1).padStart(4, '0'));
    const ref = orders.get(key);
    return json(201, { reference: ref, accessToken: 'a'.repeat(32), amountXof: 1, reservedUntil: new Date(Date.now() + 900000).toISOString(), checkoutUrl: 'https://checkout.fedapay.test/pay/' + ref });
  }
  const st = u.pathname.match(/^\/api\/v1\/public\/orders\/([^/]+)$/);
  if (st && req.method === 'GET') {
    const tok = u.searchParams.get('token'); const o = tok && tok.length >= 20 ? orderStatus(st[1], tok) : null;
    return o ? json(200, o) : json(404, { code: 'NOT_FOUND', message: 'Commande introuvable.' });
  }
  const rt = u.pathname.match(/^\/api\/v1\/public\/orders\/([^/]+)\/retry-payment$/);
  if (rt && req.method === 'POST') return json(200, { reference: rt[1], accessToken: 'a'.repeat(32), amountXof: 6000, reservedUntil: new Date(Date.now() + 600000).toISOString(), checkoutUrl: 'https://checkout.fedapay.test/retry/' + rt[1] });
  const m = u.pathname.match(/^\/api\/v1\/public\/events\/([^/]+)(\/views)?$/);
  if (m) {
    if (m[2]) { res.writeHead(204, cors); return res.end(); }
    let ev = Object.values(FIX).find((f) => f.slug === m[1]);
    if (m[1] === 'fresh' && ++freshHits >= 2) ev = base({ slug: 'fresh', categories: base().categories.map((c) => c.id === 'c1' ? { ...c, remaining: 2 } : c) });
    if (m[1] === 'boom') { res.writeHead(500, { ...cors, 'content-type': 'application/json' }); return res.end('{}'); }
    if (ev) { res.writeHead(200, { ...cors, 'content-type': 'application/json' }); return res.end(JSON.stringify(ev)); }
    res.writeHead(404, { ...cors, 'content-type': 'application/json' });
    return res.end(JSON.stringify({ code: 'NOT_FOUND', message: 'Introuvable' }));
  }
  res.writeHead(404, cors); res.end();
}
