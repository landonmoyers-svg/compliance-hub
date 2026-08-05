// afterSign hook — notarize the signed .app with Apple's notarytool using a
// KEYCHAIN PROFILE, so the app-specific password stays in the user's macOS
// Keychain and never appears in env vars, the repo, or CI logs.
//
// One-time setup by the user (password is entered into THEIR terminal only):
//   xcrun notarytool store-credentials "compliance-hub-notary" \
//     --apple-id "<your-apple-id>" --team-id "XVN4NXD6CJ"
//   (paste an app-specific password from appleid.apple.com when prompted)
//
// Then `npm run build:mac:signed` signs + notarizes + staples in one shot.
// Set SKIP_NOTARIZE=1 to build signed-but-not-notarized (still Gatekeeper-warned).

const { notarize } = require("@electron/notarize");

exports.default = async function notarizing(context) {
  if (process.platform !== "darwin") return;
  // Unsigned builds (build:mac) can't be notarized — skip so they still succeed.
  if (process.env.CSC_IDENTITY_AUTO_DISCOVERY === "false") {
    console.log("Unsigned build — skipping notarization.");
    return;
  }
  if (process.env.SKIP_NOTARIZE === "1") {
    console.log("SKIP_NOTARIZE=1 — skipping notarization.");
    return;
  }
  const { appOutDir, packager } = context;
  const appName = packager.appInfo.productFilename;
  const keychainProfile = process.env.NOTARY_PROFILE || "compliance-hub-notary";
  console.log(`Notarizing ${appName}.app via keychain profile "${keychainProfile}"…`);
  await notarize({
    tool: "notarytool",
    appPath: `${appOutDir}/${appName}.app`,
    keychainProfile,
  });
  console.log("Notarization complete.");
};
