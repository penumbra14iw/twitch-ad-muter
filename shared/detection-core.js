(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.TAMDetectionCore = api;
})(typeof globalThis === "object" ? globalThis : this, function () {
  "use strict";

  // Only the two user-observed Portuguese phrases may drive tab audio control.
  // Generic ad text remains diagnostic-only.
  const CANDIDATE_PATTERNS = [
    {
      id: "observed-ad-ui-feedback-phrase",
      specificity: "observed-specific",
      pattern: /deixar feedback sobre este an[uú]ncio/i
    },
    {
      id: "observed-ad-ui-more-info-phrase",
      specificity: "observed-specific",
      pattern: /saiba mais sobre este an[uú]ncio/i
    },
    {
      id: "generic-ad-mention",
      specificity: "generic",
      pattern: /\b(?:publicidade|an[uú]ncio)\b/i
    },
    { id: "ad-break-label", specificity: "unvalidated", pattern: /\b(?:ad\s*break|advertisement|advertising)\b/i },
    { id: "ad-sequence-label", specificity: "unvalidated", pattern: /\bad\s+\d+\s+of\s+\d+\b/i }
  ];

  function classifyEvidence(evidence) {
    const normalized = [...new Set((evidence || []).filter(Boolean))];
    const matches = normalized.flatMap((value) => {
      const text = String(value).slice(0, 300);
      return CANDIDATE_PATTERNS
        .filter((rule) => rule.pattern.test(text))
        .map((rule) => ({ rule: rule.id, specificity: rule.specificity, text }));
    });
    const hasObservedSpecificPhrase = matches.some((match) => match.specificity === "observed-specific");
    return {
      state: matches.length ? "AD_CANDIDATE" : "NO_AD_CANDIDATE",
      confidence: hasObservedSpecificPhrase ? "high" : matches.length ? "low" : "none",
      actionable: hasObservedSpecificPhrase,
      reasons: matches
    };
  }

  function transition(previous, current) {
    if (previous === current) return null;
    if (current === "AD_CANDIDATE") return "candidate-started";
    if (previous === "AD_CANDIDATE" && current === "NO_AD_CANDIDATE") {
      return "candidate-cleared";
    }
    return "state-changed";
  }

  function canMuteTab(tab, userOverride) {
    return Boolean(tab && !tab.mutedInfo?.muted && !userOverride);
  }

  function ownsTabMute(tab, owned, extensionId) {
    return Boolean(
      owned && tab?.mutedInfo?.muted &&
      tab.mutedInfo.reason === "extension" &&
      tab.mutedInfo.extensionId === extensionId
    );
  }

  function getVersion() { return "0.2.0"; }

  return { classifyEvidence, transition, canMuteTab, ownsTabMute, getVersion };
});
