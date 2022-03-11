import inert from '@hapi/inert';
import pino from 'hapi-pino';
import gate from 'hapi-gate';

import { fullDidPromise } from './utilities/fullDid';
import { noAwaitReportBalance } from './utilities/noAwaitReportBalance';
import { storeTwitterCType } from './twitter/twitterCType';
import { storeEmailCType } from './email/emailCType';
import { storeDomainLinkageCType } from './didConfiguration/domainLinkageCType';
import { storeDiscordCType } from './discord/discordCType';
import { storeGithubCType } from './github/githubCType';
import { storeTwitchCType } from './twitch/twitchCType';

import { configuration } from './utilities/configuration';
import { configureAuthentication } from './utilities/configureAuthentication';
import { configureDevErrors } from './utilities/configureDevErrors';
import { manager, server } from './utilities/manager';
import { exitOnError } from './utilities/exitOnError';

import { confirmationHtml } from './endpoints/confirmationHtml';
import { wellKnownDidConfig } from './didConfiguration/wellKnownDidConfig';

import { quoteEmail } from './email/quoteEmail';
import { confirmEmail } from './email/confirmEmail';
import { request } from './email/sendEmail';
import { attestationEmail } from './email/attestationEmail';

import { listenForTweets } from './twitter/tweets';
import { quoteTwitter } from './twitter/quoteTwitter';
import { confirmTwitter } from './twitter/confirmTwitter';
import { requestTwitter } from './twitter/requestAttestationTwitter';
import { attestationTwitter } from './twitter/attestationTwitter';

import { authUrlDiscord } from './discord/authUrlDiscord';
import { authHtmlDiscord } from './discord/authHtmlDiscord';
import { confirmDiscord } from './discord/confirmDiscord';
import { quoteDiscord } from './discord/quoteDiscord';
import { requestAttestationDiscord } from './discord/requestAttestationDiscord';
import { attestDiscord } from './discord/attestDiscord';

import { authHtmlGithub } from './github/authHtmlGithub';
import { authUrlgithub } from './github/authUrlGithub';
import { confirmGithub } from './github/confirmGithub';
import { quoteGithub } from './github/quoteGithub';
import { requestAttestationGithub } from './github/requestAttestationGithub';
import { attestGithub } from './github/attestGithub';

import { authUrlTwitch } from './twitch/authUrlTwitch';
import { authHtmlTwitch } from './twitch/authHtmlTwitch';
import { confirmTwitch } from './twitch/confirmTwitch';
import { quoteTwitch } from './twitch/quoteTwitch';
import { requestAttestationTwitch } from './twitch/requestAttestationTwitch';
import { attestTwitch } from './twitch/attestTwitch';

import { requestCredential } from './verifier/requestCredential';
import { verify } from './verifier/verify';

import { session } from './endpoints/session';

import { staticFiles } from './endpoints/staticFiles';

import { liveness } from './endpoints/liveness';
import { notFoundHandler } from './endpoints/notFoundHandler';
import { home } from './endpoints/home';
import { about } from './endpoints/about';
import { terms } from './endpoints/terms';
import { privacy } from './endpoints/privacy';

const { isProduction } = configuration;

const noWww = {
  plugin: gate,
  options: {
    https: false,
    nonwww: true,
  },
};

const logger = {
  plugin: pino,
  options: {
    ...(!isProduction && { transport: { target: 'pino-pretty' } }),
    ignoreTags: ['noLogs'],
    level: isProduction ? 'debug' : 'trace',
    logRequestComplete: isProduction,
    redact: isProduction
      ? ['req.headers.authorization']
      : { paths: ['req', 'res'], remove: true },
  },
};

(async () => {
  await server.register(noWww);
  await server.register(inert);
  await server.register(logger);
  await configureAuthentication(server);
  await configureDevErrors(server);
  server.logger.info('Server configured');

  if (configuration.storeDidAndCTypes) {
    await fullDidPromise;
    await storeDomainLinkageCType();
    await storeEmailCType();
    await storeTwitterCType();
    await storeDiscordCType();
    await storeGithubCType();
    await storeTwitchCType();
    server.logger.warn('Blockchain objects stored');
  }

  await fullDidPromise;
  server.logger.info('Blockchain connection initialized');

  noAwaitReportBalance();

  await listenForTweets();
  server.logger.info('Twitter connection initialized');

  server.route(confirmationHtml);
  server.route(wellKnownDidConfig);

  server.route(session);

  server.route(quoteEmail);
  server.route(confirmEmail);
  server.route(request);
  server.route(attestationEmail);

  server.route(quoteTwitter);
  server.route(confirmTwitter);
  server.route(requestTwitter);
  server.route(attestationTwitter);

  server.route(authHtmlDiscord);
  server.route(authUrlDiscord);
  server.route(confirmDiscord);
  server.route(quoteDiscord);
  server.route(requestAttestationDiscord);
  server.route(attestDiscord);

  server.route(authHtmlGithub);
  server.route(authUrlgithub);
  server.route(confirmGithub);
  server.route(quoteGithub);
  server.route(requestAttestationGithub);
  server.route(attestGithub);

  server.route(authHtmlTwitch);
  server.route(authUrlTwitch);
  server.route(confirmTwitch);
  server.route(quoteTwitch);
  server.route(requestAttestationTwitch);
  server.route(attestTwitch);

  server.route(requestCredential);
  server.route(verify);

  server.route(home);
  server.route(about);
  server.route(terms);
  server.route(privacy);

  server.route(staticFiles);

  server.route(liveness);

  server.ext('onPreResponse', notFoundHandler);
  server.logger.info('Routes configured');

  await manager.start();
})().catch(exitOnError);
