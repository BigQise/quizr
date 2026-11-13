// Claude Code PostToolUse hook (Edit|Write).
// Formats the file that was just changed, and reports any lint errors that
// could not be fixed automatically so they get dealt with straight away.
//
// Input: the hook's JSON on stdin. Exit 2 sends stderr back to Claude.

import { existsSync } from 'node:fs';
import { extname, relative, resolve, sep } from 'node:path';

const LINTED = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const FORMATTED = new Set(['.json', '.md', '.yml', '.yaml', '.css']);
const SKIPPED_DIRS = ['node_modules', 'dist', '.expo', 'android', 'ios', 'assets'];

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

let filePath;
try {
  filePath = JSON.parse(await readStdin())?.tool_input?.file_path;
} catch {
  process.exit(0);
}
if (typeof filePath !== 'string' || !existsSync(filePath)) process.exit(0);

const root = process.cwd();
const rel = relative(root, resolve(filePath));
const outsideProject = rel.startsWith('..') || resolve(rel) === rel;
const parts = rel.split(sep);
if (outsideProject || parts.some((part) => SKIPPED_DIRS.includes(part))) process.exit(0);
if (rel.startsWith(['src', 'data', 'migrations'].join(sep))) process.exit(0);

const extension = extname(filePath);

try {
  if (LINTED.has(extension)) {
    // ESLint runs Prettier as a rule, so one pass both formats and lints.
    const { ESLint } = await import('eslint');
    const eslint = new ESLint({ fix: true, cwd: root });
    const results = await eslint.lintFiles([filePath]);
    await ESLint.outputFixes(results);

    const problems = results.flatMap((result) =>
      result.messages
        .filter((message) => message.severity === 2)
        .map(
          (message) =>
            `${rel}:${message.line}:${message.column} ${message.message} (${message.ruleId})`,
        ),
    );
    if (problems.length > 0) {
      console.error(`Lint errors in the file you just changed:\n${problems.join('\n')}`);
      process.exit(2);
    }
  } else if (FORMATTED.has(extension)) {
    const prettier = await import('prettier');
    const { readFile, writeFile } = await import('node:fs/promises');
    const info = await prettier.getFileInfo(filePath, {
      ignorePath: resolve(root, '.prettierignore'),
    });
    if (!info.ignored && info.inferredParser) {
      const source = await readFile(filePath, 'utf8');
      const options = (await prettier.resolveConfig(filePath)) ?? {};
      const formatted = await prettier.format(source, { ...options, filepath: filePath });
      if (formatted !== source) await writeFile(filePath, formatted);
    }
  }
} catch (error) {
  // A broken formatter must never block work; say what happened and move on.
  console.error(`format-changed hook skipped ${rel}: ${error?.message ?? error}`);
}

process.exit(0);
