# Diagnostic du commerce — 4 octobre 2026

Branche : `test-full-gestion`. Lecture de la base locale sans modification ;
reproductions sur un serveur réel avec une base SQLite temporaire isolée.
Les vérifications d’interface utilisent les scripts réels avec des réponses API
de test et couvrent les modes joueur et administrateur, ordinateur et mobile.

## Blocages signalés et corrections

- Les deux seigneuries locales affectées à une baronnie ont consommé leur quota
  terrestre : 5/5 et 1/1. Les boutons désactivés correspondent à cette règle.
  Une infobulle explique maintenant le quota et sa réinitialisation à la prochaine
  mise à jour ; elle fonctionne au survol, au clic sur son conteneur et au clavier.
- Le choix de destination excluait les types de liaison déjà construits, mais la
  fenêtre de construction recalculait les types et préférait toujours la terre.
  Une destination ayant déjà une route terrestre pouvait donc produire une erreur
  de liaison existante alors que seule une ligne maritime était constructible.
  La fenêtre exclut maintenant les liaisons existantes dans les deux sens.
- La construction omettait `seigneurie_id`. Un administrateur sans seigneurie
  personnelle obtenait « Seigneurie introuvable », malgré la sélection d’un joueur.
  Le serveur isolé renvoie 400 sans cet identifiant et 200 avec celui du joueur
  sélectionné. La requête transmet maintenant cet identifiant.
- Après construction, seuls les chemins étaient rechargés : l’or affiché restait
  périmé. Toute la gestion est maintenant rechargée. Le mode de création et ses
  destinations sont aussi réinitialisés lors du changement de seigneurie.

Le message exact et la séquence du cas signalé « changer de joueur débloque la
route » ne sont pas connus. Ces défauts sont confirmés, mais leur lien avec cette
séquence particulière reste à confirmer.

## Autres anomalies confirmées, non corrigées dans ce changement

1. **Retour des ressources refusées : capacité incomplète.** La route de retour
   calcule le stockage depuis les infrastructures seules et omet les effets de
   baronnie. Avec une capacité affichée de 1500 vivres, un stock de 450 et un retour
   de 100, elle rend 50 et perd 50 en utilisant une capacité de 500.
2. **Retour en mode administrateur : succès affiché sans crédit.** La requête de
   retour ne transmet pas la seigneurie sélectionnée et l’interface ignore son
   échec. Sur le serveur isolé, elle annonce le retour alors que `returned` reste 0.
3. **Transactions approuvées non reçues masquées après trois mois.** Le filtre
   d’historique les retire même si `received=0`. Quatre transactions locales
   correspondent à ce cas ; leur crédit à la mise à jour doit être vérifié
   indépendamment de leur visibilité dans la liste.
4. **Règle clarifiée et corrigée : décisions sur une transaction future.** Le joueur
   ne doit pouvoir ni accepter ni refuser avant la période de l’envoi. Le serveur
   bloquait uniquement l’acceptation ; il bloque maintenant les deux décisions,
   y compris en mode administrateur. L’interface explique ce blocage.
5. **Type d’envoi invalide accepté.** `send_transaction` transforme silencieusement
   un type inconnu en échange terrestre au lieu de le refuser explicitement.
6. **Période d’origine périmée possible.** La persistance conserve la période
   préparée avant la transaction SQLite. Une progression intervenant entre cette
   préparation et l’écriture peut rattacher l’envoi à la mise à jour précédente.
   Reproduction au niveau du service de persistance ; la concurrence HTTP reste
   à tester.

## Validation des corrections

- `npm test` : 90 tests réussis.
- `scripts/validateGestionUI.cjs` : contrôles navigateur réussis, sans erreur
  JavaScript ; scénarios de quota, liaison manquante, sélection administrative et
  rafraîchissement des ressources ajoutés.
- Captures examinées : `artifacts/gestion-ui/admin-390-commerce-quota.png` et
  `artifacts/gestion-ui/joueur-1440-commerce-liaison-manquante.png`.

Les captures sont générées localement et ignorées par Git. Aucune transaction
ni ressource de la base utilisateur n’a été modifiée par cette investigation.
