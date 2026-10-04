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

Le contrôle couvre les largeurs 1440, 1280, 1024 et 390 pixels :

- ouverture et fermeture de la prévision sans déplacement des tableaux ;
- protection débutante active et absente ;
- variations positives et négatives, famine et pertes par stockage ;
- transactions vides, présentes et erreur réseau ;
- bouton de mise à jour désactivé en présence d'un blocage ;
- absence de chevauchement des tableaux de ressources et de débordement de la page ;
- absence d'erreurs JavaScript et accès à la consultation d'une transaction.

Sur les écrans étroits, la prévision s'ouvre dans un panneau superposé afin de conserver
la position du sommaire. Les transactions disposent d'un défilement horizontal local.
Examiner aussi les captures des ressources après défilement : la page utilise son
propre conteneur de défilement et une capture initiale ne montre pas tout le sommaire.
