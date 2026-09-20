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
- **Points** (3 premières réponses du jour) : échangeables contre les récompenses des commerçants.
- **NOOVS** (réponses suivantes) : monnaie virtuelle — bons chez les commerçants, retrait des pubs, concours, cash plus tard sous conditions. Plafonnés par jour, avec un délai de validation.

## Documents historiques (dans ce dossier)
Spécifications de parcours (`00-README.md`, `02-…`, `03-…`) et anciennes notes (`NOOVA_SPEC.md`, `NOOVA_POINTS_SYSTEM.md`) : utiles pour le contexte, pas à jour sur les prix et l'économie.

## Archives
Les anciennes versions (app, dashboard de démo, maquettes, captures) ont été sorties du dépôt le 2026-09-20 ; elles restent dans l'historique Git (tag `avant-menage-2026-09-20`).
