from pathlib import Path

path = Path('scripts/generate-a2plus-candidate-lists.mjs')
text = path.read_text(encoding='utf-8')
old = "if(!summary.abusePresentInFinal) throw new Error('Expected missing dictionary headword \"abuse\" to be present in final Parts 1+2 candidate list');"
new = "const abuseImplemented=implementedDictionary.has('abuse');\nif(summary.abusePresentInFinal===abuseImplemented) throw new Error(`\"abuse\" dictionary/candidate exclusion invariant failed (implemented=${abuseImplemented}, candidate=${summary.abusePresentInFinal})`);"
if old in text:
    text = text.replace(old, new)
elif 'const abuseImplemented=implementedDictionary.has(\'abuse\');' not in text:
    raise SystemExit('stale abuse invariant not found')
path.write_text(text, encoding='utf-8')
print('A2+ dictionary/candidate exclusion invariant synchronized')
