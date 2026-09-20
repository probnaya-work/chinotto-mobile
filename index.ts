import 'react-native-gesture-handler';

import { registerRootComponent } from 'expo';
import * as SplashScreen from 'expo-splash-screen';

import RecordRoot from './RecordRoot';

// The native splash stays up until the launch lockup is actually on screen.
//
// Left to itself it hides on the first JS frame, which is the record with no fonts and no
// lockup yet: a blank dark screen between the splash's mark and the animation of the same
// mark. `ChinottoApp` takes it down once there is something to hand over to.
//
// Called here rather than in a component so it runs before anything renders. A rejection
// means the splash was already gone, which is the old behaviour and not worth crashing for.
void SplashScreen.preventAutoHideAsync().catch(() => {});

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately.
//
// `RecordRoot` replaces the v1 `App.tsx`, which stays in the tree until the
// desktop/mobile transition is over: it, and the v1 stores it reads, are what a
// revert of this branch goes back to. Nothing imports it any more.
registerRootComponent(RecordRoot);
