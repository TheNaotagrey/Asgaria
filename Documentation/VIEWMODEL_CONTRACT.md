# Contrat ViewModel

`viewModel.js` est la source canonique des relations de carte pour la pile `index2`.

## Références canoniques

- Une baronnie expose tous ses titres supérieurs par références d'objets:
  - `barony.dejure.viscounty`, `barony.dejure.county`, `barony.dejure.duchy`, etc.
  - `barony.defacto.viscounty`, `barony.defacto.county`, `barony.defacto.duchy`, etc.
- Un titre expose ses relations directes:
  - `title.deJureParents`
  - `title.deJureChildren`
  - `title.defactoParent`
  - `title.defactoChildren`
- Les seigneurs exposent leurs références directes:
  - `seigneur.overlord`
  - `seigneur.vassals`
  - `seigneur.baronies`
  - `seigneur.titles`
- Les relations de baronnie exposent leurs références depuis le ViewModel:
  - `barony.canonicalLands`
  - `barony.canonicalFor`
  - `barony.sanctuaries`
  - `barony.connectedBaronies`
  - `barony.distanceToSelected` après application d'une distance dérivée
- Les routes commerciales et lignes maritimes font partie du ViewModel:
  - `vm.tradeRoutes.list`, `vm.tradeRoutes.byId`
  - `vm.tradeLines.list`, `vm.tradeLines.byId`
  - `barony.tradeRoutes`, `barony.tradeLines`
  - `barony.landTradeBaronies`, `barony.seaTradeBaronies`
- La piété ducale est dérivée une seule fois pendant la construction du ViewModel:
  - `duchy.pietyStatsByReligion`
  - `duchy.duchyPietyWinnerId`
  - `duchy.duchyPietyWinnerReligion`
  - `barony.duchyPietyWinnerReligion`

## Helpers publics

Les vues et filtres doivent utiliser ces helpers au lieu de reconstruire les hiérarchies:

- `vm.getTitleForBarony(baronyId, rankKey, mode)`
- `vm.getBaronyTitleId(baronyId, rankKey, mode)`
- `vm.getBaroniesForTitle(rankKey, titleId, mode)`
- `vm.getChildrenForTitle(rankKey, titleId, mode)`
- `vm.getImmediateSubtitles(rankKey, titleId, mode)`
- `vm.getColorForBaronyFilter(baronyId, filterKey)`
- `vm.applyDistancesToBaronies(fromBaronyId)`

Appeler `vm.applyDistancesToBaronies(null)` remet `barony.distanceToSelected` à `-1` pour toutes les baronnies.

## Règle de rendu

`viewer2.js` garde la logique propre à la page: état, sélection, highlight, changement de filtre et orchestration des panneaux.

`mapDataLoader.js` charge les données API, construit le ViewModel et prépare les index techniques partagés par le viewer et le futur éditeur v2.

`mapCanvasRuntime.js` rend la carte et gère le canvas, le pan/zoom, le hit testing, `onMapClick(...)` et `highlightBaronies(...)`. Il ne doit pas contenir le runtime d'application des filtres.

`mapFilterRuntime.js` applique les définitions de filtres au `mapData` courant et produit les `colorMap`, patterns et données de légende.

`mapInfoPanel2.js` rend le DOM des panneaux. Il ne doit pas reconstruire les hiérarchies; il reçoit des références ou des lignes déjà dérivées du ViewModel.

`mapFilterRegistry.js` reste un registre déclaratif de filtres. Les filtres simples doivent lire les références ViewModel, par exemple:

```js
colorForBarony: (barony) => barony.defacto.duchy?.color || null
```

Les filtres qui dépendent de la baronnie sélectionnée utilisent `kind: 'baronyBasedOnSelected'`. Le runtime leur passe la baronnie sélectionnée et peut appeler `onSelectBarony(selected, vm)` pour dériver un état temporaire sur le ViewModel, comme les distances. Les routes commerciales utilisent aussi ce type en lisant `barony.landTradeBaronies` et `barony.seaTradeBaronies`.

## Règle de facto

Les références `barony.defacto.*` doivent correspondre à la logique de coloration historique de `src/mapFilters.js`:

- override explicite `defacto_*_id` en premier;
- sinon, titre détenu au rang supérieur le plus proche;
- à ce rang seulement, préférence au titre de jure s'il est détenu;
- sinon premier titre détenu à ce rang;
- si le détenteur n'a pas de titre supérieur, recherche dans la chaîne des suzerains.
