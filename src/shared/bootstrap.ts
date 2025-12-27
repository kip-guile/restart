export type BootstrapPayload = {
  route: string;
  greeting: string;
  // This stays safe and non-sensitive
  // Add more fields later: featureFlags, locale, etc.
};
