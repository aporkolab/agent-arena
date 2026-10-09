#!/usr/bin/env node
/** A reproducible evaluator, NOT a security sandbox. Run unknown code in a disposable container. */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

export const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const MAX_FILE_BYTES = 1024 * 1024;
const MAX_OUTPUT_BYTES = 32 * 1024;
const sha = value => createHash('sha256').update(value).digest('hex');
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const digestEntries = entries => sha(JSON.stringify([...entries].sort(([a], [b]) => compare(a, b))));
const elapsed = start => Math.round(performance.now() - start);

export function relativePath(value) {
  if (typeof value !== 'string' || !value || value.includes('\\') || value.includes('\0') ||
      path.posix.isAbsolute(value) || value.split('/').some(part => !part || part === '.' || part === '..') ||
      /^[a-zA-Z]:/.test(value)) throw new Error(`Unsafe relative path: ${JSON.stringify(value)}`);
  return value;
}

export async function rejectSymlinks(target) {
  const absolute = path.resolve(target);
  let cursor = path.parse(absolute).root;
  for (const component of absolute.slice(cursor.length).split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, component);
    let stat;
    try { stat = await fs.lstat(cursor); } catch (error) {
      if (error.code === 'ENOENT') return;
      throw error;
    }
    if (stat.isSymbolicLink()) throw new Error(`Symlinks are not accepted: ${cursor}`);
  }
}

export async function readTree(directory) {
  await rejectSymlinks(directory);
  const files = new Map();
  async function visit(current, prefix = '') {
    for (const entry of (await fs.readdir(current, { withFileTypes: true })).sort((a, b) => compare(a.name, b.name))) {
      const name = relativePath(prefix ? `${prefix}/${entry.name}` : entry.name);
      const absolute = path.join(current, entry.name);
      const stat = await fs.lstat(absolute);
      if (stat.isSymbolicLink()) throw new Error(`Symlinks are not accepted: ${absolute}`);
      if (stat.isDirectory()) await visit(absolute, name);
      else if (stat.isFile()) {
        if (stat.size > MAX_FILE_BYTES) throw new Error(`File exceeds 1 MiB: ${name}`);
        files.set(name, await fs.readFile(absolute));
      } else throw new Error(`Non-regular file is not accepted: ${name}`);
    }
  }
  await visit(directory);
  return files;
}

export async function loadSuite(root = ROOT) {
  const tree = await readTree(path.join(root, 'tasks'));
  const ids = [...new Set([...tree.keys()].map(name => name.split('/')[0]))].sort();
  if (!ids.length) throw new Error('No tasks found');
  const tasks = [];
  for (const id of ids) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) throw new Error(`Invalid task directory: ${id}`);
    const raw = tree.get(`${id}/task.json`);
    if (!raw) throw new Error(`Missing task.json: ${id}`);
    const metadata = JSON.parse(raw.toString('utf8'));
    if (metadata.id !== id || !['java', 'typescript'].includes(metadata.language) ||
        typeof metadata.title !== 'string' || typeof metadata.summary !== 'string' ||
        !Number.isSafeInteger(metadata.expectedTests) || metadata.expectedTests < 1 ||
        !Array.isArray(metadata.editableFiles) || metadata.editableFiles.length === 0) {
      throw new Error(`Invalid metadata for ${id}`);
    }
    const files = new Map([...tree].filter(([name]) => name.startsWith(`${id}/`))
      .map(([name, bytes]) => [name.slice(id.length + 1), bytes]));
    const expectedSource = metadata.language === 'java' ? 'src/Task.java' : 'src/task.ts';
    const expectedTest = metadata.language === 'java' ? 'tests/TaskTest.java' : 'tests/task.test.ts';
    if (metadata.editableFiles.length !== 1 || metadata.editableFiles[0] !== expectedSource ||
        !files.has(expectedSource) || !files.has(expectedTest)) throw new Error(`Unsupported task layout: ${id}`);
    for (const name of metadata.editableFiles) relativePath(name);
    tasks.push({ ...metadata, files, sourcePath: expectedSource, testPath: expectedTest });
  }
  // Snapshot bytes are kept in memory: overlays never provide trusted tests or metadata.
  return { tasks, tree, digest: digestEntries([...tree].map(([name, bytes]) => [name, sha(bytes)])) };
}

