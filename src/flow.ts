'use strict'

import * as vscode from 'vscode';

import * as path from 'path';

import {fail} from './fail';
import {git} from './git';
import {cmd} from './cmd';
import {fs} from './fs';

export namespace flow {
    export const gitDir = path.join(vscode.workspace.rootPath, '.git');
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
        return git.config.get('gitflow.branch.develop').then(git.BranchRef.fromName);
    }

    /**
     * Get the master branch name
     */
    export function masterBranch(): Promise<git.BranchRef> {
        return git.config.get('gitflow.branch.master').then(git.BranchRef.fromName);
    }

    export const flowEnabled = async function (): Promise<boolean> {
        const master = await git.config.get('gitflow.branch.master');
        const develop = await git.config.get('gitflow.branch.develop');
        return !!(master) && !!(develop);
    }

    export const requireFlowEnabled = async function () {
        if (!(await flowEnabled())) {
            // Ask the user to enable gitflow
            fail.error({
                message: 'Gitflow is not initialized for this project',
                handlers: [
                    {
                        title: "Enable now",
                        cb: flow.initialize,
                    }
                ]
            })
        }
    }

    export const requireNoSuchBranch = async function (br: git.BranchRef, err: fail.IError) {
        if (await br.exists()) {
            fail.error(err);
        }
    }

    export const initialize = async function () {
        if (await flowEnabled()) {
            const do_reinit = !!(await vscode.window.showWarningMessage(
                'Gitflow has already been initialized for this repository. Would you like to re-initialize?',
                'Yes'
            ));
            if (!do_reinit)
                return;
        }

        const branchNonEmpty = str => !!str ? null : "A branch name is required"
        const master_name = await vscode.window.showInputBox({
            prompt: "Enter a name for the production branch",
            value: 'master',
            validateInput: branchNonEmpty,
        });
        if (!master_name) return;
        const develop_name = await vscode.window.showInputBox({
            prompt: 'Enter a name for the development branch',
            value: 'develop',
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
        if (!!(await cmd.execute('git', ['rev-parse', '--quiet', '--verify', 'HEAD'])).retc) {
            await cmd.executeRequired('git', ['symbolic-ref', 'HEAD', `refs/head/${master.name}`]);
            await cmd.executeRequired('git', ['commit', '--allow-empty', '--quiet', '-m', 'Initial commit']);
        }

        // Ensure the develop branch exists
        if (!(await develop.exists())) {
            if (await remote_develop.exists()) {
                // If there is a remote with the branch, set up our local copy to track that one
                cmd.executeRequired('git', ['branch', develop.name, remote_develop.name]);
            } else {
                // Otherwise, create it on top of the master branch
                cmd.executeRequired('git', ['branch', '--no-track', develop.name, master.name]);
            }
            // Checkout develop since we just created it
            await git.checkout(develop);
        }

        // Create the branch prefixes and store those in git config
        for (const what of ['feature', 'release', 'hotfix', 'support']) {
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
        git.config.set('gitflow.branch.master', master.name);
        git.config.set('gitflow.branch.develop', develop.name);

        console.assert(await flowEnabled());

        vscode.window.showInformationMessage('Gitflow has been initialized for this repository!');
    }
}

export namespace flow.feature {
    /**
     * Get the feature branch prefix
     */
    export function prefix() {
        return git.config.get('gitflow.prefix.feature');
    }

    /**
     * Get the current feature branch as well as its name.
     */
    export const current = async function (msg: string = 'Not working on a feature branch') {
        const current_branch = await git.currentBranch();
        const prefix = await feature.prefix();
        if (!current_branch || !current_branch.name.startsWith(prefix)) {
            fail.error({ message: msg });
        }
        const name = current_branch.name.substr(prefix.length);
        return { branch: current_branch, name: name };
    }

    export const start = async function (feature_name: string) {
        console.assert(!!feature_name);
        await requireFlowEnabled();
        const prefix = await feature.prefix();
        const new_branch = git.BranchRef.fromName(`${prefix}${feature_name}`);
        await requireNoSuchBranch(new_branch, {
            message: `The feature "${feature_name}" already exists`
        });
        const local_develop = git.BranchRef.fromName('develop');
        const remote_develop = git.BranchRef.fromName('origin/develop');
        const local_ref = await local_develop.ref();
        if (await remote_develop.exists()) {
            git.requireEqual(local_develop, remote_develop, true);
        }

        // Create our new branch
        await cmd.executeRequired('git', ['checkout', '-b', new_branch.name, local_develop.name]);
        vscode.window.showInformationMessage(`New branch ${new_branch.name}" was created`);
    }

    /**
     * Rebase the current feature branch on develop
     */
    export const rebase = async function () {
        await requireFlowEnabled();
        const {
            branch: feature_branch
        } = await current(
            'You must checkout the feature branch you wish to rebase on develop'
        );
        const develop = await developBranch();
        await git.requireClean();
        const result = await git.rebase({ branch: feature_branch, onto: develop });
        if (result.retc) {
            const abort_result = await cmd.executeRequired(
                'git',
                ['rebase', '--abort']
            );
            fail.error({
                message: `Rebase command failed with exit code ${result.retc}. ` +
                `The rebase has been aborted: Please perform this rebase from ` +
                `the command line and resolve the appearing errors.`
            });
        }
        await vscode.window.showInformationMessage(`${feature_branch.name} has been rebased onto ${develop.name}`);
    }

    export const finish = async function () {
        const {
            branch: feature_branch,
            name: feature_name
        } = await current(
            'You must checkout the feature branch you wish to finish'
        );

        const is_clean = await git.isClean();

        const merge_base_file = path.join(gitflowDir, 'MERGE_BASE');
        if (await fs.exists(merge_base_file)) {
            const merge_base = git.BranchRef.fromName((await fs.readFile(merge_base_file)).toString());
            if (is_clean) {
                // The user must have resolved the conflict themselves, so
                // all we need to do is delete the merge file
                await fs.remove(merge_base_file);
                if (await git.isMerged(feature_branch, merge_base)) {
                    // The user already merged this feature branch. We'll just exit!
                    await finishCleanup(feature_branch);
                    return;
                }
            } else {
                // They have an unresolved merge conflict. Tell them what they must do
                fail.error({ message: 'You have merge conflicts! Resolve them before trying to finish feature branch.' });
            }
        }

        await git.requireClean();

        const all_branches = await git.BranchRef.all();
        // Make sure that the local feature and the remote feature haven't diverged
        const remote_branch = all_branches.find(br => br.name === 'origin/' + feature_branch.name);
        if (remote_branch) {
            git.requireEqual(feature_branch, remote_branch, true);
        }
        // Make sure the local develop and remote develop haven't diverged either
        const develop = await developBranch();
        const remote_develop = git.BranchRef.fromName('origin/' + develop.name);
        if (await remote_develop.exists()) {
            git.requireEqual(develop, remote_develop, true);
        }

        // Switch to develop and merge in the feature branch
        await git.checkout(develop);
        const result = await cmd.execute('git', ['merge', '--no-ff', feature_branch.name]);
        if (result.retc) {
            // Merge conflict. Badness
            await fs.writeFile(gitflowDir, develop.name);
            fail.error({ message: `There were conflicts while merging into ${develop.name}. Fix the issues before trying to finish the feature branch` });
        }
        await finishCleanup(feature_branch);
    }

    const finishCleanup = async function (branch: git.BranchRef) {
        console.assert(await branch.exists());
        console.assert(await git.isClean());
        const origin = git.RemoteRef.fromName('origin');
        const remote = git.BranchRef.fromName(origin.name + '/' + branch.name);
        if (await remote.exists()) {
            // Delete the branch on the remote
            await git.push(git.RemoteRef.fromName('origin'), git.BranchRef.fromName(':refs/heads/' + branch.name));
        }
        await cmd.executeRequired('git', ['branch', '-d', branch.name]);
        vscode.window.showInformationMessage(`Feature branch ${branch.name} has been closed`);
    }
}

export namespace flow.release {
    export const current = async function () {
        const branches = await git.BranchRef.all();

        const prefix = await releasePrefix();

        return branches.find(br => br.name.startsWith(prefix));
    }

    export const start = async function (name: string) {
        await requireFlowEnabled();
        const current_release = await release.current();
        if (!!current_release) {
            fail.error({
                message: `There is an existing release branch "${current_release.name}". Finish that release before starting a new one.`
            });
        }

        await git.requireClean();

        const develop = await developBranch();
        const remote_develop = develop.remoteAt(git.primaryRemote());
        if (await remote_develop.exists()) {
            git.requireEqual(develop, remote_develop);
        }

        const tag = git.TagRef.fromName(name);
        if (await tag.exists()) {
            fail.error({
                message: `The tag "${name}" is an existing tag. Please chose another release name.`
            });
        }

        const prefix = await releasePrefix();
        const new_branch = git.BranchRef.fromName(`${prefix}${name}`);
        await cmd.executeRequired('git', ['checkout', '-b', new_branch.name, develop.name]);
        await vscode.window.showInformationMessage(
            `New branch ${new_branch.name} has been created. ` +
            `Now is the time to update your version numbers and fix any ` +
            `last minute bugs.`
        );
    }

    export const finish = async function () {
        await requireFlowEnabled();
        const current_release = await release.current();
        if (!current_release) {
            fail.error({ message: 'No active release branch to finish' });
        }
        const current_branch = await git.currentBranch();
        if (current_branch.name !== current_release.name) {
            fail.error({
                message: `You are not currently on the release branch "${current_release.name}`,
                handlers: [
                    {
                        title: `Checkout ${current_release.name} and continue.`,
                        cb: async function () {
                            await git.checkout(current_release);
                            await finish();
                        }
                    }
                ]
            })
        }

        await git.requireClean();

        const master = await masterBranch();
        const remote_master = master.remoteAt(git.primaryRemote());
        if (await remote_master.exists()) {
            git.requireEqual(master, remote_master);
        }

        const develop = await developBranch();
        const remote_develop = develop.remoteAt(git.primaryRemote());
        if (await remote_develop.exists()) {
            git.requireEqual(develop, remote_develop);
        }


        // Get the name of the tag we will use. Default is the release name
        const tag_message = await vscode.window.showInputBox({
            prompt: 'Enter a tag message (optional)',
        });
        if (tag_message === null)
            return;

        // Now the crux of the logic, after we've done all our sanity checking
        await git.checkout(master);

        // Merge the release into the master branch
        if (!(await git.isMerged(current_release, master))) {
            await git.merge(current_release);
        }

        // Create a tag for the release
        const rel_prefix = await releasePrefix();
        const tag_prefix = await tagPrefix();
        const release_name = current_release.name.substr(rel_prefix.length);
        await cmd.executeRequired('git', ['tag', '-m', tag_message, release_name, master.name]);

        // Merge the release into develop
        await git.checkout(develop);
        if (!(await git.isMerged(current_release, develop))) {
            await git.merge(current_release);
        }

        // Delete the release branch
        await cmd.executeRequired('git', ['branch', '-d', current_release.name]);

        const remote = git.primaryRemote();
        if (await remote_develop.exists()) {
            await git.push(remote, develop);
            await git.push(remote, master);
            // Delete the remote branch
            await git.push(remote, git.BranchRef.fromName(':' + current_release.name));
        }

        vscode.window.showInformationMessage(`The release "${release_name}" has been created. You are now on the ${develop.name} branch.`);
    }
}