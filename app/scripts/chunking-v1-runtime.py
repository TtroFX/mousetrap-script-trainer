#!/usr/bin/env python3
from __future__ import annotations

import argparse
import importlib.util
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("chunking_v1_core", HERE / "build-chunking-v1.py")
core = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(core)

_original_has_finite_predicate = core.has_finite_predicate
_original_analyze_sentence = core.analyze_sentence


def has_finite_predicate(head):
    # The lexical verb may be participial/infinitival while the clause is finite
    # because a separate auxiliary/modal carries finiteness: has finished, is
    # running, was opened, can go. HV remains a separate display marker.
    for child in head.children:
        if child.dep_ not in core.AUX_DEPS:
            continue
        forms = set(child.morph.get("VerbForm"))
        if "Fin" in forms or child.tag_ in {"MD", "VBD", "VBP", "VBZ"}:
            return True
    return _original_has_finite_predicate(head)


core.has_finite_predicate = has_finite_predicate


def repair_initial_that_subject_clause(row, sentence):
    """Repair a known English parser garden path.

    In patterns such as `That S V ... V O`, the small model can parse the first
    predicate as ROOT and the actual matrix predicate as `advcl`. When the
    sentence-initial `that` is a `mark` on the first predicate and the later
    predicate has no expressed subject, the first clause is the clausal subject
    of the later matrix clause. We preserve the original offsets and only
    correct structural labels/relations.
    """
    clauses = row.get("clauses", [])
    if len(clauses) < 2 or not sentence or sentence[0].lower_ != "that":
        return row
    first, second = clauses[0], clauses[1]
    if first.get("type") != "BC" or second.get("type") != "AC":
        return row
    first_head = sentence[first.get("headIndex", -1)] if 0 <= first.get("headIndex", -1) < len(sentence) else None
    second_head = sentence[second.get("headIndex", -1)] if 0 <= second.get("headIndex", -1) < len(sentence) else None
    if first_head is None or second_head is None:
        return row
    if first_head != sentence.root or second_head.dep_ != "advcl":
        return row
    if not any(c.dep_ == "mark" and c.lower_ == "that" for c in first_head.children):
        return row
    if any(c.dep_ in core.SUBJECT_DEPS for c in second_head.children):
        return row
    if first.get("end", 0) > second.get("start", 0):
        return row

    first["type"] = "NC"
    first["marker"] = f"NC{first['number']}"
    first["parentClauseId"] = second["id"]
    first["functionInParent"] = "S"
    second["type"] = "BC"
    second["marker"] = f"BC{second['number']}"
    second["parentClauseId"] = None
    second["functionInParent"] = None

    expected = f"S{second['number']}"
    if not any(c.get("marker") == expected and c.get("nestedClauseId") == first["id"] for c in row.get("chunks", [])):
        row["chunks"].append({
            "start": first["start"],
            "end": first["end"],
            "marker": expected,
            "clauseId": second["id"],
            "layer": "role",
            "source": "rule-repair",
            "nestedClauseId": first["id"],
        })
    row["chunks"].sort(key=lambda c: (c["start"], c["end"], c["marker"], c.get("clauseId") or ""))
    for idx, chunk in enumerate(row["chunks"], 1):
        chunk["id"] = f"CHK-{row['id'][4:].rsplit('-', 1)[0]}-{int(row['id'].rsplit('-', 1)[1]):02d}-{idx:02d}"
    return row


def analyze_sentence(sentence, speech_id, sent_no):
    return repair_initial_that_subject_clause(_original_analyze_sentence(sentence, speech_id, sent_no), sentence)


# Core analyze_speech resolves this global at execution time, so production build
# and tests both use the same repaired rule path.
core.analyze_sentence = analyze_sentence
build = core.build
sha256 = core.sha256


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", default=str(HERE.parents[1]))
    parser.add_argument("--out", default=None)
    parser.add_argument("--model", default="en_core_web_sm")
    args = parser.parse_args()
    root = Path(args.root).resolve()
    out = Path(args.out).resolve() if args.out else root / "app" / "mousetrap_line_structure.json"
    payload = core.build(root, out, args.model)
    print(json.dumps({
        "status": "BUILT",
        "out": str(out),
        "schemaVersion": payload["schemaVersion"],
        "ruleSet": payload["ruleSet"],
        "parser": payload["parser"],
        "counts": payload["counts"],
        "bytes": out.stat().st_size,
        "sha256": core.sha256(out),
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
