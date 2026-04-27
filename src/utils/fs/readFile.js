'use strict';

const fse = require('fs-extra');
const parseFile = require('./parseFile');

const readFile = async (filePath, options = {}) => {
  const contents = await fse.readFile(filePath, 'utf8');
  return parseFile(filePath, contents, options);
};

module.exports = readFile;
