'use strict';

const fse = require('fs-extra');
const parseFile = require('./parseFile');

const readFileSync = (filePath, options = {}) => {
  const contents = fse.readFileSync(filePath, 'utf8');
  return parseFile(filePath, contents, options);
};

module.exports = readFileSync;
