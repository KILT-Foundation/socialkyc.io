import {
  Request,
  ResponseObject,
  ResponseToolkit,
  ServerRoute,
} from '@hapi/hapi';
import Boom from '@hapi/boom';
import { z } from 'zod';

import {
  deleteSecret,
  getSession,
  getSessionBySecret,
  setSession,
} from '../utilities/sessionStorage';
import { paths } from '../endpoints/paths';

import { emailCType } from './emailCType';

const zodPayload = z.object({
  secret: z.string(),
  sessionId: z.string(),
});

export type Input = z.infer<typeof zodPayload>;

export type Output = undefined;

async function handler(
  request: Request,
  h: ResponseToolkit,
): Promise<ResponseObject> {
  const { logger } = request;
  logger.debug('Email confirmation started');

  const { secret, sessionId } = request.payload as Input;

  // This is the initial session in the first tab the user has open
  const firstSession = getSessionBySecret(secret);
  const { requestForAttestation } = firstSession;
  if (!requestForAttestation) {
    throw Boom.notFound('requestForAttestation not found');
  }
  if (requestForAttestation.claim.cTypeHash !== emailCType.hash) {
    throw Boom.notFound('requestForAttestation cType mismatch');
  }

  // Clicking the confirmation link in the email opens a new tab with a new session
  const currentSession = getSession({ sessionId });

  // carry over the request to the current session and clean up the initial one
  setSession({ ...currentSession, requestForAttestation, confirmed: true });
  delete firstSession.requestForAttestation;
  setSession(firstSession);
  deleteSecret(secret);

  logger.debug('Email confirmation completed');

  return h.response(<Output>undefined);
}

export const confirmEmail: ServerRoute = {
  method: 'POST',
  path: paths.email.confirm,
  handler,
  options: {
    validate: {
      payload: async (payload) => zodPayload.parse(payload),
    },
  },
};
