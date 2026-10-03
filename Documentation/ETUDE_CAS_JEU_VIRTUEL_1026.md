# Étude de cas — passage du Jeu Virtuel 1026 à l'onglet Gestion

**Date de l'analyse :** 3 octobre 2026  
**Référence fonctionnelle :** *Jeu Virtuel d’Asgaria, version 1026 – 1.0* (174 pages). Les numéros de page ci-dessous sont ceux imprimés dans le PDF.  
**Périmètre vérifié :** code et base SQLite du dépôt local, sans connexion à une instance de production ni essai avec un compte joueur. `npm test` : 66 tests réussis. Une réussite des tests atteste les comportements couverts, pas la conformité de l'ensemble des règles.

## Décision proposée aux organisateurs

Présenter **maintenant** Gestion comme une démonstration et un futur dossier de seigneurie : inventaire, production prévisionnelle, constructions, calendrier et commerce y sont déjà visibles. Garder les mises à jour officielles dans le processus actuel pendant une période de comparaison. Le bouton « Mise à Jour » et les transactions modifient réellement la base ; utiliser un environnement de démonstration et des personnages fictifs.

L'application constitue un **socle opérationnel pour une partie des seigneurs**, pas encore l'arbitre complet des règles 1026. Les fonctions les plus prometteuses pour diminuer les appels de 20 minutes décrits p. 11 sont le calcul de production, la validation des constructions, la progression mensuelle et les échanges. Il reste des divergences de règles dans ce noyau, ainsi que la majeure partie des systèmes annuels, politiques, militaires et des trois autres rôles.

Le critère de « totalement implémenté » devrait être : toutes les actions déterministes des quatre rôles sont représentées, validées par le serveur et traçables ; les événements de GN, les jugements narratifs et les litiges passent par un **dossier de décision organisateur** qui produit ensuite une écriture vérifiable. L'automatisation intégrale des décisions humaines ne serait ni réaliste ni souhaitable.

## Ce qui existe et ce qui manque

| Domaine du PDF | État dans le dépôt | Limite concrète avant usage officiel |
| --- | --- | --- |
| Carte, titres, voisinage et terres canoniques (p. 13–18, 57–60, 127–128) | Carte, hiérarchies de jure/de facto, connexions et terres canoniques modélisées par `viewModel.js` et l'administration. | La représentation des relations n'est pas un processus de création, succession, transfert et paiement des titres conforme aux règles. |
| Suivi de la seigneurie (p. 47, 61, 107, 111–125) | `gestion.html`/`gestion.js` affichent inventaire, population, IDH calculé, production, infrastructures civiles et militaires, ost et propriétés ; les routes serveur valident plusieurs constructions. | Les propriétés de la base doivent être réconciliées avec chaque tableau du PDF ; maintenance annuelle, tirages d'IDH, révoltes et calamités n'ont pas de cycle complet visible. |
| Dix mises à jour annuelles (p. 11–12, 33, 67) | `src/updateCycle.js` définit les dix périodes ; `/api/seigneurie/advance_update` applique production, taxe, nourriture, famine, capacité et réception commerciale dans une transaction ; l'administration peut geler ou plafonner la progression. | Les trois retards autorisés, les dix mises à jour perdues, l'éjection, la présence aux activités et plusieurs événements annuels ne sont pas pris en charge. Les échéances en temps réel des titres demandent un calendrier distinct de la progression du joueur (p. 33 et 41). |
| Commerce (p. 48–56) | Carte des trajets, construction de liaisons, envoi, acceptation/refus et réception différée ; débits et compteurs des échanges sont atomiques. | Coûts de ligne maritime et d'influence, itinéraires alternatifs, caravanes/navires, blocus, piraterie et Hôtel des Ventes restent à harmoniser ou à créer. |
| Magie (p. 116–120) | Onglet conditionnel, catalogue de sorts, ciblage géographique, consommation de ressources et tirage de réussite. | Les règles et effets des sorts du PDF demandent un inventaire de conformité ; le catalogue local contient six sorts. Aucun essai de bout en bout avec un compte joueur n'a été fait ici. |
| Évêque (p. 127–144) | Type de joueur et disponibilité des bâtiments configurables ; géographie canonique affichable. | Les pc par religion, la dîme sur terres canoniques, les limites de 2 000 croyants par baronnie, les revendications et les pouvoirs du Grand-Prêtre exigent leur propre logique. |
| Pirate et mercenaire (p. 145–172) | Types reconnus dans le contrat partagé ; carte terrestre et maritime utilisable comme base. | Repaire, équipage, navires, déplacements, missions, pillages et interactions n'ont pas de parcours joueur équivalent dans Gestion. |
| Guerre, espionnage et complots (p. 62–67, 72–105) | La carte, les titres et un affichage d'ost fournissent des données de référence. | Pas de processus complet de déclaration, préparation, arbitrage, combat, pertes, garnison, blocus et secrets. Plusieurs résultats dépendent d'une activité en personne ou d'un choix organisateur. |

