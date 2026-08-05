(function exposeFilters(root, factory) {
  const filters = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = filters;
  } else {
    root.GitHubPrFocusFilters = filters;
  }
})(typeof globalThis === "undefined" ? this : globalThis, function createFilters() {
  "use strict";

  const TEST_DIRECTORIES = new Set([
    "__snapshots__",
    "__tests__",
    "cypress",
    "e2e",
    "integration-tests",
    "integration_tests",
    "spec",
    "specs",
    "test",
    "test-data",
    "testdata",
    "tests",
  ]);

  const TEST_CONFIG_PATTERN = /^(?:conftest\.py|pytest\.ini|(?:jest|vitest|playwright|cypress)\.config\.[^.]+)$/i;
  const TEST_FILE_PATTERN = /(?:^test_[^/]+\.(?:py|rb)$|[^/]+_test\.(?:go|py|rb|rs)$|[^/]+\.(?:test|tests|spec)\.[^/]+$|[^/]+\.(?:snap|golden)$)/i;
  const DOCUMENTATION_DIRECTORIES = new Set(["doc", "docs", "documentation"]);

  function normalizeFilePath(filePath) {
    if (typeof filePath !== "string") return "";

    const withoutQuery = filePath
      .split(/[?#]/, 1)[0]
      .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "");
    try {
      return decodeURIComponent(withoutQuery).replace(/^\/+|\/+$/g, "");
    } catch (_error) {
      return withoutQuery.replace(/^\/+|\/+$/g, "");
    }
  }

  function isTestFile(filePath) {
    const normalized = normalizeFilePath(filePath).toLowerCase();
    if (!normalized) return false;

    const segments = normalized.split("/");
    const fileName = segments.at(-1);
    const directories = segments.slice(0, -1);

    return (
      directories.some((directory, index) => {
        if (!TEST_DIRECTORIES.has(directory)) return false;
        if (
          (directory === "spec" || directory === "specs") &&
          directories.slice(0, index).some((part) => DOCUMENTATION_DIRECTORIES.has(part))
        ) {
          return false;
        }
        return true;
      }) ||
      TEST_CONFIG_PATTERN.test(fileName) ||
      TEST_FILE_PATTERN.test(fileName)
    );
  }

  return { isTestFile, normalizeFilePath };
});
