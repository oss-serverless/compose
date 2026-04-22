'use strict';

const chai = require('chai');
const proxyquire = require('proxyquire');
const sinon = require('sinon');

const expect = chai.expect;

describe('test/unit/src/utils/aws/get-credential-provider.test.js', () => {
  let originalAwsProfile;
  let originalAwsDefaultProfile;

  beforeEach(() => {
    originalAwsProfile = process.env.AWS_PROFILE;
    originalAwsDefaultProfile = process.env.AWS_DEFAULT_PROFILE;
  });

  afterEach(() => {
    if (originalAwsProfile == null) delete process.env.AWS_PROFILE;
    else process.env.AWS_PROFILE = originalAwsProfile;
    if (originalAwsDefaultProfile == null) delete process.env.AWS_DEFAULT_PROFILE;
    else process.env.AWS_DEFAULT_PROFILE = originalAwsDefaultProfile;
    sinon.restore();
  });

  it('falls back to AWS_DEFAULT_PROFILE and forwards the region to the provider chain', () => {
    const credentialProvider = sinon.stub().returns('provider');
    delete process.env.AWS_PROFILE;
    process.env.AWS_DEFAULT_PROFILE = 'default-profile';

    const getCredentialProvider = proxyquire
      .noCallThru()
      .load('../../../../../src/utils/aws/get-credential-provider', {
        './provider-chain/from-node-provider-chain': credentialProvider,
      });

    expect(getCredentialProvider({ profile: 'custom-profile', region: 'eu-central-1' })).to.equal(
      'provider'
    );
    expect(process.env.AWS_PROFILE).to.equal('default-profile');
    expect(credentialProvider).to.have.been.calledOnceWithExactly({
      profile: 'custom-profile',
      clientConfig: { region: 'eu-central-1' },
    });
  });

  it('does not override an existing AWS_PROFILE value', () => {
    const credentialProvider = sinon.stub().returns('provider');
    process.env.AWS_PROFILE = 'already-set';
    process.env.AWS_DEFAULT_PROFILE = 'default-profile';

    const getCredentialProvider = proxyquire
      .noCallThru()
      .load('../../../../../src/utils/aws/get-credential-provider', {
        './provider-chain/from-node-provider-chain': credentialProvider,
      });

    getCredentialProvider({ region: 'us-east-1' });

    expect(process.env.AWS_PROFILE).to.equal('already-set');
    expect(credentialProvider).to.have.been.calledOnceWithExactly({
      profile: undefined,
      clientConfig: { region: 'us-east-1' },
    });
  });
});
