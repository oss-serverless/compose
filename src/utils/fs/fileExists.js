'use strict';

const fse = require('fs-extra');

const fileExists = async (filePath) => {
  try {
    const stats = await fse.lstat(filePath);
    return stats.isFile();
  } catch {
    return false;
  }
};

module.exports = fileExists;
