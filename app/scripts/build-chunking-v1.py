#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import re
from collections import Counter, defaultdict
from pathlib import Path
from typing import Iterable

import spacy
from spacy.tokens import Doc, Span, Token

SCENES = (
    ("act1-scene1", 190),
    ("act1-scene2", 336),
    ("act2", 638),
)

CLAUSE_TYPES = {"BC", "AC", "NC", "RC"}
CORE_ROLES = {"S", "V", "O", "C"}
FALLBACK_MARKERS = {"HV", "ACC", "Conj", "N", "Adj", "Adv", "Prep", "Voc", "Int", "Resp", "Frag", "Other"}
RESPONSE_WORDS = {"yes", "no", "yeah", "yep", "nope", "certainly", "sure", "right"}
RELATIVE_WORDS = {"that", "who", "whom", "whose", "which", "where", "when"}
SUBJECT_DEPS = {"nsubj", "nsubjpass", "csubj", "csubjpass", "expl"}
OBJECT_DEPS = {"obj", "dobj", "iobj", "dative"}
COMPLEMENT_DEPS = {"attr", "acomp", "oprd"}
AUX_DEPS = {"aux", "auxpass"}
CLAUSAL_DEPS = {"advcl", "ccomp", "xcomp", "csubj", "csubjpass", "relcl", "acl", "parataxis"}
LINKING_LEMMAS = {"be", "become", "seem", "appear", "remain", "feel", "look", "sound", "smell", "taste", "grow", "turn", "prove"}


def fail(message: str) -> None:
    raise RuntimeError(message)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def expected_ids() -> list[str]:
    return [f"{scene}-speech-{i:04d}" for scene, count in SCENES for i in range(1, count + 1)]


def token_end(token: Token) -> int:
    return token.idx + len(token.text)


def local_span_from_tokens(tokens: Iterable[Token], sentence: Span) -> tuple[int, int] | None:
    seq = [t for t in tokens if sentence.start <= t.i < sentence.end and not t.is_space]
    if not seq:
        return None
    seq.sort(key=lambda t: t.i)
    while seq and seq[0].is_punct:
        seq.pop(0)
    while seq and seq[-1].is_punct:
        seq.pop()
    if not seq:
        return None
    return seq[0].idx - sentence.start_char, token_end(seq[-1]) - sentence.start_char


def branch_tokens(root: Token, excluded_deps: set[str]) -> list[Token]:
    out: list[Token] = []
    stack = [root]
    while stack:
        tok = stack.pop()
        out.append(tok)
        for child in reversed(list(tok.children)):
            if child.dep_ in excluded_deps:
                continue
            stack.append(child)
    return out


def is_explicit_subject(head: Token) -> bool:
    return any(child.dep_ in SUBJECT_DEPS for child in head.children)


def is_imperative_root(root: Token) -> bool:
    if root.pos_ != "VERB" or root.tag_ not in {"VB", "VBP"}:
        return False
    if any(child.dep_ in SUBJECT_DEPS for child in root.children):
        return False
    if any(child.dep_ == "mark" and child.lower_ == "to" for child in root.children):
        return False
    return True


def has_finite_predicate(head: Token) -> bool:
    if any(child.dep_ == "cop" and ("Fin" in child.morph.get("VerbForm") or child.tag_ in {"VBD", "VBP", "VBZ", "MD"}) for child in head.children):
        return True
    forms = set(head.morph.get("VerbForm"))
    if "Fin" in forms or head.tag_ in {"VBD", "VBP", "VBZ", "MD"}:
        return True
    return is_imperative_root(head)


def clause_candidate_type(token: Token, sentence: Span) -> str | None:
    dep = token.dep_
    if token == sentence.root:
        return "BC" if has_finite_predicate(token) else None
    if dep == "advcl":
        return "AC"
    if dep in {"ccomp", "xcomp", "csubj", "csubjpass"}:
        return "NC"
    if dep in {"relcl", "acl"}:
        return "RC"
    if dep == "parataxis" and (token.pos_ in {"VERB", "AUX"} or any(c.dep_ == "cop" for c in token.children)):
        return "BC"
    if dep == "conj" and token.pos_ in {"VERB", "AUX", "ADJ", "NOUN", "PROPN"}:
        if is_explicit_subject(token) and (has_finite_predicate(token) or any(c.dep_ == "cop" for c in token.children)):
            return "BC"
    return None


