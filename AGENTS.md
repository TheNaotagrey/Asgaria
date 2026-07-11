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
- **viewer.js** : orchestre la carte principale en lecture seule à partir du ViewModel, centralise la sélection métier via `selectEntity(...)` et consomme les données déjà dérivées par les modules de la pile de carte.
- **script.js** : éditeur de carte permettant de modifier les baronnies et d'enregistrer les pixels.
- **src/mapCore.js** : runtime historique de rendu/zoom encore utilisé par `script.js` et les interfaces qui n'ont pas migré vers la pile ViewModel.
- **src/mapFilters.js** : gestion historique des filtres et de la coloration encore utilisée par l'éditeur de carte.
- **viewModel.js** : construit le modèle relationnel canonique (titres, liens de jure/de facto, terres canoniques, sanctuaires, connexions entre baronnies, routes/lignes commerciales et piété ducale dérivée). Les UI doivent consommer ses références (`barony.dejure.*`, `barony.defacto.*`, `title.defactoParent`, `title.defactoChildren`, `barony.tradeRoutes`, `barony.landTradeBaronies`, `duchy.pietyStatsByReligion`, `duchy.duchyPietyWinnerReligion`, etc.) et ses helpers plutôt que reconstruire les hiérarchies localement.
- **index.html**, **viewer.js**, **src/mapCanvasRuntime.js**, **src/mapFilterRuntime.js**, **src/mapFilterRegistry.js**, **src/mapDataLoader.js**, **src/viewModelLabels.js**, **src/mapInfoPanel.js** : pile principale basée sur `viewModel.js`. `mapCanvasRuntime` possède le runtime canvas partagé, expose le ViewModel chargé et sépare les clics carte (`onMapClick`) de la surbrillance (`highlightBaronies`) sans appliquer les filtres. `mapFilterRuntime` applique les filtres et maintient les cartes de couleur/patterns à partir d’un registre. Les filtres terrestres lisent les relations ViewModel (`canonicalLands`, `canonicalFor`, `sanctuaries`, `connectedBaronies`, `distanceToSelected`, `tradeRoutes`, `tradeLines`, `landTradeBaronies`, `seaTradeBaronies`, `duchyPietyWinnerReligion`) au lieu de maps parallèles. `mapFilterRegistry` est un registre déclaratif de définitions de filtres (`colorForBarony`, `selectEntityForBaronyClick`, `legendEntityForBarony`, `kind`) sans runtime d’application ni alias historique de sélection; les filtres dépendant de la baronnie sélectionnée utilisent `kind: 'baronyBasedOnSelected'`. `mapDataLoader` centralise le chargement API, la construction de `viewModel.js` et les index techniques non canoniques partagés par la carte et le futur éditeur ViewModel. `mapInfoPanel` rend les panneaux DOM sans reconstruire les hiérarchies.
- **index2.html** : redirection de compatibilité vers `index.html`, conservant la requête et l'ancre éventuelles.
- **Documentation/VIEWMODEL_CONTRACT.md** : documente le contrat canonique du ViewModel, les helpers publics et la règle de facto utilisée par les filtres et panneaux de la carte principale.
- **src/duchyPiety.js** : moteur partagé de calcul de la piété ducale (points détaillés, départage des égalités et religion gagnante), utilisé par `src/mapFilters.js` et `viewModel.js`; dans la pile principale, le résultat est exposé par le ViewModel au lieu d'être recalculé par les filtres.
- **src/crudRouter.js** : générateur de routes CRUD génériques utilisé par `server.js` pour réduire la duplication.
- La base de données inclut désormais une table `sanctuaries` (avec un statut actif/inactif), une table `canonical_lands` (relation entre deux baronnies) et les colonnes `priory_religion_id`, `church_religion_id`, `cathedral_religion_id` et `vacant` (baronnie vacante) dans la table `baronies`, `defacto_county_id` dans la table `viscounties`, ainsi que `player` et `bishop` dans la table `seigneurs`. La table `duchies` inclut aussi `banquet_religion_id` (religion gagnante de l'Enchère au Banquet, nullable).
- Les tables `barony_connections` et `maritime_zone_connections` incluent une colonne `distance` (par défaut 1) pour pondérer les distances entre baronnies ou zones maritimes.
- **admin.js** : interface d'administration des empires, royaumes, duchés, etc.
- L'onglet "Routes commerciales" d'**admin.js** inclut un import Excel (`.xlsx/.xls`) des paires de baronnies avec création en masse des routes manquantes via l'API serveur.
- **gestion.js** : gestion des seigneuries, ressources et sorts côté joueur, y compris l’interface de commerce qui affiche désormais les chemins terrestres/maritimes, prévisualise les trajets au survol et permet de construire des liaisons avec choix explicite du chemin.
- **src/updateCycle.js** : logique partagée du calendrier des "Mises à Jour" joueur (10 phases par an, libellés, comparaison, progression et dates de déblocage), utilisée par `server.js` et couverte par des tests.
- **profile.js** : modification du profil utilisateur.
- **organigramme.js** : affiche la page d’organigramme féodal des seigneurs (hiérarchie vassale, interactions et navigation).
- **renderHeader.js** : insère le fragment HTML du header commun côté client.
- **handleError.js** et **logger.js** : gestion des erreurs et du logging.
- Les pages HTML (`index.html`, `mapEditor.html`, `admin.html`, `gestion.html`, `profile.html`, `organigramme.html`) chargent ces scripts selon leur rôle; `index2.html` ne contient qu'une redirection de compatibilité vers `index.html`.
- Les scripts client communiquent avec l'API du serveur via `fetch`.
- La base de données contient également une table `trade_transactions` (origine, destination, ressources, type, état, raison, décision, retour, `origin_update_year`, `origin_update_number`, `received`) pour enregistrer les échanges entre seigneuries. L'origine et la destination y sont stockées via les identifiants de seigneurie, les noms des seigneurs ou baronnies étant résolus dynamiquement. Les colonnes `origin_update_year`, `origin_update_number` et `received` lient chaque envoi à la mise à jour de l'émetteur et différencient les transactions approuvées déjà reçues de celles encore en attente de réception. Les effets `land_transaction_max_per_month` et `naval_transaction_max_per_month` permettent d'augmenter les limites mensuelles de transactions.
- La base de données utilise une table `players` pour les données communes aux joueurs (identifiant, lien au seigneur actuel, population, inventaire, bâtiments, infrastructures, compteurs génériques et progression de mise à jour) et une table `seigneuries_info` pour les propriétés propres aux joueurs seigneurs (`player_id`, `baronnie_id`, `tax_rate`, `spells_cast`). Une vue SQL `seigneuries` assemble ces deux tables pour conserver les lectures et l’interface d’administration centrées sur les seigneuries.
- La progression asynchrone des joueurs est suivie dans `players` via `update_year` et `update_number` pour les 10 mises à jour annuelles (février à hiver). Les compteurs de période (`spells_cast`, `land_transactions`, `naval_transactions`) se réinitialisent à chaque mise à jour joueur.
- `server.js` expose `POST /api/seigneurie/advance_update`, qui valide côté serveur les blocages (par exemple surcharge de population employée), applique la production, la famine, les pertes par capacité maximale, réinitialise les compteurs de mise à jour et distribue les transactions commerciales approuvées devenues recevables.
- La table `trade_routes` inclut désormais un identifiant propre et un chemin (liste ordonnée d'identifiants de baronnies) pour définir la route commerciale.
- L'API serveur expose aussi `POST /api/trade_routes/import` (admin) pour importer des paires de baronnies, ignorer les routes déjà existantes et créer les chemins par défaut calculés côté serveur.
- La table `trade_lines` stocke les lignes commerciales maritimes (baronnies d'origine et de destination, chemin composé de zones maritimes).
- La table `admin_change_logs` trace les modifications effectuées via l'administration/`mapEditor` (table, entrée, utilisateur, description, données structurées et timestamp) et est consultable depuis l'onglet "Logs" d'`admin.html`.
- La table `user_table_preferences` stocke les préférences de visibilité de colonnes de l'administration par utilisateur.

## Instructions
- Garder ce fichier à jour : toute modification importante de l'architecture, des dépendances ou des relations entre scripts doit être répercutée ici.
- Ajouter ou supprimer des scripts majeurs nécessite d'actualiser la section "Scripts et relations principales".
- Les développements se font en JavaScript (CommonJS côté serveur, scripts front-end sans bundler) avec Node.js ≥14.
- L'API publique, c'est-à-dire l'API accessible sans connexion et documentée dans `Documentation/API_PUBLIQUE.md`, est strictement en lecture seule : elle ne doit servir qu'à récupérer des données (`fetch`) et ne doit jamais créer, modifier ou supprimer des données.
- Après toute modification du code, exécuter les vérifications disponibles (`npm test`, même si aucun test n'est défini) et corriger les erreurs le cas échéant.
- En général, pour chaque modification où c'est applicable, fournir au minimum un test/check exécuté et une capture d'écran de validation de l'interface impactée.
- Après toute modification de l'API publique (routes, paramètres, schémas JSON, tables/champs exposés), mettre à jour `Documentation/API_PUBLIQUE.md` dans le même changement.
- Toute interface utilisateur destinée aux utilisateurs finaux doit être intégralement en français (100% des textes affichés).
