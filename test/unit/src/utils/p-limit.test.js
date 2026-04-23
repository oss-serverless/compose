'use strict';

const expect = require('chai').expect;

const pLimit = require('../../../../src/utils/p-limit');

describe('test/unit/src/utils/p-limit.test.js', () => {
  it('serializes tasks when concurrency is 1', async () => {
    const limit = pLimit(1);
    const events = [];
    let active = 0;
    let maxActive = 0;

    const runTask = async (name) => {
      events.push(`start:${name}`);
      active += 1;
      maxActive = Math.max(maxActive, active);
      await Promise.resolve();
      await Promise.resolve();
      active -= 1;
      events.push(`end:${name}`);
      return name;
    };

    const [first, second] = await Promise.all([limit(runTask, 'first'), limit(runTask, 'second')]);

    expect([first, second]).to.deep.equal(['first', 'second']);
    expect(maxActive).to.equal(1);
    expect(events).to.deep.equal(['start:first', 'end:first', 'start:second', 'end:second']);
  });

  it('throws on invalid concurrency values', () => {
    expect(() => pLimit(0)).to.throw(TypeError);
    expect(() => pLimit('2')).to.throw(TypeError);
  });

  it('drains queued tasks after a rejection', async () => {
    const limit = pLimit(1);
    const started = [];

    const firstPromise = limit(async () => {
      started.push('first');
      await Promise.resolve();
      throw new Error('broken');
    });
    const secondPromise = limit(async () => {
      started.push('second');
      return 'second';
    });

    await Promise.resolve();
    await Promise.resolve();

    expect(started).to.deep.equal(['first']);
    expect(limit.activeCount).to.equal(1);
    expect(limit.pendingCount).to.equal(1);

    try {
      await firstPromise;
      expect.fail('Expected the first task to reject');
    } catch (error) {
      expect(error.message).to.equal('broken');
    }

    await Promise.resolve();
    await Promise.resolve();

    expect(started).to.deep.equal(['first', 'second']);
    expect(await secondPromise).to.equal('second');
    expect(limit.activeCount).to.equal(0);
    expect(limit.pendingCount).to.equal(0);
  });
});
