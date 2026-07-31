const MAX_LOCAL_PHOTO_BYTES = 2 * 1024 * 1024;

export type LocalPhotoKind = "care" | "pet";

export async function readPhotoFile(file: File) {
  if (!file.type.startsWith("image/")) throw new Error("Choose an image file.");
  if (file.size > MAX_LOCAL_PHOTO_BYTES) throw new Error("Choose an image smaller than 2 MB.");
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Furvise could not read that photo."));
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.readAsDataURL(file);
  });
}

export function saveLocalPhoto(kind: LocalPhotoKind, id: string, dataUrl: string) {
  if (!dataUrl || typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(localPhotoKey(kind, id), dataUrl);
    return true;
  } catch {
    return false;
  }
}

export function loadLocalPhoto(kind: LocalPhotoKind, id: string) {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(localPhotoKey(kind, id)) || "";
  } catch {
    return "";
  }
}

function localPhotoKey(kind: LocalPhotoKind, id: string) {
  return `furvise:${kind}-photo:${id}`;
}
