'use strict';

const chai = require('chai');
const proxyquire = require('proxyquire');
const sinon = require('sinon');

const expect = chai.expect;

const loadGetS3StateStorageFromConfig = ({
  getStateBucketName = sinon.stub().resolves('bucket'),
  getConfiguredStateBucketName = sinon.stub().returns(null),
  getStateBucketRegion = sinon.stub().resolves('us-east-1'),
  getAwsClientConfig = sinon.stub().returns({ region: 'us-east-1' }),
} = {}) => {
  class S3StateStorage {
    constructor(config) {
      this.config = config;
    }
  }

  const getS3StateStorageFromConfig = proxyquire
    .noCallThru()
    .load('../../../../src/state/get-s3-state-storage-from-config', {
      '../utils/aws': { getAwsClientConfig },
      './S3StateStorage': S3StateStorage,
      './utils/get-configured-state-bucket-name': getConfiguredStateBucketName,
      './utils/get-state-bucket-name': getStateBucketName,
      './utils/get-state-bucket-region': getStateBucketRegion,
    });

  return {
    getS3StateStorageFromConfig,
    getStateBucketName,
    getConfiguredStateBucketName,
    getStateBucketRegion,
    getAwsClientConfig,
  };
};

describe('test/unit/src/state/get-s3-state-storage-from-config.test.js', () => {
  it('uses us-east-1 for compose-managed buckets', async () => {
    const awsClientConfig = { region: 'us-east-1', credentials: 'creds', retryMode: 'standard' };
    const {
      getS3StateStorageFromConfig,
      getStateBucketName,
      getConfiguredStateBucketName,
      getStateBucketRegion,
      getAwsClientConfig,
    } = loadGetS3StateStorageFromConfig({
      getStateBucketName: sinon.stub().resolves('managed-bucket'),
      getStateBucketRegion: sinon.stub(),
      getAwsClientConfig: sinon.stub().returns(awsClientConfig),
    });

    const stateStorage = await getS3StateStorageFromConfig(
      { backend: 's3', prefix: 'custom', profile: 'team' },
      { stage: 'prod' }
    );

    expect(getStateBucketName).to.have.been.calledOnce;
    expect(getConfiguredStateBucketName).to.have.been.calledOnce;
    expect(getStateBucketRegion.called).to.equal(false);
    expect(getAwsClientConfig).to.have.been.calledOnceWithExactly({
      profile: 'team',
      region: 'us-east-1',
      stage: 'prod',
    });
    expect(stateStorage.config).to.deep.equal({
      bucketName: 'managed-bucket',
      stateKey: 'custom/prod/state.json',
      region: 'us-east-1',
      clientConfig: awsClientConfig,
    });
  });

  it('resolves region for configured external buckets', async () => {
    const stateConfiguration = {
      backend: 's3',
      externalBucket: 'provided-bucket',
      profile: 'team',
    };
    const getStateBucketName = sinon.stub().resolves('provided-bucket');
    const getConfiguredStateBucketName = sinon.stub().returns('provided-bucket');
    const getStateBucketRegion = sinon.stub().resolves('eu-central-1');
    const awsClientConfig = { region: 'eu-central-1', credentials: 'creds', retryMode: 'standard' };
    const getAwsClientConfig = sinon.stub().returns(awsClientConfig);
    const { getS3StateStorageFromConfig } = loadGetS3StateStorageFromConfig({
      getStateBucketName,
      getConfiguredStateBucketName,
      getStateBucketRegion,
      getAwsClientConfig,
    });

    const stateStorage = await getS3StateStorageFromConfig(stateConfiguration, { stage: 'dev' });

    expect(getStateBucketRegion).to.have.been.calledOnceWithExactly(
      'provided-bucket',
      stateConfiguration,
      { stage: 'dev' }
    );
    expect(getAwsClientConfig).to.have.been.calledOnceWithExactly({
      profile: 'team',
      region: 'eu-central-1',
      stage: 'dev',
    });
    expect(stateStorage.config).to.deep.equal({
      bucketName: 'provided-bucket',
      stateKey: 'dev/state.json',
      region: 'eu-central-1',
      clientConfig: awsClientConfig,
    });
  });

  it('resolves region for configured existing buckets', async () => {
    const stateConfiguration = {
      backend: 's3',
      existingBucket: 'provided-bucket',
      profile: 'team',
    };
    const getStateBucketName = sinon.stub().resolves('provided-bucket');
    const getConfiguredStateBucketName = sinon.stub().returns('provided-bucket');
    const getStateBucketRegion = sinon.stub().resolves('eu-central-1');
    const awsClientConfig = { region: 'eu-central-1', credentials: 'creds', retryMode: 'standard' };
    const getAwsClientConfig = sinon.stub().returns(awsClientConfig);
    const { getS3StateStorageFromConfig } = loadGetS3StateStorageFromConfig({
      getStateBucketName,
      getConfiguredStateBucketName,
      getStateBucketRegion,
      getAwsClientConfig,
    });

    const stateStorage = await getS3StateStorageFromConfig(stateConfiguration, { stage: 'dev' });

    expect(getStateBucketRegion).to.have.been.calledOnceWithExactly(
      'provided-bucket',
      stateConfiguration,
      { stage: 'dev' }
    );
    expect(getAwsClientConfig).to.have.been.calledOnceWithExactly({
      profile: 'team',
      region: 'eu-central-1',
      stage: 'dev',
    });
    expect(stateStorage.config).to.deep.equal({
      bucketName: 'provided-bucket',
      stateKey: 'dev/state.json',
      region: 'eu-central-1',
      clientConfig: awsClientConfig,
    });
  });

  it('rejects invalid stage before composing S3 state key', async () => {
    const {
      getS3StateStorageFromConfig,
      getStateBucketName,
      getConfiguredStateBucketName,
      getStateBucketRegion,
      getAwsClientConfig,
    } = loadGetS3StateStorageFromConfig({
      getStateBucketName: sinon.stub(),
      getConfiguredStateBucketName: sinon.stub(),
      getStateBucketRegion: sinon.stub(),
      getAwsClientConfig: sinon.stub(),
    });

    await expect(
      getS3StateStorageFromConfig({ backend: 's3' }, { stage: 'foo/../../tmp/x' })
    ).to.be.eventually.rejected.and.have.property('code', 'INVALID_STAGE');

    expect(getStateBucketName).to.not.have.been.called;
    expect(getConfiguredStateBucketName).to.not.have.been.called;
    expect(getStateBucketRegion).to.not.have.been.called;
    expect(getAwsClientConfig).to.not.have.been.called;
  });
});
