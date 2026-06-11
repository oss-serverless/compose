'use strict';

const chai = require('chai');

const getAwsErrorCode = require('../../../../../src/utils/aws/get-aws-error-code');

const expect = chai.expect;

describe('test/unit/src/utils/aws/get-aws-error-code.test.js', () => {
  it('prefers the capitalized Code property', () => {
    const error = Object.assign(new Error('failed'), {
      Code: 'ValidationError',
      code: 'lower',
      name: 'SomeName',
    });
    expect(getAwsErrorCode(error)).to.equal('ValidationError');
  });

  it('falls back to the lowercase code property', () => {
    const error = Object.assign(new Error('failed'), { code: 'NoSuchKey' });
    expect(getAwsErrorCode(error)).to.equal('NoSuchKey');
  });

  it('falls back to the error name', () => {
    const error = Object.assign(new Error('failed'), { name: 'AccessDenied' });
    expect(getAwsErrorCode(error)).to.equal('AccessDenied');
  });

  it('returns a falsy value for missing errors', () => {
    expect(getAwsErrorCode(null)).to.equal(null);
    expect(getAwsErrorCode(undefined)).to.equal(undefined);
  });
});
