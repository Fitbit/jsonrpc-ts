module.exports = {
  transform: {
    '^.+\\.(ts|tsx)$': '<rootDir>/node_modules/ts-jest/preprocessor.js',
  },
  moduleFileExtensions: [
    'ts',
    'tsx',
    'js',
  ],
  testRegex: '(/__tests__/.*|\\.(test|spec))\\.(ts|tsx|js)$',
  testPathIgnorePatterns: [
    '<rootDir>/node_modules',
    '<rootDir>/dist',
  ],
  testEnvironment: 'node',
  mapCoverage: true,
};
