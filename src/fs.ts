'use strict';

import * as nodefs from 'fs';


export namespace fs {
    export function exists(path: string): Promise<boolean> {
        return new Promise((resolve, _) => {
            nodefs.exists(path, resolve);
        });
    }

    export function readFile(path: string): Promise<Buffer> {
        return new Promise((resolve, reject) => {
            nodefs.readFile(path, (err, data) => {
                if (err)
                    reject(err);
                else
                    resolve(data);
            });
        })
    }

    export function writeFile(path: string, buf: any): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            nodefs.writeFile(path, buf, (err) => {
                if (err)
                    reject(err);
                else
                    resolve();
            });
        });
    }

    export function remove(path: string) {
        return new Promise((resolve, reject) => {
            nodefs.unlink(path, (err) => {
                if (err)
                    reject(err);
                else
                    resolve();
            });
        });
    }
}