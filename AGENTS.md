# AGENTS

## Contexte
Ce dépôt propose un serveur Express/Node.js avec une base SQLite et plusieurs interfaces web pour le projet Asgaria (visualisation de la carte, édition, gestion et administration).

## Spécifications du serveur de jeu
- Le projet constitue un serveur de jeu : toute action demandée par un client doit être validée par le serveur avant d'être appliquée.
- Si une action n'est pas réalisable, le serveur doit refuser son exécution et renvoyer une erreur explicite décrivant la cause de l'échec.

## Scripts et relations principales
- **server.js** : point d'entrée du serveur. Expose l'API REST, gère l'authentification, les transactions et les effets. Requiert `handleError.js`, `logger.js`, `effects.js`, `transactions.js`, `services/buildingService.js` et `services/notificationService.js`.
- **effects.js** : définit les classes d'effets appliquées par le serveur (production, stockage, sorts, etc.).
- **transactions.js** : applique les débits/crédits de ressources dans la base de données.
- **services/buildingService.js** : utilitaires pour consommer les ressources lors des constructions.
- **services/notificationService.js** : utilitaire pour envoyer des notifications aux utilisateurs.
- **services/changeLogService.js** : formate et enregistre les journaux des modifications administratives dans la table `admin_change_logs`, utilisés par `server.js`.
- **auth.js** : script inclus sur les pages client pour la connexion, la déconnexion et la navigation conditionnelle.
- **viewer.js** : affiche la carte en lecture seule.
- **script.js** : éditeur de carte permettant de modifier les baronnies et d'enregistrer les pixels.
- **src/mapCore.js** : fonctions communes de rendu/zoom utilisées par `viewer.js` et `script.js`.
- **src/mapFilters.js** : gestion des filtres et de la coloration de la carte, partagée par `viewer.js` et `script.js`.
- **src/crudRouter.js** : générateur de routes CRUD génériques utilisé par `server.js` pour réduire la duplication.
- La base de données inclut désormais une table `sanctuaries` (avec un statut actif/inactif), une table `canonical_lands` (relation entre deux baronnies) et les colonnes `priory_religion_id`, `church_religion_id`, `cathedral_religion_id` et `vacant` (baronnie vacante) dans la table `baronies`, `defacto_county_id` dans la table `viscounties`, ainsi que `player` et `bishop` dans la table `seigneurs`. La table `duchies` inclut aussi `banquet_religion_id` (religion gagnante de l'Enchère au Banquet, nullable).
- Les tables `barony_connections` et `maritime_zone_connections` incluent une colonne `distance` (par défaut 1) pour pondérer les distances entre baronnies ou zones maritimes.
- **admin.js** : interface d'administration des empires, royaumes, duchés, etc.
- L'onglet "Routes commerciales" d'**admin.js** inclut un import Excel (`.xlsx/.xls`) des paires de baronnies avec création en masse des routes manquantes via l'API serveur.
- **gestion.js** : gestion des seigneuries, ressources et sorts côté joueur.
- **profile.js** : modification du profil utilisateur.
- **organigramme.js** : affiche la page d’organigramme féodal des seigneurs (hiérarchie vassale, interactions et navigation).
- **renderHeader.js** : insère le fragment HTML du header commun côté client.
- **handleError.js** et **logger.js** : gestion des erreurs et du logging.
- Les pages HTML (`index.html`, `mapEditor.html`, `admin.html`, `gestion.html`, `profile.html`, `organigramme.html`) chargent ces scripts selon leur rôle.
- Les scripts client communiquent avec l'API du serveur via `fetch`.
- La base de données contient également une table `trade_transactions` (origine, destination, ressources, type, état, raison, décision, retour) pour enregistrer les échanges entre seigneuries. L'origine et la destination y sont stockées via les identifiants de seigneurie, les noms des seigneurs ou baronnies étant résolus dynamiquement. Les effets `land_transaction_max_per_month` et `naval_transaction_max_per_month` permettent d'augmenter les limites mensuelles de transactions.
- La table `trade_routes` inclut désormais un identifiant propre et un chemin (liste ordonnée d'identifiants de baronnies) pour définir la route commerciale.
- L'API serveur expose aussi `POST /api/trade_routes/import` (admin) pour importer des paires de baronnies, ignorer les routes déjà existantes et créer les chemins par défaut calculés côté serveur.
- La table `trade_lines` stocke les lignes commerciales maritimes (baronnies d'origine et de destination, chemin composé de zones maritimes).
- La table `admin_change_logs` trace les modifications effectuées via l'administration/`mapEditor` (table, entrée, utilisateur, description, données structurées et timestamp) et est consultable depuis l'onglet "Logs" d'`admin.html`.
- La table `user_table_preferences` stocke les préférences de visibilité de colonnes de l'administration par utilisateur.

## Instructions
- Garder ce fichier à jour : toute modification importante de l'architecture, des dépendances ou des relations entre scripts doit être répercutée ici.
- Ajouter ou supprimer des scripts majeurs nécessite d'actualiser la section "Scripts et relations principales".
- Les développements se font en JavaScript (CommonJS côté serveur, scripts front-end sans bundler) avec Node.js ≥14.
- Après toute modification du code, exécuter les vérifications disponibles (`npm test`, même si aucun test n'est défini) et corriger les erreurs le cas échéant.
- Après toute modification de l'API publique (routes, paramètres, schémas JSON, tables/champs exposés), mettre à jour `Documentation/API_PUBLIQUE.md` dans le même changement.
- Toute interface utilisateur destinée aux utilisateurs finaux doit être intégralement en français (100% des textes affichés).
