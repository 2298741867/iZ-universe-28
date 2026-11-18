import firebaseRulesPlugin from '@firebase/eslint-plugin-security-rules';

export default [
  {
    ignores: [
      'dist/**/*',
      'node_modules/**/*',
      'src/**/*',
      'public/**/*',
      '*.ts',
      '*.js',
      '*.html'
    ]
  },
  firebaseRulesPlugin.configs['flat/recommended']
];
