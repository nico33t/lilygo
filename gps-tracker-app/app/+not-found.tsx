import { Link, Stack } from 'expo-router';
import { StyleSheet, View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { 
  useAnimatedStyle, 
  withRepeat, 
  withSequence, 
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C } from '../constants/design';

export default function NotFoundScreen() {
  const insets = useSafeAreaInsets();
  
  const animatedStyle = useAnimatedStyle(() => {
    return {
      opacity: withRepeat(
        withSequence(
          withTiming(0.4, { duration: 1000 }),
          withTiming(1, { duration: 1000 })
        ),
        -1,
        true
      ),
      transform: [
        { scale: withRepeat(withTiming(1.1, { duration: 2000 }), -1, true) }
      ]
    };
  });

  return (
    <>
      <Stack.Screen options={{ title: 'Oops!', headerShown: false }} />
      <View style={styles.container}>
        <View style={styles.content}>
          <Animated.View style={[styles.iconContainer, animatedStyle]}>
            <View style={styles.iconCircle}>
              <Ionicons name="location" size={60} color={C.accent} />
            </View>
            <View style={styles.radar} />
          </Animated.View>
          
          <Text style={styles.title}>Nessun Segnale</Text>
          <Text style={styles.subtitle}>
            Ti sei spinto oltre i confini della mappa. Questa posizione non è tracciata o non esiste più.
          </Text>
        </View>

        <View style={[styles.bottomContainer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <Link href="/" asChild>
            <Pressable style={styles.button}>
              <Text style={styles.buttonText}>Torna alla Home</Text>
              <Ionicons name="arrow-forward" size={20} color="#fff" style={{ marginLeft: 8 }} />
            </Pressable>
          </Link>
        </View>
        
        {/* Decorative elements for Light Mode */}
        <View style={[styles.decoration, { top: -40, right: -40, backgroundColor: C.accentMid }]} />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    zIndex: 10,
  },
  iconContainer: {
    marginBottom: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: C.accentMid,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  radar: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    borderWidth: 1.5,
    borderColor: C.accent,
    opacity: 0.15,
  },
  title: {
    fontSize: 34,
    fontWeight: '900',
    color: '#1C1C1E',
    marginBottom: 16,
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 17,
    color: '#636366',
    textAlign: 'center',
    lineHeight: 25,
    paddingHorizontal: 20,
  },
  bottomContainer: {
    paddingHorizontal: 20,
    width: '100%',
    position: 'absolute',
    bottom: 0,
  },
  button: {
    backgroundColor: C.accent,
    height: 64,
    borderRadius: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: C.accent,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 15,
    elevation: 10,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  decoration: {
    position: 'absolute',
    width: 250,
    height: 250,
    borderRadius: 125,
    zIndex: 0,
    opacity: 0.5,
  },
});
