import {
  Request,
  ResponseObject,
  ResponseToolkit,
  ServerRoute,
} from '@hapi/hapi';
import Boom from '@hapi/boom';
import { z } from 'zod';
import { Claim } from '@kiltprotocol/core';
import { IEncryptedMessage, MessageBodyType } from '@kiltprotocol/types';

import { twitterCType } from './twitterCType';
import { encryptMessageBody } from '../utilities/encryptMessage';
import { paths } from '../endpoints/paths';
import { getSessionWithDid } from '../utilities/sessionStorage';

const zodPayload = z.object({
  username: z.string(),
  sessionId: z.string(),
});

export type Input = z.infer<typeof zodPayload>;

export type Output = IEncryptedMessage;

async function handler(
  request: Request,
  h: ResponseToolkit,
): Promise<ResponseObject> {
  const { logger } = request;
  logger.debug('Twitter quote started');

  const payload = request.payload as Input;
  const { did } = getSessionWithDid(payload);

  try {
    const claimContents = {
      Twitter: payload.username,
    };
    const claim = Claim.fromCTypeAndClaimContents(
      twitterCType,
      claimContents,
      did,
    );
    logger.debug('Twitter quote created');

    const output = await encryptMessageBody(did, {
      content: {
        claim,
        legitimations: [],
        cTypes: [twitterCType],
      },
      type: MessageBodyType.SUBMIT_TERMS,
    });

    logger.debug('Twitter quote completed');
    return h.response(output as Output);
  } catch (error) {
    return Boom.boomify(error as Error);
  }
}

export const quoteTwitter: ServerRoute = {
  method: 'POST',
  path: paths.twitter.quote,
  handler,
  options: {
    validate: {
      payload: async (payload) => zodPayload.parse(payload),
    },
  },
};
