# Chunking v1 — canonical presentation contract

Status: CANONICAL FOR APP PRESENTATION

The structural source of truth is \`app/mousetrap_line_structure.json\` and \`data/chunking-v1-rules.md\`. The UI must never re-parse or reinterpret the English.

## Visual principles

- English text remains black/dark ink. Semantic color belongs to small marker labels and thin underlines/rails, not to large filled blocks.
- Use a restrained palette: muted blue for S, amber for V/HV, green for O, mauve for C, and slate/taupe for connectors/modifiers/fallback markers.
- Do not create a rainbow grammar view, colored sentence backgrounds, bracket forests, or developer-style tree dumps.
- Structure is compact and collapsed by default in Line Detail. Expanded Structure must remain readable on phone and tablet widths.
- Chunks follow the original left-to-right text and wrap naturally. Never reorder words or fabricate omitted words.
- Clause nesting is shown only from canonical \`parentClauseId\`. Do not infer visual nesting from offsets alone.
- A nested clause's outer S/O/C relation is shown from the canonical relation chunk / \`functionInParent\`; relation chunks are not duplicated as a second colored text chunk.
- Fragment / response / vocative / interjection analysis remains first-class and is not forced into S/V/O/C.

## Information hierarchy

1. sentence text;
2. thin clause rail + clause marker/name;
3. marker label + black English chunk with a semantic underline;
4. optional click detail for marker meaning and clause membership.

No legacy \`role/type\` projection is permitted.
