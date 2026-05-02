import { Region } from 'react-native-maps';

export type ProjectionFn = (lat: number, lon: number) => { x: number; y: number } | null;

/**
 * Creates a synchronous Mercator projection function for a given map region and view dimensions.
 * This allows Skia to draw directly over react-native-maps without async bridge calls.
 */
export function createMercatorProjection(region: Region, width: number, height: number): ProjectionFn {
  const { latitude, longitude, latitudeDelta, longitudeDelta } = region;

  // Map boundaries
  const minLat = latitude - latitudeDelta / 2;
  const maxLat = latitude + latitudeDelta / 2;
  const minLon = longitude - longitudeDelta / 2;
  const maxLon = longitude + longitudeDelta / 2;

  return (lat: number, lon: number) => {
    // Check if within bounds (optional, but good for performance)
    if (lat < minLat - latitudeDelta || lat > maxLat + latitudeDelta || 
        lon < minLon - longitudeDelta || lon > maxLon + longitudeDelta) {
      return null;
    }

    // Linear projection (sufficient for small deltas like tracking views)
    const x = ((lon - minLon) / longitudeDelta) * width;
    // Map Y is inverted
    const y = (1 - (lat - minLat) / latitudeDelta) * height;

    return { x, y };
  };
}
