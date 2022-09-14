import got from 'got';

import { sessionHeader } from '../endpoints/sessionHeader';

import { paths } from '../endpoints/paths';

import { configuration } from '../utilities/configuration';

import { Input, Output } from '../email/requestAttestationEmail';

export async function requestAttestationApi(
  json: Input,
  sessionId: string,
): Promise<Output> {
  return got
    .post(`${configuration.baseUri}${paths.email.requestAttestation}`, {
      json,
      headers: { [sessionHeader]: sessionId },
    })
    .json();
}
