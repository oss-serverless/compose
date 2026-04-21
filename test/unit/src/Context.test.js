'use strict';

const expect = require('chai').expect;
const stripAnsi = require('strip-ansi');
const Context = require('../../../src/Context');
const readStream = require('../read-stream');

describe('test/unit/src/Context.test.js', () => {
  const contextConfig = {
    root: process.cwd(),
    stage: 'dev',
    disableIO: true,
    configuration: {},
  };

  it('does not render empty or invalid outputs', async () => {
    const context = new Context(contextConfig);

    context.renderOutputs(null);
    context.renderOutputs({});

    expect(await readStream(context.output.stdout)).to.equal('');
  });

  it('renders nested outputs in the expected CLI format', async () => {
    const context = new Context(contextConfig);

    context.renderOutputs({
      service: {
        url: 'https://example.com',
        enabled: true,
      },
      values: [1, 'text', { nested: false }],
      emptyArr: [],
      emptyObject: {},
      description: 'line1\nline2',
    });

    expect(stripAnsi(await readStream(context.output.stdout))).to.equal(
      [
        '',
        'service: ',
        '  url: https://example.com',
        '  enabled: true',
        'values: ',
        '  - 1',
        '  - text',
        '  - ',
        '    nested: false',
        'emptyArr: (empty array)',
        'emptyObject: ',
        'description: ',
        '  """',
        '    line1',
        '    line2',
        '  """',
        '',
      ].join('\n')
    );
  });

  it('caps nested rendering depth consistently', async () => {
    const context = new Context(contextConfig);

    context.renderOutputs({
      a: {
        b: {
          c: {
            d: {
              e: 1,
            },
          },
        },
      },
    });

    expect(stripAnsi(await readStream(context.output.stdout))).to.equal(
      ['', 'a: ', '  b: ', '    c: ', '      d: (max depth reached)', ''].join('\n')
    );
  });
});
