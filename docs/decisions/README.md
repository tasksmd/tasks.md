# Decisions

Architecture decision records (ADRs): one file per decision that shapes the
project and is costly to reverse. Each has a status, the context, the
decision, the alternatives, and the consequences. A new decision that replaces
an old one gets a new file; the old file's status becomes `superseded by NNNN`.

| ADR | Decision | Status |
|---|---|---|
| [0001](0001-pluggable-backends.md) | Task storage is a pluggable backend behind one surface | accepted |
| [0002](0002-git-native-linear-cas.md) | The git-native backend uses linear compare-and-swap on a git ref, with no CRDT engine | accepted |
| [0003](0003-dogfood-git-native.md) | This repo runs its own queue on the git-native backend | accepted |

Template: copy any ADR and keep its headings.
