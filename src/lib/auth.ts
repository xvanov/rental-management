import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/db";
import { authConfig } from "@/lib/auth.config";
import type { OrgRole } from "@/generated/prisma/client";

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  callbacks: {
    ...authConfig.callbacks,

    async jwt({ token, trigger }) {
      if (!token.sub) return token;

      // Refresh org info on sign-in or when explicitly updated
      if (trigger === "signIn" || trigger === "update" || !token.organizationId) {
        const user = await prisma.user.findUnique({
          where: { id: token.sub },
          select: { activeOrganizationId: true },
        });

        if (user?.activeOrganizationId) {
          // Check for pending invites and auto-accept
          if (token.email) {
            const pendingInvites = await prisma.organizationInvite.findMany({
              where: { email: token.email, acceptedAt: null },
            });

            for (const invite of pendingInvites) {
              const existing = await prisma.organizationMember.findUnique({
                where: {
                  organizationId_userId: {
                    organizationId: invite.organizationId,
                    userId: token.sub,
                  },
                },
              });

              if (!existing) {
                await prisma.organizationMember.create({
                  data: {
                    organizationId: invite.organizationId,
                    userId: token.sub,
                    role: invite.role,
                  },
                });
              }

              await prisma.organizationInvite.update({
                where: { id: invite.id },
                data: { acceptedAt: new Date() },
              });
            }
          }

          // Look up membership
          const membership = await prisma.organizationMember.findUnique({
            where: {
              organizationId_userId: {
                organizationId: user.activeOrganizationId,
                userId: token.sub,
              },
            },
            select: { role: true },
          });

          token.organizationId = user.activeOrganizationId;
          token.orgRole = (membership?.role as OrgRole) ?? null;
        } else {
          // No active org — check if there are pending invites to auto-join
          if (token.email) {
            const pendingInvite = await prisma.organizationInvite.findFirst({
              where: { email: token.email, acceptedAt: null },
            });

            if (pendingInvite) {
              await prisma.organizationMember.create({
                data: {
                  organizationId: pendingInvite.organizationId,
                  userId: token.sub,
                  role: pendingInvite.role,
                },
              });

              await prisma.organizationInvite.update({
                where: { id: pendingInvite.id },
                data: { acceptedAt: new Date() },
              });

              await prisma.user.update({
                where: { id: token.sub },
                data: { activeOrganizationId: pendingInvite.organizationId },
              });

              token.organizationId = pendingInvite.organizationId;
              token.orgRole = pendingInvite.role as OrgRole;
            } else {
              token.organizationId = null;
              token.orgRole = null;
            }
          } else {
            token.organizationId = null;
            token.orgRole = null;
          }
        }
      }

      return token;
    },

    async session({ session, token }) {
      if (token.sub && session.user) {
        session.user.id = token.sub;
      }
      if (session.user) {
        session.user.organizationId = (token.organizationId as string) ?? null;
        session.user.orgRole = (token.orgRole as OrgRole) ?? null;
      }
      return session;
    },
  },
});
