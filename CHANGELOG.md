# 1.2.0

- Add `bugfix` branch support [Thanks Vincent Biret ([baywet](https://github.com/baywet))]
- Fix unhelpful error messages sometimes appearing
- (1.2.1 fixes the changelog to include 1.2.0)

# 1.1.2

- *Fix intermittent assertion failure during init* [Thanks `RobDesideri`]
- Respect tag prefix for releases [Thanks `poohnix`]
- Guess the next release version automatically [Thanks `poohnix`]

# 1.1.1

- Progress messages while performing git operations

# 1.1.0

- Large refactor
- Bugfixes when git is not available on `PATH` but is otherwise installed.
- Shiny new icon.

# 1.0.0

- New configuration options:
    - `gitflow.deleteBranchOnfinish`
    - `gitflow.deleteRemoteBranches`
    - `gitflow.default.development`
    - `gitflow.default.production`
- Fix issue with hardcoded development branch to `develop`.
- Fix unhelpful errors from git when doing a gitflow operation on an unclean
  working tree

# 0.1.0

- Update to TypeScript 2.0 and enforce strict `null` checks. May now catch some
  latent issues.

# 0.0.5

- Fixed missing push of ``master`` and tags after finishing a release or a
  hotfix.