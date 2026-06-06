'use strict';

// electron-builder afterSign hook. Notarizes the macOS app ONLY when Apple
// credentials are present in the environment; otherwise it skips quietly so
// unsigned local/CI builds keep working.
const { notarize } = require('@electron/notarize');

exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;
  if (electronPlatformName !== 'darwin') return;

  const { APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID } = process.env;
  if (!APPLE_ID || !APPLE_APP_SPECIFIC_PASSWORD || !APPLE_TEAM_ID) {
    console.log('• notarize: Apple credentials not set — skipping notarization (build remains unsigned).');
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  console.log(`• notarize: submitting ${appName}.app to Apple…`);
  await notarize({
    tool: 'notarytool',
    appBundleId: 'com.justinjaudines.countdowndeck',
    appPath: `${appOutDir}/${appName}.app`,
    appleId: APPLE_ID,
    appleIdPassword: APPLE_APP_SPECIFIC_PASSWORD,
    teamId: APPLE_TEAM_ID
  });
  console.log('• notarize: done.');
};
