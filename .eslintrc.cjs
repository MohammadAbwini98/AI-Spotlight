module.exports = {
  extends: [
    '@electron-toolkit/eslint-config-ts',
    '@electron-toolkit/eslint-config-prettier'
  ],
  rules: {
    '@typescript-eslint/no-explicit-any': 'error',
    'no-console': ['warn', { allow: ['warn', 'error'] }]
  }
}
