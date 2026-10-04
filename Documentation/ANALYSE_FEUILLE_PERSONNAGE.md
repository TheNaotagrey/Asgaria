# Lecture de la feuille de personnage pour Gestion

**Source examinée :** `Léo Caussan Virtuel.xlsm`, version des données affichée 1026. L'analyse est en lecture seule. Le projet VBA a été extrait comme texte sans exécuter les macros. Le classeur décrit une pratique et contient des valeurs propres à un personnage : ses formules ne remplacent ni les décisions des organisateurs ni les règles métier précisées par le propriétaire du projet. En particulier, la protection débutante est irréversible même si une formule du classeur se fonde sur la population actuelle.

## Périmètre retenu

La guerre et les résolutions de combat sont exclues pour l'instant. Les ressources, employés et coûts des unités ou bâtiments militaires restent pertinents lorsqu'ils modifient une mise à jour économique.

## Écarts utiles pour la prochaine étape

| Sujet | Indice dans le classeur | État du serveur | Décision ou travail nécessaire |
| --- | --- | --- | --- |
| Population de référence | `Sommaire!F13` dérive la population des unités, infrastructures et autres apports ; `H13` est une valeur saisie. Les valeurs enregistrées sont respectivement 97 et 98. La taxe et plusieurs contrôles lisent `H13`. | `players.population` est la valeur de référence ; le serveur calcule séparément l'emploi. | Identifier ce qui justifie l'écart entre population calculée et saisie, puis définir les écritures qui peuvent changer la population. Ajouter un rapprochement explicite plutôt que de corriger silencieusement. |
| Protection débutante | `Sommaire!Y1` affiche la protection si `H13 < 120` et si le titre contient « Baron ». | `players.beginner_protection` est un état persistant, révoqué à 120 et jamais réactivé. | Garder la règle persistante donnée par l'utilisateur. Préciser si une catégorie de personnage est exclue ; ne pas recopier la condition dynamique du classeur. |
| Taxe et autres recettes | `Sommaire!F14` porte le taux ; `L15` combine la taxe avec des recettes d'infrastructures et un effet « Réseau Criminel ». | Le calcul partagé applique `floor(population × taux / 100)` et les effets connus des propriétés. | Comparer chaque terme de `L15` aux effets configurés en base ; décider l'ordre des bonus, réductions et arrondis. |
| Mise à jour et famine | `Sommaire!W19:X28` place le clic de mise à jour avant les vérifications de famine et d'IDH ; `T17` fournit un indicateur de famine. | `services/updateService.js` applique la famine dans une transaction de progression, puis écrit le relevé. | Déterminer si les contrôles de la feuille sont une validation humaine après calcul ou des actions qui changent le résultat. Tester des cas limites approuvés par les organisateurs. |
| Ressources en suspens | `Sommaire!W40:AC41` contient ressource, quantité, entrée en vigueur et raison ; `X28` demande de les ajouter en fin de procédure. | Les transactions commerciales approuvées sont distribuées à la progression du destinataire ; aucun registre général des ressources en suspens n'est visible. | Définir les sources possibles (commerce, activité, correction, récompense), la date d'effet et l'ordre par rapport à production, famine et capacités. |
| Entretien annuel | `Entretiens & Magie!B5:G14` suit titres, coûts annuels en renommée et retards ; les coûts de ressources figurent aussi dans `I:V`. | L'inventaire stocke la renommée, mais la progression actuelle n'applique pas d'entretien annuel. | Définir l'échéance, les pénalités de retard et les exceptions avant automatisation. |
| Commerce | `Commerce!C5`, `C8:I108`, `M8:S108` affichent limites, routes et lignes ; `X31:AO33` décrit navire et caravane, avec blocs d'envoi/réception distincts. | Le serveur connaît routes, limites par période et transactions approuvées/recevables. | Réconcilier coûts par type, capacité, achat/vente/transfert, retour après refus et réception à la bonne période. |
| Conditions de bâtiment | `Infrastructures Civiles!H8:H27`, `L8:L27` et `F31:F65` portent quantités, rendements et conditions, dont plusieurs en texte libre. | Le serveur valide les propriétés et ressources connues ; certaines constructions hors `/api/building` ne sont pas transactionnelles. | Transformer chaque condition applicable en validation serveur explicite, avec erreur compréhensible. |

