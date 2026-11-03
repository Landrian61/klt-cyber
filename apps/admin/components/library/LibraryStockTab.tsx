"use client";

import { ArrowLeftRight, Flame, PackageSearch, Wallet } from "lucide-react";
import { LIBRARY_LOW_STOCK_THRESHOLD, formatUgx } from "@klt-cyber/shared";
import { useAuthQuery } from "@/lib/useAuthQuery";
import { api } from "@/lib/api";
import { StatCard } from "@/components/ui/StatCard";
import { ErrorState } from "@/components/ui/ErrorState";
import { StatGridSkeleton } from "@/components/ui/Skeletons";
import { CountUp } from "@/components/motion/CountUp";
import { Reveal } from "@/components/motion/Reveal";
import {
  NumeralRow,
  Panel,
  PanelChartSkeleton,
  PanelEmpty,
  PanelLines,
  coverageNote,
  useMinuteClock,
} from "./libraryDashboardParts";
import { LibraryMovementsChart } from "./LibraryTrendCharts";

/**
 * Stock: what is on the shelf and what is moving (spec 0017, AC-13 to AC-17).
 *
 * The two low stock figures here are DISJOINT — running low counts items
 * holding one to the threshold, out of stock counts items holding zero, and
 * neither includes the other. Overview's single card keeps spec 0015's
 * combined count and says so in its own hint, so the two tabs can be read side
 * by side without appearing to contradict each other (AC-13).
 */
export function LibraryStockTab() {
  const now = useMinuteClock();
  const stock = useAuthQuery(api.library.getLibraryStock, { now });

  if (stock === null) return <ErrorState />;

  // A trend is a chart only once something has actually moved, counting in and
  // out together. The four figures above are NOT a trend: with physical items
  // present but no movement ever recorded they still show their real numbers,
  // and with no physical items at all they show zeros, because zero units on
  // hand is a true and useful answer (AC-27).
  const hasMovement =
    stock !== undefined &&
    stock.monthlyMovements.some((point) => point.in > 0 || point.out > 0);
  const coverage = stock === undefined ? null : coverageNote(stock.coverageFrom);

  return (
    <div className="space-y-6">
      {stock === undefined ? (
        <StatGridSkeleton count={4} />
      ) : (
        <Reveal
          as="section"
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
        >
          <StatCard
            label="Units on hand"
            value={<CountUp value={stock.unitsOnHand} />}
            hint={
              stock.physicalItems === 0
                ? "No physical items yet"
                : `Across ${stock.physicalItems} physical ${stock.physicalItems === 1 ? "item" : "items"}`
            }
          />
          <StatCard
            label="Shelf value"
            value={
              <span className="font-mono">{formatUgx(stock.shelfValueUgx)}</span>
            }
            // A total that is short is never silently short: the hint names
            // how many items with stock on hand carry no price. An unpriced
            // item holding zero stock is not counted, because it would
            // contribute nothing either way (AC-14).
            hint={
              stock.unpricedWithStock === 0
                ? "Every item with stock carries a desk price"
                : `${stock.unpricedWithStock} ${stock.unpricedWithStock === 1 ? "item has" : "items have"} stock but no price, so this total is short`
            }
          />
          <StatCard
            label="Running low"
            value={<CountUp value={stock.runningLow} />}
            hint={`Holding 1 to ${LIBRARY_LOW_STOCK_THRESHOLD}, not counting any at zero`}
            emphasized={stock.runningLow > 0}
          />
          <StatCard
            label="Out of stock"
            value={<CountUp value={stock.outOfStock} />}
            hint={
              stock.outOfStock === 0
                ? "Nothing is at zero"
                : "Holding none at all"
            }
            emphasized={stock.outOfStock > 0}
          />
        </Reveal>
      )}

      <Panel
        title="In against out, by month"
        icon={<ArrowLeftRight className="size-4" />}
      >
        {stock === undefined ? (
          <PanelChartSkeleton />
        ) : !hasMovement ? (
          <PanelEmpty
            title="No stock has moved in the last twelve months"
            message="Record stock in or out and each month's totals appear here, side by side."
          />
        ) : (
          <>
            <LibraryMovementsChart points={stock.monthlyMovements} />
            {coverage ? (
              <p className="mt-3 font-body text-xs text-crimson">{coverage}</p>
            ) : (
              <p className="mt-3 font-body text-xs text-outline">
                The newest month is still running, so its bars are partial.
              </p>
            )}
          </>
        )}
      </Panel>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel
          title={`Moving fastest (${stock?.moverDays ?? 90} days)`}
          icon={<Flame className="size-4" />}
        >
          {stock === undefined ? (
            <PanelLines />
          ) : stock.movers.length === 0 ? (
            <PanelEmpty
              title="Nothing has gone out recently"
              message="The five items leaving the shelf fastest appear here, with the quantity beside each."
            />
          ) : (
            <>
              <ol className="space-y-3">
                {stock.movers.map((mover) => (
                  <NumeralRow
                    key={mover._id}
                    label={mover.title}
                    value={`${mover.quantityOut} out`}
                  />
                ))}
              </ol>
              {coverage && (
                <p className="mt-3 font-body text-xs text-crimson">
                  {coverage}
                </p>
              )}
            </>
          )}
        </Panel>

        <Panel title="Running low" icon={<PackageSearch className="size-4" />}>
          {stock === undefined ? (
            <PanelLines />
          ) : stock.lowStockList.length === 0 ? (
            <PanelEmpty
              title="Nothing is low"
              message={`Physical items that fall to ${LIBRARY_LOW_STOCK_THRESHOLD} or fewer are listed here, the emptiest first.`}
            />
          ) : (
            <ul className="space-y-3">
              {/* Zeros lead the list, because an item holding none is the one
                  somebody is asking for at the desk right now (AC-17). */}
              {stock.lowStockList.map((item) => (
                <NumeralRow
                  key={item._id}
                  label={item.title}
                  sublabel={
                    item.priceUgx === null
                      ? "No desk price set"
                      : formatUgx(item.priceUgx)
                  }
                  value={
                    item.quantityOnHand === 0
                      ? "none left"
                      : `${item.quantityOnHand} left`
                  }
                  tone={item.quantityOnHand === 0 ? "concern" : undefined}
                />
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {stock !== undefined && stock.physicalItems > 0 && (
        <p className="flex items-center gap-2 font-body text-xs text-outline">
          <Wallet className="size-3.5" aria-hidden="true" />
          Shelf value is what the stock would come to at desk prices. It is not
          a record of a sale.
        </p>
      )}
    </div>
  );
}
