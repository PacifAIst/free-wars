import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'dist-single/**', 'node_modules/**', 'old/**', 'coverage/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts'],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['scripts/**/*.mjs', '*.config.{js,ts}', 'tests/**/*.ts'],
    languageOptions: { globals: globals.node },
  },
  {
    // PLAN section 10: sim code stays free of Pixi. Only render and UI files
    // (src/render, HUD.ts, LevelSelect.ts, main.ts) may import it.
    files: ['src/game/**/*.ts', 'src/parsers/**/*.ts', 'src/types/**/*.ts'],
    ignores: ['src/game/HUD.ts', 'src/game/LevelSelect.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { paths: [{ name: 'pixi.js', message: 'Sim code must not import Pixi (PLAN section 10).' }] },
      ],
    },
  },
);
