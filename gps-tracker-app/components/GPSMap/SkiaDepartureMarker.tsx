import React, { useMemo } from 'react';
import { View, Text, Platform } from 'react-native';
import { Canvas, Path, Text as SkiaText, useFont, Rect, RoundedRect, LinearGradient, vec, Circle } from '@shopify/react-native-skia';
import { C } from '../../constants/design';

interface SkiaDepartureMarkerProps {
  minutes: number;
}

export const SkiaDepartureMarker = ({ minutes }: SkiaDepartureMarkerProps) => {
  const font = useFont(null, 13);
  const text = `Partito da ${minutes} min`;
  const width = 160;
  const height = 40;
  const tipSize = 10;
  
  // Padding di sicurezza per l'ombra (solo sopra e ai lati)
  const safetyPadding = 12;
  const canvasWidth = width + (safetyPadding * 2); 
  // L'altezza finisce esattamente alla punta per un ancoraggio perfetto
  const canvasHeight = safetyPadding + 23 + height + tipSize; 

  if (Platform.OS === 'android') {
    return (
      <View style={{ width: canvasWidth, height: canvasHeight, alignItems: 'center' }}>
        <View style={{
          marginTop: safetyPadding + 23, // Shift + padding superiore
          width: width,
          height: height,
          backgroundColor: '#FFFFFF',
          borderRadius: 12,
          justifyContent: 'center',
          alignItems: 'center',
          elevation: 10,
          shadowColor: '#000',
        }}>
          <Text style={{ color: '#000000', fontSize: 13, fontWeight: '700' }}>{text}</Text>
          <View style={{
            position: 'absolute',
            bottom: -8,
            left: (width / 2) - 8,
            width: 0,
            height: 0,
            borderStyle: 'solid',
            borderLeftWidth: 8,
            borderRightWidth: 8,
            borderTopWidth: 10,
            borderLeftColor: 'transparent',
            borderRightColor: 'transparent',
            borderTopColor: '#FFFFFF',
          }} />
        </View>
      </View>
    );
  }

  // Versione iOS con lo stesso sistema di coordinate
  return (
    <View style={{ width: canvasWidth, height: canvasHeight, alignItems: 'center' }}>
      <Canvas style={{ width: canvasWidth, height: canvasHeight }}>
        <Path
          path={`M ${safetyPadding + 12} ${safetyPadding + 25} Q ${safetyPadding + 2} ${safetyPadding + 25} ${safetyPadding + 2} ${safetyPadding + 35} L ${safetyPadding + 2} ${safetyPadding + 55} Q ${safetyPadding + 2} ${safetyPadding + 65} ${safetyPadding + 12} ${safetyPadding + 65} L ${canvasWidth/2 - 8} ${safetyPadding + 65} L ${canvasWidth/2} ${safetyPadding + 75} L ${canvasWidth/2 + 8} ${safetyPadding + 65} L ${width + safetyPadding + 2} ${safetyPadding + 65} Q ${width + safetyPadding + 12} ${safetyPadding + 65} ${width + safetyPadding + 12} ${safetyPadding + 55} L ${width + safetyPadding + 12} ${safetyPadding + 35} Q ${width + safetyPadding + 12} ${safetyPadding + 25} ${width + safetyPadding + 2} ${safetyPadding + 25} Z`}
          color="rgba(0,0,0,0.18)"
        />
        <Path
          path={`M ${safetyPadding + 10} ${safetyPadding + 23} Q ${safetyPadding} ${safetyPadding + 23} ${safetyPadding} ${safetyPadding + 33} L ${safetyPadding} ${safetyPadding + 53} Q ${safetyPadding} ${safetyPadding + 63} ${safetyPadding + 10} ${safetyPadding + 63} L ${canvasWidth/2 - 8} ${safetyPadding + 63} L ${canvasWidth/2} ${safetyPadding + 73} L ${canvasWidth/2 + 8} ${safetyPadding + 63} L ${width + safetyPadding} ${safetyPadding + 63} Q ${width + safetyPadding + 10} ${safetyPadding + 63} ${width + safetyPadding + 10} ${safetyPadding + 53} L ${width + safetyPadding + 10} ${safetyPadding + 33} Q ${width + safetyPadding} ${safetyPadding + 23} ${width + safetyPadding} ${safetyPadding + 23} Z`}
          color="#FFFFFF"
        />
      </Canvas>
      <View style={{ position: 'absolute', top: safetyPadding + 23, width: width, height: height, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: '#000000', fontSize: 13, fontWeight: '700', textAlign: 'center' }}>{text}</Text>
      </View>
    </View>
  );
};
