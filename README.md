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

## Configuration
Définir la variable d'environnement `SESSION_SECRET` avec une valeur aléatoire pour signer les cookies de session.
Par exemple :
```bash
export SESSION_SECRET="votre-valeur-secrète"
```

## Lancement du serveur
Le fichier `server.js` lance un petit serveur Express et crée automatiquement une base SQLite `asgaria.db`.

Démarrer le serveur :
```bash
npm start
```
Le serveur écoute par défaut sur [http://localhost:3000](http://localhost:3000).

## Utilisation
- `index.html` : visualisation principale de la carte terrestre et maritime, basée sur le ViewModel canonique.
- `mapEditor.html` : éditeur de baronnies. La barre latérale permet de modifier l'ID, le nom et les métadonnées (seigneur, religions, culture, vicomté, comté).
- `admin.html` : page d'administration pour consulter et modifier empires, royaumes, archiduchés, duchés, marquisats, comtés, vicomtés, seigneurs, religions et cultures. Les tableaux présentent les données existantes et une ligne vide permet d'en ajouter de nouvelles.

Il suffit d'ouvrir ces fichiers dans le navigateur (par exemple <http://localhost:3000/mapEditor.html>) une fois le serveur lancé.
Ne les ouvrez pas directement avec `file://`, car les requêtes vers l'API seraient bloquées par le navigateur.

La base de données `asgaria.db` est créée dans le répertoire racine et stocke toutes les informations (baronnies, seigneurs, etc.).

## API
Toutes les requêtes `PUT` vers l'API nécessitent qu'un utilisateur administrateur soit authentifié via la session.
- Si aucun utilisateur n'est connecté, le serveur répond avec `401 Unauthorized`.
- Si l'utilisateur connecté n'est pas administrateur, le serveur répond avec `403 Forbidden`.

## Tests
La suite automatisée couvre notamment les routes CRUD, le calendrier des mises à jour, le ViewModel et la pile principale de la carte.

```bash
npm test
```
