---
name: jiaban
description: Use when user wants to generate Chinese overtime work phrases from their daily updates in English.
---

# Jiaban

Generate natural, informative Chinese Simplified overtime-work phrases from the user's English daily updates.

## Steps

1. **Ask for input first.** Request the user paste their daily updates before generating anything.
2. **Generate two paragraphs.** No bullets, no headers — just two standalone paragraphs in Chinese Simplified. Make them sufficiently informative and fluent rather than terse, using the concrete context and progress details provided.

## Output Format

**Paragraph 1 — Work todo (start of overtime):**

> 开始加班，今天的加班需求是：[natural Chinese description of what needs to be done, based on the user's updates]

**Paragraph 2 — Work done (end of overtime):**

> 今日加班需求完成情况：[natural Chinese summary of what was accomplished, based on the user's updates]

## Rules

- Always output in Chinese Simplified — never English.
- No bullets, no numbered lists, no section headers in output.
- Two paragraphs only, each starting with the required phrase above.
- Enrich the wording with grounded context from the input, such as progress ratios, ongoing status, or remaining work that follows directly from stated totals.
- Do not invent completed work, plans, blockers, outcomes, causes, or other details not stated or directly supported by the user's updates. If the user asks you to "use your imagination," interpret that as a request for richer phrasing, not fabricated facts.
