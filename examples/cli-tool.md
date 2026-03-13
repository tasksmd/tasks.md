# Tasks
spec v0.5

## P0

- [ ] Fix `--output` flag silently ignoring invalid paths
  - **Details**: When `--output /nonexistent/dir/file.json` is passed, the tool exits 0 with no output. Should validate the directory exists and exit 1 with a clear error.
  - **Files**: `src/cli/flags.ts`, `src/output/writer.ts`
  - **Acceptance**: Invalid paths produce exit code 1 and stderr message

## P1

- [ ] Add `--format csv` output support
  - **Details**: Currently supports JSON and YAML. Add CSV with proper escaping for quoted fields.
  - **Files**: `src/output/formatters/csv.ts`, `src/output/index.ts`

- [ ] Support reading config from `~/.toolrc.yaml`
  - **Details**: Check for config file on startup, merge with CLI flags (flags take precedence)
  - **Files**: `src/config/loader.ts`

## P2

- [ ] Add shell completion scripts for bash/zsh/fish
- [ ] Colorize terminal output with chalk
- [ ] Add `--dry-run` flag to preview changes without writing
