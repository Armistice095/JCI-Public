#!/usr/bin/env bash
# Lance faux backend + serveur de dev puis les tests navigateur. Usage : tests/run.sh [dossier-captures]
cd "$(dirname "$0")/.."
pkill -f "vite dev" 2>/dev/null; pkill -f mock-api.mjs 2>/dev/null; sleep 1
node tests/mock-api.mjs > /tmp/mock.log 2>&1 &
PUBLIC_API_URL=http://127.0.0.1:4010 PUBLIC_TURNSTILE_SITE_KEY=test-key npx vite dev --port 5180 > /tmp/dev.log 2>&1 &
sleep 6
node tests/e2e.mjs "${1:-/tmp/shots}" && node tests/e2e-achat.mjs "${1:-/tmp/shots}" && node tests/e2e-retour.mjs "${1:-/tmp/shots}" && node tests/e2e-accueil.mjs && node tests/e2e-captcha.mjs