### Écarts de règles prioritaires, vérifiés dans le code

1. **Liaisons commerciales :** le PDF p. 50 demande `3 po × distance` pour la terre, `5 rhums × zones` pour la mer, plus de l'influence ducale. `src/tradePersistence.js:createTradeLinkAtomically` débite `distance × 3` en or pour **les deux** types et ne débite pas l'influence. `server.js:/api/users/me/trade_links/build` renvoie également ce coût en or pour les deux types.
2. **Itinéraires alternatifs :** le PDF p. 49–50 permet plusieurs routes ou lignes vers la même destination si les trajets diffèrent. `createTradeLinkAtomically` refuse toute deuxième paire de baronnies, quel que soit le trajet ; l'échange cherche une liaison par paire sans sélectionner un itinéraire précis. Cela bloque aussi le futur contournement d'un blocus.
3. **Taxe :** le PDF p. 47 autorise de dépasser 5 écus par paysan seulement à partir de 120 habitants. `/api/tax_rate` accepte immédiatement tout taux de 0 à 12, sans vérifier la population. Le calcul de taxe mensuelle existe, mais cette condition manque.
4. **Retards :** le PDF p. 11–12 limite à trois mises à jour de retard et prévoit la perte des suivantes. `src/updateCycle.js` déverrouille les périodes selon la date, mais la progression serveur ne calcule pas cette limite ni les pertes. L'inactivité prolongée de p. 12 n'est pas suivie.
5. **IDH :** `server.js:/api/my_seigneurie` calcule un score présenté au joueur. Les tableaux p. 107–110 prévoient aussi des probabilités de révolte, des bonus et des conséquences matérielles ; la progression mensuelle ne les applique pas. Il faut valider la formule du score, puis le déroulement des événements, avant de l'afficher comme résultat définitif.
6. **Famine :** la progression débite 15 vivres par habitant et 5 par esclave, puis calcule des morts parmi les habitants à partir d'un déficit divisé par 15. Le PDF p. 61 parle de 50 % des personnes insuffisamment nourries et distingue seigneurs/évêques, pirates et mercenaires. Cas limites et priorité d'alimentation à faire trancher puis tester.
7. **Constructions et sorts :** ces routes débitent les coûts puis mettent à jour les bâtiments ou appliquent les effets par appels successifs (`server.js`, `services/buildingService.js`). Contrairement au commerce, le processus entier ne se trouve pas dans une transaction SQLite unique. Une erreur après le débit peut laisser une opération incomplète ; il faut le rendre atomique avant le libre-service.
8. **Données de départ :** la copie `asgaria.db` contient 5 lignes `players`, mais 0 ligne `seigneuries_info` au moment de la lecture. Elle recense 341 baronnies tandis que le PDF p. 17 en décrit 187 dans sa zone jouable ; ce n'est pas nécessairement une contradiction, mais le périmètre jouable doit être identifié. Le démarrage du serveur prévoit la migration. Il faut valider cette migration sur une **copie** et vérifier l'association compte–personnage–baronnie avant de montrer des données réelles. Cette copie locale ne prouve rien sur la production.

