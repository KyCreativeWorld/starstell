export class DriveError extends Error {}

export interface DriveFile {
  name: string;
  mimeType: string;
  content: string;
}

export interface DriveFolder {
  id: string;
  name: string;
  url: string;
}
