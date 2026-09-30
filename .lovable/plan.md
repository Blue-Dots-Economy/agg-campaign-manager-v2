# Drop-analysis and funnel visual fixes

## Scope
- Add one shared, deterministic reason-colour helper using existing chart and brand tokens.
- Replace the three local/static reason-colour mappings and make the stacked-bar legend data-driven.
- Rebuild the Sankey trunk from the seven current seeker funnel metrics, omitting zero-value stages while preserving call-flow order.
- Map current drop phases to their closest surviving funnel stage; attach unknown phases to the final surviving stage and show their count below the diagram.
- Replace job-specific terminal flow with “Not connected”, remove the obsolete apply-failure flow, and use theme-aware trunk and sink colours.
- Remove obsolete client-side stage ordering from both drop tables so backend arrival order is retained.
- Remove the redundant invalid SVG fill attribute.

## Technical details
- `reasonColor(reason)` will hash the full reason string into `--chart-1` through `--chart-5` and `--brand-muted`; “Not captured” and “Other” use the muted foreground mix.
- The Sankey will resolve each mapped phase upstream when its intended trunk stage has a zero value, and link consecutive surviving trunk stages only.
- Unknown positive-value drop stages will attach to the last surviving trunk node and contribute to a single muted diagnostic note.
- Existing selection, sizing, formatting, region filtering, and interaction behaviour will remain unchanged.
- `KkbMetrics` already declares all four new call fields, so no type extension is expected.

## Validation
- Run the requested TypeScript typecheck.
- Confirm the preview build diagnostics remain clean.
