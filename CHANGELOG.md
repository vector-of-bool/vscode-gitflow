# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.0.0] - 2020-05-11
### Added
- Workspace support

### Changed
- Shiny new icon
- New publisher
- Formatting code with Prettier

## [1.2.0] - 2018-04-21
### Added
- Add `bugfix` branch support [Thanks Vincent Biret ([baywet](https://github.com/baywet))]

### Fixed
- Fix unhelpful error messages sometimes appearing
- (1.2.1 fixes the changelog to include 1.2.0)

## [1.1.2] - 2017-12-04
### Fixed
- *Fix intermittent assertion failure during init* [Thanks `RobDesideri`]
- Respect tag prefix for releases [Thanks `poohnix`]
- Guess the next release version automatically [Thanks `poohnix`]

## [1.1.1] - 2017-06-15
### Fixed
- Progress messages while performing git operations

## [1.1.0] - 2017-02-16
### Changed
- Large refactor
- Shiny new icon

### Fixed
- Bugfixes when git is not available on `PATH` but is otherwise installed.

## [1.0.0] - 2016-12-22
### Added
- New configuration options:
	- `gitflow.deleteBranchOnfinish`
	- `gitflow.deleteRemoteBranches`
	- `gitflow.default.development`
	- `gitflow.default.production`

### Fixed
- Fix issue with hardcoded development branch to `develop`.
- Fix unhelpful errors from git when doing a gitflow operation on an unclean
  working tree

## [0.1.0] - 2016-10-16
### Fixed
- Update to TypeScript 2.0 and enforce strict `null` checks. May now catch some
  latent issues.

## [0.0.5] - 2016-05-06
### Fixed
- Fixed missing push of `master` and tags after finishing a release or a
  hotfix.