'use strict';

const chai = require('chai');
const proxyquire = require('proxyquire');
const sinon = require('sinon');

chai.use(require('sinon-chai'));

const expect = chai.expect;

describe('test/unit/bin/serverless-compose.test.js', () => {
  let originalComposeCommandStartTime;

  beforeEach(() => {
    originalComposeCommandStartTime = EvalError.$composeCommandStartTime;
  });

  afterEach(() => {
    if (originalComposeCommandStartTime === undefined) {
      delete EvalError.$composeCommandStartTime;
    } else {
      EvalError.$composeCommandStartTime = originalComposeCommandStartTime;
    }
    sinon.restore();
  });

  const loadBin = (stubs) => {
    delete require.cache[require.resolve('../../../bin/serverless-compose')];
    proxyquire.noCallThru().load('../../../bin/serverless-compose', stubs);
  };

  it('exits before loading the runtime on unsupported Node versions', () => {
    const isSupportedNodeVersion = sinon.stub().returns(false);
    const runComponents = sinon.stub();
    const stderrWrite = sinon.stub(process.stderr, 'write');
    const processExitError = new Error('process.exit');
    const processExit = sinon.stub(process, 'exit').callsFake(() => {
      throw processExitError;
    });

    expect(() => {
      loadBin({
        '../src/cli/is-supported-node-version': isSupportedNodeVersion,
        '../package.json': { version: '1.3.0' },
        '../src': { runComponents },
      });
    }).to.throw(processExitError);

    expect(isSupportedNodeVersion).to.have.been.calledOnceWithExactly(process.version);
    expect(stderrWrite).to.have.been.calledOnceWithExactly(
      'Error: Serverless Framework Compose v1.3.0 does not support ' +
        `Node.js ${process.version}. Please upgrade Node.js to the latest ` +
        'LTS release. Minimum supported version: v20.0.0.\n'
    );
    expect(processExit).to.have.been.calledOnceWithExactly(1);
    expect(runComponents.called).to.equal(false);
  });

  it('loads the runtime on supported Node versions', () => {
    const isSupportedNodeVersion = sinon.stub().returns(true);
    const runComponents = sinon.stub().resolves();
    const stderrWrite = sinon.stub(process.stderr, 'write');
    const processExit = sinon.stub(process, 'exit');

    loadBin({
      '../src/cli/is-supported-node-version': isSupportedNodeVersion,
      '../src': { runComponents },
    });

    expect(isSupportedNodeVersion).to.have.been.calledOnceWithExactly(process.version);
    expect(runComponents).to.have.been.calledOnceWithExactly();
    expect(stderrWrite.called).to.equal(false);
    expect(processExit.called).to.equal(false);
  });

  it('rethrows async runtime failures on nextTick', () => {
    const runtimeError = new Error('boom');
    const nextTick = sinon.stub(process, 'nextTick').callsFake((handler) => handler());

    expect(() => {
      loadBin({
        '../src/cli/is-supported-node-version': sinon.stub().returns(true),
        '../src': {
          runComponents: sinon.stub().returns({
            catch: (handler) => handler(runtimeError),
          }),
        },
      });
    }).to.throw(runtimeError);

    expect(nextTick).to.have.been.calledOnce;
  });
});
