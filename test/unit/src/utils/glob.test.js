'use strict';

const fs = require('node:fs').promises;
const os = require('node:os');
const path = require('node:path');
const fse = require('fs-extra');
const { expect } = require('chai');

const glob = require('../../../../src/utils/glob');

describe('test/unit/src/utils/glob.test.js', () => {
  let tmpDir;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'compose-glob-'));
  });

  afterEach(async () => {
    await fse.remove(tmpDir);
  });

  it('honors leading negation patterns for async and sync calls', async () => {
    await Promise.all([
      fse.outputFile(path.join(tmpDir, 'keep.js'), 'keep\n'),
      fse.outputFile(path.join(tmpDir, 'ignored', 'drop.js'), 'drop\n'),
    ]);

    expect(await glob(['!ignored/**/*', '**/*.js'], { cwd: tmpDir })).to.deep.equal(['keep.js']);
    expect(glob.sync(['!ignored/**/*', '**/*.js'], { cwd: tmpDir })).to.deep.equal(['keep.js']);
  });
});