def clause_function(token: Token, parent_head: Token | None) -> str | None:
    dep = token.dep_
    if dep in {"csubj", "csubjpass"}:
        return "S"
    if dep == "ccomp":
        return "O"
    if dep == "xcomp":
        if parent_head is not None:
            if parent_head.lemma_.lower() in LINKING_LEMMAS:
                return "C"
            if any(c.dep_ in OBJECT_DEPS for c in parent_head.children):
                return "C"
        return "O"
    if dep == "advcl":
        return "Adv"
    if dep in {"relcl", "acl"}:
        return "Adj"
    if dep == "pcomp":
        return "Prep"
    return None


def clause_span(head: Token, ctype: str, candidate_heads: dict[int, str], sentence: Span) -> tuple[int, int]:
    excluded: set[int] = set()
    if ctype in {"BC", "AC"}:
        for desc in head.subtree:
            if desc.i == head.i or desc.i not in candidate_heads:
                continue
            if candidate_heads[desc.i] in {"AC", "BC"}:
                excluded.update(t.i for t in desc.subtree)
    tokens = [t for t in head.subtree if t.i not in excluded]
    span = local_span_from_tokens(tokens, sentence)
    if span is None:
        span = (head.idx - sentence.start_char, token_end(head) - sentence.start_char)
    return span


def nearest_parent_clause(head: Token, candidate_heads: dict[int, str]) -> int | None:
    cur = head.head
    seen = set()
    while cur.i not in seen:
        seen.add(cur.i)
        if cur.i in candidate_heads:
            return cur.i
        if cur.head == cur:
            break
        cur = cur.head
    return None


def nearest_clause_for_token(token: Token, clause_by_head: dict[int, dict]) -> dict | None:
    cur = token
    seen = set()
    while cur.i not in seen:
        seen.add(cur.i)
        if cur.i in clause_by_head:
            return clause_by_head[cur.i]
        if cur.head == cur:
            break
        cur = cur.head
    return None


def span_contains(span: tuple[int, int], other: tuple[int, int]) -> bool:
    return span[0] <= other[0] and other[1] <= span[1]


def role_span(token: Token, sentence: Span) -> tuple[int, int] | None:
    return local_span_from_tokens(token.subtree, sentence)


def add_chunk(chunks: list[dict], sentence: Span, marker: str, start: int, end: int,
              clause_id: str | None, layer: str, source: str = "parser", **extra) -> None:
    if end <= start:
        return
    item = {"start": int(start), "end": int(end), "marker": marker, "clauseId": clause_id, "layer": layer, "source": source}
    for key, value in extra.items():
        if value is not None:
            item[key] = value
    chunks.append(item)


def number_role_chunks(items: list[tuple[str, tuple[int, int], Token | None]], clause_no: int) -> list[tuple[str, tuple[int, int], Token | None]]:
    grouped: dict[str, list[tuple[str, tuple[int, int], Token | None]]] = defaultdict(list)
    for item in items:
        grouped[item[0]].append(item)
    out: list[tuple[str, tuple[int, int], Token | None]] = []
    for role in ("S", "V", "O", "C"):
        seq = sorted(grouped.get(role, []), key=lambda x: (x[1][0], x[1][1]))
        for idx, (_, span, tok) in enumerate(seq):
            suffix = "" if len(seq) == 1 else chr(ord("a") + idx)
            out.append((f"{role}{clause_no}{suffix}", span, tok))
    return out


def clause_predicate_heads(clause_head: Token, candidate_heads: dict[int, str]) -> list[Token]:
    heads = [clause_head]
    for tok in clause_head.subtree:
        if tok.i == clause_head.i or tok.dep_ != "conj" or tok.pos_ not in {"VERB", "AUX", "ADJ", "NOUN", "PROPN"}:
            continue
        if tok.i in candidate_heads:
            continue
        cur = tok.head
        nested = False
        while cur != clause_head and cur.head != cur:
            if cur.i in candidate_heads:
                nested = True
                break
            cur = cur.head
        if not nested:
            heads.append(tok)
    return sorted({h.i: h for h in heads}.values(), key=lambda t: t.i)


def phrase_without_branches(head: Token, sentence: Span, excluded_deps: set[str]) -> tuple[int, int] | None:
    return local_span_from_tokens(branch_tokens(head, excluded_deps), sentence)


