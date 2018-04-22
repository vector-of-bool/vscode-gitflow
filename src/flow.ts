'use strict'

import * as vscode from 'vscode';

import * as path from 'path';

import {fail} from './fail';
import {git} from './git';
import {cmd} from './cmd';
import {fs} from './fs';
import {config} from './config';

const withProgress = vscode.window.withProgress;

export namespace flow {
  export const gitDir = path.join(vscode.workspace.rootPath!, '.git');
  export const gitflowDir = path.join(gitDir, '.gitflow');

  /**
   * Get the release branch prefix
   */
  export function releasePrefix() {
    return git.config.get('gitflow.prefix.release');
  }

  /**
   * Get the tag prefix
   */
  export function tagPrefix() {
    return git.config.get('gitflow.prefix.versiontag');
  }

  /**
   * Get develop branch name
   */
  export function developBranch(): Promise<git.BranchRef> {
    return git.config.get('gitflow.branch.develop')
        .then(git.BranchRef.fromName);
  }

  /**
   * Get the master branch name
   */
  export function masterBranch(): Promise<git.BranchRef> {
    return git.config.get('gitflow.branch.master').then(git.BranchRef.fromName);
  }

  export async function flowEnabled(): Promise<boolean> {
    const master = await git.config.get('gitflow.branch.master');
    const develop = await git.config.get('gitflow.branch.develop');
    return !!(master) && !!(develop);
  }

  export async function requireFlowEnabled() {
    if (!(await flowEnabled())) {
      // Ask the user to enable gitflow
      fail.error({
        message: 'Gitflow is not initialized for this project',
        handlers: [{
          title: 'Enable now',
          cb: flow.initialize,
        }]
      })
    }
  }

  export async function
  requireNoSuchBranch(br: git.BranchRef, err: fail.IError) {
    if (await br.exists()) {
      fail.error(err);
    }
  }

  export function throwNotInitializedError(): never {
    throw fail.error({
      message: 'Gitflow has not been initialized for this repository',
      handlers: [{
        title: 'Initialize',
        cb() {
          return flow.initialize();
        }
      }]
    });
  }

  export async function initialize() {
    console.log('Init');
    if (await flowEnabled()) {
      const do_reinit = !!(await vscode.window.showWarningMessage(
          'Gitflow has already been initialized for this repository. Would you like to re-initialize?',
          'Yes'));
      if (!do_reinit) return;
    }

    const branchNonEmpty = str => !!str ? '' : 'A branch name is required'
    const master_name = await vscode.window.showInputBox({
      prompt: 'Enter a name for the production branch',
      value: config.default_production,
      validateInput: branchNonEmpty,
    });
    if (!master_name) return;
    const develop_name = await vscode.window.showInputBox({
      prompt: 'Enter a name for the development branch',
      value: config.default_development,
      validateInput: branchNonEmpty,
    });
    if (!develop_name) return;
    if (master_name === develop_name) {
      fail.error({
        message: 'Production and development branches must differ',
      });
    }

    const develop = git.BranchRef.fromName(develop_name);
    const master = git.BranchRef.fromName(master_name);

    const remote_develop = git.BranchRef.fromName('origin/' + develop_name);
    const remote_master = git.BranchRef.fromName('origin/' + master_name);

    // Check if the repository needs to be initialized before we proceed
    if (!!(await cmd.execute(git.info.path, [
            'rev-parse', '--quiet', '--verify', 'HEAD'
          ])).retc) {
      await cmd.executeRequired(
          git.info.path, ['symbolic-ref', 'HEAD', `refs/heads/${master.name}`]);
      await cmd.executeRequired(
          git.info.path,
          ['commit', '--allow-empty', '--quiet', '-m', 'Initial commit']);
    }

    // Ensure the develop branch exists
    if (!(await develop.exists())) {
      if (await remote_develop.exists()) {
        // If there is a remote with the branch, set up our local copy to track
        // that one
        cmd.executeRequired(
            git.info.path, ['branch', develop.name, remote_develop.name]);
      } else {
        // Otherwise, create it on top of the master branch
        cmd.executeRequired(
            git.info.path, ['branch', '--no-track', develop.name, master.name]);
      }
      // Checkout develop since we just created it
      await git.checkout(develop);
    }

    // Create the branch prefixes and store those in git config
    for (const what of ['bugfix', 'feature', 'release', 'hotfix', 'support']) {
      const prefix = await vscode.window.showInputBox({
        prompt: `Enter a prefix for "${what}" branches`,
        value: `${what}/`,
        validateInput: branchNonEmpty,
      });
      if (!prefix) return;
      await git.config.set(`gitflow.prefix.${what}`, prefix);
    }

    const version_tag_prefix = await vscode.window.showInputBox({
      prompt: 'Enter a prefix for version tags (optional)',
    });
    if (version_tag_prefix === null) return;
    await git.config.set('gitflow.prefix.versiontag', version_tag_prefix);

    // Set the main branches, and gitflow is officially 'enabled'
    await git.config.set('gitflow.branch.master', master.name);
    await git.config.set('gitflow.branch.develop', develop.name);

    console.assert(await flowEnabled());

    vscode.window.showInformationMessage(
        'Gitflow has been initialized for this repository!');
  }
}

