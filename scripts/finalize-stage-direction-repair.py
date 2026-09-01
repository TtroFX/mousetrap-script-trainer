from __future__ import annotations

import hashlib
import json
import re
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_VERSION = "canonical-2026-09-02-stage-direction-speech-fix-v1"


def load(path: str):
    return json.loads((ROOT / path).read_text(encoding="utf-8"))


def dump(path: str, value) -> None:
    (ROOT / path).write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def sha(path: str) -> str:
    return hashlib.sha256((ROOT / path).read_bytes()).hexdigest()


def sub_required(path: str, pattern: str, replacement: str, *, count: int = 0) -> None:
    p = ROOT / path
    text = p.read_text(encoding="utf-8")
    updated, n = re.subn(pattern, replacement, text, count=count)
    if n < 1:
        raise SystemExit(f"{path}: required pattern not found: {pattern}")
    p.write_text(updated, encoding="utf-8")


def replace_if_present(path: str, old: str, new: str) -> bool:
    p = ROOT / path
    text = p.read_text(encoding="utf-8")
    if old not in text:
        return False
    p.write_text(text.replace(old, new), encoding="utf-8")
    return True


structure = load("app/mousetrap_line_structure.json")
counts = structure["counts"]
sentences = int(counts["sentences"])
clauses = int(counts["clauses"])
chunks = int(counts["chunks"])
if int(counts["speeches"]) != 1164:
    raise SystemExit(f"unexpected speech count: {counts}")

stage = load("mousetrap_stage_directions.json")
entries = stage["entries"]
total = len(entries)
standalone = sum(e["kind"] == "scene-setting" for e in entries)
attached = sum(e["kind"] == "stage-direction" for e in entries)
actor_cues = sum(bool(e.get("actorCueForSpeech")) for e in entries)
malformed = sum(e.get("malformedSourceBracket") is True for e in entries)
scene_counts = Counter(e["sceneId"] for e in entries)
placements = Counter(e.get("placement") for e in entries if e["kind"] == "stage-direction")
metrics = (
    total,
    standalone,
    attached,
    actor_cues,
    malformed,
    scene_counts["act1-scene1"],
    scene_counts["act1-scene2"],
    scene_counts["act2"],
    placements["before"],
    placements["delivery"],
    placements["after"],
)
expected_metrics = (778, 5, 773, 612, 1, 185, 230, 363, 236, 411, 126)
if metrics != expected_metrics:
    raise SystemExit(f"unexpected repaired stage metrics: {metrics} != {expected_metrics}")

# Runtime structure contract.
sub_required(
    "app/src/data-store.js",
    r"counts\.speeches !== 1164 \|\| counts\.sentences !== \d+ \|\| counts\.clauses !== \d+ \|\| counts\.chunks !== \d+",
    f"counts.speeches !== 1164 || counts.sentences !== {sentences} || counts.clauses !== {clauses} || counts.chunks !== {chunks}",
)
sub_required("app/src/data-store.js", r"value\.entries\.length!==\d+", f"value.entries.length!=={total}")
sub_required(
    "app/src/data-store.js",
    r"value\.counts\?\.standalone!==5\|\|value\.counts\?\.attached!==\d+\|\|value\.counts\?\.total!==\d+",
    f"value.counts?.standalone!==5||value.counts?.attached!=={attached}||value.counts?.total!=={total}",
)
sub_required("app/src/data-store.js", r"actorCues!==\d+", f"actorCues!=={actor_cues}")
sub_required("app/src/data-store.js", r"actorCues}/\d+", f"actorCues}}/{actor_cues}")

# Production assembler: gates and emitted QA metrics.
sub_required(
    "app/scripts/assemble-production.mjs",
    r"stageDirections\.entries\?\.length!==\d+\|\|stageDirections\.counts\?\.standalone!==5\|\|stageDirections\.counts\?\.attached!==\d+\|\|stageDirections\.counts\?\.total!==\d+",
    f"stageDirections.entries?.length!=={total}||stageDirections.counts?.standalone!==5||stageDirections.counts?.attached!=={attached}||stageDirections.counts?.total!=={total}",
)
sub_required(
    "app/scripts/assemble-production.mjs",
    r"stageStandalone!==5\|\|stageAttached!==\d+\|\|stageActorCues!==\d+\|\|\[\.\.\.stageSceneCounts\.values\(\)\]\.join\(','\)!=='\d+,\d+,\d+'",
    f"stageStandalone!==5||stageAttached!=={attached}||stageActorCues!=={actor_cues}||[...stageSceneCounts.values()].join(',')!=='185,230,363'",
)
sub_required(
    "app/scripts/assemble-production.mjs",
    r"structure\.counts\?\.speeches!==1164\|\|structure\.counts\?\.sentences!==\d+\|\|structure\.counts\?\.clauses!==\d+\|\|structure\.counts\?\.chunks!==\d+",
    f"structure.counts?.speeches!==1164||structure.counts?.sentences!=={sentences}||structure.counts?.clauses!=={clauses}||structure.counts?.chunks!=={chunks}",
)
for old, new in [
    ("structureSentences:2334", f"structureSentences:{sentences}"),
    ("structureClauses:2939", f"structureClauses:{clauses}"),
    ("structureChunks:11810", f"structureChunks:{chunks}"),
    ("stageDirections:777", f"stageDirections:{total}"),
    ("stageJapaneseParaphrases:777", f"stageJapaneseParaphrases:{total}"),
]:
    replace_if_present("app/scripts/assemble-production.mjs", old, new)

