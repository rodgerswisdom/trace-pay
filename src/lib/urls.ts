// Public base URL for buyer links and Payaza's redirect_url. APP_URL wins; on Vercel the production
// domain is detected automatically, so nothing needs setting there.
export const appUrl = () => {
  const explicit = process.env.APP_URL;
  if (explicit && !(process.env.VERCEL && explicit.includes("localhost"))) return explicit.replace(/\/$/, "");
  const vercel = process.env.VERCEL_ENV === "production" ? process.env.VERCEL_PROJECT_PRODUCTION_URL : process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}`;
  return "http://localhost:3000";
};
export const buyerLink = (token: string) => `${appUrl()}/b/${token}`;
