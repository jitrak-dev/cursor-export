import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { copyAgentTranscripts } from '../src/agentTranscriptCopy';

describe('copyAgentTranscripts', () => {
  let tmpDir: string;
  let workspaceDir: string;
  let outputDir: string;
  let agentTranscriptsDir: string;
  let plansDir: string;
  let originalHome: string | undefined;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-transcript-test-'));
    workspaceDir = path.join(tmpDir, 'workspace');
    outputDir = path.join(tmpDir, 'output');
    
    // Mock HOME environment
    originalHome = process.env.HOME;
    process.env.HOME = tmpDir;
    
    // Create mock agent transcripts directory structure
    // Match the corrected algorithm: /path/to/workspace -> path-to-workspace
    const normalizedWorkspace = path.resolve(workspaceDir);
    const workspaceSlug = normalizedWorkspace
      .replace(/^[/\\]/, '') // Remove leading / or \
      .replace(/[/\\]/g, '-'); // Replace path separators with hyphens
    
    agentTranscriptsDir = path.join(tmpDir, '.cursor', 'projects', workspaceSlug, 'agent-transcripts');
    plansDir = path.join(tmpDir, '.cursor', 'plans');
    
    fs.mkdirSync(workspaceDir, { recursive: true });
    fs.mkdirSync(outputDir, { recursive: true });
    fs.mkdirSync(agentTranscriptsDir, { recursive: true });
    fs.mkdirSync(plansDir, { recursive: true });
  });

  afterEach(() => {
    // Restore original HOME environment
    if (originalHome) {
      process.env.HOME = originalHome;
    } else {
      delete process.env.HOME;
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should copy agent transcript files when they exist', () => {
    // Create mock transcript directory and file
    const transcriptId = 'test-uuid-123';
    const transcriptDir = path.join(agentTranscriptsDir, transcriptId);
    fs.mkdirSync(transcriptDir);
    
    const transcriptContent = '{"type":"conversation","messages":[]}\n';
    const transcriptFile = path.join(transcriptDir, `${transcriptId}.jsonl`);
    fs.writeFileSync(transcriptFile, transcriptContent);

    // Run the copy function
    const result = copyAgentTranscripts({
      workspaceFolderPath: workspaceDir,
      outputDirectory: outputDir,
    });

    // Verify results
    expect(result.copied).toHaveLength(1);
    expect(result.copied[0].sourceRelativePath).toBe(`${transcriptId}/${transcriptId}.jsonl`);
    expect(result.copied[0].destinationRelativePath).toBe(`agent-transcripts/${transcriptId}/${transcriptId}.jsonl`);
    expect(result.skipped).toHaveLength(0);
    expect(result.plans.copied).toHaveLength(0);
    expect(result.plans.skipped).toHaveLength(0);

    // Verify file was actually copied
    const copiedFile = path.join(outputDir, 'agent-transcripts', transcriptId, `${transcriptId}.jsonl`);
    expect(fs.existsSync(copiedFile)).toBe(true);
    expect(fs.readFileSync(copiedFile, 'utf8')).toBe(transcriptContent);
  });

  it('should handle missing agent transcripts directory gracefully', () => {
    // Remove the agent transcripts directory
    fs.rmSync(agentTranscriptsDir, { recursive: true, force: true });

    const result = copyAgentTranscripts({
      workspaceFolderPath: workspaceDir,
      outputDirectory: outputDir,
    });

    expect(result.copied).toHaveLength(0);
    expect(result.skipped).toHaveLength(0);
    expect(result.plans.copied).toHaveLength(0);
    expect(result.plans.skipped).toHaveLength(0);
  });

  it('should skip non-regular files', () => {
    const transcriptId = 'test-uuid-456';
    const transcriptDir = path.join(agentTranscriptsDir, transcriptId);
    fs.mkdirSync(transcriptDir);
    
    // Create a subdirectory (not a regular file)
    const subDir = path.join(transcriptDir, 'subdir');
    fs.mkdirSync(subDir);

    const result = copyAgentTranscripts({
      workspaceFolderPath: workspaceDir,
      outputDirectory: outputDir,
    });

    expect(result.copied).toHaveLength(0);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].reason).toBe('Not a regular file');
    expect(result.plans.copied).toHaveLength(0);
    expect(result.plans.skipped).toHaveLength(0);
  });

  it('should copy plan files when they exist', () => {
    // Create mock plan file
    const planContent = '# Test Plan\n\nThis is a test plan.';
    const planFile = path.join(plansDir, 'test-plan-123.plan.md');
    fs.writeFileSync(planFile, planContent);

    // Run the copy function
    const result = copyAgentTranscripts({
      workspaceFolderPath: workspaceDir,
      outputDirectory: outputDir,
    });

    // Verify plan file was copied
    expect(result.plans.copied).toHaveLength(1);
    expect(result.plans.copied[0].sourceRelativePath).toBe('test-plan-123.plan.md');
    expect(result.plans.copied[0].destinationRelativePath).toBe('plans/test-plan-123.plan.md');
    expect(result.plans.skipped).toHaveLength(0);

    // Verify file was actually copied
    const copiedFile = path.join(outputDir, 'plans', 'test-plan-123.plan.md');
    expect(fs.existsSync(copiedFile)).toBe(true);
    expect(fs.readFileSync(copiedFile, 'utf8')).toBe(planContent);
  });
});