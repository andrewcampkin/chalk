module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    plugins: [
      // Drizzle's migrations.js does `import m0000 from './0000_x.sql'`.
      // Without this the import resolves to a path string, not the SQL text,
      // and every migration silently applies as a no-op.
      ["inline-import", { extensions: [".sql"] }],
    ],
  };
};
