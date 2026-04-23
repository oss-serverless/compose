'use strict';

const { stdoutColors } = require('../utils/colors');

module.exports = {
  foreground: stdoutColors.reset,
  gray: stdoutColors.gray,
  red: stdoutColors.brandRed,
  warning: stdoutColors.warning,
  white: stdoutColors.white,
};
