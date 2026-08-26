#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import re
from collections import Counter
from pathlib import Path

SCENES = (("act1-scene1", 190), ("act1-scene2", 336), ("act2", 638))
CLAUSE_TYPES = {"BC", "AC", "NC", "RC"}
UNNUMBERED = {"HV", "ACC", "Conj", "N", "Adj", "Adv", "Prep", "Voc", "Int", "Resp", "Frag", "Other"}
CORE_RE = re.compile(r"^(S|V|O|C)(\d+)([a-z])?$")
CLAUSE_RE = re.compile(r"^(BC|AC|NC|RC)(\d+)$")
BANNED = {"Vi", "Vt", "VBN"}


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def expected_ids() -> list[str]:
    return [f"{scene}-speech-{i:04d}" for scene, count in SCENES for i in range(1, count + 1)]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=str(Path(__file__).resolve().parents[2]))
    ap.add_argument("--structure", default=None)
    ap.add_argument("--report", default=None)
    args = ap.parse_args()
    root = Path(args.root).resolve()
    structure_path = Path(args.structure).resolve() if args.structure else root / "app" / "mousetrap_line_structure.json"
    report_path = Path(args.report).resolve() if args.report else root / "data" / "chunking-v1-qa.json"
    script_path = root / "mousetrap_script_data.json"

    script = json.loads(script_path.read_text(encoding="utf-8"))
    data = json.loads(structure_path.read_text(encoding="utf-8"))
    errors: list[dict] = []
    warnings: list[dict] = []
    metrics = Counter()

    def err(code: str, where: str, detail: str) -> None:
        errors.append({"code": code, "where": where, "detail": detail})

    def warn(code: str, where: str, detail: str) -> None:
        if len(warnings) < 2000:
            warnings.append({"code": code, "where": where, "detail": detail})
        metrics[f"warning_{code}"] += 1

    if data.get("schemaVersion") != 2:
        err("SCHEMA", "$", f"schemaVersion={data.get('schemaVersion')!r}")
    if data.get("ruleSet") != "chunking-v1":
        err("RULESET", "$", f"ruleSet={data.get('ruleSet')!r}")
    if data.get("sourceSha256") != sha256(script_path):
        err("SOURCE_SHA", "$", "structure does not match canonical script bytes")
    if "rawLines" in data:
        err("FALLBACK_FORBIDDEN", "$", "rawLines/fallback path is not allowed in v1")

    lines = data.get("lines")
    if not isinstance(lines, dict):
        err("LINES_TYPE", "$", "lines must be an object")
        lines = {}
    expected = expected_ids()
    if list(lines.keys()) != expected:
        missing = [x for x in expected if x not in lines]
        extra = [x for x in lines if x not in set(expected)]
        err("SPEECH_COVERAGE", "$.lines", f"keys/order invalid; missing={missing[:8]} extra={extra[:8]}")

    script_by_id = {}
    for scene, count in SCENES:
        rows = script.get(scene, {}).get("speeches", [])
        if len(rows) != count:
            err("SCRIPT_SCENE_COUNT", scene, f"{len(rows)}/{count}")
        for i, speech in enumerate(rows, 1):
            script_by_id[speech.get("id")] = speech

    seen_sentence_ids: set[str] = set()
    seen_clause_ids: set[str] = set()
    seen_chunk_ids: set[str] = set()

    for speech_id in expected:
        if speech_id not in lines or speech_id not in script_by_id:
            continue
        line = lines[speech_id]
        text = str(script_by_id[speech_id].get("text", ""))
        where_line = f"lines.{speech_id}"
        metrics["speeches"] += 1
        if line.get("speechLength") != len(text):
            err("SPEECH_LENGTH", where_line, f"{line.get('speechLength')}/{len(text)}")
        sentences = line.get("sentences")
        if not isinstance(sentences, list) or not sentences:
            err("SENTENCES", where_line, "nonempty sentences array required")
            continue

        cursor = 0
        for si, sentence in enumerate(sentences, 1):
            sw = f"{where_line}.sentences[{si-1}]"
            sid = sentence.get("id")
            if not sid or sid in seen_sentence_ids:
                err("SENTENCE_ID", sw, f"missing/duplicate id {sid!r}")
            else:
                seen_sentence_ids.add(sid)
            start, end = sentence.get("start"), sentence.get("end")
            if not isinstance(start, int) or not isinstance(end, int) or not (0 <= start < end <= len(text)):
                err("SENTENCE_SPAN", sw, f"invalid span {start!r}-{end!r}/{len(text)}")
                continue
            if start < cursor:
                err("SENTENCE_OVERLAP", sw, f"starts {start} before previous end {cursor}")
            if start >= cursor and text[cursor:start].strip():
                err("SENTENCE_GAP", sw, f"non-whitespace gap {cursor}-{start}")
            cursor = max(cursor, end)
            sentence_text = text[start:end]
            slen = len(sentence_text)
            metrics["sentences"] += 1
            kind = sentence.get("kind")
            clauses = sentence.get("clauses")
            chunks = sentence.get("chunks")
            if not isinstance(clauses, list) or not isinstance(chunks, list):
                err("SENTENCE_ARRAYS", sw, "clauses/chunks arrays required")
                continue
            if kind == "sentence" and not clauses:
                err("SENTENCE_NO_CLAUSE", sw, "sentence kind requires clauses")
            if kind == "fragment" and clauses:
                err("FRAGMENT_HAS_CLAUSE", sw, "fragment must not fabricate clauses")
            if kind not in {"sentence", "fragment"}:
                err("SENTENCE_KIND", sw, f"unknown kind {kind!r}")
            metrics["fragments"] += int(kind == "fragment")

            clause_map: dict[str, dict] = {}
            clause_number_map: dict[int, dict] = {}
            expected_numbers = list(range(1, len(clauses) + 1))
            actual_numbers = [c.get("number") for c in clauses]
            if actual_numbers != expected_numbers:
                err("CLAUSE_NUMBER_SEQUENCE", sw, f"{actual_numbers!r} != {expected_numbers!r}")
            for ci, clause in enumerate(clauses, 1):
                cw = f"{sw}.clauses[{ci-1}]"
                cid = clause.get("id")
                if not cid or cid in seen_clause_ids:
                    err("CLAUSE_ID", cw, f"missing/duplicate id {cid!r}")
                else:
                    seen_clause_ids.add(cid)
                ctype = clause.get("type")
                no = clause.get("number")
                marker = clause.get("marker")
                m = CLAUSE_RE.match(str(marker or ""))
                if ctype not in CLAUSE_TYPES or not m or m.group(1) != ctype or int(m.group(2)) != no:
                    err("CLAUSE_MARKER", cw, f"type={ctype!r} number={no!r} marker={marker!r}")
                cs, ce = clause.get("start"), clause.get("end")
                if not isinstance(cs, int) or not isinstance(ce, int) or not (0 <= cs < ce <= slen):
                    err("CLAUSE_SPAN", cw, f"invalid {cs!r}-{ce!r}/{slen}")
                if cid:
                    clause_map[cid] = clause
                if isinstance(no, int):
                    clause_number_map[no] = clause
                metrics["clauses"] += 1
                metrics[f"clause_{ctype}"] += 1

            for ci, clause in enumerate(clauses, 1):
                cw = f"{sw}.clauses[{ci-1}]"
                parent_id = clause.get("parentClauseId")
                fn = clause.get("functionInParent")
                if parent_id is not None:
                    if parent_id not in clause_map:
                        err("CLAUSE_PARENT", cw, f"unknown parent {parent_id!r}")
                    if fn not in {"S", "O", "C", "Adv", "Adj", "Prep", None}:
                        err("CLAUSE_FUNCTION", cw, f"invalid function {fn!r}")
                elif fn is not None:
                    err("ORPHAN_FUNCTION", cw, f"function without parent {fn!r}")

                # Detect parent cycles.
                walk = clause
                visited = {clause.get("id")}
                while walk.get("parentClauseId") is not None:
                    nxt = walk.get("parentClauseId")
                    if nxt in visited:
                        err("CLAUSE_CYCLE", cw, f"cycle through {nxt}")
                        break
                    visited.add(nxt)
                    walk = clause_map.get(nxt, {})
                    if not walk:
                        break

            exact_chunk_keys = set()
            for ki, chunk in enumerate(chunks, 1):
                kw = f"{sw}.chunks[{ki-1}]"
                chid = chunk.get("id")
                if not chid or chid in seen_chunk_ids:
                    err("CHUNK_ID", kw, f"missing/duplicate id {chid!r}")
                else:
                    seen_chunk_ids.add(chid)
                start2, end2 = chunk.get("start"), chunk.get("end")
                if not isinstance(start2, int) or not isinstance(end2, int) or not (0 <= start2 < end2 <= slen):
                    err("CHUNK_SPAN", kw, f"invalid {start2!r}-{end2!r}/{slen}")
                    continue
                marker = str(chunk.get("marker") or "")
                if marker in BANNED or marker.startswith("Vi") or marker.startswith("Vt") or "VBN" in marker:
                    err("BANNED_MARKER", kw, marker)
                core = CORE_RE.match(marker)
                if core:
                    no = int(core.group(2))
                    clause = clause_number_map.get(no)
                    if not clause:
                        err("ROLE_CLAUSE_NUMBER", kw, f"marker {marker} has no clause {no}")
                    elif chunk.get("clauseId") != clause.get("id"):
                        err("ROLE_CLAUSE_LINK", kw, f"{marker} links {chunk.get('clauseId')!r}, expected {clause.get('id')!r}")
                elif marker not in UNNUMBERED:
                    err("UNKNOWN_MARKER", kw, marker)
                if marker.startswith("HV") and marker != "HV":
                    err("HV_NUMBERED", kw, marker)
                cid = chunk.get("clauseId")
                if cid is not None and cid not in clause_map:
                    err("CHUNK_CLAUSE_LINK", kw, f"unknown clause {cid!r}")
                nested = chunk.get("nestedClauseId")
                if nested is not None and nested not in clause_map:
                    err("NESTED_LINK", kw, f"unknown nested clause {nested!r}")
                key = (start2, end2, marker, cid)
                if key in exact_chunk_keys:
                    err("DUPLICATE_CHUNK", kw, repr(key))
                exact_chunk_keys.add(key)
                metrics["chunks"] += 1
                metrics[f"marker_{core.group(1) if core else marker}"] += 1

            # Every nested S/O/C clause must have the explicit outer role relation span.
            for clause in clauses:
                fn = clause.get("functionInParent")
                parent_id = clause.get("parentClauseId")
                if fn not in {"S", "O", "C"} or parent_id not in clause_map:
                    continue
                parent = clause_map[parent_id]
                expected_marker = f"{fn}{parent['number']}"
                matched = [c for c in chunks if c.get("marker") == expected_marker and c.get("clauseId") == parent_id
                           and c.get("nestedClauseId") == clause.get("id") and c.get("start") == clause.get("start")
                           and c.get("end") == clause.get("end")]
                if not matched:
                    err("MISSING_OUTER_ROLE", sw, f"{clause.get('id')} -> {expected_marker}")

            if kind == "sentence":
                bc = [c for c in clauses if c.get("type") == "BC"]
                if not bc:
                    err("NO_BC", sw, "complete sentence requires a BC")
                for clause in bc:
                    no = clause.get("number")
                    if not any(re.match(fr"^V{no}[a-z]?$", str(c.get("marker"))) for c in chunks):
                        warn("BC_WITHOUT_LEXICAL_V", sw, clause.get("marker", "BC"))
                    if not any(re.match(fr"^S{no}[a-z]?$", str(c.get("marker"))) for c in chunks):
                        warn("BC_WITHOUT_EXPLICIT_S", sw, clause.get("marker", "BC"))
            else:
                if not chunks:
                    warn("EMPTY_FRAGMENT", sw, "fragment has no useful marker")

        if text[cursor:].strip():
            err("TRAILING_SPEECH_GAP", where_line, f"unmapped non-whitespace tail {cursor}-{len(text)}")

    # Validate count fields against actual materialized values rather than old frozen 2277/8055 counts.
    declared = data.get("counts", {})
    for key in ("speeches", "sentences", "fragments", "clauses", "chunks"):
        if declared.get(key) != metrics.get(key, 0):
            err("COUNT_MISMATCH", f"counts.{key}", f"declared={declared.get(key)!r} actual={metrics.get(key, 0)}")

    report = {
        "schemaVersion": 1,
        "ruleSet": "chunking-v1",
        "status": "PASS" if not errors else "FAIL",
        "structureSha256": sha256(structure_path),
        "sourceSha256": sha256(script_path),
        "errorCount": len(errors),
        "warningCount": sum(v for k, v in metrics.items() if k.startswith("warning_")),
        "metrics": dict(sorted(metrics.items())),
        "errors": errors[:1000],
        "warnings": warnings,
    }
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({k: report[k] for k in ("status", "structureSha256", "errorCount", "warningCount", "metrics")}, ensure_ascii=False, indent=2))
    if errors:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
