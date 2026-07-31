import { rgb } from "pdf-lib";

/* The Vet Brief uses the same approved palette as the application. */
export const PDF_THEME = {
  brand: rgb(57 / 255, 56 / 255, 49 / 255),
  accent: rgb(198 / 255, 201 / 255, 210 / 255),
  text: rgb(57 / 255, 56 / 255, 49 / 255),
  muted: rgb(57 / 255, 56 / 255, 49 / 255),
  border: rgb(184 / 255, 174 / 255, 168 / 255),
} as const;
