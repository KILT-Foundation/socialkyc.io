import NodeCache from 'node-cache';
import Boom from '@hapi/boom';
import {
  IDidDetails,
  IDidKeyDetails,
  IEncryptedMessage,
  IRequestForAttestation,
} from '@kiltprotocol/types';
import { randomAsNumber } from '@polkadot/util-crypto';

export interface Session {
  sessionId: string;
  did?: IDidDetails['did'];
  encryptionKeyId?: IDidKeyDetails['id'];
  didChallenge?: string;
  didConfirmed?: boolean;
  requestForAttestation?: IRequestForAttestation;
  confirmed?: boolean;
  attestedMessagePromise?: Promise<IEncryptedMessage>;
  requestChallenge?: string;
}

type SessionWithDid = Session & {
  did: IDidDetails['did'];
  encryptionKeyId: IDidKeyDetails['id'];
};

export interface PayloadWithSession {
  sessionId: string;
}

const sessionStorage = new NodeCache({ stdTTL: 60 * 60, useClones: false });

export function getSession({ sessionId }: { sessionId: string }): Session {
  const session = sessionStorage.get(sessionId);
  if (!session) {
    throw Boom.forbidden(`Unknown or expired session ${sessionId}`);
  }
  return session as Session;
}

export function getSessionWithDid(input: {
  sessionId: string;
}): SessionWithDid {
  const session = getSession(input);

  const { did, didConfirmed, encryptionKeyId } = session;
  if (!did || !didConfirmed || !encryptionKeyId) {
    throw Boom.forbidden('Unconfirmed DID');
  }

  return { ...session, did, encryptionKeyId };
}

export function setSession(session: Session): void {
  sessionStorage.set(session.sessionId, session);
}

const secrets = new NodeCache({ stdTTL: 5 * 60 });

export function getSessionBySecret(secret: string): Session {
  const sessionId: string | undefined = secrets.get(secret);
  if (!sessionId) {
    throw Boom.forbidden(`Not found session for secret ${secret}`);
  }
  return getSession({ sessionId });
}

export function getSecretForSession(sessionId: string): string {
  const secret = String(randomAsNumber()); // only numbers to avoid 0xDEADDAD etc
  secrets.set(secret, sessionId);
  return secret;
}

export function deleteSecret(secret: string): void {
  secrets.del(secret);
}
