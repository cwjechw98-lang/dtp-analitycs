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
        tooltip: {
          // confine — ECharts сам держит подсказку внутри контейнера
          // графика, вместо того чтобы позиционировать её от курсора без
          // учёта границ экрана. Дефолт как раз и давал баг: на телефоне
          // тултип вылезал за правый край, а свайп для его чтения задевал
          // системный жест закрытия модалки.
          confine: true,
          ...(typeof option.tooltip === "object" && !Array.isArray(option.tooltip)
            ? option.tooltip
            : {}),
        },
      },
      true,
    );
  }, [option]);

  return <div ref={ref} style={{ height }} className="w-full" />;
}
