'use strict';

const chai = require('chai');
const proxyquire = require('proxyquire');
const sinon = require('sinon');

chai.use(require('sinon-chai'));

const expect = chai.expect;

describe('test/unit/src/utils/aws/get-client-config.test.js', () => {
  afterEach(() => {
    sinon.restore();
  });

  it('returns the region and credentials together', () => {
    const getCredentialProvider = sinon.stub().returns('creds');
    const getClientConfig = proxyquire
      .noCallThru()
      .load('../../../../../src/utils/aws/get-client-config', {
        './get-credential-provider': getCredentialProvider,
      });

    expect(getClientConfig({ profile: 'team', region: 'eu-central-1' })).to.deep.equal({
      region: 'eu-central-1',
      credentials: 'creds',
    });
    expect(getCredentialProvider).to.have.been.calledOnceWithExactly({
      profile: 'team',
      region: 'eu-central-1',
    });
  });
});
