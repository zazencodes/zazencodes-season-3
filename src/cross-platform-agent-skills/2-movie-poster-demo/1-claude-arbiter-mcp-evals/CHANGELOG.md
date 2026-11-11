# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2025-09-21

### Added
- Initial release of Arbiter CLI
  - Commands:
    - `execute`: Run an evaluation suite from a configuration file
    - `genesis`: Create an example configuration file
    - `forge`: Interactively generate a custom evaluation config
    - `council`: Launch a local dashboard to review an eval results JSON
  - LLM-as-judge with rule checks and summary metrics
  - Cost estimation via LiteLLM pricing metadata

