module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // Reanimated 4 moved worklet compilation into react-native-worklets;
      // 'react-native-reanimated/plugin' is now only a re-export of this one.
      // Referencing the real package avoids depending on that shim surviving.
      //
      // MUST STAY LAST. The plugin rewrites function bodies carrying the
      // 'worklet' directive so they can run on the UI thread, and it has to see
      // the output of every other transform to do it. Anything appended after
      // this breaks animations at runtime rather than at build time — which is
      // the worst way for it to fail.
      'react-native-worklets/plugin',
    ],
  };
};
