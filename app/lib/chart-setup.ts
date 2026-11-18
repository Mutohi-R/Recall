import {
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
} from 'chart.js';
import { CHART } from './chart-theme';

let done = false;

export function setupCharts() {
  if (done) return;
  done = true;
  Chart.register(
    BarController,
    BarElement,
    CategoryScale,
    LineController,
    LineElement,
    LinearScale,
    PointElement,
  );
  Chart.defaults.font.family = CHART.mono;
  Chart.defaults.font.size = 11;
  Chart.defaults.color = CHART.muted;
  Chart.defaults.animation = false;
}
