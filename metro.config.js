const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Drizzle migrations are .sql files inlined by babel-plugin-inline-import.
config.resolver.sourceExts.push('sql');

// expo-sqlite on web ships SQLite as WebAssembly.
config.resolver.assetExts.push('wasm');

// No COOP/COEP headers here on purpose: the app only uses expo-sqlite's async
// API, which does not need SharedArrayBuffer. See src/data/db.ts.

module.exports = config;
