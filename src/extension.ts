'use strict';

import * as vscode from 'vscode';
import {findGit, git} from './git';
import {flow} from './flow';
import {fail} from './fail'

async function runWrapped<T>(fn: (...any) => Thenable<T>, args: any[] = []): Promise<T|null> {
  try {
    return await fn(...args);
  } catch (e) {
    if (!e.handlers && !e.message) {
      throw e;
    }

    const err: fail.IError = e;
    const chosen = await vscode.window.showErrorMessage(err.message, ...(err.handlers || []));
    if (!!chosen) {
      return await runWrapped(chosen.cb);
    }
    return null;
  }
}

async function setup(disposables: vscode.Disposable[]) {
  const pathHint = vscode.workspace.getConfiguration('git').get<string>('path');
  git.info = await findGit(pathHint);
  vscode.window.setStatusBarMessage(
      'gitflow using git executable: ' + git.info.path + ' with version ' +
      git.info.version, 5000);
  const commands = [
    vscode.commands.registerCommand(
        'gitflow.initialize',
        async () => {
          await runWrapped(flow.initialize);
        }),
    vscode.commands.registerCommand(
        'gitflow.featureStart',
        async () => {
          await runWrapped(flow.requireFlowEnabled);
          await runWrapped(flow.feature.precheck);
          const name = await vscode.window.showInputBox({
            placeHolder: 'my-awesome-feature',
            prompt: 'A new name for your feature',
          });
          if (!name) { return; }
          await runWrapped(flow.feature.start, [name, 'feature']);
        }),
    vscode.commands.registerCommand(
        'gitflow.featureRebase',
        async () => {
          await runWrapped(flow.feature.rebase, ['feature']);
        }),
    vscode.commands.registerCommand(
        'gitflow.featureFinish',
        async () => {
          await runWrapped(flow.feature.finish, ['feature']);
        }),
    vscode.commands.registerCommand(
          'gitflow.bugfixStart',
          async () => {
            await runWrapped(flow.requireFlowEnabled);
            await runWrapped(flow.feature.precheck);
            const name = await vscode.window.showInputBox({
              placeHolder: 'my-awesome-bugfix',
              prompt: 'A new name for your bugfix',
            });
            if (!name) { return; }
            await runWrapped(flow.feature.start, [name, 'bugfix']);
          }),
      vscode.commands.registerCommand(
          'gitflow.bugfixRebase',
          async () => {
            await runWrapped(flow.feature.rebase, ['bugfix']);
          }),
      vscode.commands.registerCommand(
          'gitflow.bugfixFinish',
          async () => {
            await runWrapped(flow.feature.finish, ['bugfix']);
          }),
    vscode.commands.registerCommand(
        'gitflow.releaseStart',
        async () => {
          await runWrapped(flow.requireFlowEnabled);
          await runWrapped(flow.release.precheck);
          const guessedVersion = await runWrapped(
            flow.release.guess_new_version) || '';
          const name = await vscode.window.showInputBox({
            placeHolder: guessedVersion,
            prompt: 'The name of the release',
            value: guessedVersion,
          });
          if (!name) { return; }
          await runWrapped(flow.release.start, [name]);
        }),
    vscode.commands.registerCommand(
        'gitflow.releaseFinish',
        async () => {
          await runWrapped(flow.release.finish);
        }),
    vscode.commands.registerCommand(
        'gitflow.hotfixStart',
        async () => {
          await runWrapped(flow.requireFlowEnabled);
          const guessedVersion = await runWrapped(
            flow.hotfix.guess_new_version) || '';
          const name = await vscode.window.showInputBox({
            placeHolder: guessedVersion,
            prompt: 'The name of the hotfix version',
            value: guessedVersion,
          });
          if (!name) { return; }
          await runWrapped(flow.hotfix.start, [name]);
        }),
    vscode.commands.registerCommand(
        'gitflow.hotfixFinish',
        async () => {
          await runWrapped(flow.hotfix.finish);
        }),
  ];
  // add disposable
  disposables.push(...commands);
}

export function activate(context: vscode.ExtensionContext) {
  const disposables: vscode.Disposable[] = [];
  context.subscriptions.push(new vscode.Disposable(
      () => vscode.Disposable.from(...disposables).dispose()));

  setup(disposables).catch((err) => console.error(err));
}

export function
// tslint:disable-next-line:no-empty
deactivate() {}