export async function loadCandidate(directory, tasks) {
  if (!directory) return new Map();
  const files = await readTree(directory);
  const allowed = new Set(tasks.flatMap(task => task.editableFiles.map(name => `${task.id}/${name}`)));
  for (const name of files.keys()) if (!allowed.has(name)) throw new Error(`Candidate file is not editable: ${name}`);
  return files;
}

export function runProcess(command, args, { cwd = ROOT, timeoutMs = 10000, outputLimit = MAX_OUTPUT_BYTES } = {}) {
  return new Promise(resolve => {
    const start = performance.now();
    const chunks = { stdout: [], stderr: [] };
    const sizes = { stdout: 0, stderr: 0 };
    let timedOut = false;
    let truncated = false;
    let spawnError = null;
    const environment = {
      PATH: process.env.PATH || '', HOME: cwd, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8',
      ...(process.env.JAVA_HOME ? { JAVA_HOME: process.env.JAVA_HOME } : {}),
      ...(process.platform === 'win32' ? { SystemRoot: process.env.SystemRoot || '' } : {}),
    };
    const child = spawn(command, args, {
      cwd, env: environment, shell: false, detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        if (process.platform === 'win32') child.kill('SIGKILL');
        else process.kill(-child.pid, 'SIGKILL');
      } catch { /* Child may have exited as the deadline elapsed. */ }
    }, timeoutMs);
    for (const stream of ['stdout', 'stderr']) child[stream].on('data', chunk => {
      const remaining = Math.max(0, outputLimit - sizes[stream]);
      if (chunk.length > remaining) truncated = true;
      if (remaining) chunks[stream].push(chunk.subarray(0, remaining));
      sizes[stream] += Math.min(chunk.length, remaining);
    });
    child.on('error', error => { spawnError = error.message; });
    child.on('close', (exitCode, signal) => {
      clearTimeout(timer);
      resolve({
        exitCode, signal, timedOut, outputTruncated: truncated, spawnError, durationMs: elapsed(start),
        stdout: Buffer.concat(chunks.stdout).toString('utf8').split(cwd).join('<workdir>'),
        stderr: Buffer.concat(chunks.stderr).toString('utf8').split(cwd).join('<workdir>'),
      });
    });
  });
}