## Ce que révèlent les macros économiques

- `Module20.famine` fige les calculs de famine, reporte la population résultante dans `Sommaire!H13:I13`, les pertes dans `T17:U18` et les vivres dans `J25`. Les cellules de calcul associées passent par `M9 = IF(M8<0,(M8/15)/2,0)`, puis `M10` applique un arrondi et une réduction supplémentaire si l'hôpital est présent (`Infrastructures Civiles!F41-EE32>0`). Il faut confirmer si le facteur de moitié est déjà la mortalité finale et comment l'hôpital agit : une traduction directe pourrait diviser deux fois les pertes.
- `Module30.update` copie et fige des résultats intermédiaires (`CK43:CK46`, `CM43:CM56`) avant de les transférer au Sommaire, puis remet des compteurs visibles à zéro. La procédure ne vérifie ni la période ni un second clic. Le clic n'est donc pas, à lui seul, une preuve que toutes les règles se trouvent dans la macro : plusieurs résultats viennent de formules de cellules et d'étapes manuelles distinctes. Le serveur, lui, exige `expected_update` et refuse un second passage.
- `Module41.effectuer_entreposage` et `retirer_entreposage` figent des soldes d'entreposage et reportent or/ressources au Sommaire. `Module26.route_commerciale` fige un coût, met à jour l'or et ouvre Commerce. `Module27.procédé_transaction` recopie soldes et ressources envoyées/reçues puis remet des plages à zéro. Les validations ne sont pas explicites dans ces procédures : le serveur devra relire prérequis, limites, ressources et destinataire avant tout débit.
- `Module47.entretiens_titres` fige `ET6:ET14` en `EU6:EU14`, les reporte vers `Entretiens & Magie!G5:G13` et remet `E5:E13` à zéro ; `entretiens_infrastructures` transfère une série de coûts calculés. Ces procédures montrent que l'entretien est un vrai passage de la tenue de compte, mais ne suffisent pas à fixer seules l'échéance et le traitement des retards.
- `Module44.Entretiens` écrit deux séries de calculs (`EB*`, puis `EL*`) dans les mêmes cellules `Entretiens & Magie!P5:P32` : la seconde semble écraser la première. Elle réinitialise aussi plusieurs colonnes « Payé ». Comme `P` correspond aux « Retards » des infrastructures, il faut vérifier sur un cas réel si cet écrasement et ces remises à zéro sont voulus. `Module47.entretiens_infrastructures` recouvre une partie du même report, avec une borne de ligne légèrement différente.
- `Module43.caravane` fige l'achat d'une caravane : une unité de plus, deux unités d'or, de fer et de chevaux en moins, puis reporte les soldes au Sommaire et à l'Ost. La procédure visible ne refuse pas elle-même un stock insuffisant ou un dépassement de capacité ; la validation peut se trouver ailleurs dans la feuille, ce qui reste à confirmer avant d'implémenter ce coût.
- `Module48.Rumeurs` débite des épices et une valeur nommée « Inf. Après », puis reporte cette dernière dans `Sommaire!T38:U38`. La signification exacte de « Inf. » et les prérequis de cette action doivent être identifiés avant d'en faire une opération serveur.

L'extraction du VBA ne l'a pas exécuté et ne vérifie pas ce que produit Excel lors d'une utilisation interactive. `ThisWorkbook` ne contient pas d'événement automatique identifié ; les procédures économiques sont principalement appelées comme actions explicites.

## Questions à trancher avec les organisateurs

