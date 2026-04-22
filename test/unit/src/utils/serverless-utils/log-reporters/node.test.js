'use strict';

const chai = require('chai');
const proxyquire = require('proxyquire');
const sinon = require('sinon');

chai.use(require('sinon-chai'));

const expect = chai.expect;

describe('test/unit/src/utils/serverless-utils/log-reporters/node.test.js', () => {
  let originalArgv;
  let originalInteractiveSetup;
  let originalCi;
  let originalLogLevel;
  let originalLogDebug;

  beforeEach(() => {
    originalArgv = process.argv.slice();
    originalInteractiveSetup = process.env.SLS_INTERACTIVE_SETUP_ENABLE;
    originalCi = process.env.CI;
    originalLogLevel = process.env.SLS_LOG_LEVEL;
    originalLogDebug = process.env.SLS_LOG_DEBUG;
  });

  afterEach(() => {
    process.argv = originalArgv;
    if (originalInteractiveSetup == null) delete process.env.SLS_INTERACTIVE_SETUP_ENABLE;
    else process.env.SLS_INTERACTIVE_SETUP_ENABLE = originalInteractiveSetup;
    if (originalCi == null) delete process.env.CI;
    else process.env.CI = originalCi;
    if (originalLogLevel == null) delete process.env.SLS_LOG_LEVEL;
    else process.env.SLS_LOG_LEVEL = originalLogLevel;
    if (originalLogDebug == null) delete process.env.SLS_LOG_DEBUG;
    else process.env.SLS_LOG_DEBUG = originalLogDebug;
    sinon.restore();
  });

  const loadModule = (uniGlobalState = {}, overrides = {}) => {
    const logReporter = overrides.logReporter || sinon.stub();
    const progressReporter = overrides.progressReporter || sinon.stub();
    const outputEmitter = overrides.outputEmitter || { on: sinon.stub() };
    const joinTextTokens = overrides.joinTextTokens || sinon.stub().returns('joined');

    proxyquire
      .noCallThru()
      .load('../../../../../../src/utils/serverless-utils/log-reporters/node', {
        'uni-global': () => uniGlobalState,
        '../lib/log-reporters/node/log-reporter': logReporter,
        '../lib/log/get-output-reporter': { emitter: outputEmitter },
        '../lib/log/join-text-tokens': joinTextTokens,
        'log/levels': ['debug', 'info', 'notice'],
        '../lib/log-reporters/node/style': {},
        '../lib/log-reporters/node/progress-reporter': progressReporter,
      });

    return { logReporter, progressReporter, outputEmitter, joinTextTokens };
  };

  it('sets SLS_LOG_LEVEL=info when verbose mode is enabled', () => {
    const uniGlobalState = {};
    delete process.env.SLS_LOG_LEVEL;
    process.argv = ['node', 'compose', '--verbose'];

    const { logReporter, outputEmitter } = loadModule(uniGlobalState);

    expect(process.env.SLS_LOG_LEVEL).to.equal('info');
    expect(logReporter).to.have.been.calledOnceWithExactly({
      logLevelIndex: 1,
      debugNamespaces: undefined,
    });
    expect(uniGlobalState.logLevelIndex).to.equal(1);
    expect(outputEmitter.on).to.have.been.calledOnce;
  });

  it('does not override debug logging with verbose mode', () => {
    const uniGlobalState = {};
    process.env.SLS_LOG_LEVEL = 'debug';
    process.argv = ['node', 'compose', '--verbose'];

    const { logReporter } = loadModule(uniGlobalState);

    expect(process.env.SLS_LOG_LEVEL).to.equal('debug');
    expect(logReporter).to.have.been.calledOnceWithExactly({
      logLevelIndex: 0,
      debugNamespaces: undefined,
    });
  });

  it('is idempotent when reporter setup already happened', () => {
    const uniGlobalState = { logLevelIndex: 1 };
    process.argv = ['node', 'compose', '--verbose'];

    const { logReporter, progressReporter, outputEmitter } = loadModule(uniGlobalState);

    expect(logReporter.called).to.equal(false);
    expect(progressReporter.called).to.equal(false);
    expect(outputEmitter.on.called).to.equal(false);
  });

  it('maps debug namespaces from argv into SLS_LOG_DEBUG', () => {
    const uniGlobalState = {};
    delete process.env.SLS_LOG_DEBUG;
    process.argv = ['node', 'compose', '--debug=aws'];

    const { logReporter } = loadModule(uniGlobalState);

    expect(process.env.SLS_LOG_DEBUG).to.equal('aws');
    expect(logReporter).to.have.been.calledOnceWithExactly({
      logLevelIndex: 2,
      debugNamespaces: 'aws',
    });
  });

  it('registers the progress reporter when interactive setup is enabled', () => {
    const uniGlobalState = {};
    process.env.SLS_INTERACTIVE_SETUP_ENABLE = '1';

    const { progressReporter } = loadModule(uniGlobalState);

    expect(progressReporter).to.have.been.calledOnceWithExactly({ logLevelIndex: 2 });
    expect(uniGlobalState.logIsInteractive).to.equal('1');
  });

  it('writes text-mode output events through joinTextTokens', () => {
    const handlers = new Map();
    const outputEmitter = {
      on: sinon.stub().callsFake((eventName, handler) => {
        handlers.set(eventName, handler);
      }),
    };
    const joinTextTokens = sinon.stub().returns('joined\n');
    const stdoutWrite = sinon.stub(process.stdout, 'write');

    loadModule({}, { outputEmitter, joinTextTokens });
    handlers.get('write')({ mode: 'text', textTokens: ['first', 'second'] });

    expect(joinTextTokens).to.have.been.calledOnceWithExactly(['first', 'second']);
    expect(stdoutWrite).to.have.been.calledOnceWithExactly('joined\n');
  });
});