# Canonical stage validator, including semantic regression coverage for this exact failure mode.
sub_required("scripts/validate-stage-directions.mjs", r"stageCount:229", "stageCount:230")
sub_required(
    "scripts/validate-stage-directions.mjs",
    r"stage\.counts\?\.standalone!==5\|\|stage\.counts\?\.attached!==\d+\|\|stage\.counts\?\.total!==\d+\|\|stage\.counts\?\.malformedBracketRecovered!==1",
    f"stage.counts?.standalone!==5||stage.counts?.attached!=={attached}||stage.counts?.total!=={total}||stage.counts?.malformedBracketRecovered!==1",
)
sub_required("scripts/validate-stage-directions.mjs", r"stage\.entries\.length!==\d+", f"stage.entries.length!=={total}")
sub_required("scripts/validate-stage-directions.mjs", r"stage\.entries\.length}/\d+", f"stage.entries.length}}/{total}")
sub_required(
    "scripts/validate-stage-directions.mjs",
    r"standalone!==5\|\|attached!==\d+\|\|malformed!==1",
    f"standalone!==5||attached!=={attached}||malformed!==1",
)
sub_required("scripts/validate-stage-directions.mjs", r"actorCues!==\d+", f"actorCues!=={actor_cues}")
sub_required("scripts/validate-stage-directions.mjs", r"actorCues}/\d+", f"actorCues}}/{actor_cues}")
sub_required(
    "scripts/validate-stage-directions.mjs",
    r"placements\.before!==\d+\|\|placements\.delivery!==\d+\|\|placements\.after!==\d+",
    f"placements.before!=={placements['before']}||placements.delivery!=={placements['delivery']}||placements.after!=={placements['after']}",
)
for old, new in [
    ("stageEntries:777", f"stageEntries:{total}"),
    ("japaneseParaphrases:777", f"japaneseParaphrases:{total}"),
]:
    replace_if_present("scripts/validate-stage-directions.mjs", old, new)
validator = ROOT / "scripts/validate-stage-directions.mjs"
validator_text = validator.read_text(encoding="utf-8")
semantic_guard = """
const spokenDelimiterLeaks=[...speechById.values()].filter(({speech})=>/[\\[\\]{}]/.test(String(speech?.text||'')));
if(spokenDelimiterLeaks.length)fail(`stage delimiter leaked into spoken text: ${spokenDelimiterLeaks.map(({speech})=>speech.id).join(',')}`);
const recoveredMalformed=stage.entries.filter(entry=>entry.malformedSourceBracket===true);
if(recoveredMalformed.length!==1||recoveredMalformed[0].speechId!=='act1-scene2-speech-0308'||recoveredMalformed[0].placement!=='after'||String(recoveredMalformed[0].text||'').trim()!=='He moves above the sofa table.')fail('malformed stage recovery anchor invalid');
if(speechById.get('act1-scene2-speech-0308')?.speech?.text!=='Ah.')fail('Trotter speech/stage separation regression');
""".strip()
if "Trotter speech/stage separation regression" not in validator_text:
    marker = "for(const category of allowedCategories)if(!categories.get(category))fail(`stage category coverage missing ${category}`);"
    if marker not in validator_text:
        raise SystemExit("scripts/validate-stage-directions.mjs: semantic guard insertion marker missing")
    validator_text = validator_text.replace(marker, marker + "\n\n" + semantic_guard)
    validator.write_text(validator_text, encoding="utf-8")

