'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const originalCwd = process.cwd();
const originalEnv = Object.assign(Object.create(null), process.env);
const originalArgv = process.argv.slice();
const originalComposeCommandStartTime = EvalError.$composeCommandStartTime;

const restoreEnv = (targetEnv, sourceEnv) => {
  for (const key of Object.keys(targetEnv)) {
    if (!(key in sourceEnv)) delete targetEnv[key];
  }

  for (const [key, value] of Object.entries(sourceEnv)) {
    targetEnv[key] = value;
  }
};

class RuntimeSandbox {
  constructor() {
    this.sandboxPath = null;
    this.sandboxEnv = null;
  }

  enterSuite() {
    this.sandboxPath = fs.mkdtempSync(path.join(os.tmpdir(), 'compose-test-'));
    this.sandboxEnv = Object.assign(Object.create(null), process.env, {
      HOME: this.sandboxPath,
      USERPROFILE: this.sandboxPath,
    });

    this.restoreTestState();
  }

  restoreTestState() {
    restoreEnv(process.env, this.sandboxEnv);
    process.argv = originalArgv.slice();
    if (originalComposeCommandStartTime === undefined) delete EvalError.$composeCommandStartTime;
    else EvalError.$composeCommandStartTime = originalComposeCommandStartTime;
    process.chdir(this.sandboxPath);
  }

  exitSuite() {
    restoreEnv(process.env, originalEnv);
    process.argv = originalArgv.slice();
    if (originalComposeCommandStartTime === undefined) delete EvalError.$composeCommandStartTime;
    else EvalError.$composeCommandStartTime = originalComposeCommandStartTime;
    process.chdir(originalCwd);
    if (this.sandboxPath) {
      fs.rmSync(this.sandboxPath, { recursive: true, force: true });
      this.sandboxPath = null;
      this.sandboxEnv = null;
    }
  }
}

module.exports = new RuntimeSandbox();
