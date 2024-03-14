import * as Crypto from '@hoprnet/phttp-crypto';

import * as Res from './result';
import * as Payload from './payload';
import * as Segment from './segment';
import * as Utils from './utils';

export type Request = {
    id: string; // uuid
    originalId?: string;
    provider: string;
    body?: string;
    entryPeerId: string;
    exitPeerId: string;
    startedAt: number;
    measureRPClatency: boolean;
    lastSegmentEndedAt?: number;
    headers?: Record<string, string>;
    hops?: number;
    reqRelayPeerId?: string;
    respRelayPeerId?: string;
};

export type UnboxRequest = {
    reqPayload: Payload.ReqPayload;
    session: Crypto.Session;
};

/**
 * Creates a request and compresses its payload.
 */
export function create({
    id,
    originalId,
    provider,
    body,
    clientId,
    entryPeerId,
    exitPeerId,
    exitPublicKey,
    counterOffset,
    measureRPClatency,
    headers,
    hops,
    reqRelayPeerId,
    respRelayPeerId,
}: {
    id: string;
    originalId?: string;
    provider: string;
    body?: string;
    clientId: string;
    entryPeerId: string;
    exitPeerId: string;
    exitPublicKey: Uint8Array;
    counterOffset: number;
    measureRPClatency: boolean;
    headers?: Record<string, string>;
    hops?: number;
    reqRelayPeerId?: string;
    respRelayPeerId?: string;
}): Res.Result<{ request: Request; session: Crypto.Session }> {
    const payload: Payload.ReqPayload = {
        endpoint: provider,
        clientId,
        body,
        headers,
        method: 'POST',
        hops,
        relayPeerId: respRelayPeerId,
        withDuration: measureRPClatency,
    };
    // TODO
    // const resEncode = Payload.encodeReq(payload);
    // if (Res.isErr(resEncode)) {
    // return resEncode;
    // }

    const json = JSON.stringify(payload);
    const data = Utils.stringToBytes(json);
    const resBox = Crypto.boxRequest({
        message: data,
        exitPeerId,
        uuid: id,
        exitPublicKey,
        counterOffset,
    });
    if (Crypto.isError(resBox)) {
        return Res.err(resBox.error);
    }

    return Res.ok({
        request: {
            id,
            originalId,
            provider,
            body,
            entryPeerId,
            exitPeerId,
            exitPublicKey,
            headers,
            hops,
            measureRPClatency,
            reqRelayPeerId,
            respRelayPeerId,
            startedAt: performance.now(),
        },
        session: resBox.session,
    });
}

export function messageToReq({
    message,
    requestId,
    exitPeerId,
    exitPrivateKey,
}: {
    requestId: string;
    message: Uint8Array;
    exitPeerId: string;
    exitPrivateKey: Uint8Array;
}): Res.Result<UnboxRequest> {
    const resUnbox = Crypto.unboxRequest({
        message,
        uuid: requestId,
        exitPeerId,
        exitPrivateKey,
    });
    if (Crypto.isError(resUnbox)) {
        return Res.err(resUnbox.error);
    }

    if (!resUnbox.session.request) {
        return Res.err('Crypto session without request object');
    }
    const msg = Utils.bytesToString(resUnbox.session.request);
    try {
        const reqPayload = JSON.parse(msg);
        return Res.ok({
            reqPayload,
            session: resUnbox.session,
        });
    } catch (ex: any) {
        return Res.err(`Error during JSON parsing: ${ex.toString()}`);
    }
}

/**
 * Convert request to segments.
 */
export function toSegments(req: Request, session: Crypto.Session): Segment.Segment[] {
    // we need the entry id ouside of of the actual encrypted payload
    const reqData = session.request as Uint8Array;
    const pIdBytes = Utils.stringToBytes(req.entryPeerId);
    const body = Utils.concatBytes(pIdBytes, reqData);
    return Segment.toSegments(req.id, body);
}

/**
 * Pretty print request in human readable form.
 */
export function prettyPrint(req: Request) {
    const eId = Utils.shortPeerId(req.entryPeerId);
    const xId = Utils.shortPeerId(req.exitPeerId);
    const path = [`e${eId}`];
    if (req.reqRelayPeerId) {
        path.push(`r${Utils.shortPeerId(req.reqRelayPeerId)}`);
    } else if (req.hops !== 0) {
        path.push('(r)');
    }
    path.push(`x${xId}`);
    if (req.respRelayPeerId) {
        path.push(`r${Utils.shortPeerId(req.respRelayPeerId)}`);
    }
    const id = req.id;
    const prov = req.provider;
    return `request[${id}, ${path.join('>')}, ${prov}]`;
}
