// Netlify exposes this global inside Edge Functions.
declare const Netlify: { env: { get(name: string): string | undefined } };
