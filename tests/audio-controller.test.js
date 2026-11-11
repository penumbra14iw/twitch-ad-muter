const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const core = require("../shared/detection-core.js");

function makeEvent() {
  const listeners = [];
  return {
    listeners,
    addListener(listener) { listeners.push(listener); },
    emit(...args) { for (const listener of [...listeners]) listener(...args); }
  };
}

function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }

function makeHarness(initialTabs = [{ id: 1, url: "https://www.twitch.tv/channel", mutedInfo: { muted: false } }], shared = {}) {
  const runtimeOnMessage = makeEvent();
  const runtimeOnStartup = makeEvent();
  const tabsOnUpdated = makeEvent();
  const tabsOnRemoved = makeEvent();
  const tabs = new Map(initialTabs.map((tab) => [tab.id, clone(tab)]));
  const local = shared.local || {};
  shared.local = local;
  const chrome = {
    runtime: { id: "test-extension", onMessage: runtimeOnMessage, onStartup: runtimeOnStartup },
    storage: { local: {
      async get(key) { return { [key]: clone(local[key]) }; },
      async set(values) { Object.assign(local, clone(values)); }
    } },
    tabs: {
      onUpdated: tabsOnUpdated,
      onRemoved: tabsOnRemoved,
      async get(id) {
        if (!tabs.has(id)) throw new Error("No such tab");
        return clone(tabs.get(id));
      },
      async update(id, changes) {
        const tab = tabs.get(id);
        if (!tab) throw new Error("No such tab");
        if (typeof changes.muted === "boolean") {
          tab.mutedInfo = { muted: changes.muted, reason: "extension", extensionId: chrome.runtime.id };
          tabsOnUpdated.emit(id, { mutedInfo: clone(tab.mutedInfo) }, clone(tab));
        }
        return clone(tab);
      }
    }
  };

  const context = vm.createContext({
    chrome,
    console: { info() {}, error() {} },
    importScripts() { context.TAMDetectionCore = core; }
  });
  const script = fs.readFileSync(path.join(__dirname, "../background/audio-controller.js"), "utf8");
  vm.runInContext(script, context);

  async function signal(tabId, active) {
    const listener = runtimeOnMessage.listeners[0];
    const sender = { tab: clone(tabs.get(tabId)) };
    return new Promise((resolve) => {
      listener({ type: "TAM_AD_SIGNAL", active, confidence: "high", evidence: [{ text: "Saiba mais sobre este anúncio" }] }, sender, resolve);
    });
  }

  async function settle() { await new Promise((resolve) => setTimeout(resolve, 0)); }
  function userMute(tabId, muted) {
    const tab = tabs.get(tabId);
    tab.mutedInfo = { muted, reason: "user" };
    tabsOnUpdated.emit(tabId, { mutedInfo: clone(tab.mutedInfo) }, clone(tab));
  }

  return { chrome, tabs, shared, signal, settle, userMute, tabsOnUpdated, tabsOnRemoved, runtimeOnMessage, runtimeOnStartup };
}

test("mutes only the Twitch tab that sent the signal and restores it", async () => {
  const h = makeHarness([
    { id: 1, url: "https://www.twitch.tv/a", mutedInfo: { muted: false } },
    { id: 2, url: "https://www.twitch.tv/b", mutedInfo: { muted: false } }
  ]);
  await h.signal(1, true);
  assert.equal(h.tabs.get(1).mutedInfo.muted, true);
  assert.equal(h.tabs.get(2).mutedInfo.muted, false);
  await h.signal(1, false);
  assert.equal(h.tabs.get(1).mutedInfo.muted, false);
});

test("preserves a mute that was already set before the ad signal", async () => {
  const h = makeHarness([{ id: 1, url: "https://www.twitch.tv/a", mutedInfo: { muted: true, reason: "user" } }]);
  await h.signal(1, true);
  await h.signal(1, false);
  assert.equal(h.tabs.get(1).mutedInfo.muted, true);
  assert.equal(h.tabs.get(1).mutedInfo.reason, "user");
});

test("does not unmute after the user changes mute during an ad", async () => {
  const h = makeHarness();
  await h.signal(1, true);
  h.userMute(1, false);
  await h.settle();
  h.userMute(1, true);
  await h.settle();
  await h.signal(1, false);
  assert.equal(h.tabs.get(1).mutedInfo.muted, true);
  assert.equal(h.tabs.get(1).mutedInfo.reason, "user");
});

test("restores an extension-owned mute after controller state is reloaded", async () => {
  const h = makeHarness();
  await h.signal(1, true);
  h.runtimeOnMessage.listeners.length = 0;
  h.tabsOnUpdated.listeners.length = 0;
  const restored = makeHarness([{ id: 1, url: "https://www.twitch.tv/channel", mutedInfo: clone(h.tabs.get(1).mutedInfo) }], h.shared);
  await restored.signal(1, false);
  assert.equal(restored.tabs.get(1).mutedInfo.muted, false);
});

test("cleans up extension-owned mute when the tab leaves Twitch", async () => {
  const h = makeHarness();
  await h.signal(1, true);
  const tab = h.tabs.get(1);
  tab.url = "https://example.com/";
  h.tabsOnUpdated.emit(1, { url: tab.url }, clone(tab));
  await h.settle();
  await h.settle();
  assert.equal(h.tabs.get(1).mutedInfo.muted, false);
  assert.equal(Object.keys(h.shared.local.tamTabStates).length, 0);
});

test("removes state when a tab closes", async () => {
  const h = makeHarness();
  await h.signal(1, true);
  h.tabsOnRemoved.emit(1);
  await h.settle();
  assert.deepEqual(h.shared.local.tamTabStates, {});
});
