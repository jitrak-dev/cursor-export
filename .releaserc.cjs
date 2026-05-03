/**
 * @see https://github.com/semantic-release/semantic-release/blob/master/docs/usage/configuration.md
 */
module.exports = {
  branches: ['main'],
  plugins: [
    '@semantic-release/commit-analyzer',
    [
      '@semantic-release/release-notes-generator',
      {
        writerOpts: {
          transform(commit) {
            if (!commit.body) {
              return commit;
            }
            const cleaned = commit.body
              .split('\n')
              .filter((line) => !/^Co-authored-by:/i.test(line.trim()))
              .join('\n')
              .trim();
            if (cleaned === commit.body) {
              return commit;
            }
            return { ...commit, body: cleaned || undefined };
          },
        },
      },
    ],
    '@semantic-release/changelog',
    [
      '@semantic-release/npm',
      {
        npmPublish: false,
        pkgRoot: 'packages/vscode-ext',
      },
    ],
    [
      '@semantic-release/github',
      {
        successComment: false,
        releasedLabels: false,
        failComment: false,
        failTitle: false,
      },
    ],
    [
      '@semantic-release/git',
      {
        assets: ['CHANGELOG.md', 'packages/vscode-ext/package.json'],
        message:
          'chore(release): ${nextRelease.version}\n\n${nextRelease.notes}',
      },
    ],
  ],
};
