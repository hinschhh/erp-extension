import { NextRequest, NextResponse } from "next/server";
import { uploadToSharePoint } from "@/utils/sharepoint/upload";

export async function POST(request: NextRequest) {
  try {
    console.log("SharePoint upload API called");
    
    // Check environment variables
    const requiredEnvVars = [
      'SHAREPOINT_TENANT_ID',
      'SHAREPOINT_CLIENT_ID', 
      'SHAREPOINT_CLIENT_SECRET',
      'SHAREPOINT_SITE_ID',
      'SHAREPOINT_DRIVE_ID',
      'SHAREPOINT_FOLDER_PATH'
    ];
    
    const missingVars = requiredEnvVars.filter(v => !process.env[v]);
    if (missingVars.length > 0) {
      console.error("Missing environment variables:", missingVars);
      return NextResponse.json(
        { error: `Missing configuration: ${missingVars.join(', ')}` },
        { status: 500 }
      );
    }

    const formData = await request.formData();
    const file = formData.get("file") as File;
    const subfolder = formData.get("subfolder") as string || "";
    const prefix = formData.get("prefix") as string || "";
    const basePath = formData.get("basePath") as string || "";
    
    console.log("File received:", file?.name, "Size:", file?.size);
    console.log("Subfolder:", subfolder);
    console.log("Prefix:", prefix);
    console.log("Base path:", basePath);
    
    if (!file) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 }
      );
    }

    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Apply prefix to filename
    const fileName = prefix ? `${prefix}_${file.name}` : file.name;

    console.log("Uploading to SharePoint...");
    console.log("Final filename:", fileName);
    
    // Upload to SharePoint
    const result = await uploadToSharePoint(buffer, fileName, subfolder, basePath);

    console.log("Upload result:", result);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Upload failed" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      fileUrl: result.fileUrl,
      fileName: result.fileName,
    });
  } catch (error) {
    console.error("Upload API error:", error);
    const errorMessage = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
