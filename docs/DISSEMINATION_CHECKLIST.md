# 📢 Paper Dissemination Checklist

**Paper**: Adjacency-Constrained Episodic Memory for Software Workflows
**Author**: Joseph Gustavson
**ORCID**: 0009-0001-0669-0749
**Date**: November 1, 2025
**PDF**: https://github.com/Guffawaffle/LexBrain/releases/download/v0.1.0-paper-2025-11-01/adjacency-constrained-episodic-memory.pdf

---

## ✅ Step 1: ResearchGate Upload

**URL**: https://www.researchgate.net/signup

### Upload Info

1. **Sign up** as "Independent Researcher"
2. **Add ORCID**: `0009-0001-0669-0749`
3. Click **"Add research" → "Article"**
4. Upload PDF from: `/srv/lex-mcp/lex-brain/docs/adjacency-constrained-episodic-memory.pdf`

### Metadata to Enter

- **Title**: Adjacency-Constrained Episodic Memory for Software Workflows
- **Subtitle**: A Local-First Framework for Policy-Grounded AI Continuity
- **Authors**: Joseph Gustavson (Independent Researcher)
- **Publication Date**: November 2025
- **Publication Type**: Preprint / Working Paper

### Abstract (Copy-Paste)

```
Modern AI coding assistants still behave like short-term collaborators: they respond to prompts but cannot reliably resume multi-day engineering work without the user re-explaining what they were doing, why it mattered, and what remains blocked. Separately, most codebases operate under undocumented or tribal architectural rules that are enforced informally ("ask the senior dev if this import is allowed"). This paper introduces a joint system, LexBrain and LexMap, that addresses both problems simultaneously.

LexBrain provides episodic work memory as explicit "Frames": timestamped, opt-in snapshots of an engineer's working state at a meaningful moment. Each Frame stores (1) a rendered "memory card" image, (2) the raw high-signal text behind that image, and (3) structured metadata including branch, blockers, next action, feature flags, and module_scope. The rendered image exists because vision-capable models can consume high-density panels of text at dramatically lower token cost than equivalent raw text, achieving order-of-magnitude (7–20×) compression in practical long-context workflows.

LexMap provides policy-as-code: a machine-readable file (lexmap.policy.json) that encodes module ownership, allowed and forbidden call edges between modules, and kill patterns to be eliminated from the codebase. Language-specific scanners (PHP, TypeScript, Python, etc.) emit factual observations about code usage, which LexMap then merges and checks against policy.

We unify these two systems using (a) a shared canonical module vocabulary and (b) a spatial retrieval strategy we call the fold radius. The shared vocabulary is formalized as THE CRITICAL RULE: every module identifier in LexBrain Frames must match a module identifier in lexmap.policy.json. The fold radius defines how much of the architectural map is "unfolded" for recall: when recalling a past Frame, the assistant retrieves only the touched modules and their immediate adjacency neighborhood, not the entire codebase.

We argue that this combination — timestamped, opt-in episodic memory aligned to a policy-governed architectural map, with adjacency-bounded recall and high-compression visual context — constitutes a practical path to explainable, auditable AI-assisted continuity for large legacy codebases.
```

### Keywords/Tags

```
software engineering
architecture conformance
developer productivity
LLM tooling
context retention
codebase policy
static analysis
multimodal memory
AI-assisted development
software architecture
policy-as-code
episodic memory
developer workflows
code review
technical debt
```

### Project Links

- **GitHub (LexBrain)**: https://github.com/Guffawaffle/LexBrain
- **GitHub (LexMap)**: https://github.com/Guffawaffle/lex-map
- **Release Page**: https://github.com/Guffawaffle/LexBrain/releases/tag/v0.1.0-paper-2025-11-01

### Full-Text Available?

✅ **YES** — Make PDF downloadable

---

## ✅ Step 2: Academia.edu Upload

**URL**: https://www.academia.edu/signup

### Upload Info

1. **Sign up** as "Independent Researcher"
2. Upload same PDF
3. Add same metadata as ResearchGate

### One-Paragraph Pitch (for description)

```
We pair enforcement of architecture policy (LexMap) with episodic working memory for humans (LexBrain), tie them with a shared module vocabulary (THE CRITICAL RULE), and recall state using an adjacency-limited fold radius so assistants can explain why work is blocked, not just re-describe the diff. This produces policy-grounded continuity for multi-day engineering handoff without dumping entire codebases into context.
```

---

## ✅ Step 3: Zenodo (DOI)

**URL**: https://zenodo.org/signup

### Setup Steps

1. **Sign up** (or login with GitHub)
2. Go to: https://zenodo.org/account/settings/github/
3. **Authorize** Zenodo to access your GitHub repos
4. **Enable** archival for `Guffawaffle/LexBrain`
5. Zenodo will **automatically** archive the release `v0.1.0-paper-2025-11-01`

