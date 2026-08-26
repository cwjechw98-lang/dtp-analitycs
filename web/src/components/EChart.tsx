import { useEffect, useRef } from "react";
import * as echarts from "echarts";

/** Минимальная обёртка над ECharts: тёмная тема, прозрачный фон, resize. */
export default function EChart({
  option,
  height = 320,
}: {
  option: echarts.EChartsOption;
  height?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chartRef = useRef<any>(null);

  useEffect(() => {
    if (!ref.current) return;
    chartRef.current = echarts.init(ref.current, "dark", {
      renderer: "canvas",
    });
    const onResize = () => chartRef.current?.resize();
    window.addEventListener("resize", onResize);
    const ro = new ResizeObserver(onResize);
    ro.observe(ref.current);
    return () => {
      window.removeEventListener("resize", onResize);
      ro.disconnect();
      chartRef.current?.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!chartRef.current) return;
    chartRef.current.setOption(
      {
        backgroundColor: "transparent",
        textStyle: { fontFamily: "inherit" },
        ...option,
      },
      true,
    );
  }, [option]);

  return <div ref={ref} style={{ height }} className="w-full" />;
}
