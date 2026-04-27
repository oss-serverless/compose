'use strict';

const expect = require('chai').expect;
const proxyquire = require('proxyquire');
const sinon = require('sinon');

const Progresses = require('../../../../src/cli/Progresses');

describe('test/unit/src/cli/Progresses.test.js', () => {
  const loadProgresses = (isUnicodeSupported) =>
    proxyquire.noCallThru().load('../../../../src/cli/Progresses', {
      './is-unicode-supported': () => isUnicodeSupported,
    });

  const createProgresses = (columns = 5, rows = 3) => {
    const progresses = Object.create(Progresses.prototype);
    progresses.output = {
      interactiveStderr: { columns, rows },
    };
    return progresses;
  };

  it('applies ellipsis based on visible width', () => {
    const progresses = createProgresses(5);

    expect(progresses.ellipsis('\u001B[31mabcdef\u001B[0m')).to.equal('abcd…');
  });

  it('wraps long lines based on visible width', () => {
    const progresses = createProgresses(5);

    expect(progresses.wrapLine('\u001B[31mabcdef\u001B[0m')).to.equal('abcd\nef');
  });

  it('limits output to terminal height', () => {
    const progresses = createProgresses(80, 3);

    expect(progresses.limitOutputToTerminalHeight('one\ntwo\nthree\nfour')).to.equal(
      'two\nthree\nfour'
    );
  });

  it('tracks progresses in a null-prototype registry', () => {
    const progresses = Object.create(Progresses.prototype);
    progresses.output = {
      interactiveStderr: null,
      verbose: sinon.spy(),
    };
    progresses.progresses = Object.create(null);
    progresses.updateSpinnerState = sinon.stub();

    progresses.add('service');
    progresses.start('service', 'deploying');
    progresses.success('service', 'done');

    expect(Object.getPrototypeOf(progresses.progresses)).to.equal(null);
    expect(progresses.exists('service')).to.deep.include({ status: 'success', text: 'done' });
    expect(progresses.exists('constructor')).to.equal(undefined);
  });

  it('uses dots spinner when unicode is supported', () => {
    const LocalProgresses = loadProgresses(true);
    const bindSigintStub = sinon.stub(LocalProgresses.prototype, 'bindSigint');

    try {
      const progresses = new LocalProgresses({});

      expect(progresses.options.spinner.frames).to.deep.equal([
        '⠋',
        '⠙',
        '⠹',
        '⠸',
        '⠼',
        '⠴',
        '⠦',
        '⠧',
        '⠇',
        '⠏',
      ]);
    } finally {
      bindSigintStub.restore();
    }
  });

  it('uses dashes spinner when unicode is not supported', () => {
    const LocalProgresses = loadProgresses(false);
    const bindSigintStub = sinon.stub(LocalProgresses.prototype, 'bindSigint');

    try {
      const progresses = new LocalProgresses({});

      expect(progresses.options.spinner.frames).to.deep.equal(['-', '_']);
    } finally {
      bindSigintStub.restore();
    }
  });
});
