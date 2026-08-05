(function initializeGitHubPrFocus() {
  "use strict";

  const filters = globalThis.GitHubPrFocusFilters;
  if (!filters) return;

  const STORAGE_KEY = "githubPrFocusSettings";
  const DEFAULT_SETTINGS = Object.freeze({
    hideCodeComments: false,
    hideTests: false,
  });

  const FILE_SELECTOR = [
    ".js-file",
    "[role='region'][id^='diff-']",
    "[data-testid='file-diff']",
    "[data-testid='file-diff-container']",
    "[data-file-path]",
  ].join(",");

  const MENU_SELECTOR = [
    ".Popover-message",
    ".SelectMenu-modal",
    "dialog",
    "[popover]",
    "[role='menu']",
    "[role='dialog']",
    "[data-testid*='diff-settings']",
  ].join(",");

  const SOURCE_DIRECTIVE_PATTERN = /^(?:\/\/\s*(?:go:|nolint\b|lint:|line\b|eslint\b|@ts-)|#\s*(?:noqa\b|type:|pragma:|pylint:|ruff:|fmt:|nosec\b|shellcheck\b)|\/\*\s*(?:eslint|prettier)|<!--\s*(?:eslint|prettier|svelte|vue))/i;

  const state = {
    settings: { ...DEFAULT_SETTINGS },
    scheduled: false,
  };

  const observer = new MutationObserver(scheduleRefresh);

  function isFilesPage() {
    return /^\/[^/]+\/[^/]+\/pull\/\d+\/(?:changes|files)(?:\/|$)/.test(
      location.pathname,
    );
  }

  function setClass(element, className, enabled) {
    if (element.classList.contains(className) === enabled) return;
    element.classList.toggle(className, enabled);
  }

  function readFilePath(file) {
    const directPath =
      file.getAttribute("data-path") || file.getAttribute("data-file-path");
    if (directPath && !directPath.includes("{{")) return directPath;

    const pathElement = file.querySelector(
      "[data-path], [data-file-path], .file-info a[title], " +
        ".js-file-header a[title], h3 a[href^='#diff-'], [data-testid='file-name']",
    );
    if (!pathElement) return "";

    return (
      pathElement.getAttribute("data-path") ||
      pathElement.getAttribute("data-file-path") ||
      pathElement.getAttribute("title") ||
      pathElement.textContent ||
      ""
    ).trim();
  }

  function getFileDiffs() {
    const candidates = [...document.querySelectorAll(FILE_SELECTOR)];
    return candidates.filter(
      (candidate, index) =>
        !candidates.some(
          (other, otherIndex) =>
            otherIndex !== index && other.contains(candidate),
        ),
    );
  }

  function getFileHideTarget(file) {
    if (
      file.matches("[role='region'][id^='diff-']") &&
      file.parentElement?.parentElement?.matches("[data-testid='progressive-diffs-list']")
    ) {
      return file.parentElement;
    }
    return file;
  }

  function normalizeCodeText(text) {
    return text
      .replace(/\u00a0/g, " ")
      .replace(/^[\t ]*[+-]?[\t ]?/, "")
      .trim();
  }

  function isCommentOnlyCell(cell) {
    const commentTokens = [...cell.querySelectorAll(".pl-c")].filter(
      (token) => !token.parentElement?.closest(".pl-c"),
    );
    if (!commentTokens.length) return false;

    const fullText = normalizeCodeText(cell.textContent);
    const commentText = normalizeCodeText(
      commentTokens.map((token) => token.textContent).join(""),
    );
    return (
      Boolean(fullText) &&
      fullText === commentText &&
      !SOURCE_DIRECTIVE_PATTERN.test(commentText)
    );
  }

  function getCodeCommentRows() {
    const rows = new Set(
      [...document.querySelectorAll(".pl-c")]
        .map((token) => token.closest("tr"))
        .filter((row) => row?.closest(FILE_SELECTOR)),
    );

    return [...rows].filter((row) => {
      const codeCells = [...row.querySelectorAll("code.diff-text, .blob-code-inner")].filter(
        (cell) => normalizeCodeText(cell.textContent),
      );
      return codeCells.length > 0 && codeCells.every(isCommentOnlyCell);
    });
  }

  function getTreeFileItems(tree) {
    return [...tree.querySelectorAll("[role='treeitem'][id]")].filter((item) => {
      const ownContent = item.querySelector(":scope > div");
      return Boolean(ownContent?.querySelector("a[href^='#diff-']"));
    });
  }

  function applyFileTreeFilter() {
    const tree = document.querySelector("[role='tree'][aria-label='File Tree']");
    if (!tree) return 0;

    const fileItems = getTreeFileItems(tree);
    let testCount = 0;
    for (const item of fileItems) {
      const isTest = filters.isTestFile(item.id);
      if (isTest) testCount += 1;
      setClass(
        item,
        "ghprf-hidden-tree-item",
        state.settings.hideTests && isTest,
      );
    }

    const folderItems = [...tree.querySelectorAll("[role='treeitem']")].filter((item) =>
      item.querySelector(":scope > [role='group']"),
    );
    for (const folder of folderItems) {
      const descendantFiles = getTreeFileItems(folder);
      const allFilesHidden =
        descendantFiles.length > 0 &&
        descendantFiles.every((item) =>
          item.classList.contains("ghprf-hidden-tree-item"),
        );
      setClass(
        folder,
        "ghprf-hidden-tree-item",
        state.settings.hideTests && allFilesHidden,
      );
    }
    return testCount;
  }

  function applyFilters() {
    let testCount = 0;
    let codeCommentCount = 0;

    for (const file of getFileDiffs()) {
      const isTest = filters.isTestFile(readFilePath(file));
      if (isTest) testCount += 1;
      setClass(
        getFileHideTarget(file),
        "ghprf-hidden-test",
        state.settings.hideTests && isTest,
      );
    }

    testCount = Math.max(testCount, applyFileTreeFilter());

    for (const row of getCodeCommentRows()) {
      codeCommentCount += 1;
      setClass(
        row,
        "ghprf-hidden-code-comment",
        state.settings.hideCodeComments,
      );
    }

    document.documentElement.dataset.ghprfTestCount = String(testCount);
    document.documentElement.dataset.ghprfCodeCommentCount = String(codeCommentCount);
    return { codeCommentCount, testCount };
  }

  function isSettingsMenu(menu) {
    const text = menu.textContent.replace(/\s+/g, " ").trim().toLowerCase();
    return (
      text.includes("unified") &&
      text.includes("split") &&
      (text.includes("hide whitespace") ||
        text.includes("compact line height") ||
        text.includes("diff view"))
    );
  }

  function findSettingsMenus() {
    const matches = [...document.querySelectorAll(MENU_SELECTOR)].filter(isSettingsMenu);
    return matches.filter(
      (candidate) => !matches.some((other) => other !== candidate && candidate.contains(other)),
    );
  }

  function checkIcon() {
    const namespace = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(namespace, "svg");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("viewBox", "0 0 16 16");
    svg.setAttribute("width", "16");
    svg.setAttribute("height", "16");
    svg.classList.add("ghprf-check");

    const path = document.createElementNS(namespace, "path");
    path.setAttribute(
      "d",
      "M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z",
    );
    svg.append(path);
    return svg;
  }

  function createToggle(key, label) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ghprf-toggle";
    button.dataset.ghprfKey = key;
    button.setAttribute("role", "menuitemcheckbox");
    button.append(checkIcon());

    const labelElement = document.createElement("span");
    labelElement.className = "ghprf-label";
    labelElement.textContent = label;
    button.append(labelElement);

    const count = document.createElement("span");
    count.className = "ghprf-count";
    count.setAttribute("aria-hidden", "true");
    button.append(count);

    button.addEventListener("click", () => {
      state.settings[key] = !state.settings[key];
      chrome.storage.sync.set({ [STORAGE_KEY]: state.settings });
      refresh();
    });
    return button;
  }

  function createControls() {
    const controls = document.createElement("div");
    controls.className = "ghprf-controls";
    controls.dataset.ghprfControls = "";
    controls.setAttribute("aria-label", "GitHub PR Focus");
    controls.append(
      createToggle("hideTests", "Hide test files"),
      createToggle("hideCodeComments", "Hide code comments"),
    );
    return controls;
  }

  function findInsertionPoint(menu) {
    const elements = menu.querySelectorAll(
      "label, button, [role='menuitem'], [role='menuitemcheckbox']",
    );
    const candidates = [...elements];
    const referenceControl =
      candidates.find((element) =>
        element.textContent.toLowerCase().includes("minimize comments"),
      ) ||
      candidates.find((element) =>
        element.textContent.toLowerCase().includes("hide whitespace"),
      );
    if (!referenceControl) return null;

    if (referenceControl.matches("button, [role='menuitem'], [role='menuitemcheckbox']")) {
      return referenceControl;
    }
    return referenceControl.closest("div") || referenceControl;
  }

  function injectControls(menu) {
    if (menu.querySelector(":scope [data-ghprf-controls]")) return;

    const controls = createControls();
    if (menu.textContent.toLowerCase().includes("compact line height")) {
      controls.classList.add("ghprf-controls--action-list");
    }
    const insertionPoint = findInsertionPoint(menu);
    if (insertionPoint?.parentElement) {
      insertionPoint.insertAdjacentElement("afterend", controls);
      return;
    }

    const form = menu.querySelector("form") || menu;
    form.append(controls);
  }

  function updateControls(counts) {
    for (const controls of document.querySelectorAll("[data-ghprf-controls]")) {
      for (const button of controls.querySelectorAll("[data-ghprf-key]")) {
        const key = button.dataset.ghprfKey;
        const enabled = Boolean(state.settings[key]);
        const count =
          key === "hideTests" ? counts.testCount : counts.codeCommentCount;
        button.setAttribute("aria-checked", String(enabled));
        button.querySelector(".ghprf-count").textContent = count ? String(count) : "";
        button.title = count
          ? `${count} ${key === "hideTests" ? "test files" : "code-comment lines"}`
          : "Nothing detected on this page";
      }
    }
  }

  function removeFilters() {
    for (const element of document.querySelectorAll(
      ".ghprf-hidden-test, .ghprf-hidden-tree-item, " +
        ".ghprf-hidden-code-comment, .ghprf-hidden-comment",
    )) {
      element.classList.remove(
        "ghprf-hidden-test",
        "ghprf-hidden-tree-item",
        "ghprf-hidden-code-comment",
        "ghprf-hidden-comment",
      );
    }
  }

  function refresh() {
    state.scheduled = false;

    if (!isFilesPage()) {
      removeFilters();
      return;
    }

    for (const menu of findSettingsMenus()) injectControls(menu);
    updateControls(applyFilters());
  }

  function scheduleRefresh() {
    if (state.scheduled) return;
    state.scheduled = true;
    requestAnimationFrame(refresh);
  }

  function loadSettings() {
    chrome.storage.sync.get({ [STORAGE_KEY]: DEFAULT_SETTINGS }, (stored) => {
      const savedSettings = stored[STORAGE_KEY] || {};
      state.settings = {
        hideCodeComments: Boolean(savedSettings.hideCodeComments),
        hideTests: Boolean(savedSettings.hideTests),
      };
      refresh();
      observer.observe(document.documentElement, { childList: true, subtree: true });
    });
  }

  document.addEventListener("turbo:load", scheduleRefresh);
  document.addEventListener("pjax:end", scheduleRefresh);
  window.addEventListener("popstate", scheduleRefresh);
  window.addEventListener("pagehide", () => observer.disconnect());
  loadSettings();
})();
