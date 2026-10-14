/**
 * Mirrors apps/api/jest.config.js so the monorepo has one test idiom rather
 * than two frameworks to learn.
 *
 * Deliberately `node`, not `jsdom`: everything under lib/ is plain TypeScript
 * (the API client, error mapping, hooks' pure helpers) and needs no DOM. Adding
 * jsdom and a React renderer is a bigger change that belongs with the first
 * component test that actually needs it.
 *
 * @type {import('jest').Config}
 */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts', 'tsx'],
  rootDir: '.',
  testRegex: '.*\\.spec\\.tsx?$',
  transform: { '^.+\\.tsx?$': ['ts-jest', { tsconfig: 'tsconfig.json' }] },
  testEnvironment: 'node',
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/$1' },
};
