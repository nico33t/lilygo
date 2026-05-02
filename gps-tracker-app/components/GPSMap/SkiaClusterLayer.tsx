import React, { useMemo } from 'react'
import { StyleSheet } from 'react-native'
import {
  Atlas,
  Canvas,
  Group,
  Skia,
  rect,
  useFont,
  useTexture,
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
  
  // Point markers using Atlas for peak performance
  const pointAtlasData = useMemo(() => {
    if (!collection) return { rects: [], transforms: [] }
    
    const rects: any[] = []
    const transforms: any[] = []
    
    const markerRect = rect(0, 0, 12, 12)
    
    collection.features.forEach(f => {
      if (f.properties.cluster) return
      const pos = projection(f.geometry.coordinates[1], f.geometry.coordinates[0])
      if (pos) {
        rects.push(markerRect)
        // RSXform: [scos, ssin, tx, ty]
        transforms.push(Skia.RSXform(1, 0, pos.x - 6, pos.y - 6))
      }
    })
    
    return { rects, transforms }
  }, [collection, projection])

  // Simple blue dot texture for Atlas
  const pointTexture = useMemo(() => {
    const surface = Skia.Surface.Make(12, 12)!
    const canvas = surface.getCanvas()
    const paint = Skia.Paint()
    paint.setColor(Skia.Color('#2E86DE'))
    canvas.drawCircle(6, 6, 5, paint)
    paint.setColor(Skia.Color('white'))
    paint.setStyle(Skia.PaintStyle.Stroke)
    paint.setStrokeWidth(1.5)
    canvas.drawCircle(6, 6, 5, paint)
    return surface.makeImageSnapshot()
  }, [])

  if (!collection) return null

  return (
    <Group>
      {/* GPU Atlas for points */}
      <Atlas
        image={pointTexture}
        sprites={pointAtlasData.rects}
        transforms={pointAtlasData.transforms}
      />

      {/* Clusters (few enough for regular Skia elements) */}
      {collection.features.map((f) => {
        if (!f.properties.cluster) return null
        const pos = projection(f.geometry.coordinates[1], f.geometry.coordinates[0])
        if (!pos) return null
        
        const count = f.properties.point_count
        const color = count > 50 ? '#E74C3C' : count > 10 ? '#F39C12' : '#2E86DE'
        
        return (
          <Group key={f.id}>
            <SkiaCircle cx={pos.x} cy={pos.y} r={16} color={color} />
            <SkiaCircle cx={pos.x} cy={pos.y} r={16} color="white" style="stroke" strokeWidth={2} />
            {font && (
              <SkiaText
                x={pos.x - (font.measureText(count.toString()).width / 2)}
                y={pos.y + 4}
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
