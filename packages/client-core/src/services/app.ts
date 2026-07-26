import { invokeCommand } from "../commands/invoke";

export interface AppMetadata {
  name: string;
  version: string;
  platform: string;
}

export const appService = {
  metadata: () => invokeCommand<AppMetadata>("app_metadata"),
};

