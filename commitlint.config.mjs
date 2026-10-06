export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-enum': [
      1,
      'always',
      ['web', 'api', 'shared', 'db', 'infra', 'ci', 'deps', 'docs', 'repo'],
    ],
  },
};
