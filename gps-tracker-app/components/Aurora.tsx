import React, { useEffect } from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import { Canvas, RadialGradient, Rect, BlurMask, vec, Group } from '@shopify/react-native-skia';
import Animated, { 
  useSharedValue, 
  withRepeat, 
  withTiming, 
  useDerivedValue,
  Easing
} from 'react-native-reanimated';
import { C } from '../constants/design';

export const Aurora = ({ active = true }: { active?: boolean }) => {
  const { width, height } = useWindowDimensions();
  const time = useSharedValue(0);

  useEffect(() => {
    if (active) {
      time.value = withRepeat(
        withTiming(1, { duration: 10000, easing: Easing.linear }),
        -1,
        false
      );
    }
  }, [active]);

  // Posizioni animate per le sfere di luce (movimento circolare/ondulatorio)
  const sphere1 = useDerivedValue(() => {
    const angle = time.value * Math.PI * 2;
    return {
      cx: (width / 2) + Math.cos(angle) * (width / 2.5),
      cy: (height / 2) + Math.sin(angle) * (height / 2.5),
      r: width * 0.8
    };
  });

  const sphere2 = useDerivedValue(() => {
    const angle = (time.value + 0.3) * Math.PI * 2;
    return {
      cx: (width / 2) + Math.sin(angle) * (width / 2.2),
      cy: (height / 2) + Math.cos(angle) * (height / 2.2),
      r: width * 0.7
    };
  });

  const sphere3 = useDerivedValue(() => {
    const angle = (time.value + 0.6) * Math.PI * 2;
    return {
      cx: (width / 2) + Math.cos(angle * 0.5) * (width / 2),
      cy: (height / 2) + Math.sin(angle * 0.8) * (height / 2),
      r: width * 0.9
    };
  });

  return (
    <Canvas style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}>
      <Group>
        <BlurMask blur={60} style="normal" />
        
        {/* Sfera 1 */}
        <Rect x={0} y={0} width={width} height={height}>
          <RadialGradient
            c={useDerivedValue(() => vec(sphere1.value.cx, sphere1.value.cy))}
            r={useDerivedValue(() => sphere1.value.r)}
            colors={[C.accent + '66', 'transparent']} // 66 = ~40% opacity
          />
        </Rect>

        {/* Sfera 2 */}
        <Rect x={0} y={0} width={width} height={height}>
          <RadialGradient
            c={useDerivedValue(() => vec(sphere2.value.cx, sphere2.value.cy))}
            r={useDerivedValue(() => sphere2.value.r)}
            colors={[C.accent + '44', 'transparent']} // 44 = ~25% opacity
          />
        </Rect>

        {/* Sfera 3 */}
        <Rect x={0} y={0} width={width} height={height}>
          <RadialGradient
            c={useDerivedValue(() => vec(sphere3.value.cx, sphere3.value.cy))}
            r={useDerivedValue(() => sphere3.value.r)}
            colors={[C.accent + '55', 'transparent']}
          />
        </Rect>
      </Group>
    </Canvas>
  );
};
