import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Pressable, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  FadeIn,
  FadeOut,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { C } from '../constants/design';

const CIRCLES = Array.from({ length: 20 }, (_, i) => ({
  id: `${i + 1}`,
  name: i === 0 ? 'Famiglia' : i === 1 ? 'Lavoro' : `Cerchia ${i + 1}`
}));

export const CircleSelector = () => {
  const insets = useSafeAreaInsets();
  const [isOpen, setIsOpen] = useState(false);
  const [selectedCircle, setSelectedCircle] = useState(CIRCLES[0]);

  const menuOpacity = useSharedValue(0);

  useEffect(() => {
    menuOpacity.value = withTiming(isOpen ? 1 : 0, {
      duration: 300,
      easing: Easing.bezier(0.25, 0.1, 0.25, 1)
    });
  }, [isOpen]);

  const menuStyle = useAnimatedStyle(() => ({
    opacity: menuOpacity.value,
    pointerEvents: menuOpacity.value > 0.5 ? 'auto' : 'none',
  }));

  const overlayStyle = useAnimatedStyle(() => ({
    opacity: menuOpacity.value,
    backgroundColor: 'rgba(0,0,0,0.3)',
    pointerEvents: menuOpacity.value > 0.1 ? 'auto' : 'none',
  }));

  const toggleMenu = () => setIsOpen(!isOpen);

  return (
    <>
      {/* Overlay scuro per chiudere il menu */}
      <Animated.View style={[StyleSheet.absoluteFill, overlayStyle]}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={() => setIsOpen(false)}
        />
      </Animated.View>

      {/* Pannello Menu (Top Sheet White) */}
      <Animated.View
        style={[
          styles.menuContainer,
          {
            paddingTop: insets.top + 70,
            maxHeight: '80%',
          },
          menuStyle
        ]}
      >
        <ScrollView
          style={styles.menuScroll}
          contentContainerStyle={styles.menuContent}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.menuTitle}>Le tue cerchie ({CIRCLES.length})</Text>
          {CIRCLES.map((circle) => (
            <TouchableOpacity
              key={circle.id}
              style={styles.menuItem}
              onPress={() => {
                setSelectedCircle(circle);
                setIsOpen(false);
              }}
            >
              <Text style={[
                styles.menuItemText,
                selectedCircle.id === circle.id && { color: C.accent, fontWeight: '700' }
              ]}>
                {circle.name}
              </Text>
              {selectedCircle.id === circle.id && (
                <Ionicons name="checkmark" size={20} color={C.accent} />
              )}
            </TouchableOpacity>
          ))}

          {/* Azioni Cerchia */}
          <View style={styles.actionSection}>
            <TouchableOpacity style={styles.actionButton}>
              <View style={[styles.actionIcon, { backgroundColor: C.accent + '15' }]}>
                <Ionicons name="add" size={22} color={C.accent} />
              </View>
              <Text style={styles.actionText}>Crea una cerchia</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionButton}>
              <View style={[styles.actionIcon, { backgroundColor: '#f0f0f0' }]}>
                <Ionicons name="enter-outline" size={20} color="#666" />
              </View>
              <Text style={styles.actionText}>Entra in una cerchia</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </Animated.View>

      {/* Selettore Bianco (Header Button) */}
      <View style={[styles.selectorContainer, { top: insets.top + 10 }]}>
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={toggleMenu}
          style={styles.selectorButton}
        >
          <View style={styles.selectorInner}>
            <Text style={styles.selectorText}>{selectedCircle.name}</Text>
            <Animated.View style={{ transform: [{ rotate: isOpen ? '180deg' : '0deg' }] }}>
              <Ionicons name="chevron-down" size={16} color="#333" />
            </Animated.View>
          </View>
        </TouchableOpacity>
      </View>
    </>
  );
};

const styles = StyleSheet.create({
  selectorContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 999,
  },
  selectorButton: {
    backgroundColor: '#fff',
    borderRadius: 25,
    paddingHorizontal: 20,
    paddingVertical: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 8,
    borderWidth: 1,
    borderColor: '#eee',
  },
  selectorInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  selectorText: {
    color: '#1a1a1a',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  menuContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 998,
    backgroundColor: '#fff',
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 20,
  },
  menuScroll: {
    flex: 1,
  },
  menuContent: {
    paddingHorizontal: 25,
    paddingBottom: 25,
  },
  menuTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#aaa',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 10,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
  },
  menuItemText: {
    color: '#333',
    fontSize: 17,
    fontWeight: '500',
  },
  actionSection: {
    marginTop: 10,
    paddingTop: 10,
    gap: 8,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },
  actionIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
  },
});
