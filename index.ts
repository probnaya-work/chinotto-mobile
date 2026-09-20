import 'react-native-gesture-handler';

import { registerRootComponent } from 'expo';

import RecordRoot from './RecordRoot';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately.
//
// `RecordRoot` replaces the v1 `App.tsx`, which stays in the tree until the
// desktop/mobile transition is over: it, and the v1 stores it reads, are what a
// revert of this branch goes back to. Nothing imports it any more.
registerRootComponent(RecordRoot);
