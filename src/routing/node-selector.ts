import * as Res from '../result';
import { shortPeerId, randomEl } from '../utils';

// import * as EntryData from './entry-data';
import * as ExitData from './exit-data';
import * as NodeMatch from './node-match';
import * as NodePair from './node-pair';

import type { EntryNode } from '../entry-node';

const ExitNodesCompatVersions = ['2.'];

export type NodeSelection = {
    match: NodeMatch.NodeMatch;
    via: string;
};

export type NodesSorting = Map<string, Set<string>>;

// type EntryPerf = EntryData.Perf & { entryNode: EntryNode };
type ExitPerf = ExitData.Perf & NodeMatch.NodeMatch;

/**
 * Try to distribute evenly with best route pairs preferred.
 *
 */
export function routePair(
    nodePairs: Map<string, NodePair.NodePair>,
    forceManualRelaying: boolean,
): Res.Result<NodeSelection> {
    const routePerfs = createRoutePerfs(nodePairs, forceManualRelaying);
    return match(nodePairs, routePerfs);
}

/**
 * Try to distribute evenly with best route pairs preferred.
 * Exclude node match entry node from search.
 *
 */
export function fallbackRoutePair(
    nodePairs: Map<string, NodePair.NodePair>,
    exclude: EntryNode,
    forceManualRelaying: boolean,
): Res.Result<NodeSelection> {
    const routePerfs = createRoutePerfs(nodePairs, forceManualRelaying);
    const filtered = routePerfs.filter(({ entryNode }) => entryNode.id !== exclude.id);
    return match(nodePairs, filtered);
}

export function prettyPrint(sel: NodeSelection) {
    const { entryNode, exitNode, reqRelayPeerId, respRelayPeerId } = sel.match;
    const eId = shortPeerId(entryNode.id);
    const xId = shortPeerId(exitNode.id);
    const path = [`e${eId}`];
    if (reqRelayPeerId) {
        path.push(`r${shortPeerId(reqRelayPeerId)}`);
    }
    path.push(`x${xId}`);
    if (respRelayPeerId) {
        path.push(`r${shortPeerId(respRelayPeerId)}`);
    }
    return `${path.join('>')} (via ${sel.via})`;
}

function match(
    nodePairs: Map<string, NodePair.NodePair>,
    routePerfs: ExitPerf[],
): Res.Result<NodeSelection> {
    // special case no nodes
    if (routePerfs.length === 0) {
        return Res.err('no nodes');
    }
    // special case only one route
    if (routePerfs.length === 1) {
        return success(routePerfs[0], 'only route available');
    }

    // special case version mismatches
    const xVersionMatches = versionMatches(routePerfs);
    if (xVersionMatches.length === 1) {
        return success(xVersionMatches[0], 'only (assumed) version match');
    }
    if (xVersionMatches.length === 0) {
        return Res.err('no nodes matching required version');
    }

    ////
    // just choose a random route for better privacy
    return success(randomEl(xVersionMatches), 'random selection');

    ////
    // TODO mix random and performances for a more sophisticated selection
    ////
    // 1. compare exit node performances
    //   const xNoInfoFails = noInfoFails(xVersionMatches);
    //   if (xNoInfoFails.length === 1) {
    //       return success(xNoInfoFails[0], 'only info req success');
    //   }

    //   ////
    //   // 1b.
    //   const xLeastErrs = leastReqErrors(xNoInfoFails);
    //   if (xLeastErrs.length === 1) {
    //       return success(xLeastErrs[0], 'least request errors');
    //   }
    //   const xLeastOngoing = leastReqOngoing(xLeastErrs);
    //   if (xLeastOngoing.length === 1) {
    //       return success(xLeastOngoing[0], 'least ongoing requests');
    //   }
    //   const xBestLats = bestReqLatencies(xLeastOngoing);
    //   if (xBestLats.length > 0) {
    //       return success(xBestLats[0], 'best request latency');
    //   }
    //   const xBestInfoLats = bestInfoLatencies(xLeastOngoing);
    //   if (xBestInfoLats.length > 0) {
    //       return success(xBestInfoLats[0], 'best info req latency');
    //   }

    //   const entryPerfs = createEntryPerfs(nodePairs, xLeastOngoing);

    //   ////
    //   // 2. compare entry node performances
    //   const eLeastErrs = leastSegErrors(entryPerfs);
    //   if (eLeastErrs.length === 1) {
    //       return eSuccess(eLeastErrs[0], xLeastOngoing, 'least segment errors');
    //   }
    //   const eLeastOngoing = leastSegOngoing(eLeastErrs);
    //   if (eLeastOngoing.length === 1) {
    //       return eSuccess(eLeastOngoing[0], xLeastOngoing, 'least ongoing segments');
    //   }
    //   const eBestLats = bestSegLatencies(eLeastOngoing);
    //   if (eBestLats.length > 0) {
    //       return eSuccess(eBestLats[0], xLeastOngoing, 'best segment latency');
    //   }
    //   const eLeastMsgsErrs = leastMsgsErrors(eLeastOngoing);
    //   if (eLeastMsgsErrs.length === 1) {
    //       return eSuccess(eLeastMsgsErrs[0], xLeastOngoing, 'least message retrieval errors');
    //   }
    //   const eBestMsgsLats = bestMsgsLatencies(eLeastMsgsErrs);
    //   if (eBestMsgsLats.length > 0) {
    //       return eSuccess(eBestMsgsLats[0], xLeastOngoing, 'best message retrieval latency');
    //   }

    //   ////
    //   // 3. compare ping speed
    //   const eQuickestPing = quickestPing(eLeastMsgsErrs);
    //   if (eQuickestPing.length > 0) {
    //       return eSuccess(eQuickestPing[0], xLeastOngoing, 'quickest version ping');
    //   }

    // return { success: false, error: 'insufficient data' };
}