export namespace flow.feature {
  /**
   * Get the feature/bugfix branch prefix
   */
  export function prefix(branchType: string) {
    return git.config.get(`gitflow.prefix.${branchType}`);
  }

  /**
   * Get the current feature/bugfix branch as well as its name.
   */
  export async function current(
      msg: string = 'Not working on a feature or bugfix branch', branchType: string) {
    const current_branch = await git.currentBranch();
    const prefix = await feature.prefix(branchType);
    if (!prefix) {
      throw throwNotInitializedError();
    }
    if (!current_branch || !current_branch.name.startsWith(prefix)) {
      throw fail.error({message: msg});
    }
    const name = current_branch.name.substr(prefix.length);
    return {branch: current_branch, name: name};
  }

  export async function precheck() {
    const local_develop = await developBranch();
    const remote_develop =
        git.BranchRef.fromName(`origin/${local_develop.name}`);
    const local_ref = await local_develop.ref();
    if (await remote_develop.exists()) {
      await git.requireEqual(local_develop, remote_develop, true);
    }
  }

  export async function start(feature_name: string, branchType: string) {
    console.assert(!!feature_name);
    await requireFlowEnabled();
    const prefix = await feature.prefix(branchType);
    if (!prefix) {
      throw throwNotInitializedError();
    }
    const new_branch = git.BranchRef.fromName(`${prefix}${feature_name}`);
    await requireNoSuchBranch(
        new_branch, {message: `The ${branchType} "${feature_name}" already exists`});

    // Create our new branch
    const local_develop = await developBranch();
    await cmd.executeRequired(
        git.info.path, ['checkout', '-b', new_branch.name, local_develop.name]);
    vscode.window.showInformationMessage(
        `New branch "${new_branch.name}" was created`);
  }

  /**
   * Rebase the current feature branch on develop
   */
  export async function rebase(branchType: string) {
    await requireFlowEnabled();
    const {branch: feature_branch} = await current(
        `You must checkout the ${branchType} branch you wish to rebase on develop`, branchType);

    const remote = feature_branch.remoteAt(git.primaryRemote());
    const develop = await developBranch();
    if (await remote.exists() && !(await git.isMerged(remote, develop))) {
      const do_rebase = !!(await vscode.window.showWarningMessage(
          `A remote branch for ${feature_branch.name} exists, and rebasing ` +
              `will rewrite history for this branch that may be visible to ` +
              `other users!`,
          'Rebase anyway'));
      if (!do_rebase) return;
    }

    await git.requireClean();
    const result = await git.rebase({branch: feature_branch, onto: develop});
    if (result.retc) {
      const abort_result =
          await cmd.executeRequired(git.info.path, ['rebase', '--abort']);
      fail.error({
        message: `Rebase command failed with exit code ${result.retc}. ` +
            `The rebase has been aborted: Please perform this rebase from ` +
            `the command line and resolve the appearing errors.`
      });
    }
    await vscode.window.showInformationMessage(
        `${feature_branch.name} has been rebased onto ${develop.name}`);
  }