def build_roles_for_clause(clause: dict, head: Token, sentence: Span,
                           candidate_heads: dict[int, str], clause_by_head: dict[int, dict]) -> list[dict]:
    role_items: list[tuple[str, tuple[int, int], Token | None]] = []
    aux_items: list[Token] = []
    modifier_items: list[tuple[str, tuple[int, int], Token]] = []

    predicates = clause_predicate_heads(head, candidate_heads)
    for pred in predicates:
        cop = next((c for c in pred.children if c.dep_ == "cop"), None)
        if cop is not None:
            aux_items.extend(c for c in pred.children if c.dep_ in AUX_DEPS and c.i != cop.i)
            role_items.append(("V", (cop.idx - sentence.start_char, token_end(cop) - sentence.start_char), cop))
            cspan = phrase_without_branches(pred, sentence, SUBJECT_DEPS | {"cop", "aux", "auxpass", "mark", "punct", "advcl", "parataxis", "cc"})
            if cspan:
                role_items.append(("C", cspan, pred))
        else:
            if pred.pos_ == "AUX" and pred.tag_ == "MD":
                aux_items.append(pred)
            else:
                role_items.append(("V", (pred.idx - sentence.start_char, token_end(pred) - sentence.start_char), pred))
            aux_items.extend(c for c in pred.children if c.dep_ in AUX_DEPS)

        for child in pred.children:
            if child.dep_ in SUBJECT_DEPS:
                if child.dep_.startswith("csubj") and child.i in clause_by_head:
                    continue
                sp = role_span(child, sentence)
                if sp:
                    role_items.append(("S", sp, child))
            elif child.dep_ in OBJECT_DEPS:
                sp = role_span(child, sentence)
                if sp:
                    role_items.append(("O", sp, child))
            elif child.dep_ in COMPLEMENT_DEPS:
                sp = role_span(child, sentence)
                if sp:
                    role_items.append(("C", sp, child))
            elif child.dep_ in {"advmod", "npadvmod"}:
                sp = role_span(child, sentence)
                if sp:
                    modifier_items.append(("Adv", sp, child))
            elif child.dep_ == "prep":
                sp = role_span(child, sentence)
                if sp:
                    modifier_items.append(("Prep", sp, child))

    numbered = number_role_chunks(role_items, clause["number"])
    chunks: list[dict] = []
    seen = set()
    for marker, sp, tok in numbered:
        key = (marker, *sp)
        if key in seen:
            continue
        seen.add(key)
        add_chunk(chunks, sentence, marker, sp[0], sp[1], clause["id"], "role", tokenDep=tok.dep_ if tok else None)

    for aux in sorted({t.i: t for t in aux_items}.values(), key=lambda t: t.i):
        add_chunk(chunks, sentence, "HV", aux.idx - sentence.start_char, token_end(aux) - sentence.start_char,
                  clause["id"], "auxiliary", tokenDep=aux.dep_)

    core_spans = [(c["start"], c["end"]) for c in chunks if re.match(r"^[SVOC]\d", c["marker"])]
    for marker, sp, tok in modifier_items:
        if any(span_contains(core, sp) for core in core_spans):
            continue
        add_chunk(chunks, sentence, marker, sp[0], sp[1], clause["id"], "modifier", tokenDep=tok.dep_)
    return chunks


def classify_fragment(sentence: Span) -> tuple[str, list[dict]]:
    text = sentence.text.strip()
    chunks: list[dict] = []
    if not text:
        return "fragment", chunks
    non_punct = [t for t in sentence if not t.is_space and not t.is_punct]
    if len(non_punct) == 1 and non_punct[0].lower_ in RESPONSE_WORDS:
        tok = non_punct[0]
        add_chunk(chunks, sentence, "Resp", tok.idx - sentence.start_char, token_end(tok) - sentence.start_char,
                  None, "fragment", posHint=tok.pos_)
        return "fragment", chunks

    covered: list[tuple[int, int]] = []
    for tok in non_punct:
        marker = "Voc" if tok.dep_ == "vocative" else "Int" if tok.pos_ == "INTJ" else None
        if marker:
            sp = role_span(tok, sentence) or (tok.idx - sentence.start_char, token_end(tok) - sentence.start_char)
            add_chunk(chunks, sentence, marker, sp[0], sp[1], None, "fragment", posHint=tok.pos_)
            covered.append(sp)

    remaining = [t for t in non_punct if not any(a <= t.idx - sentence.start_char and token_end(t) - sentence.start_char <= b for a, b in covered)]
    if remaining:
        root = sentence.root
        root_sp = local_span_from_tokens(root.subtree, sentence) or (0, len(sentence.text))
        if root.pos_ in {"NOUN", "PROPN", "PRON", "DET"}:
            marker = "N"
        elif root.pos_ == "ADJ":
            marker = "Adj"
        elif root.pos_ == "ADV":
            marker = "Adv"
        elif root.pos_ == "INTJ":
            marker = "Int"
        else:
            marker = "Frag"
        add_chunk(chunks, sentence, marker, root_sp[0], root_sp[1], None, "fragment", posHint=root.pos_, tokenDep=root.dep_)
    return "fragment", chunks


