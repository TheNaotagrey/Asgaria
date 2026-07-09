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

## Helpers publics

Les vues et filtres doivent utiliser ces helpers au lieu de reconstruire les hiérarchies:

- `vm.getTitleForBarony(baronyId, rankKey, mode)`
- `vm.getBaronyTitleId(baronyId, rankKey, mode)`
- `vm.getBaroniesForTitle(rankKey, titleId, mode)`
- `vm.getChildrenForTitle(rankKey, titleId, mode)`
- `vm.getImmediateSubtitles(rankKey, titleId, mode)`
- `vm.getColorForBaronyFilter(baronyId, filterKey)`

## Règle de rendu

`viewer2.js` garde la logique propre à la page: état, sélection, highlight, changement de filtre et préparation de données.

`mapInfoPanel2.js` rend le DOM des panneaux. Il ne doit pas reconstruire les hiérarchies; il reçoit des références ou des lignes déjà dérivées du ViewModel.

`mapFilters2.js` reste un registre déclaratif de filtres. Les filtres simples doivent lire les références ViewModel, par exemple:

```js
colorForBarony: (barony) => barony.defacto.duchy?.color || null
```

## Règle de facto

Les références `barony.defacto.*` doivent correspondre à la logique de coloration historique de `src/mapFilters.js`:

- override explicite `defacto_*_id` en premier;
- sinon, titre détenu au rang supérieur le plus proche;
- à ce rang seulement, préférence au titre de jure s'il est détenu;
- sinon premier titre détenu à ce rang;
- si le détenteur n'a pas de titre supérieur, recherche dans la chaîne des suzerains.
