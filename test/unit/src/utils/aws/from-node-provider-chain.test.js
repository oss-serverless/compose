'use strict';

const chai = require('chai');
const proxyquire = require('proxyquire');
const sinon = require('sinon');

chai.use(require('sinon-chai'));

const expect = chai.expect;

describe('test/unit/src/utils/aws/from-node-provider-chain.test.js', () => {
  afterEach(() => {
    sinon.restore();
  });

  it('injects default role assumers derived from clientConfig', () => {
    const getDefaultRoleAssumer = sinon.stub().returns('roleAssumer');
    const getDefaultRoleAssumerWithWebIdentity = sinon.stub().returns('webIdentityAssumer');
    const defaultProvider = sinon.stub().returns('provider');

    const fromNodeProviderChain = proxyquire
      .noCallThru()
      .load('../../../../../src/utils/aws/provider-chain/from-node-provider-chain', {
        '@aws-sdk/client-sts': {
          getDefaultRoleAssumer,
          getDefaultRoleAssumerWithWebIdentity,
        },
        './default-provider': defaultProvider,
      });

    expect(
      fromNodeProviderChain({ profile: 'team', clientConfig: { region: 'us-east-1' } })
    ).to.equal('provider');
    expect(getDefaultRoleAssumer).to.have.been.calledOnceWithExactly({ region: 'us-east-1' });
    expect(getDefaultRoleAssumerWithWebIdentity).to.have.been.calledOnceWithExactly({
      region: 'us-east-1',
    });
    expect(defaultProvider).to.have.been.calledOnceWithExactly({
      profile: 'team',
      clientConfig: { region: 'us-east-1' },
      roleAssumer: 'roleAssumer',
      roleAssumerWithWebIdentity: 'webIdentityAssumer',
    });
  });
});
