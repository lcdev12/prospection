import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { ProspectingConfig } from "../types.js";

const DEFAULT_CONFIG_PATH = "config/prospecting.config.json";

export const loadConfig = async (customPath?: string): Promise<ProspectingConfig> => {
  const filePath = resolve(customPath ?? DEFAULT_CONFIG_PATH);
  const fileContent = await readFile(filePath, "utf-8");
  return JSON.parse(fileContent) as ProspectingConfig;
};
