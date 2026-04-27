'use strict';

const chai = require('chai');

chai.use(require('chai-as-promised').default);
chai.use(require('sinon-chai').default);

process.env.SLS_DEPRECATION_NOTIFICATION_MODE ??= 'error';
process.env.SLS_TELEMETRY_DISABLED = '1';
process.env.LOG_TIME ??= 'abs';
