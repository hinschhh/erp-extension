interface SharePointConfig {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  siteId: string;
  driveId: string;
  folderPath: string;
}

interface UploadResult {
  success: boolean;
  fileUrl?: string;
  fileName?: string;
  error?: string;
}

/**
 * Get Microsoft Graph access token using OAuth2 client credentials flow
 */
async function getAccessToken(config: SharePointConfig): Promise<string> {
  const tokenUrl = `https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/token`;
  
  const params = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  });

  try {
    console.log("Acquiring token from:", tokenUrl);
    console.log("Client ID:", config.clientId);
    console.log("Tenant ID:", config.tenantId);
    
    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Token acquisition failed. Status:", response.status);
      console.error("Error response:", errorText);
      throw new Error(`Failed to acquire access token: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    
    if (!data.access_token) {
      console.error("Token response missing access_token:", data);
      throw new Error("No access token in response");
    }

    console.log("Access token acquired successfully");
    return data.access_token;
  } catch (error) {
    console.error("Error acquiring token:", error);
    throw new Error(error instanceof Error ? error.message : "Authentication failed");
  }
}

/**
 * Upload file to SharePoint using Microsoft Graph API
 */
export async function uploadToSharePoint(
  file: Buffer,
  fileName: string,
  subfolder: string = "",
  basePath: string = ""
): Promise<UploadResult> {
  try {
    const config: SharePointConfig = {
      tenantId: process.env.SHAREPOINT_TENANT_ID || "",
      clientId: process.env.SHAREPOINT_CLIENT_ID || "",
      clientSecret: process.env.SHAREPOINT_CLIENT_SECRET || "",
      siteId: process.env.SHAREPOINT_SITE_ID || "",
      driveId: process.env.SHAREPOINT_DRIVE_ID || "",
      folderPath: process.env.SHAREPOINT_FOLDER_PATH || "",
    };

    // Validate configuration
    if (!config.tenantId || !config.clientId || !config.clientSecret || !config.siteId || !config.driveId) {
      throw new Error("SharePoint configuration is incomplete");
    }

    const accessToken = await getAccessToken(config);

    // Construct the folder path - use basePath if provided, otherwise use config.folderPath
    const rootPath = basePath || config.folderPath;
    const fullPath = subfolder 
      ? `${rootPath}/${subfolder}/${fileName}`
      : `${rootPath}/${fileName}`;

    // Upload file using Microsoft Graph API
    const uploadUrl = `https://graph.microsoft.com/v1.0/sites/${config.siteId}/drives/${config.driveId}/root:/${fullPath}:/content`;

    console.log("Upload URL:", uploadUrl);
    console.log("Full path:", fullPath);
    console.log("File size:", file.length);

    const uploadResponse = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/octet-stream",
      },
      body: file as any,
    });

    console.log("Upload response status:", uploadResponse.status);

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      console.error("SharePoint upload error:", errorText);
      throw new Error(`Upload failed: ${uploadResponse.statusText}`);
    }

    const result = await uploadResponse.json();

    return {
      success: true,
      fileUrl: result.webUrl || result["@microsoft.graph.downloadUrl"],
      fileName: result.name,
    };
  } catch (error) {
    console.error("Error uploading to SharePoint:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
}

/**
 * Delete file from SharePoint
 */
export async function deleteFromSharePoint(
  fileName: string,
  subfolder: string = "",
  basePath: string = ""
): Promise<boolean> {
  try {
    const config: SharePointConfig = {
      tenantId: process.env.SHAREPOINT_TENANT_ID || "",
      clientId: process.env.SHAREPOINT_CLIENT_ID || "",
      clientSecret: process.env.SHAREPOINT_CLIENT_SECRET || "",
      siteId: process.env.SHAREPOINT_SITE_ID || "",
      driveId: process.env.SHAREPOINT_DRIVE_ID || "",
      folderPath: process.env.SHAREPOINT_FOLDER_PATH || "",
    };

    const accessToken = await getAccessToken(config);

    // Construct the folder path - use basePath if provided, otherwise use config.folderPath
    const rootPath = basePath || config.folderPath;
    const fullPath = subfolder 
      ? `${rootPath}/${subfolder}/${fileName}`
      : `${rootPath}/${fileName}`;

    console.log("Delete full path:", fullPath);

    const deleteUrl = `https://graph.microsoft.com/v1.0/sites/${config.siteId}/drives/${config.driveId}/root:/${fullPath}`;

    console.log("Delete URL:", deleteUrl);

    const deleteResponse = await fetch(deleteUrl, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    console.log("Delete response status:", deleteResponse.status);

    if (!deleteResponse.ok) {
      const errorText = await deleteResponse.text();
      console.error("Delete error response:", errorText);
    }

    return deleteResponse.ok;
  } catch (error) {
    console.error("Error deleting from SharePoint:", error);
    return false;
  }
}
