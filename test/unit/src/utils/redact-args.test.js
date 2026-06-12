'use strict';

const chai = require('chai');

const redactArgs = require('../../../../src/utils/redact-args');

const expect = chai.expect;

describe('test/unit/src/utils/redact-args.test.js', () => {
  it('redacts values of sensitive equals-form arguments', () => {
    expect(redactArgs(['--token=abc', 'api-key=xyz', '--param', 'secret-token=abc'])).to.deep.equal(
      ['--token=<redacted>', 'api-key=<redacted>', '--param', 'secret-token=<redacted>']
    );
  });

  it('redacts the following value of sensitive flag arguments', () => {
    expect(redactArgs(['--password', 'hunter2', '--stage', 'dev'])).to.deep.equal([
      '--password',
      '<redacted>',
      '--stage',
      'dev',
    ]);
  });

  it('passes through non-sensitive arguments unchanged', () => {
    expect(redactArgs(['deploy', '--stage', 'dev', '--param', 'tableName=users'])).to.deep.equal([
      'deploy',
      '--stage',
      'dev',
      '--param',
      'tableName=users',
    ]);
  });

  it('stringifies non-string arguments', () => {
    expect(redactArgs(['--verbose', 1, true])).to.deep.equal(['--verbose', '1', 'true']);
  });
});
