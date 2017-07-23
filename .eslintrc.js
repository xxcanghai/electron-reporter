module.exports = {
  root: true,
  parser: 'babel-eslint',
  env: {
    browser: true,
    node: true
  },
  globals: {
    // 'RongIMClient': true,
    // 'RongIMLib': true
  },
  // extends: [
  //   'eslint:recommended',
  //   'plugin:react/recommended'
  // ],
  extends: 'airbnb',
  plugins: [
    'babel',
    'promise'
  ],
  'rules': {
    // 临时关闭
    // 'no-var': 0,
    // 'camelcase': 0,
    // 'global-require': 0,
    // 'quote-props': 'off',
    // 'no-param-reassign': 'off',
    // 'vars-on-top': 'off',
    // 'block-scoped-var': 'off',
    // 'no-shadow': 'off',
    // 'class-methods-use-this': 'off',
    // 'jsx-a11y/no-static-element-interactions': 'off',
    'arrow-body-style': 'off',
    // 'no-use-before-define': 'off',
    'max-len': ["error", 10000],

    // 'prefer-arrow-callback': 0,

    // 'no-underscore-dangle': 0,

    'semi': 0,
    // allow paren-less arrow functions
    // "arrow-parens": "off",
    // "generator-star-spacing": "off",
    // "import/extensions": "off",

    // 暂时开启, 否则alias失效
    // "import/no-extraneous-dependencies": "off",
    // 'import/no-unresolved': 0,

    // "react/forbid-prop-types": "off",
    'space-before-function-paren': 2,
    // 'import/prefer-default-export': 0,
    // 'no-unused-vars': 0,
    // "react/jsx-filename-extension": "off",
    // "object-shorthand": ["error", "always"],
    // "react/no-danger": "off",
    // "react/no-unused-prop-types": "off",
    // 'func-names': 0,
    // 'comma-dangle': 0,
    // 'prefer-const': 0,
    // 'new-cap': 0,
    // 'prefer-template': 0,
    // 'no-prototype-builtins': 0,
    // 'no-multiple-empty-lines': [2, {'max': 4}],
    // 'no-console': 0,
    // 'no-plusplus': 0
  }
}
