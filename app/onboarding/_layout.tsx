// app/onboarding/_layout.tsx
import { Stack } from 'expo-router';

export default function OnboardingLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="welcome" />
      <Stack.Screen name="home-info" />
      <Stack.Screen name="income" />
      <Stack.Screen name="heloc-info" />
      <Stack.Screen name="credit-score" />
    </Stack>
  );
}
