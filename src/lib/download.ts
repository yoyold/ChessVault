/**
 * Hand a file to the browser's download machinery.
 *
 * Built from parts rather than one string, so a caller assembling something
 * large never has to hold it as a single string the size of the file.
 *
 * The object URL is released afterwards: it pins the blob in memory until it
 * is, and the files that pass through here — a whole collection, a whole
 * database — are exactly the ones worth not pinning.
 */
export function downloadFile(parts: BlobPart[], filename: string, type: string): void {
  const url = URL.createObjectURL(new Blob(parts, { type }));

  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();

  URL.revokeObjectURL(url);
}
