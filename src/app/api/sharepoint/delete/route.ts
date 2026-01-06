import { NextRequest, NextResponse } from "next/server";
import { deleteFromSharePoint } from "@/utils/sharepoint/upload";

export async function DELETE(request: NextRequest) {
  try {
    console.log("SharePoint delete API called");
    
    const body = await request.json();
    const { fileUrl } = body as { fileUrl?: string };

    if (!fileUrl) {
      return NextResponse.json({ error: "No fileUrl provided" }, { status: 400 });
    }

    // Delete from SharePoint
    const success = await deleteFromSharePoint(fileUrl);


    if (!success) {
      return NextResponse.json(
        { error: "Delete failed" },
        { status: 500 }
      );
    }

    console.log("File deleted successfully");

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    console.error("Delete API error:", error);
    const errorMessage = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
