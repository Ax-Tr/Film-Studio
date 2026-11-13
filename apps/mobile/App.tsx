import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, StyleSheet, Text, View } from 'react-native';

export default function App() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.eyebrow}>Sprint 3 delivery foundation</Text>
        <Text accessibilityRole="header" style={styles.title}>
          Film Studio
        </Text>
        <Text style={styles.body}>
          Native product workflows begin after the mobile feasibility gates are
          accepted.
        </Text>
      </View>
      <StatusBar style="light" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#0b0e14' },
  container: { flex: 1, justifyContent: 'center', padding: 28, gap: 14 },
  eyebrow: {
    color: '#f3b74f',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  title: { color: '#f5f7fb', fontSize: 48, fontWeight: '700' },
  body: { color: '#c6cedb', fontSize: 18, lineHeight: 28 },
});
