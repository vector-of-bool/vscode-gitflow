import {MessageItem} from 'vscode';

export namespace fail {
    export interface ErrorMessageHandler extends MessageItem {
        title: string;
        cb: () => Promise<any>;
    };

    export interface IError {
        message: string;
        handlers?: ErrorMessageHandler[];
    };

    export function error(exc: IError) {
        throw exc;
    }
}