# RGPD : registre des traitements et obligations (NOOVA)

Document interne, à tenir à jour par l'équipe. Il ne remplace pas l'avis d'un juriste : à faire relire avant l'ouverture au public.

## 1. Responsable du traitement
NOOVA — [dénomination, forme, SIRET, adresse : à compléter, identiques aux mentions légales]. Contact données : noovaoffr@gmail.com.

## 2. Registre des activités de traitement (article 30)
| Traitement | Personnes | Données | Finalité | Base légale | Destinataires | Durée |
|---|---|---|---|---|---|---|
| Comptes habitants | Habitants (16 ans et +) | e-mail, prénom, ville, tranche d'âge, centres d'intérêt, photo (facultative), jetons de notification | Fournir le service | Contrat | Équipe NOOVA ; sous-traitants (Google Firebase) | Durée du compte |
| Réponses aux questions | Habitants | réponses, temps de réponse, profil pseudonyme (ville, âge, intérêts) | Études pour les commerces | Consentement (suivi d'un commerce) ; choix de répondre (découverte, sans profil) | Le commerce concerné (sans identité) ; NOOVA | Durée du compte |
| Points, NOOVS, récompenses | Habitants, commerçants | soldes, échanges, codes | Programme de fidélité | Contrat | Le commerce concerné (bon) | Durée du compte ; points : 6 mois d'inactivité |
| Fonctions sociales | Habitants | amis, classement de la ville (prénom, photo, XP, série), fil, compatibilité | Jeu et communauté | Contrat | Amis réciproques ; habitants de la ville (classement) | Durée du compte |
| Notifications | Habitants | jetons d'appareil, historique d'envoi et d'ouverture | Informer des nouvelles questions | Consentement | Google (FCM) | Durée du compte |
| Comptes commerçants | Commerçants (gérants) | e-mail, nom, téléphone, SIRET, adresse, pièce d'identité/Kbis | Vérifier et gérer les commerces | Contrat ; intérêt légitime (lutte contre la fraude) | Équipe NOOVA uniquement | Durée du compte ; pièce d'identité : supprimer après vérification (à mettre en place) |
| Sécurité et anti-fraude | Tous | temps de réponse, journaux techniques | Fiabilité des résultats | Intérêt légitime | Équipe NOOVA | 12 mois |
| Retours testeurs | Testeurs | note, remarques, prénom, e-mail, ville, appareil | Améliorer le service | Intérêt légitime | Équipe NOOVA | 24 mois |
| Alertes internes par e-mail | Habitants, commerçants | prénom, ville, e-mail du nouvel inscrit ; commerce à vérifier | Administration | Intérêt légitime | Équipe NOOVA (Gmail) | 12 mois |
| Mesure d'audience | Visiteurs | identifiants de mesure | Statistiques | Consentement | Google | 14 mois |

## 3. Sous-traitants (article 28)
Google (Firebase, Cloud, Gmail, Analytics), Vercel, Apple (connexion), OpenStreetMap (carte), Supabase (liste d'attente). Vérifier que les conditions de traitement des données (DPA) de chacun sont acceptées dans leur console (Google Cloud : « Data Processing Terms » ; Vercel : DPA dans les paramètres de l'équipe).

## 4. Sécurité (article 32)
Voir SECURITE.md, section 2 : accès limités par règles, copies publiques minimales, admin vérifié, chiffrement en transit, sauvegardes chiffrées, tests automatiques des attaques.

## 5. Violations de données (articles 33 et 34)
Registre des violations (obligatoire, même si non notifiée) :

| Date | Nature | Données et personnes concernées | Conséquences probables | Mesures prises | Notification CNIL / personnes |
|---|---|---|---|---|---|
| 2026-10-06 | Accès non autorisé par un testeur (droits admin obtenus sans e-mail vérifié, et lecture des fiches d'autres habitants de la même ville) | Phase de test : comptes testeurs et commerces fictifs | Faible (testeurs informés, données fictives côté commerces) | Faille corrigée (admin vérifié, données privées séparées, règles durcies), faux comptes à supprimer, mots de passe changés | [à décider : non notifiée si risque faible, justifier ici] |

Procédure : constater, contenir (corriger, couper l'accès), évaluer le risque, notifier la CNIL sous 72 h si risque, informer les personnes si risque élevé, consigner ici.

## 6. Droits des personnes
Accès, rectification, effacement (suppression du compte dans l'app), opposition, portabilité, limitation : réponse sous 30 jours à noovaoffr@gmail.com. Copie des données : export depuis l'admin ou la console.

## 7. À faire avant l'ouverture au public
- Compléter l'identité de l'éditeur dans les mentions légales, la politique de confidentialité et ce document.
- Supprimer automatiquement la pièce d'identité d'un commerçant après sa vérification (ou fixer une durée).
- Faire relire les CGU, la politique de confidentialité et le règlement des concours NOOVS par un juriste.
- Contrat avec chaque ville partenaire : rôle de la ville (destinataire de statistiques agrégées uniquement).
- Analyse d'impact (AIPD) : à évaluer si le service traite à grande échelle des profils (âge, centres d'intérêt) ; recommandé avant un lancement large.
