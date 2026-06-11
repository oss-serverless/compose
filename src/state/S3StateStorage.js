'use strict';

const { S3 } = require('@aws-sdk/client-s3');
const pLimit = require('../utils/p-limit');
const streamToString = require('../utils/stream-to-string');
const ServerlessError = require('../serverless-error');
const BaseStateStorage = require('./BaseStateStorage');
const normalizeState = require('./normalize-state');
const { buildClientConfig } = require('../utils/aws/config');
const { getAwsErrorCode } = require('../utils/aws');

class S3StateStorage extends BaseStateStorage {
  constructor(config = {}) {
    super();

    // Applicable only if external bucket has been provided, at least for now
    this.region = config.region || 'us-east-1';

    this.bucketName = config.bucketName;
    this.stateKey = config.stateKey;

    // The fallback routes through buildClientConfig so that proxy, CA, timeout, and
    // retry configuration apply; credential semantics are preserved (the SDK default
    // chain still applies when no credentials are given)
    this.s3Client = new S3(
      config.clientConfig ||
        buildClientConfig({ region: this.region, credentials: config.credentials })
    );

    this.writeRequestQueue = pLimit(1);
  }

  async readState() {
    // State is loaded only once under the assumption
    // That it is not changed by any other process in the meantime
    // In the future, if needed, we will introduce locking capabilities

    if (this.state === undefined) {
      try {
        const stateObjectFromS3 = await this.s3Client.getObject({
          Bucket: this.bucketName,
          Key: this.stateKey,
        });
        const readState = await streamToString(stateObjectFromS3.Body);
        this.state = normalizeState(JSON.parse(readState));
      } catch (e) {
        if (getAwsErrorCode(e) === 'NoSuchKey') {
          this.state = normalizeState({});
        } else {
          throw new ServerlessError(
            `Could not read state from remote S3 bucket: ${e.message}`,
            'CANNOT_READ_S3_REMOTE_STATE'
          );
        }
      }
    }
    return this.state;
  }

  async writeState() {
    try {
      await this.writeRequestQueue(async () => {
        await this.s3Client.putObject({
          Bucket: this.bucketName,
          Key: this.stateKey,
          Body: JSON.stringify(this.state),
        });
      });
    } catch (e) {
      throw new ServerlessError(
        `Could not update state in remote S3 bucket: ${e.message}`,
        'CANNOT_UPDATE_S3_REMOTE_STATE'
      );
    }
  }

  async removeState() {
    try {
      await this.s3Client.deleteObject({
        Bucket: this.bucketName,
        Key: this.stateKey,
      });
    } catch (e) {
      throw new ServerlessError(
        `Could not remote state from remote S3 bucket: ${e.message}`,
        'CANNOT_REMOVE_S3_REMOTE_STATE'
      );
    }
  }
}

module.exports = S3StateStorage;
