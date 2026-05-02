import React, { useMemo } from 'react'
import {
  Atlas,
  Group,
  Skia,
  rect,
  useFont,
  Text as SkiaText,
  Circle as SkiaCircle,
} from '@shopify/react-native-skia'
import type { GeoJsonFeatureCollection } from '../../services/nativeClustering'

type SkiaClusterLayerProps = {
  collection: GeoJsonFeatureCollection | null
  projection: (lat: number, lon: number) => { x: number; y: number } | null
}

export const SkiaClusterLayer = ({
  collection,
  projection,
}: SkiaClusterLayerProps) => {
  const font = useFont(null, 12)
  
  // Point markers using Atlas with high memory efficiency
  const atlasData = useMemo(() => {
    if (!collection) return null
    
    const features = collection.features
    const count = features.length
    
    // We use a shared rect for all points to save memory
    const markerRect = rect(0, 0, 12, 12)
    const sprites: any[] = []
    const transforms: any[] = []
    
    // Performance optimization: single pass for both points and identifying clusters
    const clusters: any[] = []
    
    for (let i = 0; i < count; i++) {
      const f = features[i]
      const coords = f.geometry.coordinates
      const pos = projection(coords[1], coords[0])
      
      if (!pos) continue

      if (f.properties.cluster) {
        clusters.push({ ...f, pos })
      } else {
        sprites.push(markerRect)
        // RSXform: [scos, ssin, tx, ty] -> Scale 1, Rotation 0, Translation pos
        transforms.push(Skia.RSXform(1, 0, pos.x - 6, pos.y - 6))
      }
    }
    
    return { sprites, transforms, clusters }
  }, [collection, projection])

  // Tiny static texture (144 pixels) - very memory efficient
  const pointTexture = useMemo(() => {
    const surface = Skia.Surface.Make(12, 12)!
    const canvas = surface.getCanvas()
    const paint = Skia.Paint()
    paint.setAntiAlias(true)
    paint.setColor(Skia.Color('#2E86DE'))
    canvas.drawCircle(6, 6, 5, paint)
    paint.setColor(Skia.Color('white'))
    paint.setStyle(Skia.PaintStyle.Stroke)
    paint.setStrokeWidth(1.5)
    canvas.drawCircle(6, 6, 5, paint)
    return surface.makeImageSnapshot()
  }, [])

  if (!collection || !atlasData) return null

  return (
    <Group>
      {/* GPU Atlas for points - The heavy lifting is done here in one pass */}
      <Atlas
        image={pointTexture}
        sprites={atlasData.sprites}
        transforms={atlasData.transforms}
      />

      {/* Clusters - Rendered as standard Skia elements (usually few enough to not impact memory) */}
      {atlasData.clusters.map((f) => {
        const count = f.properties.point_count
        const color = count > 50 ? '#E74C3C' : count > 10 ? '#F39C12' : '#2E86DE'
        
        return (
          <Group key={f.id}>
            <SkiaCircle cx={f.pos.x} cy={f.pos.y} r={16} color={color}>
               <SkiaCircle cx={f.pos.x} cy={f.pos.y} r={16} color="white" style="stroke" strokeWidth={2} />
            </SkiaCircle>
            {font && (
              <SkiaText
                x={f.pos.x - (font.measureText(count.toString()).width / 2)}
                y={f.pos.y + 4}
                text={count.toString()}
                font={font}
                color="white"
              />
            )}
          </Group>
        )
      })}
    </Group>
  )
}
