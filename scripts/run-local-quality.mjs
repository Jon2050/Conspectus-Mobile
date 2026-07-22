#!/usr/bin/env node
// Runs independent local quality checks concurrently before the build-dependent bundle gate.
import { spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';

const parallelChecks = ['format', 'lint', 'typecheck', 'check:dead-code', 'test'];
const serialChecks = ['build', 'check:bundle-size'];
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const runNpmScript = (scriptName) =>
  new Promise((resolve) => {
    const startedAt = performance.now();
    const child = spawn(npmCommand, ['run', scriptName], {
      shell: process.platform === 'win32',
      stdio: 'inherit',
    });

    child.on('error', (error) => {
      resolve({ durationSeconds: (performance.now() - startedAt) / 1_000, error, scriptName });
    });
    child.on('exit', (code, signal) => {
      resolve({
        code: code ?? 1,
        durationSeconds: (performance.now() - startedAt) / 1_000,
        scriptName,
        signal,
      });
    });
  });

const reportResult = (result) => {
  const duration = result.durationSeconds.toFixed(2);
  if (result.error) {
    console.error(`[local-quality] ${result.scriptName} failed to start after ${duration}s.`);
    console.error(result.error);
    return false;
  }
  if (result.code !== 0) {
    console.error(
      `[local-quality] ${result.scriptName} failed after ${duration}s` +
        (result.signal ? ` (signal ${result.signal})` : ` (exit ${result.code})`) +
        '.',
    );
    return false;
  }

  console.log(`[local-quality] ${result.scriptName} passed in ${duration}s.`);
  return true;
};

const startedAt = performance.now();
console.log(`[local-quality] Running in parallel: ${parallelChecks.join(', ')}`);
const parallelResults = await Promise.all(parallelChecks.map(runNpmScript));
const parallelPassed = parallelResults.map(reportResult).every(Boolean);

if (!parallelPassed) {
  console.error('[local-quality] Build skipped because at least one prerequisite check failed.');
  process.exitCode = 1;
} else {
  for (const scriptName of serialChecks) {
    const result = await runNpmScript(scriptName);
    if (!reportResult(result)) {
      process.exitCode = 1;
      break;
    }
  }
}

const totalSeconds = ((performance.now() - startedAt) / 1_000).toFixed(2);
console.log(`[local-quality] Completed in ${totalSeconds}s.`);
