'use strict';

module.exports = (concurrency) => {
  if (!((Number.isInteger(concurrency) || concurrency === Infinity) && concurrency > 0)) {
    throw new TypeError('Expected `concurrency` to be a number from 1 and up');
  }

  const queue = [];
  let activeCount = 0;

  const next = () => {
    activeCount -= 1;

    if (queue.length > 0) {
      queue.shift()();
    }
  };

  const run = async (fn, resolve, args) => {
    activeCount += 1;

    const result = Promise.resolve().then(() => fn(...args));

    resolve(result);

    try {
      await result;
    } catch {
      // The caller observes rejections through the resolved task promise.
    } finally {
      next();
    }
  };

  const enqueue = (fn, resolve, args) => {
    queue.push(run.bind(null, fn, resolve, args));

    Promise.resolve().then(() => {
      if (activeCount < concurrency && queue.length > 0) {
        queue.shift()();
      }
    });
  };

  const limit = (fn, ...args) =>
    new Promise((resolve) => {
      enqueue(fn, resolve, args);
    });

  Object.defineProperties(limit, {
    activeCount: {
      get: () => activeCount,
    },
    pendingCount: {
      get: () => queue.length,
    },
    clearQueue: {
      value: () => {
        queue.length = 0;
      },
    },
  });

  return limit;
};