function success(
    { entryNode, exitNode, counterOffset, reqRelayPeerId, respRelayPeerId }: ExitPerf,
    via: string,
): Res.Result<NodeSelection> {
    return Res.ok({
        match: { entryNode, exitNode, counterOffset, reqRelayPeerId, respRelayPeerId },
        via,
    });
}

function createRoutePerfs(nodePairs: Map<string, NodePair.NodePair>, forceManualRelaying: boolean) {
    return Array.from(nodePairs.values()).reduce<ExitPerf[]>((acc, np) => {
        const perfs = Array.from(np.exitDatas).map(([xId, xd]) => {
            const [reqRelayPeerId, respRelayPeerId] = determineRelays(
                np,
                xId,
                xd,
                forceManualRelaying,
            );
            return {
                ...ExitData.perf(xd),
                entryNode: np.entryNode,
                exitNode: np.exitNodes.get(xId)!,
                reqRelayPeerId,
                respRelayPeerId,
            };
        });
        if (forceManualRelaying) {
            const withRelays = perfs.filter(
                ({ reqRelayPeerId, respRelayPeerId }) => reqRelayPeerId && respRelayPeerId,
            );
            return acc.concat(withRelays);
        }
        return acc.concat(perfs);
    }, []);
}

function determineRelays(
    np: NodePair.NodePair,
    xId: string,
    xd: ExitData.ExitData,
    forceManualRelaying: boolean,
) {
    if (!forceManualRelaying) {
        return [];
    }
    if (!xd.relayShortIds) {
        return [];
    }
    const relayShortIds = xd.relayShortIds;
    const relays = np.relays.filter((rId) => rId !== xId && rId !== np.entryNode.id);
    const reqRelayPeerId = randomEl(relays);
    const respRelays = np.peers.filter(
        (pId) => pId !== xId && relayShortIds.find((shId) => pId.endsWith(shId)),
    );
    const respRelayPeerId = randomEl(respRelays);
    return [reqRelayPeerId, respRelayPeerId];
}

function versionMatches(routePerfs: ExitPerf[]): ExitPerf[] {
    return routePerfs.filter(({ version }) => {
        if (version) {
            return ExitNodesCompatVersions.some((v) => version.startsWith(v));
        }
        // do not exclude not yet determined ones
        return true;
    });
}

