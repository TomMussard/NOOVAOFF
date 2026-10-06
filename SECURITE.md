# Sécurité et exploitation NOOVA

## 1. À faire tout de suite (incident du 6 octobre 2026)
Un testeur a eu accès à l'ensemble des données. La cause la plus probable est corrigée dans le code (voir 2.1) : n'importe qui pouvait créer un compte « e-mail + mot de passe » avec une adresse admin, sans la vérifier, et obtenir les droits admin. Il faut maintenant :

1. **Supprimer les faux comptes admin.** Console Firebase > Authentication > Utilisateurs : cherche `noovaoffr@gmail.com` et `tomussproduction@gmail.com`. Pour chacune, il ne doit rester qu'**un seul** compte, avec le fournisseur **Google** (icône G). Supprime tout compte avec l'icône « e-mail » (enveloppe) à ces adresses, et tout compte que tu ne reconnais pas.
2. **Sécuriser les deux comptes Google admin** : changer le mot de passe et activer la validation en deux étapes (myaccount.google.com > Sécurité). Révoquer les appareils inconnus.
3. **Changer le mot de passe d'application Gmail** utilisé pour les alertes (myaccount.google.com > Mots de passe des applications : supprimer l'ancien, en créer un nouveau), puis dans le terminal : `firebase functions:secrets:set SMTP_PASSWORD` et `firebase deploy --only functions`.
4. **Déployer tout** : `git pull` puis `firebase deploy --only firestore,storage,functions` (règles, index, stockage et fonctions). Ouvrir ensuite l'admin une fois : il remplit les nouvelles copies publiques (classement, profils d'amis, vitrines).
5. **Vérifier les données** modifiées pendant l'incident : dans l'admin, la liste des commerçants (statut « vérifié » inattendu, diffusion activée), et dans la console Firestore les champs `points`, `monthlyQuestionQuota`, `isTest`, `broadcast`. En cas de doute, restaurer une sauvegarde (section 5) dans une nouvelle base pour comparer.
6. **Authentication > Paramètres** :
   - « Protection contre l'énumération des adresses e-mail » : activée ;
   - « Règles relatives aux mots de passe » : 8 caractères minimum, au moins une lettre et un chiffre ;
   - « Domaines autorisés » : ne garder que `noovaoff.fr`, `www.noovaoff.fr`, le domaine Vercel du projet et `localhost` ;
   - « Fournisseurs de connexion » : désactiver tout fournisseur inutilisé.
7. **Google Cloud > IAM** : vérifier que seuls vos comptes ont un rôle sur le projet `noova-366d0`.
8. **Déclaration CNIL** : si des données personnelles réelles (habitants ou commerçants) ont été consultées par une personne non autorisée, c'est une violation de données. Il faut la consigner dans le registre des violations (docs/RGPD.md) et, si elle présente un risque pour les personnes, la notifier à la CNIL sous 72 h (cnil.fr > Notifier une violation). Pendant le mois de test, avec des commerces fictifs et des testeurs informés, le risque est faible, mais la consignation reste obligatoire.

## 2. Ce qui protège NOOVA (6 octobre 2026)
### 2.1 Accès administrateur
- Un compte n'est admin que si son e-mail est l'un des e-mails NOOVA **et vérifié** (connexion Google). Contrôlé à trois endroits : règles Firestore, règles Storage, et chaque fonction admin (`functions/lib.js`, `isAdminRequest`). La page admin applique la même condition.

