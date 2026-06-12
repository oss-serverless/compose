This repository contains the code for osls compose.

Requires Node.js `^20.19.0 || ^22.13.0 || >=24`.

There is no standalone binary version, the package is only available via NPM.

```bash
npm install -g @osls/compose
osls-compose --help
```

Available commands: `osls-compose`, `oslsc`.

Check out the [osls compose documentation](https://github.com/oss-serverless/osls/blob/4.x/docs/guides/compose.md).

Compose honors the same proxy, custom certificate authority, and timeout environment variables as osls (`HTTP_PROXY`/`HTTPS_PROXY`, `ca`/`cafile`, and `AWS_CLIENT_TIMEOUT`) for its own AWS requests, such as remote state access. See [Running behind a proxy](https://github.com/oss-serverless/osls/blob/4.x/docs/guides/credentials.md#running-behind-a-proxy).

A Compose project is code: loading a `serverless-compose.js` or `serverless-compose.ts` configuration executes it, and deploying runs the osls CLI in each service directory. Do not run projects from untrusted sources. See the [osls security model](https://github.com/oss-serverless/osls/blob/4.x/docs/guides/security.md) and the [Compose security notes](https://github.com/oss-serverless/osls/blob/4.x/docs/guides/compose.md#security-model).

<p align="center"><a href="https://github.com/oss-serverless/osls/blob/4.x/docs/guides/compose.md"><img src="https://assets.website-files.com/6178ec21bdb27bb4cd52c72d/625d76707477fa1efbb3559d_blog%20header.png" width="600px"></a></p>
