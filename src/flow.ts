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
    export const start = async function (feature_name: string) {
        console.assert(!!feature_name);
        await requireFlowEnabled();
        const prefix = await git.featurePrefix();
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
        vscode.window.showInformationMessage(`New branch :${new_branch.name}" was created`);
    }

    export const finish = async function () {
        const feature_branch = await git.currentBranch();
        const feature_prefix = await git.featurePrefix();
        if (!feature_branch || !feature_branch.name.startsWith(feature_prefix)) {
            fail.error({ message: 'You must first checkout the feature branch you wish to finish' });
        }

        const is_clean = await git.isClean();

        const merge_base_file = path.join(gitflowDir, 'MERGE_BASE');
        if (await fs.exists(merge_base_file)) {
            const merge_base = git.BranchRef.fromName((await fs.readFile(merge_base_file)).toString());
            if (is_clean) {
                // The user must have resolved the conflict themselves, so
                // all we need to do is delete the merge file
                await fs.remove(merge_base_file);
                if (git.isMerged(feature_branch, merge_base)) {
                    // The user already merged this feature branch. We'll just exit!
                    await finishCleanup(feature_branch);
                    return;
                }
            } else {
                // They have an unresolved merge conflict. Tell them what they must do
                fail.error({ message: 'You have merge conflicts! Resolve them before trying to finish feature branch.' });
            }
        }

        const feature_name = feature_branch.name.substr(feature_prefix.length);

        if (!is_clean) {
            fail.error({ message: 'Un-committed changes detected. Save or stash current changes and try again' });
        }

        const all_branches = await git.BranchRef.all();
        // Make sure that the local feature and the remote feature haven't diverged
        const remote_branch = all_branches.find(br => br.name === 'origin/' + feature_branch.name);
        if (remote_branch) {
            git.requireEqual(feature_branch, remote_branch, true);
        }
        // Make sure the local develop and remote develop haven't diverged either
        const develop = await git.developBranch();
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
            fail.error({ message: `There were conflicts while merging into ${develop.name}. Fix the issues before trying to finish the feature branch`});
        }
        await finishCleanup(feature_branch);
    }

    const finishCleanup = async function(branch: git.BranchRef) {
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
