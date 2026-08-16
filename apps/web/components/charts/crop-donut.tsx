"use client";

import { formatTonnes, type CropShare } from "@flora/contracts";
import { Cell, Pie, PieChart } from "recharts";
import { ChartContainer } from "@/components/ui/chart";
import { chartConfigFromKeys, chartSeriesColors } from "./config";

export interface CropDonutProps {
  totalKg: number;
  byCrop: CropShare[];
}

/** The Crops Stocked card's 103px ring (§1.3) — `formatTonnes` keeps the app's one tonnage format, not the Figma's unspaced "277T". */
export function CropDonut({ totalKg, byCrop }: CropDonutProps) {
  const config = chartConfigFromKeys(byCrop.map((c) => c.crop));
  const data = byCrop.map((c) => ({ crop: c.crop, kg: c.kg }));

  return (
    <div className="relative flex h-[113px] w-[113px] shrink-0 items-center justify-center">
      <ChartContainer config={config} className="aspect-square h-full w-full">
        <PieChart>
          <Pie
            data={data}
            dataKey="kg"
            nameKey="crop"
            innerRadius="68%"
            outerRadius="100%"
            strokeWidth={0}
            isAnimationActive={false}
          >
            {data.map((entry, i) => (
              <Cell key={entry.crop} fill={chartSeriesColors[i % chartSeriesColors.length]} />
            ))}
          </Pie>
        </PieChart>
      </ChartContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-0.5">
        <span className="text-label-md text-text-strong-950">{formatTonnes(totalKg)}</span>
        <span className="text-paragraph-xs text-text-soft-400">Crops</span>
      </div>
    </div>
  );
}
