// Beta builds are the Netlify deploy previews and the "beta" branch deploy (beta.bitebeacon.org).
// netlify.toml sets EXPO_PUBLIC_BETA=1 for those builds only, so bitebeacon.org itself is never a beta.
// On a beta: no demo, no sign-up, and only admins (rows in the admins table) can stay signed in.
export const IS_BETA = process.env.EXPO_PUBLIC_BETA === '1';