  export async function finish(branchType: string) {
    return withProgress({
      location: vscode.ProgressLocation.Window,
      title: `Finishing ${branchType}`,
    }, async (pr) => {
      pr.report({message: 'Getting current branch...'})
      const {branch: feature_branch, name: feature_name} = await current(
          `You must checkout the ${branchType} branch you wish to finish`, branchType);

      pr.report({message: 'Checking for cleanliness...'})
      const is_clean = await git.isClean();

      pr.report({message: 'Checking for incomplete merge...'})
      const merge_base_file = path.join(gitflowDir, 'MERGE_BASE');
      if (await fs.exists(merge_base_file)) {
        const merge_base = git.BranchRef.fromName(
            (await fs.readFile(merge_base_file)).toString());
        if (is_clean) {
          // The user must have resolved the conflict themselves, so
          // all we need to do is delete the merge file
          await fs.remove(merge_base_file);
          if (await git.isMerged(feature_branch, merge_base)) {
            // The user already merged this feature branch. We'll just exit!
            await finishCleanup(feature_branch, branchType);
            return;
          }
        } else {
          // They have an unresolved merge conflict. Tell them what they must do
          fail.error({
            message:
                `You have merge conflicts! Resolve them before trying to finish ${branchType} branch.`
          });
        }
      }

      await git.requireClean();

      pr.report({message: 'Checking remotes...'})
      const all_branches = await git.BranchRef.all();
      // Make sure that the local feature and the remote feature haven't diverged
      const remote_branch =
          all_branches.find(br => br.name === 'origin/' + feature_branch.name);
      if (remote_branch) {
        await git.requireEqual(feature_branch, remote_branch, true);
      }
      // Make sure the local develop and remote develop haven't diverged either
      const develop = await developBranch();
      const remote_develop = git.BranchRef.fromName('origin/' + develop.name);
      if (await remote_develop.exists()) {
        await git.requireEqual(develop, remote_develop, true);
      }

      pr.report({message: `Merging ${feature_branch.name} into ${develop}...`});
      // Switch to develop and merge in the feature branch
      await git.checkout(develop);
      const result = await cmd.execute(
          git.info.path, ['merge', '--no-ff', feature_branch.name]);
      if (result.retc) {
        // Merge conflict. Badness
        await fs.writeFile(gitflowDir, develop.name);
        fail.error({
          message: `There were conflicts while merging into ${develop.name
                  }. Fix the issues before trying to finish the ${branchType} branch`
        });
      }
      pr.report({message: 'Cleaning up...'});
      await finishCleanup(feature_branch, branchType);
    });
  }

  async function finishCleanup(branch: git.BranchRef, branchType: string) {
    console.assert(await branch.exists());
    console.assert(await git.isClean());
    const origin = git.RemoteRef.fromName('origin');
    const remote = git.BranchRef.fromName(origin.name + '/' + branch.name);
    if (config.deleteBranchOnFinish) {
      if (config.deleteRemoteBranches && await remote.exists()) {
        // Delete the branch on the remote
        await git.push(
            git.RemoteRef.fromName('origin'),
            git.BranchRef.fromName(`:refs/heads/${branch.name}`));
      }
      await cmd.executeRequired(git.info.path, ['branch', '-d', branch.name]);
    }
    vscode.window.showInformationMessage(
        `${branchType.substring(0, 1).toUpperCase()}${branchType.substring(1)} branch ${branch.name} has been closed`);
  }
}

export namespace flow.release {
  export async function current() {
    const branches = await git.BranchRef.all();
    const prefix = await releasePrefix();
    if (!prefix) {
      throw throwNotInitializedError();
    }
    return branches.find(br => br.name.startsWith(prefix));
  }

  export async function precheck() {
    await git.requireClean();

    const develop = await developBranch();
    const remote_develop = develop.remoteAt(git.primaryRemote());
    if (await remote_develop.exists()) {
      await git.requireEqual(develop, remote_develop);
    }
  }

