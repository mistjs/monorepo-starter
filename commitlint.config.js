module.exports = {
  extends: [
    '@commitlint/config-conventional',
  ],
  rules: {
    'type-enum': [2, 'always', ['feat', 'fix', 'style', 'ci', 'refactor', 'perf', 'test', 'build', 'chore', 'revert', 'release']],
    'subject-max-length': [1, 'always', 150],
  },
}
