import type { Chart, Plugin } from 'chart.js';
import { CHART } from './chart-theme';

export const baselinePlugin: Plugin = {
  id: 'recallBaseline',
  afterDraw(chart: Chart) {
    const { ctx, chartArea: a } = chart;
    ctx.save();
    ctx.strokeStyle = CHART.ink;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(a.left, a.bottom);
    ctx.lineTo(a.right, a.bottom);
    ctx.stroke();
    ctx.restore();
  },
};

export function valueLabelsPlugin(texts: () => (string | null)[]): Plugin {
  return {
    id: 'recallValueLabels',
    afterDatasetsDraw(chart: Chart) {
      const { ctx } = chart;
      const list = texts();
      ctx.save();
      ctx.fillStyle = CHART.ink;
      ctx.font = `11px ${CHART.mono}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      list.forEach((text, i) => {
        if (!text) return;
        let top: number | null = null;
        let x = 0;
        chart.data.datasets.forEach((d, k) => {
          if (d.data[i] == null) return;
          const el = chart.getDatasetMeta(k).data[i];
          if (el && (top === null || el.y < top)) {
            top = el.y;
            x = el.x;
          }
        });
        if (top !== null) ctx.fillText(text, x, top - 8);
      });
      ctx.restore();
    },
  };
}
