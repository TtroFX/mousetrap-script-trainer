# Mousetrap Script Trainer — Chunking v1 canonical rules

Status: CANONICAL FOR REBUILD

## 1. Priority

Analysis is structural first, not word-by-word POS tagging.

Priority:
1. clause boundaries and nesting;
2. S / V / O / C inside each clause;
3. auxiliary and connective elements;
4. only then functional fallback markers for material that has no higher structural role.

Never invent omitted words. Dialogue fragments stay fragments.

## 2. Clause markers

- `BC` — base/main clause.
- `AC` — adverbial clause.
- `NC` — noun/content clause, including clausal S/O/C and role-bearing infinitival/content clauses.
- `RC` — relative/adjectival clause.

Each clause receives a number. Clause numbers are assigned in textual order; when two clauses begin at the same offset, the contained/shorter clause is numbered first. The same number is used by that clause's numbered S/V/O/C markers.

Examples of correspondence: `BC1` ↔ `S1 V1 O1 C1`; `AC2` ↔ `S2 V2 ...`.

A clause may itself fill S, O, or C in an outer clause. The same text span may therefore have both an inner clause identity (for example `NC2`) and an outer role (for example `O1`). This overlap is intentional and must be represented explicitly rather than flattened.

## 3. Core role markers

- `S<n>` — subject of clause n.
- `V<n>` — lexical/main verb (or copular verb when `be` itself is the clause verb) of clause n.
- `O<n>` — object of clause n.
- `C<n>` — complement of clause n.

Do not use Vi/Vt. Use `V` only.

Do not draw or encode an S→V connector. Number identity expresses the correspondence.

Multiple same-role items in one clause may use suffixes (`O1a`, `O1b`, `V1a`, `V1b`) when needed.

## 4. HV

`HV` is unnumbered.

Modal/auxiliary items are separate from the lexical V:
- can = HV, go = Vn
- has = HV, finished = Vn
- is = HV, running = Vn
- was = HV, opened = Vn

Do not wrap `can go`, `has finished`, `has been studying`, etc. in a second aggregate V marker. Do not add VBN or auxiliary-tree sublabels beneath V.

`be`, `have`, and `do` are HV only when auxiliary. If they are the actual clause verb, mark them Vn.

## 5. Connectives

- `ACC` — unnumbered subordinating/complementizing element that introduces or marks a dependent clause (`if`, `when`, `because`, `although`, content-clause `that`, `whether`, etc.). It belongs inside the dependent clause.
- `Conj` — coordinating conjunction (`and`, `but`, `or`, etc.).

Do not classify every `that` as ACC. Relative `that`/who/which that itself fills S/O inside an RC receives its grammatical role in that RC.

Infinitival `to` is not ACC merely because it introduces an infinitive.

## 6. Infinitives, gerunds, participles

Form does not override sentence role.

A to-infinitive, gerund phrase, or clause can itself be S/O/C of an outer clause. Preserve both the outer role span and its internal structure where a clause is analyzable.

Participles are not automatically AC. Classify by actual function: adjectival/relative when modifying a noun, adverbial when modifying a clause, or fragment/nonfinite content when the dialogue is incomplete.

## 7. Fallback markers

Use only where an element is not already sufficiently represented by a higher structural role:

- `N` — noun-like element / noun fragment.
- `Adj` — adjective-like modifier or adjective fragment.
- `Adv` — adverbial modifier or adverb fragment.
- `Prep` — preposition/prepositional element when independently useful.
- `Voc` — vocative.
- `Int` — interjection.
- `Resp` — standalone response such as yes/no.
- `Frag` — fragment indicator for incomplete/non-sentential utterance.
- `Other` — residual element only when no more precise marker applies.

Do not force a marker onto every token. Do not split a coherent S/O/C noun phrase into token-level labels merely to increase coverage.

## 8. Dialogue and non-sentences

- Never restore an omitted S/V in the displayed analysis.
- Imperative: mark the expressed V; do not create an invisible `you` S.
- Question: keep original word order; roles are determined functionally.
- WH item: if it functions as S/O/C/Adv, mark that function rather than merely calling it a question word.
- Vocative is not S.
- Interjection is not forced into S/O/C.
- Standalone noun/adjective/adverb/response uses the fallback marker.
- Interrupted, repaired, or unfinished dialogue may be `Frag`; punctuation/dashes/ellipsis are boundaries, not invented grammatical material.
- Tag questions, parenthetical insertions, and quotations are structurally separate where needed; do not flatten them into one false S/V sequence.

## 9. Chunk span policy

- All offsets are zero-based half-open offsets into the exact canonical speech/sentence text.
- Output must not duplicate the copyrighted script text; store IDs, offsets, labels, relations, and metadata only.
- S/O/C should normally cover the coherent phrase, not just the head token.
- Clause spans may overlap their outer S/O/C role span by design.
- Nested clauses are represented by parent IDs and `functionInParent`.
- No fallback/raw coordinate mode is permitted in v1 production. Every one of the 1164 speeches must map exactly to the canonical script text.

## 10. Required QA invariants

A production build is invalid if any of these fail:

1. exactly 1164 expected speech IDs;
2. every sentence span maps exactly inside its speech and sentence gaps contain whitespace only;
3. every clause/chunk span is nonempty and inside its sentence;
4. allowed clause markers only: BC/AC/NC/RC + number;
5. numbered core markers only: S/V/O/C + existing clause number (optional a/b suffix);
6. HV is never numbered;
7. Vi/Vt/VBN and aggregate auxiliary+V wrappers do not exist;
8. nested clause links reference real clauses;
9. a nested clause functioning as outer S/O/C has a corresponding outer role span;
10. no fabricated text and no fallback/rawLines path;
11. deterministic rebuild from the same script + pinned parser produces byte-equivalent structural data apart from explicitly excluded build metadata;
12. unresolved validation errors = 0.
