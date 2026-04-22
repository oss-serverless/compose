'use strict';

const fromNodeProviderChain = require('./provider-chain/from-node-provider-chain');

module.exports = ({ profile, region } = {}) => {
  if (process.env.AWS_DEFAULT_PROFILE && !process.env.AWS_PROFILE) {
    process.env.AWS_PROFILE = process.env.AWS_DEFAULT_PROFILE;
  }

  return fromNodeProviderChain({
    profile,
    clientConfig: { region },
  });
};
