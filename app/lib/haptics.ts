// lib/haptics.ts — safe expo-haptics wrappers; silent no-ops in Expo Go
// expo-haptics is a native module — dynamic import guards against missing bridge.

export function hapticLight() {
  import('expo-haptics')
    .then(H => H.impactAsync(H.ImpactFeedbackStyle.Light))
    .catch(() => {});
}

export function hapticMedium() {
  import('expo-haptics')
    .then(H => H.impactAsync(H.ImpactFeedbackStyle.Medium))
    .catch(() => {});
}

export function hapticSelection() {
  import('expo-haptics')
    .then(H => H.selectionAsync())
    .catch(() => {});
}

export function hapticSuccess() {
  import('expo-haptics')
    .then(H => H.notificationAsync(H.NotificationFeedbackType.Success))
    .catch(() => {});
}
