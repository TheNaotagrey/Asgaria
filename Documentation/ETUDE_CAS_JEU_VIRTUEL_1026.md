# Étude de cas — passage du Jeu Virtuel 1026 à l'onglet Gestion

**Date de l'analyse :** 3 octobre 2026  
**Référence fonctionnelle :** *Jeu Virtuel d’Asgaria, version 1026 – 1.0* (174 pages). Les numéros de page ci-dessous sont ceux imprimés dans le PDF.  
**Périmètre vérifié :** code et base SQLite du dépôt local, sans connexion à une instance de production ni essai avec un compte joueur. `npm test` : 73 tests réussis. Une réussite des tests atteste les comportements couverts, pas la conformité de l'ensemble des règles.

## Décision proposée aux organisateurs

Poursuivre le développement de Gestion comme dossier de seigneurie : inventaire, production prévisionnelle, constructions, calendrier et commerce y sont déjà visibles. Avant l’ouverture aux joueurs, comparer les règles appliquées aux procédures des organisateurs et corriger les écarts. Le bouton « Mise à Jour » et les transactions modifient réellement la base ; toute validation doit utiliser des données adaptées.

L'application constitue un **socle opérationnel pour une partie des seigneurs**, pas encore l'arbitre complet des règles 1026 hors guerre. Les fonctions les plus prometteuses pour diminuer les appels de 20 minutes décrits p. 11 sont le calcul de production, la validation des constructions, la progression mensuelle et les échanges. Il reste des divergences de règles dans ce noyau, ainsi que la majeure partie des systèmes annuels, politiques et des trois autres rôles hors combat.

Le critère de « totalement implémenté » devrait être : toutes les actions déterministes des quatre rôles sont représentées, validées par le serveur et traçables ; les événements de GN, les jugements narratifs et les litiges passent par un **dossier de décision organisateur** qui produit ensuite une écriture vérifiable. L'automatisation intégrale des décisions humaines ne serait ni réaliste ni souhaitable.

## Ce qui existe et ce qui manque

| Domaine du PDF | État dans le dépôt | Limite concrète avant usage officiel |
| --- | --- | --- |
| Carte, titres, voisinage et terres canoniques (p. 13–18, 57–60, 127–128) | Carte, hiérarchies de jure/de facto, connexions et terres canoniques modélisées par `viewModel.js` et l'administration. | La représentation des relations n'est pas un processus de création, succession, transfert et paiement des titres conforme aux règles. |
| Suivi de la seigneurie (p. 47, 61, 107, 111–125) | `gestion.html`/`gestion.js` affichent inventaire, population, IDH calculé, production, infrastructures civiles et militaires, ost et propriétés ; les routes serveur valident plusieurs constructions. | Les propriétés de la base doivent être réconciliées avec chaque tableau du PDF ; maintenance annuelle, tirages d'IDH, révoltes et calamités n'ont pas de cycle complet visible. |
| Dix mises à jour annuelles (p. 11–12, 33, 67) | `src/updateCycle.js` définit les dix périodes ; `/api/seigneurie/advance_update` applique production, taxe, nourriture, famine, capacité et réception commerciale dans une transaction ; l'administration peut geler ou plafonner la progression. | Les trois retards autorisés, les dix mises à jour perdues, l'éjection, la présence aux activités et plusieurs événements annuels ne sont pas pris en charge. Les échéances en temps réel des titres demandent un calendrier distinct de la progression du joueur (p. 33 et 41). |
| Commerce (p. 48–56) | Carte des trajets, construction de liaisons, envoi, acceptation/refus et réception différée ; débits et compteurs des échanges sont atomiques. | Coûts de ligne maritime et d'influence, itinéraires alternatifs, caravanes/navires et Hôtel des Ventes restent à harmoniser ou à créer. |
| Magie (p. 116–120) | Onglet conditionnel, catalogue de sorts, ciblage géographique, consommation de ressources et tirage de réussite. | Les règles et effets des sorts du PDF demandent un inventaire de conformité ; le catalogue local contient six sorts. Aucun essai de bout en bout avec un compte joueur n'a été fait ici. |
| Évêque (p. 127–144) | Type de joueur et disponibilité des bâtiments configurables ; géographie canonique affichable. | Les pc par religion, la dîme sur terres canoniques, les limites de 2 000 croyants par baronnie, les revendications et les pouvoirs du Grand-Prêtre exigent leur propre logique. |
| Pirate et mercenaire, aspects économiques (p. 145–172) | Types reconnus dans le contrat partagé ; carte terrestre et maritime utilisable comme base. | Repaire, équipage, navires, déplacements et missions économiques n'ont pas de parcours joueur équivalent dans Gestion. |

