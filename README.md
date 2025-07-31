# Asgaria

Ce dépôt contient un éditeur de carte et une interface d'administration pour le projet Asgaria.

## Prérequis
- [Node.js](https://nodejs.org/) version 14 ou supérieure
- `npm` (fourni avec Node.js)

## Installation
1. Cloner le dépôt et se placer dans le dossier
   ```bash
   git clone <repo>
   cd Asgaria
   ```
2. Installer les dépendances
   ```bash
   npm install
   ```

## Lancement du serveur
Le fichier `server.js` lance un petit serveur Express et crée automatiquement une base SQLite `asgaria.db`.

Démarrer le serveur :
```bash
npm start
```
Le serveur écoute par défaut sur [http://localhost:3000](http://localhost:3000).

## Utilisation
- `index.html` : visualisation simple de la carte.
- `mapEditor.html` : éditeur de baronnies. La barre latérale permet de modifier l'ID, le nom et les métadonnées (seigneur, religions, culture, duché).
- `admin.html` : page d'administration pour ajouter royaumes, comtés, duchés, seigneurs, religions et cultures.

Il suffit d'ouvrir ces fichiers dans le navigateur (par exemple <http://localhost:3000/mapEditor.html>) une fois le serveur lancé.

La base de données `asgaria.db` est créée dans le répertoire racine et stocke toutes les informations (baronnies, seigneurs, etc.).

## Tests
Aucun test automatisé n'est défini. La commande `npm test` renverra donc une erreur.
