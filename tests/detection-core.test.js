const test = require("node:test");
const assert = require("node:assert/strict");
const { classifyEvidence, transition } = require("../shared/detection-core.js");

// These are logic fixtures only. They do not validate Twitch's live DOM or ad behavior.
test("player/live text and routine transitions do not become ad candidates", () => {
  for (const text of ["Player de vídeo da Twitch", "720p", "Paused", "Loading", "Live"]) {
    assert.equal(classifyEvidence([text]).state, "NO_AD_CANDIDATE", text);
  }
});

test("observed specific ad UI phrases are high-confidence control signals", () => {
  for (const text of ["Deixar feedback sobre este anúncio", "Saiba mais sobre este anúncio"]) {
    const result = classifyEvidence([text]);
    assert.equal(result.state, "AD_CANDIDATE", text);
    assert.equal(result.confidence, "high");
    assert.equal(result.actionable, true);
    assert.ok(result.reasons.length > 0);
  }
});

test("a generic ad mention remains a low-confidence candidate", () => {
  const result = classifyEvidence(["Anúncio"]);
  assert.equal(result.state, "AD_CANDIDATE");
  assert.equal(result.confidence, "low");
  assert.equal(result.actionable, false);
});

test("unobserved English and ad-break labels remain non-actionable", () => {
  for (const text of ["Ad break", "Ad 1 of 3", "Advertisement"]) {
    const result = classifyEvidence([text]);
    assert.equal(result.state, "AD_CANDIDATE", text);
    assert.equal(result.confidence, "low");
    assert.equal(result.actionable, false);
  }
});

test("diagnostic version identifies updated detector build", () => {
  assert.equal(require("../shared/detection-core.js").getVersion(), "0.2.0");
});

test("a pre-existing mute or user override prevents extension mute ownership", () => {
  const { canMuteTab } = require("../shared/detection-core.js");
  assert.equal(canMuteTab({ mutedInfo: { muted: false } }, false), true);
  assert.equal(canMuteTab({ mutedInfo: { muted: true } }, false), false);
  assert.equal(canMuteTab({ mutedInfo: { muted: false } }, true), false);
});

test("audio is restored only while the tab mute is still owned by this extension", () => {
  const { ownsTabMute } = require("../shared/detection-core.js");
  assert.equal(ownsTabMute({ mutedInfo: { muted: true, reason: "extension", extensionId: "ours" } }, true, "ours"), true);
  assert.equal(ownsTabMute({ mutedInfo: { muted: true, reason: "user" } }, true, "ours"), false);
  assert.equal(ownsTabMute({ mutedInfo: { muted: true, reason: "extension", extensionId: "other" } }, true, "ours"), false);
  assert.equal(ownsTabMute({ mutedInfo: { muted: false, reason: "extension", extensionId: "ours" } }, true, "ours"), false);
});

test("candidate disappearance is not reported as return to live", () => {
  assert.equal(transition("NO_AD_CANDIDATE", "AD_CANDIDATE"), "candidate-started");
  assert.equal(transition("AD_CANDIDATE", "NO_AD_CANDIDATE"), "candidate-cleared");
  assert.notEqual(transition("AD_CANDIDATE", "NO_AD_CANDIDATE"), "LIVE");
  assert.equal(transition("NO_AD_CANDIDATE", "NO_AD_CANDIDATE"), null);
});

test("duplicate evidence does not inflate the decision", () => {
  const result = classifyEvidence(["Ad break", "Ad break"]);
  assert.equal(result.reasons.length, 1);
});
