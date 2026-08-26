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
analyze_sentence = core.analyze_sentence
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
