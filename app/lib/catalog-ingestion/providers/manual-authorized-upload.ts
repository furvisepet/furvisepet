import { readFile, stat } from "node:fs/promises";
import { extname, isAbsolute, relative, resolve } from "node:path";
import { AuthorizedCatalogAdapter } from "../adapters/authorized-catalog-adapter.ts";
import type { AuthorizedCatalogMetadata, AuthorizedProviderContract } from "./authorized-provider-types.ts";
import type { AuthorizedFieldMapping } from "./field-mapping.ts";
import { validateAuthorizedCatalogMetadata, validateProviderContract } from "./provider-contract.ts";

export const PRIVATE_CATALOG_IMPORT_ROOT = resolve(process.cwd(), "private", "catalog-imports");

export async function preparePrivateAuthorizedCatalog(input: {
  contract: AuthorizedProviderContract;
  feedPath: string;
  mapping?: AuthorizedFieldMapping;
  metadata: AuthorizedCatalogMetadata;
}) {
  const contractValidation = validateProviderContract(input.contract);
  const metadataValidation = validateAuthorizedCatalogMetadata(input.contract, input.metadata);
  if (!contractValidation.valid || !metadataValidation.valid) {
    throw new Error(`Authorized upload metadata is not approved: ${[...contractValidation.issues, ...metadataValidation.issues].join(", ")}`);
  }
  const feedPath = resolvePrivatePath(input.feedPath);
  const expectedExtension = input.metadata.fileFormat === "api" ? ".json" : `.${input.metadata.fileFormat}`;
  if (extname(feedPath).toLowerCase() !== expectedExtension) throw new Error("Authorized upload file extension does not match its metadata.");
  const file = await stat(feedPath);
  if (!file.isFile() || file.size > input.contract.refreshLimits.maxFileBytes) throw new Error("Authorized upload is not a permitted catalog file.");
  const body = await readFile(feedPath);
  return {
    adapter: new AuthorizedCatalogAdapter({ contract: input.contract, mapping: input.mapping, metadata: input.metadata }),
    body,
    filename: relative(PRIVATE_CATALOG_IMPORT_ROOT, feedPath),
  };
}

export function resolvePrivatePath(value: string) {
  const candidate = isAbsolute(value) ? resolve(value) : resolve(PRIVATE_CATALOG_IMPORT_ROOT, value);
  const pathFromRoot = relative(PRIVATE_CATALOG_IMPORT_ROOT, candidate);
  if (!pathFromRoot || pathFromRoot.startsWith("..") || isAbsolute(pathFromRoot)) throw new Error("Authorized uploads must be files inside the private catalog-import directory.");
  return candidate;
}
