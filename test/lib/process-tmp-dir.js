'use strict';

const { mkdirSync, realpathSync } = require('fs');
const { removeSync } = require('fs-extra');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const rmTmpDirIgnorableErrorCodes = require('./private/rm-tmp-dir-ignorable-error-codes');

const systemTmpDir = realpathSync(os.tmpdir());
const composeTmpDir = path.join(systemTmpDir, 'tmpdirs-compose');
try {
  mkdirSync(composeTmpDir);
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
}

module.exports = (function self() {
  const processTmpDir = path.join(composeTmpDir, crypto.randomBytes(2).toString('hex'));
  try {
    mkdirSync(processTmpDir);
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    return self();
  }
  return processTmpDir;
})();

process.on('exit', () => {
  try {
    removeSync(module.exports);
  } catch (error) {
    if (rmTmpDirIgnorableErrorCodes.has(error.code)) return;
    throw error;
  }
});
