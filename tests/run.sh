#!/bin/sh
# Démarre les émulateurs Firebase, lance toutes les suites, puis arrête tout. À lancer depuis la racine du dépôt.
set -e
cd "$(dirname "$0")/.."
${FIREBASE_BIN:-npx --yes firebase-tools@latest} emulators:exec --only auth,firestore,functions --project noova-366d0 "node tests/run.js"
