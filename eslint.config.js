const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const prettierRecommended = require('eslint-plugin-prettier/recommended');

module.exports = defineConfig([
  expoConfig,
  prettierRecommended,
  {
    ignores: [
      'dist/*',
      '.expo/*',
      'android/*',
      'ios/*',
      'src/data/migrations/*',
      'playwright-report/*',
    ],
  },
  {
    // src/core is pure TypeScript: no UI, no platform, no storage. This keeps
    // the study engines deterministic and testable without a device.
    files: ['src/core/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'react', message: 'src/core must stay pure TypeScript.' },
            { name: 'react-native', message: 'src/core must stay pure TypeScript.' },
            { name: 'drizzle-orm', message: 'src/core must not touch storage.' },
          ],
          patterns: [
            {
              group: ['expo', 'expo-*', 'expo/*', '@expo/*'],
              message: 'src/core must stay pure TypeScript.',
            },
            {
              group: ['react-native-*', 'react-dom', 'react/*'],
              message: 'src/core must stay pure TypeScript.',
            },
            { group: ['drizzle-orm/*'], message: 'src/core must not touch storage.' },
            {
              group: ['@/data/*', '@/features/*', '@/ui/*', '@/app/*'],
              message: 'src/core must not depend on other layers.',
            },
          ],
        },
      ],
    },
  },
]);
