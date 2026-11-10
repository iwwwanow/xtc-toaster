const pad = (value: number) => String(value).padStart(2, "0");

// project-wide output naming: xtc-toaster_<YYYYMMDD-HHmmss>.<ext>, local time — the same prefix whatever toast is open
const PREFIX = "xtc-toaster";

export const outputFileName = (ext: string, date = new Date()) => {
  const day = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
  const time = `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  return `${PREFIX}_${day}-${time}.${ext}`;
};

export const base64ToBlob = (base64: string, type: string) =>
  new Blob([Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))], { type });

export const saveBlob = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
};
