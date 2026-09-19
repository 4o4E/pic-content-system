import type { DailyMediaCountDto } from "@pic/shared";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card } from "@/components/ui/card";

export function DailyNewChart({ data }: { data: DailyMediaCountDto[] }) {
  return (
    <Card className="p-4 sm:p-5">
      <div className="mb-4">
        <h2 className="text-base font-semibold">每日新增趋势</h2>
        <p className="mt-1 text-xs text-muted-foreground">最近 30 天入库的正式内容，按北京时间统计</p>
      </div>
      <div className="h-72 w-full sm:h-80" role="img" aria-label={`最近 30 天每日新增内容趋势：${data.map((item) => `${item.date} ${item.count} 条`).join("，")}`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="date" tickFormatter={(date: string) => date.slice(5)} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} interval={4} axisLine={false} tickLine={false} />
            <YAxis allowDecimals={false} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip formatter={(value) => [`${value} 条`, "新增内容"]} contentStyle={{ background: "var(--surface-elevated)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--foreground)" }} />
            <Bar dataKey="count" fill="var(--primary)" radius={[3, 3, 0, 0]} maxBarSize={24} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
