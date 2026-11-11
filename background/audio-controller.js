importScripts("../shared/detection-core.js");

const core = globalThis.TAMDetectionCore;
const STATE_KEY = "tamTabStates";
let operationQueue = Promise.resolve();

function enqueue(operation) {
  const pending = operationQueue.then(operation, operation);
  operationQueue = pending.catch((error) => console.error("[Twitch Ad Muter] Operation failed", error));
  return pending;
}

function isTwitchTab(tab) {
  return typeof tab?.url === "string" && /^https:\/\/(www\.)?twitch\.tv\//i.test(tab.url);
}

async function readStates() {
  const data = await chrome.storage.local.get(STATE_KEY);
  return data[STATE_KEY] || {};
}

async function writeStates(states) {
  await chrome.storage.local.set({ [STATE_KEY]: states });
}

async function updateState(tabId, transform) {
  const states = await readStates();
  const next = transform(states[String(tabId)] || {});
  if (next === null) delete states[String(tabId)];
  else states[String(tabId)] = next;
  await writeStates(states);
  return next;
}

async function getTabOrNull(tabId) {
  try { return await chrome.tabs.get(tabId); }
  catch { return null; }
}

async function handleSignal(message, sender) {
  const tabId = sender.tab?.id;
  if (!Number.isInteger(tabId) || !isTwitchTab(sender.tab)) return;
  const tab = await getTabOrNull(tabId);
  if (!tab || !isTwitchTab(tab)) return;
  const existing = (await readStates())[String(tabId)] || {};

  if (message.active) {
    if (existing.signalActive) return;
    const state = {
      tabId,
      url: tab.url,
      signalActive: true,
      evidence: message.evidence || [],
      startedAt: message.observedAt || Date.now(),
      muteOwned: false,
      userOverride: false,
      preexistingMute: Boolean(tab.mutedInfo?.muted)
    };
    if (!core.canMuteTab(tab, false)) {
      await updateState(tabId, () => state);
      console.info("[Twitch Ad Muter] Signal active; pre-existing tab mute preserved", { tabId });
      return;
    }

    state.muteOwned = true;
    await updateState(tabId, () => state);
    try {
      await chrome.tabs.update(tabId, { muted: true });
      console.info("[Twitch Ad Muter] Muted Twitch tab for observed ad UI signal", { tabId });
    } catch (error) {
      state.muteOwned = false;
      state.error = String(error);
      await updateState(tabId, () => state);
      console.error("[Twitch Ad Muter] Failed to mute Twitch tab", { tabId, error: String(error) });
    }
    return;
  }

  if (!existing.signalActive) return;
  const latestTab = await getTabOrNull(tabId);
  const canRestore = core.ownsTabMute(latestTab, existing.muteOwned, chrome.runtime.id);
  if (canRestore) {
    try {
      await chrome.tabs.update(tabId, { muted: false });
      console.info("[Twitch Ad Muter] Restored Twitch tab audio after ad UI signal cleared", { tabId });
    } catch (error) {
      console.error("[Twitch Ad Muter] Failed to restore Twitch tab audio", { tabId, error: String(error) });
    }
  }
  await updateState(tabId, () => ({
    tabId,
    url: latestTab?.url || existing.url,
    signalActive: false,
    muteOwned: false,
    userOverride: false,
    preexistingMute: false,
    lastEndedAt: Date.now()
  }));
}

async function onTabMuteChanged(tabId, changeInfo) {
  if (!changeInfo.mutedInfo) return;
  const states = await readStates();
  const state = states[String(tabId)];
  if (!state?.muteOwned) return;
  const info = changeInfo.mutedInfo;
  const isOurMute = info.muted && info.reason === "extension" && info.extensionId === chrome.runtime.id;
  const isOurUnmute = !info.muted && info.reason === "extension" && info.extensionId === chrome.runtime.id;
  if (isOurMute) return;
  if (isOurUnmute) {
    await updateState(tabId, (current) => ({ ...current, muteOwned: false }));
    return;
  }

  await updateState(tabId, (current) => ({
    ...current,
    muteOwned: false,
    userOverride: current.signalActive
  }));
  console.info("[Twitch Ad Muter] User-controlled tab mute change detected; extension released ownership", { tabId });
}

async function cleanupNavigatedTab(tabId) {
  const state = (await readStates())[String(tabId)];
  if (!state) return;
  const tab = await getTabOrNull(tabId);
  if (core.ownsTabMute(tab, state.muteOwned, chrome.runtime.id)) {
    await chrome.tabs.update(tabId, { muted: false });
  }
  await updateState(tabId, () => null);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "TAM_AD_SIGNAL") return;
  enqueue(() => handleSignal(message, sender))
    .then(() => sendResponse({ ok: true }))
    .catch((error) => {
      console.error("[Twitch Ad Muter] Signal handling failed", String(error));
      sendResponse({ ok: false, error: String(error) });
    });
  return true;
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  enqueue(async () => {
    await onTabMuteChanged(tabId, changeInfo);
    if (changeInfo.url && !isTwitchTab(tab)) await cleanupNavigatedTab(tabId);
  }).catch((error) => console.error("[Twitch Ad Muter] Tab update handling failed", error));
});

chrome.tabs.onRemoved.addListener((tabId) => {
  enqueue(() => updateState(tabId, () => null))
    .catch((error) => console.error("[Twitch Ad Muter] Closed tab cleanup failed", error));
});

chrome.runtime.onStartup.addListener(async () => {
  await enqueue(async () => {
    const states = await readStates();
    for (const [id, state] of Object.entries(states)) {
      const tabId = Number(id);
      const tab = await getTabOrNull(tabId);
      if (!tab || !isTwitchTab(tab)) {
        delete states[id];
        continue;
      }
      if (state.muteOwned && !core.ownsTabMute(tab, true, chrome.runtime.id)) {
        state.muteOwned = false;
        state.userOverride = Boolean(state.signalActive);
      }
    }
    await writeStates(states);
  });
});
