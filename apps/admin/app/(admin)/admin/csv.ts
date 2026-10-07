function escapeCsvCell(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Triggers a browser download of the given rows as a CSV file. */
export function downloadCsv(
  filename: string,
  headers: string[],
  rows: string[][],
) {
  const lines = [headers, ...rows].map((row) =>
    row.map(escapeCsvCell).join(","),
  );
  const csv = lines.join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
