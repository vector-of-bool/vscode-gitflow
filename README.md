# Gitflow integration for Visual Studio Code

This extension provides integration and support for [gitflow](http://nvie.com/posts/a-successful-git-branching-model/).
It is based on [this gitflow implementation](https://github.com/nvie/gitflow)
and intends to be (but is not yet) fully compatible with it.

# Getting Started
First, initialize git
```sh
$ git init
```
- Open the VS Code Command Palette and type 'gitflow'
![Alt text](res/gitflow.png)

- Select 'Initialize repository for gitflow'
![Alt text](res/step1.png)

- Follow the command prompts and accept the defaults...
![Alt text](res/defaults.png)

- Setup complete! 


# Change History

### 0.0.5

- Fixed missing push of ``master`` and tags after finishing a release or a
  hotfix.

### Note

This extension is still very new, but the existing supported features should work
without issue.

Development is ongoing. Please help support this project by trying it out
and submitting issues and feature requests to [the github page](https://github.com/vector-of-bool/vscode-gitflow).