# Stage static contract.
sub_required("app/tests/stage_directions_static.mjs", r"stage\.entries\?\.length!==\d+", f"stage.entries?.length!=={total}")
sub_required(
    "app/tests/stage_directions_static.mjs",
    r"stage\.counts\?\.standalone!==5\|\|stage\.counts\?\.attached!==\d+\|\|stage\.counts\?\.total!==\d+",
    f"stage.counts?.standalone!==5||stage.counts?.attached!=={attached}||stage.counts?.total!=={total}",
)
sub_required("app/tests/stage_directions_static.mjs", r"join\(','\)!=='\d+,\d+,\d+'", "join(',')!=='185,230,363'")
sub_required("app/tests/stage_directions_static.mjs", r"actorCues!==\d+", f"actorCues!=={actor_cues}")
sub_required("app/tests/stage_directions_static.mjs", r"actorCues}/\d+", f"actorCues}}/{actor_cues}")
for old, new in [
    ("stageEntries:777", f"stageEntries:{total}"),
    ("attached:772", f"attached:{attached}"),
    ("japaneseParaphrases:777", f"japaneseParaphrases:{total}"),
    ("canonical-2026-09-01-japanese-prose-v1", DATA_VERSION),
]:
    replace_if_present("app/tests/stage_directions_static.mjs", old, new)
replace_if_present("app/tests/stage_directions.e2e.spec.js", "stageCount:777", f"stageCount:{total}")

# Pages and materials carry structure count assertions/documentation. Replace only when present,
# because main may evolve these checks independently.
for old, new in [
    ("p['counts']['sentences']==2334", f"p['counts']['sentences']=={sentences}"),
    ("p['counts']['clauses']==2939", f"p['counts']['clauses']=={clauses}"),
    ("p['counts']['chunks']==11810", f"p['counts']['chunks']=={chunks}"),
]:
    replace_if_present(".github/workflows/pages.yml", old, new)
for old, new in [
    ("- sentences: 2334", f"- sentences: {sentences}"),
    ("- clauses: 2939", f"- clauses: {clauses}"),
    ("- chunks: 11810", f"- chunks: {chunks}"),
]:
    replace_if_present("materials/000_MATERIAL_INDEX.txt", old, new)

# Chunking manifest follows the freshly rebuilt canonical structure.
manifest = load("data/canonical-integration-manifest.json")
manifest["schemaVersion"] = 2
manifest["status"] = "CHUNKING_V1_CANONICAL"
manifest["productionState"] = "READY_FOR_MAIN"
manifest["chunking"]["schemaVersion"] = 2
manifest["chunking"]["ruleSet"] = "chunking-v1"
manifest["chunking"]["sourceSha256"] = structure["sourceSha256"]
manifest["chunking"]["structureSha256"] = sha("app/mousetrap_line_structure.json")
manifest["chunking"]["qaStatus"] = "PASS"
manifest["chunking"]["qaErrorCount"] = 0
manifest["chunking"]["counts"] = structure["counts"]
manifest["chunking"]["sceneStats"] = structure["sceneStats"]
dump("data/canonical-integration-manifest.json", manifest)

# Production contract hashes are computed after all canonical data edits.
contract = load("data/canonical-production-contract.json")
for item in contract["files"]:
    item["sha256"] = sha(item["path"])
dump("data/canonical-production-contract.json", contract)

# Force installed/offline PWA clients onto the corrected canonical dataset.
version = load("app/pwa-version.json")
old_build = version["buildId"]
match = re.fullmatch(r"(.+-r)(\d+)", old_build)
if not match:
    raise SystemExit(f"unexpected PWA build id: {old_build}")
new_build = match.group(1) + str(int(match.group(2)) + 1)
version["buildId"] = new_build
version["dataVersion"] = DATA_VERSION
dump("app/pwa-version.json", version)
for path in ["app/src/config.js", "app/sw.js"]:
    p = ROOT / path
    text = p.read_text(encoding="utf-8")
    if old_build not in text:
        raise SystemExit(f"{path}: current build id {old_build!r} not found")
    p.write_text(text.replace(old_build, new_build), encoding="utf-8")

# The static test has now been pointed at the new dataVersion; assert no stale version remains there.
static_text = (ROOT / "app/tests/stage_directions_static.mjs").read_text(encoding="utf-8")
if DATA_VERSION not in static_text:
    raise SystemExit("stage static test was not synchronized to the repaired dataVersion")

print(json.dumps({
    "status": "FINALIZED",
    "structureCounts": {"speeches": 1164, "sentences": sentences, "clauses": clauses, "chunks": chunks},
    "stage": {
        "total": total,
        "standalone": standalone,
        "attached": attached,
        "actorCues": actor_cues,
        "malformed": malformed,
        "scenes": dict(scene_counts),
        "placements": dict(placements),
    },
    "buildId": new_build,
    "dataVersion": DATA_VERSION,
    "scriptSha256": sha("mousetrap_script_data.json"),
    "structureSha256": sha("app/mousetrap_line_structure.json"),
}, ensure_ascii=False, indent=2))
