/**
 * iOS/Android: Google Drive saving isn't built yet (Google's browser sign-in
 * only works on the web). The web version lives in googleDrive.web.ts.
 */
import { DriveError, type DriveFile, type DriveFolder } from './googleDrive.types';

export { DriveError };
export type { DriveFile, DriveFolder };

const NOT_YET = 'Saving to Google Drive works in the web version of Starstell for now.';

export const driveAvailable = false;

export function preloadDrive(): void {}

export async function getDriveToken(): Promise<string> {
  throw new DriveError(NOT_YET);
}

export async function pickDriveFolder(): Promise<DriveFolder | null> {
  throw new DriveError(NOT_YET);
}

export async function createDriveFolder(_parentFolderUrl: string, _name: string): Promise<DriveFolder> {
  throw new DriveError(NOT_YET);
}

export async function uploadToDrive(_folderId: string, _files: DriveFile[]): Promise<void> {
  throw new DriveError(NOT_YET);
}
