# Validation visuelle du sommaire

Exécuter `npm test`, puis `node scripts/validateGestionUI.cjs` avec Playwright disponible.
Ce script charge les véritables fichiers HTML, CSS et JavaScript du dépôt via un serveur
local temporaire. Les réponses API sont des jeux de données contrôlés ; aucune base du
jeu n'est modifiée. Il ne remplace pas les tests d'intégration du serveur.

Playwright reste un outil facultatif de validation, sans dépendance ajoutée au serveur.
Si nécessaire, définir `PLAYWRIGHT_MODULE` avec le chemin du module Playwright installé
et `UI_BROWSER_PATH` avec le chemin d'un navigateur Chromium (Chrome ou Edge).
`UI_SCREENSHOT_DIR` permet de choisir le dossier des captures ; par défaut elles sont
enregistrées dans `artifacts/gestion-ui/`, ignoré par Git.

Le contrôle couvre le sommaire aux largeurs 1440, 1280, 1024 et 390 pixels, en modes
joueur et administrateur. Les sept onglets sont également contrôlés aux largeurs
1440, 1024 et 390 pixels dans les deux modes, avec des bâtiments, infrastructures,
actions spéciales imbriquées et sorts disponibles :

- ouverture et fermeture de la prévision sans déplacement des tableaux ;
- protection débutante active et absente ;
- variations positives et négatives, famine et pertes par stockage ;
- transactions vides, présentes et erreur réseau ;
- bouton de mise à jour désactivé en présence d'un blocage ;
- absence de chevauchement des tableaux de ressources et de débordement de la page ;
- absence d'erreurs JavaScript et accès à la consultation d'une transaction.
- styles de tableaux identiques entre onglets et bordures complètes ;
- champs administrateur contenus dans leurs cellules et seigneurie courante sélectionnée ;
- en-têtes d’infrastructures alignés sur les cellules, avec actions spéciales si présentes ;
- sélection d’une cible de sort et visibilité des commandes sur mobile.
- infobulle d’IDH avec 45 contributions longues, dans les deux modes à 1440 et 390 px :
  affichage hors des tableaux, limites de l’écran, liste défilante, survol, clic,
  navigation au clavier et fermeture avec Échap ou changement d’onglet.

Les infobulles de gestion utilisent un panneau flottant distinct des tableaux,
placé au-dessus de la page (API Popover si disponible, position fixe sinon).
Le panneau respecte la zone de navigation, s’adapte à l’espace au-dessus ou en dessous
de la valeur, et permet de faire défiler les listes longues sans déplacer le sommaire.

Les prévisions de vivres affichent la variation périodique complète : une consommation
nette de 1000 affiche −1000 même s'il reste seulement 500 vivres. Les morts par famine
sont calculés à partir du déficit après utilisation du stock.

Sur les écrans étroits, la prévision s'ouvre dans un panneau superposé afin de conserver
la position du sommaire. Les transactions disposent d'un défilement horizontal local.
Examiner aussi les captures des ressources après défilement : la page utilise son
propre conteneur de défilement et une capture initiale ne montre pas tout le sommaire.