Ces écarts sont des constats de code, pas des incidents observés en production. Les éléments absents du dépôt peuvent exister dans les feuilles et procédures actuelles des organisateurs : l'inventaire de ces sources fait partie de l'étape 0.

## Cas concret de mise à jour à comparer

**Situation test :** un seigneur de 150 habitants détient 2 300 vivres, veut fixer la taxe à 8 écus, construire une infrastructure, envoyer des ressources par mer et avancer sa mise à jour. Préparer cette situation dans une copie de données, puis faire résoudre exactement la même séquence par un organisateur et par Gestion.

Le serveur devrait autoriser la hausse de taxe parce que 150 ≥ 120 (p. 47), refuser une construction irréalisable en donnant sa cause, réserver les ressources des actions dans l'ordre demandé (p. 11), débiter en mer les rhums et influences prescrits (p. 50), exiger la capacité de transport (p. 51), appliquer la production et la consommation de la période (p. 61), puis donner un relevé compréhensible. Un second scénario avec **100 habitants** doit refuser la taxe à 8 ; un troisième avec deux itinéraires doit accepter le trajet alternatif. Actuellement, les étapes taxe et coût maritime ne donnent pas le résultat du PDF.

Pour le pilote, comparer après chaque action : ressources, population, bâtiments actifs, compteurs de commerce, période courante, destinataire et état de l'échange. Chaque divergence devient une règle à clarifier ou un défaut à corriger, sans corriger silencieusement les données à la main.

## Plan d'intégration et estimations

**Estimation révisée pour un développement avec Codex :** je peux lire les règles, modifier le serveur et l'interface, produire les tests, exécuter les vérifications et corriger les écarts dans le même flux de travail. Les chiffres ci-dessous sont des **jours de travail effectif** pour ce dépôt, avec les décisions de règles reçues rapidement et une revue régulière des organisateurs. Ils comprennent l'implémentation, les tests et la documentation ; ils ne supposent ni une conformité acquise par génération de code ni un fonctionnement autonome en arrière-plan. Une journée correspond ici à une journée de travail concentré sur le projet, pas à 24 heures de calcul continu.

| Étape | Livrable et critère de sortie | Travail effectif avec Codex | Calendrier si décisions rapides |
| --- | --- | ---: | ---: |
| **0. Contrat de règles et données** | Matrice PDF → règle exécutable → données → responsable de décision ; inventaire des tableurs et comptes ; migration testée sur copie, sauvegarde et plan de retour arrière. Les ambiguïtés (arrondis, ordre des actions, retards) ont une décision écrite. | 4–8 j | 1–2 sem. |
| **1. Démonstration et miroir** | Jeu de données fictif, compte de démonstration, tutoriel en français et relevé mensuel lisible. Deux organisateurs reproduisent 5–10 dossiers sans que l'outil fasse foi. | 3–5 j | 1 sem. de préparation ; observations sur 1–2 cycles réels |
| **2. Noyau seigneur fiable** | Corriger taxe, construction et coûts, définir séquence des actions, retards et famine ; journal des mutations, tests de règles et simulation d'une année complète. Cinq à dix joueurs réels peuvent faire un cycle surveillé. | 12–22 j | 3–5 sem. de construction |
| **3. Commerce fiable** | Routes multiples, coût par mode, influence, caravanes/navires, réception, refus et restitution ; résilience aux actions concurrentes. Plusieurs échanges simultanés reproduits correctement. | 10–18 j | 2–4 sem. |
| **4. Économie et politique seigneuriales** | Prestige, renommée, influence, impôts et titres, entretien annuel, IDH/révoltes/calamités ; interface de validation organisateur pour les décisions. Un an de jeu se réconcilie avec les registres manuels. | 20–35 j | 4–7 sem. |
| **5. Évêques** | Points de croyance, dîme, terres canoniques, conversions, infrastructures et Grand-Prêtre ; scénarios croisés avec les seigneurs. | 15–28 j | 3–6 sem. |
| **6. Conflits et arbitrage** | Dossiers de guerre, garnisons, blocus, espionnage, complots, pertes et effets d'une décision GN ; permissions et visibilité des informations sensibles. Les organisateurs peuvent conclure un dossier sans écrire directement en base. | 25–45 j | 5–9 sem. |
| **7. Pirates et mercenaires** | Repaire, navires, équipage, déplacements, contrats, missions, pillages, changements de rôle et interactions croisées. Scénarios complets des deux rôles sur plusieurs mois. | 20–40 j | 4–8 sem. |
| **8. Stabilisation générale** | Relecture de conformité des 67 sections, essais utilisateurs, migration finale, sauvegardes/restauration, formation, observations du premier cycle et correction des écarts. | 10–24 j | 2–5 sem. de travail, plus l'observation du cycle |

