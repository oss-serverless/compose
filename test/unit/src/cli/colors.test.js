'use strict';

const expect = require('chai').expect;
const proxyquire = require('proxyquire');

describe('test/unit/src/cli/colors.test.js', () => {
  it('uses stdout colors for the CLI palette', () => {
    const colors = proxyquire.noCallThru().load('../../../../src/cli/colors', {
      '../utils/colors': {
        stdoutColors: {
          reset: (value) => `reset(${value})`,
          gray: (value) => `gray(${value})`,
          brandRed: (value) => `red(${value})`,
          warning: (value) => `warning(${value})`,
          white: (value) => `white(${value})`,
        },
      },
    });

    expect(colors.foreground('x')).to.equal('reset(x)');
    expect(colors.gray('x')).to.equal('gray(x)');
    expect(colors.red('x')).to.equal('red(x)');
    expect(colors.warning('x')).to.equal('warning(x)');
    expect(colors.white('x')).to.equal('white(x)');
  });
});
