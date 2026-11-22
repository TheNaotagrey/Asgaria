# Hôtel des ventes

L’onglet Gestion utilise `gestionAuctionHouse.js` et le contrat serveur/navigateur `src/auctionRules.js`. `services/auctionHouseService.js` réserve les marchandises, règle les achats immédiatement et conserve l’historique dans `auction_offers`/`auction_events`. Ces tables ne sont accessibles ni par le CRUD générique ni par l’API publique.

## Activation et effets administratifs

Dans Administration → Bâtiments, ajouter l’effet **Débloque page → Hôtel des ventes** au marché, avec `{ "type": "unlock_page", "page": "hotel_des_ventes" }`. Aucun effet n’est automatiquement assigné aux définitions existantes. Le même effet peut être donné à l’atelier d’artisanat ou au trésorier selon le rôle.

Les bâtiments et infrastructures proposent cinq modificateurs `{ "type": "…", "amount": nombre }` :

| Identifiant | Sens | Base |
| --- | --- | --- |
| `auction_commission_discount` | Réduction de commission en points de pourcentage | 5 % |
| `auction_withdrawal_loss_discount` | Réduction des pertes au retrait en points | 30 % |
| `auction_expiration_loss_discount` | Réduction des pertes à l’expiration en points | 15 % |
| `auction_max_offers_bonus` | Offres simultanées supplémentaires, entier | 5 offres |
| `auction_duration_bonus` | Périodes supplémentaires de conservation, entier | 10 périodes |

Les valeurs sont positives ou nulles et validées par le serveur. Les contributions s’additionnent par bâtiment **actif** et infrastructure **construite** ; les tags conservent leur comportement existant. Les taux ne descendent jamais sous zéro. Exemple : deux bâtiments actifs donnant chacun 1 point de réduction font passer la commission de 5 % à 3 %. L’onglet affiche les taux, la limite, la durée et le détail des contributeurs.

Les effets du vendeur sont relus au moment du dépôt, de la vente, du retrait ou de l’expiration. Les offres ne figent pas leurs bonus. Une baisse de limite ne supprime pas les offres ouvertes, mais interdit de nouveaux dépôts tant que leur nombre atteint ou dépasse la limite. La durée est réévaluée à chaque avancement du vendeur. L’historique conserve l’état des règles réellement appliquées.

## Vente et inventaires

Un lot contient une seule ressource et une quantité entière positive. Il est acheté intégralement, selon l’un des deux prix alternatifs au maximum. Chaque prix contient une ressource et une quantité entière positive. La quantité nette après frais est arrondie vers le bas par calcul entier exact : 210 or avec 5 % de commission rapporte 199 or.

Le dépôt retire les marchandises et consomme un usage du transport choisi. L’achat débite le prix brut, crédite le lot à l’acheteur et le prix net au vendeur, puis ferme l’offre, le tout sous `BEGIN IMMEDIATE`. Caravane et navire marchand utilisent les quotas partagés avec Commerce et leurs prérequis configurés ; aucune liaison n’est nécessaire. Les achats de ses propres offres sont interdits. Les offres futures sont visibles, mais leur achat reste bloqué jusqu’à la mise à jour requise.

Le serveur vérifie les soldes finaux, après les débits, pour les deux parties. Un achat manquant de ressources, de transport, de capacité ou aggravant le sur-travail est intégralement annulé. Les biens matériels, spécialistes et esclaves du catalogue sont autorisés ; esclaves interdits pour les évêques. Prestige, renommée, magie, hommes d’armes et trébuchets sont exclus. Les objets non modélisés, les navires et les enchères sont hors de cette version.

Le retrait rend le lot après pertes, sans transport ; il est refusé faute de stockage. Les offres restent ouvertes après destruction du marché, avec suivi et retrait accessibles au propriétaire. L’expiration intervient lors de l’avancement du vendeur lorsque l’âge de l’offre dépasse `10 + bonus` périodes, donc à la onzième période sans bonus. Elle intervient après les réceptions commerciales ; les retours après pénalité sont plafonnés au stockage disponible. Frais, débordement et quantité réellement rendue sont conservés dans l’historique et le relevé. L’erreur d’une écriture, y compris du relevé, annule l’ensemble de l’avancement.

## Présentation dans Gestion

