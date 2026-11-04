// Learn more: https://docs.expo.dev/guides/customizing-metro/
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Resolve the Anthropic SDK to its CommonJS build (index.js) instead of its ESM
// build (index.mjs).
//
// Why: the SDK's modules import each other in a cycle. In the ESM build, exports
// are `const` bindings; in development, React Refresh reads every export while
// the cycle is still loading, which throws
//   "Cannot access 'BETA_BROWSER_MEMBER_NAME_VALUES' before initialization"
// and leaves a blank page. The CommonJS build tolerates the cycle. Using one
// build everywhere also stops Metro from bundling both copies.
const SDK = '@anthropic-ai/sdk';
const upstreamResolve = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolve = upstreamResolve ?? context.resolveRequest;
  if (moduleName === SDK || moduleName.startsWith(`${SDK}/`)) {
    return resolve(
      { ...context, unstable_conditionNames: ['require', 'default'] },
      moduleName,
      platform,
    );
  }
  return resolve(context, moduleName, platform);
};

module.exports = config;
