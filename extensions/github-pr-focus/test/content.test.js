const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { JSDOM } = require("jsdom");

const extensionRoot = path.resolve(__dirname, "..");

function source(fileName) {
  return fs.readFileSync(path.join(extensionRoot, "src", fileName), "utf8");
}

function nextFrame(window) {
  return new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
}

test("injects settings and filters old and dynamically loaded diff content", async () => {
  const dom = new JSDOM(
    `<!doctype html><html><body>
      <div class="Popover-message">
        <div>Unified</div><div>Split</div>
        <form><div><label>Hide whitespace</label></div></form>
      </div>
      <div class="js-file" data-path="src/app.ts">
        <table><tbody>
          <tr id="comment-line"><td><span class="blob-code-inner"><span class="pl-c">// Note</span></span></td></tr>
          <tr id="mixed-line"><td><span class="blob-code-inner">run()<span class="pl-c"> // Note</span></span></td></tr>
          <tr id="directive-line"><td><span class="blob-code-inner"><span class="pl-c">//go:build e2e</span></span></td></tr>
        </tbody></table>
      </div>
      <div class="js-file" data-path="src/app.test.ts"></div>
    </body></html>`,
    {
      pretendToBeVisual: true,
      runScripts: "outside-only",
      url: "https://github.com/acme/project/pull/42/files",
    },
  );

  const writes = [];
  dom.window.chrome = {
    storage: {
      sync: {
        get: (_defaults, callback) => callback({}),
        set: (value) => writes.push(value),
      },
    },
  };

  vm.runInContext(source("filters.js"), dom.getInternalVMContext());
  vm.runInContext(source("content.js"), dom.getInternalVMContext());
  await nextFrame(dom.window);

  const controls = dom.window.document.querySelector("[data-ghprf-controls]");
  assert.ok(controls, "controls were injected into the diff menu");

  controls.querySelector("[data-ghprf-key='hideTests']").click();
  assert.equal(
    dom.window.document.querySelector("[data-path='src/app.test.ts']").classList.contains("ghprf-hidden-test"),
    true,
  );
  assert.equal(
    dom.window.document.querySelector("[data-path='src/app.ts']").classList.contains("ghprf-hidden-test"),
    false,
  );

  controls.querySelector("[data-ghprf-key='hideCodeComments']").click();
  assert.equal(
    dom.window.document.querySelector("#comment-line").classList.contains("ghprf-hidden-code-comment"),
    true,
  );
  assert.equal(
    dom.window.document.querySelector("#mixed-line").classList.contains("ghprf-hidden-code-comment"),
    false,
  );
  assert.equal(
    dom.window.document.querySelector("#directive-line").classList.contains("ghprf-hidden-code-comment"),
    false,
  );

  const dynamicTest = dom.window.document.createElement("div");
  dynamicTest.className = "js-file";
  dynamicTest.dataset.path = "api/user_test.go";
  dom.window.document.body.append(dynamicTest);
  await nextFrame(dom.window);
  await nextFrame(dom.window);
  assert.equal(dynamicTest.classList.contains("ghprf-hidden-test"), true);
  assert.equal(writes.length, 2);

  dom.window.dispatchEvent(new dom.window.Event("pagehide"));
  dom.window.close();
});

test("joins GitHub's newer action-list settings menu", () => {
  const dom = new JSDOM(
    `<!doctype html><html><body>
      <div role="menu">
        <h3>Layout</h3>
        <button>Unified</button><button>Split</button>
        <button>Minimize comments</button>
        <button>Hide whitespace</button>
        <button>Compact line height</button>
      </div>
    </body></html>`,
    {
      pretendToBeVisual: true,
      runScripts: "outside-only",
      url: "https://github.com/acme/project/pull/42/files",
    },
  );

  dom.window.chrome = {
    storage: {
      sync: {
        get: (_defaults, callback) => callback({}),
        set: () => {},
      },
    },
  };
  vm.runInContext(source("filters.js"), dom.getInternalVMContext());
  vm.runInContext(source("content.js"), dom.getInternalVMContext());

  const controls = dom.window.document.querySelector("[data-ghprf-controls]");
  assert.ok(controls);
  assert.equal(controls.classList.contains("ghprf-controls--action-list"), true);
  assert.equal(
    controls.previousElementSibling.textContent.trim(),
    "Minimize comments",
  );

  dom.window.dispatchEvent(new dom.window.Event("pagehide"));
  dom.window.close();
});

