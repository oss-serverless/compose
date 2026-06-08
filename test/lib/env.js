'use strict';

const withClearedEnv = async (keys, callback) => {
  const originalEnv = new Map(keys.map((key) => [key, process.env[key]]));

  for (const key of keys) delete process.env[key];

  try {
    return await callback();
  } finally {
    for (const key of keys) {
      const value = originalEnv.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
};

module.exports = { withClearedEnv };