### 2.2 Données personnelles (minimisation)
- `users/{uid}` (e-mail, âge, centres d'intérêt, appareils, points) : lisible **uniquement** par l'habitant lui-même et l'admin.
- `merchants/{uid}` (e-mail, téléphone, gérant, SIRET, pièce d'identité) : lisible **uniquement** par le commerçant et l'admin.
- Les autres comptes lisent des copies réduites, écrites **seulement** par le serveur (`functions/publicProfiles.js`) :
  - `cityBoard` : classement et groupes de la ville (prénom, photo, XP, série) ;
  - `publicProfiles` : profil vu par un ami **réciproque** ;
  - `merchantsPublic` : vitrine d'un commerce vérifié (nom, secteur, adresse, description, logo, photo).
- Un vote à la question de la semaine n'est visible que par son auteur.

### 2.3 Intégrité (triche, usurpation)
- Points, NOOVS, réponses, séries, compteurs, quotas : écrits uniquement par le serveur.
- À l'inscription, un habitant démarre à zéro (pas de série, de réponses, de rôle ni d'e-mail d'un autre) ; un commerçant démarre « en attente », sans quota, sans statut « test », sans diffusion.
- Un commerce vérifié ne peut changer ni de nom, ni de SIRET, ni de ville sans repasser par l'admin.
- Une question, une récompense ou une actualité porte toujours le nom réel du commerce.
- Commentaires, demandes d'ami : impossible de signer au nom d'un autre.
- Compteur de consentements : un habitant ne compte qu'une fois, même s'il envoie 100 événements.
- L'exemption de quota « mois de test » est vérifiée sur la fiche du commerçant (que seul le serveur peut marquer).

### 2.4 Injection de code (XSS)
- Tout texte saisi par un utilisateur est échappé avant affichage (`esc`) ; dans un attribut `onclick`, toujours `jsa(...)`, jamais `'${esc(x)}'` (l'attribut est décodé avant exécution).
- Les identifiants de documents créés par un client sont limités à `[A-Za-z0-9_-]`.
- Fichiers : PNG, JPEG, WebP, GIF, HEIC uniquement (jamais de SVG ni de HTML) ; PDF en plus pour les justificatifs.

### 2.5 En-têtes (vercel.json)
- HSTS, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`.
- CSP appliquée : `object-src 'none'; base-uri 'self'; frame-ancestors 'self'; form-action 'self'`.
- CSP complète en **observation** (`Content-Security-Policy-Report-Only`) : ouvrir la console du navigateur sur l'app, le dashboard et l'admin pendant quelques jours ; si aucun message « Content Security Policy » n'apparaît, copier cette politique dans `Content-Security-Policy` pour l'appliquer.

### 2.6 Tests automatiques
- `tests/security.js` joue l'attaquant (faux admin, lecture de données d'autrui, triche, usurpation, injection) : chaque attaque doit être refusée. Lancé avec toute la suite (`sh tests/run.sh`).

## 3. App Check (bloque les appels qui ne viennent pas de l'app)
1. https://www.google.com/recaptcha/admin : créer une clé reCAPTCHA **v3** pour le domaine `noovaoff.fr` (et `www.`).
2. Console Firebase > App Check > applications > enregistrer l'app web avec cette clé (secret).
3. Coller la clé **publique** dans `APP_CHECK_SITE_KEY` (variable en tête de chaque page, avant les bibliothèques Firebase) des trois pages (`app_DEF.html`, `noova_dashboard.html`, `noova_admin.html`), pousser.
4. Attendre 1 à 2 jours : Console > App Check > Metrics doit montrer ~100 % de requêtes « vérifiées » (Firestore, Functions, Storage).
5. Puis activer l'application (« Enforce ») pour Firestore et Storage dans la console, et passer `ENFORCE_APP_CHECK = true` dans `functions/index.js`, déployer les fonctions.
> Ne PAS activer l'application avant l'étape 4 : les utilisateurs dont la page est encore en cache seraient bloqués.

## 4. Alertes
- Budget : Console Google Cloud > Facturation > Budgets et alertes > créer un budget mensuel (ex. 20 €) avec alertes à 50 / 90 / 100 %.
- Erreurs : Console Google Cloud > Monitoring > Alertes > créer une règle sur « Cloud Functions : exécutions en erreur » (> 5 sur 5 min) avec notification e-mail.
- Disponibilité : un contrôle de disponibilité (Monitoring > Uptime checks) sur https://noovaoff.fr/app-v2 et /dashboard.

## 5. Sauvegardes et restauration
- Sauvegarde Firestore quotidienne (conservée 14 jours), restauration à la minute sur 7 jours (PITR) et protection contre la suppression de la base (activés le 2026-09-19).
- `firebase firestore:backups:list --project noova-366d0` puis `firebase firestore:databases:restore --backup <nom> --database <nouvelle-base> --project noova-366d0` (restaure dans une NOUVELLE base, à vérifier avant de basculer).

## 6. Règles pour faire évoluer le code sans rouvrir de faille
- Nouveau champ privé sur un habitant ou un commerçant : rien à faire, il n'est jamais copié dans les copies publiques (liste blanche dans `functions/publicProfiles.js`).
- Nouveau champ calculé par le serveur sur un habitant : l'ajouter à `userServerFields()` dans `firestore.rules`. Sur un commerçant : à `merchantAdminFields()`.
- Nouvelle fonction admin : commencer par `if (!require("./lib").isAdminRequest(request)) throw …`.
- Nouveau texte affiché : `esc(...)` dans le HTML, `jsa(...)` dans un `onclick`.
- Ajouter un cas d'attaque dans `tests/security.js` pour toute nouvelle collection.
