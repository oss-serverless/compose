'use strict';

const { getAwsClientConfig } = require('../utils/aws');

const S3StateStorage = require('./S3StateStorage');
const getConfiguredStateBucketName = require('./utils/get-configured-state-bucket-name');
const getStateBucketName = require('./utils/get-state-bucket-name');
const getStateBucketRegion = require('./utils/get-state-bucket-region');

/**
 * @param {Record<string, any>} stateConfiguration
 * @param {import('../Context')} context
 * @returns {Promise<S3StateStorage>}
 */
const getS3StateStorageFromConfig = async (stateConfiguration, context) => {
  const bucketName = await getStateBucketName(stateConfiguration, context);
  const stateKey = `${stateConfiguration.prefix ? `${stateConfiguration.prefix}/` : ''}${
    context.stage
  }/state.json`;

  const configuredBucketName = getConfiguredStateBucketName(stateConfiguration);
  const region = configuredBucketName
    ? await getStateBucketRegion(bucketName, stateConfiguration)
    : 'us-east-1';

  const awsClientConfig = getAwsClientConfig({
    profile: stateConfiguration.profile,
    region,
  });

  return new S3StateStorage({
    bucketName,
    stateKey,
    region,
    credentials: awsClientConfig.credentials,
  });
};

module.exports = getS3StateStorageFromConfig;
