// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// Drizzle ships migrations as .sql and imports them through migrations.js.
// Without this Metro refuses to resolve them and the app dies on first launch.
config.resolver.sourceExts.push("sql");

module.exports = config;
