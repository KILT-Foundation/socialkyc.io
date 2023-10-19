import { sleep } from '../utilities/sleep';

import { getExpiredAttestations } from './getExpiredAttestations';
import { AttestationInfo } from './scanAttestations';
import { shouldBeRemoved } from './shouldBeExpired';
import { batchQueryRevoked } from './batchQueryRevoked';

const SCAN_INTERVAL_MS = 24 * 60 * 60 * 1000;

export const attestationsToRevoke: AttestationInfo[] = [];
export const attestationsToRemove: AttestationInfo[] = [];
export const attestationsToRemoveLater: AttestationInfo[] = [];

function isNotIncludedYetOn(
  list: AttestationInfo[],
  element: AttestationInfo,
): boolean {
  return !list.some(({ claimHash }) => claimHash === element.claimHash);
}

export async function fillExpiredInventory() {
  const expiredSinceLastRun = attestationsToRemoveLater.filter(shouldBeRemoved);
  attestationsToRemove.push(...expiredSinceLastRun);
  attestationsToRemoveLater.splice(0, expiredSinceLastRun.length);

  for await (const expiredAttestation of getExpiredAttestations()) {
    // decides in which list to put and makes sure that is not included yet
    if (shouldBeRemoved(expiredAttestation)) {
      isNotIncludedYetOn(attestationsToRemove, expiredAttestation) &&
        attestationsToRemove.push(expiredAttestation);
    } else {
      if (expiredAttestation.revoked === false) {
        isNotIncludedYetOn(attestationsToRevoke, expiredAttestation) &&
          attestationsToRevoke.push(expiredAttestation);
      }
      isNotIncludedYetOn(attestationsToRemoveLater, expiredAttestation) &&
        attestationsToRemoveLater.push(expiredAttestation);
    }
  }
}

export function initExpiredInventory() {
  (async () => {
    while (true) {
      await fillExpiredInventory();
      await sleep(SCAN_INTERVAL_MS);
    }
  })();
}

function remove<Type>(list: Type[], item: Type) {
  const index = list.indexOf(item);
  if (index >= 0) {
    list.splice(index, 1);
  }
}

export async function updateExpiredInventory(
  attestationsInfo: AttestationInfo[],
  toRevoke: boolean,
) {
  const claimHashes = attestationsInfo.map(({ claimHash }) => claimHash);
  const currentRevocationStatuses = await batchQueryRevoked(claimHashes);

  attestationsInfo.forEach((attestation) => {
    const revoked = currentRevocationStatuses[attestation.claimHash];

    if (toRevoke && revoked === true) {
      remove(attestationsToRevoke, attestation);
    }
    if (!toRevoke && revoked === null) {
      remove(attestationsToRemove, attestation);
    }
  });
}
