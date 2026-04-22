'use strict';

const EventEmitter = require('events');
const Mocha = require('mocha/lib/mocha');

process.on('unhandledRejection', (err) => {
  process.stderr.write(`Unhandled rejection: ${err && err.stack}\n`);
  throw err;
});

process.env.SLS_DEPRECATION_NOTIFICATION_MODE = 'error';
process.env.SLS_TELEMETRY_DISABLED = '1';

const runnerEmitter = new EventEmitter();
const mochaRun = Mocha.prototype.run;

Mocha.prototype.run = function (...args) {
  const runner = mochaRun.apply(this, args);
  if (runner && runner.constructor && runner.constructor.name === 'Runner') {
    runnerEmitter.emit('runner', runner);
  }
  return runner;
};

module.exports = { runnerEmitter };
