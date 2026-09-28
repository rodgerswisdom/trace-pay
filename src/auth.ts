import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { exporters } from "@/db/schema";

declare module "next-auth" {
  interface Session {
    user: { id: string } & DefaultSession["user"];
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(creds) {
        const email = String(creds?.email ?? "").toLowerCase().trim();
        const password = String(creds?.password ?? "");
        const exporter = await db.query.exporters.findFirst({ where: eq(exporters.email, email) });
        if (!exporter || !(await bcrypt.compare(password, exporter.passwordHash))) return null;
        return { id: exporter.id, email: exporter.email, name: exporter.businessName };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user?.id) token.sub = user.id;
      return token;
    },
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      return session;
    },
  },
});

/** The signed-in exporter, or redirect to login. */
export async function requireExporter() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const exporter = await db.query.exporters.findFirst({ where: eq(exporters.id, session.user.id) });
  if (!exporter) redirect("/login");
  return exporter;
}
