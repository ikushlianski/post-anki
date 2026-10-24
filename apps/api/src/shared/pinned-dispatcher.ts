import type { LookupFunction } from "node:net";
import { Agent } from "undici";

export interface PinnedAddress {
  address: string;
  family: number;
}

export function createPinnedLookup(addresses: readonly PinnedAddress[]): LookupFunction {
  return (_hostname, options, callback) => {
    if (options.all) {
      callback(null, addresses.map((entry) => ({ address: entry.address, family: entry.family })));

      return;
    }

    const [first] = addresses;

    if (!first) {
      callback(Object.assign(new Error("no pinned address"), { code: "ENOTFOUND" }), "", 4);

      return;
    }

    callback(null, first.address, first.family);
  };
}

export function createPinnedDispatcher(addresses: readonly PinnedAddress[]): Agent {
  return new Agent({ connect: { lookup: createPinnedLookup(addresses) } });
}
