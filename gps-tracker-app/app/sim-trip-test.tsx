import React, { useEffect, useState, useMemo } from 'react';
import { StyleSheet, View, Text, Pressable, FlatList, Platform } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { tripSim } from '../services/tripSimulationEngine';
import { C, S, R } from '../constants/design';
import { getSharedMarkerImageSource } from '../services/mapMarkerImage';
import { TrackPoint } from '../types';

import { SkiaDepartureMarker } from '../components/GPSMap/SkiaDepartureMarker';

const MAP_PROVIDER = (Platform.OS === 'android' && process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY) || 
                     (Platform.OS === 'ios' && process.env.EXPO_PUBLIC_GOOGLE_MAPS_IOS_KEY) 
                     ? PROVIDER_GOOGLE : undefined;

const SHARED_MARKER_IMAGE = getSharedMarkerImageSource();

export default function SimTripTest() {
  const insets = useSafeAreaInsets();
  const [trackers, setTrackers] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedPath, setSelectedPath] = useState<TrackPoint[]>([]);

  useEffect(() => {
    tripSim.startSimulation();
    const unsub = tripSim.subscribe((data) => {
      setTrackers(data);
      if (selectedId) {
        const path = tripSim.getPointsFromDeparture(selectedId);
        setSelectedPath(path);
      }
    });
    return () => {
      unsub();
      tripSim.stopSimulation();
    };
  }, [selectedId]);

  const onSelect = (id: string) => {
    setSelectedId(id);
    const path = tripSim.getPointsFromDeparture(id);
    setSelectedPath(path);
  };

  const selectedTracker = useMemo(() => trackers.find(t => t.id === selectedId), [trackers, selectedId]);

  const departureMinutes = useMemo(() => {
    if (!selectedTracker || !selectedTracker.departureAt) return 0;
    return Math.floor((Date.now() - selectedTracker.departureAt) / 60000);
  }, [selectedTracker]);

  const startPoint = selectedPath.length > 0 ? selectedPath[0] : null;

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Trip Simulation', headerShown: true }} />
      
      <MapView
        style={styles.map}
        provider={MAP_PROVIDER}
        initialRegion={{
          latitude: 41.8902,
          longitude: 12.4922,
          latitudeDelta: 0.2,
          longitudeDelta: 0.2,
        }}
      >
        {trackers.map((t) => (
          <Marker
            key={t.id}
            coordinate={{ latitude: t.lastLat, longitude: t.lastLon }}
            image={SHARED_MARKER_IMAGE as any}
            title={t.name}
            onPress={() => onSelect(t.id)}
            flat={true}
            rotation={t.isMoving ? 90 : 0}
          />
        ))}

        {selectedPath.length > 1 && (
          <Polyline
            coordinates={selectedPath.map(p => ({ latitude: p.lat, longitude: p.lon }))}
            strokeColor={C.accent}
            strokeWidth={4}
          />
        )}

        {startPoint && (
          <Marker
            coordinate={{ latitude: startPoint.lat, longitude: startPoint.lon }}
            anchor={{ x: 0.5, y: 1 }}
            tracksViewChanges={Platform.OS === 'android'}
          >
            <View collapsable={false} style={{ padding: 5 }}>
              <SkiaDepartureMarker minutes={departureMinutes} />
            </View>
          </Marker>
        )}
      </MapView>

      <View style={[styles.panel, { paddingBottom: insets.bottom + 16 }]}>
        <Text style={styles.panelTitle}>Veicoli in Simulazione</Text>
        <FlatList
          data={trackers}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => {
            const isSelected = item.id === selectedId;
            return (
              <Pressable 
                style={[styles.item, isSelected && styles.itemSelected]} 
                onPress={() => onSelect(item.id)}
              >
                <View style={styles.itemRow}>
                  <View style={[styles.statusDot, { backgroundColor: item.isMoving ? C.green : C.text3 }]} />
                  <Text style={[styles.itemName, isSelected && styles.textWhite]}>{item.name}</Text>
                  {item.isMoving && (
                    <View style={styles.movingBadge}>
                      <Text style={styles.movingText}>{item.speed} km/h</Text>
                    </View>
                  )}
                </View>
                {isSelected && item.isMoving && (
                  <View style={styles.tripInfo}>
                    <Ionicons name="time-outline" size={14} color="#fff" />
                    <Text style={styles.tripInfoText}>
                      Partito alle: {new Date(item.departureAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                    <Text style={styles.tripInfoText}> • {selectedPath.length} punti</Text>
                  </View>
                )}
              </Pressable>
            );
          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  map: { flex: 1 },
  panel: {
    backgroundColor: C.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '40%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 20,
  },
  panelTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: C.text1,
    marginBottom: 16,
  },
  item: {
    padding: 16,
    borderRadius: 16,
    backgroundColor: '#F2F2F7',
    marginBottom: 8,
  },
  itemSelected: {
    backgroundColor: C.accent,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 10,
  },
  itemName: {
    fontSize: 16,
    fontWeight: '600',
    color: C.text1,
    flex: 1,
  },
  textWhite: { color: '#fff' },
  movingBadge: {
    backgroundColor: 'rgba(52, 199, 89, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  movingText: {
    color: C.green,
    fontSize: 12,
    fontWeight: '700',
  },
  tripInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    opacity: 0.9,
  },
  tripInfoText: {
    color: '#fff',
    fontSize: 12,
    marginLeft: 4,
  }
});
