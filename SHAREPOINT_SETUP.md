# SharePoint Upload Configuration

## Erforderliche Environment-Variablen

Um die SharePoint-Upload-Funktionalität zu nutzen, müssen folgende Umgebungsvariablen in der `.env.local` Datei gesetzt werden:

```env
# SharePoint / Microsoft 365 Configuration
SHAREPOINT_TENANT_ID=your-tenant-id
SHAREPOINT_CLIENT_ID=your-client-id
SHAREPOINT_CLIENT_SECRET=your-client-secret
SHAREPOINT_SITE_ID=your-site-id
SHAREPOINT_DRIVE_ID=your-drive-id
SHAREPOINT_FOLDER_PATH=your-folder-path
```

## Einrichtung

### 1. Azure App Registration erstellen

1. Gehen Sie zum [Azure Portal](https://portal.azure.com)
2. Navigieren Sie zu "Azure Active Directory" → "App registrations" → "New registration"
3. Namen eingeben (z.B. "ERP Extension SharePoint Uploader")
4. Unterstützte Kontotypen: "Accounts in this organizational directory only"
5. Registrieren

### 2. Client Secret erstellen

1. In der App-Registrierung zu "Certificates & secrets" navigieren
2. "New client secret" erstellen
3. Secret-Value kopieren (wird als `SHAREPOINT_CLIENT_SECRET` benötigt)

### 3. API-Berechtigungen hinzufügen

1. Zu "API permissions" navigieren
2. "Add a permission" → "Microsoft Graph" → "Application permissions"
3. Folgende Berechtigungen hinzufügen:
   - `Sites.ReadWrite.All`
   - `Files.ReadWrite.All`
4. "Grant admin consent" klicken

### 4. IDs ermitteln

**Tenant ID:**
- In der App-Registrierung unter "Overview" → "Directory (tenant) ID"

**Client ID:**
- In der App-Registrierung unter "Overview" → "Application (client) ID"

**Site ID:**
```bash
# Mit Graph Explorer oder PowerShell
GET https://graph.microsoft.com/v1.0/sites/{hostname}:/sites/{site-name}
```

**Drive ID:**
```bash
# Mit Graph Explorer
GET https://graph.microsoft.com/v1.0/sites/{site-id}/drives
```

**Folder Path:**
- Der relative Pfad zum Zielordner innerhalb des Drives
- Beispiel: `Gemeinsame Dokumente/Wareneingang`

## Verwendung

Die Upload-Komponenten in [wareneingang/bearbeiten/[id]/page.tsx](src/app/(authenticated)/lager/wareneingang/bearbeiten/[id]/page.tsx) verwenden automatisch die API-Route `/api/sharepoint/upload`.

Dateien werden in Unterordner hochgeladen basierend auf der Wareneingangsnummer:
- Struktur: `{SHAREPOINT_FOLDER_PATH}/wareneingang/{inbound_number}/{filename}`

## Dateiformat-Einschränkungen

Akzeptierte Dateiformate:
- PDF (`.pdf`)
- JPEG (`.jpg`, `.jpeg`)
- PNG (`.png`)

## Fehlerbehandlung

Die Implementierung enthält umfassende Fehlerbehandlung:
- Authentifizierungsfehler werden geloggt
- Upload-Fehler zeigen eine Benutzer-Nachricht
- Erfolgreiche Uploads aktualisieren automatisch das Formular-Feld mit der SharePoint-URL

## Technische Details

Die Implementierung verwendet den OAuth2 Client Credentials Flow direkt ohne zusätzliche Libraries. Die Authentifizierung erfolgt über standard fetch-Requests an die Microsoft Identity Platform.