test("supports the current changes route and progressive diff containers", () => {
  const dom = new JSDOM(
    `<!doctype html><html><body>
      <ul role="menu" aria-label="Open diff view settings">
        <li role="none"><ul role="group" aria-label="Layout">
          <li role="menuitemradio">Unified</li><li role="menuitemradio">Split</li>
        </ul></li>
        <li role="none"><ul role="group" aria-label="Comments">
          <li role="menuitemcheckbox">Minimize comments</li>
        </ul></li>
        <li role="none"><ul role="group" aria-label="Format">
          <li role="menuitemcheckbox">Hide whitespace</li>
          <li role="menuitemcheckbox">Compact line height</li>
        </ul></li>
      </ul>
      <ul role="tree" aria-label="File Tree">
        <li role="treeitem" id="templates"><div>templates</div>
          <ul role="group">
            <li role="treeitem" id="templates/backend/tests"><div>tests</div>
              <ul role="group">
                <li role="treeitem" id="templates/backend/tests/conftest.py">
                  <div><a href="#diff-test">conftest.py</a></div>
                </li>
              </ul>
            </li>
            <li role="treeitem" id="templates/backend/server.py">
              <div><a href="#diff-source">server.py</a></div>
            </li>
          </ul>
        </li>
      </ul>
      <div data-testid="progressive-diffs-list">
        <div id="test-wrapper"><div role="region" id="diff-test">
          <h3><a href="#diff-test">\u200etemplates/backend/tests/conftest.py\u200e</a></h3>
        </div></div>
        <div id="source-wrapper"><div role="region" id="diff-source">
          <h3><a href="#diff-source">\u200etemplates/backend/server.py\u200e</a></h3>
          <table><tbody>
            <tr id="current-comment-line" class="diff-line-row"><td role="gridcell">
              <code class="diff-text">+ <span class="pl-c">// Comment only</span></code>
            </td></tr>
            <tr id="current-mixed-line" class="diff-line-row"><td role="gridcell">
              <code class="diff-text">+ run()<span class="pl-c"> // trailing</span></code>
            </td></tr>
          </tbody></table>
        </div></div>
      </div>
    </body></html>`,
    {
      pretendToBeVisual: true,
      runScripts: "outside-only",
      url: "https://github.com/acme/project/pull/42/changes",
    },
  );

  dom.window.chrome = {
    storage: {
      sync: {
        get: (_defaults, callback) =>
          callback({
            githubPrFocusSettings: {
              hideCodeComments: true,
              hideTests: true,
            },
          }),
        set: () => {},
      },
    },
  };
  vm.runInContext(source("filters.js"), dom.getInternalVMContext());
  vm.runInContext(source("content.js"), dom.getInternalVMContext());

  assert.equal(
    dom.window.document.querySelector("#test-wrapper").classList.contains("ghprf-hidden-test"),
    true,
  );
  assert.equal(
    dom.window.document.querySelector("#source-wrapper").classList.contains("ghprf-hidden-test"),
    false,
  );
  assert.equal(
    dom.window.document
      .querySelector("#current-comment-line")
      .classList.contains("ghprf-hidden-code-comment"),
    true,
  );
  assert.equal(
    dom.window.document
      .querySelector("#current-mixed-line")
      .classList.contains("ghprf-hidden-code-comment"),
    false,
  );
  assert.equal(
    dom.window.document
      .querySelector("[id='templates/backend/tests/conftest.py']")
      .classList.contains("ghprf-hidden-tree-item"),
    true,
  );
  assert.equal(
    dom.window.document
      .querySelector("[id='templates/backend/tests']")
      .classList.contains("ghprf-hidden-tree-item"),
    true,
  );
  assert.equal(
    dom.window.document
      .querySelector("[id='templates']")
      .classList.contains("ghprf-hidden-tree-item"),
    false,
  );
  assert.ok(dom.window.document.querySelector("[data-ghprf-controls]"));

  dom.window.dispatchEvent(new dom.window.Event("pagehide"));
  dom.window.close();
});
