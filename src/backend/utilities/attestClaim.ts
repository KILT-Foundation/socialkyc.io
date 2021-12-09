import Boom from '@hapi/boom';
import {
  IDidKeyDetails,
  IEncryptedMessage,
  IRequestForAttestation,
  MessageBodyType,
} from '@kiltprotocol/types';
import { Attestation } from '@kiltprotocol/core';

import { configuration } from './configuration';
import { signAndSubmit } from './signAndSubmit';
import { encryptMessageBody } from './encryptMessage';
import { getSessionWithDid, Session, setSession } from './sessionStorage';

export async function attestClaim(
  requestForAttestation: IRequestForAttestation,
  encryptionKeyId: IDidKeyDetails['id'],
): Promise<IEncryptedMessage> {
  const attestation = Attestation.fromRequestAndDid(
    requestForAttestation,
    configuration.did,
  );

  const tx = await attestation.store();
  await signAndSubmit(tx);

  return encryptMessageBody(encryptionKeyId, {
    content: { attestation },
    type: MessageBodyType.SUBMIT_ATTESTATION,
  });
}

export async function getAttestationMessage(
  session: Session,
): Promise<IEncryptedMessage> {
  if (session.attestedMessagePromise) {
    return session.attestedMessagePromise;
  }

  const { encryptionKeyId, requestForAttestation, confirmed } =
    getSessionWithDid(session);
  if (!requestForAttestation || !confirmed) {
    throw Boom.notFound('Confirmed requestForAttestation not found');
  }

  const attestedMessagePromise = attestClaim(
    requestForAttestation,
    encryptionKeyId,
  );
  setSession({ ...session, attestedMessagePromise });

  return attestedMessagePromise;
}