### Écarts de règles prioritaires, vérifiés dans le code

1. **Liaisons commerciales :** le PDF p. 50 demande `3 po × distance` pour la terre, `5 rhums × zones` pour la mer, plus de l'influence ducale. `src/tradePersistence.js:createTradeLinkAtomically` débite `distance × 3` en or pour **les deux** types et ne débite pas l'influence. `server.js:/api/users/me/trade_links/build` renvoie également ce coût en or pour les deux types.
2. **Itinéraires alternatifs :** le PDF p. 49–50 permet plusieurs routes ou lignes vers la même destination si les trajets diffèrent. `createTradeLinkAtomically` refuse toute deuxième paire de baronnies, quel que soit le trajet ; l'échange cherche une liaison par paire sans sélectionner un itinéraire précis.
3. **Taxe et protection débutante :** le PDF p. 47 permet de dépasser 5 écus une fois le seuil de 120 habitants atteint. Le serveur conserve désormais l'état de protection : active à la création, révoquée irréversiblement dès 120 habitants. La taxe suit cet état acquis, même après une baisse de population. Toute interaction agressive entre joueurs devra consulter cet état côté serveur.
4. **Retards :** le PDF p. 11–12 limite à trois mises à jour de retard et prévoit la perte des suivantes. `src/updateCycle.js` déverrouille les périodes selon la date, mais la progression serveur ne calcule pas cette limite ni les pertes. L'inactivité prolongée de p. 12 n'est pas suivie.
5. **IDH :** `server.js:/api/my_seigneurie` calcule un score présenté au joueur. Les tableaux p. 107–110 prévoient aussi des probabilités de révolte, des bonus et des conséquences matérielles ; la progression mensuelle ne les applique pas. Il faut valider la formule du score, puis le déroulement des événements, avant de l'afficher comme résultat définitif.
6. **Famine :** la progression débite 15 vivres par habitant et 5 par esclave, puis calcule des morts parmi les habitants à partir d'un déficit divisé par 15. Le PDF p. 61 parle de 50 % des personnes insuffisamment nourries et distingue seigneurs/évêques, pirates et mercenaires. Cas limites et priorité d'alimentation à faire trancher puis tester.
7. **Constructions et sorts :** ces routes débitent les coûts puis mettent à jour les bâtiments ou appliquent les effets par appels successifs (`server.js`, `services/buildingService.js`). Contrairement au commerce, le processus entier ne se trouve pas dans une transaction SQLite unique. Une erreur après le débit peut laisser une opération incomplète ; il faut le rendre atomique avant le libre-service.
8. **Données de départ :** la copie `asgaria.db` contient 5 lignes `players`, mais 0 ligne `seigneuries_info` au moment de la lecture. Elle recense 341 baronnies tandis que le PDF p. 17 en décrit 187 dans sa zone jouable ; ce n'est pas nécessairement une contradiction, mais le périmètre jouable doit être identifié. Le démarrage du serveur prévoit la migration. Il faut valider cette migration sur une **copie** et vérifier l'association compte–personnage–baronnie avant de montrer des données réelles. Cette copie locale ne prouve rien sur la production.

Ces écarts sont des constats de code, pas des incidents observés en production. Les éléments absents du dépôt peuvent exister dans les feuilles et procédures actuelles des organisateurs : l'inventaire de ces sources fait partie de l'étape 0.

## Cas concret de mise à jour à comparer

**Scénario de validation :** un seigneur de 150 habitants détient 2 300 vivres, veut fixer la taxe à 8 écus, construire une infrastructure, envoyer des ressources par mer et avancer sa mise à jour. Rejouer exactement la même séquence avec un organisateur et dans Gestion à partir de données adaptées à la validation.

