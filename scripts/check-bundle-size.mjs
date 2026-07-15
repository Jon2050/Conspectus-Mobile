#!/usr/bin/env node
// Enforces aggregate raw and gzip budgets for every JavaScript and CSS file in a build.
import fs from 'node:fs';
import path from 'node:path';
import { constants as zlibConstants, gzipSync } from 'node:zlib';

const DEFAULT_DIST_PATH = 'dist';
const DEFAULT_BUDGET_CONFIG_PATH = 'bundle-size-budgets.json';
const OPTIMIZATION_GUIDE = 'docs/CI-CD-Pipelines.md#bundle-size-budgets';

const ASSET_CLASSES = {
  javascript: {
    extension: '.js',
    label: 'JavaScript',
  },
  css: {
    extension: '.css',
    label: 'CSS',
  },
};

const parseArgs = (argv) => {
  const args = {
    dist: DEFAULT_DIST_PATH,
    budgetConfig: DEFAULT_BUDGET_CONFIG_PATH,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (current === '--dist') {
      args.dist = argv[index + 1] ?? '';
      index += 1;
      continue;
    }

    if (current === '--budget-config') {
      args.budgetConfig = argv[index + 1] ?? '';
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${current}`);
  }

  if (!args.dist) {
    throw new Error('The --dist argument requires a directory path.');
  }

  if (!args.budgetConfig) {
    throw new Error('The --budget-config argument requires a file path.');
  }

  return args;
};

const readBudgetConfig = (configPath) => {
  if (!fs.existsSync(configPath)) {
    throw new Error(`Bundle budget config does not exist: ${configPath}`);
  }

  let config;
  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Bundle budget config is not valid JSON: ${message}`, { cause: error });
  }

  for (const assetClass of Object.keys(ASSET_CLASSES)) {
    const budget = config?.budgets?.[assetClass];
    for (const metric of ['rawBytes', 'gzipBytes']) {
      if (!Number.isInteger(budget?.[metric]) || budget[metric] <= 0) {
        throw new Error(
          `Bundle budget config must define budgets.${assetClass}.${metric} as a positive integer.`,
        );
      }
    }
  }

  return config.budgets;
};

const collectFiles = (directoryPath) => {
  const files = [];

  for (const entry of fs.readdirSync(directoryPath, { withFileTypes: true })) {
    const absolutePath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(absolutePath));
      continue;
    }

    if (entry.isFile()) {
      files.push(absolutePath);
    }
  }

  return files;
};

const toRelativeDisplayPath = (distPath, filePath) =>
  path.relative(distPath, filePath).split(path.sep).join('/');

const measureFiles = (distPath, extension) =>
  collectFiles(distPath)
    .filter((filePath) => path.extname(filePath).toLowerCase() === extension)
    .sort((left, right) => left.localeCompare(right))
    .map((filePath) => {
      const content = fs.readFileSync(filePath);
      return {
        path: toRelativeDisplayPath(distPath, filePath),
        rawBytes: content.byteLength,
        gzipBytes: gzipSync(content, { level: zlibConstants.Z_BEST_COMPRESSION }).byteLength,
      };
    });

const sumMetric = (files, metric) => files.reduce((total, file) => total + file[metric], 0);

const formatBytes = (bytes) =>
  `${bytes.toLocaleString('en-US')} B (${(bytes / 1024).toFixed(2)} KiB)`;

const formatPercent = (value) => `${value.toFixed(1)}%`;

const reportMeasurement = (label, files, totals, budget) => {
  console.log(`[bundle-size] ${label}: ${files.length} file(s)`);
  for (const file of files) {
    console.log(
      `  ${file.path}: ${formatBytes(file.rawBytes)} raw, ${formatBytes(file.gzipBytes)} gzip`,
    );
  }
  console.log(
    `  Total: ${formatBytes(totals.rawBytes)} raw / ${formatBytes(totals.gzipBytes)} gzip`,
  );
  console.log(
    `  Budget: ${formatBytes(budget.rawBytes)} raw / ${formatBytes(budget.gzipBytes)} gzip`,
  );
};

const collectViolations = (label, files, totals, budget) => {
  if (files.length === 0) {
    return [`${label} assets are missing from the build output.`];
  }

  const violations = [];
  for (const [metric, metricLabel] of [
    ['rawBytes', 'raw'],
    ['gzipBytes', 'gzip'],
  ]) {
    const actual = totals[metric];
    const maximum = budget[metric];
    if (actual <= maximum) {
      continue;
    }

    const excess = actual - maximum;
    violations.push(
      `${label} ${metricLabel} budget exceeded: actual ${formatBytes(actual)}, budget ${formatBytes(maximum)}, excess ${formatBytes(excess)} (${formatPercent((excess / maximum) * 100)}).`,
    );
  }

  return violations;
};

const main = () => {
  const args = parseArgs(process.argv.slice(2));
  const distPath = path.resolve(process.cwd(), args.dist);
  const configPath = path.resolve(process.cwd(), args.budgetConfig);

  if (!fs.existsSync(distPath) || !fs.statSync(distPath).isDirectory()) {
    throw new Error(`Build output directory does not exist: ${distPath}`);
  }

  const budgets = readBudgetConfig(configPath);
  const violations = [];

  for (const [assetClass, definition] of Object.entries(ASSET_CLASSES)) {
    const files = measureFiles(distPath, definition.extension);
    const totals = {
      rawBytes: sumMetric(files, 'rawBytes'),
      gzipBytes: sumMetric(files, 'gzipBytes'),
    };

    reportMeasurement(definition.label, files, totals, budgets[assetClass]);
    violations.push(...collectViolations(definition.label, files, totals, budgets[assetClass]));
  }

  if (violations.length > 0) {
    console.error('[bundle-size] Bundle size check failed:');
    for (const violation of violations) {
      console.error(`  - ${violation}`);
    }
    console.error(`[bundle-size] Optimization guidance: ${OPTIMIZATION_GUIDE}`);
    process.exitCode = 1;
    return;
  }

  console.log('[bundle-size] All JavaScript and CSS bundles are within budget.');
};

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[bundle-size] ${message}`);
  process.exitCode = 1;
}
