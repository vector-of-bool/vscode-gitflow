import * as proc from 'child_process';
import * as vscode from 'vscode';

import {fail} from './fail';


export namespace cmd {
  export interface ExecutionResult {
    retc: number;
    stdout: string;
    stderr: string;
  }

  export function execute(
      command: string, args: string[],
      options?: proc.SpawnOptions): Promise<ExecutionResult> {
    return new Promise<ExecutionResult>((resolve, reject) => {
      options = options || {};
      options.cwd = options.cwd || vscode.workspace.rootPath;
      console.log(`[gitflow] Execute ${command}`, args.join(' '));
      const child = proc.spawn(command, args, options);
      child.on('error', (err) => {
        reject(err);
      });
      let stdout_acc = '';
      let stderr_acc = '';
      child.stdout.on('data', (data: Uint8Array) => {
        stdout_acc += data.toString();
      });
      child.stderr.on('data', (data: Uint8Array) => {
        stderr_acc += data.toString();
      });
      child.on('close', (retc) => {
        console.log(`[gitflow] Command "${command}" returned code ${retc
                    }: ${stderr_acc}`);
        resolve({retc: retc, stdout: stdout_acc, stderr: stderr_acc});
      });
    });
  };

  export async function
  executeRequired(command: string, args: string[], options?: proc.SpawnOptions):
      Promise<ExecutionResult> {
    const result = await execute(command, args, options);
    if (result.retc !== 0) {
      fail.error({message: `"${command}" returned status ${result.retc}`});
    }
    return result;
  }
}