import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-context";
import { auth } from "@/lib/auth";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id || !session.user.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const members = await prisma.organizationMember.findMany({
      where: { organizationId: session.user.organizationId },
      include: {
        user: { select: { id: true, name: true, email: true, image: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    const invites = await prisma.organizationInvite.findMany({
      where: {
        organizationId: session.user.organizationId,
        acceptedAt: null,
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ members, invites });
  } catch (error) {
    console.error("Failed to fetch members:", error);
    return NextResponse.json(
      { error: "Failed to fetch members" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAdmin();
    if (ctx instanceof NextResponse) return ctx;

    const body = await request.json();
    const { email, role = "MEMBER" } = body;

    if (!email || !email.trim()) {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 }
      );
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Check if already invited
    const existingInvite = await prisma.organizationInvite.findUnique({
      where: {
        organizationId_email: {
          organizationId: ctx.organizationId,
          email: normalizedEmail,
        },
      },
    });

    if (existingInvite && !existingInvite.acceptedAt) {
      return NextResponse.json(
        { error: "This email has already been invited" },
        { status: 400 }
      );
    }

    // Check if user already exists and is already a member
    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existingUser) {
      const existingMembership = await prisma.organizationMember.findUnique({
        where: {
          organizationId_userId: {
            organizationId: ctx.organizationId,
            userId: existingUser.id,
          },
        },
      });

      if (existingMembership) {
        return NextResponse.json(
          { error: "This user is already a member" },
          { status: 400 }
        );
      }

      // User exists — add them directly
      await prisma.$transaction(async (tx) => {
        await tx.organizationMember.create({
          data: {
            organizationId: ctx.organizationId,
            userId: existingUser.id,
            role: role === "ADMIN" ? "ADMIN" : "MEMBER",
          },
        });

        // Set their active org if they don't have one
        if (!existingUser.activeOrganizationId) {
          await tx.user.update({
            where: { id: existingUser.id },
            data: { activeOrganizationId: ctx.organizationId },
          });
        }

        // Create invite record for audit trail
        await tx.organizationInvite.upsert({
          where: {
            organizationId_email: {
              organizationId: ctx.organizationId,
              email: normalizedEmail,
            },
          },
          create: {
            organizationId: ctx.organizationId,
            email: normalizedEmail,
            role: role === "ADMIN" ? "ADMIN" : "MEMBER",
            invitedBy: ctx.userId,
            acceptedAt: new Date(),
          },
          update: {
            acceptedAt: new Date(),
          },
        });
      });

      return NextResponse.json(
        { message: "User added to organization", immediate: true },
        { status: 201 }
      );
    }

    // User doesn't exist yet — create invite (they'll auto-join on signup)
    const invite = await prisma.organizationInvite.create({
      data: {
        organizationId: ctx.organizationId,
        email: normalizedEmail,
        role: role === "ADMIN" ? "ADMIN" : "MEMBER",
        invitedBy: ctx.userId,
      },
    });

    return NextResponse.json(
      { message: "Invite sent", invite, immediate: false },
      { status: 201 }
    );
  } catch (error) {
    console.error("Failed to invite member:", error);
    return NextResponse.json(
      { error: "Failed to invite member" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const ctx = await requireAdmin();
    if (ctx instanceof NextResponse) return ctx;

    const { searchParams } = new URL(request.url);
    const memberId = searchParams.get("memberId");
    const inviteId = searchParams.get("inviteId");

    if (inviteId) {
      // Cancel a pending invite
      await prisma.organizationInvite.delete({
        where: {
          id: inviteId,
          organizationId: ctx.organizationId,
        },
      });
      return NextResponse.json({ message: "Invite cancelled" });
    }

    if (!memberId) {
      return NextResponse.json(
        { error: "memberId or inviteId is required" },
        { status: 400 }
      );
    }

    // Can't remove yourself
    const member = await prisma.organizationMember.findUnique({
      where: { id: memberId },
    });

    if (!member || member.organizationId !== ctx.organizationId) {
      return NextResponse.json(
        { error: "Member not found" },
        { status: 404 }
      );
    }

    if (member.userId === ctx.userId) {
      return NextResponse.json(
        { error: "You cannot remove yourself" },
        { status: 400 }
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.organizationMember.delete({
        where: { id: memberId },
      });

      // Clear the user's active org if it was this one
      await tx.user.updateMany({
        where: {
          id: member.userId,
          activeOrganizationId: ctx.organizationId,
        },
        data: { activeOrganizationId: null },
      });
    });

    return NextResponse.json({ message: "Member removed" });
  } catch (error) {
    console.error("Failed to remove member:", error);
    return NextResponse.json(
      { error: "Failed to remove member" },
      { status: 500 }
    );
  }
}