Le serveur autorise la hausse de taxe pour un joueur ayant déjà atteint 120 habitants (p. 47), même si sa population baisse ensuite ; il refuse la taxe à 8 pour un joueur encore protégé à 100 habitants. Il doit aussi refuser une construction irréalisable en donnant sa cause, réserver les ressources des actions dans l'ordre demandé (p. 11), débiter en mer les rhums et influences prescrits (p. 50), exiger la capacité de transport (p. 51), appliquer la production et la consommation de la période (p. 61), puis donner un relevé compréhensible. Le coût maritime reste un écart non résolu.

Pendant la validation, comparer après chaque action : ressources, population, bâtiments actifs, compteurs de commerce, période courante, destinataire et état de l'échange. Chaque divergence devient une règle à clarifier ou un défaut à corriger, sans corriger silencieusement les données à la main.

## Plan d'intégration et estimations

**Estimation révisée pour un développement avec Codex :** je peux lire les règles, modifier le serveur et l'interface, produire les tests, exécuter les vérifications et corriger les écarts dans le même flux de travail. Les chiffres ci-dessous sont des **jours de travail effectif** pour ce dépôt, avec les décisions de règles reçues rapidement et une revue régulière des organisateurs. Ils comprennent l'implémentation, les tests et la documentation ; ils ne supposent ni une conformité acquise par génération de code ni un fonctionnement autonome en arrière-plan. Une journée correspond ici à une journée de travail concentré sur le projet, pas à 24 heures de calcul continu.

| Étape | Livrable et critère de sortie | Travail effectif avec Codex | Calendrier si décisions rapides |
| --- | --- | ---: | ---: |
| **0. Contrat de règles et données** | Matrice PDF → règle exécutable → données → responsable de décision ; inventaire des tableurs et comptes ; migration testée sur copie, sauvegarde et plan de retour arrière. Les ambiguïtés (arrondis, ordre des actions, retards) ont une décision écrite. | 4–8 j | 1–2 sem. |
| **1. Mise au point de Gestion** | Calcul partagé, constructions et progression transactionnelles, relevé persistant. Comparer les résultats aux procédures des organisateurs avant d'ouvrir ces fonctions aux joueurs. | 10–18 j | 2–4 sem. de construction ; observations sur 1–2 cycles |
| **2. Noyau seigneur fiable** | Corriger taxe, construction et coûts, définir séquence des actions, retards et famine ; journal des mutations, tests de règles et simulation d'une année complète. Cinq à dix joueurs réels peuvent faire un cycle surveillé. | 12–22 j | 3–5 sem. de construction |
| **3. Commerce fiable** | Routes multiples, coût par mode, influence, caravanes/navires, réception, refus et restitution ; résilience aux actions concurrentes. Plusieurs échanges simultanés reproduits correctement. | 10–18 j | 2–4 sem. |
| **4. Économie et politique seigneuriales** | Prestige, renommée, influence, impôts et titres, entretien annuel, IDH/révoltes/calamités ; interface de validation organisateur pour les décisions. Un an de jeu se réconcilie avec les registres manuels. | 20–35 j | 4–7 sem. |
| **5. Évêques** | Points de croyance, dîme, terres canoniques, conversions, infrastructures et Grand-Prêtre ; scénarios croisés avec les seigneurs. | 15–28 j | 3–6 sem. |
| **6. Pirates et mercenaires hors combat** | Repaire, navires, équipage, déplacements, contrats et missions économiques ; scénarios croisés sans résolution de guerre. | 12–25 j | 3–5 sem. |
| **7. Stabilisation générale** | Relecture de conformité du périmètre retenu, essais utilisateurs, migration finale, sauvegardes/restauration, formation, observations du premier cycle et correction des écarts. | 10–24 j | 2–5 sem. de travail, plus l'observation du cycle |

**Total indicatif hors guerre avec moi : 93–178 jours de travail effectif.** Ce total reste provisoire : l'analyse de la [feuille de personnage](ANALYSE_FEUILLE_PERSONNAGE.md) soulève des écarts sur la population de référence, la famine, les ressources en suspens et l'entretien. Le premier **pilote seigneurial techniquement prêt** (étapes 0–2) représente **26–48 jours**, soit **5–10 semaines de construction**. Sa validation en miroir demande ensuite **un à deux cycles réels** ; l'ouverture officielle à une cohorte se situe donc plutôt **3–4 mois après le début**, si les écarts sont résolus. Le commerce complet (étape 3) ajoute **10–18 jours**. Les fourchettes seront révisées après les décisions de règles et le premier cycle comparé.

