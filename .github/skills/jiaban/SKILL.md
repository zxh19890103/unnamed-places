---
name: jiaban
description: Use when user wants to generate Chinese overtime work phrases from their daily updates in English.
---

# Jiaban

Generate concise Chinese Simplified overtime-work phrases from the user's English daily updates.

## Steps

1. **Ask for input first.** Request the user paste their daily updates before generating anything.
2. **Generate two paragraphs.** No bullets, no headers — just two standalone paragraphs in Chinese Simplified.

## Output Format

**Paragraph 1 — Work todo (start of overtime):**

> 开始加班，今天的加班需求是：[natural Chinese description of what needs to be done, based on the user's updates]

**Paragraph 2 — Work done (end of overtime):**

> 今日加班需求完成情况：[natural Chinese summary of what was accomplished, based on the user's updates]

## Rules

- Always output in Chinese Simplified — never English.
- No bullets, no numbered lists, no section headers in output.
- Two paragraphs only, each starting with the required phrase above.
- Derive content faithfully from the user's English input; do not invent tasks.
