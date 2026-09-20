# Sécurité et exploitation NOOVA

## Déjà en place
- Sauvegarde Firestore quotidienne (conservée 14 jours), restauration à la minute sur 7 jours (PITR) et protection contre la suppression de la base (activés le 2026-09-19).
- Tests de bout en bout dans `tests/` (`sh tests/run.sh`), lancés à chaque push par GitHub Actions.
- Mises à jour de dépendances proposées par Dependabot.

## À faire dans la console (actions du propriétaire)
### App Check (bloque les appels qui ne viennent pas de l'app)
1. https://www.google.com/recaptcha/admin : créer une clé reCAPTCHA **v3** pour le domaine `noovaoff.fr` (et `www.`).
2. Console Firebase > App Check > applications > enregistrer l'app web avec cette clé (secret).
3. Coller la clé publique dans `APP_CHECK_SITE_KEY` (variable en tête de chaque page, avant les bibliothèques Firebase) des trois pages (`app_DEF.html`, `noova_dashboard.html`, `noova_admin.html`), pousser.
4. Attendre 1 à 2 jours : Console > App Check > Metrics doit montrer ~100 % de requêtes « vérifiées » (Firestore, Functions, Storage).
5. Puis activer l'application (« Enforce ») pour Firestore et Storage dans la console, et passer `ENFORCE_APP_CHECK = true` dans `functions/index.js`, déployer les fonctions.
> Ne PAS activer l'application avant l'étape 4 : les utilisateurs dont la page est encore en cache seraient bloqués.

### Alertes
- Budget : Console Google Cloud > Facturation > Budgets et alertes > créer un budget mensuel (ex. 20 €) avec alertes à 50 / 90 / 100 %.
- Erreurs : Console Google Cloud > Monitoring > Alertes > créer une règle sur « Cloud Functions : exécutions en erreur » (> 5 sur 5 min) avec notification e-mail.
- Disponibilité : un contrôle de disponibilité (Monitoring > Uptime checks) sur https://noovaoff.fr/app-v2 et /dashboard.

## Restaurer une sauvegarde
`firebase firestore:backups:list --project noova-366d0` puis `firebase firestore:databases:restore --backup <nom> --database <nouvelle-base> --project noova-366d0` (restaure dans une NOUVELLE base, à vérifier avant de basculer).
