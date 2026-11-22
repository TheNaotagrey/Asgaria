# Corrections des bugs rencontrés pendant la simulation

1. L’avancement renouvelle les usages limités de production immédiate des bâtiments et infrastructures dans sa transaction. Les limites par bâtiment et les limites partagées sont distinguées, et les travailleurs affectés restent inchangés. Une forge déjà épuisée retrouve son quota à la prochaine mise à jour ; aucune période réelle n’a été avancée pour ce correctif.
2. Les horodatages SQLite sans suffixe, qui sont UTC, sont normalisés avant l’affichage local des transactions et notifications. Les dates possédant déjà un fuseau sont conservées.
3. Le nom du joueur dans Gestion vient du propriétaire du personnage sélectionné (`seigneur.player_name` dans la route privée), et non de l’administrateur connecté.
4. Une mutation administrative invalide les caches relationnels et les onglets déjà chargés. Le retour aux baronnies recharge les sélecteurs avec les seigneurs créés ou renommés.
5. Un quota commercial nul interdit les envois. Les transports construits contribuent au quota seulement si leurs infrastructures requises sont présentes ; une caravane requiert donc son marché. Transports, prérequis et quotas sont relus sous le verrou du débit. Les envois concurrents ne peuvent pas dépasser le plafond. Les effets explicites de quota des baronnies restent pris en compte. L’interface affiche zéro et désactive les échanges indisponibles.
6. Le bateau de haute mer exige un port, y compris pour les anciennes définitions sans restrictions. Le serveur refuse la construction avant tout débit et l’interface affiche le prérequis. Les bâtiments déjà construits sont conservés.
7. En administration active, la messagerie suit le compte propriétaire du personnage sélectionné. Ce contexte s’applique à la lecture, l’envoi et aux accusés de lecture, avec validation serveur. Un joueur ou un administrateur en mode joueur ne peut pas substituer une autre identité. Changer de personnage efface le fil et les brouillons affichés et invalide les réponses en vol. Les messages historiques restent liés aux comptes existants.

## Validation

- `npm test` : 97 tests réussis, dont les nouvelles régressions de forge, fuseau, haute mer, propriétaire, commerce sans transport et concurrence, ainsi que les accès à la messagerie.
- `node scripts/validateGestionUI.cjs` : Gestion, modes joueur/administrateur, ordinateur/mobile, champs et tableaux.
- `node scripts/validateMessagingUI.cjs` : historique, pagination, brouillons, erreurs, envoi et changement de personnage administrateur sur ordinateur/mobile.
- `node scripts/validateSimulationFixesUI.cjs` : dates de transactions et notifications en America/Toronto, port obligatoire, forge, quota zéro et sélecteurs actualisés après création.
- Serveur localhost redémarré. Sur le compte Aëlor réel, le quota terrestre vaut zéro et les deux boutons de commerce sont désactivés.

Les scripts de validation utilisent des fixtures isolées et ne changent pas les données du jeu. Captures dans `output/bugs-gestion-ui`, `output/bugs-messagerie-ui`, `output/bugs-focused-ui` et `output/bugs-commerce-reel.png`.
