'use strict';

const {
  memoizeIdentityProvider,
  isIdentityExpired,
  doesIdentityRequireRefresh,
} = require('@smithy/core');
const { getCredentialProvider, hasEnvironmentCredentials } = require('./credentials');

const memoizedProviders = new Map();

// The key covers every input the resolution chain reads, so environment changes
// produce a fresh provider instead of a stale cache hit
function getCacheKey({ profile, stage } = {}) {
  const stageUpper = stage ? stage.toUpperCase() : null;

  return JSON.stringify({
    profile: profile || null,
    stage: stage || null,
    awsProfile: process.env.AWS_PROFILE || null,
    awsDefaultProfile: process.env.AWS_DEFAULT_PROFILE || null,
    stageProfile: stageUpper ? process.env[`AWS_${stageUpper}_PROFILE`] || null : null,
    hasStageEnvironmentCredentials: stageUpper
      ? hasEnvironmentCredentials(`AWS_${stageUpper}`)
      : false,
    hasEnvironmentCredentials: hasEnvironmentCredentials('AWS'),
    sharedCredentialsFile: process.env.AWS_SHARED_CREDENTIALS_FILE || null,
    sharedConfigFile: process.env.AWS_CONFIG_FILE || null,
  });
}

module.exports = ({ profile, stage } = {}) => {
  const cacheKey = getCacheKey({ profile, stage });

  if (!memoizedProviders.has(cacheKey)) {
    // Memoize process-wide; the memoized flag stops each client adding its own memoizer
    // and re-resolving (repeated MFA prompts, AssumeRole, credential_process)
    const memoized = memoizeIdentityProvider(
      getCredentialProvider({ profile, stage }),
      isIdentityExpired,
      doesIdentityRequireRefresh
    );
    memoized.memoized = true;
    memoizedProviders.set(cacheKey, memoized);
  }

  return memoizedProviders.get(cacheKey);
};
