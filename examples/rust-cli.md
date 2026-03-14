# Tasks

## P0

- [ ] Fix panic on empty input when stdin is piped
  - **ID**: stdin-panic
  - **Details**: `cargo run -- parse < /dev/null` panics with `unwrap()` on empty reader.
    Use `BufRead::read_line` with proper EOF handling instead of `unwrap()`.
  - **Files**: `src/input.rs`
  - **Acceptance**: `cargo test -- --ignored test_empty_stdin` passes, no panic on empty input

## P1

- [ ] Add `--format` flag for JSON and TOML output
  - **Tags**: feature
  - **Details**: Currently only outputs plain text. Add `clap` argument `--format <json|toml|text>`.
    Use `serde_json` and `toml` crates for serialization. Default to text.
  - **Files**: `src/cli.rs`, `src/output.rs`
  - **Blocked by**: stdin-panic

- [ ] Add integration tests for all subcommands
  - **Tags**: testing
  - **Details**: Use `assert_cmd` and `predicates` crates. Cover:
    - `parse` with valid/invalid input files
    - `validate` with malformed data
    - `--format json` output structure
    - Exit codes (0 success, 1 validation error, 2 usage error)
  - **Files**: `tests/cli.rs`
  - **Acceptance**: `cargo test --test cli` passes, all subcommands covered

## P2

- [ ] Run `clippy` with pedantic lints and fix all warnings
  - **Details**: Add `#![warn(clippy::pedantic)]` to `src/main.rs`.
    Fix all warnings. Add `clippy` to CI.
  - **Acceptance**: `cargo clippy -- -D warnings` exits 0
- [ ] Add shell completions generation via `clap_complete`
  - **Details**: Add `completions` subcommand that generates shell completions
    for bash, zsh, fish. Document in README.
- [ ] Publish to crates.io with proper metadata
  - **Tags**: release
  - **Details**: Fill in `Cargo.toml` metadata (description, license, repository,
    keywords, categories). Run `cargo publish --dry-run` first.

