// app/index.tsx — entry route at "/"
// Holds the initial path while the root layout's auth effect resolves and
// redirects to onboarding, auth, or tabs. Prevents the "Unmatched Route" screen.
import { View, ActivityIndicator, StyleSheet } from 'react-native';

export default function Index() {
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#12B76A" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F0F7F3',
  },
});
