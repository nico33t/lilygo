# Native Map Clustering Plugin

Clustering nativo iOS + Android, plugin-first per Expo prebuild.

## Cosa fa

- Copia i file nativi clustering in `ios/<Target>/` e `android/app/src/main/java/<package>/clustering/`.
- Registra automaticamente il package Android in `MainApplication.kt`.
- Mantiene setup idempotente: rilanciare `prebuild` non duplica file/import.

## Installazione

1. Verifica che il plugin sia in `app.config.js`:
   - `./plugins/withNativeMapClustering`
2. Rigenera nativo:
   - `npx expo prebuild --clean`
3. Avvia build:
   - `npx expo run:ios`
   - `npx expo run:android`

## Feature flag

- `EXPO_PUBLIC_CLUSTERING_ENABLED=true` abilita clustering nativo.
- `EXPO_PUBLIC_CLUSTERING_ENABLED=false` fallback automatico a marker raw.

## API JS

File: `services/nativeClustering.ts`

- `isNativeClusteringAvailable()`
- `buildNativeClusters(points, zoom, bounds, options)`
- `getClusterLeaves(clusterId, limit, offset)`
- `getClusterExpansionZoom(clusterId)`
- `getClusterProviderTuning(provider)`

`ClusterOptions` supporta:

- `datasetId`
- `radius`
- `minPoints`
- `minZoom`
- `maxZoom`

## Engine nativo

- Approccio gerarchico tile-pyramid (supercluster-like).
- Snapshot per zoom e cache LRU (`datasetId + zoom + bbox + params`).
- `getLeaves` reale da mapping leaf indices.
- `getExpansionZoom` reale calcolato su split effettivo dei cluster ai zoom superiori.
- Build su queue/worker nativo:
  - iOS: `DispatchQueue` (`qos: .userInitiated`)
  - Android: `Executors.newSingleThreadExecutor()`

## Tuning provider

Gestito in `getClusterProviderTuning(provider)`:

- Apple Maps iOS default: raggio più stretto.
- Google Maps iOS: medio.
- Google Maps Android: più ampio + `minPoints` più alto.

## QA performance (cluster-test)

`app/cluster-test.tsx` include test runtime con dataset:

- `50`
- `500`
- `5000`

Mostra:

- tempo build cluster (ms)
- numero punti
- numero cluster

Interazioni:

- tap cluster => `getExpansionZoom` + zoom automatico su mappa
- preview leaves (`getLeaves`) in modal

## Debugging rapido

- Se non clusterizza:
  - controlla `EXPO_PUBLIC_CLUSTERING_ENABLED`
  - controlla log JS e native compile errors
  - riesegui `npx expo prebuild --clean`
- Se Android non registra package:
  - verifica import `NativeMapClusteringPackage` in `MainApplication.kt`

## Limiti attuali

- Cache LRU in memoria processo (non persistente tra restart app).
- `getLeaves` ritorna subset paginato dal dataset caricato in ultimo `buildClusters`.
- Non disegna UI custom nativa per cluster bubble: rendering bubble resta in React Native.
