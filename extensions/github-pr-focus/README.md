# GitHub PR Focus

A small Chrome extension that adds two toggles to the diff settings menu on a
GitHub pull request's **Files changed** page:

- **Hide test files** hides common test paths and filenames from both the file
  tree and the diff pane.
- **Hide code comments** hides comment-only source lines using GitHub's syntax
  highlighting, while retaining lines that contain code plus a trailing comment.

Both preferences are stored with Chrome sync and continue to work as GitHub
loads more files or navigates without a full page refresh.

The extension supports both GitHub's current `/changes` interface and the
legacy `/files` interface.

## Install

1. Open `chrome://extensions` in Chrome.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this `github-pr-focus` directory.
5. Open a pull request, choose **Files changed**, and open the diff settings
   gear menu.

Reload an already-open GitHub tab once after installing the extension.

## Test-file detection

The extension recognizes common conventions including `tests/`, `test/`,
`__tests__/`, `spec/`, `e2e/`, Cypress, `*_test.go`, `test_*.py`,
`*.test.tsx`, `*.spec.js`, snapshots, and popular test-runner config files.

## Development

The extension has no runtime dependencies or build step. To run its tests:

```bash
npm install
npm test
```
