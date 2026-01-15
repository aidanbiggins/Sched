const nextJest = require('next/jest');

const createJestConfig = nextJest({
  dir: './',
});

const customJestConfig = {
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testEnvironment: 'jest-environment-jsdom',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  testPathIgnorePatterns: ['<rootDir>/.next/', '<rootDir>/node_modules/'],
};

// createJestConfig returns an async function that takes no arguments
// We need to override transformIgnorePatterns after the config is created
module.exports = async () => {
  const jestConfig = await createJestConfig(customJestConfig)();
  return {
    ...jestConfig,
    transformIgnorePatterns: [
      '/node_modules/(?!(uuid)/)',
      '^.+\\.module\\.(css|sass|scss)$',
    ],
  };
};
