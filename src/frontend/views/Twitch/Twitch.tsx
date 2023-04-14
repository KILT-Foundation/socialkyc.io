import { FormEvent, Fragment, useCallback, useEffect, useState } from 'react';

import { IEncryptedMessage } from '@kiltprotocol/sdk-js';

import { Rejection, Session } from '../../utilities/session';
import { useValuesFromRedirectUri } from '../../utilities/useValuesFromRedirectUri';
import {
  AttestationStatus,
  FlowError,
  OAuthTemplate,
} from '../../components/OAuthTemplate/OAuthTemplate';
import backgroundImage from '../Attester/twitch.svg';

import { useTwitchApi } from './useTwitchApi';

export interface TwitchProfile {
  Username: string;
  'User ID': string;
}

interface Props {
  session: Session;
}

export function Twitch({ session }: Props): JSX.Element {
  const { code, secret } = useValuesFromRedirectUri();
  const initialStatus = code && secret ? 'authorizing' : 'none';

  const [flowError, setFlowError] = useState<FlowError>();
  const [status, setStatus] = useState<AttestationStatus>(initialStatus);
  const [processing, setProcessing] = useState(false);

  const twitchApi = useTwitchApi(session.sessionId);

  const [authUrl, setAuthUrl] = useState('');

  const [profile, setProfile] = useState<TwitchProfile>();

  const [backupMessage, setBackupMessage] = useState<IEncryptedMessage>();

  useEffect(() => {
    if (status !== 'none') {
      return;
    }
    (async () => {
      try {
        const url = await twitchApi.authUrl({});
        setAuthUrl(url);
        setStatus('urlReady');
      } catch (error) {
        console.error(error);
        setStatus('error');
        setFlowError('unknown');
      }
    })();
  }, [status, twitchApi]);

  useEffect(() => {
    if (!code || !secret) {
      return;
    }
    (async () => {
      try {
        setProfile(
          (await twitchApi.confirm({ code, secret })) as TwitchProfile,
        );
        setStatus('authorized');
      } catch {
        setStatus('error');
        setFlowError('unauthorized');
      }
    })();
  }, [twitchApi, code, secret]);

  const handleSubmit = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      setProcessing(true);
      setFlowError(undefined);
      try {
        await session.listen(async (message) => {
          try {
            await twitchApi.requestAttestation({ message });
            setStatus('attesting');
            setProcessing(false);

            setBackupMessage(await twitchApi.attest({}));
            setStatus('ready');
          } catch (exception) {
            if (exception instanceof Rejection) {
              setFlowError('closed');
            } else {
              console.error(exception);
              setFlowError('unknown');
              setStatus('error');
            }
          }
        });

        const message = await twitchApi.quote({});

        await session.send(message);
      } catch (error) {
        console.error(error);
        setStatus('error');
        setFlowError('unknown');
      } finally {
        setProcessing(false);
      }
    },
    [twitchApi, session],
  );

  const handleBackup = useCallback(async () => {
    try {
      if (!backupMessage) {
        throw new Error('No backup message');
      }
      await session.send(backupMessage);
    } catch (exception) {
      if (exception instanceof Rejection) {
        return; // don’t care that the user has closed the dialog
      }
      setFlowError('unknown');
      console.error(exception);
    }
  }, [backupMessage, session]);

  const handleTryAgainClick = useCallback(() => {
    setStatus('none');
    setFlowError(undefined);
  }, []);

  return (
    <OAuthTemplate
      service="Twitch"
      backgroundImage={backgroundImage}
      status={status}
      processing={processing}
      handleSubmit={handleSubmit}
      handleBackup={handleBackup}
      handleTryAgainClick={handleTryAgainClick}
      authUrl={authUrl}
      profile={
        profile && (
          <Fragment>
            <dt>User-ID:</dt>
            <dd>{profile['User ID']}</dd>

            <dt>Username:</dt>
            <dd>{profile.Username}</dd>
          </Fragment>
        )
      }
      flowError={flowError}
    />
  );
}
