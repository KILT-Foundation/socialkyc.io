import { Fragment, useCallback, useRef, useState } from 'react';
import { IEncryptedMessage } from '@kiltprotocol/types';

import { Session } from '../../utilities/session';
import { usePreventNavigation } from '../../utilities/usePreventNavigation';
import { useCopyButton } from '../../components/useCopyButton/useCopyButton';
import { expiryDate } from '../../utilities/expiryDate';

import { Explainer } from '../../components/Explainer/Explainer';
import { Expandable } from '../../components/Expandable/Expandable';
import { AttestationProcess } from '../../components/AttestationProcess/AttestationProcess';

import { confirmTwitter } from '../../../backend/twitter/confirmTwitterApi';
import { attestTwitter } from '../../../backend/twitter/attestationTwitterApi';
import { quoteTwitter } from '../../../backend/twitter/quoteTwitterApi';
import { requestAttestationTwitter } from '../../../backend/twitter/requestAttestationTwitterApi';

import * as styles from './Twitter.module.css';

type AttestationStatus =
  | 'none'
  | 'requested'
  | 'confirming'
  | 'attesting'
  | 'ready'
  | 'error';

interface Props {
  session: Session;
}

export function Twitter({ session }: Props): JSX.Element {
  const [twitterHandle, setTwitterHandle] = useState('');

  const handleInput = useCallback((event) => {
    setTwitterHandle(event.target.value);
  }, []);

  const [processing, setProcessing] = useState(false);
  const [status, setStatus] = useState<AttestationStatus>('none');

  const [secret, setSecret] = useState('');

  const showSpinner = ['confirming', 'attesting'].includes(status);
  const showReady = status === 'ready';

  usePreventNavigation(processing || showSpinner);

  const messageRef = useRef<HTMLTextAreaElement>(null);
  const copy = useCopyButton(messageRef);

  const [backupMessage, setBackupMessage] = useState<
    IEncryptedMessage | undefined
  >();

  const handleSubmit = useCallback(
    async (event) => {
      event.preventDefault();
      setProcessing(true);

      try {
        const { sessionId } = session;

        await session.listen(async (message) => {
          try {
            const { secret } = await requestAttestationTwitter({
              sessionId,
              message,
            });
            setSecret(secret);
            setStatus('confirming');
            setProcessing(false);

            await confirmTwitter({ sessionId });
            setStatus('attesting');

            const attestationMessage = await attestTwitter({ sessionId });
            setBackupMessage(attestationMessage);

            setStatus('ready');
          } catch {
            setStatus('error');
          }
        });

        const message = await quoteTwitter({
          username: twitterHandle,
          sessionId,
        });

        setStatus('requested');
        await session.send(message);
      } catch (error) {
        console.error(error);
        setStatus('error');
      } finally {
        setProcessing(false);
      }
    },
    [session, twitterHandle],
  );

  const handleBackup = useCallback(async () => {
    if (!backupMessage) {
      return;
    }
    try {
      await session.send(backupMessage);
    } catch (error) {
      console.error(error);
    }
  }, [backupMessage, session]);

  return (
    // TODO: labels change depending on attestation status
    <Expandable path="/twitter" label="Twitter Account" processing={processing}>
      <Explainer>
        After entering your Twitter handle, please choose an identity in your
        wallet to associate with your Twitter credential. We will prompt you to
        Tweet so that we can attest your credential.
      </Explainer>
      <section>
        {status === 'none' && (
          <form className={styles.form} onSubmit={handleSubmit}>
            <label className={styles.formLabel}>
              Your Twitter handle
              <div className={styles.twitterInputContainer}>
                <input
                  className={styles.twitterInput}
                  onInput={handleInput}
                  type="text"
                  name="twitterHandle"
                  required
                />
              </div>
            </label>
            <p className={styles.subline}>Validity: one year ({expiryDate})</p>
            <button
              type="submit"
              className={styles.chooseIdentity}
              disabled={!twitterHandle}
            >
              Continue in wallet
            </button>
          </form>
        )}

        {status === 'confirming' && (
          <Fragment>
            <AttestationProcess
              spinner={showSpinner}
              ready={showReady}
              status="Starting"
              subline="Your credential will be attested as soon as you Tweet the text below."
            />
            <div>
              <label htmlFor="tweet">Please tweet this message:</label>
              <p className={styles.tweetContainer}>
                <textarea
                  className={styles.tweetInput}
                  id="tweet"
                  ref={messageRef}
                  value={`I just created my decentralized credentials with SocialKYC. Regain control of your personal data and protect your digital identity with @social_kyc_tech now. ${secret}`}
                  readOnly
                />
                {copy.supported && (
                  <button
                    className={copy.className}
                    onClick={copy.handleCopyClick}
                    type="button"
                  >
                    {copy.title}
                  </button>
                )}
              </p>
              <p className={styles.ctaLine}>
                <a
                  className={styles.cta}
                  href="https://twitter.com/"
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  Go to Twitter
                </a>
              </p>
            </div>
          </Fragment>
        )}

        {status === 'attesting' && (
          <AttestationProcess
            spinner={showSpinner}
            ready={showReady}
            status="Anchoring credential on KILT blockchain"
            subline="Please leave this tab open until your credential is attested."
          />
        )}

        {status === 'ready' && (
          <Fragment>
            <AttestationProcess
              spinner={showSpinner}
              ready={showReady}
              status="Credential is ready"
              subline="We recommend that you back up your credential now."
            />
            <p className={styles.ctaLine}>
              <button
                className={styles.cta}
                type="button"
                onClick={handleBackup}
              >
                Back up credential
              </button>
            </p>
          </Fragment>
        )}

        {status === 'error' && (
          <AttestationProcess
            spinner={showSpinner}
            ready={showReady}
            error="Oops, there was an error."
          />
        )}
      </section>
    </Expandable>
  );
}
