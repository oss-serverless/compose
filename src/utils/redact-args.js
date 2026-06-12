'use strict';

const sensitiveOptionNamePattern =
  /(?:^|[-_])(?:auth|authorization|credential|password|passwd|pwd|secret|token|api[-_]?key|access[-_]?key)(?:$|[-_])/i;

const redactArgs = (args) => {
  const redactedArgs = [];
  let redactNext = false;

  for (const arg of args) {
    const value = String(arg);

    if (redactNext) {
      redactedArgs.push('<redacted>');
      redactNext = false;
      continue;
    }

    const equalsIndex = value.indexOf('=');
    const optionName = value.replace(/^-+/, '').split('=')[0];

    if (equalsIndex !== -1 && sensitiveOptionNamePattern.test(optionName)) {
      redactedArgs.push(`${value.slice(0, equalsIndex + 1)}<redacted>`);
      continue;
    }

    if (value.startsWith('-') && sensitiveOptionNamePattern.test(optionName)) {
      redactedArgs.push(value);
      redactNext = true;
      continue;
    }

    redactedArgs.push(value);
  }

  return redactedArgs;
};

module.exports = redactArgs;
