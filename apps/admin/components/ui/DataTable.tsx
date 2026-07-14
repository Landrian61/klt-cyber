"use client";

import type { ReactNode } from "react";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";

// Data table (INTERFACE_SPEC §12.1 loading, §12.3 empty): builds on the
// composable Table parts. `rows === undefined` renders surface-low skeleton
// pulses in the correct layout; `[]` renders the designed empty state inside
// the shell. Sorting is controlled — headers only report clicks upward.

export interface Column<Row> {
  key: string;
  header: ReactNode;
  align?: "left" | "right";
  sortable?: boolean;
  render: (row: Row) => ReactNode;
}

export interface DataTableProps<Row> {
  columns: Column<Row>[];
  rows: Row[] | undefined;
  rowKey: (row: Row) => string;
  onRowClick?: (row: Row) => void;
  sortKey?: string | null;
  sortDirection?: "asc" | "desc";
  onSortChange?: (key: string) => void;
  empty?: ReactNode;
  skeletonRows?: number;
}

export function DataTable<Row>({
  columns,
  rows,
  rowKey,
  onRowClick,
  sortKey = null,
  sortDirection = "asc",
  onSortChange,
  empty,
  skeletonRows = 5,
}: DataTableProps<Row>) {
  return (
    <Table>
      <THead>
        <TR>
          {columns.map((column) => (
            <TH
              key={column.key}
              align={column.align}
              sortable={column.sortable}
              sortDirection={sortKey === column.key ? sortDirection : null}
              onSort={
                onSortChange ? () => onSortChange(column.key) : undefined
              }
            >
              {column.header}
            </TH>
          ))}
        </TR>
      </THead>
      <TBody>
        {rows === undefined ? (
          Array.from({ length: skeletonRows }).map((_, index) => (
            <TR key={index}>
              {columns.map((column) => (
                <TD key={column.key} align={column.align}>
                  <div className="h-4 animate-pulse rounded-sm bg-surface-low" />
                </TD>
              ))}
            </TR>
          ))
        ) : rows.length === 0 ? (
          <tr>
            <td colSpan={columns.length} className="py-16">
              <div className="flex justify-center">{empty}</div>
            </td>
          </tr>
        ) : (
          rows.map((row) => (
            <TR
              key={rowKey(row)}
              interactive={Boolean(onRowClick)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
            >
              {columns.map((column) => (
                <TD key={column.key} align={column.align}>
                  {column.render(row)}
                </TD>
              ))}
            </TR>
          ))
        )}
      </TBody>
    </Table>
  );
}