def analyze_sentence(sentence: Span, speech_id: str, sent_no: int) -> dict:
    candidate_heads: dict[int, str] = {}
    for tok in sentence:
        ctype = clause_candidate_type(tok, sentence)
        if ctype:
            candidate_heads[tok.i] = ctype

    if sentence.root.i not in candidate_heads:
        kind, chunks = classify_fragment(sentence)
        for idx, chunk in enumerate(sorted(chunks, key=lambda c: (c["start"], c["end"], c["marker"])), 1):
            chunk["id"] = f"CHK-{speech_id}-{sent_no:02d}-{idx:02d}"
        return {"id": f"SEN-{speech_id}-{sent_no:02d}", "start": sentence.start_char, "end": sentence.end_char,
                "kind": kind, "clauses": [], "chunks": chunks}

    provisional: list[dict] = []
    for head_i, ctype in candidate_heads.items():
        head = sentence.doc[head_i]
        start, end = clause_span(head, ctype, candidate_heads, sentence)
        provisional.append({"head": head, "type": ctype, "start": start, "end": end,
                            "parentHead": nearest_parent_clause(head, candidate_heads)})
    provisional.sort(key=lambda c: (c["start"], c["end"] - c["start"], c["head"].i))

    clause_by_head: dict[int, dict] = {}
    for no, item in enumerate(provisional, 1):
        cid = f"CL-{speech_id}-{sent_no:02d}-{no:02d}"
        clause_by_head[item["head"].i] = {
            "id": cid, "type": item["type"], "number": no, "marker": f"{item['type']}{no}",
            "start": item["start"], "end": item["end"], "headIndex": item["head"].i - sentence.start,
            "parentClauseId": None, "functionInParent": None,
        }

    for item in provisional:
        clause = clause_by_head[item["head"].i]
        if item["parentHead"] is not None and item["parentHead"] in clause_by_head:
            parent = clause_by_head[item["parentHead"]]
            clause["parentClauseId"] = parent["id"]
            clause["functionInParent"] = clause_function(item["head"], sentence.doc[item["parentHead"]])

    chunks: list[dict] = []
    for item in provisional:
        clause = clause_by_head[item["head"].i]
        chunks.extend(build_roles_for_clause(clause, item["head"], sentence, candidate_heads, clause_by_head))

    for item in provisional:
        clause = clause_by_head[item["head"].i]
        if clause["parentClauseId"] is None or clause["functionInParent"] not in CORE_ROLES:
            continue
        parent = next(c for c in clause_by_head.values() if c["id"] == clause["parentClauseId"])
        marker = f"{clause['functionInParent']}{parent['number']}"
        add_chunk(chunks, sentence, marker, clause["start"], clause["end"], parent["id"], "role",
                  source="relation", nestedClauseId=clause["id"])

    for tok in sentence:
        owning = nearest_clause_for_token(tok, clause_by_head)
        cid = owning["id"] if owning else None
        if tok.dep_ == "mark" and tok.lower_ != "to":
            add_chunk(chunks, sentence, "ACC", tok.idx - sentence.start_char, token_end(tok) - sentence.start_char,
                      cid, "connector", tokenDep=tok.dep_)
        elif tok.dep_ == "cc" or tok.pos_ == "CCONJ":
            add_chunk(chunks, sentence, "Conj", tok.idx - sentence.start_char, token_end(tok) - sentence.start_char,
                      cid, "connector", tokenDep=tok.dep_)
        elif tok.dep_ == "vocative":
            sp = role_span(tok, sentence)
            if sp:
                add_chunk(chunks, sentence, "Voc", sp[0], sp[1], cid, "dialogue", tokenDep=tok.dep_)
        elif tok.pos_ == "INTJ":
            add_chunk(chunks, sentence, "Int", tok.idx - sentence.start_char, token_end(tok) - sentence.start_char,
                      cid, "dialogue", tokenDep=tok.dep_)

    dedup: dict[tuple, dict] = {}
    for chunk in chunks:
        key = (chunk["start"], chunk["end"], chunk["marker"], chunk.get("clauseId"))
        if key not in dedup:
            dedup[key] = chunk
        else:
            for k, v in chunk.items():
                if k not in dedup[key] and v is not None:
                    dedup[key][k] = v
    chunks = sorted(dedup.values(), key=lambda c: (c["start"], c["end"], c["marker"], c.get("clauseId") or ""))
    for idx, chunk in enumerate(chunks, 1):
        chunk["id"] = f"CHK-{speech_id}-{sent_no:02d}-{idx:02d}"

    return {"id": f"SEN-{speech_id}-{sent_no:02d}", "start": sentence.start_char, "end": sentence.end_char,
            "kind": "sentence", "clauses": sorted(clause_by_head.values(), key=lambda c: c["number"]), "chunks": chunks}