// function noInfoFails(routePerfs: ExitPerf[]): ExitPerf[] {
//     return routePerfs.filter(({ infoFail }) => !infoFail);
// }
//
// function leastReqErrors(routePerfs: ExitPerf[]): ExitPerf[] {
//     routePerfs.sort((l, r) => l.failures - r.failures);
//     const min = routePerfs[0].failures;
//     const idx = routePerfs.findIndex(({ failures }) => min < failures);
//     if (idx > 0) {
//         return routePerfs.slice(0, idx);
//     }
//     return routePerfs;
// }
//
// function bestReqLatencies(routePerfs: ExitPerf[]): ExitPerf[] {
//     const haveLats = routePerfs.filter(({ avgLats }) => avgLats > 0);
//     haveLats.sort((l, r) => l.avgLats - r.avgLats);
//     return haveLats;
// }
//
// function bestInfoLatencies(routePerfs: ExitPerf[]): ExitPerf[] {
//     const haveLats = routePerfs.filter(({ infoLatMs }) => infoLatMs > 0);
//     haveLats.sort((l, r) => l.infoLatMs - r.infoLatMs);
//     return haveLats;
// }
//
// function leastReqOngoing(routePerfs: ExitPerf[]): ExitPerf[] {
//     routePerfs.sort((l, r) => l.ongoing - r.ongoing);
//     const min = routePerfs[0].ongoing;
//     const idx = routePerfs.findIndex(({ ongoing }) => min < ongoing);
//     if (idx > 0) {
//         return routePerfs.slice(0, idx);
//     }
//     return routePerfs;
// }
//
// function eSuccess(
//     { entryNode }: EntryPerf,
//     routePerfs: ExitPerf[],
//     via: string,
// ): Res.Result<NodeSelection> {
//     const xPerfs = routePerfs.filter(({ entryNode: en }) => en.id === entryNode.id);
//     const el = randomEl(xPerfs);
//     return Res.ok({
//         match: { entryNode, exitNode: el.exitNode, counterOffset: el.counterOffset },
//         via,
//     });
// }
//
// function createEntryPerfs(
//     nodePairs: Map<string, NodePair.NodePair>,
//     routePerfs: ExitPerf[],
// ): EntryPerf[] {
//     const entryNodes = routePerfs.map(({ entryNode }) => entryNode);
//     return Array.from(new Set(entryNodes)).map((entryNode) => {
//         const ed = nodePairs.get(entryNode.id)!.entryData;
//         return {
//             ...EntryData.perf(ed),
//             entryNode,
//         };
//     });
// }
//
// function leastSegErrors(entryPerfs: EntryPerf[]): EntryPerf[] {
//     entryPerfs.sort((l, r) => l.segFailures - r.segFailures);
//     const min = entryPerfs[0].segFailures;
//     const idx = entryPerfs.findIndex(({ segFailures }) => min < segFailures);
//     if (idx > 0) {
//         return entryPerfs.slice(0, idx);
//     }
//     return entryPerfs;
// }
//
// function bestSegLatencies(entryPerfs: EntryPerf[]): EntryPerf[] {
//     const haveLats = entryPerfs.filter(({ segAvgLats }) => segAvgLats > 0);
//     haveLats.sort((l, r) => l.segAvgLats - r.segAvgLats);
//     return haveLats;
// }
//
// function leastSegOngoing(entryPerfs: EntryPerf[]): EntryPerf[] {
//     entryPerfs.sort((l, r) => l.segOngoing - r.segOngoing);
//     const min = entryPerfs[0].segOngoing;
//     const idx = entryPerfs.findIndex(({ segOngoing }) => min < segOngoing);
//     if (idx > 0) {
//         return entryPerfs.slice(0, idx);
//     }
//     return entryPerfs;
// }
//
// function leastMsgsErrors(entryPerfs: EntryPerf[]): EntryPerf[] {
//     entryPerfs.sort((l, r) => l.msgsFails - r.msgsFails);
//     const min = entryPerfs[0].msgsFails;
//     const idx = entryPerfs.findIndex(({ msgsFails }) => min < msgsFails);
//     if (idx > 0) {
//         return entryPerfs.slice(0, idx);
//     }
//     return entryPerfs;
// }
//
// function bestMsgsLatencies(entryPerfs: EntryPerf[]): EntryPerf[] {
//     const haveLats = entryPerfs.filter(({ msgsAvgLats }) => msgsAvgLats > 0);
//     haveLats.sort((l, r) => l.msgsAvgLats - r.msgsAvgLats);
//     return haveLats;
// }
//
// function quickestPing(entryPerfs: EntryPerf[]): EntryPerf[] {
//     const havePing = entryPerfs.filter(({ pingDuration }) => pingDuration > 0);
//     havePing.sort((l, r) => l.pingDuration - r.pingDuration);
//     return havePing;
// }
