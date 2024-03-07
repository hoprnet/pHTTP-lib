import * as Res from './result';

const textDecoder = new TextDecoder('utf-8');
const textEncoder = new TextEncoder();

export enum VrsnCmp {
    Identical,
    PatchMismatch,
    MinorMismatch,
    MajorMismatch,
}

export function shortPeerId(peerId: string): string {
    return `.${peerId.substring(peerId.length - 4)}`;
}

export function randomEl<T>(arr: T[]): T {
    return arr[randomIdx(arr)];
}

export function randomIdx<T>(arr: T[]): number {
    return Math.floor(Math.random() * arr.length);
}

export function average(arr: number[]): number {
    const sum = arr.reduce((acc, l) => acc + l, 0);
    return sum / arr.length || 0;
}

export function isValidURL(url: string) {
    if ('canParse' in URL) {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        return URL.canParse(url);
    }
    try {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        new URL(url);
        return true;
    } catch (_ex) {
        return false;
    }
}

export function bytesToString(arr: Uint8Array) {
    return textDecoder.decode(arr);
}

export function stringToBytes(str: string): Uint8Array {
    return textEncoder.encode(str);
}

export function versionCompare(ref: string, version: string): Res.Result<VrsnCmp> {
    const r = ref.split('.');
    if (r.length < 3) {
        return Res.err('invalid ref');
    }
    const v = version.split('.');
    if (v.length < 3) {
        return Res.err('invalid version');
    }
    const [rMj, rMn, rP] = r;
    const [vMj, vMn, vP] = v;
    if (parseInt(rMj, 10) !== parseInt(vMj, 10)) {
        return Res.ok(VrsnCmp.MajorMismatch);
    }
    if (parseInt(rMn, 10) !== parseInt(vMn, 10)) {
        return Res.ok(VrsnCmp.MinorMismatch);
    }
    if (parseInt(rP, 10) !== parseInt(vP, 10)) {
        return Res.ok(VrsnCmp.PatchMismatch);
    }
    return Res.ok(VrsnCmp.Identical);
}
