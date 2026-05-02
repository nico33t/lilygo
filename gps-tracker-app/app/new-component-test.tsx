import React from 'react';
import { View, StyleSheet, StatusBar } from 'react-native';
import { Stack } from 'expo-router';

import { Aurora } from '../components/Aurora';
import { CircleSelector } from '../components/CircleSelector';

export default function NewComponentTest() {
  return (
    <View style={styles.container}>
      <Stack.Screen 
        options={{ 
          headerShown: false 
        }} 
      />
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      
      <Aurora active={true} />
      <CircleSelector />
      
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000', // Pagina nera
    alignItems: 'center',
    justifyContent: 'center',
  },
});
