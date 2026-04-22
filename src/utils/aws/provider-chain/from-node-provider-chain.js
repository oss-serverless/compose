'use strict';

// Adapted from @serverless-components/utils-aws@0.1.0 and the AWS SDK v3
// credential-provider internals. Kept local so compose owns only the small
// provider chain it actually uses.

const {
  getDefaultRoleAssumer,
  getDefaultRoleAssumerWithWebIdentity,
} = require('@aws-sdk/client-sts');

const defaultProvider = require('./default-provider');

function fromNodeProviderChain(init) {
  return defaultProvider({
    ...init,
    roleAssumer: init.roleAssumer || getDefaultRoleAssumer(init.clientConfig),
    roleAssumerWithWebIdentity:
      init.roleAssumerWithWebIdentity || getDefaultRoleAssumerWithWebIdentity(init.clientConfig),
  });
}

module.exports = fromNodeProviderChain;
