'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
};

const pack = () => {
  const result = spawnSync('npm', ['pack', '--silent'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });

  if (result.status !== 0) {
    process.stderr.write(result.stderr || 'npm pack failed\n');
    process.exit(result.status || 1);
  }

  return result.stdout.trim();
};

const packageFileName = process.env.PACKAGE_TGZ || pack();
const packagePath = path.resolve(packageFileName);
const shouldDeletePackage = !process.env.PACKAGE_TGZ;
const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'compose-pack-'));

try {
  run('npm', ['init', '-y'], { cwd: tempDirectory });
  run('npm', ['install', packagePath], { cwd: tempDirectory });
  run('npx', ['--no-install', 'osls-compose', '--help'], { cwd: tempDirectory });
} finally {
  fs.rmSync(tempDirectory, { recursive: true, force: true });
  if (shouldDeletePackage) {
    fs.rmSync(packagePath, { force: true });
  }
}
