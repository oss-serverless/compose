'use strict';

const getAwsClientConfig = require('./get-client-config');
const getAwsErrorCode = require('./get-aws-error-code');
const getCredentialProvider = require('./get-credential-provider');

module.exports = {
  getAwsClientConfig,
  getAwsErrorCode,
  getCredentialProvider,
};