  /**
   * Get the tag for a new release branch
   */
  export async function guess_new_version() {
    const tag = git.TagRef.fromName("_start_new_release");
    const tag_prefix = await tagPrefix() || '';
    let version_tag = await tag.latest() || '0.0.0';
    version_tag = version_tag.replace(tag_prefix, '');
    if (version_tag.match(/^\d+\.\d+\.\d+$/)) {
      let version_numbers = version_tag.split('.');
      version_numbers[1] = String(Number(version_numbers[1]) + 1);
      version_numbers[2] = "0";
      version_tag = version_numbers.join('.');
    }
    return version_tag;
  }

  export async function start(name: string) {
    await requireFlowEnabled();
    const current_release = await release.current();
    if (!!current_release) {
      fail.error({
        message: `There is an existing release branch "${current_release.name
                 }". Finish that release before starting a new one.`
      });
    }

    const tag = git.TagRef.fromName(name);
    if (await tag.exists()) {
      fail.error({
        message: `The tag "${name
                 }" is an existing tag. Please chose another release name.`
      });
    }

    const prefix = await releasePrefix();
    const new_branch = git.BranchRef.fromName(`${prefix}${name}`);
    const develop = await developBranch();
    await cmd.executeRequired(
        git.info.path, ['checkout', '-b', new_branch.name, develop.name]);
    await vscode.window.showInformationMessage(
        `New branch ${new_branch.name} has been created. ` +
        `Now is the time to update your version numbers and fix any ` +
        `last minute bugs.`);
  }

  export async function finish() {
    await requireFlowEnabled();
    const prefix = await releasePrefix();
    if (!prefix) {
      throw throwNotInitializedError();
    }
    const current_release = await release.current();
    if (!current_release) {
      throw fail.error({message: 'No active release branch to finish'});
    }
    await finalizeWithBranch(prefix, current_release, finish);
  }

  export async function finalizeWithBranch(
      rel_prefix: string, branch: git.BranchRef, reenter: Function) {
    return withProgress({
      location: vscode.ProgressLocation.Window,
      title: 'Finishing release branch'
    }, async (pr) => {
      await requireFlowEnabled();
      pr.report({message: 'Getting current branch...'});
      const current_branch = await git.currentBranch();
      if (!current_branch) {
        throw fail.error({message: 'Unable to detect a current git branch.'});
      }
      if (current_branch.name !== branch.name) {
        fail.error({
          message: `You are not currently on the "${branch.name}" branch`,
          handlers: [{
            title: `Checkout ${branch.name} and continue.`,
            cb: async function() {
              await git.checkout(branch);
              await reenter();
            }
          }]
        });
      }

      pr.report({message: 'Checking cleanliness...'});
      await git.requireClean();

      pr.report({message: 'Checking remotes...'});
      const master = await masterBranch();
      const remote_master = master.remoteAt(git.primaryRemote());
      if (await remote_master.exists()) {
        await git.requireEqual(master, remote_master);
      }

      const develop = await developBranch();
      const remote_develop = develop.remoteAt(git.primaryRemote());
      if (await remote_develop.exists()) {
        await git.requireEqual(develop, remote_develop);
      }

      // Get the name of the tag we will use. Default is the branch's flow name
      pr.report({message: 'Getting a tag message...'});
      const tag_message = await vscode.window.showInputBox({
        prompt: 'Enter a tag message (optional)',
      });
      if (tag_message === undefined) return;

      // Now the crux of the logic, after we've done all our sanity checking
      pr.report({message: 'Switching to master...'});
      await git.checkout(master);

      // Merge the branch into the master branch
      if (!(await git.isMerged(branch, master))) {
        pr.report({message: `Merging ${branch} into ${master}...`});
        await git.merge(branch);
      }

      // Create a tag for the release
      const tag_prefix = await tagPrefix() || '';
      const release_name = tag_prefix.concat(branch.name.substr(
        rel_prefix.length));
      pr.report({message: `Tagging ${master}: ${release_name}...`});
      await cmd.executeRequired(
          git.info.path, ['tag', '-m', tag_message, release_name, master.name]);

      // Merge the release into develop
      pr.report({message: `Checking out ${develop}...`});
      await git.checkout(develop);
      if (!(await git.isMerged(branch, develop))) {
        pr.report({message: `Merging ${branch} into ${develop}...`});
        await git.merge(branch);
      }

      if (config.deleteBranchOnFinish) {
        // Delete the release branch
        pr.report({message: `Deleting ${branch.name}...`});
        await cmd.executeRequired(git.info.path, ['branch', '-d', branch.name]);
        if (config.deleteRemoteBranches && await remote_develop.exists() &&
            await remote_master.exists()) {
          const remote = git.primaryRemote();
          pr.report({message: `Pushing to ${remote.name}/${develop.name}...`});
          await git.push(remote, develop);
          pr.report({message: `Pushing to ${remote.name}/${master.name}...`});
          await git.push(remote, master);
          const remote_branch = branch.remoteAt(remote);
          pr.report({message: `Pushing tag ${release_name}...`});
          cmd.executeRequired(git.info.path, ['push', '--tags', remote.name]);
          if (await remote_branch.exists()) {
            // Delete the remote branch
            pr.report({message: `Deleting remote ${remote.name}/${branch.name}`});
            await git.push(remote, git.BranchRef.fromName(':' + branch.name));
          }
        }
      }

      vscode.window.showInformationMessage(
          `The release "${release_name
          }" has been created. You are now on the ${develop.name} branch.`);
    });
  }
}

