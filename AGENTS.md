# AGENTS

## Contexte
Ce dépôt propose un serveur Express/Node.js avec une base SQLite et plusieurs interfaces web pour le projet Asgaria (visualisation de la carte, édition, gestion et administration).

## Scripts et relations principales
- **server.js** : point d'entrée du serveur. Expose l'API REST, gère l'authentification, les transactions et les effets. Requiert `handleError.js`, `logger.js`, `effects.js`, `transactions.js`, `services/buildingService.js` et `services/notificationService.js`.
- **effects.js** : définit les classes d'effets appliquées par le serveur (production, stockage, sorts, etc.).
- **transactions.js** : applique les débits/crédits de ressources dans la base de données.
- **services/buildingService.js** : utilitaires pour consommer les ressources lors des constructions.
- **services/notificationService.js** : utilitaire pour envoyer des notifications aux utilisateurs.
- **auth.js** : script inclus sur les pages client pour la connexion, la déconnexion et la navigation conditionnelle.
- **viewer.js** : affiche la carte en lecture seule.
- **script.js** : éditeur de carte permettant de modifier les baronnies et d'enregistrer les pixels.
- **src/mapCore.js** : fonctions communes de rendu/zoom utilisées par `viewer.js` et `script.js`.
- **src/mapFilters.js** : gestion des filtres et de la coloration de la carte, partagée par `viewer.js` et `script.js`.
- La base de données inclut désormais une table `sanctuaries` (avec un statut actif/inactif), une table `canonical_lands` (relation entre deux baronnies) et les colonnes `priory_religion_id`, `church_religion_id`, `cathedral_religion_id`, `player` et `bishop` dans la table `baronies`.
- **admin.js** : interface d'administration des empires, royaumes, duchés, etc.
- **gestion.js** : gestion des seigneuries, ressources et sorts côté joueur.
- **profile.js** : modification du profil utilisateur.
- **handleError.js** et **logger.js** : gestion des erreurs et du logging.
- Les pages HTML (`index.html`, `mapEditor.html`, `admin.html`, `gestion.html`, `profile.html`) chargent ces scripts selon leur rôle.
- Les scripts client communiquent avec l'API du serveur via `fetch`.
- La base de données contient également une table `trade_transactions` (origine, destination, ressources, type, état, raison, décision) pour enregistrer les échanges entre seigneuries. Les effets `land_transaction_max_per_month` et `naval_transaction_max_per_month` permettent d'augmenter les limites mensuelles de transactions.

## Instructions
- Garder ce fichier à jour : toute modification importante de l'architecture, des dépendances ou des relations entre scripts doit être répercutée ici.
- Ajouter ou supprimer des scripts majeurs nécessite d'actualiser la section "Scripts et relations principales".
- Les développements se font en JavaScript (CommonJS côté serveur, scripts front-end sans bundler) avec Node.js ≥14.
- Après toute modification du code, exécuter les vérifications disponibles (`npm test`, même si aucun test n'est défini) et corriger les erreurs le cas échéant.