def analyze_speech(nlp, scene_id: str, speech: dict) -> tuple[dict, Counter]:
    text = str(speech.get("text", ""))
    if not text.strip():
        fail(f"empty speech text: {speech.get('id')}")
    doc: Doc = nlp(text)
    sentences = list(doc.sents)
    if not sentences:
        fail(f"no sentences produced: {speech['id']}")
    rows: list[dict] = []
    metrics = Counter()
    for sent_no, sentence in enumerate(sentences, 1):
        row = analyze_sentence(sentence, speech["id"], sent_no)
        rows.append(row)
        metrics["sentences"] += 1
        metrics["fragments"] += int(row["kind"] == "fragment")
        metrics["clauses"] += len(row["clauses"])
        metrics["chunks"] += len(row["chunks"])
        metrics.update({f"clause_{c['type']}": 1 for c in row["clauses"]})
        for chunk in row["chunks"]:
            base = re.sub(r"\d+[a-z]?$", "", chunk["marker"])
            metrics[f"marker_{base}"] += 1
    return {"sceneId": scene_id, "ordinal": speech["ordinal"], "speechLength": len(text), "sentences": rows}, metrics


def build(root: Path, out: Path, model_name: str) -> dict:
    script_path = root / "mousetrap_script_data.json"
    script = json.loads(script_path.read_text(encoding="utf-8"))
    expected = expected_ids()
    actual: list[str] = []
    for scene, count in SCENES:
        speeches = script.get(scene, {}).get("speeches")
        if not isinstance(speeches, list) or len(speeches) != count:
            fail(f"script scene count {scene}: {len(speeches) if isinstance(speeches, list) else 'invalid'}/{count}")
        for i, speech in enumerate(speeches, 1):
            eid = f"{scene}-speech-{i:04d}"
            if speech.get("id") != eid or speech.get("ordinal") != i:
                fail(f"script identity mismatch: {scene} #{i}")
            actual.append(eid)
    if actual != expected:
        fail("script speech ID sequence mismatch")

    nlp = spacy.load(model_name)
    if not nlp.has_pipe("parser"):
        fail(f"spaCy model {model_name} has no dependency parser")

    lines: dict[str, dict] = {}
    totals = Counter()
    scene_stats: dict[str, dict] = {}
    for scene, _ in SCENES:
        per_scene = Counter()
        for speech in script[scene]["speeches"]:
            line, metrics = analyze_speech(nlp, scene, speech)
            lines[speech["id"]] = line
            totals.update(metrics)
            per_scene.update(metrics)
            totals["speeches"] += 1
            per_scene["speeches"] += 1
        scene_stats[scene] = dict(sorted(per_scene.items()))

    meta = nlp.meta or {}
    payload = {
        "schemaVersion": 2,
        "ruleSet": "chunking-v1",
        "source": "mousetrap_script_data.json",
        "sourceSha256": sha256(script_path),
        "copyrightSafe": True,
        "coordinateSystem": "speech-local sentence spans and sentence-local zero-based half-open clause/chunk spans",
        "parser": {"library": "spacy", "libraryVersion": spacy.__version__, "model": model_name,
                   "modelVersion": str(meta.get("version", "unknown")), "language": str(meta.get("lang", "en"))},
        "markerSets": {"clauses": ["BC", "AC", "NC", "RC"], "coreRoles": ["S", "V", "O", "C"],
                       "unnumbered": ["HV", "ACC", "Conj", "N", "Adj", "Adv", "Prep", "Voc", "Int", "Resp", "Frag", "Other"]},
        "counts": dict(sorted(totals.items())),
        "sceneStats": scene_stats,
        "lines": lines,
    }
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    return payload


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", default=str(Path(__file__).resolve().parents[2]))
    parser.add_argument("--out", default=None)
    parser.add_argument("--model", default="en_core_web_sm")
    args = parser.parse_args()
    root = Path(args.root).resolve()
    out = Path(args.out).resolve() if args.out else root / "app" / "mousetrap_line_structure.json"
    payload = build(root, out, args.model)
    print(json.dumps({"status": "BUILT", "out": str(out), "schemaVersion": payload["schemaVersion"],
                      "ruleSet": payload["ruleSet"], "parser": payload["parser"], "counts": payload["counts"],
                      "bytes": out.stat().st_size, "sha256": sha256(out)}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
