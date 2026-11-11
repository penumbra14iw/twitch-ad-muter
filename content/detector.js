(function () {
  "use strict";

  const core = globalThis.TAMDetectionCore;
  const PLAYER_SELECTOR = '[data-a-target="video-player"]';
  const VIDEO_SELECTOR = "video";
  const watchedAttributes = ["aria-label", "data-a-target"];
  let playerRoot = null;
  let playerObserver = null;
  let pageObserver = null;
  let scanQueued = false;
  let lastCandidateState = "NO_AD_CANDIDATE";
  let lastCandidateEvidence = [];
  let lastActionableState = false;
  let identifiedPlayer = false;

  function log(message, details) {
    const stamp = new Intl.DateTimeFormat(undefined, {
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false
    }).format(new Date());
    console.info(`[Twitch Ad Muter ${stamp}] ${message}`, details || "");
  }

  function findPlayerRoot() {
    const marked = document.querySelector(PLAYER_SELECTOR);
    if (marked) return marked;
    const video = document.querySelector(VIDEO_SELECTOR);
    return video ? video.parentElement : null;
  }

  function getEvidence(root) {
    const values = [];
    const elements = [root, ...root.querySelectorAll("*")];
    for (const element of elements) {
      const label = element.getAttribute("aria-label");
      const target = element.getAttribute("data-a-target");
      if (label) values.push(label);
      if (target) values.push(target);
      if (element.children.length === 0) {
        const text = (element.textContent || "").trim();
        if (text && text.length <= 160) values.push(text);
      }
    }
    return values;
  }

  function scan() {
    scanQueued = false;
    const nextRoot = findPlayerRoot();
    if (nextRoot !== playerRoot) observePlayer(nextRoot);
    if (!playerRoot) {
      applyDecision(core.classifyEvidence([]));
      return;
    }

    const videos = playerRoot.querySelectorAll(VIDEO_SELECTOR);
    if (!identifiedPlayer && videos.length) {
      identifiedPlayer = true;
      log("Twitch player identified", {
        videos: videos.length,
        marker: playerRoot.matches(PLAYER_SELECTOR) ? "data-a-target=video-player" : "video ancestor",
        visibilityStateIgnored: true
      });
      log("Monitoring started");
    }

    applyDecision(core.classifyEvidence(getEvidence(playerRoot)));
  }

  function applyDecision(result) {
    const event = core.transition(lastCandidateState, result.state);
    if (event) {
      log(event === "candidate-started" ? "Possible ad-related UI signal detected" : "Ad-related UI text no longer visible", {
        detectorVersion: core.getVersion(),
        confidence: result.confidence,
        state: result.state,
        reasonCount: result.reasons.length,
        reasons: result.reasons,
        previousCandidateEvidence: event === "candidate-cleared" ? lastCandidateEvidence : undefined,
        liveReturnConfirmed: false,
        decision: result.actionable ? "tab audio control signal" : "diagnostic only; no audio action"
      });
      lastCandidateState = result.state;
      lastCandidateEvidence = result.reasons;
    }

    if (result.actionable !== lastActionableState) {
      lastActionableState = result.actionable;
      log(result.actionable ? "Validated ad UI phrase entered" : "Validated ad UI phrase left", {
        detectorVersion: core.getVersion(),
        confidence: result.confidence,
        evidence: result.reasons.filter((item) => item.specificity === "observed-specific"),
        action: "request tab mute state update"
      });
      chrome.runtime.sendMessage({
        type: "TAM_AD_SIGNAL",
        active: result.actionable,
        confidence: result.confidence,
        evidence: result.reasons.filter((item) => item.specificity === "observed-specific"),
        observedAt: Date.now()
      }).catch((error) => log("Background communication failed", { message: String(error) }));
    }
  }

  function queueScan() {
    if (scanQueued) return;
    scanQueued = true;
    setTimeout(scan, 150);
  }

  function observePlayer(nextRoot) {
    if (playerObserver) playerObserver.disconnect();
    playerRoot = nextRoot;
    playerObserver = null;
    if (!playerRoot) return;
    playerObserver = new MutationObserver(queueScan);
    playerObserver.observe(playerRoot, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: watchedAttributes
    });
    queueScan();
  }

  pageObserver = new MutationObserver(() => {
    const current = findPlayerRoot();
    if (current !== playerRoot) observePlayer(current);
  });

  if (document.body) {
    pageObserver.observe(document.body, { subtree: true, childList: true });
  }
  observePlayer(findPlayerRoot());
  log("Diagnostic observer initialized; automatic audio control uses observed ad phrases");
})();

