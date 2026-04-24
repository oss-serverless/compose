'use strict';

const os = require('os');
const path = require('path');
const fsp = require('fs').promises;
const fse = require('fs-extra');
const expect = require('chai').expect;

const LocalStateStorage = require('../../../../src/state/LocalStateStorage');

describe('test/unit/src/state/LocalStateStorage.test.js', () => {
  let rootDir;

  beforeEach(async () => {
    rootDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'compose-local-state-'));
    await fse.ensureDir(path.join(rootDir, '.serverless'));
  });

  afterEach(async () => {
    if (rootDir) {
      await fse.remove(rootDir);
    }
  });

  it('normalizes reserved top-level component ids while preserving nested payload unsafe keys', async () => {
    const statePath = path.join(rootDir, '.serverless', 'state.dev.json');
    await fsp.writeFile(
      statePath,
      JSON.stringify({
        components: {
          __proto__: {
            outputs: { hidden: true },
          },
          constructor: {
            outputs: { hidden: true },
          },
          prototype: {
            outputs: { hidden: true },
          },
          service: {
            outputs: JSON.parse('{"__proto__":{"value":"ok"}}'),
          },
        },
      })
    );

    const storage = new LocalStateStorage(rootDir, 'dev');
    const state = await storage.readState();

    expect(Object.getPrototypeOf(state.components)).to.equal(null);
    expect(Object.keys(state.components)).to.deep.equal(['service']);
    expect(
      Object.getOwnPropertyDescriptor(state.components.service.outputs, '__proto__').value
    ).to.deep.equal({ value: 'ok' });
  });
});
