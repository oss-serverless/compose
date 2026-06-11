'use strict';

const chai = require('chai');
const { mockClient } = require('aws-sdk-client-mock');
const proxyquire = require('proxyquire');
const sinon = require('sinon');
const {
  CloudFormationClient,
  DescribeStackResourceCommand,
  CreateStackCommand,
  DescribeStacksCommand,
} = require('@aws-sdk/client-cloudformation');

const getStateBucketName = require('../../../../../src/state/utils/get-state-bucket-name');
const Context = require('../../../../../src/Context');

const expect = chai.expect;

describe('test/unit/src/state/utils/get-state-bucket-name.test.js', () => {
  let cfMock;
  let context;

  before(() => {
    cfMock = mockClient(CloudFormationClient);
    const contextConfig = {
      root: process.cwd(),
      stage: 'dev',
      disableIO: true,
    };
    context = new Context(contextConfig);
  });

  beforeEach(() => {
    cfMock.reset();
  });

  describe('configured bucket compatibility', () => {
    it('resolves existing bucket name from config', async () => {
      const configuration = {
        backend: 's3',
        existingBucket: 'existing',
      };
      expect(await getStateBucketName(configuration, context)).to.equal('existing');
    });

    it('supports externalBucket as a compatibility alias', async () => {
      const configuration = {
        backend: 's3',
        externalBucket: 'external',
      };

      expect(await getStateBucketName(configuration, context)).to.equal('external');
    });
  });

  describe('CloudFormation command behavior', () => {
    it('resolves already existing bucket name provisioned by compose', async () => {
      const configuration = { backend: 's3' };
      cfMock
        .on(DescribeStackResourceCommand)
        .resolves({ StackResourceDetail: { PhysicalResourceId: 'fromcf' } });

      expect(await getStateBucketName(configuration, context)).to.equal('fromcf');
    });

    it('resolves bucket that had to be created', async () => {
      const configuration = { backend: 's3' };
      const stackDoesNotExistError = new Error('Stack "test" does not exist');
      stackDoesNotExistError.Code = 'ValidationError';
      cfMock
        .on(DescribeStackResourceCommand)
        .rejectsOnce(stackDoesNotExistError)
        .on(CreateStackCommand)
        .resolves()
        .on(DescribeStacksCommand)
        .resolves({ Stacks: [{ StackStatus: 'CREATE_COMPLETE' }] });

      expect(await getStateBucketName(configuration, context)).to.match(
        /^serverless-compose-state-[a-f0-9]{24}$/
      );
    });

    it('handles SDK v3 ValidationError names when bucket stack has to be created', async () => {
      const configuration = { backend: 's3' };
      const stackDoesNotExistError = new Error('Stack "test" does not exist');
      stackDoesNotExistError.name = 'ValidationError';
      cfMock
        .on(DescribeStackResourceCommand)
        .rejectsOnce(stackDoesNotExistError)
        .on(CreateStackCommand)
        .resolves()
        .on(DescribeStacksCommand)
        .resolves({ Stacks: [{ StackStatus: 'CREATE_COMPLETE' }] });

      expect(await getStateBucketName(configuration, context)).to.match(
        /^serverless-compose-state-[a-f0-9]{24}$/
      );
    });

    it('handles unexpected error when resolving bucket from s3', async () => {
      const configuration = { backend: 's3' };
      const unknownError = new Error('unknown error');
      cfMock.on(DescribeStackResourceCommand).rejects(unknownError);

      await expect(
        getStateBucketName(configuration, context)
      ).to.be.eventually.rejected.and.have.property(
        'code',
        'CANNOT_RETRIEVE_REMOTE_STATE_S3_BUCKET'
      );
    });

    it('handles unexpected error when creating bucket from s3', async () => {
      const configuration = { backend: 's3' };
      const stackDoesNotExistError = new Error('Stack "test" does not exist');
      stackDoesNotExistError.Code = 'ValidationError';
      cfMock
        .on(DescribeStackResourceCommand)
        .rejects(stackDoesNotExistError)
        .on(CreateStackCommand)
        .resolves()
        .on(DescribeStacksCommand)
        .resolves({ Stacks: [{ StackStatus: 'CREATE_FAILED' }] });

      await expect(
        getStateBucketName(configuration, context)
      ).to.be.eventually.rejected.and.have.property('code', 'CANNOT_DEPLOY_S3_REMOTE_STATE_STACK');
    });

    it('reuses one CloudFormation client across stack creation polls', async () => {
      const constructed = [];
      const describeStacks = sinon.stub();
      describeStacks.onCall(0).resolves({ Stacks: [{ StackStatus: 'CREATE_IN_PROGRESS' }] });
      describeStacks.onCall(1).resolves({ Stacks: [{ StackStatus: 'CREATE_COMPLETE' }] });
      const stackDoesNotExistError = Object.assign(new Error('Stack "test" does not exist'), {
        Code: 'ValidationError',
      });
      class FakeCloudFormation {
        constructor(config) {
          constructed.push(config);
        }

        describeStacks(input) {
          return describeStacks(input);
        }

        describeStackResource() {
          return Promise.reject(stackDoesNotExistError);
        }

        createStack() {
          return Promise.resolve({});
        }
      }
      const getStateBucketNameWithStubs = proxyquire(
        '../../../../../src/state/utils/get-state-bucket-name',
        {
          '@aws-sdk/client-cloudformation': { CloudFormation: FakeCloudFormation },
          '../../utils': { sleep: sinon.stub().resolves() },
        }
      );

      expect(await getStateBucketNameWithStubs({ backend: 's3' }, context)).to.match(
        /^serverless-compose-state-[a-f0-9]{24}$/
      );
      expect(describeStacks).to.have.been.calledTwice;
      // One client for the failed stack lookup, one shared by creation and all polls
      expect(constructed).to.have.length(2);
    });
  });

  describe('CloudFormation client config', () => {
    it('uses profile-aware AWS config for CloudFormation access', async () => {
      const describeStackResource = sinon.stub().resolves({
        StackResourceDetail: { PhysicalResourceId: 'fromcf' },
      });
      const CloudFormation = sinon.stub().callsFake(() => ({
        describeStackResource,
      }));
      const getAwsClientConfig = sinon.stub().returns({
        region: 'us-east-1',
        credentials: 'creds',
        retryMode: 'standard',
      });

      const getStateBucketNameWithStubs = proxyquire
        .noCallThru()
        .load('../../../../../src/state/utils/get-state-bucket-name', {
          '@aws-sdk/client-cloudformation': { CloudFormation },
          '../../utils/aws': { getAwsClientConfig },
        });

      expect(
        await getStateBucketNameWithStubs({ backend: 's3', profile: 'team' }, context)
      ).to.equal('fromcf');
      expect(getAwsClientConfig).to.have.been.calledOnceWithExactly({
        profile: 'team',
        region: 'us-east-1',
        stage: 'dev',
      });
      expect(CloudFormation).to.have.been.calledOnceWithExactly({
        region: 'us-east-1',
        credentials: 'creds',
        retryMode: 'standard',
      });
    });
  });
});
