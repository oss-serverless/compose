'use strict';

const path = require('path');
const stripAnsi = require('strip-ansi');
const expect = require('chai').expect;

const Context = require('../../../src/Context');
const readStream = require('../read-stream');
const { loadComponent } = require('../../../src/load');

describe('test/unit/src/load.test.js', () => {
  it('supports in-process components using ComponentContext logging APIs', async () => {
    const context = new Context({
      root: process.cwd(),
      stage: 'dev',
      disableIO: true,
      configuration: {},
    });
    await context.init();
    context.output.enableVerbose();

    const component = await loadComponent({
      context,
      path: path.resolve(__dirname, '../../fixtures/local-component.js'),
      alias: 'worker',
      inputs: { message: 'hello' },
    });

    await component.emitLogs();

    expect(stripAnsi(await readStream(context.output.stdout))).to.equal('worker › hello\n');
    expect(stripAnsi(await readStream(context.output.stderr))).to.equal('worker › verbose hello\n');
  });
});
