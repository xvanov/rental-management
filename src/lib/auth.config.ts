import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

/**
 * Edge-compatible auth config. No Prisma imports here.
 * JWT and session callbacks that need DB access are in auth.ts.
 */
export const authConfig: NextAuthConfig = {
  trustHost: true,
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      allowDangerousEmailAccountLinking: true,
    }),
  ],
  pages: {
    signIn: "/login",
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isOnDashboard = nextUrl.pathname.startsWith("/dashboard");
      const isOnOnboarding = nextUrl.pathname.startsWith("/onboarding");

      if (isOnDashboard) {
        if (!isLoggedIn) return false;
        return true;
      }

      if (isOnOnboarding) {
        if (!isLoggedIn) return false;
        return true;
      }

      return true;
    },
  },
  session: {
    strategy: "jwt",
  },
};
