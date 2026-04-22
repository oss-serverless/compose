'use strict';

const chai = require('chai');
const proxyquire = require('proxyquire');
const sinon = require('sinon');

const expect = chai.expect;

describe('test/unit/src/utils/aws/default-provider.test.js', () => {
  const getStubs = () => {
    const envProvider = sinon.stub().returns('env-provider');
    const ssoProvider = sinon.stub().returns('sso-provider');
    const iniProvider = sinon.stub().returns('ini-provider');
    const processProvider = sinon.stub().returns('process-provider');
    const tokenProvider = sinon.stub().returns('token-provider');
    const remoteProvider = sinon.stub().returns('remote-provider');
    const chain = sinon.stub().callsFake((...providers) => providers);
    const memoize = sinon.stub().callsFake((provider) => provider);

    const defaultProvider = proxyquire
      .noCallThru()
      .load('../../../../../src/utils/aws/provider-chain/default-provider', {
        '@aws-sdk/credential-provider-env': { fromEnv: envProvider },
        '@aws-sdk/credential-provider-ini': { fromIni: iniProvider },
        '@aws-sdk/credential-provider-process': { fromProcess: processProvider },
        '@aws-sdk/credential-provider-sso': { fromSSO: ssoProvider },
        '@aws-sdk/credential-provider-web-identity': { fromTokenFile: tokenProvider },
        '@aws-sdk/property-provider': {
          chain,
          memoize,
          CredentialsProviderError: class CredentialsProviderError extends Error {},
        },
        './remote-provider': remoteProvider,
      });

    return {
      defaultProvider,
      envProvider,
      ssoProvider,
      iniProvider,
      processProvider,
      tokenProvider,
      remoteProvider,
      chain,
      memoize,
    };
  };

  afterEach(() => {
    sinon.restore();
  });

  it('keeps env credentials first when no explicit profile is provided', () => {
    const {
      defaultProvider,
      envProvider,
      ssoProvider,
      iniProvider,
      processProvider,
      tokenProvider,
      remoteProvider,
      chain,
      memoize,
    } = getStubs();
    const init = { region: 'us-east-1' };

    const provider = defaultProvider(init);

    expect(provider).to.deep.equal(chain.firstCall.args);
    expect(envProvider).to.have.been.calledOnceWithExactly();
    expect(ssoProvider).to.have.been.calledOnceWithExactly(init);
    expect(iniProvider).to.have.been.calledOnceWithExactly(init);
    expect(processProvider).to.have.been.calledOnceWithExactly(init);
    expect(tokenProvider).to.have.been.calledOnceWithExactly(init);
    expect(remoteProvider).to.have.been.calledOnceWithExactly(init);
    expect(chain.firstCall.args.slice(0, 6)).to.deep.equal([
      'env-provider',
      'sso-provider',
      'ini-provider',
      'process-provider',
      'token-provider',
      'remote-provider',
    ]);
    expect(memoize).to.have.been.calledOnce;
  });

  it('skips env credentials when an explicit profile is provided', () => {
    const { defaultProvider, envProvider, chain } = getStubs();

    defaultProvider({ profile: 'team' });

    expect(envProvider.called).to.equal(false);
    expect(chain.firstCall.args[0]).to.equal('sso-provider');
  });
});
