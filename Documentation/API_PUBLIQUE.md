# Documentation de l'API publique Asgaria (lecture seule)

## 1) Périmètre
Cette documentation couvre **uniquement les informations publiques accessibles en lecture** :
- endpoints HTTP en `GET`,
- données consultables sans authentification,
- structure des objets renvoyés.

Cette documentation **n'inclut pas** l'inscription, la connexion, les sessions, ni les routes d'administration/écriture.

> URL publique de référence : `https://www.asgaria.org`

## 2) Codes de réponse HTTP (détail)

### `200 OK`
La requête a réussi.
- Cas typiques : lecture de listes, lecture d'un enregistrement, lecture de pixels.
- Le corps contient du JSON (tableau, objet, ou objet indexé selon l'endpoint).

### `400 Bad Request`
La requête est mal formée ou contient des paramètres invalides.
- Exemple : paramètre numérique invalide (`barony_id` non entier sur certains endpoints).
- Le serveur renvoie généralement `{ "error": "..." }`.

### `404 Not Found`
La ressource demandée n'existe pas (selon endpoint).
- Peut apparaître sur certains accès détail (`/:id`) via route CRUD.
- Le serveur renvoie généralement `{ "error": "Introuvable" }`.

### `500 Internal Server Error`
Erreur interne serveur (exception, erreur SQL, décompression invalide, etc.).
- Le serveur renvoie un objet d'erreur JSON.

## 3) Tables publiques principales (lecture GET)

Les tables ci-dessous sont les **sources principales de données publiques**. Elles sont accessibles en lecture via :
- `GET /api/<table>` (liste),
- `GET /api/<table>/:id` (détail) **si la table possède une colonne `id`**.

### 3.1 Religions (`religions`)
**Description**
Table de référence des religions du monde Asgaria. Elle sert à catégoriser les seigneurs et certains attributs religieux des baronnies.

**Champs**
- `id` (`INTEGER`) : identifiant unique.
- `name` (`TEXT`) : nom de la religion.
- `color` (`TEXT`) : couleur d'affichage.

### 3.2 Cultures (`cultures`)
**Description**
Table de référence des cultures. Utilisée notamment pour caractériser les baronnies.

**Champs**
- `id` (`INTEGER`) : identifiant unique.
- `name` (`TEXT`) : nom de la culture.
- `color` (`TEXT`) : couleur d'affichage.

### 3.3 Seigneurs (`seigneurs`)
**Description**
Table centrale des personnages seigneuriaux. Elle relie identité, religion et hiérarchie vassalique.

**Champs**
- `id` (`INTEGER`) : identifiant du seigneur.
- `name` (`TEXT`) : nom du seigneur.
- `religion_id` (`INTEGER|null`) : FK vers `religions.id`.
- `overlord_id` (`INTEGER|null`) : FK vers `seigneurs.id` (suzerain).
- `user_id` (`INTEGER|null`) : lien interne éventuel avec un compte utilisateur.
- `player` (`INTEGER`, 0/1) : indique si le seigneur est un joueur.
- `bishop` (`INTEGER`, 0/1) : indique si le seigneur est évêque.

### 3.4 Baronnies (`baronies`)
**Description**
Table géopolitique de base du jeu. Une baronnie porte les informations territoriales, culturelles et religieuses principales.

**Champs**
- `id` (`INTEGER`) : identifiant de la baronnie.
- `name` (`TEXT`) : nom de la baronnie.
- `seigneur_id` (`INTEGER|null`) : détenteur (FK `seigneurs.id`).
- `religion_pop_id` (`INTEGER|null`) : religion principale de la population (FK `religions.id`).
- `county_id` (`INTEGER|null`) : comté de jure.
- `viscounty_id` (`INTEGER|null`) : vicomté associée.
- `defacto_county_id` (`INTEGER|null`) : comté de facto.
- `defacto_viscounty_id` (`INTEGER|null`) : vicomté de facto.
- `culture_id` (`INTEGER|null`) : culture dominante (FK `cultures.id`).
- `priory_religion_id` (`INTEGER|null`) : religion du prieuré.
- `church_religion_id` (`INTEGER|null`) : religion de l'église.
- `cathedral_religion_id` (`INTEGER|null`) : religion de la cathédrale.
- `vacant` (`INTEGER`, 0/1) : baronnie vacante.
- `color` (`TEXT`) : couleur cartographique.

### 3.5 Comtés (`counties`)
**Description**
Niveau féodal intermédiaire (comté), utilisé pour regrouper les baronnies et structurer la carte politique.

**Champs**
- `id` (`INTEGER`) : identifiant du comté.
- `name` (`TEXT`) : nom.
- `seigneur_id` (`INTEGER|null`) : détenteur.
- `duchy_id` (`INTEGER|null`) : duché de jure.
- `marquisate_id` (`INTEGER|null`) : marquisat de jure.
- `defacto_duchy_id` (`INTEGER|null`) : duché de facto.
- `defacto_marquisate_id` (`INTEGER|null`) : marquisat de facto.
- `color` (`TEXT`) : couleur.

### 3.6 Duchés (`duchies`)
**Description**
Niveau féodal supérieur au comté. Sert à structurer l'organisation territoriale et l'appartenance politique.

**Champs**
- `id` (`INTEGER`) : identifiant du duché.
- `name` (`TEXT`) : nom.
- `seigneur_id` (`INTEGER|null`) : détenteur.
- `kingdom_id` (`INTEGER|null`) : royaume de jure.
- `archduchy_id` (`INTEGER|null`) : archiduché de jure.
- `defacto_kingdom_id` (`INTEGER|null`) : royaume de facto.
- `defacto_archduchy_id` (`INTEGER|null`) : archiduché de facto.
- `color` (`TEXT`) : couleur.

### 3.7 Royaumes (`kingdoms`)
**Description**
Niveau royaume dans la hiérarchie territoriale. Utilisé pour la structuration politique de haut niveau.

**Champs**
- `id` (`INTEGER`) : identifiant du royaume.
- `name` (`TEXT`) : nom.
- `seigneur_id` (`INTEGER|null`) : détenteur.
- `empire_id` (`INTEGER|null`) : empire de jure.
- `defacto_empire_id` (`INTEGER|null`) : empire de facto.
- `color` (`TEXT`) : couleur.

### 3.8 Empires (`empires`)
**Description**
Plus haut niveau féodal standard. Sert à regrouper les royaumes au niveau impérial.

**Champs**
- `id` (`INTEGER`) : identifiant de l'empire.
- `name` (`TEXT`) : nom.
- `seigneur_id` (`INTEGER|null`) : détenteur.
- `color` (`TEXT`) : couleur.

## 4) Autres tables publiques (détaillées)

### 4.1 Archiduchés (`archduchies`)
**Description**
Niveau féodal intermédiaire supérieur, utilisé selon le modèle politique de la carte.

**Champs**
- `id` (`INTEGER`) : identifiant.
- `name` (`TEXT`) : nom.
- `seigneur_id` (`INTEGER|null`) : détenteur.
- `defacto_kingdom_id` (`INTEGER|null`) : rattachement de facto.
- `color` (`TEXT`) : couleur.

### 4.2 Marquisats (`marquisates`)
**Description**
Niveau territorial intermédiaire entre duché et comté selon l'organisation choisie.

**Champs**
- `id` (`INTEGER`) : identifiant.
- `name` (`TEXT`) : nom.
- `seigneur_id` (`INTEGER|null`) : détenteur.
- `defacto_duchy_id` (`INTEGER|null`) : rattachement de facto.
- `color` (`TEXT`) : couleur.

### 4.3 Vicomtés (`viscounties`)
**Description**
Niveau féodal local complémentaire du comté.

**Champs**
- `id` (`INTEGER`) : identifiant.
- `name` (`TEXT`) : nom.
- `seigneur_id` (`INTEGER|null`) : détenteur.
- `defacto_county_id` (`INTEGER|null`) : rattachement de facto.
- `color` (`TEXT`) : couleur.

### 4.4 Sanctuaires (`sanctuaries`)
**Description**
Table des sanctuaires religieux positionnés sur des baronnies.

**Champs**
- `id` (`INTEGER`) : identifiant du sanctuaire.
- `barony_id` (`INTEGER|null`) : baronnie d'implantation.
- `religion_id` (`INTEGER|null`) : religion associée.

### 4.5 Terres canoniques (`canonical_lands`)
**Description**
Relations canoniques entre baronnies (table d'association).

**Champs**
- `barony_id` (`INTEGER`) : baronnie source.
- `canonical_barony_id` (`INTEGER`) : baronnie canonique liée.

### 4.6 Connexions de baronnies (`barony_connections`)
**Description**
Connexions terrestres entre baronnies avec pondération de distance.

**Champs**
- `barony_id_1` (`INTEGER`) : extrémité A.
- `barony_id_2` (`INTEGER`) : extrémité B.
- `distance` (`INTEGER`, défaut 1) : coût/distance.

### 4.7 Routes commerciales terrestres (`trade_routes`)
**Description**
Routes commerciales terrestres entre baronnies, avec chemin explicite.

**Champs**
- `id` (`INTEGER`) : identifiant.
- `barony_id_1` (`INTEGER`) : extrémité A.
- `barony_id_2` (`INTEGER`) : extrémité B.
- `path` (`TEXT`) : chemin ordonné d'identifiants de baronnies (JSON sérialisé).

### 4.8 Lignes commerciales maritimes (`trade_lines`)
**Description**
Lignes commerciales maritimes entre baronnies, définies par des zones maritimes.

**Champs**
- `id` (`INTEGER`) : identifiant.
- `barony_id_1` (`INTEGER`) : extrémité A.
- `barony_id_2` (`INTEGER`) : extrémité B.
- `path` (`TEXT`) : chemin ordonné d'identifiants de zones maritimes (JSON sérialisé).

### 4.9 Zones maritimes (`maritime_zones`)
**Description**
Référentiel des zones maritimes de la carte.

**Champs**
- `id` (`INTEGER`) : identifiant de zone.
- `name` (`TEXT`) : nom de la zone.
- `seigneur_id` (`INTEGER|null`) : seigneur éventuellement associé.

### 4.10 Connexions maritimes (`maritime_zone_connections`)
**Description**
Connexions entre zones maritimes avec pondération de distance.

**Champs**
- `zone_id_1` (`INTEGER`) : extrémité A.
- `zone_id_2` (`INTEGER`) : extrémité B.
- `distance` (`INTEGER`, défaut 1) : coût/distance maritime.

### 4.11 Correspondances zone/baronnie (`maritime_zone_baronies`)
**Description**
Table de correspondance entre baronnies côtières et zones maritimes.

**Champs**
- `zone_id` (`INTEGER`) : zone maritime.
- `barony_id` (`INTEGER`) : baronnie associée.

### 4.12 Pixels des baronnies (`barony_pixels`)
**Description**
Stockage de la géométrie des baronnies.

**Champs**
- `barony_id` (`INTEGER`) : identifiant de la baronnie.
- `data` (`BLOB`) : géométrie compressée en base (décompressée par API dédiée).

### 4.13 Pixels des zones maritimes (`maritime_zone_pixels`)
**Description**
Stockage de la géométrie des zones maritimes.

**Champs**
- `zone_id` (`INTEGER`) : identifiant de la zone.
- `data` (`BLOB`) : géométrie compressée en base (décompressée par API dédiée).

## 5) Endpoints GET spécialisés (organigramme, pixels, partenaires)

### Organigramme féodal — `GET /api/organigrammes`
Retourne une structure agrégée :
- `seigneurs` : seigneurs + `religion_name`,
- `titles` : collections féodales (`empires`, `kingdoms`, `archduchies`, `duchies`, `marquisates`, `counties`, `viscounties`, `baronies`).

### Partenaires commerciaux — `GET /api/trade_partners?barony_id=<id>`
Retourne les partenaires commerciaux d'une baronnie :
- `id`, `name`, `seigneur_name`, `duchy_name`.

### Géométrie des baronnies — `GET /api/barony_pixels`
Variantes :
- `?id=<barony_id>` → tableau de points d'une baronnie,
- `?ids=1,2,3` → objet indexé `{ "id": points[] }`,
- `?offset=<n>&limit=<m>` → lot paginé,
- sans paramètre → toutes les géométries.

### Géométrie des zones maritimes — `GET /api/maritime_zone_pixels`
Variantes :
- `?id=<zone_id>` → tableau de points d'une zone,
- sans paramètre → objet indexé de toutes les zones.

## 6) Exemples GET sur le site public

```bash
curl https://www.asgaria.org/api/religions
curl https://www.asgaria.org/api/baronies
curl "https://www.asgaria.org/api/trade_partners?barony_id=42"
curl "https://www.asgaria.org/api/barony_pixels?ids=42,43,44"
```

## 7) Règle de maintenance
Toute évolution de l'API publique de lecture (routes `GET`, paramètres, structure JSON, tables/champs exposés) doit être répercutée dans ce fichier lors du même changement.