L’onglet reprend les panneaux blancs, les bordures et les boutons bleus de Gestion. Quatre indicateurs résument commission, offres ouvertes, conservation et transports ; le détail des tarifs et des contributeurs se déplie à la demande. Sur ordinateur, le formulaire de dépôt accompagne le tableau dans un panneau latéral. Sur mobile, les lignes deviennent des cartes avec prix et actions visibles sans défilement horizontal. Les formulaires regroupent lot, prix principal, prix alternatif et transport, avec une prévision des montants nets avant confirmation.

## Routes privées

Toutes exigent une session et un personnage possédant un compte propriétaire. `seigneurie_id` dans la requête est réservé à un administrateur actif. La réponse a `Cache-Control: no-store`. Les droits sont relus dans la transaction de mutation.

| Route | Contrat |
| --- | --- |
| `GET /api/auction_house/catalog` (ou `/api/auction_house/`) | Toutes les offres ouvertes autorisées pour le rôle, hors ses propres offres, y compris les périodes futures ; `can_buy` et `purchase_block_reason` indiquent le blocage de période |
| `GET /api/auction_house/mine` | Toutes ses offres, ouvertes et fermées |
| `GET /api/auction_house/history` | Événements de vente et d’achat du personnage, sans identité d’acheteur |
| `POST /api/auction_house/offers` | `{ lot: {resource, amount}, prices: [{resource, amount}], transport: "land" ou "naval", expected_update: {year, number}, request_key }` |
| `POST /api/auction_house/offers/:id/buy` | `{ price_index: 0 ou 1, transport, expected_update }` |
| `POST /api/auction_house/offers/:id/withdraw` | `{ expected_update }` |

Les lectures renvoient `rows`, `has_more`, `rules`, `inventory`, `capacities`, `quotas`, `update`, `type`, `open_count` et `has_history`. `before` est l’identifiant strictement supérieur aux prochaines lignes souhaitées ; 50 lignes au maximum, triées par identifiant décroissant. Les noms vendeurs sont visibles, les identifiants acheteurs ne sont pas exposés.

`request_key` est un identifiant de dépôt de 16 à 100 caractères alphanumériques, tirets ou soulignements. Réessayer un dépôt avec la même clé et le même contenu renvoie l’offre créée, sans nouveau débit ; changer le contenu avec la même clé produit un conflit. Une offre fermée produit `409` à un nouvel achat/retrait. Les erreurs retournent `{error, code}` avec un message français explicite.

## Arbitrages et validation

Références : livre 1026 p. 19–27, 48, 55–56, 112–113 et feuille `Infrastructures Civiles!H38`. Les décisions retenues autorisent le navire marchand, fixent le règlement immédiat et refusent les achats faute de place. Le sort Embargo reste à implémenter : aucun blocage temporaire issu de ce sort n’est appliqué dans cette version.

Exécuter `npm test`, puis `node scripts/validateAuctionHouseUI.cjs`. Le script utilise une base temporaire et les vraies pages/service HV, sans écriture dans la base du jeu. Variables facultatives : `PLAYWRIGHT_MODULE`, `UI_BROWSER_PATH` et `UI_SCREENSHOT_DIR`. Les captures joueur/administrateur, ordinateur/mobile et effets administratifs sont enregistrées dans `output/auction-house-ui`.

## Présentation dans Gestion

« Mes offres » précède « Offres disponibles » dans deux tableaux empilés, sans sous-onglets. Chaque prix occupe sa propre colonne (« Prix 1 », « Prix 2 ») ; une absence de second prix est indiquée par un tiret. L’historique est repliable sous les tableaux. Chaque liste possède sa pagination et les opérations actualisent les trois listes.

L’actualisation automatique toutes les 15 secondes reste silencieuse et ne reconstruit le contenu que lorsque les données changent. Elle conserve les panneaux ouverts, le formulaire de dépôt et son focus, le défilement et les pages déjà chargées. Les requêtes automatiques ne se superposent pas à une lecture en cours ; un changement de personnage invalide toujours les réponses précédentes.

Les offres publiées à une mise à jour ultérieure restent visibles. Leur bouton « Acheter » est désactivé jusqu’à ce que le personnage atteigne cette période ; son infobulle indique la période requise et celle du personnage. La colonne « État » conserve uniquement le statut de l’offre. Le serveur relit toujours les périodes sous transaction et refuse tout achat anticipé (`future_offer`), même si un client contourne le bouton. La pagination du catalogue comprend les offres achetables et celles encore bloquées.
