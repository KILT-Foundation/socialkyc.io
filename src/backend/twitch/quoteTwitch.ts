import {
  Request,
  ResponseObject,
  ResponseToolkit,
  ServerRoute,
} from '@hapi/hapi';
import Boom from '@hapi/boom';
import { z } from 'zod';
import { IEncryptedMessage, MessageBodyType } from '@kiltprotocol/types';

import { encryptMessageBody } from '../utilities/encryptMessage';
import {
  getSessionWithDid,
  PayloadWithSession,
} from '../utilities/sessionStorage';
import { exceptionToError } from '../../frontend/utilities/exceptionToError';
import { paths } from '../endpoints/paths';

import { twitchCType } from './twitchCType';

const zodPayload = z.object({
  sessionId: z.string(),
});

export type Input = z.infer<typeof zodPayload>;

export type Output = IEncryptedMessage;

async function handler(
  request: Request,
  h: ResponseToolkit,
): Promise<ResponseObject> {
  const { logger } = request;
  logger.debug('Twitch quote started');

  const { sessionId } = request.payload as PayloadWithSession;
  const { encryptionKeyId, claim, confirmed } = getSessionWithDid({
    sessionId,
  });

  if (!claim || !confirmed) {
    throw Boom.notFound('Confirmed claim not found');
  }

  try {
    const output = await encryptMessageBody(encryptionKeyId, {
      content: {
        claim,
        legitimations: [],
        cTypes: [twitchCType],
      },
      type: MessageBodyType.SUBMIT_TERMS,
    });

    logger.debug('Twitch quote completed');
    return h.response(output as Output);
  } catch (exception) {
    throw Boom.boomify(exceptionToError(exception));
  }
}

export const quoteTwitch: ServerRoute = {
  method: 'POST',
  path: paths.twitch.quote,
  handler,
  options: {
    validate: {
      payload: async (payload) => zodPayload.parse(payload),
    },
  },
};
