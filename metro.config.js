const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

const WEB_ALIASES = {
  "react-native-maps": "@teovilla/react-native-web-maps",
};

const defaultResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === "web" && WEB_ALIASES[moduleName]) {
    return context.resolveRequest(context, WEB_ALIASES[moduleName], platform);
  }
  if (defaultResolveRequest) {
    return defaultResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
