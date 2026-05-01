# Native Marker Image Cache Plugin

Plugin dedicato al riuso nativo dell'immagine marker usata con la prop `image` di `react-native-maps`.

## Cosa fa in prebuild

- iOS:
  - copia `assets/marker.png` in `ios/<Target>/Images.xcassets/marker_arrow_shared.imageset/`
  - genera `Contents.json` dell'imageset
- Android:
  - copia `assets/marker.png` in `android/app/src/main/res/drawable-nodpi/marker_arrow_shared.png`

## Nome risorsa condivisa

- `marker_arrow_shared`

## Uso in app

Usa `services/mapMarkerImage.ts`:

```ts
image={getSharedMarkerImageSource()}
```

Questo mantiene l'uso su `image` (quindi solo marker image-based) e abilita il riuso lato nativo della stessa risorsa.