1. La population saisie en `Sommaire!H13` est-elle la seule valeur officielle, ou une correction temporaire de `F13` ? Quelle opération explique l'écart d'un habitant dans ce fichier ?
2. Les étapes après « Mise à Jour » dans `Sommaire!W19:X28` sont-elles des contrôles, des décisions manuelles ou des écritures supplémentaires ? La macro de mise à jour fige des valeurs, et la famine a sa propre procédure.
3. Quand les ressources en suspens deviennent-elles utilisables : avant consommation, après famine, ou à la fin de la période ? La date d'effet est-elle inclusive ?
4. Les coûts annuels de `Entretiens & Magie` sont-ils prélevés automatiquement à la première mise à jour de l'année ou décidés par un organisateur ?
5. Le « Réseau Criminel » de `Sommaire!L15` agit-il sur la seule taxe ou aussi sur les recettes d'infrastructures, et à quel moment faut-il arrondir ?
6. Dans le calcul de famine, quelle réduction l'hôpital doit-il apporter et à quel moment arrondit-on les morts ?

## Ordre de travail proposé, sans guerre

1. Établir quelques cas de référence tirés de la feuille avec les organisateurs : état de départ, actions, résultat attendu et explication des écarts.
2. Stabiliser la progression seigneuriale : population de référence, ordre des actions, famine, ressources différées, IDH et entretien à l'échéance.
3. Compléter les validations serveur des infrastructures et le commerce, puis étendre aux autres rôles lorsque les cas croisés sont décidés.

Les cellules et modules cités sont des indices vérifiables dans le classeur. Leur ordre d'exécution réel et leurs résultats doivent être validés sur des cas approuvés avant de devenir une spécification d'implémentation.

## Contradictions et ambiguïtés à arbitrer avant implémentation

1. **Population :** `Sommaire!F13` calcule 97 habitants, alors que `H13` en contient 98 et sert à plusieurs calculs. La cause de l'écart et la valeur officielle sont inconnues.
2. **Protection débutante :** `Sommaire!Y1` la déduit de la population actuelle sous 120 et du texte du titre « Baron ». La règle donnée par le propriétaire du projet est un état accordé aux nouveaux joueurs et perdu définitivement à 120, même après une baisse. Le serveur suit cette règle explicite ; la formule du classeur ne doit pas être transposée.
3. **Taxe et recettes :** `Sommaire!L15` additionne des recettes d'infrastructure et une réduction « Réseau Criminel » ; la projection serveur utilise ses effets configurés et un arrondi `floor`. Les termes, leur ordre et l'arrondi n'ont pas encore été rapprochés.
4. **Famine :** la formule de la feuille (`Sommaire!M9:M12`) et `Module20.famine` ajoutent un effet d'hôpital et arrondissent différemment du calcul de `services/updateService.js`. La division par deux apparaît à plusieurs endroits ; son sens exact est à confirmer avant toute correction.
5. **Ordre de mise à jour :** `Sommaire!W19:X28` place des vérifications et écritures après « Mise à Jour » ; `Module30.update` et `Module20.famine` sont des procédures séparées. Le serveur traite ces effets dans une même transaction. On ne sait pas encore ce qui est un contrôle humain ou une opération qui modifie le résultat.
6. **Ressources en suspens :** `Sommaire!W40:AC41` suit quantité, date d'effet et motif ; la feuille demande un ajout en fin de procédure, tandis que le serveur n'a qu'une réception différée du commerce. Les autres sources et le moment d'application ne sont pas établis.
7. **Entretien :** `Entretiens & Magie!B5:V14`, `Module44.Entretiens` et `Module47.entretiens_titres`/`entretiens_infrastructures` portent coûts, retards et reports. L'échéance et les conséquences d'un non-paiement sont inconnues ; deux séries semblent écrire successivement dans les mêmes cellules `P` et les bornes diffèrent.
8. **Commerce et caravane :** `Commerce!X31:AO33` distingue capacité navale et terrestre. `Module43.caravane` débite deux or, deux fer et deux chevaux, mais le coût exact, le plafond, les validations et la relation aux transactions du serveur n'ont pas été approuvés.
9. **Rumeurs :** `Module48.Rumeurs` consomme des épices et une valeur abrégée « Inf. » ; cette valeur et les prérequis ne sont pas suffisamment définis.
10. **Conditions des bâtiments :** plusieurs restrictions dans `Infrastructures Civiles!F31:F65` sont du texte libre. Leur signification exacte et leur correspondance avec les validations serveur restent à confirmer.

Aucune règle de cette liste n'a été modifiée à partir du classeur pendant cette analyse.
