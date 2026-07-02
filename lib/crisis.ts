// Fast pre-check for questions that should never get a bot-only answer.
// The model also sets `escalate` in its structured output; this catches the
// clearest cases before any model call.
const CRISIS_PATTERNS: RegExp[] = [
  /suicid/i,
  /kill (myself|me)/i,
  /end(ing)? my life/i,
  /want to die/i,
  /self[- ]harm/i,
  /hurt(ing)? myself/i,
  /cutting myself/i,
  /overdose/i,
  /(sexual|domestic|child|physical) (abuse|violence)/i,
  /being abused/i,
  /rape/i,
];

export function isCrisis(question: string): boolean {
  return CRISIS_PATTERNS.some((re) => re.test(question));
}

export function crisisResponse(careFormUrl: string) {
  return {
    answer:
      "It sounds like you may be going through something serious, and we don't want you to walk through it alone. " +
      "Please reach out so a real person from our care team can be with you in this — you matter deeply to God and to us.\n\n" +
      `**Talk to our care team:** [Care Request](${careFormUrl})\n\n` +
      "**If you are in immediate danger or thinking about harming yourself,** call or text **988** " +
      "(Suicide & Crisis Lifeline, available 24/7) or call **911**.",
    confidence: "high" as const,
    sources: [],
    goDeeper: [],
    escalate: true,
  };
}
