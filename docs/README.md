# NOOVA — documentation

## Fichiers du projet
| Fichier | Rôle |
|---|---|
| `index.html` | page d'accueil publique |
| `app_DEF.html` | app habitant (servie sur `/app-v2`, et `/app`) |
| `noova_dashboard.html` | dashboard commerçant (`/dashboard`) |
| `noova_admin.html` | back-office (admin uniquement) |
| `cgu.html`, `confidentialite.html` | pages légales (brouillons à valider par un juriste) |
| `firebase-messaging-sw.js`, `manifest.json`, `icons.js`, icônes | PWA / notifications |
| `functions/` | Cloud Functions (serveur) ; **tous les seuils et réglages : `functions/engagementConfig.js`** |
| `firestore.rules`, `firestore.indexes.json`, `storage.rules` | sécurité et index Firebase |
| `tests/` | tests de bout en bout (`sh tests/run.sh`) |
| `SECURITE.md` | sauvegardes, App Check, alertes, restauration |

## Modèle économique (à jour)
- Aucun abonnement, facture ni tarif côté commerçant : NOOVA est acheté par la ville et proposé aux commerçants avec un **quota fixe de questions par mois** (défaut réglable dans l'admin, quota propre par commerçant).
- **Points** : 10 par réponse pour les 3 premières réponses du jour (30 par jour au maximum), +50 de bienvenue, +5 la première fois qu'on répond à un commerçant ; expirent après 6 mois sans activité. Échangeables contre les récompenses des 5 paliers fixes des commerçants (150 / 300 / 500 / 900 / 1 500 pts) — voir `docs/NOOVA_POINTS_SYSTEM.md`.
- **NOOVS** (réponses suivantes) : monnaie virtuelle — bons chez les commerçants, retrait des pubs, concours, cash plus tard sous conditions. Plafonnés par jour, avec un délai de validation.

## Documents historiques (dans ce dossier)
Spécifications de parcours (`00-README.md`, `02-…`, `03-…`) et brief initial (`NOOVA_SPEC.md`) : utiles pour le contexte. `NOOVA_POINTS_SYSTEM.md` est, lui, à jour (modèle de points et de récompenses actuel).

## Archives
Les anciennes versions (app, dashboard de démo, maquettes, captures) ont été sorties du dépôt le 2026-09-20 ; elles restent dans l'historique Git (tag `avant-menage-2026-09-20`).
