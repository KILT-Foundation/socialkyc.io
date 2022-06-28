import { Keypair } from '@polkadot/util-crypto/types';
import {
  DidResolver,
  FullDidCreationBuilder,
  FullDidDetails,
} from '@kiltprotocol/did';
import {
  DidKey,
  IDidDetails,
  KeyRelationship,
  KeyringPair,
  NewDidVerificationKey,
  VerificationKeyType,
} from '@kiltprotocol/types';
import { Crypto } from '@kiltprotocol/utils';
import {
  BlockchainApiConnection,
  BlockchainUtils,
} from '@kiltprotocol/chain-helpers';

import { initKilt } from './initKilt';
import { keypairsPromise } from './keypairs';
import { configuration } from './configuration';
import { authenticationKeystore } from './keystores';
import { exitOnError } from './exitOnError';
import { logger } from './logger';

const { authentication, assertionMethod, keyAgreement } = KeyRelationship;

function getDidKeyFromKeypair(keypair: KeyringPair): NewDidVerificationKey {
  return {
    ...keypair,
    type: VerificationKeyType.Sr25519,
  };
}

export async function createFullDid(): Promise<IDidDetails['uri']> {
  const { api } = await BlockchainApiConnection.getConnectionOrConnect();

  const keypairs = await keypairsPromise;
  const authenticationKey = getDidKeyFromKeypair(keypairs.authentication);
  const assertionKey = getDidKeyFromKeypair(keypairs.assertion);

  const builder = new FullDidCreationBuilder(api, authenticationKey)
    .setAttestationKey(assertionKey)
    .addEncryptionKey(keypairs.keyAgreement);

  const fullDidDetails = await builder.buildAndSubmit(
    authenticationKeystore,
    keypairs.identity.address,
    async (extrinsic) => {
      await BlockchainUtils.signAndSubmitTx(extrinsic, keypairs.identity, {
        resolveOn: BlockchainUtils.IS_FINALIZED,
      });
    },
  );

  const { uri } = fullDidDetails;

  logger.warn(uri, 'This is your generated DID:');

  return uri;
}

async function compareKeys(
  derived: KeyringPair | Keypair,
  resolved: DidKey | undefined,
  relationship: KeyRelationship,
): Promise<void> {
  if (!resolved) {
    throw new Error(`Resolved key for ${relationship} is undefined`);
  }
  const derivedHex = Crypto.u8aToHex(derived.publicKey);
  const resolvedHex = Crypto.u8aToHex(resolved.publicKey);
  if (derivedHex !== resolvedHex) {
    throw new Error(
      `Derived key for ${relationship} does not match resolved one ${resolved.id}`,
    );
  }
}

async function compareAllKeys(fullDid: FullDidDetails): Promise<void> {
  const keypairs = await keypairsPromise;

  await compareKeys(
    keypairs.authentication,
    fullDid.authenticationKey,
    authentication,
  );
  await compareKeys(
    keypairs.assertion,
    fullDid.attestationKey,
    assertionMethod,
  );
  await compareKeys(keypairs.keyAgreement, fullDid.encryptionKey, keyAgreement);
}

export const fullDidPromise = (async () => {
  await initKilt();

  if (configuration.storeDidAndCTypes) {
    if (
      configuration.didUri &&
      (await DidResolver.resolveDoc(configuration.didUri))
    ) {
      logger.info('DID is already on the blockchain');
    } else {
      logger.warn('Storing DID on the blockchain');
      configuration.didUri = await createFullDid();
    }
  }

  const fullDid = await FullDidDetails.fromChainInfo(configuration.didUri);
  if (!fullDid) {
    throw new Error(`Could not resolve the own DID ${configuration.didUri}`);
  }

  await compareAllKeys(fullDid);
  const { encryptionKey } = fullDid;
  if (!encryptionKey) {
    throw new Error('Key agreement key not found');
  }

  return { fullDid, encryptionKey };
})();

fullDidPromise.catch(exitOnError);
