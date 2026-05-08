import * as fs from 'node:fs';
import * as path from 'node:path';

import { type DiagnosticFn } from './cursorStorageSchema';

export interface AgentTranscriptCopyOptions {
  workspaceFolderPath: string;
  outputDirectory: string;
  onDiagnostic?: DiagnosticFn;
}

export interface CopiedAgentFile {
  sourceRelativePath: string;
  destinationRelativePath: string;
  size: number;
}

export interface CopiedPlanFile {
  sourceRelativePath: string;
  destinationRelativePath: string;
  size: number;
}

export interface AgentTranscriptCopyResult {
  copied: CopiedAgentFile[];
  skipped: Array<{ relativePath: string; reason: string }>;
  plans: {
    copied: CopiedPlanFile[];
    skipped: Array<{ relativePath: string; reason: string }>;
  };
}

function noopDiagnostic(): void {
  // no-op
}

function report(
  onDiagnostic: DiagnosticFn | undefined,
  level: 'info' | 'warn',
  message: string,
): void {
  (onDiagnostic ?? noopDiagnostic)(level, message);
}

/**
 * Resolve the agent transcripts directory for this workspace.
 * Based on the pattern: ~/.cursor/projects/<workspace-slug>/agent-transcripts/
 */
function resolveAgentTranscriptsDirectory(
  workspaceFolderPath: string,
): string | undefined {
  const home = getHomeDirectory();
  if (!home) {
    return undefined;
  }

  // Create workspace slug from folder path - match Cursor's logic exactly
  // Cursor converts absolute paths like /home/user/project -> home-user-project
  const normalizedPath = path.resolve(workspaceFolderPath);
  const workspaceSlug = normalizedPath
    .replace(/^[/\\]/, '') // Remove leading / or \
    .replace(/[/\\]/g, '-'); // Replace path separators with hyphens

  return path.join(
    home,
    '.cursor',
    'projects',
    workspaceSlug,
    'agent-transcripts',
  );
}

/**
 * Get the user's home directory, supporting both Unix and Windows
 */
function getHomeDirectory(): string | undefined {
  return process.env.HOME || process.env.USERPROFILE;
}

/**
 * Resolve the plans directory (~/.cursor/plans/)
 */
function resolvePlansDirectory(): string | undefined {
  const home = getHomeDirectory();
  if (!home) {
    return undefined;
  }

  return path.join(home, '.cursor', 'plans');
}

/**
 * Copy plan files (.plan.md) to the workspace output directory.
 * Creates a plans/ subdirectory in the output directory.
 */
