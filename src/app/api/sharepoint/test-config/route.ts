import { NextResponse } from "next/server";

export async function GET() {
  const config = {
    tenantId: process.env.SHAREPOINT_TENANT_ID ? "✓ Set" : "✗ Missing",
    clientId: process.env.SHAREPOINT_CLIENT_ID ? "✓ Set" : "✗ Missing",
    clientSecret: process.env.SHAREPOINT_CLIENT_SECRET ? "✓ Set" : "✗ Missing",
    siteId: process.env.SHAREPOINT_SITE_ID ? "✓ Set" : "✗ Missing",
    driveId: process.env.SHAREPOINT_DRIVE_ID ? "✓ Set" : "✗ Missing",
    folderPath: process.env.SHAREPOINT_FOLDER_PATH ? "✓ Set" : "✗ Missing",
  };

  return NextResponse.json(config);
}
