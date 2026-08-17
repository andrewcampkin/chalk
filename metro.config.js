// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// Drizzle ships migrations as .sql and imports them through migrations.js.
// Without this Metro refuses to resolve them and the app dies on first launch.
config.resolver.sourceExts.push("sql");

// infra/ is the AWS stack, deployed by a GitHub workflow and no part of the
// app. Metro crawls from the project root, so without this it walks the CDK
// dependency tree on every bundle.
config.resolver.blockList = [/[\/\\]infra[\/\\].*/];

module.exports = config;
