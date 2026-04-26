'use strict';

const { curry } = require('ramda');
const fse = require('fs-extra');

const fileExists = curry(async (filePath) => {
  try {
    const stats = await fse.lstat(filePath);
    return stats.isFile();
  } catch {
    return false;
  }
});

module.exports = fileExists;
