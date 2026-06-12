'use strict';

const fs = require('node:fs').promises;
const path = require('path');
const proxyquire = require('proxyquire');
const chai = require('chai');
const sinon = require('sinon');
const Context = require('../../../../src/Context');
const ComponentContext = require('../../../../src/ComponentContext');
const { validateComponentInputs } = require('../../../../src/configuration/validate');
const { configSchema } = require('../../../../components/framework/configuration');
const ServerlessFramework = require('../../../../components/framework');
const { outputFile, remove } = require('../../../lib/fs');

const expect = chai.expect;

const INFO_OUTPUT = 'region: us-east-1\n\nStack Outputs:\n  Key: Output';

const loadFrameworkComponent = (spawnStub) =>
  proxyquire('../../../../components/framework/index.js', {
    '../../src/utils/spawn': spawnStub,
  });

const createOutputStream = (output) => ({
  on: (event, callback) => {
    if (event === 'data' && output) callback(Buffer.from(output));
  },
});

const createClassicSpawnResult = ({ code = 0, stdout, stderr, closeOnNextTick = false } = {}) => {
  const child = {
    on: (event, callback) => {
      if (event !== 'close') return;
      if (closeOnNextTick) process.nextTick(() => callback(code));
      else callback(code);
    },
    kill: sinon.stub(),
  };

  if (stdout !== undefined) child.stdout = createOutputStream(stdout);
  if (stderr !== undefined) child.stderr = createOutputStream(stderr);

  return child;
};

const createSpawnStub = (...spawnResults) => {
  const spawnStub = sinon.stub();

  if (spawnResults.length === 0) return spawnStub.returns(createClassicSpawnResult());
  if (spawnResults.length === 1) return spawnStub.returns(spawnResults[0]);

  for (const [index, spawnResult] of spawnResults.entries()) {
    spawnStub.onCall(index).returns(spawnResult);
  }

  return spawnStub;
};

const createSpawnExecution = ({ code = 0, stdout = '', stderr = '' } = {}) => {
  const child = createClassicSpawnResult({ code, stdout, stderr, closeOnNextTick: true });
  const execution = Promise.resolve({
    child,
    stdoutBuffer: Buffer.from(stdout),
    stderrBuffer: Buffer.from(stderr),
    stdBuffer: Buffer.from(`${stdout}${stderr}`),
    code,
    signal: null,
  });

  execution.child = child;
  execution.stdout = child.stdout;
  execution.stderr = child.stderr;
  execution.std = null;

  return execution;
};

const expectSpawnCall = (spawnStub, index, expectedArgs, expectedOptions = {}) => {
  const [command, args, options] = spawnStub.getCall(index).args;

  expect(command).to.equal('serverless');
  expect(args).to.deep.equal(expectedArgs);
  expect(options).to.include(expectedOptions);

  return options;
};

/**
 * @returns {Promise<ComponentContext>}
 */
const getContext = async () => {
  const contextConfig = {
    root: process.cwd(),
    stage: 'dev',
    disableIO: true,
    configuration: {},
  };
  const context = new Context(contextConfig);
  await context.init();
  const componentContext = new ComponentContext('id', context);
  await componentContext.init();
  return componentContext;
};