export async function evaluateTask(task, overlay, { timeoutMs = 10000 } = {}) {
  const start = performance.now();
  const working = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-arena-'));
  const sources = new Map(task.files);
  const diffHashes = [];
  for (const name of task.editableFiles) {
    const after = overlay.get(`${task.id}/${name}`);
    if (after) {
      const beforeSha256 = sha(task.files.get(name));
      const afterSha256 = sha(after);
      sources.set(name, after);
      diffHashes.push({ path: name, beforeSha256, afterSha256,
        diffSha256: sha(JSON.stringify([name, beforeSha256, afterSha256])) });
    }
  }
  const sourceSha256 = Object.fromEntries(task.editableFiles.map(name => [name, sha(sources.get(name))]));
  const result = {
    id: task.id, title: task.title, language: task.language, status: 'error', phase: 'setup',
    expectedTests: task.expectedTests, observedTests: null, expectedFailureObserved: false,
    sourceSha256, sourceDigest: digestEntries(Object.entries(sourceSha256)),
    testSha256: sha(task.files.get(task.testPath)), candidateDiffHashes: diffHashes,
    compile: null, test: null, testDurationMs: null, durationMs: 0,
  };
  try {
    for (const [name, bytes] of sources) {
      const destination = path.join(working, relativePath(name));
      await fs.mkdir(path.dirname(destination), { recursive: true });
      await fs.writeFile(destination, bytes);
    }
    const java = task.language === 'java';
    const compiler = java ? 'javac' : process.execPath;
    const args = java ? ['--release', '17', '-d', 'build', task.sourcePath, task.testPath] : [
      path.join(ROOT, 'node_modules/typescript/bin/tsc'), task.sourcePath, task.testPath,
      '--target', 'ES2022', '--module', 'commonjs', '--strict', '--esModuleInterop',
      '--types', 'node', '--typeRoots', path.join(ROOT, 'node_modules/@types'),
      '--skipLibCheck', '--outDir', 'build',
    ];
    result.phase = 'compile';
    result.compile = await runProcess(compiler, args, { cwd: working, timeoutMs: Math.max(20000, timeoutMs) });
    if (result.compile.spawnError) throw new Error(result.compile.spawnError);
    if (result.compile.exitCode !== 0 || result.compile.timedOut) {
      result.status = 'fail';
      result.reason = result.compile.timedOut ? 'Compiler timed out' : 'Compilation failed';
      return result;
    }
    result.phase = 'test';
    result.test = await runProcess(java ? 'java' : process.execPath,
      java ? ['-ea', '-cp', 'build', 'TaskTest'] : ['build/tests/task.test.js'],
      { cwd: working, timeoutMs });
    result.testDurationMs = result.test.durationMs;
    if (result.test.spawnError) throw new Error(result.test.spawnError);
    const actualTest = await fs.readFile(path.join(working, task.testPath));
    if (sha(actualTest) !== result.testSha256) throw new Error('Trusted test file was modified during execution');
    const markers = result.test.stdout.split(/\r?\n/).filter(line => /^ARENA_TESTS_PASSED=\d+$/.test(line));
    const expectedMarker = `ARENA_TESTS_PASSED=${task.expectedTests}`;
    if (markers.length === 1) result.observedTests = Number(markers[0].split('=')[1]);
    result.status = result.test.exitCode === 0 && !result.test.timedOut &&
      !result.test.outputTruncated && markers.length === 1 && markers[0] === expectedMarker ? 'pass' : 'fail';
    result.expectedFailureObserved = Number.isInteger(result.test.exitCode) && result.test.exitCode > 0 &&
      !result.test.timedOut && /AssertionError/.test(result.test.stderr + result.test.stdout);
    if (result.status !== 'pass') result.reason = result.test.timedOut ? 'Tests timed out' :
      result.test.exitCode !== 0 ? 'Tests failed' : 'Missing, repeated or incorrect test-completion marker';
    return result;
  } catch (error) {
    result.status = 'error';
    result.reason = error.message.split(working).join('<workdir>');
    return result;
  } finally {
    result.durationMs = elapsed(start);
    await fs.rm(working, { recursive: true, force: true });
  }
}

async function toolchain(tasks) {
  const tools = { node: process.version, platform: process.platform, arch: process.arch, osRelease: os.release() };
  if (tasks.some(task => task.language === 'java')) {
    for (const executable of ['java', 'javac']) {
      const result = await runProcess(executable, ['-version']);
      if (result.exitCode !== 0 || result.spawnError) throw new Error(`${executable} is required (JDK 17 or newer)`);
      tools[executable] = (result.stdout + result.stderr).trim();
    }
  }
  if (tasks.some(task => task.language === 'typescript')) {
    const metadata = JSON.parse(await fs.readFile(path.join(ROOT, 'node_modules/typescript/package.json'), 'utf8'));
    tools.typescript = metadata.version;
  }
  return tools;
}