La réduction provient surtout de la vitesse d'analyse, d'édition et de création des tests. **Elle ne compresse pas** le délai entre deux mises à jour mensuelles, la vérification des données historiques, les décisions de règles ni les essais avec de vrais joueurs. Si les organisateurs ne peuvent répondre aux questions de règles que toutes les quelques semaines, le calendrier s'allonge même si le travail technique avance.

## Déploiement progressif qui ménage l'organisation

1. **Présentation, semaine 0 :** montrer la production, une construction refusée avec sa raison, puis un rapport de mise à jour. Présenter les écarts connus et les étapes de développement. Valider les parcours avec des données adaptées, sans modifier les données des joueurs.
2. **Comparaison des résultats, un à deux mois :** 5–10 seigneuries volontaires, dont un joueur en retard, une baronnie côtière et un destinataire décalé. Les organisateurs continuent leur procédure habituelle ; l'équipe compare chaque résultat. Cible : 100 % des écarts expliqués, aucune perte de ressources inexpliquée.
3. **Assistance, un cycle :** les joueurs préparent leurs actions dans Gestion ; un organisateur approuve le relevé et les exceptions. Les écritures validées deviennent officielles pour le groupe pilote ; sauvegarde avant chaque bascule. Cible : aucune correction directe en base, incidents résolus dans le même cycle.
4. **Libre-service seigneur, par cohortes :** ouvrir d'abord l'inventaire et les calculs, puis la progression, puis le commerce. Conserver un guichet organisateur pour événements et litiges. Étendre quand deux cycles de suite se réconcilient et que le soutien est supportable.
5. **Autres rôles hors combat :** activer seulement après des scénarios économiques croisés seigneur–évêque–pirate–mercenaire. La guerre reste hors du périmètre de développement actuel.

Un interrupteur d'administration pour geler ou plafonner les mises à jour existe déjà ; il peut servir lors d'un incident. Le retour arrière doit reposer aussi sur des sauvegardes vérifiées et un journal des actions, car un gel n'annule pas les écritures déjà faites.

## Valeur attendue et mesures

Le PDF p. 11 estime **20 minutes d'appel par mise à jour**, dix fois par an. Pour **30 joueurs**, cela représente **100 h/an d'appels** ; pour **60 joueurs, 200 h/an**, hors messages et rectifications. Si le noyau libre-service évite 40–60 % de ce temps, l'économie théorique serait de **40–60 h/an** ou **80–120 h/an** respectivement. C'est un scénario, pas une promesse : la formation et le traitement des exceptions peuvent consommer une partie du gain, surtout au début.

Mesurer dès le miroir : minutes organisateur par dossier, nombre d'échanges nécessaires, divergences de règles pour 100 mises à jour, actions refusées et comprises du premier coup, rectifications après validation, incidents de ressources, et part des dossiers terminés sans intervention. Décider de chaque extension sur ces résultats plutôt que sur le nombre de boutons disponibles.

## Ce qu'il faut décider avec les organisateurs avant de coder davantage

- Le PDF 1026–1.0 est-il le règlement applicable, et quelles dérogations sont déjà pratiquées ?
- Dans quel ordre s'appliquent production, achats, constructions, sorts, échanges, famine et événements ? Le texte p. 11 prévoit des actions ordonnées ; ce choix conditionne le modèle de mise à jour.
- Quelles actions exigent une approbation humaine, et quelles preuves d'activité en personne doivent être enregistrées ?
- Comment compter exactement retard, perte d'une mise à jour, éjection et succession, surtout au passage d'une année ?
- Quelle est la source officielle des inventaires, populations, titres et bâtiments lors de la migration initiale ?

**Sources techniques principales :** `gestion.html`, `gestion.js`, `server.js`, `src/updateCycle.js`, `src/updatePolicy.js`, `src/tradePersistence.js`, `src/playerTypes.js`, `viewModel.js`, `test/`. L'examen est appuyé par les 73 tests du dépôt et une lecture SQLite en mode lecture seule ; il ne remplace pas une recette avec des comptes et données représentatifs.