export namespace flow.hotfix {
  /**
   * Get the hotfix branch prefix
   */
  export function prefix() {
    return git.config.get('gitflow.prefix.hotfix');
  }

  /**
   * Get the current hotfix branch, or null if there is nonesuch
   */
  export async function current() {
    const branches = await git.BranchRef.all();
    const prefix = await hotfix.prefix();
    if (!prefix) {
      throw throwNotInitializedError();
    }
    return branches.find(br => br.name.startsWith(prefix));
  }

  /**
   * Get the tag for a new hotfix branch
   */
  export async function guess_new_version() {
    const tag = git.TagRef.fromName("_start_new_hotfix");
    const tag_prefix = await tagPrefix() || '';
    let version_tag = await tag.latest() || '0.0.0';
    version_tag = version_tag.replace(tag_prefix, '');
    if (version_tag.match(/^\d+\.\d+\.\d+$/)) {
      let version_numbers = version_tag.split('.');
      version_numbers[2] = String(Number(version_numbers[2]) + 1);
      version_tag = version_numbers.join('.');
    }
    return version_tag;
  }

  export async function start(name: string) {
    await requireFlowEnabled();
    const current_hotfix = await current();
    if (!!current_hotfix) {
      fail.error({
        message: `There is an existing hotfix branch "${current_hotfix.name
                 }". Finish that one first.`
      });
    }

    await git.requireClean();

    const master = await masterBranch();
    const remote_master = master.remoteAt(git.primaryRemote());
    if (await remote_master.exists()) {
      await git.requireEqual(master, remote_master);
    }

    const tag = git.TagRef.fromName(name);
    if (await tag.exists()) {
      fail.error({
        message: `The tag "${tag.name
                 }" is an existing tag. Choose another hotfix name.`
      });
    }

    const prefix = await hotfix.prefix();
    const new_branch = git.BranchRef.fromName(`${prefix}${name}`);
    if (await new_branch.exists()) {
      fail.error(
          {message: `"${new_branch.name}" is the name of an existing branch`});
    }
    await cmd.executeRequired(
        git.info.path, ['checkout', '-b', new_branch.name, master.name]);
  }

  export async function finish() {
    await requireFlowEnabled();
    const prefix = await hotfix.prefix();
    if (!prefix) {
      throw throwNotInitializedError();
    }
    const current_hotfix = await hotfix.current();
    if (!current_hotfix) {
      throw fail.error({message: 'No active hotfix branch to finish'});
    }
    await release.finalizeWithBranch(prefix, current_hotfix, finish);
  }
}
