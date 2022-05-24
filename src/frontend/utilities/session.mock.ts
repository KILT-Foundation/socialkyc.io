import { jest } from '@jest/globals';

import { makeControlledPromise } from '../../backend/utilities/makeControlledPromise';

import { Session } from './session';

export const sessionMock: Session = {
  encryptionKeyId: 'encryptionKeyId',
  encryptedChallenge: 'encryptedChallenge',
  nonce: 'nonce',
  send: jest.fn(async () => {
    /* dummy */
  }),
  close: jest.fn(async () => {
    /* dummy */
  }),
  listen: jest.fn(async () => {
    /* dummy */
  }),
  sessionId: 'foo',
  name: 'foo bar',
};

export let sessionMockSendPromise = makeControlledPromise<void>();

export function sessionMockReset() {
  jest.mocked(sessionMock.listen).mockReset();
  jest.mocked(sessionMock.send).mockReset();

  sessionMockSendPromise = makeControlledPromise<void>();
  jest.mocked(sessionMock.send).mockReturnValue(sessionMockSendPromise.promise);
}
