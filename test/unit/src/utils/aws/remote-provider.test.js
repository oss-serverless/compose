'use strict';

const chai = require('chai');
const proxyquire = require('proxyquire');
const sinon = require('sinon');

chai.use(require('chai-as-promised'));
chai.use(require('sinon-chai'));

const expect = chai.expect;

describe('test/unit/src/utils/aws/remote-provider.test.js', () => {
  let originalRelativeUri;
  let originalFullUri;
  let originalImdsDisabled;

  beforeEach(() => {
    originalRelativeUri = process.env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI;
    originalFullUri = process.env.AWS_CONTAINER_CREDENTIALS_FULL_URI;
    originalImdsDisabled = process.env.AWS_EC2_METADATA_DISABLED;
  });

  afterEach(() => {
    if (originalRelativeUri == null) delete process.env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI;
    else process.env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI = originalRelativeUri;
    if (originalFullUri == null) delete process.env.AWS_CONTAINER_CREDENTIALS_FULL_URI;
    else process.env.AWS_CONTAINER_CREDENTIALS_FULL_URI = originalFullUri;
    if (originalImdsDisabled == null) delete process.env.AWS_EC2_METADATA_DISABLED;
    else process.env.AWS_EC2_METADATA_DISABLED = originalImdsDisabled;
    sinon.restore();
  });

  const loadRemoteProvider = () => {
    const containerProvider = sinon.stub().returns('container-provider');
    const instanceProvider = sinon.stub().returns('instance-provider');
    const CredentialsProviderError = class extends Error {};

    const remoteProvider = proxyquire
      .noCallThru()
      .load('../../../../../src/utils/aws/provider-chain/remote-provider', {
        '@aws-sdk/property-provider': { CredentialsProviderError },
        '@aws-sdk/credential-provider-imds': {
          ENV_CMDS_FULL_URI: 'AWS_CONTAINER_CREDENTIALS_FULL_URI',
          ENV_CMDS_RELATIVE_URI: 'AWS_CONTAINER_CREDENTIALS_RELATIVE_URI',
          fromContainerMetadata: containerProvider,
          fromInstanceMetadata: instanceProvider,
        },
      });

    return { remoteProvider, containerProvider, instanceProvider };
  };

  it('uses container metadata when ECS credential variables are present', () => {
    const { remoteProvider, containerProvider, instanceProvider } = loadRemoteProvider();
    process.env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI = '/ecs';

    expect(remoteProvider({ timeout: 5 })).to.equal('container-provider');
    expect(containerProvider).to.have.been.calledOnceWithExactly({ timeout: 5 });
    expect(instanceProvider.called).to.equal(false);
  });

  it('uses container metadata when AWS_CONTAINER_CREDENTIALS_FULL_URI is present', () => {
    const { remoteProvider, containerProvider, instanceProvider } = loadRemoteProvider();
    process.env.AWS_CONTAINER_CREDENTIALS_FULL_URI = 'http://169.254.170.2/v2/credentials/test';

    expect(remoteProvider({ timeout: 5 })).to.equal('container-provider');
    expect(containerProvider).to.have.been.calledOnceWithExactly({ timeout: 5 });
    expect(instanceProvider.called).to.equal(false);
  });

  it('disables IMDS when AWS_EC2_METADATA_DISABLED is set', async () => {
    const { remoteProvider, containerProvider, instanceProvider } = loadRemoteProvider();
    process.env.AWS_EC2_METADATA_DISABLED = 'true';

    await expect(remoteProvider({})()).to.be.eventually.rejectedWith(
      'EC2 Instance Metadata Service access disabled'
    );
    expect(containerProvider.called).to.equal(false);
    expect(instanceProvider.called).to.equal(false);
  });

  it('falls back to instance metadata when remote env vars are absent', () => {
    const { remoteProvider, containerProvider, instanceProvider } = loadRemoteProvider();

    expect(remoteProvider({ timeout: 5 })).to.equal('instance-provider');
    expect(instanceProvider).to.have.been.calledOnceWithExactly({ timeout: 5 });
    expect(containerProvider.called).to.equal(false);
  });

  it('disables IMDS whenever AWS_EC2_METADATA_DISABLED is set', async () => {
    const { remoteProvider, containerProvider, instanceProvider } = loadRemoteProvider();
    process.env.AWS_EC2_METADATA_DISABLED = 'false';

    await expect(remoteProvider({})()).to.be.eventually.rejectedWith(
      'EC2 Instance Metadata Service access disabled'
    );
    expect(containerProvider.called).to.equal(false);
    expect(instanceProvider.called).to.equal(false);
  });

  it('prefers container metadata over IMDS disable settings', () => {
    const { remoteProvider, containerProvider, instanceProvider } = loadRemoteProvider();
    process.env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI = '/ecs';
    process.env.AWS_EC2_METADATA_DISABLED = 'true';

    expect(remoteProvider({ timeout: 5 })).to.equal('container-provider');
    expect(containerProvider).to.have.been.calledOnceWithExactly({ timeout: 5 });
    expect(instanceProvider.called).to.equal(false);
  });
});
