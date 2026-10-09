import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { relativePath, readTree, loadSuite, loadCandidate, runProcess, evaluateTask, parseArgs } from '../arena.mjs';

async function temporary(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'arena-test-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  return directory;
}

async function fixture(t) {
  const root = await temporary(t);
  const directory = path.join(root, 'tasks', 'sample');
  await fs.mkdir(path.join(directory, 'src'), { recursive: true });
  await fs.mkdir(path.join(directory, 'tests'), { recursive: true });
  await fs.writeFile(path.join(directory, 'task.json'), JSON.stringify({
    id: 'sample', title: 'Sample', summary: 'Return one.', language: 'typescript',
    editableFiles: ['src/task.ts'], expectedTests: 1,
  }));
  await fs.writeFile(path.join(directory, 'src/task.ts'), 'export function answer(): number { return 0; }\n');
  await fs.writeFile(path.join(directory, 'tests/task.test.ts'),
    "import assert from 'node:assert/strict';\nimport { answer } from '../src/task';\nassert.equal(answer(), 1);\nconsole.log('ARENA_TESTS_PASSED=1');\n");
  return { root, directory, suite: await loadSuite(root) };
}

test('relative paths reject traversal, absolute paths and Windows separators', () => {
  for (const invalid of ['../x', 'src/../tests/x', '/tmp/x', 'C:/tmp/x', 'src\\x', 'src//x', './src/x', '']) {
    assert.throws(() => relativePath(invalid), /Unsafe/);
  }
  assert.equal(relativePath('sample/src/task.ts'), 'sample/src/task.ts');
});

test('candidate cannot supply tests or unknown task files', async t => {
  const { root, suite } = await fixture(t);
  const candidate = path.join(root, 'candidate');
  await fs.mkdir(path.join(candidate, 'sample', 'tests'), { recursive: true });
  await fs.writeFile(path.join(candidate, 'sample', 'tests', 'task.test.ts'), 'process.exit(0);');
  await assert.rejects(loadCandidate(candidate, suite.tasks), /not editable/);
});

test('candidate symlink and symlinked directory are rejected', async t => {
  const root = await temporary(t);
  await fs.mkdir(path.join(root, 'source'));
  await fs.writeFile(path.join(root, 'outside'), 'private');
  await fs.symlink(path.join(root, 'outside'), path.join(root, 'source', 'link'));
  await assert.rejects(readTree(path.join(root, 'source')), /Symlinks/);
  await fs.symlink(path.join(root, 'source'), path.join(root, 'linked-directory'));
  await assert.rejects(readTree(path.join(root, 'linked-directory')), /Symlinks/);
});

test('suite digest changes when a trusted test changes, snapshot stays frozen', async t => {
  const { root, directory, suite } = await fixture(t);
  const snapshot = suite.tasks[0].files.get('tests/task.test.ts').toString();
  await fs.appendFile(path.join(directory, 'tests/task.test.ts'), '// changed\n');
  const changed = await loadSuite(root);
  assert.notEqual(changed.digest, suite.digest);
  assert.equal(suite.tasks[0].files.get('tests/task.test.ts').toString(), snapshot);
});

test('timeouts terminate a non-completing process', async () => {
  const result = await runProcess(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { timeoutMs: 150 });
  assert.equal(result.timedOut, true);
  assert.notEqual(result.exitCode, 0);
  assert.ok(result.durationMs < 3000);
});

test('captured process output is bounded while streams continue to drain', async () => {
  const result = await runProcess(process.execPath, ['-e', "process.stdout.write('x'.repeat(100000)); process.stderr.write('y'.repeat(100000))"], { outputLimit: 128 });
  assert.equal(result.exitCode, 0);
  assert.equal(result.outputTruncated, true);
  assert.equal(result.stdout.length, 128);
  assert.equal(result.stderr.length, 128);
});

test('candidate subprocess receives no unrelated environment credential', async () => {
  process.env.ARENA_TEST_SECRET = randomUUID();
  try {
    const result = await runProcess(process.execPath, ['-e', "process.stdout.write(process.env.ARENA_TEST_SECRET || 'absent')"]);
    assert.equal(result.stdout, 'absent');
  } finally { delete process.env.ARENA_TEST_SECRET; }
});

test('broken code reaches an assertion; correct overlay passes the original test', async t => {
  const { suite } = await fixture(t);
  const broken = await evaluateTask(suite.tasks[0], new Map());
  assert.equal(broken.compile.exitCode, 0);
  assert.equal(broken.status, 'fail');
  assert.equal(broken.expectedFailureObserved, true);
  const fixed = await evaluateTask(suite.tasks[0], new Map([
    ['sample/src/task.ts', Buffer.from('export function answer(): number { return 1; }\n')],
  ]));
  assert.equal(fixed.status, 'pass');
  assert.equal(fixed.observedTests, 1);
  assert.notEqual(fixed.sourceDigest, broken.sourceDigest);
  assert.equal(fixed.testSha256, broken.testSha256);
  assert.equal(fixed.candidateDiffHashes.length, 1);
});

test('exiting zero before assertions is not a passing task', async t => {
  const { suite } = await fixture(t);
  const result = await evaluateTask(suite.tasks[0], new Map([
    ['sample/src/task.ts', Buffer.from('export function answer(): number { process.exit(0); }\n')],
  ]));
  assert.equal(result.test.exitCode, 0);
  assert.equal(result.status, 'fail');
  assert.equal(result.observedTests, null);
});

test('runtime tampering with the copied trusted test is a runner error', async t => {
  const { suite } = await fixture(t);
  const result = await evaluateTask(suite.tasks[0], new Map([
    ['sample/src/task.ts', Buffer.from("import { writeFileSync } from 'node:fs'; export function answer(): number { writeFileSync('tests/task.test.ts', 'changed'); return 1; }\n")],
  ]));
  assert.equal(result.status, 'error');
  assert.match(result.reason, /Trusted test file was modified/);
});

test('CLI requires an explicit candidate and bounds its timeout', () => {
  assert.throws(() => parseArgs(['evaluate']), /required/);
  assert.throws(() => parseArgs(['baseline', '--candidate', 'x']), /required/);
  assert.throws(() => parseArgs(['evaluate', '--candidate', 'x', '--timeout-ms', '0']), /Timeout/);
  assert.equal(parseArgs(['evaluate', '--candidate', 'x', '--task', 'sample']).task, 'sample');
});