describe('test/unit/components/framework/index.test.js', () => {
  it('correctly handles deploy', async () => {
    const spawnStub = createSpawnStub(createClassicSpawnResult({ stdout: INFO_OUTPUT }));
    const FrameworkComponent = loadFrameworkComponent(spawnStub);

    const context = await getContext();
    const component = new FrameworkComponent('some-id', context, { path: 'path' });
    context.state.detectedFrameworkVersion = '9.9.9';
    await component.deploy();

    expect(spawnStub).to.be.calledTwice;
    expectSpawnCall(spawnStub, 0, ['deploy', '--stage', 'dev'], { cwd: 'path' });
    expectSpawnCall(spawnStub, 1, ['info', '--verbose', '--stage', 'dev'], { cwd: 'path' });
    expect(context.state).to.deep.equal({ detectedFrameworkVersion: '9.9.9' });
    expect(context.outputs).to.deep.equal({ Key: 'Output' });
  });

  it('redacts sensitive parameter values in verbose command logging', async () => {
    const spawnStub = createSpawnStub(createClassicSpawnResult({ stdout: INFO_OUTPUT }));
    const FrameworkComponent = loadFrameworkComponent(spawnStub);

    const context = await getContext();
    const logVerbose = sinon.spy(context, 'logVerbose');
    const component = new FrameworkComponent('some-id', context, {
      path: 'path',
      params: { 'api-token': 'secret-value-123' },
    });
    context.state.detectedFrameworkVersion = '9.9.9';
    await component.deploy();

    expectSpawnCall(spawnStub, 0, [
      'deploy',
      '--stage',
      'dev',
      '--param',
      'api-token=secret-value-123',
    ]);
    const loggedCommands = logVerbose.args.map(([message]) => message);
    expect(loggedCommands.some((message) => message.includes('api-token=<redacted>'))).to.equal(
      true
    );
    expect(loggedCommands.some((message) => message.includes('secret-value-123'))).to.equal(false);
  });

  it('supports the shared spawn helper promise shape when executing osls commands', async () => {
    const spawnStub = createSpawnStub(
      createSpawnExecution({
        stdout: INFO_OUTPUT,
      }),
      createSpawnExecution({
        stdout: INFO_OUTPUT,
      })
    );
    const FrameworkComponent = loadFrameworkComponent(spawnStub);

    const context = await getContext();
    const component = new FrameworkComponent('some-id', context, { path: 'path' });
    context.state.detectedFrameworkVersion = '9.9.9';
    await component.deploy();

    expect(spawnStub).to.be.calledTwice;
    expect(context.outputs).to.deep.equal({ Key: 'Output' });
  });

  it('correctly handles package', async () => {
    const spawnStub = createSpawnStub(createClassicSpawnResult({ stdout: INFO_OUTPUT }));
    const FrameworkComponent = loadFrameworkComponent(spawnStub);

    const context = await getContext();
    const component = new FrameworkComponent('some-id', context, { path: 'path' });
    context.state.detectedFrameworkVersion = '9.9.9';
    await component.package();

    expect(spawnStub).to.be.calledOnce;
    expectSpawnCall(spawnStub, 0, ['package', '--stage', 'dev'], { cwd: 'path' });
    expect(context.state).to.deep.equal({ detectedFrameworkVersion: '9.9.9' });
    expect(context.outputs).to.deep.equal({ Key: 'Output' });
  });

  it('correctly handles refresh-outputs', async () => {
    const spawnStub = createSpawnStub(createClassicSpawnResult({ stdout: INFO_OUTPUT }));
    const FrameworkComponent = loadFrameworkComponent(spawnStub);

    const context = await getContext();
    const component = new FrameworkComponent('some-id', context, { path: 'path' });
    context.state.detectedFrameworkVersion = '9.9.9';
    await component.refreshOutputs();

    expect(spawnStub).to.be.calledOnce;
    expectSpawnCall(spawnStub, 0, ['info', '--verbose', '--stage', 'dev'], { cwd: 'path' });
    expect(context.state).to.deep.equal({ detectedFrameworkVersion: '9.9.9' });
    expect(context.outputs).to.deep.equal({ Key: 'Output' });
  });

  it('correctly recognizes region in inputs', async () => {
    const spawnStub = createSpawnStub(createClassicSpawnResult({ stdout: INFO_OUTPUT }));
    const FrameworkComponent = loadFrameworkComponent(spawnStub);

    const context = await getContext();
    const component = new FrameworkComponent('some-id', context, {
      path: 'path',
      region: 'eu-central-1',
    });
    context.state.detectedFrameworkVersion = '9.9.9';
    await component.refreshOutputs();

    expect(spawnStub).to.be.calledOnce;
    expectSpawnCall(
      spawnStub,
      0,
      ['info', '--verbose', '--stage', 'dev', '--region', 'eu-central-1'],
      { cwd: 'path' }
    );
    expect(context.state).to.deep.equal({ detectedFrameworkVersion: '9.9.9' });
    expect(context.outputs).to.deep.equal({ Key: 'Output' });
  });

  it('correctly recognizes config in inputs', async () => {
    const spawnStub = createSpawnStub(createClassicSpawnResult({ stdout: INFO_OUTPUT }));
    const FrameworkComponent = loadFrameworkComponent(spawnStub);

    const context = await getContext();
    const component = new FrameworkComponent('some-id', context, {
      path: 'path',
      config: 'different.yml',
    });
    context.state.detectedFrameworkVersion = '9.9.9';
    await component.refreshOutputs();

    expect(spawnStub).to.be.calledOnce;
    expectSpawnCall(
      spawnStub,
      0,
      ['info', '--verbose', '--stage', 'dev', '--config', 'different.yml'],
      { cwd: 'path' }
    );
    expect(context.state).to.deep.equal({ detectedFrameworkVersion: '9.9.9' });
    expect(context.outputs).to.deep.equal({ Key: 'Output' });
  });

  it('correctly set compose-specific specific env vars', async () => {
    const spawnStub = createSpawnStub(createClassicSpawnResult({ stdout: INFO_OUTPUT }));
    const FrameworkComponent = loadFrameworkComponent(spawnStub);

    const context = await getContext();
    const component = new FrameworkComponent('some-id', context, { path: 'path' });
    context.state.detectedFrameworkVersion = '9.9.9';
    await component.refreshOutputs();

    expect(spawnStub).to.be.calledOnce;
    expect(spawnStub.getCall(0).args[2].env.SLS_DISABLE_AUTO_UPDATE).to.equal('1');
    expect(spawnStub.getCall(0).args[2].env.SLS_COMPOSE).to.equal('1');
  });

  it('passes through serverless logging env vars to child processes', async () => {
    const originalLogLevel = process.env.SLS_LOG_LEVEL;
    const originalLogDebug = process.env.SLS_LOG_DEBUG;

    try {
      process.env.SLS_LOG_LEVEL = 'info';
      process.env.SLS_LOG_DEBUG = 'aws';

      const spawnStub = createSpawnStub(createClassicSpawnResult({ stdout: INFO_OUTPUT }));
      const FrameworkComponent = loadFrameworkComponent(spawnStub);

      const context = await getContext();
      const component = new FrameworkComponent('some-id', context, { path: 'path' });
      context.state.detectedFrameworkVersion = '9.9.9';
      await component.refreshOutputs();

      expect(spawnStub).to.be.calledOnce;
      expect(spawnStub.getCall(0).args[2].env.SLS_LOG_LEVEL).to.equal('info');
      expect(spawnStub.getCall(0).args[2].env.SLS_LOG_DEBUG).to.equal('aws');
    } finally {
      if (originalLogLevel == null) delete process.env.SLS_LOG_LEVEL;
      else process.env.SLS_LOG_LEVEL = originalLogLevel;
      if (originalLogDebug == null) delete process.env.SLS_LOG_DEBUG;
      else process.env.SLS_LOG_DEBUG = originalLogDebug;
    }
  });

  it('correctly handles refresh-outputs with malformed info outputs', async () => {
    // Simulate the output we get with Serverless Domain Manager
    // https://github.com/serverless/compose/issues/105
    const infoOutput =
      'region: us-east-1\n\n' +
      'Stack Outputs:\n' +
      '  Key: Output\n' +
      'Serverless Domain Manager:\n' +
      '  Domain Name: example.com\n' +
      '  ------------------------';
    const spawnStub = createSpawnStub(createClassicSpawnResult({ stdout: infoOutput }));
    const FrameworkComponent = loadFrameworkComponent(spawnStub);

    const context = await getContext();
    const component = new FrameworkComponent('some-id', context, { path: 'path' });
    context.state.detectedFrameworkVersion = '9.9.9';
    await component.refreshOutputs();

    expect(spawnStub).to.be.calledOnce;
    expectSpawnCall(spawnStub, 0, ['info', '--verbose', '--stage', 'dev'], { cwd: 'path' });
    expect(context.state).to.deep.equal({ detectedFrameworkVersion: '9.9.9' });
    expect(context.outputs).to.deep.equal({ Key: 'Output' });
  });

  it('correctly handles remove', async () => {
    const spawnStub = createSpawnStub();

    const FrameworkComponent = loadFrameworkComponent(spawnStub);

    const context = await getContext();
    const component = new FrameworkComponent('some-id', context, { path: 'path' });
    context.state = {
      key: 'val',
      detectedFrameworkVersion: '9.9.9',
    };
    context.outputs = {
      outputkey: 'outputval',
    };

    await component.remove();

    expect(spawnStub).to.be.calledOnce;
    expectSpawnCall(spawnStub, 0, ['remove', '--stage', 'dev'], { cwd: 'path' });
    expect(context.state).to.deep.equal({});
    expect(context.outputs).to.deep.equal({});
  });

  it('correctly handles command', async () => {
    const spawnStub = createSpawnStub();

    const FrameworkComponent = loadFrameworkComponent(spawnStub);

    const context = await getContext();
    const component = new FrameworkComponent('some-id', context, { path: 'custom-path' });
    context.state.detectedFrameworkVersion = '9.9.9';

    await component.command('print', { key: 'val', flag: true, o: 'shortoption' });

    expect(spawnStub).to.be.calledOnce;
    expectSpawnCall(
      spawnStub,
      0,
      ['print', '--key=val', '--flag', '-o', 'shortoption', '--stage', 'dev'],
      { cwd: 'custom-path' }
    );
  });

  it('passes documented nested osls commands through to the osls CLI', async () => {
    const cases = [
      {
        command: 'deploy:function',
        options: { function: 'handler' },
        expectedArgs: ['deploy', 'function', '--function=handler', '--stage', 'dev'],
      },
      {
        command: 'deploy:list',
        options: { 'region': 'us-east-1', 'aws-profile': 'dev-profile' },
        expectedArgs: [
          'deploy',
          'list',
          '--region=us-east-1',
          '--aws-profile=dev-profile',
          '--stage',
          'dev',
        ],
      },
      {
        command: 'deploy:list:functions',
        options: {},
        expectedArgs: ['deploy', 'list', 'functions', '--stage', 'dev'],
      },
      {
        command: 'rollback:function',
        options: { 'function': 'handler', 'function-version': '23' },
        expectedArgs: [
          'rollback',
          'function',
          '--function=handler',
          '--function-version=23',
          '--stage',
          'dev',
        ],
      },
      {
        command: 'invoke',
        options: { function: 'handler', data: '{"ok":true}', raw: true },
        expectedArgs: [
          'invoke',
          '--function=handler',
          '--data={"ok":true}',
          '--raw',
          '--stage',
          'dev',
        ],
      },
      {
        command: 'invoke:local',
        options: { function: 'handler', path: 'event.json' },
        expectedArgs: [
          'invoke',
          'local',
          '--function=handler',
          '--path=event.json',
          '--stage',
          'dev',
        ],
      },
    ];

    for (const testCase of cases) {
      const spawnStub = createSpawnStub();
      const FrameworkComponent = loadFrameworkComponent(spawnStub);

      const context = await getContext();
      const component = new FrameworkComponent('some-id', context, { path: 'path' });
      context.state.detectedFrameworkVersion = '9.9.9';

      await component.command(testCase.command, testCase.options);

      expect(spawnStub).to.be.calledOnce;
      expectSpawnCall(spawnStub, 0, testCase.expectedArgs, { cwd: 'path', stdio: 'inherit' });
    }
  });

  it('preserves repeated passthrough options', async () => {
    const spawnStub = createSpawnStub();

    const FrameworkComponent = loadFrameworkComponent(spawnStub);

    const context = await getContext();
    const component = new FrameworkComponent('some-id', context, { path: 'path' });
    context.state.detectedFrameworkVersion = '9.9.9';

    await component.command('invoke:local', {
      function: 'handler',
      env: ['VAR1=value1', 'VAR2=value2'],
      e: ['SHORT1=value1', 'SHORT2=value2'],
    });

    expect(spawnStub).to.be.calledOnce;
    expectSpawnCall(
      spawnStub,
      0,
      [
        'invoke',
        'local',
        '--function=handler',
        '--env=VAR1=value1',
        '--env=VAR2=value2',
        '-e',
        'SHORT1=value1',
        '-e',
        'SHORT2=value2',
        '--stage',
        'dev',
      ],
      { cwd: 'path', stdio: 'inherit' }
    );
  });

  it('shows command-specific progress for selected passthrough commands', async () => {
    const cases = [
      {
        command: 'deploy:function',
        options: { function: 'handler' },
        start: 'deploying function "handler"',
        success: 'deployed function "handler"',
      },
      {
        command: 'deploy:list',
        options: {},
        start: 'listing deployments',
        success: 'listed deployments',
      },
      {
        command: 'deploy:list:functions',
        options: {},
        start: 'listing function deployments',
        success: 'listed function deployments',
      },
      {
        command: 'rollback:function',
        options: { 'function': 'handler', 'function-version': '23' },
        start: 'rolling back function "handler"',
        success: 'rolled back function "handler"',
      },
      {
        command: 'invoke',
        options: { function: 'handler' },
        start: 'invoking function "handler"',
        success: 'invoked function "handler"',
      },
      {
        command: 'invoke',
        options: { f: 'handler' },
        start: 'invoking function "handler"',
        success: 'invoked function "handler"',
      },
      {
        command: 'invoke:local',
        options: { function: 'handler' },
        start: 'invoking function locally "handler"',
        success: 'invoked function locally "handler"',
      },
    ];

    for (const testCase of cases) {
      const spawnStub = createSpawnStub();
      const FrameworkComponent = loadFrameworkComponent(spawnStub);

      const context = await getContext();
      sinon.spy(context, 'startProgress');
      sinon.spy(context, 'successProgress');

      const component = new FrameworkComponent('some-id', context, { path: 'path' });
      context.state.detectedFrameworkVersion = '9.9.9';

      await component.command(testCase.command, testCase.options);

      expect(context.startProgress).to.have.been.calledOnceWithExactly(testCase.start);
      expect(context.successProgress).to.have.been.calledOnceWithExactly(testCase.success);
      expect(spawnStub.getCall(0).args[2].stdio).to.equal('inherit');
    }
  });

  it('does not show special progress for unknown passthrough commands', async () => {
    const spawnStub = createSpawnStub();

    const FrameworkComponent = loadFrameworkComponent(spawnStub);

    const context = await getContext();
    sinon.spy(context, 'startProgress');
    sinon.spy(context, 'successProgress');

    const component = new FrameworkComponent('some-id', context, { path: 'path' });
    context.state.detectedFrameworkVersion = '9.9.9';

    await component.command('print', {});

    expect(context.startProgress.called).to.equal(false);
    expect(context.successProgress.called).to.equal(false);
    expectSpawnCall(spawnStub, 0, ['print', '--stage', 'dev'], { stdio: 'inherit' });
  });

  it('correctly ignores `stage` from options to not duplicate it when executing command', async () => {
    const spawnStub = createSpawnStub();

    const FrameworkComponent = loadFrameworkComponent(spawnStub);

    const context = await getContext();
    const component = new FrameworkComponent('some-id', context, { path: 'custom-path' });
    context.state.detectedFrameworkVersion = '9.9.9';

    await component.command('print', { key: 'val', flag: true, stage: 'dev' });

    expect(spawnStub).to.be.calledOnce;
    expectSpawnCall(spawnStub, 0, ['print', '--key=val', '--flag', '--stage', 'dev'], {
      cwd: 'custom-path',
      stdio: 'inherit',
    });
  });

  it('reports detected unsupported framework version', async () => {
    const spawnExtStub = sinon.stub().resolves({
      stdoutBuffer: Buffer.from('Framework Core: 2.1.0'),
    });

    const FrameworkComponent = loadFrameworkComponent(spawnExtStub);

    const context = await getContext();
    const component = new FrameworkComponent('some-id', context, { path: 'foo' });
    await expect(component.deploy()).to.eventually.be.rejectedWith(
      'The installed version of osls (2.1.0) is not supported by osls compose. Please upgrade osls to a version greater than or equal to "3.7.7"'
    );
  });

  it('correctly handles logs for component with functions', async () => {
    const functionsOutput =
      'functions:\n  hello:\n    handler: handler.hello\n  other:\n    handler: handler.other';
    const spawnStub = createSpawnStub(createClassicSpawnResult({ stdout: functionsOutput }));
    const FrameworkComponent = loadFrameworkComponent(spawnStub);

    const context = await getContext();
    const component = new FrameworkComponent('some-id', context, { path: 'path' });
    context.state.detectedFrameworkVersion = '9.9.9';
    await component.logs({});

    expect(spawnStub).to.be.calledThrice;
    expectSpawnCall(spawnStub, 0, ['print', '--stage', 'dev'], { cwd: 'path' });
    expectSpawnCall(spawnStub, 1, ['logs', '--function', 'hello', '--stage', 'dev'], {
      cwd: 'path',
    });
    expectSpawnCall(spawnStub, 2, ['logs', '--function', 'other', '--stage', 'dev'], {
      cwd: 'path',
    });
  });

  it('correctly handles logs for component without functions', async () => {
    const spawnStub = createSpawnStub(
      createClassicSpawnResult({ stdout: 'provider:\n  name: aws' })
    );
    const FrameworkComponent = loadFrameworkComponent(spawnStub);

    const context = await getContext();
    const component = new FrameworkComponent('some-id', context, { path: 'path' });
    context.state.detectedFrameworkVersion = '9.9.9';
    await component.logs({});

    expect(spawnStub).to.be.calledOnce;
    expectSpawnCall(spawnStub, 0, ['print', '--stage', 'dev'], { cwd: 'path' });
  });

  it('correctly handles tail option for logs', async () => {
    const functionsOutput = 'functions:\n  hello:\n    handler: handler.hello';
    const spawnStub = createSpawnStub(createClassicSpawnResult({ stdout: functionsOutput }));
    const FrameworkComponent = loadFrameworkComponent(spawnStub);

    const context = await getContext();
    const component = new FrameworkComponent('some-id', context, { path: 'path' });
    context.state.detectedFrameworkVersion = '9.9.9';
    await component.logs({ tail: true });

    expect(spawnStub).to.be.calledTwice;
    expectSpawnCall(spawnStub, 0, ['print', '--stage', 'dev'], { cwd: 'path' });
    expectSpawnCall(spawnStub, 1, ['logs', '--function', 'hello', '--tail', '--stage', 'dev'], {
      cwd: 'path',
    });
  });

  it('rejects invalid inputs', () => {
    expect(() =>
      validateComponentInputs('id', configSchema, {
        region: 123,
        params: 'foo',
      })
    )
      .to.throw()
      .and.have.property(
        'message',
        'Invalid configuration for component "id":\n' +
          "- must have required property 'path'\n" +
          '- "region": must be string\n' +
          '- "params": must be object'
      );
  });

  it('rejects path that is the root compose path', async () => {
    const context = await getContext();
    expect(() => new ServerlessFramework('id', context, { path: '.' }))
      .to.throw()
      .and.have.property('code', 'INVALID_PATH_IN_SERVICE_CONFIGURATION');
  });

  it('skips deploy when cache inputs and cache hash are unchanged', async () => {
    const serviceDir = await fs.mkdtemp(path.join(process.cwd(), 'cache-hash-skip-'));

    try {
      await outputFile(path.join(serviceDir, 'handler.js'), 'module.exports = 1;\n');

      const spawnStub = sinon.stub();
      const FrameworkComponent = loadFrameworkComponent(spawnStub);

      const context = await getContext();
      const inputs = {
        path: serviceDir,
        cachePatterns: ['handler.js'],
      };
      const component = new FrameworkComponent('id', context, inputs);

      context.state.inputs = inputs;
      context.state.cacheHash = await component.calculateCacheHash();

      await component.deploy();

      expect(spawnStub).to.not.have.been.called;
    } finally {
      await remove(serviceDir);
    }
  });

  it('updates cache hash after deploying changed cache pattern files', async () => {
    const serviceDir = await fs.mkdtemp(path.join(process.cwd(), 'cache-hash-update-'));

    try {
      const filePath = path.join(serviceDir, 'handler.js');
      await outputFile(filePath, 'module.exports = 1;\n');

      const spawnStub = createSpawnStub(
        createSpawnExecution({ stderr: 'deployed' }),
        createSpawnExecution({
          stdout: INFO_OUTPUT,
        })
      );

      const FrameworkComponent = loadFrameworkComponent(spawnStub);

      const context = await getContext();
      const inputs = {
        path: serviceDir,
        cachePatterns: ['handler.js'],
      };
      const component = new FrameworkComponent('id', context, inputs);

      context.state.detectedFrameworkVersion = '9.9.9';
      context.state.inputs = inputs;
      context.state.cacheHash = await component.calculateCacheHash();

      await outputFile(filePath, 'module.exports = 2;\n');

      await component.deploy();

      expect(spawnStub).to.be.calledTwice;
      expect(context.state.cacheHash).to.equal(await component.calculateCacheHash());
    } finally {
      await remove(serviceDir);
    }
  });

  it('expands literal directory cache patterns when calculating hashes', async () => {
    const serviceDir = await fs.mkdtemp(path.join(process.cwd(), 'cache-hash-dir-'));

    try {
      await outputFile(path.join(serviceDir, 'src', 'handler.js'), 'module.exports = 1;\n');

      const context = await getContext();
      const directoryPatternComponent = new ServerlessFramework('id', context, {
        path: serviceDir,
        cachePatterns: ['src'],
      });
      const globPatternComponent = new ServerlessFramework('id', context, {
        path: serviceDir,
        cachePatterns: ['src/**/*'],
      });

      expect(await directoryPatternComponent.calculateCacheHash()).to.equal(
        await globPatternComponent.calculateCacheHash()
      );
    } finally {
      await remove(serviceDir);
    }
  });

  it('supports negated cache patterns that re-include a later file', async () => {
    const serviceDir = await fs.mkdtemp(path.join(process.cwd(), 'cache-hash-negation-'));

    try {
      await Promise.all([
        outputFile(path.join(serviceDir, 'keep.js'), 'keep\n'),
        outputFile(path.join(serviceDir, 'ignored', 'drop.js'), 'drop\n'),
        outputFile(path.join(serviceDir, 'ignored', 'reinclude.js'), 'reinclude\n'),
      ]);

      const context = await getContext();
      const negatedPatternComponent = new ServerlessFramework('id', context, {
        path: serviceDir,
        cachePatterns: ['**/*', '!ignored/**/*', 'ignored/reinclude.js'],
      });
      const explicitPatternComponent = new ServerlessFramework('id', context, {
        path: serviceDir,
        cachePatterns: ['keep.js', 'ignored/reinclude.js'],
      });

      expect(await negatedPatternComponent.calculateCacheHash()).to.equal(
        await explicitPatternComponent.calculateCacheHash()
      );
    } finally {
      await remove(serviceDir);
    }
  });
});
