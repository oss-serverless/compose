'use strict';

// Adapted from @serverless-components/utils-aws@0.1.0 and the AWS SDK v3
// credential-provider internals. Kept local so compose owns only the small
// provider chain it actually uses.

const { fromEnv } = require('@aws-sdk/credential-provider-env');
const { fromIni } = require('@aws-sdk/credential-provider-ini');
const { fromProcess } = require('@aws-sdk/credential-provider-process');
const { fromSSO } = require('@aws-sdk/credential-provider-sso');
const { fromTokenFile } = require('@aws-sdk/credential-provider-web-identity');
const { chain, CredentialsProviderError, memoize } = require('@aws-sdk/property-provider');

const remoteProvider = require('./remote-provider');

function defaultProvider(init) {
  return memoize(
    chain(
      ...(init.profile ? [] : [fromEnv()]),
      fromSSO(init),
      fromIni(init),
      fromProcess(init),
      fromTokenFile(init),
      remoteProvider(init),
      async () => {
        throw new CredentialsProviderError('Could not load credentials from any providers', false);
      }
    ),
    (credentials) =>
      credentials.expiration !== undefined &&
      credentials.expiration.getTime() - Date.now() < 300000,
    (credentials) => credentials.expiration !== undefined
  );
}

module.exports = defaultProvider;
