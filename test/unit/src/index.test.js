'use strict';

const chai = require('chai');
const proxyquire = require('proxyquire');
const sinon = require('sinon');

const expect = chai.expect;

describe('test/unit/src/index.test.js', () => {
  afterEach(() => {
    sinon.restore();
  });

  const loadRunComponents = (componentsServiceInstances, validateOptions = sinon.stub()) => {
    class FakeContext {
      constructor(config) {
        this.root = config.root;
        this.stage = config.stage;
        this.output = {
          log: sinon.stub(),
        };
        this.componentCommandsOutcomes = {};
      }

      async init() {
        return undefined;
      }

      shutdown() {
        return undefined;
      }
    }

    const ComponentsService = sinon.stub();
    componentsServiceInstances.forEach((instance, index) => {
      ComponentsService.onCall(index).returns(instance);
    });

    delete require.cache[require.resolve('../../../src/index.js')];
    const { runComponents } = proxyquire('../../../src', {
      './render-help': sinon.stub().resolves(),
      './Context': FakeContext,
      './ComponentsService': ComponentsService,
      './handle-error': sinon.stub(),
      './configuration/resolve-variables': sinon.stub().resolves(),
      './configuration/resolve-path': sinon.stub().resolves('serverless-compose.yml'),
      './configuration/read': sinon.stub().resolves({
        services: {
          api: {
            path: 'api',
          },
        },
      }),
      './configuration/validate': {
        validateConfiguration: sinon.stub(),
      },
      './validate-options': validateOptions,
      './utils/serverless-utils/log-reporters/node': sinon.stub(),
    });

    return { runComponents, validateOptions };
  };

  it('preserves nested shortcut service commands', async () => {
    const componentsServiceInstance = {
      init: sinon.stub().resolves(),
      invokeComponentCommand: sinon.stub().resolves(),
      invokeGlobalCommand: sinon.stub().resolves(),
      allComponents: {},
    };
    const { runComponents, validateOptions } = loadRunComponents([componentsServiceInstance]);
    const processExit = sinon.stub(process, 'exit');
    sinon.stub(process, 'getMaxListeners').returns(10);
    sinon.stub(process, 'setMaxListeners');

    await runComponents(['api:deploy:function', '--function', 'handler']);

    expect(validateOptions).to.have.been.calledOnceWithExactly(
      sinon.match({ function: 'handler' }),
      'deploy:function'
    );
    expect(componentsServiceInstance.invokeComponentCommand).to.have.been.calledOnceWithExactly(
      'api',
      'deploy:function',
      sinon.match({ function: 'handler' })
    );
    expect(componentsServiceInstance.invokeGlobalCommand.called).to.equal(false);
    expect(processExit).to.have.been.calledOnceWithExactly(0);
  });

  it('preserves nested commands when using --service', async () => {
    const componentsServiceInstance = {
      init: sinon.stub().resolves(),
      invokeComponentCommand: sinon.stub().resolves(),
      invokeGlobalCommand: sinon.stub().resolves(),
      allComponents: {},
    };
    const { runComponents, validateOptions } = loadRunComponents([componentsServiceInstance]);
    const processExit = sinon.stub(process, 'exit');
    sinon.stub(process, 'getMaxListeners').returns(10);
    sinon.stub(process, 'setMaxListeners');

    await runComponents(['invoke', 'local', '--service', 'api', '--function', 'handler']);

    expect(validateOptions).to.have.been.calledOnceWithExactly(
      sinon.match({ function: 'handler' }),
      'invoke:local'
    );
    expect(componentsServiceInstance.invokeComponentCommand).to.have.been.calledOnceWithExactly(
      'api',
      'invoke:local',
      sinon.match({ function: 'handler' })
    );
    expect(componentsServiceInstance.invokeGlobalCommand.called).to.equal(false);
    expect(processExit).to.have.been.calledOnceWithExactly(0);
  });
});
