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

    /**
     * Надёжный resize: подгоняем холст под фактическую клиентскую ширину
     * контейнера, а не полагаемся на то, что ECharts сам заметит изменение.
     * Без этого при повороте телефона обратно canvas остаётся раздутым
     * (754px), карточка не сжимается, и вся страница начинает «ездить».
     */
    const syncSize = () => {
      const el = ref.current;
      const chart = chartRef.current;
      if (!el || !chart) return;
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w > 0 && h > 0) chart.resize({ width: w, height: h });
    };

    // поворот экрана и изменение окна
    const onResize = () => syncSize();
    window.addEventListener("resize", onResize);
    // изменение вьюпорта при повороте мобильного устройства
    if (window.visualViewport) {
      (window.visualViewport as unknown as { addEventListener: (t: string, cb: () => void) => void })
        .addEventListener("resize", onResize);
    }
    const ro = new ResizeObserver(syncSize);
    ro.observe(ref.current);
    return () => {
      window.removeEventListener("resize", onResize);
      if (window.visualViewport) {
        (window.visualViewport as unknown as { removeEventListener: (t: string, cb: () => void) => void })
          .removeEventListener("resize", onResize);
      }
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

  return <div ref={ref} style={{ height }} className="w-full min-w-0 overflow-hidden" />;
}
