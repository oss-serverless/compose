'use strict';

const sinon = require('sinon');
const runtimeSandbox = require('./runtime-sandbox.cjs');

exports.mochaHooks = {
  beforeAll() {
    runtimeSandbox.enterSuite();
  },

  beforeEach() {
    runtimeSandbox.restoreTestState();
  },

  afterEach() {
    sinon.restore();
    runtimeSandbox.restoreTestState();
  },

  afterAll() {
    runtimeSandbox.exitSuite();
  },
};
