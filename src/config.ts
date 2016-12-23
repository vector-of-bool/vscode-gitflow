import * as vscode from 'vscode';

class ConfigReader {
    private _readConfig<T>(key: string): T {
        return vscode.workspace.getConfiguration('gitflow').get<T>(key);
    }

    get deleteBranchOnFinish(): boolean {
        return this._readConfig<boolean>('deleteBranchOnFinish');
    }

    get deleteRemoteBranches(): boolean {
        return this._readConfig<boolean>('deleteRemoteBranches');
    }

    get default_development(): string {
        return this._readConfig<string>('default.development');
    }

    get default_production(): string {
        return this._readConfig<string>('default.production');
    }
}

export const config = new ConfigReader();