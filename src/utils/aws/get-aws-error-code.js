'use strict';

module.exports = (error) => error && (error.Code || error.code || error.name);
