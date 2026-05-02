import React, { Component, ErrorInfo, ReactNode } from 'react';
import { StyleSheet, View, Text, Pressable, SafeAreaView, StatusBar, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C, R } from '../constants/design';

interface Props {
  children: ReactNode;
  forceShow?: boolean; // Debug flag
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: this.props.forceShow || false,
    error: this.props.forceShow ? new Error('DEBUG: Errore simulato per test design') : null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <SafeAreaView style={styles.container}>
          <StatusBar barStyle="dark-content" />
          <View style={styles.content}>
            <View style={styles.iconCircle}>
              <Ionicons name="warning-outline" size={60} color={C.red} />
            </View>
            
            <Text style={styles.title}>Sistema in Errore</Text>
            <Text style={styles.subtitle}>
              Si è verificato un problema tecnico imprevisto. Abbiamo isolato l'errore per proteggere i tuoi dati.
            </Text>

            {this.state.error && (
              <View style={styles.errorCard}>
                <Text style={styles.errorText} numberOfLines={3}>
                  {this.state.error.message}
                </Text>
              </View>
            )}
            
            <Pressable 
              style={styles.secondaryButton} 
              onPress={() => {
                alert('Segnalazione inviata. Grazie!');
              }}
            >
              <Text style={styles.secondaryButtonText}>Segnala Problema</Text>
            </Pressable>
          </View>

          <View style={styles.bottomContainer}>
            <Pressable style={styles.button} onPress={this.handleReset}>
              <Text style={styles.buttonText}>Riavvia Applicazione</Text>
              <Ionicons name="refresh-outline" size={20} color="#fff" style={{ marginLeft: 8 }} />
            </Pressable>
          </View>
        </SafeAreaView>
      );
    }

    return this.props.children;
  }
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
    padding: 32,
  },
  iconCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255, 59, 48, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
  },
  title: {
    fontSize: 30,
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
    marginBottom: 40,
    lineHeight: 25,
  },
  errorCard: {
    backgroundColor: '#F2F2F7',
    padding: 20,
    borderRadius: 20,
    width: '100%',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  errorText: {
    color: '#FF3B30',
    fontSize: 14,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    lineHeight: 20,
  },
  bottomContainer: {
    paddingHorizontal: 20,
    paddingBottom: 10,
    width: '100%',
  },
  button: {
    backgroundColor: C.accent,
    height: 64,
    borderRadius: 50,
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    justifyContent: 'center',
    shadowColor: C.accent,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  secondaryButton: {
    paddingVertical: 12,
  },
  secondaryButtonText: {
    color: '#8E8E93',
    fontSize: 16,
    fontWeight: '600',
  },
});
