'use strict';

// Adapted from @serverless-components/utils-aws@0.1.0 and the AWS SDK v3
// credential-provider internals. Kept local so compose owns only the small
// provider chain it actually uses.

const { CredentialsProviderError } = require('@aws-sdk/property-provider');

const {
  ENV_CMDS_FULL_URI,
  ENV_CMDS_RELATIVE_URI,
  fromContainerMetadata,
  fromInstanceMetadata,
} = require('@aws-sdk/credential-provider-imds');

const ENV_IMDS_DISABLED = 'AWS_EC2_METADATA_DISABLED';

function remoteProvider(init) {
  if (process.env[ENV_CMDS_RELATIVE_URI] || process.env[ENV_CMDS_FULL_URI]) {
    return fromContainerMetadata(init);
  }

  if (process.env[ENV_IMDS_DISABLED]) {
    return async () => {
      throw new CredentialsProviderError('EC2 Instance Metadata Service access disabled');
    };
  }

  return fromInstanceMetadata(init);
}

module.exports = remoteProvider;
