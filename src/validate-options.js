'use strict';

const ServerlessError = require('./serverless-error');

function validateCliOptions(options, method) {
  // Catch early osls CLI-wide options that aren't supported here
  // Since these are reserved options, we don't even want component-specific commands to support them
  // so we detect these early for _all_ commands.
  const unsupportedGlobalCliOptions = ['debug', 'config', 'param'];
  unsupportedGlobalCliOptions.forEach((option) => {
    if (options[option]) {
      throw new ServerlessError(
        `The "--${option}" option is not supported (yet) in osls compose\nYou can search and/or open feature requests here: https://github.com/oss-serverless/compose/issues`,
        'INVALID_GLOBAL_CLI_OPTION'
      );
    }
  });

  // Globally recognized options for global osls compose methods
  const supportedOptions = new Set(['verbose', 'stage', 'max-concurrency']);
  // We only validate methods that are explicitly recognized by osls compose (excluding pass-through methods for osls)

  const recognizedMethods = new Set([
    'deploy',
    'remove',
    'info',
    'logs',
    'outputs',
    'refresh-outputs',
    'package',
  ]);

  if (!recognizedMethods.has(method)) return;

  if (method === 'logs') {
    supportedOptions.add('tail');
  }

  const unrecognizedCliOptions = Object.keys(options).filter(
    (option) => !supportedOptions.has(option)
  );

  if (!unrecognizedCliOptions.length) return;

  let errorMessage = `Unrecognized CLI options: "--${unrecognizedCliOptions.join('", "--')}"`;

  const frameworkSpecificCliOptions = new Set([
    'aws-profile',
    'region',
    'app',
    'org',
    'force',
    'package',
  ]);
  const usedFrameworkSpecificCliOptions = unrecognizedCliOptions.filter((option) =>
    frameworkSpecificCliOptions.has(option)
  );

  if (usedFrameworkSpecificCliOptions.length) {
    if (usedFrameworkSpecificCliOptions.length === 1) {
      errorMessage += `\n\nCLI option "--${usedFrameworkSpecificCliOptions[0]}" is an osls-specific option that is not supported in osls compose`;
    } else {
      errorMessage += `\n\nCLI options "--${usedFrameworkSpecificCliOptions.join(
        '", "--'
      )}" are osls-specific options that are not supported in osls compose`;
    }
  }
  throw new ServerlessError(errorMessage, 'UNRECOGNIZED_CLI_OPTIONS');
}

module.exports = validateCliOptions;
