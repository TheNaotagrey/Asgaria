# Messagerie de Gestion

Les conversations sont liées exclusivement aux identifiants des **seigneurs**, PNJ inclus, et restent avec le personnage lorsqu’il change de propriétaire. Le compte connecté sert uniquement à authentifier la session et à vérifier quel personnage elle peut utiliser. Un compte possédant plusieurs personnages utilise en mode joueur celui ayant une entrée dans players en priorité, puis le plus petit identifiant.

La messagerie suit exclusivement le personnage sélectionné dans le sommaire de Gestion. Un administrateur actif peut ainsi consulter et répondre comme un PNJ sélectionné sans compte associé. Aucun sélecteur d’identité supplémentaire n’est proposé dans Messagerie. Tout changement efface le fil et les brouillons et invalide les réponses en vol.

Les tables privées character_messages et character_trade_messages référencent seigneurs. Elles ne sont exposées ni par le CRUD générique ni par l’API publique. Les messages bloquent la suppression du personnage, plutôt que celle de son compte. Le serveur valide les identités sous transaction pour les envois et accusés de lecture.

Au démarrage, migrateCharacterMessages importe une seule fois les anciens private_messages et leurs événements, en conservant identifiants, dates et lecture. Chaque ancien compte est résolu vers son seigneur actuel (priorité à une entrée players, puis au plus petit identifiant). Les archives originales restent intactes, notamment les entrées dont le personnage ne peut plus être résolu. character_messaging_migration empêche de réattribuer les messages après un changement de propriétaire.

Les événements commerciaux sont capturés atomiquement dans le même fil : envois, acceptations et refus, avec noms, ressources, raison et date UTC. Leur identité est celle des deux seigneurs, même si les deux ont le même propriétaire ou sont PNJ. La reprise des transactions historiques est idempotente ; une décision sans date n’invente pas d’horodatage.

## Routes privées

Session obligatoire. Les paramètres de requête seigneurie_id (identifiant players) et character_id (identifiant seigneurs) permettent à un administrateur actif de sélectionner l’identité consultée ; character_id est prioritaire. Toute substitution par un joueur ou un administrateur en mode joueur renvoie 403.

- GET /api/messaging/recipients : { recipients: [{ id, name }] }, tous les autres seigneurs, sans courriels.
- GET /api/messaging/conversations : { character_id, can_send, conversations }, avec character_id du correspondant, name, unread_count, last_message_id, preview, created_at et sender_id.
- GET /api/messaging/conversations/:id/messages?limit=30 : :id désigne le seigneur correspondant. Réponse { messages, has_more }, messages triés par date UTC puis identifiant. before ou after résout un curseur dans cette paire, limite entre 1 et 100, curseurs exclusifs.
- POST /api/messaging/conversations/:id/messages : { body }, texte non vide de 1 à 4 000 caractères ; réponse 201 avec { message }.
- POST /api/messaging/conversations/:id/read : { up_to }, marque uniquement les messages reçus dans cette conversation jusqu’au curseur.

Chaque message expose id, sender_id, recipient_id (identifiants seigneurs), body, created_at et read_at. Les événements ajoutent event : kind, trade_id, origin_character_id, destination_character_id, origin_name, destination_name, resources et reason. Les clients ne peuvent pas fabriquer d’événement commercial.

La liste et le badge se chargent dès l’arrivée dans Gestion et toutes les 15 secondes lorsque la page est visible. Le fil et les accusés de lecture exigent l’onglet Messagerie actif. Le chargement de 30 messages conserve la position de lecture pendant la pagination ; les textes utilisent textContent.

Validation : npm test et scripts/validateMessagingUI.cjs, avec fixtures isolées et captures en joueur/administrateur sur ordinateur/mobile, incluant envoi et réponse PNJ. Les tests serveur couvrent droits, migration unique, conservation après réaffectation du compte, pagination, lecture et événements commerciaux.