function copyPlanFiles(
  outputDirectory: string,
  onDiagnostic?: DiagnosticFn,
): {
  copied: CopiedPlanFile[];
  skipped: Array<{ relativePath: string; reason: string }>;
} {
  const plansDir = resolvePlansDirectory();
  if (!plansDir) {
    report(
      onDiagnostic,
      'warn',
      'Cannot resolve plans directory (HOME env var missing)',
    );
    return { copied: [], skipped: [] };
  }

  if (!fs.existsSync(plansDir)) {
    report(onDiagnostic, 'info', `No plans directory found at: ${plansDir}`);
    return { copied: [], skipped: [] };
  }

  const outputPlansDir = path.join(outputDirectory, 'plans');
  const copied: CopiedPlanFile[] = [];
  const skipped: Array<{ relativePath: string; reason: string }> = [];

  try {
    // Ensure output directory exists
    fs.mkdirSync(outputPlansDir, { recursive: true });

    // Scan for .plan.md files
    const entries = fs.readdirSync(plansDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.plan.md')) {
        continue;
      }

      const sourcePath = path.join(plansDir, entry.name);
      const destPath = path.join(outputPlansDir, entry.name);
      const sourceRelativePath = entry.name;
      const destRelativePath = path.join('plans', entry.name);

      try {
        const stat = fs.statSync(sourcePath);

        // Copy file with preservation of timestamps
        fs.copyFileSync(sourcePath, destPath);
        fs.utimesSync(destPath, stat.atime, stat.mtime);

        copied.push({
          sourceRelativePath: sourceRelativePath,
          destinationRelativePath: destRelativePath,
          size: stat.size,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        skipped.push({
          relativePath: sourceRelativePath,
          reason: `Copy failed: ${msg}`,
        });
      }
    }

    if (copied.length > 0) {
      report(
        onDiagnostic,
        'info',
        `Copied ${copied.length} plan file(s) to ${outputPlansDir}`,
      );
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    report(onDiagnostic, 'warn', `Failed to copy plan files: ${msg}`);
  }

  return { copied, skipped };
}

/**
 * Copy agent transcript files (.jsonl) and plan files (.plan.md) to the workspace output directory.
 * Creates agent-transcripts/ and plans/ subdirectories in the output directory.
 */
export function copyAgentTranscripts(
  options: AgentTranscriptCopyOptions,
): AgentTranscriptCopyResult {
  const { workspaceFolderPath, outputDirectory, onDiagnostic } = options;

  const agentTranscriptsDir =
    resolveAgentTranscriptsDirectory(workspaceFolderPath);
  const copied: CopiedAgentFile[] = [];
  const skipped: Array<{ relativePath: string; reason: string }> = [];

  if (!agentTranscriptsDir) {
    report(
      onDiagnostic,
      'warn',
      'Cannot resolve agent transcripts directory (HOME env var missing)',
    );
  } else if (!fs.existsSync(agentTranscriptsDir)) {
    report(
      onDiagnostic,
      'info',
      `No agent transcripts directory found at: ${agentTranscriptsDir}`,
    );
  } else {
    const outputAgentDir = path.join(outputDirectory, 'agent-transcripts');

    try {
      // Ensure output directory exists
      fs.mkdirSync(outputAgentDir, { recursive: true });

      // Scan for transcript directories (UUID-named folders)
      const entries = fs.readdirSync(agentTranscriptsDir, {
        withFileTypes: true,
      });

      for (const entry of entries) {
        if (!entry.isDirectory()) {
          continue;
        }

        const transcriptDir = path.join(agentTranscriptsDir, entry.name);
        const outputTranscriptDir = path.join(outputAgentDir, entry.name);

        try {
          // Create output subdirectory
          fs.mkdirSync(outputTranscriptDir, { recursive: true });

          // Copy all files from this transcript directory
          const files = fs.readdirSync(transcriptDir);

          for (const file of files) {
            const sourcePath = path.join(transcriptDir, file);
            const destPath = path.join(outputTranscriptDir, file);
            const sourceRelativePath = path.join(entry.name, file);
            const destRelativePath = path.join(
              'agent-transcripts',
              entry.name,
              file,
            );

            try {
              const stat = fs.statSync(sourcePath);
              if (!stat.isFile()) {
                skipped.push({
                  relativePath: sourceRelativePath,
                  reason: 'Not a regular file',
                });
                continue;
              }

              // Copy file with preservation of timestamps
              fs.copyFileSync(sourcePath, destPath);
              fs.utimesSync(destPath, stat.atime, stat.mtime);

              copied.push({
                sourceRelativePath: sourceRelativePath,
                destinationRelativePath: destRelativePath,
                size: stat.size,
              });
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              skipped.push({
                relativePath: sourceRelativePath,
                reason: `Copy failed: ${msg}`,
              });
            }
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          report(
            onDiagnostic,
            'warn',
            `Failed to process transcript directory ${entry.name}: ${msg}`,
          );
        }
      }

      if (copied.length > 0) {
        report(
          onDiagnostic,
          'info',
          `Copied ${copied.length} agent transcript file(s) to ${outputAgentDir}`,
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      report(onDiagnostic, 'warn', `Failed to copy agent transcripts: ${msg}`);
    }
  }

  // Copy plan files
  const plans = copyPlanFiles(outputDirectory, onDiagnostic);

  return { copied, skipped, plans };
}
