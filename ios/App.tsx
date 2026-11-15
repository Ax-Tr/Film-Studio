import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import { SafeAreaView, StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { ProjectDashboard } from './src/screens/ProjectDashboard';
import { MobileDiagnostics } from './src/screens/MobileDiagnostics';

export default function App() {
  const [currentView, setCurrentView] = useState<'projects' | 'diagnostics'>('projects');

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.navBar}>
        <TouchableOpacity
          style={[styles.navItem, currentView === 'projects' && styles.activeNavItem]}
          onPress={() => setCurrentView('projects')}
          accessibilityRole="tab"
          accessibilityState={{ selected: currentView === 'projects' }}
        >
          <Text style={[styles.navText, currentView === 'projects' && styles.activeNavText]}>
            Projects
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.navItem, currentView === 'diagnostics' && styles.activeNavItem]}
          onPress={() => setCurrentView('diagnostics')}
          accessibilityRole="tab"
          accessibilityState={{ selected: currentView === 'diagnostics' }}
        >
          <Text style={[styles.navText, currentView === 'diagnostics' && styles.activeNavText]}>
            Diagnostics
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        {currentView === 'projects' ? (
          <ProjectDashboard />
        ) : (
          <MobileDiagnostics
            device={{
              deviceId: 'dev_pixel8_hardware_keystore',
              deviceName: 'Pixel 8 Pro (Android 15)',
              platform: 'android',
              registeredAt: new Date().toISOString(),
            }}
            storageEngine="expo-sqlite (WAL mode)"
            outboxCount={0}
            activeFilmCount={1}
            appVersion="v1.0.0-rc.1 (Gate G3 Android Release Candidate)"
          />
        )}
      </View>

      <StatusBar style="light" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#0b0e14' },
  navBar: {
    flexDirection: 'row',
    backgroundColor: '#12161f',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1e2430',
    gap: 12,
  },
  navItem: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  activeNavItem: {
    backgroundColor: '#1e2430',
  },
  navText: {
    color: '#8a94a6',
    fontSize: 13,
    fontWeight: '600',
  },
  activeNavText: {
    color: '#f3b74f',
    fontWeight: '700',
  },
  content: {
    flex: 1,
  },
});