export function parseArgs(args) {
  const [command, ...rest] = args;
  if (!['list', 'baseline', 'evaluate'].includes(command)) throw new Error('Usage: arena.mjs list | baseline [--report PATH] | evaluate --candidate DIRECTORY [--task ID] [--report PATH] [--timeout-ms N]');
  const options = { command, timeoutMs: 10000 };
  for (let index = 0; index < rest.length; index += 2) {
    const key = rest[index];
    const value = rest[index + 1];
    if (!['--candidate', '--report', '--task', '--timeout-ms'].includes(key) || !value || value.startsWith('--')) throw new Error(`Invalid option: ${key}`);
    const field = { '--candidate': 'candidate', '--report': 'report', '--task': 'task', '--timeout-ms': 'timeoutMs' }[key];
    if (field !== 'timeoutMs' && options[field]) throw new Error(`Repeated option: ${key}`);
    options[field] = field === 'timeoutMs' ? Number(value) : value;
  }
  if (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs < 100 || options.timeoutMs > 60000) throw new Error('Timeout must be an integer from 100 to 60000 milliseconds');
  if ((command === 'evaluate') !== Boolean(options.candidate)) throw new Error('--candidate is required only for evaluate');
  if (options.task) relativePath(options.task);
  return options;
}

export async function main(args = process.argv.slice(2)) {
  if (Number(process.versions.node.split('.')[0]) < 20) throw new Error('Node.js 20 or newer is required');
  const options = parseArgs(args);
  const start = performance.now();
  const startedAt = new Date().toISOString();
  const runnerSha256 = sha(await fs.readFile(fileURLToPath(import.meta.url)));
  const suite = await loadSuite();
  const tasks = options.task ? suite.tasks.filter(task => task.id === options.task) : suite.tasks;
  if (!tasks.length) throw new Error(`Unknown task: ${options.task}`);
  if (options.command === 'list') {
    console.log(JSON.stringify({ suiteDigest: suite.digest, tasks: tasks.map(({ files, sourcePath, testPath, ...metadata }) => metadata) }, null, 2));
    return 0;
  }
  const candidate = await loadCandidate(options.candidate, suite.tasks);
  const versions = await toolchain(tasks);
  const results = [];
  for (const task of tasks) results.push(await evaluateTask(task, candidate, options));
  const currentSuite = await loadSuite();
  if (currentSuite.digest !== suite.digest) throw new Error('Trusted task suite changed during execution; discard this run');
  if (sha(await fs.readFile(fileURLToPath(import.meta.url))) !== runnerSha256) throw new Error('Runner changed during execution; discard this run');
  const report = {
    schemaVersion: 1, mode: options.command, startedAt, completedAt: new Date().toISOString(),
    durationMs: elapsed(start), suiteDigest: suite.digest, toolchain: versions,
    runnerSha256,
    candidate: options.candidate ? {
      path: path.relative(ROOT, path.resolve(options.candidate)).split(path.sep).join('/'),
      digest: digestEntries([...candidate].map(([name, bytes]) => [name, sha(bytes)])),
      files: Object.fromEntries([...candidate].map(([name, bytes]) => [name, sha(bytes)])),
    } : null,
    disclosure: 'Local compilation and test timings only. No model requests, token usage or cost are measured. This runner is not a security sandbox.',
    tasks: results,
    summary: {
      total: results.length, passed: results.filter(task => task.status === 'pass').length,
      failed: results.filter(task => task.status === 'fail').length, errors: results.filter(task => task.status === 'error').length,
      expectedBaselineFailures: results.filter(task => task.expectedFailureObserved).length,
    },
  };
  if (options.report) {
    await rejectSymlinks(options.report);
    const target = path.resolve(options.report);
    if (target.startsWith(path.join(ROOT, 'tasks') + path.sep) || target.startsWith(path.join(ROOT, 'scripts') + path.sep)) throw new Error('Reports cannot overwrite trusted tasks or runner scripts');
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify({ report: options.report, suiteDigest: report.suiteDigest, ...report.summary }));
  } else console.log(JSON.stringify(report, null, 2));
  if (report.summary.errors) return 2;
  return options.command === 'baseline' ? Number(report.summary.expectedBaselineFailures !== tasks.length) : Number(report.summary.passed !== tasks.length);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(code => { process.exitCode = code; }).catch(error => {
    console.error(`ARENA ERROR: ${error.message}`);
    process.exitCode = 2;
  });
}
