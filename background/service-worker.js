importScripts("audio-controller.js");

chrome.runtime.onInstalled.addListener(() => {
  console.info("[Twitch Ad Muter] Service worker installed");
});