**Total indicatif avec moi : 119–225 jours de travail effectif**, soit environ **6–11 mois de construction à temps plein** et plutôt **9–15 mois calendrier** avec les validations, la migration et les cycles réels. L'ancien chiffrage de **320–535 jours** reste une comparaison pour un développement traditionnel ; ce n'est plus la prévision principale. Le premier **pilote seigneurial techniquement prêt** (étapes 0–2) représente **19–35 jours**, soit **4–7 semaines de construction**. Sa validation en miroir demande ensuite **un à deux cycles réels** ; l'ouverture officielle à une cohorte se situe donc plutôt **2–3 mois après le début**, si les écarts sont résolus. Le commerce complet (étape 3) ajoute **10–18 jours**. Je réviserais ces fourchettes après l'étape 0, puis après le premier cycle comparé.

La réduction provient surtout de la vitesse d'analyse, d'édition et de création des tests. **Elle ne compresse pas** le délai entre deux mises à jour mensuelles, la vérification des données historiques, les décisions de règles ni les essais avec de vrais joueurs. Si les organisateurs ne peuvent répondre aux questions de règles que toutes les quelques semaines, le calendrier s'allonge même si le travail technique avance.

## Déploiement progressif qui ménage l'organisation

1. **Présentation, semaine 0 :** montrer un personnage fictif, la production, une construction refusée avec sa raison, puis un rapport de mise à jour. Montrer séparément les écarts connus et le calendrier du pilote. Ne pas démontrer sur la base officielle.
2. **Miroir, un à deux mois :** 5–10 seigneuries volontaires, dont un joueur en retard, une baronnie côtière et un destinataire décalé. Les organisateurs continuent leur procédure officielle ; l'équipe compare chaque résultat. Cible : 100 % des écarts expliqués, aucune perte de ressources inexpliquée.
3. **Assistance, un cycle :** les joueurs préparent leurs actions dans Gestion ; un organisateur approuve le relevé et les exceptions. Les écritures validées deviennent officielles pour le groupe pilote ; sauvegarde avant chaque bascule. Cible : aucune correction directe en base, incidents résolus dans le même cycle.
4. **Libre-service seigneur, par cohortes :** ouvrir d'abord l'inventaire et les calculs, puis la progression, puis le commerce. Conserver un guichet organisateur pour événements et litiges. Étendre quand deux cycles de suite se réconcilient et que le soutien est supportable.
5. **Autres rôles et guerre :** activer seulement après scénarios croisés seigneur–évêque–pirate–mercenaire et procédures d'arbitrage testées. Les décisions en personne sont saisies par les organisateurs avec leur motif.

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

**Sources techniques principales :** `gestion.html`, `gestion.js`, `server.js`, `src/updateCycle.js`, `src/updatePolicy.js`, `src/tradePersistence.js`, `src/playerTypes.js`, `viewModel.js`, `test/`. L'examen est statique, appuyé par les 66 tests du dépôt et une lecture SQLite en mode lecture seule ; il ne remplace pas une recette avec des comptes et données représentatifs.
