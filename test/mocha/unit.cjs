'use strict';

module.exports = {
  'spec': ['test/**/*.test.js'],
  'require': ['./test/mocha/bootstrap.cjs', './test/mocha/root-hooks.cjs'],
  'timeout': 10000,
  'parallel': false,
  'node-option': ['unhandled-rejections=strict'],
};
