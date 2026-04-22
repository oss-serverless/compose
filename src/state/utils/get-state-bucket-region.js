'use strict';

const { S3 } = require('@aws-sdk/client-s3');
const { getAwsClientConfig } = require('../../utils/aws');
const ServerlessError = require('../../serverless-error');

const getStateBucketRegion = async (bucketName, stateConfiguration = {}) => {
  const client = new S3(
    getAwsClientConfig({
      profile: stateConfiguration.profile,
      region: 'us-east-1',
    })
  );

  let result;
  try {
    result = await client.getBucketLocation({ Bucket: bucketName });
  } catch (e) {
    if (e.Code === 'NoSuchBucket') {
      throw new ServerlessError(
        `Provided bucket: "${bucketName}" could not be found.`,
        'CANNOT_FIND_PROVIDED_REMOTE_STATE_BUCKET'
      );
    }

    if (e.Code === 'AccessDenied') {
      throw new ServerlessError(
        `Access to provided bucket: "${bucketName}" has been denied.`,
        'CANNOT_ACCESS_PROVIDED_REMOTE_STATE_BUCKET'
      );
    }

    throw new ServerlessError(
      `Provided bucket: "${bucketName}" could not be accessed: ${e.message}.`,
      'GENERIC_CANNOT_ACCESS_PROVIDED_REMOTE_STATE_BUCKET'
    );
  }

  if (!result.LocationConstraint) {
    return 'us-east-1';
  }
  if (result.LocationConstraint === 'EU') {
    return 'eu-west-1';
  }
  return result.LocationConstraint;
};

module.exports = getStateBucketRegion;
