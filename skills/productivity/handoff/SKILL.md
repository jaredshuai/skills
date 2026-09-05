---
name: "handoff"
description: "Compact the current conversation into a handoff document for another agent to pick up."
slug: "mp-handoff"
displayName: "handoff"
version: 1.2.3+r1
summary: "Compact the current conversation into a handoff document for another agent to pick up."
license: MIT
homepage: "https://github.com/mattpocock/skills/tree/main/skills/productivity/handoff"
tags: [mattpocock, mirror, productivity]
---

> **Mirror notice:** This skill is mirrored from [mattpocock/skills · skills/productivity/handoff](https://github.com/mattpocock/skills/tree/main/skills/productivity/handoff) (built from upstream commit `cc13e86`, MIT License — see the License section at the end of this file). 由 SkillHub 社区搬运,非作者官方维护;更新与反馈请见上游仓库。此镜像由 @jaredshuai 维护。

Write a handoff document summarising the current conversation so a fresh agent can continue the work. Save to the temporary directory of the user's OS - not the current workspace.

Include a "suggested skills" section in the document, naming which skills the next agent should call the Skill tool for.

Do not duplicate content already captured in other artifacts (specs, plans, ADRs, issues, commits, diffs). Reference them by path or URL instead.

Redact any sensitive information, such as API keys, passwords, or personally identifiable information.

If the user passed arguments, treat them as a description of what the next session will focus on and tailor the doc accordingly.

---

## License

MIT License

Copyright (c) 2026 Matt Pocock

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
