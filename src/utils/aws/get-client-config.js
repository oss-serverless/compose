'use strict';

const getCredentialProvider = require('./get-credential-provider');

module.exports = ({ profile, region } = {}) => ({
  region,
  credentials: getCredentialProvider({ profile, region }),
});
