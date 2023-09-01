import {
  Blockchain,
  Did,
  ConfigService,
  IAttestation,
  SubmittableExtrinsic,
} from '@kiltprotocol/sdk-js';

import {
  expiredInventory,
  removeFromExpiredInventory,
} from '../recycledRevoker/expiredInventory';

import { generateTransactions } from '../recycledRevoker/generateTransactions';

import { AttestationInfo } from '../recycledRevoker/scanAttestations';

import { revocationSuccessChecker } from '../recycledRevoker/revocationSuccessChecker';

import { logger } from './logger';
import { fullDidPromise } from './fullDid';
import { keypairsPromise } from './keypairs';
import { signWithAssertionMethod } from './cryptoCallbacks';
import { signAndSubmit } from './signAndSubmit';

const TRANSACTION_TIMEOUT = 5 * 60 * 1000;
const MAXIMUM_FAILURES = 3;
const REVOCATION_BATCH_SIZE = 2;

interface AttemptedAttestation {
  attestation: IAttestation;
  failures: number;
}

let currentAttestations: AttemptedAttestation[] = [];
let currentTransaction: Promise<void> | undefined = undefined;
let pendingAttestations: AttemptedAttestation[] = [];
let pendingTransaction: Promise<void> | undefined = undefined;

let pendingExpiredCredentials: AttestationInfo[];
let currentExpiredCredentials: AttestationInfo[];

function syncExitAfterUpdatingReferences(): boolean {
  const noNextTransactionNeeded = pendingAttestations.length === 0;
  if (noNextTransactionNeeded) {
    currentAttestations = [];
    currentTransaction = undefined;
    pendingAttestations = [];
    pendingTransaction = undefined;
    return true;
  }

  currentAttestations = pendingAttestations;
  currentTransaction = pendingTransaction;
  currentExpiredCredentials = pendingExpiredCredentials;
  pendingAttestations = [];
  pendingTransaction = createPendingTransaction();
  pendingExpiredCredentials = expiredInventory.slice(0, REVOCATION_BATCH_SIZE);
  return false;
}

async function timeout(delay: number, error: Error) {
  return new Promise((resolve, reject) =>
    setTimeout(() => reject(error), delay),
  );
}

async function runTransactionWithTimeout<Result>(transaction: Promise<Result>) {
  await Promise.race([
    transaction,
    timeout(TRANSACTION_TIMEOUT, new Error('Transaction timed out')),
  ]);
}

async function createPendingTransaction() {
  const api = ConfigService.get('api');

  try {
    await currentTransaction;
    logger.debug('Current transaction succeeded');
  } catch (error) {
    logger.error(error);
  }

  const attestedAll = await api.query.attestation.attestations.multi(
    currentAttestations.map(({ attestation }) => attestation.claimHash),
  );
  attestedAll.forEach(({ isSome: attested }, index) => {
    const { failures, attestation } = currentAttestations[index];
    const failedTooManyTimes = failures >= MAXIMUM_FAILURES;
    if (attested || failedTooManyTimes) {
      return;
    }
    pendingAttestations.unshift({
      attestation,
      failures: failures + 1,
    });
  });

  currentExpiredCredentials.filter(
    async (expiredCredential) =>
      await revocationSuccessChecker(expiredCredential),
  );

  removeFromExpiredInventory(currentExpiredCredentials);

  // check for success of old revocations/removals here

  if (syncExitAfterUpdatingReferences()) {
    logger.debug('No next transaction scheduled');
    return;
  }
  logger.debug('Scheduling next transaction');

  const newAttestations = currentAttestations.map(
    ({ attestation: { cTypeHash, claimHash } }) =>
      api.tx.attestation.add(claimHash, cTypeHash, null),
  ) as SubmittableExtrinsic[];

  const submittableRevocations = await generateTransactions(
    pendingExpiredCredentials,
  );

  const extrinsics = newAttestations.concat(submittableRevocations);

  const { fullDid } = await fullDidPromise;
  const { identity } = await keypairsPromise;

  const authorized = await Did.authorizeBatch({
    batchFunction: api.tx.utility.batchAll,
    did: fullDid.uri,
    extrinsics,
    sign: signWithAssertionMethod,
    submitter: identity.address,
  });

  logger.debug('Submitting transaction');
  await runTransactionWithTimeout(
    Blockchain.signAndSubmitTx(authorized, identity),
  );
  logger.debug('Transaction submitted');
}

function alreadyAddedTo(
  list: AttemptedAttestation[],
  attestation: IAttestation,
) {
  return list.some(
    ({ attestation: { claimHash } }) => claimHash === attestation.claimHash,
  );
}

export async function batchSignAndSubmitAttestation(attestation: IAttestation) {
  // prevent two identical attestations from going into the same batch
  if (alreadyAddedTo(currentAttestations, attestation)) {
    return currentTransaction;
  }

  if (!alreadyAddedTo(pendingAttestations, attestation)) {
    pendingAttestations.push({ attestation, failures: 0 });
  }

  if (pendingTransaction) {
    logger.debug('Scheduled attestation for next transaction');
    return pendingTransaction;
  }

  logger.debug('Started immediate attestation');
  pendingTransaction = runTransactionWithTimeout(
    (async () => {
      const api = ConfigService.get('api');
      const transaction = api.tx.attestation.add(
        attestation.claimHash,
        attestation.cTypeHash,
        null,
      );
      await signAndSubmit(transaction);
    })(),
  );
  syncExitAfterUpdatingReferences();

  return currentTransaction;
}
