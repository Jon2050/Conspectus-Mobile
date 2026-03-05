import fs from 'node:fs';
import path from 'node:path';

function parseArgs(argv) {
  let title = 'Test Report';
  const files = [];

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--title' && index + 1 < argv.length) {
      title = argv[index + 1];
      index += 1;
      continue;
    }

    if (token === '--files') {
      for (let fileIndex = index + 1; fileIndex < argv.length; fileIndex += 1) {
        files.push(argv[fileIndex]);
      }
      break;
    }
  }

  if (files.length === 0) {
    throw new Error(
      'Missing --files arguments. Example: --files reports/vitest/junit-app.xml reports/vitest/junit-scripts.xml',
    );
  }

  return { title, files };
}

function decodeXmlEntities(value) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function readAttribute(attributeBlock, attributeName) {
  const escapedAttributeName = attributeName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`${escapedAttributeName}="([^"]*)"`, 'i');
  const match = attributeBlock.match(regex);
  if (!match) {
    return '';
  }

  return decodeXmlEntities(match[1]);
}

function detectStatus(testcaseBody) {
  if (/<failure\b|<error\b/i.test(testcaseBody)) {
    return 'failed';
  }

  if (/<skipped\b/i.test(testcaseBody)) {
    return 'skipped';
  }

  return 'passed';
}

function parseDurationMilliseconds(durationSecondsValue) {
  if (!durationSecondsValue) {
    return null;
  }

  const seconds = Number.parseFloat(durationSecondsValue);
  if (!Number.isFinite(seconds) || seconds < 0) {
    return null;
  }

  return Math.round(seconds * 1000);
}

function parseJunitFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {
      filePath,
      missing: true,
      testCases: [],
    };
  }

  const xml = fs.readFileSync(filePath, 'utf8');
  const testcaseRegex = /<testcase\b([^>]*?)(?:\/>|>([\s\S]*?)<\/testcase>)/gi;
  const testCases = [];

  for (const match of xml.matchAll(testcaseRegex)) {
    const attributeBlock = match[1] ?? '';
    const testcaseBody = match[2] ?? '';
    const suiteName = readAttribute(attributeBlock, 'classname');
    const testName = readAttribute(attributeBlock, 'name');
    const durationSeconds = readAttribute(attributeBlock, 'time');
    const status = detectStatus(testcaseBody);
    const durationMilliseconds = parseDurationMilliseconds(durationSeconds);

    testCases.push({
      filePath,
      suiteName,
      testName,
      durationMilliseconds,
      status,
    });
  }

  return {
    filePath,
    missing: false,
    testCases,
  };
}

function statusIcon(status) {
  if (status === 'passed') {
    return 'PASS';
  }

  if (status === 'skipped') {
    return 'SKIP';
  }

  return 'FAIL';
}

function countByStatus(testCases, status) {
  return testCases.filter((testCase) => testCase.status === status).length;
}

function statusPriority(status) {
  if (status === 'failed') {
    return 0;
  }

  if (status === 'skipped') {
    return 1;
  }

  return 2;
}

function sortTestCasesForDisplay(testCases) {
  return testCases
    .map((testCase, index) => ({ testCase, index }))
    .sort((left, right) => {
      const statusDelta =
        statusPriority(left.testCase.status) - statusPriority(right.testCase.status);
      if (statusDelta !== 0) {
        return statusDelta;
      }

      return left.index - right.index;
    })
    .map((entry) => entry.testCase);
}

function toMarkdownTableRows(testCases) {
  return testCases
    .map((testCase) => {
      const suiteDisplay = testCase.suiteName || '(no suite)';
      const testDisplay = testCase.testName || '(unnamed testcase)';
      const durationDisplay =
        testCase.durationMilliseconds === null ? '-' : `${testCase.durationMilliseconds} ms`;
      const fileDisplay = path.relative(process.cwd(), testCase.filePath);
      return `| ${statusIcon(testCase.status)} | ${suiteDisplay} | ${testDisplay} | ${durationDisplay} | ${fileDisplay} |`;
    })
    .join('\n');
}

function buildSummaryMarkdown(title, parsedFiles) {
  const testCases = parsedFiles.flatMap((parsedFile) => parsedFile.testCases);
  const missingFiles = parsedFiles.filter((parsedFile) => parsedFile.missing);
  const totalCount = testCases.length;
  const passedCount = countByStatus(testCases, 'passed');
  const failedCount = countByStatus(testCases, 'failed');
  const skippedCount = countByStatus(testCases, 'skipped');
  const parsedCount = parsedFiles.length - missingFiles.length;
  const sortedTestCases = sortTestCasesForDisplay(testCases);

  const lines = [];
  lines.push(`## ${title}`);
  lines.push('');
  lines.push(`- Parsed report files: ${parsedCount}/${parsedFiles.length}`);
  lines.push(
    `- Totals: ${totalCount} tests | ${passedCount} passed | ${failedCount} failed | ${skippedCount} skipped`,
  );

  if (missingFiles.length > 0) {
    lines.push(
      `- Missing report files: ${missingFiles.map((file) => `\`${file.filePath}\``).join(', ')}`,
    );
  }

  lines.push('');

  if (totalCount === 0) {
    lines.push('No test cases found in the provided JUnit report files.');
    lines.push('');
    return lines.join('\n');
  }

  lines.push('| Status | Suite | Test Case | Duration (ms) | Report File |');
  lines.push('| --- | --- | --- | ---: | --- |');
  lines.push(toMarkdownTableRows(sortedTestCases));
  lines.push('');

  return lines.join('\n');
}

function publishSummary(markdown) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (summaryPath) {
    fs.appendFileSync(summaryPath, `${markdown}\n`, 'utf8');
    return;
  }

  // Fallback for local script execution.
  console.log(markdown);
}

function main() {
  const { title, files } = parseArgs(process.argv.slice(2));
  const parsedFiles = files.map((filePath) => parseJunitFile(filePath));
  const markdown = buildSummaryMarkdown(title, parsedFiles);
  publishSummary(markdown);
}

main();
