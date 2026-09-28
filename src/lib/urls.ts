export const appUrl = () => (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
export const buyerLink = (token: string) => `${appUrl()}/b/${token}`;
