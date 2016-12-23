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