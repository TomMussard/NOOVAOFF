# NOOVA — dossier de specs

Ce dossier décrit les deux parcours de première utilisation à implémenter : l'app grand public (`noovaoff.fr/app`) et le dashboard commerçant (`noovaoff.fr/dashboard`).

Le backend existe déjà. Ces specs portent sur les parcours d'entrée et sur l'interface.

## Contenu

| Fichier | Contenu |
|---|---|
| `01-design-system.md` | Tokens, composants, règles visuelles |
| `02-parcours-user.md` | Onboarding utilisateur, écran par écran |
| `03-parcours-commercant.md` | Onboarding commerçant et dashboard |
| `04-modele-donnees.md` | Entités, statuts, événements à tracker |
| `05-criteres-acceptation.md` | Checklist de validation |
| `maquettes/noova-app-ecrans.html` | Maquettes visuelles des 8 écrans principaux |

Ouvrir `maquettes/noova-app-ecrans.html` dans un navigateur avant de coder : c'est la référence visuelle. Les classes CSS y sont déjà nommées et réutilisables.

## Principes directeurs

1. **Valeur avant friction.** L'utilisateur répond à une vraie question et voit le résultat avant qu'on lui demande de créer un compte.
2. **Permissions en contexte.** Aucune permission (contacts, géolocalisation, notifications) n'est demandée pendant l'inscription. Chacune arrive au moment où elle sert, précédée d'un écran d'explication maison avant la pop-up système.
3. **Pas de tutoriel.** Si un écran nécessite une explication, c'est l'écran qu'il faut corriger. Une seule bulle contextuelle sur la première question, et une page « Comment ça marche » accessible depuis le profil.
4. **États vides traités comme des écrans à part entière.** Au lancement il n'y a aucun commerçant partenaire et aucun ami : ce sont les états par défaut, pas des cas limites.
5. **Un seul élément jaune par écran**, porteur de l'action principale.

## Ordre d'implémentation recommandé

1. Design system (tokens + composants partagés app / dashboard)
2. Parcours user jusqu'à la première réponse
3. États vides et écrans de permission
4. Parcours commerçant jusqu'au dashboard non vérifié
5. Ma vitrine récompenses (5 paliers fixes à remplir) puis création de campagne
6. Affiche QR et réclamation en caisse

## Stack

À adapter à l'existant. Les specs sont agnostiques, mais elles supposent :
- une web app responsive mobile-first, installable en PWA ;
- un état de session persistant pour l'utilisateur anonyme (avant création de compte) ;
- un back-office de validation manuelle des commerçants côté équipe NOOVA.
