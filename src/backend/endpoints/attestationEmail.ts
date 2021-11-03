import { Attestation, AttestedClaim } from '@kiltprotocol/core';
import { BlockchainUtils } from '@kiltprotocol/chain-helpers';
import {
  IDidDetails,
  IEncryptedMessage,
  IRequestForAttestation,
  ISubmitAttestationForClaim,
  MessageBodyType,
} from '@kiltprotocol/types';
import Message from '@kiltprotocol/messaging';
import {
  Request,
  ResponseObject,
  ResponseToolkit,
  ServerRoute,
} from '@hapi/hapi';
import Boom from '@hapi/boom';
import { z } from 'zod';

import { getRequestForAttestation } from '../utilities/requestCache';
import { fullDidPromise } from '../utilities/fullDid';
import { keypairsPromise } from '../utilities/keypairs';
import { assertionKeystore } from '../utilities/keystores';
import { configuration } from '../utilities/configuration';
import { encryptMessage } from '../utilities/encryptMessage';
import { paths } from './paths';

async function attestClaim(
  requestForAttestation: IRequestForAttestation,
  claimerDid: IDidDetails['did'],
): Promise<{ message: IEncryptedMessage }> {
  const attestation = Attestation.fromRequestAndDid(
    requestForAttestation,
    configuration.did,
  );

  const tx = await attestation.store();

  const { fullDid } = await fullDidPromise;
  const { identity } = await keypairsPromise;
  const extrinsic = await fullDid.authorizeExtrinsic(
    tx,
    assertionKeystore,
    identity.address,
  );

  await BlockchainUtils.signAndSubmitTx(extrinsic, identity, {
    resolveOn: BlockchainUtils.IS_FINALIZED,
    reSign: true,
  });

  const attestedClaim = AttestedClaim.fromRequestAndAttestation(
    requestForAttestation,
    attestation,
  );

  const messageBody: ISubmitAttestationForClaim = {
    content: { attestation: attestedClaim.attestation },
    type: MessageBodyType.SUBMIT_ATTESTATION_FOR_CLAIM,
  };

  const message = new Message(messageBody, configuration.did, claimerDid);
  const encrypted = await encryptMessage(message, claimerDid);

  return { message: encrypted };
}

const zodPayload = z.object({
  key: z.string(),
  did: z.string(),
});

export type Input = z.infer<typeof zodPayload>;

export interface Output {
  message: IEncryptedMessage;
}

async function handler(
  request: Request,
  h: ResponseToolkit,
): Promise<ResponseObject> {
  const { logger } = request;
  logger.debug('Email attestation started');

  const { key, did } = request.payload as Input;

  let requestForAttestation: IRequestForAttestation;
  try {
    requestForAttestation = getRequestForAttestation(key);
    logger.debug('Email attestation found request');
  } catch {
    throw Boom.notFound(`Key not found: ${key}`);
  }

  try {
    const response = await attestClaim(requestForAttestation, did);
    logger.debug('Email attestation completed');
    return h.response(response as Output);
  } catch (error) {
    throw Boom.internal('Attestation failed', error);
  }
}

export const attestationEmail: ServerRoute = {
  method: 'POST',
  path: paths.attestEmail,
  handler,
  options: {
    validate: {
      payload: async (payload) => zodPayload.parse(payload),
    },
  },
};
