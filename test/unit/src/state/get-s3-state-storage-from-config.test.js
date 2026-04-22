'use strict';

const chai = require('chai');
const proxyquire = require('proxyquire');
const sinon = require('sinon');

chai.use(require('sinon-chai'));

const expect = chai.expect;

describe('test/unit/src/state/get-s3-state-storage-from-config.test.js', () => {
  afterEach(() => {
    sinon.restore();
  });

  it('uses us-east-1 for compose-managed buckets', async () => {
    const getStateBucketName = sinon.stub().resolves('managed-bucket');
    const getConfiguredStateBucketName = sinon.stub().returns(null);
    const getStateBucketRegion = sinon.stub();
    const getAwsClientConfig = sinon.stub().returns({ credentials: 'creds' });

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
    });
    expect(stateStorage.config).to.deep.equal({
      bucketName: 'managed-bucket',
      stateKey: 'custom/prod/state.json',
      region: 'us-east-1',
      credentials: 'creds',
    });
  });

  it('resolves region for configured external buckets', async () => {
    const stateConfiguration = { backend: 's3', externalBucket: 'provided-bucket', profile: 'team' };
    const getStateBucketName = sinon.stub().resolves('provided-bucket');
    const getConfiguredStateBucketName = sinon.stub().returns('provided-bucket');
    const getStateBucketRegion = sinon.stub().resolves('eu-central-1');
    const getAwsClientConfig = sinon.stub().returns({ credentials: 'creds' });

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

    const stateStorage = await getS3StateStorageFromConfig(stateConfiguration, { stage: 'dev' });

    expect(getStateBucketRegion).to.have.been.calledOnceWithExactly(
      'provided-bucket',
      stateConfiguration
    );
    expect(getAwsClientConfig).to.have.been.calledOnceWithExactly({
      profile: 'team',
      region: 'eu-central-1',
    });
    expect(stateStorage.config).to.deep.equal({
      bucketName: 'provided-bucket',
      stateKey: 'dev/state.json',
      region: 'eu-central-1',
      credentials: 'creds',
    });
  });
});
