import type { ExpoConfig } from "expo/config";

// Dynamic config (over static app.json) so android.googleServicesFile can
// resolve to an EAS-hosted file environment variable in cloud builds, where
// the gitignored local file never exists on the build worker. See the
// GOOGLE_SERVICES_JSON env var (file type) uploaded per-environment via
// `eas env:create`, and docs/CONTRIBUTING.md §9 (secrets are never
// committed). Pattern per Expo's docs:
// https://docs.expo.dev/eas/environment-variables/faq/

// App variants (https://docs.expo.dev/build-reference/variants/): each EAS
// build profile sets APP_VARIANT so development, preview and production get
// their own name, package id and URL scheme and can be installed side by side
// on one device. Unset means production, so a missing variable can never ship
// a dev-labelled store build. Locally, apps/mobile/.env.local sets
// APP_VARIANT=development so `expo start --android` opens the dev client.
const APP_VARIANT = process.env.APP_VARIANT;
const IS_DEV = APP_VARIANT === "development";
const IS_PREVIEW = APP_VARIANT === "preview";

const idSuffix = IS_DEV ? ".dev" : IS_PREVIEW ? ".preview" : "";
const name = IS_DEV
  ? "KLT Cyber (Dev)"
  : IS_PREVIEW
    ? "KLT Cyber (Preview)"
    : "KLT Cyber Church";
const scheme = IS_DEV ? "kltcyber-dev" : IS_PREVIEW ? "kltcyber-preview" : "kltcyber";

// Declared separately (not inline in the ExpoConfig-typed literal below) so
// android.navigationBarColor — valid at runtime, absent from
// @expo/config-types — doesn't fail the outer literal's excess-property
// check; a variable reference isn't a "fresh" literal, so only structural
// assignability applies to it.
const android = {
  package: `com.kltcyber.church${idSuffix}`,
  googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? "./google-services.json",
  adaptiveIcon: {
    backgroundColor: "#C10810",
    foregroundImage: "./assets/images/android-icon-foreground.png",
    backgroundImage: "./assets/images/android-icon-background.png",
    monochromeImage: "./assets/images/android-icon-monochrome.png",
  },
  edgeToEdgeEnabled: true as const,
  predictiveBackGestureEnabled: false,
  navigationBarColor: "#FFFFFF",
};

export default (): ExpoConfig => {
  const config: ExpoConfig = {
    name,
    slug: "klt-cyber",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/images/icon.png",
    scheme,
    userInterfaceStyle: "light",
    newArchEnabled: true,
    runtimeVersion: {
      policy: "fingerprint",
    },
    updates: {
      url: "https://u.expo.dev/6f0edc13-211f-441d-a389-8f8996676df4",
    },
    ios: {
      bundleIdentifier: `com.kltcyber.church${idSuffix}`,
      supportsTablet: true,
    },
    android,
    web: {
      output: "static",
      favicon: "./assets/images/favicon.png",
    },
    plugins: [
      "expo-router",
      [
        "expo-splash-screen",
        {
          image: "./assets/images/logo-circle.png",
          imageWidth: 128,
          resizeMode: "contain",
          backgroundColor: "#0C2154",
        },
      ],
      "@react-native-community/datetimepicker",
      "expo-secure-store",
      "expo-notifications",
    ],
    experiments: {
      typedRoutes: true,
      reactCompiler: true,
    },
    extra: {
      router: {},
      eas: {
        projectId: "6f0edc13-211f-441d-a389-8f8996676df4",
      },
    },
    owner: "landrian12",
  };

  return config;
};
