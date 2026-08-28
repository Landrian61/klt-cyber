import type { ExpoConfig } from "expo/config";

// Dynamic config (over static app.json) so android.googleServicesFile can
// resolve to an EAS-hosted file environment variable in cloud builds, where
// the gitignored local file never exists on the build worker. See the
// GOOGLE_SERVICES_JSON env var (file type) uploaded per-environment via
// `eas env:create`, and docs/CONTRIBUTING.md §9 (secrets are never
// committed). Pattern per Expo's docs:
// https://docs.expo.dev/eas/environment-variables/faq/

// Declared separately (not inline in the ExpoConfig-typed literal below) so
// android.navigationBarColor — valid at runtime, absent from
// @expo/config-types — doesn't fail the outer literal's excess-property
// check; a variable reference isn't a "fresh" literal, so only structural
// assignability applies to it.
const android = {
  package: "com.kltcyber.church",
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
    name: "KLT Cyber Church",
    slug: "klt-cyber",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/images/icon.png",
    scheme: "kltcyber",
    userInterfaceStyle: "light",
    newArchEnabled: true,
    runtimeVersion: {
      policy: "fingerprint",
    },
    updates: {
      url: "https://u.expo.dev/6f0edc13-211f-441d-a389-8f8996676df4",
    },
    ios: {
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
