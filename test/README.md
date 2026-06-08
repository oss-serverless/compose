# Compose Test Guide

The Compose test suite is mostly focused unit tests. Prefer small fakes and direct collaborators unless the test is specifically about command orchestration, component graph execution, process behavior, or a module-load seam.

## Commands

Run the full unit suite:

```sh
npm test
```

Run focused unit tests:

```sh
npx mocha --require ./test/mocha/bootstrap.cjs --require ./test/mocha/root-hooks.cjs --timeout 10000 --node-option unhandled-rejections=strict "test/unit/src/components-service.test.js"
```

Do not use `--config test/mocha/unit.cjs` for focused runs. That config includes `spec: ['test/**/*.test.js']`, so it runs the full suite even when a file path is passed.

Run updated static checks before review:

```sh
npm run lint:updated
npm run prettier-check:updated
```

## Runtime Sandbox

Mocha root hooks restore common process state before and after tests:

| State                                | Covered                                 |
| ------------------------------------ | --------------------------------------- |
| `sinon` stubs/spies/fakes            | Yes                                     |
| `process.env`                        | Yes                                     |
| `process.argv`                       | Yes                                     |
| cwd                                  | Yes, restored to the suite sandbox path |
| `EvalError.$composeCommandStartTime` | Yes                                     |

The root hooks do not restore every global mutation. Keep local cleanup for:

| State                                         | Local cleanup required |
| --------------------------------------------- | ---------------------- |
| `require.cache`                               | Yes                    |
| process listeners                             | Yes                    |
| `process.platform` descriptors                | Yes                    |
| stream method overrides                       | Yes                    |
| module singletons and static class properties | Yes                    |

## Proxyquire

`proxyquire` is acceptable when the test is about a module-boundary seam or require-time behavior. Do not use it just to avoid passing a plain fake to code that already accepts one.

Good uses:

| Seam                           | Example                                      |
| ------------------------------ | -------------------------------------------- |
| Entrypoint loading             | `bin/serverless-compose`                     |
| Process listeners              | `src/index.js`                               |
| Child process spawning         | `components/framework/index.js`              |
| AWS constructor config         | S3 and CloudFormation constructor assertions |
| Require-time terminal behavior | CLI colors, symbols, and reporters           |

When a file repeatedly loads the same module with the same seam, prefer a local helper:

```js
const loadSubject = (stubs) => proxyquire.noCallThru().load(modulePath, stubs);
```

## Context Setup

Use `Context` directly when the test is about `Context`. For larger orchestration tests, a helper is preferred if it reduces repeated setup without hiding the behavior under test.

Prefer:

```js
const context = await createTestContext({
  configuration: {},
  stateStorage: {
    readComponentsOutputs: async () => ({}),
  },
});
```

Avoid hiding values that are central to the assertion, such as `stage`, service configuration, or state storage behavior.

## AWS Test Doubles

Use the mock style that matches the assertion.

| Assertion                      | Preferred style               |
| ------------------------------ | ----------------------------- |
| SDK command response or error  | `aws-sdk-client-mock`         |
| Client constructor config      | `proxyquire` constructor stub |
| Credential provider resolution | `proxyquire` provider stubs   |
| S3 state read/write behavior   | Direct fake `s3Client` object |

Do not remove compatibility behavior such as `externalBucket`, `existingBucket`, or legacy `EU` region handling unless the product behavior is intentionally removed.

## Filesystem Tests

Use `test/lib/fs.js` helpers for file setup and teardown. The test suite already runs in a sandbox cwd. Use per-test temp directories when a test needs independent state or filesystem behavior under a specific root.

## Review Checklist

Before opening a PR:

- [ ] No `describe.only`, `it.only`, `describe.skip`, or `it.skip` was introduced.
- [ ] `proxyquire` use is intentional and, if repeated, centralized behind a helper.
- [ ] Local cleanup remains for module cache, listeners, descriptors, stream overrides, and singletons.
- [ ] Compatibility tests remain intact.
- [ ] Targeted Mocha command passes.
- [ ] Updated lint and prettier checks pass.
