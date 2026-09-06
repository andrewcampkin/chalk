const fs = require("fs");
const path = require("path");

/**
 * The EAS project id names one Expo account's project, so it lives in an
 * ignored .env file (EAS_PROJECT_ID=...) rather than in app.json.
 *
 * Expo CLI loads .env before evaluating this file; EAS CLI deliberately does
 * not, so the file is read here and the shell environment wins if both are set.
 */
function envFile() {
  const file = path.join(__dirname, ".env");
  if (!fs.existsSync(file)) return {};
  const out = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const i = line.indexOf("=");
    if (i < 1 || line.trimStart().startsWith("#")) continue;
    out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return out;
}

const projectId = process.env.EAS_PROJECT_ID ?? envFile().EAS_PROJECT_ID;

module.exports = ({ config }) => ({
  ...config,
  extra: {
    ...config.extra,
    ...(projectId ? { eas: { projectId } } : {}),
  },
});
