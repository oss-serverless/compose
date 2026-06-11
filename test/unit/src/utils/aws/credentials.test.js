'use strict';

const chai = require('chai');
const path = require('path');
const proxyquire = require('proxyquire');
const sinon = require('sinon');

const { withClearedEnv } = require('../../../../lib/env');

const { expect } = chai;

describe('test/unit/src/utils/aws/credentials.test.js', () => {
  const homeDir = path.resolve('/home/test');
  const credentialsFilePath = path.join(homeDir, '.aws', 'credentials');
  const configFilePath = path.join(homeDir, '.aws', 'config');
  const envKeys = [
    'AWS_PROFILE',
    'AWS_DEFAULT_PROFILE',
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY',
    'AWS_SESSION_TOKEN',
    'AWS_DEV_PROFILE',
    'AWS_DEV_ACCESS_KEY_ID',
    'AWS_DEV_SECRET_ACCESS_KEY',
    'AWS_DEV_SESSION_TOKEN',
    'AWS_SHARED_CREDENTIALS_FILE',
    'AWS_CONFIG_FILE',
  ];

  const withEnv = (callback) => withClearedEnv(envKeys, callback);

  function createMissingFileError() {
    return Object.assign(new Error('missing'), { code: 'ENOENT' });
  }

  function createUnresolvedProfileError(profile) {
    return Object.assign(
      new Error(
        `Could not resolve credentials using profile: [${profile}] in configuration/credentials file(s).`
      ),
      { name: 'CredentialsProviderError' }
    );
  }

  class FakeNodeHttpHandler {
    constructor(options) {
      this.options = options;
      FakeNodeHttpHandler.instances.push(this);
    }
  }
  FakeNodeHttpHandler.instances = [];

  beforeEach(() => {
    FakeNodeHttpHandler.instances = [];
  });

  function loadCredentials({
    files = {},
    fromIni,
    fromNodeProviderChain,
    readline,
    logWarning,
  } = {}) {
    const readFileSync = sinon.stub().callsFake((filePath) => {
      if (Object.prototype.hasOwnProperty.call(files, filePath)) {
        const result = files[filePath];
        if (result instanceof Error) throw result;
        return result;
      }
      throw createMissingFileError();
    });

    const stubs = {
      '@aws-sdk/credential-providers': {
        fromIni,
        fromNodeProviderChain,
      },
      '@smithy/node-http-handler': { NodeHttpHandler: FakeNodeHttpHandler },
      '../serverless-utils/log': { log: { warning: logWarning || sinon.stub() } },
      'fs': { readFileSync },
      'os': { homedir: () => homeDir },
    };
    if (readline) stubs.readline = readline;

    return proxyquire('../../../../../src/utils/aws/credentials', stubs);
  }

  function createFakeReadline({ answer } = {}) {
    return {
      createInterface: () => {
        const handlers = {};
        return {
          question: (prompt, callback) => {
            if (answer !== undefined) {
              callback(answer);
            } else {
              // Simulate stdin EOF: the question callback never fires, the interface closes
              setImmediate(() => handlers.close && handlers.close());
            }
          },
          close: () => {
            if (handlers.close) handlers.close();
          },
          on: (event, handler) => {
            handlers[event] = handler;
          },
        };
      },
    };
  }

  it('does not mutate AWS_PROFILE when AWS_DEFAULT_PROFILE is set', async () => {
    await withEnv(async () => {
      process.env.AWS_DEFAULT_PROFILE = 'custom-default';
      const profileProvider = sinon.stub().resolves({
        accessKeyId: 'accessKeyId',
        secretAccessKey: 'secretAccessKey',
      });
      const fromIni = sinon.stub().returns(profileProvider);
      const fromNodeProviderChain = sinon.stub();
      const { getCredentialProvider } = loadCredentials({
        files: {
          [credentialsFilePath]: ['[custom-default]', 'aws_access_key_id = accessKeyId'].join('\n'),
        },
        fromIni,
        fromNodeProviderChain,
      });

      getCredentialProvider();

      expect(process.env.AWS_PROFILE).to.equal(undefined);
      expect(fromIni.firstCall.args[0]).to.include({ profile: 'custom-default' });
      expect(fromNodeProviderChain).to.not.have.been.called;
    });
  });

  it('uses explicit state profile before stage profile', async () => {
    await withEnv(async () => {
      process.env.AWS_DEV_PROFILE = 'stage-profile';
      const fromIni = sinon.stub().callsFake(({ profile }) => `${profile}-provider`);
      const fromNodeProviderChain = sinon.stub();
      const { getCredentialProvider } = loadCredentials({ fromIni, fromNodeProviderChain });

      expect(getCredentialProvider({ profile: 'state-profile', stage: 'dev' })).to.equal(
        'state-profile-provider'
      );
      expect(fromIni.firstCall.args[0]).to.include({
        profile: 'state-profile',
        filepath: credentialsFilePath,
        configFilepath: configFilePath,
      });
      expect(fromIni.firstCall.args[0].mfaCodeProvider).to.be.a('function');
    });
  });

  it('uses stage profile before stage environment credentials', async () => {
    await withEnv(async () => {
      process.env.AWS_DEV_PROFILE = 'stage-profile';
      process.env.AWS_DEV_ACCESS_KEY_ID = 'stageAccessKeyId';
      process.env.AWS_DEV_SECRET_ACCESS_KEY = 'stageSecretAccessKey';
      const fromIni = sinon.stub().callsFake(({ profile }) => `${profile}-provider`);
      const fromNodeProviderChain = sinon.stub();
      const { getCredentialProvider } = loadCredentials({ fromIni, fromNodeProviderChain });

      expect(getCredentialProvider({ stage: 'dev' })).to.equal('stage-profile-provider');
    });
  });

  it('uses stage environment credentials before AWS_PROFILE', async () => {
    await withEnv(async () => {
      process.env.AWS_DEV_ACCESS_KEY_ID = 'stageAccessKeyId';
      process.env.AWS_DEV_SECRET_ACCESS_KEY = 'stageSecretAccessKey';
      process.env.AWS_DEV_SESSION_TOKEN = 'stageSessionToken';
      process.env.AWS_PROFILE = 'aws-profile';
      const fromIni = sinon.stub();
      const fromNodeProviderChain = sinon.stub();
      const { getCredentialProvider } = loadCredentials({ fromIni, fromNodeProviderChain });

      await expect(getCredentialProvider({ stage: 'dev' })()).to.eventually.deep.equal({
        accessKeyId: 'stageAccessKeyId',
        secretAccessKey: 'stageSecretAccessKey',
        sessionToken: 'stageSessionToken',
      });
      expect(fromIni).to.not.have.been.called;
    });
  });

  it('uses AWS_PROFILE before standard environment credentials', async () => {
    await withEnv(async () => {
      process.env.AWS_PROFILE = 'aws-profile';
      process.env.AWS_ACCESS_KEY_ID = 'accessKeyId';
      process.env.AWS_SECRET_ACCESS_KEY = 'secretAccessKey';
      const fromIni = sinon.stub().callsFake(({ profile }) => `${profile}-provider`);
      const fromNodeProviderChain = sinon.stub();
      const { getCredentialProvider } = loadCredentials({ fromIni, fromNodeProviderChain });

      expect(getCredentialProvider()).to.equal('aws-profile-provider');
    });
  });

  it('uses standard environment credentials before AWS_DEFAULT_PROFILE', async () => {
    await withEnv(async () => {
      process.env.AWS_ACCESS_KEY_ID = 'accessKeyId';
      process.env.AWS_SECRET_ACCESS_KEY = 'secretAccessKey';
      process.env.AWS_DEFAULT_PROFILE = 'custom-default';
      const fromIni = sinon.stub();
      const fromNodeProviderChain = sinon.stub();
      const { getCredentialProvider } = loadCredentials({ fromIni, fromNodeProviderChain });

      await expect(getCredentialProvider()()).to.eventually.deep.equal({
        accessKeyId: 'accessKeyId',
        secretAccessKey: 'secretAccessKey',
        sessionToken: undefined,
      });
      expect(fromIni).to.not.have.been.called;
    });
  });

  it('falls back from the implicit default profile only when the profile is absent', async () => {
    await withEnv(async () => {
      const fallbackCredentials = {
        accessKeyId: 'fallbackAccessKeyId',
        secretAccessKey: 'fallbackSecretAccessKey',
      };
      const fallbackProvider = sinon.stub().resolves(fallbackCredentials);
      const fromIni = sinon
        .stub()
        .returns(sinon.stub().rejects(createUnresolvedProfileError('default')));
      const fromNodeProviderChain = sinon.stub().returns(fallbackProvider);
      const { getCredentialProvider } = loadCredentials({ fromIni, fromNodeProviderChain });

      await expect(getCredentialProvider()()).to.eventually.deep.equal(fallbackCredentials);
      expect(fromNodeProviderChain).to.have.been.calledOnce;
      expect(fallbackProvider).to.have.been.calledOnce;
    });
  });

  it('forwards provider invocation options when using default fallback', async () => {
    await withEnv(async () => {
      const providerOptions = { callerClientConfig: { region: 'eu-west-1' } };
      const fallbackCredentials = {
        accessKeyId: 'fallbackAccessKeyId',
        secretAccessKey: 'fallbackSecretAccessKey',
      };
      const profileProvider = sinon.stub().rejects(createUnresolvedProfileError('default'));
      const fallbackProvider = sinon.stub().resolves(fallbackCredentials);
      const fromIni = sinon.stub().returns(profileProvider);
      const fromNodeProviderChain = sinon.stub().returns(fallbackProvider);
      const { getCredentialProvider } = loadCredentials({ fromIni, fromNodeProviderChain });

      await expect(getCredentialProvider()(providerOptions)).to.eventually.deep.equal(
        fallbackCredentials
      );
      expect(profileProvider).to.have.been.calledOnceWithExactly(providerOptions);
      expect(fallbackProvider).to.have.been.calledOnceWithExactly(providerOptions);
    });
  });

  it('does not fallback when the implicit default profile exists but is malformed', async () => {
    await withEnv(async () => {
      const fallbackProvider = sinon.stub().resolves({
        accessKeyId: 'fallbackAccessKeyId',
        secretAccessKey: 'fallbackSecretAccessKey',
      });
      const fromIni = sinon
        .stub()
        .returns(sinon.stub().rejects(createUnresolvedProfileError('default')));
      const fromNodeProviderChain = sinon.stub().returns(fallbackProvider);
      const { getCredentialProvider } = loadCredentials({
        files: {
          [credentialsFilePath]: ['[default]', 'aws_access_key_id = accessKeyId'].join('\n'),
        },
        fromIni,
        fromNodeProviderChain,
      });

      await expect(getCredentialProvider()()).to.be.rejectedWith(
        'Could not resolve credentials using profile'
      );
      expect(fromNodeProviderChain).to.not.have.been.called;
      expect(fallbackProvider).to.not.have.been.called;
    });
  });

  it('does not fallback when a malformed default profile is loaded from a tilde credentials path', async () => {
    await withEnv(async () => {
      process.env.AWS_SHARED_CREDENTIALS_FILE = '~/.aws/credentials';
      const fallbackProvider = sinon.stub().resolves({
        accessKeyId: 'fallbackAccessKeyId',
        secretAccessKey: 'fallbackSecretAccessKey',
      });
      const fromIni = sinon
        .stub()
        .returns(sinon.stub().rejects(createUnresolvedProfileError('default')));
      const fromNodeProviderChain = sinon.stub().returns(fallbackProvider);
      const { getCredentialProvider } = loadCredentials({
        files: {
          [credentialsFilePath]: ['[default]', 'aws_access_key_id = accessKeyId'].join('\n'),
        },
        fromIni,
        fromNodeProviderChain,
      });

      await expect(getCredentialProvider()()).to.be.rejectedWith(
        'Could not resolve credentials using profile'
      );
      expect(fromIni.firstCall.args[0]).to.include({
        filepath: credentialsFilePath,
        configFilepath: configFilePath,
      });
      expect(fromNodeProviderChain).to.not.have.been.called;
      expect(fallbackProvider).to.not.have.been.called;
    });
  });

  it('does not fallback when a malformed default profile is loaded from a tilde config path', async () => {
    await withEnv(async () => {
      process.env.AWS_CONFIG_FILE = '~/.aws/config';
      const fallbackProvider = sinon.stub().resolves({
        accessKeyId: 'fallbackAccessKeyId',
        secretAccessKey: 'fallbackSecretAccessKey',
      });
      const fromIni = sinon
        .stub()
        .returns(sinon.stub().rejects(createUnresolvedProfileError('default')));
      const fromNodeProviderChain = sinon.stub().returns(fallbackProvider);
      const { getCredentialProvider } = loadCredentials({
        files: {
          [configFilePath]: ['[profile default]', 'custom_field = value'].join('\n'),
        },
        fromIni,
        fromNodeProviderChain,
      });

      await expect(getCredentialProvider()()).to.be.rejectedWith(
        'Could not resolve credentials using profile'
      );
      expect(fromIni.firstCall.args[0]).to.include({
        filepath: credentialsFilePath,
        configFilepath: configFilePath,
      });
      expect(fromNodeProviderChain).to.not.have.been.called;
      expect(fallbackProvider).to.not.have.been.called;
    });
  });

  it('falls back to the default provider chain when AWS_DEFAULT_PROFILE is absent', async () => {
    await withEnv(async () => {
      process.env.AWS_DEFAULT_PROFILE = 'missing-default';
      const fallbackCredentials = {
        accessKeyId: 'fallbackAccessKeyId',
        secretAccessKey: 'fallbackSecretAccessKey',
      };
      const fallbackProvider = sinon.stub().resolves(fallbackCredentials);
      const fromIni = sinon
        .stub()
        .returns(sinon.stub().rejects(createUnresolvedProfileError('missing-default')));
      const fromNodeProviderChain = sinon.stub().returns(fallbackProvider);
      const logWarning = sinon.spy();
      const { getCredentialProvider } = loadCredentials({
        fromIni,
        fromNodeProviderChain,
        logWarning,
      });

      await expect(getCredentialProvider()()).to.eventually.deep.equal(fallbackCredentials);
      expect(fromIni).to.not.have.been.called;
      expect(fromNodeProviderChain).to.have.been.calledOnce;
      expect(logWarning).to.have.been.calledOnce;
      expect(logWarning.firstCall.args[0]).to.include('missing-default');
    });
  });

  it('does not fallback when AWS_DEFAULT_PROFILE exists but is malformed', async () => {
    await withEnv(async () => {
      process.env.AWS_DEFAULT_PROFILE = 'custom-default';
      const fallbackProvider = sinon.stub().resolves({
        accessKeyId: 'fallbackAccessKeyId',
        secretAccessKey: 'fallbackSecretAccessKey',
      });
      const fromIni = sinon
        .stub()
        .returns(sinon.stub().rejects(createUnresolvedProfileError('custom-default')));
      const fromNodeProviderChain = sinon.stub().returns(fallbackProvider);
      const { getCredentialProvider } = loadCredentials({
        files: {
          [credentialsFilePath]: ['[custom-default]', 'aws_access_key_id = accessKeyId'].join('\n'),
        },
        fromIni,
        fromNodeProviderChain,
      });

      await expect(getCredentialProvider()()).to.be.rejectedWith(
        'Could not resolve credentials using profile'
      );
      expect(fromIni.firstCall.args[0]).to.include({ profile: 'custom-default' });
      expect(fromNodeProviderChain).to.not.have.been.called;
      expect(fallbackProvider).to.not.have.been.called;
    });
  });

  it('does not fallback when AWS_DEFAULT_PROFILE exists as a quoted config profile', async () => {
    await withEnv(async () => {
      process.env.AWS_DEFAULT_PROFILE = 'custom-default';
      const fallbackProvider = sinon.stub().resolves({
        accessKeyId: 'fallbackAccessKeyId',
        secretAccessKey: 'fallbackSecretAccessKey',
      });
      const fromIni = sinon
        .stub()
        .returns(sinon.stub().rejects(createUnresolvedProfileError('custom-default')));
      const fromNodeProviderChain = sinon.stub().returns(fallbackProvider);
      const { getCredentialProvider } = loadCredentials({
        files: {
          [configFilePath]: ['[profile "custom-default"]', 'custom_field = value'].join('\n'),
        },
        fromIni,
        fromNodeProviderChain,
      });

      await expect(getCredentialProvider()()).to.be.rejectedWith(
        'Could not resolve credentials using profile'
      );
      expect(fromIni.firstCall.args[0]).to.include({ profile: 'custom-default' });
      expect(fromNodeProviderChain).to.not.have.been.called;
      expect(fallbackProvider).to.not.have.been.called;
    });
  });

  it('does not fallback when AWS_DEFAULT_PROFILE exists as an SSO config profile', async () => {
    await withEnv(async () => {
      process.env.AWS_DEFAULT_PROFILE = 'custom-default';
      const fallbackProvider = sinon.stub().resolves({
        accessKeyId: 'fallbackAccessKeyId',
        secretAccessKey: 'fallbackSecretAccessKey',
      });
      const originalError = Object.assign(new Error('SSO session has expired'), {
        name: 'CredentialsProviderError',
      });
      const fromIni = sinon.stub().returns(sinon.stub().rejects(originalError));
      const fromNodeProviderChain = sinon.stub().returns(fallbackProvider);
      const { getCredentialProvider } = loadCredentials({
        files: {
          [configFilePath]: [
            '[profile custom-default]',
            'sso_session = my-sso',
            'sso_account_id = 123456789012',
            'sso_role_name = Admin',
            '[sso-session my-sso]',
            'sso_region = us-east-1',
            'sso_start_url = https://example.awsapps.com/start',
            'sso_registration_scopes = sso:account:access',
          ].join('\n'),
        },
        fromIni,
        fromNodeProviderChain,
      });

      await expect(getCredentialProvider()()).to.be.rejectedWith('SSO session has expired');
      expect(fromIni.firstCall.args[0]).to.include({ profile: 'custom-default' });
      expect(fromNodeProviderChain).to.not.have.been.called;
      expect(fallbackProvider).to.not.have.been.called;
    });
  });

  it('does not fallback for explicit state profiles', async () => {
    await withEnv(async () => {
      const fallbackProvider = sinon.stub().resolves({
        accessKeyId: 'fallbackAccessKeyId',
        secretAccessKey: 'fallbackSecretAccessKey',
      });
      const fromIni = sinon
        .stub()
        .returns(sinon.stub().rejects(createUnresolvedProfileError('custom')));
      const fromNodeProviderChain = sinon.stub().returns(fallbackProvider);
      const { getCredentialProvider } = loadCredentials({ fromIni, fromNodeProviderChain });

      await expect(getCredentialProvider({ profile: 'custom' })()).to.be.rejectedWith(
        'Could not resolve credentials using profile'
      );
      expect(fromNodeProviderChain).to.not.have.been.called;
      expect(fallbackProvider).to.not.have.been.called;
    });
  });

  it('detects implicit default profiles from credentials and config files', async () => {
    await withEnv(async () => {
      const fromIni = sinon.stub();
      const fromNodeProviderChain = sinon.stub();
      for (const [description, files] of [
        [
          'credentials default',
          {
            [credentialsFilePath]: ['[default]', 'aws_access_key_id = accessKeyId'].join('\n'),
          },
        ],
        ['config default', { [configFilePath]: ['[default]', 'region = us-east-1'].join('\n') }],
        [
          'config profile default',
          { [configFilePath]: ['[profile default]', 'region = us-east-1'].join('\n') },
        ],
        [
          'config double-quoted profile default',
          { [configFilePath]: ['[profile "default"]', 'region = us-east-1'].join('\n') },
        ],
        [
          'config single-quoted profile default',
          { [configFilePath]: ["[profile 'default']", 'region = us-east-1'].join('\n') },
        ],
      ]) {
        const { doesImplicitDefaultProfileExist } = loadCredentials({
          files,
          fromIni,
          fromNodeProviderChain,
        });

        expect(doesImplicitDefaultProfileExist(), description).to.equal(true);
      }
    });
  });

  it('does not detect non-default profiles as implicit default profiles', async () => {
    await withEnv(async () => {
      const fromIni = sinon.stub();
      const fromNodeProviderChain = sinon.stub();
      const { doesImplicitDefaultProfileExist } = loadCredentials({
        files: {
          [credentialsFilePath]: ['[credentials-profile]', 'aws_access_key_id = accessKeyId'].join(
            '\n'
          ),
          [configFilePath]: [
            '[profile custom]',
            'region = us-east-1',
            '[profile "quoted"]',
            'region = us-east-1',
            '[raw-config]',
            'region = us-east-1',
          ].join('\n'),
        },
        fromIni,
        fromNodeProviderChain,
      });

      expect(doesImplicitDefaultProfileExist()).to.equal(false);
    });
  });

  it('does not fallback when implicit default profile detection cannot read shared files', async () => {
    await withEnv(async () => {
      const readError = Object.assign(new Error('permission denied'), { code: 'EACCES' });
      const fallbackProvider = sinon.stub().resolves({
        accessKeyId: 'fallbackAccessKeyId',
        secretAccessKey: 'fallbackSecretAccessKey',
      });
      const fromIni = sinon
        .stub()
        .returns(sinon.stub().rejects(createUnresolvedProfileError('default')));
      const fromNodeProviderChain = sinon.stub().returns(fallbackProvider);
      const { getCredentialProvider } = loadCredentials({
        files: { [credentialsFilePath]: readError },
        fromIni,
        fromNodeProviderChain,
      });

      await expect(getCredentialProvider()()).to.be.rejectedWith('permission denied');
      expect(fromNodeProviderChain).to.not.have.been.called;
      expect(fallbackProvider).to.not.have.been.called;
    });
  });

  it('passes a request handler to profile providers without overriding region', async () => {
    await withEnv(async () => {
      process.env.AWS_PROFILE = 'dev';
      const fromIni = sinon.stub().returns(sinon.stub().resolves({}));
      const fromNodeProviderChain = sinon.stub();
      loadCredentials({ fromIni, fromNodeProviderChain }).getCredentialProvider();

      expect(fromIni).to.have.been.calledOnce;
      const initOptions = fromIni.firstCall.args[0];
      expect(initOptions.profile).to.equal('dev');
      expect(initOptions.clientConfig.requestHandler).to.be.an.instanceOf(FakeNodeHttpHandler);
      expect(initOptions.clientConfig).to.not.have.property('region');
    });
  });

  it('passes a request handler to the default provider chain fallback', async () => {
    await withEnv(async () => {
      const fallbackCredentials = {
        accessKeyId: 'fallbackAccessKeyId',
        secretAccessKey: 'fallbackSecretAccessKey',
      };
      const fromIni = sinon
        .stub()
        .returns(sinon.stub().rejects(createUnresolvedProfileError('default')));
      const fromNodeProviderChain = sinon
        .stub()
        .returns(sinon.stub().resolves(fallbackCredentials));
      const { getCredentialProvider } = loadCredentials({ fromIni, fromNodeProviderChain });

      await expect(getCredentialProvider()()).to.eventually.deep.equal(fallbackCredentials);
      expect(fromNodeProviderChain).to.have.been.calledOnce;
      const initOptions = fromNodeProviderChain.firstCall.args[0];
      expect(initOptions.clientConfig.requestHandler).to.be.an.instanceOf(FakeNodeHttpHandler);
      expect(initOptions.clientConfig).to.not.have.property('region');
    });
  });

  it('shares a single request handler across all credential providers', async () => {
    await withEnv(async () => {
      const fromIni = sinon.stub().returns(sinon.stub().resolves({}));
      const fromNodeProviderChain = sinon.stub();
      const { getCredentialProvider } = loadCredentials({ fromIni, fromNodeProviderChain });

      getCredentialProvider({ profile: 'first' });
      getCredentialProvider({ profile: 'second' });

      expect(fromIni).to.have.been.calledTwice;
      expect(FakeNodeHttpHandler.instances).to.have.length(1);
      expect(fromIni.firstCall.args[0].clientConfig.requestHandler).to.equal(
        fromIni.secondCall.args[0].clientConfig.requestHandler
      );
    });
  });

  it('rejects the MFA prompt when input closes without an answer', async () => {
    await withEnv(async () => {
      process.env.AWS_PROFILE = 'mfa-profile';
      const fromIni = sinon.stub().returns(sinon.stub().resolves({}));
      const fromNodeProviderChain = sinon.stub();
      loadCredentials({
        fromIni,
        fromNodeProviderChain,
        readline: createFakeReadline(),
      }).getCredentialProvider();

      const { mfaCodeProvider } = fromIni.firstCall.args[0];
      const error = await mfaCodeProvider('arn:aws:iam::123456789012:mfa/user').then(
        () => null,
        (promptError) => promptError
      );

      expect(error).to.exist;
      expect(error.code).to.equal('MFA_CODE_UNAVAILABLE');
      expect(error.message).to.include('arn:aws:iam::123456789012:mfa/user');
    });
  });

  it('resolves the MFA prompt with the provided answer', async () => {
    await withEnv(async () => {
      process.env.AWS_PROFILE = 'mfa-profile';
      const fromIni = sinon.stub().returns(sinon.stub().resolves({}));
      const fromNodeProviderChain = sinon.stub();
      loadCredentials({
        fromIni,
        fromNodeProviderChain,
        readline: createFakeReadline({ answer: '123456' }),
      }).getCredentialProvider();

      const { mfaCodeProvider } = fromIni.firstCall.args[0];

      await expect(mfaCodeProvider('arn:aws:iam::123456789012:mfa/user')).to.eventually.equal(
        '123456'
      );
    });
  });

  it('warns once when a profile has static keys shadowed by a config file role_arn', async () => {
    await withEnv(async () => {
      process.env.AWS_PROFILE = 'divergent';
      const fromIni = sinon.stub().returns(sinon.stub().resolves({}));
      const fromNodeProviderChain = sinon.stub();
      const logWarning = sinon.spy();
      const { getCredentialProvider } = loadCredentials({
        files: {
          [credentialsFilePath]: [
            '[divergent]',
            'aws_access_key_id = accessKeyId',
            'aws_secret_access_key = secretAccessKey',
          ].join('\n'),
          [configFilePath]: [
            '[profile divergent]',
            'role_arn = arn:aws:iam::123456789012:role/deploy',
            'source_profile = divergent',
          ].join('\n'),
        },
        fromIni,
        fromNodeProviderChain,
        logWarning,
      });

      getCredentialProvider();
      getCredentialProvider();

      expect(logWarning).to.have.been.calledOnce;
      expect(logWarning.firstCall.args[0]).to.include('divergent');
      expect(logWarning.firstCall.args[0]).to.include('role_arn');
    });
  });

  it('does not warn when a profile has no config file role_arn', async () => {
    await withEnv(async () => {
      process.env.AWS_PROFILE = 'plain';
      const fromIni = sinon.stub().returns(sinon.stub().resolves({}));
      const fromNodeProviderChain = sinon.stub();
      const logWarning = sinon.spy();
      loadCredentials({
        files: {
          [credentialsFilePath]: [
            '[plain]',
            'aws_access_key_id = accessKeyId',
            'aws_secret_access_key = secretAccessKey',
          ].join('\n'),
          [configFilePath]: ['[profile plain]', 'region = us-east-1'].join('\n'),
        },
        fromIni,
        fromNodeProviderChain,
        logWarning,
      }).getCredentialProvider();

      expect(logWarning).to.not.have.been.called;
    });
  });

  it('does not warn when a config file role_arn profile has no static keys', async () => {
    await withEnv(async () => {
      process.env.AWS_PROFILE = 'role-only';
      const fromIni = sinon.stub().returns(sinon.stub().resolves({}));
      const fromNodeProviderChain = sinon.stub();
      const logWarning = sinon.spy();
      loadCredentials({
        files: {
          [configFilePath]: [
            '[profile role-only]',
            'role_arn = arn:aws:iam::123456789012:role/deploy',
            'credential_source = Environment',
          ].join('\n'),
        },
        fromIni,
        fromNodeProviderChain,
        logWarning,
      }).getCredentialProvider();

      expect(logWarning).to.not.have.been.called;
    });
  });
});
