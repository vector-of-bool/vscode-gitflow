import {cmd} from './cmd'
import {fail} from './fail';

export namespace git {

    /**
     * Represents a git remote
     */
    export class RemoteRef {
        constructor(public name: string) { }

        /// Create a remote reference from a remote's name
        public static fromName(name: string) {
            return new RemoteRef(name);
        }
    }

    export namespace config {
        /// Get a git config value
        export const get = async function (setting: string): Promise<string> {
            const result = await cmd.execute('git', ['config', '--get', setting]);
            if (result.retc) {
                return null;
            }
            return result.stdout.trim();
        }

        /// Set a git config value
        export const set = async function (setting: string, value: any): Promise<number> {
            const result = await cmd.execute('git', ['config', setting, value]);
            return result.retc;
        }
    }

    export class TagRef {
        constructor(public name: string){}

        /**
         * Get a tag reference by name
         */
        public static fromName(name: string) {
            return new TagRef(name);
        }

        /**
         * Parse a list of tags returned by git
         */
        public static parseListing(output: string): TagRef[] {
            return output
                .replace('\r\n', '\n')
                .trim()
                .split('\n')
                .filter(line => !!line.length)
                .map(line => line.trim())
                .reduce((acc, name) => {
                    if (!(name in acc))
                        acc.push(name);
                    return acc;
                }, [])
                .map(name => new TagRef(name));
        }

        /**
         * Get a list of all tags
         */
        public static all = async function() {
            const result = await cmd.executeRequired('git', ['tag', '-l']);
            return TagRef.parseListing(result.stdout);
        }

        /**
         * Check if the tag exists
         */
        public exists = async function(): Promise<boolean> {
            const self: TagRef = this;
            const all = await TagRef.all();
            return all.some(tag => tag.name === self.name);
        }
    }

    export class BranchRef {
        constructor(public name: string) { }

        /**
         * Create a branch reference from a string name
         */
        public static fromName(name: string) {
            return new BranchRef(name);
        }

        /**
         * Parse a list of branches returned by git stdout
         */
        public static parseListing(output: string): BranchRef[] {
            return output
                .replace('\r\n', '\n')
                .trim()
                .split('\n')
                .filter(line => !!line.length)
                .filter(line => line !== 'no branch')
                .map(line => line.trim())
                .map(line => line.replace(/^\* /, ''))
                .reduce((acc, name) => {
                    if (!(name in acc))
                        acc.push(name);
                    return acc;
                }, [])
                .map(name => new BranchRef(name));
        }

        /**
         * Get a list of branches available in the current directory
         */
        public static all = async function () {
            const local_result = await cmd.execute('git', ['branch', '--no-color']);
            const local_stdout = local_result.stdout;
            const remote_result = await cmd.execute('git', ['branch', '-r', '--no-color']);
            const remote_stdout = remote_result.stdout;
            const filter = function (output): string[] {
                return output;
            }

            return BranchRef.parseListing(local_stdout + remote_stdout)
        }

        /**
         * Test if a given branch exists
         */
        public exists = async function (): Promise<boolean> {
            const self: BranchRef = this;
            const all = await BranchRef.all();
            return !!(all.find((branch: BranchRef) => branch.name === self.name));
        }

        /**
         * Get the git hash that the branch points to
         */
        public ref = async function (): Promise<string> {
            const self: BranchRef = this;
            const result = await cmd.execute('git', ['rev-parse', self.name]);
            return result.stdout.trim();
        }

        /**
         * Get the name of the branch at a remote
         */
        public remoteAt(remote: RemoteRef): BranchRef {
            return BranchRef.fromName(`${remote.name}/${this.name}`);
        }
    };

    /**
     * Get a reference to the currently checked out branch
     */
    export const currentBranch = async function (): Promise<BranchRef> {
        const result = await cmd.executeRequired('git', ['rev-parse', '--abbrev-ref', 'HEAD']);
        const name = result.stdout.trim();
        if (name === 'HEAD') {
            // We aren't attached to a branch at the moment
            return null;
        }
        return BranchRef.fromName(name);
    }

    /**
     * Pull updates from the given ``remote`` for ``branch``
     */
    export const pull = async function (remote: RemoteRef, branch: BranchRef): Promise<Number> {
        const result = await cmd.execute('git', ['pull', remote.name, branch.name]);
        if (result.retc !== 0) {
            fail.error({
                message: 'Failed to pull from remote. See git output'
            });
        }
        return result.retc;
    }

    /**
     * Push updates to ``remote`` at ``branch``
     */
    export const push = async function(remote: RemoteRef, branch: BranchRef): Promise<Number> {
         const result = await cmd.execute('git', ['push', remote.name, branch.name]);
         if (result.retc !== 0) {
             fail.error({
                 message: 'Failed to push to remote. See git output',
             });
         }
         return result.retc;
    }

    /**
     * Check if we have any unsaved changes
     */
    export const isClean = async function (): Promise<boolean> {
        const diff_res = await cmd.executeRequired('git', ['diff', '--no-ext-diff', '--ignore-submodules', '--quiet', '--exit-code']);
        if (!!diff_res.retc) {
            return false;
        }
        const diff_index_res = await cmd.executeRequired('git', ['diff-index', '--cached', '--quiet', '--ignore-submodules', 'HEAD', '--']);
        if (!!diff_index_res.retc) {
            return false;
        }
        return true;
    }

    /**
     * Detect if the branch "subject" was merged into "base"
     */
    export const isMerged = async function (subject: BranchRef, base: BranchRef) {
        const result = await cmd.executeRequired('git', ['branch', '--no-color', '--contains', subject.name]);
        const branches = BranchRef.parseListing(result.stdout);
        return branches.some((br) => br.name === base.name);
    }

    /**
     * Checkout the given branch
     */
    export function checkout(branch: BranchRef) {
        return checkoutRef(branch.name);
    }

    /**
     * Checkout the given git hash
     */
    export function checkoutRef(ref: string) {
        return cmd.executeRequired('git', ['checkout', ref]);
    }

    /**
     * Merge one branch into the currently checked out branch
     */
    export function merge(other: BranchRef) {
        return cmd.executeRequired('git', ['merge', '--no-ff', other.name]);
    }

    interface IRebaseParameters {
        branch: BranchRef;
        onto: BranchRef;
    };

    /**
     * Rebase one branch onto another
     */
    export function rebase(args: IRebaseParameters) {
        return cmd.executeRequired('git', ['rebase', args.onto.name, args.branch.name]);
    }

    /**
     * Require that two branches point to the same commit.
     *
     * If given ``true`` for ``offer_pull``, will offer the use the ability
     * to quickly pull from 'origin' onto the ``a`` branch.
     */
    export const requireEqual = async function (a: BranchRef, b: BranchRef, offer_pull: boolean = false) {
        const aref = await a.ref();
        const bref = await b.ref();

        if (aref !== bref) {
            fail.error({
                message: `Branch "${a.name}" has diverged from ${b.name}`,
                handlers: !offer_pull ? [] : [
                    {
                        title: 'Pull now',
                        cb: async function () {
                            git.pull(primaryRemote(), a);
                        },
                    },
                ],
            });
        }
    }

    export const requireClean = async function() {
        if (!(await isClean())) {
            fail.error({
                message: 'Unsaved changes detected. Please commit or stash your changes and try again'
            });
        }
    }

    export function primaryRemote() {
        return RemoteRef.fromName('origin');
    }
}
