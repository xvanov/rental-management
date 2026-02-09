import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createEvent } from "@/lib/events";
import {
  getEffectiveLastChanged,
  isOverdue,
  getNextDueDate,
  cadenceToMonths,
} from "@/lib/air-filters";

export async function GET(request: NextRequest) {
  // Validate CRON_SECRET in production
  if (process.env.NODE_ENV === "production") {
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const configs = await prisma.airFilterConfig.findMany({
      include: {
        property: { select: { id: true, address: true } },
        filters: true,
      },
    });

    let tasksCreated = 0;

    for (const config of configs) {
      const effectiveLastChanged = getEffectiveLastChanged(config);
      const overdue = isOverdue(effectiveLastChanged, config.cadence);

      if (!overdue) continue;

      // Check for existing open task
      const existingTask = await prisma.task.findFirst({
        where: {
          propertyId: config.propertyId,
          source: "AIR_FILTER",
          status: { in: ["PENDING", "IN_PROGRESS"] },
        },
      });

      if (existingTask) continue;

      const months = cadenceToMonths(config.cadence);
      const dueDate = getNextDueDate(effectiveLastChanged, config.cadence);

      await prisma.task.create({
        data: {
          title: `Change air filters - ${config.property.address}`,
          description: `Air filters are overdue for change (${months}-month cadence). ${config.filters.length} filter(s) to replace.`,
          priority: "HIGH",
          source: "AIR_FILTER",
          sourceId: config.id,
          propertyId: config.propertyId,
          dueDate,
        },
      });

      tasksCreated++;
    }

    await createEvent({
      type: "SYSTEM",
      payload: {
        action: "AIR_FILTER_CRON",
        description: `Air filter cron: checked ${configs.length} configs, created ${tasksCreated} task(s)`,
        metadata: {
          configsChecked: configs.length,
          tasksCreated,
        },
      },
    });

    return NextResponse.json({
      success: true,
      configsChecked: configs.length,
      tasksCreated,
    });
  } catch (error) {
    console.error("Air filter cron failed:", error);
    return NextResponse.json(
      { error: "Air filter cron failed" },
      { status: 500 }
    );
  }
}
