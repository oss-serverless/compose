'use strict';

const fse = require('fs-extra');

const fileExistsSync = (filePath) => {
  try {
    const stats = fse.lstatSync(filePath);
    return stats.isFile();
  } catch {
    return false;
  }
};

module.exports = fileExistsSync;
