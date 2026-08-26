#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
from pathlib import Path
import spacy

HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("chunking_v1", HERE / "build-chunking-v1.py")
mod = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(mod)

nlp = spacy.load("en_core_web_sm")


def analyze(text: str):
    doc = nlp(text)
    sents = list(doc.sents)
    assert len(sents) == 1, (text, len(sents))
    return mod.analyze_sentence(sents[0], "test-speech-0001", 1), text


def marked(row, text, marker):
    out = []
    sent_start = row["start"]
    sentence_text = text[row["start"]:row["end"]]
    for c in row["chunks"]:
        if c["marker"] == marker:
            out.append(sentence_text[c["start"]:c["end"]])
    return out


# AC/BC correspondence + ACC + separate unnumbered HV.
row, text = analyze("If you have finished your work, you can go home.")
assert [c["marker"] for c in row["clauses"]] == ["AC1", "BC2"], row["clauses"]
assert marked(row, text, "ACC") == ["If"]
assert marked(row, text, "S1") == ["you"]
assert marked(row, text, "HV") == ["have", "can"]
assert marked(row, text, "V1") == ["finished"]
assert marked(row, text, "O1") == ["your work"]
assert marked(row, text, "S2") == ["you"]
assert marked(row, text, "V2") == ["go"]
assert not any(c["marker"].startswith("HV") and c["marker"] != "HV" for c in row["chunks"])

# that-clause is a nested NC and simultaneously O of the outer clause.
row, text = analyze("I think that he is right.")
assert [c["marker"] for c in row["clauses"]] == ["BC1", "NC2"], row["clauses"]
assert marked(row, text, "ACC") == ["that"]
assert marked(row, text, "S1") == ["I"]
assert marked(row, text, "V1") == ["think"]
assert marked(row, text, "O1") == ["that he is right"]
assert marked(row, text, "S2") == ["he"]
assert marked(row, text, "V2") == ["is"]
assert marked(row, text, "C2") == ["right"]

# A clause itself can be the subject of an outer clause; no flattening.
row, text = analyze("That he lied surprised me.")
markers = [c["marker"] for c in row["clauses"]]
assert markers == ["NC1", "BC2"], row["clauses"]
assert marked(row, text, "S2") == ["That he lied"]
assert marked(row, text, "V2") == ["surprised"]
assert marked(row, text, "O2") == ["me"]

# Dialogue fragment: do not fabricate omitted S/HV.
row, text = analyze("Coming?")
assert row["kind"] == "fragment"
assert row["clauses"] == []
assert not any(c["marker"].startswith(("S", "V", "O", "C")) and any(ch.isdigit() for ch in c["marker"]) for c in row["chunks"])

print("chunking-v1 smoke tests: PASS")
