'use strict';

const chai = require('chai');
const path = require('path');
const proxyquire = require('proxyquire');
const sinon = require('sinon');
const ComponentsService = require('../../../src/ComponentsService');
const Context = require('../../../src/Context');
const stripAnsi = require('strip-ansi');
const readStream = require('../read-stream');

chai.use(require('chai-as-promised'));

const expect = chai.expect;

const frameworkComponentPath = path.dirname(
  require.resolve('../../../components/framework/index.js')
);

describe('test/unit/src/components-service.test.js', () => {
  let componentsService;
  before(async () => {
    const configuration = {
      name: 'test-service',
      services: {
        resources: {
          path: 'resources',
        },
        consumer: {
          path: 'consumer',
          params: {
            workerQueueArn: '${resources.WorkerQueueArn}',
          },
        },
        anotherservice: {
          component: '@foo/bar',
          path: 'another',
          dependsOn: 'consumer',
        },
      },
    };
    const contextConfig = {
      root: process.cwd(),
      stage: 'dev',
      disableIO: true,
      configuration: {},
    };
    const context = new Context(contextConfig);
    await context.init();
    componentsService = new ComponentsService(context, configuration, {});
    await componentsService.init();
  });

  it('has properly resolved components', () => {
    expect(componentsService.allComponents).to.deep.equal({
      anotherservice: {
        dependencies: ['consumer'],
        inputs: {
          component: '@foo/bar',
          dependsOn: 'consumer',
          path: 'another',
        },
        path: '@foo/bar',
      },
      consumer: {
        dependencies: ['resources'],
        inputs: {
          component: 'serverless-framework',
          params: {
            workerQueueArn: '${resources.WorkerQueueArn}',
          },
          path: 'consumer',
        },
        path: frameworkComponentPath,
      },
      resources: {
        dependencies: [],
        inputs: {
          component: 'serverless-framework',
          path: 'resources',
        },
        path: frameworkComponentPath,
      },
    });
  });

  it('has properly resolved components graph', () => {
    expect(componentsService.componentsGraph.nodeCount()).to.equal(3);
    expect(componentsService.componentsGraph.edgeCount()).to.equal(2);
    expect(componentsService.componentsGraph.sinks()).to.deep.equal(['resources']);
    expect(componentsService.componentsGraph.sources()).to.deep.equal(['anotherservice']);
  });

  it('throws an error when configuration has components with the same type and path', async () => {
    const configuration = {
      name: 'test-service',
      services: {
        resources: {
          path: 'resources',
        },
        duplicated: {
          path: 'resources',
          params: {
            workerQueueArn: '${resources.WorkerQueueArn}',
          },
        },
        anotherservice: {
          path: 'another',
          dependsOn: 'consumer',
        },
      },
    };
    const contextConfig = {
      root: process.cwd(),
      stage: 'dev',
      disableIO: true,
      configuration: {},
    };
    const context = new Context(contextConfig);
    await context.init();
    componentsService = new ComponentsService(context, configuration, {});

    await expect(componentsService.init()).to.eventually.be.rejectedWith(
      'Service "resources" has the same "path" as the following services: "duplicated". This is currently not supported because deploying the same service in parallel generates packages in the same ".serverless/" directory which can cause conflicts.'
    );
  });

  it('rejects circular component dependencies', async () => {
    const configuration = {
      name: 'cycle-test',
      services: {
        resources: {
          component: '@foo/resources',
          path: 'resources',
          dependsOn: 'consumer',
        },
        consumer: {
          component: '@foo/consumer',
          path: 'consumer',
          dependsOn: 'resources',
        },
      },
    };
    const context = new Context({
      root: process.cwd(),
      stage: 'dev',
      disableIO: true,
      configuration: {},
    });
    await context.init();

    const localComponentsService = new ComponentsService(context, configuration, {});

    await expect(localComponentsService.init())
      .to.eventually.be.rejected
      .and.have.property('code', 'CIRCULAR_GRAPH_DEPENDENCIES');
  });

  it('deploys dependencies before dependents', async () => {
    const order = [];
    const loadComponent = sinon.stub().callsFake(async ({ alias }) => ({
      async deploy() {
        order.push(alias);
      },
    }));
    const ComponentsServiceWithStubbedLoad = proxyquire('../../../src/ComponentsService', {
      './load': { loadComponent },
    });

    const context = new Context({
      root: process.cwd(),
      stage: 'dev',
      disableIO: true,
      configuration: {},
    });
    await context.init();
    context.stateStorage.readComponentsOutputs = async () => ({});

    const configuration = {
      services: {
        foundation: {
          component: '@foo/foundation',
          path: 'foundation',
        },
        api: {
          component: '@foo/api',
          path: 'api',
          dependsOn: 'foundation',
        },
        app: {
          component: '@foo/app',
          path: 'app',
          dependsOn: 'api',
        },
      },
    };

    const localComponentsService = new ComponentsServiceWithStubbedLoad(context, configuration, {});
    await localComponentsService.init();
    await localComponentsService.deploy();

    expect(order).to.deep.equal(['foundation', 'api', 'app']);
  });

  it('removes dependents before dependencies', async () => {
    const order = [];
    const loadComponent = sinon.stub().callsFake(async ({ alias }) => ({
      async remove() {
        order.push(alias);
      },
    }));
    const ComponentsServiceWithStubbedLoad = proxyquire('../../../src/ComponentsService', {
      './load': { loadComponent },
    });

    const context = new Context({
      root: process.cwd(),
      stage: 'dev',
      disableIO: true,
      configuration: {},
    });
    await context.init();
    context.stateStorage.readComponentsOutputs = async () => ({});
    context.stateStorage.removeState = async () => {};

    const configuration = {
      services: {
        foundation: {
          component: '@foo/foundation',
          path: 'foundation',
        },
        api: {
          component: '@foo/api',
          path: 'api',
          dependsOn: 'foundation',
        },
        app: {
          component: '@foo/app',
          path: 'app',
          dependsOn: 'api',
        },
      },
    };

    const localComponentsService = new ComponentsServiceWithStubbedLoad(context, configuration, {});
    await localComponentsService.init();
    await localComponentsService.remove();

    expect(order).to.deep.equal(['app', 'api', 'foundation']);
  });

  it('deploys branched DAGs in dependency order', async () => {
    const order = [];
    const loadComponent = sinon.stub().callsFake(async ({ alias }) => ({
      async deploy() {
        order.push(alias);
      },
    }));
    const ComponentsServiceWithStubbedLoad = proxyquire('../../../src/ComponentsService', {
      './load': { loadComponent },
    });

    const context = new Context({
      root: process.cwd(),
      stage: 'dev',
      disableIO: true,
      configuration: {},
    });
    await context.init();
    context.stateStorage.readComponentsOutputs = async () => ({});

    const configuration = {
      services: {
        foundation: {
          component: '@foo/foundation',
          path: 'foundation',
        },
        api: {
          component: '@foo/api',
          path: 'api',
          dependsOn: 'foundation',
        },
        worker: {
          component: '@foo/worker',
          path: 'worker',
          dependsOn: 'foundation',
        },
        app: {
          component: '@foo/app',
          path: 'app',
          dependsOn: ['api', 'worker'],
        },
      },
    };

    const localComponentsService = new ComponentsServiceWithStubbedLoad(context, configuration, {});
    await localComponentsService.init();
    await localComponentsService.deploy();

    const foundationIndex = order.indexOf('foundation');
    const apiIndex = order.indexOf('api');
    const workerIndex = order.indexOf('worker');
    const appIndex = order.indexOf('app');

    expect(foundationIndex).to.be.lessThan(apiIndex);
    expect(foundationIndex).to.be.lessThan(workerIndex);
    expect(apiIndex).to.be.lessThan(appIndex);
    expect(workerIndex).to.be.lessThan(appIndex);
  });

  it('skips downstream graph layers after a failure', async () => {
    const order = [];
    const loadComponent = sinon.stub().callsFake(async ({ alias, context }) => ({
      async deploy() {
        context.progresses.start(alias, 'deploying');
        order.push(alias);
        if (alias === 'api') {
          throw new Error('boom');
        }
        context.progresses.success(alias, 'deployed');
      },
    }));
    const ComponentsServiceWithStubbedLoad = proxyquire('../../../src/ComponentsService', {
      './load': { loadComponent },
    });

    const context = new Context({
      root: process.cwd(),
      stage: 'dev',
      disableIO: true,
      configuration: {},
    });
    await context.init();
    context.stateStorage.readComponentsOutputs = async () => ({});

    const configuration = {
      services: {
        foundation: {
          component: '@foo/foundation',
          path: 'foundation',
        },
        api: {
          component: '@foo/api',
          path: 'api',
          dependsOn: 'foundation',
        },
        app: {
          component: '@foo/app',
          path: 'app',
          dependsOn: 'api',
        },
      },
    };

    const localComponentsService = new ComponentsServiceWithStubbedLoad(context, configuration, {});
    await localComponentsService.init();
    await localComponentsService.deploy();

    expect(order).to.deep.equal(['foundation', 'api']);
    expect(context.componentCommandsOutcomes.foundation).to.equal('success');
    expect(context.componentCommandsOutcomes.api).to.equal('failure');
    expect(context.componentCommandsOutcomes.app).to.equal('skip');
  });

  it('correctly handles outputs command', async () => {
    const configuration = {
      name: 'test-service',
      services: {
        resources: {
          path: 'resources',
        },
        anotherservice: {
          path: 'another',
          dependsOn: 'consumer',
        },
      },
    };
    const contextConfig = {
      root: process.cwd(),
      stage: 'dev',
      disableIO: true,
      configuration: {},
    };
    const mockedStateStorage = {
      readServiceState: () => ({ id: 123, detectedFrameworkVersion: '9.9.9' }),
      readComponentsOutputs: () => {
        return {
          resources: {
            somethingelse: '123',
          },
          anotherservice: {
            endpoint: 'https://example.com',
            additional: '123',
          },
        };
      },
    };
    const context = new Context(contextConfig);
    await context.init();
    context.stateStorage = mockedStateStorage;
    componentsService = new ComponentsService(context, configuration, {});

    await componentsService.outputs();
    expect(stripAnsi(await readStream(context.output.stdout))).to.equal(
      [
        'resources: ',
        '  somethingelse: 123',
        'anotherservice: ',
        '  endpoint: https://example.com',
        '  additional: 123',
        '',
      ].join('\n')
    );
  });

  it('correctly handles outputs command for single component', async () => {
    const configuration = {
      name: 'test-service',
      services: {
        resources: {
          path: 'resources',
        },
        anotherservice: {
          path: 'another',
          dependsOn: 'consumer',
        },
      },
    };
    const contextConfig = {
      root: process.cwd(),
      stage: 'dev',
      disableIO: true,
      configuration: {},
    };
    const mockedStateStorage = {
      readServiceState: () => ({ id: 123, detectedFrameworkVersion: '9.9.9' }),
      readComponentOutputs: () => {
        return {
          somethingelse: '123',
        };
      },
    };
    const context = new Context(contextConfig);
    await context.init();
    context.stateStorage = mockedStateStorage;
    componentsService = new ComponentsService(context, configuration, {});

    await componentsService.outputs({ componentName: 'resources' });
    expect(stripAnsi(await readStream(context.output.stdout))).to.equal(
      ['somethingelse: 123', ''].join('\n')
    );
  });
});