### What You Get (~5-30 min)

- **Persistent DOI**: `10.5281/zenodo.XXXXXXX`
- **Immutable archive**: Cannot be deleted
- **Citation tracking**: Google Scholar indexing
- **Download stats**: See who's reading

### After DOI is Issued

Update your:
- ResearchGate entry (add DOI field)
- Academia.edu entry (add DOI)
- GitHub Release description (add DOI badge)
- CV / portfolio

---

## ✅ Step 4: OpenReview Submission

**URL**: https://openreview.net/

### Account Setup

1. **Create account** with ORCID: `0009-0001-0669-0749`
2. Link GitHub profile
3. Add affiliation: "Independent Researcher"

### Find Appropriate Venue

Search for active workshops/tracks in:
- **AI for Software Engineering**
- **Intelligent Developer Tools**
- **LLM and Code**
- **Software Productivity Tooling**
- **Human/LLM Collaboration in Software Development**

Look for:
- Open submission tracks
- Non-archival tracks (allows arXiv later)
- Workshop proceedings

### Submission Type

**System/Position Paper** (this is valid!)

### Submission Abstract

Use the same abstract from ResearchGate, but also add:

```
This work introduces working implementations (LexBrain, LexMap) with defined schemas, workflow semantics, and a bridging invariant (THE CRITICAL RULE). We describe token economics for memory cards using vision-based compression, spatial retrieval geometry via fold radius, and opt-in local-first capture semantics.
```

---

## ✅ Step 5: arXiv Endorsement Request

### Find cs.SE Author

Search arXiv for recent papers in:
- `cs.SE` (Software Engineering)
- Topics: developer tools, code analysis, LLM for code

### Email Template

```
Subject: arXiv cs.SE Endorsement Request – LexBrain/LexMap Paper

Dear [Name],

I'm Joseph Gustavson, an independent researcher working on developer productivity tools at the intersection of architecture enforcement and AI-assisted continuity.

I've written a paper introducing LexBrain and LexMap, a joint system for episodic work memory and policy-as-code in software workflows. The paper addresses two problems:

1. How AI assistants can resume multi-day engineering work without re-explanation
2. How undocumented architectural boundaries can be encoded and enforced as version-controlled policy

I'm requesting endorsement to submit this work to arXiv under cs.SE.

**Paper details:**
- Title: "Adjacency-Constrained Episodic Memory for Software Workflows"
- Author: Joseph Gustavson (ORCID: 0009-0001-0669-0749)
- Affiliation: Independent Researcher
- PDF: [attach or link to GitHub release]
- GitHub: https://github.com/Guffawaffle/LexBrain

The paper has been uploaded to ResearchGate/Academia.edu and will be submitted to OpenReview. Both LexBrain and LexMap are working implementations with public repos.

I'd be grateful if you could review the abstract and consider endorsing for cs.SE. I'm happy to answer any questions or provide additional context.

Thank you for your time.

Best regards,
Joseph Gustavson
ORCID: 0009-0001-0669-0749
```

### Attach

- PDF from `/srv/lex-mcp/lex-brain/docs/adjacency-constrained-episodic-memory.pdf`
- Link to GitHub release

---

## 📋 BibTeX Citation (Ready to Share)

```bibtex
@misc{gustavson2025adjacency,
  author = {Gustavson, Joseph},
  title = {Adjacency-Constrained Episodic Memory for Software Workflows: A Local-First Framework for Policy-Grounded AI Continuity},
  year = {2025},
  month = {November},
  publisher = {GitHub},
  howpublished = {\url{https://github.com/Guffawaffle/LexBrain/releases/tag/v0.1.0-paper-2025-11-01}},
  note = {ORCID: 0009-0001-0669-0749}
}
```

---

## 🎯 Quick Reference

- **PDF Location**: `/srv/lex-mcp/lex-brain/docs/adjacency-constrained-episodic-memory.pdf`
- **GitHub Release**: https://github.com/Guffawaffle/LexBrain/releases/tag/v0.1.0-paper-2025-11-01
- **Direct PDF Download**: https://github.com/Guffawaffle/LexBrain/releases/download/v0.1.0-paper-2025-11-01/adjacency-constrained-episodic-memory.pdf
- **LaTeX Source**: https://github.com/Guffawaffle/LexBrain/blob/feature/adjacency-constrained-episodic-memory-paper/docs/adjacency-constrained-episodic-memory.tex
- **Pull Request**: https://github.com/Guffawaffle/LexBrain/pull/15

---

## ✨ You're Ready!

Everything is prepared. Just work through the checklist step by step. The PDF is compiled, the release is live, and all the metadata is ready to copy-paste.

**Start with ResearchGate** (takes 10 minutes), then move through the list. You'll have multi-platform dissemination within an hour.

Good luck! 🚀
