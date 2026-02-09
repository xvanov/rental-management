import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const propertyId = searchParams.get("propertyId");
    const source = searchParams.get("source");
    const includeCompleted = searchParams.get("includeCompleted") === "true";

    const where: Prisma.TaskWhereInput = {};

    if (status) {
      where.status = status as Prisma.EnumTaskStatusFilter;
    } else if (!includeCompleted) {
      where.status = { in: ["PENDING", "IN_PROGRESS"] };
    }

    if (propertyId) {
      where.propertyId = propertyId;
    }

    if (source) {
      where.source = source as Prisma.EnumTaskSourceFilter;
    }

    const tasks = await prisma.task.findMany({
      where,
      include: {
        property: { select: { id: true, address: true } },
      },
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
    });

    return NextResponse.json(tasks);
  } catch (error) {
    console.error("Failed to fetch tasks:", error);
    return NextResponse.json(
      { error: "Failed to fetch tasks" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { title, description, priority, propertyId, dueDate } = body;

    if (!title) {
      return NextResponse.json(
        { error: "Title is required" },
        { status: 400 }
      );
    }

    const task = await prisma.task.create({
      data: {
        title,
        description: description || null,
        priority: priority || "MEDIUM",
        source: "MANUAL",
        propertyId: propertyId || null,
        dueDate: dueDate ? new Date(dueDate) : null,
      },
      include: {
        property: { select: { id: true, address: true } },
      },
    });

    return NextResponse.json(task, { status: 201 });
  } catch (error) {
    console.error("Failed to create task:", error);
    return NextResponse.json(
      { error: "Failed to create task" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, status, title, description, priority, dueDate } = body;

    if (!id) {
      return NextResponse.json(
        { error: "Task id is required" },
        { status: 400 }
      );
    }

    const data: Prisma.TaskUpdateInput = {};
    if (title !== undefined) data.title = title;
    if (description !== undefined) data.description = description || null;
    if (priority !== undefined) data.priority = priority;
    if (dueDate !== undefined) data.dueDate = dueDate ? new Date(dueDate) : null;

    if (status !== undefined) {
      data.status = status;
      if (status === "COMPLETED" || status === "DISMISSED") {
        data.completedAt = new Date();
      } else {
        data.completedAt = null;
      }
    }

    const task = await prisma.task.update({
      where: { id },
      data,
      include: {
        property: { select: { id: true, address: true } },
      },
    });

    return NextResponse.json(task);
  } catch (error) {
    console.error("Failed to update task:", error);
    return NextResponse.json(
      { error: "Failed to update task" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "Task id is required" },
        { status: 400 }
      );
    }

    await prisma.task.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete task:", error);
    return NextResponse.json(
      { error: "Failed to delete task" },
      { status: 500 }
    );
  }
}
