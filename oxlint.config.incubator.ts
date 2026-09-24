import {defineConfig} from 'oxlint';

import {oxlintIgnorePatterns} from './oxlint.config.ts';

export const incubatorRules = {'eslint/no-void': 'error'} as const;

export default defineConfig({
  categories: {correctness: 'off'},
  ignorePatterns: oxlintIgnorePatterns,
  rules: incubatorRules,
  options: {typeAware: false, reportUnusedDisableDirectives: 'off'},
});
