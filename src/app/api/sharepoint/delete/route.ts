import { NextRequest, NextResponse } from "next/server";
import { deleteFromSharePoint } from "@/utils/sharepoint/upload";

export async function DELETE(request: NextRequest) {
  try {
    console.log("SharePoint delete API called");
    
    const body = await request.json();
    const { fileName, subfolder, basePath } = body;
    
    console.log("Delete file:", fileName);
    console.log("From subfolder:", subfolder);
    console.log("Base path:", basePath);
    
    if (!fileName) {
      return NextResponse.json(
        { error: "No filename provided" },
        { status: 400 }
      );
    }

    // Delete from SharePoint
    const success = await deleteFromSharePoint(fileName, subfolder || "", basePath || "");

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
