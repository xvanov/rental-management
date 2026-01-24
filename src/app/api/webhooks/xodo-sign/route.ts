import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createEvent } from "@/lib/events";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const { event, data } = body;
    const documentId = data?.document_id || data?.id;

    if (!documentId) {
      console.error("Xodo Sign webhook: no document ID in payload", body);
      return NextResponse.json({ received: true });
    }

    // Find the lease by xodoSignDocumentId
    const lease = await prisma.lease.findFirst({
      where: { xodoSignDocumentId: documentId },
      include: { unit: true },
    });

    if (!lease) {
      console.error(
        `Xodo Sign webhook: no lease found for document ${documentId}`
      );
      return NextResponse.json({ received: true });
    }

    // Handle document completion (signature)
    if (
      event === "document.complete" ||
      event === "document_complete" ||
      data?.status === "completed"
    ) {
      await prisma.lease.update({
        where: { id: lease.id },
        data: {
          status: "ACTIVE",
          signedAt: new Date(),
          signedDocumentUrl: data?.download_url || null,
        },
      });

      await createEvent({
        type: "LEASE",
        payload: {
          leaseId: lease.id,
          action: "SIGNED",
          version: lease.version,
        },
        tenantId: lease.tenantId,
        propertyId: lease.unit.propertyId,
      });

      console.log(
        `Xodo Sign webhook: lease ${lease.id} signed successfully`
      );
    }

    // Handle document decline
    if (
      event === "document.decline" ||
      event === "document_decline" ||
      data?.status === "declined"
    ) {
      await prisma.lease.update({
        where: { id: lease.id },
        data: { status: "DRAFT" },
      });

      await createEvent({
        type: "SYSTEM",
        payload: {
          action: "LEASE_SIGNATURE_DECLINED",
          description: `Lease signature was declined for lease ${lease.id}`,
          metadata: { leaseId: lease.id, documentId },
        },
        tenantId: lease.tenantId,
        propertyId: lease.unit.propertyId,
      });

      console.log(`Xodo Sign webhook: lease ${lease.id} signature declined`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Xodo Sign webhook error:", error);
    // Return 200 to prevent retries
    return NextResponse.json({ received: true });
  }
}
