'use strict';

const chai = require('chai');
const proxyquire = require('proxyquire');
const sinon = require('sinon');

const { withClearedEnv } = require('../../../../lib/env');

const expect = chai.expect;

describe('test/unit/src/utils/aws/get-credential-provider.test.js', () => {
  const envKeys = [
    'AWS_PROFILE',
    'AWS_DEFAULT_PROFILE',
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY',
    'AWS_SHARED_CREDENTIALS_FILE',
    'AWS_CONFIG_FILE',
  ];

  const withEnv = (callback) => withClearedEnv(envKeys, callback);

  function loadGetCredentialProvider({ getCredentialProvider }) {
    return proxyquire.noCallThru().load('../../../../../src/utils/aws/get-credential-provider', {
      './credentials': {
        getCredentialProvider,
        hasEnvironmentCredentials: () => false,
      },
    });
  }

  it('forwards profile and stage to the credential resolver', async () => {
    await withEnv(async () => {
      const baseProvider = sinon.stub().resolves({ accessKeyId: 'key', secretAccessKey: 's' });
      const credentialProvider = sinon.stub().returns(baseProvider);
      const getCredentialProvider = loadGetCredentialProvider({
        getCredentialProvider: credentialProvider,
      });

      getCredentialProvider({ profile: 'custom-profile', stage: 'prod' });

      expect(credentialProvider).to.have.been.calledOnceWithExactly({
        profile: 'custom-profile',
        stage: 'prod',
      });
    });
  });

  it('memoizes credential resolution process-wide', async () => {
    await withEnv(async () => {
      const resolvedCredentials = { accessKeyId: 'accessKeyId', secretAccessKey: 'secret' };
      const baseProvider = sinon.stub().resolves(resolvedCredentials);
      const getCredentialProvider = loadGetCredentialProvider({
        getCredentialProvider: sinon.stub().returns(baseProvider),
      });

      const provider = getCredentialProvider({ profile: 'custom', stage: 'dev' });

      expect(provider.memoized).to.equal(true);
      await expect(provider()).to.eventually.deep.equal(resolvedCredentials);
      await expect(provider()).to.eventually.deep.equal(resolvedCredentials);
      // A later lookup with the same inputs must not trigger another resolution either
      await expect(
        getCredentialProvider({ profile: 'custom', stage: 'dev' })()
      ).to.eventually.deep.equal(resolvedCredentials);
      expect(baseProvider).to.have.been.calledOnce;
    });
  });

  it('keeps providers separate per profile and stage', async () => {
    await withEnv(async () => {
      const credentialProvider = sinon
        .stub()
        .callsFake(({ profile }) =>
          sinon.stub().resolves({ accessKeyId: profile, secretAccessKey: 'secret' })
        );
      const getCredentialProvider = loadGetCredentialProvider({
        getCredentialProvider: credentialProvider,
      });

      const firstProvider = getCredentialProvider({ profile: 'first' });
      const secondProvider = getCredentialProvider({ profile: 'second' });

      expect(firstProvider).to.not.equal(secondProvider);
      await expect(firstProvider()).to.eventually.deep.equal({
        accessKeyId: 'first',
        secretAccessKey: 'secret',
      });
      await expect(secondProvider()).to.eventually.deep.equal({
        accessKeyId: 'second',
        secretAccessKey: 'secret',
      });
    });
  });

  it('resolves a fresh provider when the credential environment changes', async () => {
    await withEnv(async () => {
      const credentialProvider = sinon
        .stub()
        .returns(sinon.stub().resolves({ accessKeyId: 'key', secretAccessKey: 'secret' }));
      const getCredentialProvider = loadGetCredentialProvider({
        getCredentialProvider: credentialProvider,
      });

      const beforeProvider = getCredentialProvider();
      process.env.AWS_PROFILE = 'changed';
      const afterProvider = getCredentialProvider();

      expect(beforeProvider).to.not.equal(afterProvider);
      expect(credentialProvider).to.have.been.calledTwice;
    });
  });

  it('refreshes expiring credentials instead of serving them stale', async () => {
    await withEnv(async () => {
      const expiringCredentials = {
        accessKeyId: 'accessKeyId',
        secretAccessKey: 'secret',
        expiration: new Date(Date.now() + 60 * 1000),
      };
      const baseProvider = sinon.stub().resolves(expiringCredentials);
      const getCredentialProvider = loadGetCredentialProvider({
        getCredentialProvider: sinon.stub().returns(baseProvider),
      });

      const provider = getCredentialProvider();
      await provider();
      await provider();

      // Within the SDK's 5-minute expiry window every call re-resolves
      expect(baseProvider.callCount).to.be.greaterThan(1);
    });
  });
});
