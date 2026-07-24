// app/index.tsx — entry route at "/"
//
// Holds the initial path while the root layout's auth effect resolves and
// redirects to onboarding, auth, or tabs. Prevents the "Unmatched Route" screen.
//
// Renders the same aurora hold as the root layout rather than its own spinner.
// It used to be a mint ActivityIndicator on the pale page colour, which put a
// LIGHT frame between the native splash and the dark screen the user was on
// their way to — a white flash in the middle of an otherwise dark launch.
import BootSplash from '../components/ui/BootSplash';

export default function Index() {
  return <BootSplash />;
}
