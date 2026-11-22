# Prestige, renommée et influence ducale

Référence : *Jeu Virtuel d’Asgaria 1026 – 1.0*, p. 40, 42 et 50.

Le prestige se convertit immédiatement et irréversiblement en renommée (1 pour 1) ou influence (2 pour 1), pour les seigneurs et évêques. La renommée peut rester négative : une conversion ou une production augmente son solde sans effacer sa dette. La renommée ne se convertit pas en influence. Les relevés utilisent la version `1026-1.4-duchy-influence`.

L’influence créée appartient exclusivement au duché **de jure** de la baronnie actuelle (`baronies.county_id → counties.duchy_id`). Un rattachement manquant refuse la conversion en influence et la création de liaison. Les soldes acquis conservent leur duché après un changement de baronnie ou un transfert.

## Stockage et migration

`services/influenceService.js` installe au démarrage deux tables privées idempotentes : `player_duchy_influence`, clé `(player_id, duchy_id)` et solde entier non négatif, et `influence_events`, journal des crédits/débits avec cause et date UTC SQLite. Prestige et renommée restent dans l’inventaire. Aucun stock historique d’influence n’est inventé : une ligne absente vaut zéro. Les conversions et transferts alimentent les soldes. Ces tables sont exclues du CRUD générique et de l’API publique.

## Routes privées

| Route | Entrée | Résultat |
| --- | --- | --- |
| `GET /api/seigneurie/influence` | Contexte joueur | Prestige, renommée, duché de jure et soldes nommés |
| `PUT /api/seigneurie/influence` | Administrateur actif ; `changes`, `expected`, `seigneurie_id` | Soldes après correction administrative |
| `GET /api/seigneurie/influence/link_influence` | `barony_id`, contexte joueur | Coût d’influence regroupé par duché de jure, avec nom et stock disponible |
| `POST /api/seigneurie/influence/convert` | `amount` entier positif, `target` : `renommee` ou `influence` | Soldes après conversion |
| `GET /api/seigneurie/influence/recipients` | Contexte joueur | Personnages destinataires liés à un compte |
| `POST /api/seigneurie/influence/transfer` | `destination_id`, `duchy_id`, `amount` entiers positifs | Soldes de l’émetteur |

`seigneurie_id` facultatif, dans la requête GET ou le corps POST, est réservé à un administrateur actif. L’identité et les stocks sont relus sous `BEGIN IMMEDIATE`. Le navigateur ne choisit pas le duché d’une conversion. Les envois d’influence sont immédiats, conservent leur duché, ne consomment pas de transport et ne modifient pas le cycle des échanges matériels. Débits et crédits sont annulés ensemble en cas d’erreur ; les soldes résultants doivent être des entiers exacts JavaScript.

La lecture présente tous les duchés, avec zéro pour les stocks absents. L’édition administrateur accepte les valeurs absolues `changes.prestige` (entier non négatif), `changes.renommee` (entier pouvant être négatif) et `changes.influence` (liste de `{duchy_id, amount, expected}`, entiers non négatifs pour les soldes). `expected.prestige` et `expected.renommee` sont requis pour les champs correspondants modifiés. Une différence avec le stock relu refuse **toute** la correction avec `409`, afin de préserver une conversion, un transfert ou un débit intervenu depuis le chargement. Les ressources corrigées sont tracées dans `transactions`, les influences dans `influence_events` et la correction complète dans `admin_change_logs`, avec l’identité de l’administrateur. `logAdminChange(..., {strict:true})` annule la correction si l’écriture du journal échoue ; les autres usages de ce service gardent leur comportement existant.

## Liaisons commerciales

`POST /api/users/me/trade_links/build` conserve ses paramètres et renvoie désormais `{ id, cost, resource, influence, distance, zones?, type, path }`. `cost` est exprimé dans `resource` (`or_` ou `rhum`) ; `influence` décrit les duchés et quantités débitées.

- Terre : calcul existant de distance pondérée × 3 or, plus 1 influence du duché de jure d’origine et 1 de destination.
- Mer : **nombre de zones du chemin × 5 rhums**, plus les mêmes influences. Une zone unique coûte 5 rhums, même si la distance en arêtes est zéro. Les pondérations restent utilisées pour la distance et la recherche de trajet, pas pour le coût maritime.
- Même duché de jure aux deux extrémités : 2 influences de ce duché.

`src/tradePersistence.js` relit sous transaction propriétaire, inventaire, connexions, extrémités côtières et duchés. Le coût fourni par un appelant n’est pas utilisé. Un manque de ressources ou d’influence annule débits, journaux et création. La restriction existante d’une liaison par paire et par mode est conservée ; routes alternatives distinctes, invitations de guerre et entretien annuel des titres restent hors de ce changement. Les liaisons historiques ne sont pas facturées rétroactivement.

## Interface et validation

La section est placée tout en bas du Sommaire, sous les ressources et le panneau de mise à jour, sur toute la largeur. Elle est repliée par défaut ; son ouverture est conservée lors d’une action ou d’une actualisation du même personnage, et réinitialisée lors d’un changement de personnage ou d’un rechargement de page.

En mode administrateur, chaque champ de solde s’enregistre automatiquement à son changement validé (sortie du champ), comme les autres champs de Gestion. Aucun bouton Enregistrer ou Actualiser n’est nécessaire. Seul le champ modifié est envoyé avec son ancien solde attendu ; un refus rétablit sa valeur précédente et affiche l’erreur du serveur.

Gestion reprend l’organisation de `Sommaire!B29:K40` de la feuille de personnage : blocs distincts pour prestige et renommée, grille des stocks par duché et mise en évidence du duché de jure. Le rendu reprend les tableaux du Sommaire : stocks et conversion sur une seule ligne sur ordinateur, réorganisation compacte sur mobile. Les ratios figurent uniquement dans le sélecteur ; le titre répété, le badge administrateur, les textes explicatifs et la prévisualisation redondante sont supprimés. Le contexte administrateur utilise le personnage sélectionné et permet d’éditer tous les stocks, y compris une influence jusque-là absente. Les erreurs serveur apparaissent dans le formulaire. Le dialogue Commerce présente les ressources et influences en lignes chiffrées avec leurs vrais noms de duché ; les duchés sont résolus côté serveur par le même helper que le débit final, sans reconstruction de hiérarchie dans le navigateur.

`test/influence.test.js` couvre ratios, renommée négative, permissions, rôles, duché manquant, chemins relus, zone unique, pondérations maritimes, même duché, stocks insuffisants, annulations, éditions administratives, conflits, journaux et requêtes concurrentes. `scripts/validateInfluenceUI.cjs` vérifie la vraie page, le routeur privé et les services sur SQLite temporaire en joueur/administrateur et ordinateur/mobile, avec édition persistante après rechargement et coûts de duchés nommés. Captures dans `output/influence-ui/`.
