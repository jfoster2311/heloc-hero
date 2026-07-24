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

/**
 * For a rejected action — a failed sign-in, a save that did not persist.
 *
 * Deliberately distinct from Warning: this fires when the user's attempt did
 * not go through, which they should be able to feel before they read anything.
 */
export function hapticError() {
  import('expo-haptics')
    .then(H => H.notificationAsync(H.NotificationFeedbackType.Error))
    .catch(() => {});
}
