import { memo, useMemo, useState } from 'react';
import { Panel } from '@/_components';
import {
  createAltitudeScaledOrbitSensitivity,
  CreateAltitudeScaledOrbitSensitivityOptions,
  createAltitudeScaledWheelZoom,
  CreateAltitudeScaledWheelZoomOptions,
} from '@/explore/controls/ExploreControls.class.js';

export type XyDataPoint = [number, number];

type XyLineChartProps = {
  data: XyDataPoint[];
  formatXTick?: (value: number) => string;
  formatYTick?: (value: number) => string;
};

const formatNumber = (value: number) => {
  if (Math.abs(value) >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (Math.abs(value) >= 1_000) {
    return `${(value / 1_000).toFixed(1)}K`;
  }
  return value.toFixed(1);
};

const XyLineChart = memo(
  ({ data, formatXTick = formatNumber, formatYTick = formatNumber }: XyLineChartProps) => {
    const width = 320;
    const height = 180;
    const padding = { top: 16, right: 32, bottom: 28, left: 16 };

    const xs = data.map(([x]) => x);
    const ys = data.map(([, y]) => y);

    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY0 = Math.min(...ys);
    const minY = Math.min(0, ...ys);
    const maxY = Math.max(...ys);

    const innerWidth = width - padding.left - padding.right;
    const innerHeight = height - padding.top - padding.bottom;

    const xToSvg = (x: number) => {
      if (maxX === minX) {
        return padding.left + innerWidth / 2;
      }
      return padding.left + (1 - (x - minX) / (maxX - minX)) * innerWidth;
    };

    const yToSvg = (y: number) => {
      if (maxY === minY) {
        return height - padding.bottom - innerHeight / 2;
      }
      return height - padding.bottom - ((y - minY) / (maxY - minY)) * innerHeight;
    };

    const linePath = data
      .map(([x, y], index) => `${index === 0 ? 'M' : 'L'} ${xToSvg(x)} ${yToSvg(y)}`)
      .join(' ');

    const xTicks = [maxX, (minX + maxX) / 2, minX];
    const yTicks = [minY, (minY + maxY) / 2, maxY];

    return (
      <svg viewBox={`0 0 ${width} ${height}`} className="block overflow-visible">
        <rect x="0" y="0" width={width} height={height} fill="transparent" />
        <line
          x1={padding.left / 2}
          y1={height - padding.bottom}
          x2={width - padding.right / 2}
          y2={height - padding.bottom}
          stroke="#fae"
          strokeWidth="1"
        />

        <line
          x1={width - padding.right}
          y1={padding.top / 2}
          x2={width - padding.right}
          y2={height - padding.bottom / 2}
          stroke="#ea0"
          strokeWidth="1"
        />

        <line
          x1={padding.left / 2}
          y1={yToSvg(minY0)}
          x2={width - padding.right / 2}
          y2={yToSvg(minY0)}
          stroke="#05a"
          strokeWidth="1"
        />

        {xTicks.map((tick) => {
          const x = xToSvg(tick);
          return (
            <g key={`x-${tick}`}>
              <text
                x={x}
                y={height - 8}
                textAnchor="middle"
                fill="#000"
                fontSize="9"
                fontFamily="ui-monospace, SFMono-Regular, monospace"
              >
                {formatXTick(tick)}
              </text>
            </g>
          );
        })}

        {yTicks.map((tick) => {
          const y = yToSvg(tick);
          return (
            <g key={`y-${tick}`}>
              <text
                x={width - padding.right + 10}
                y={y + 3}
                textAnchor="start"
                fill="#000"
                fontSize="9"
                fontFamily="ui-monospace, SFMono-Regular, monospace"
              >
                {formatYTick(tick)}
              </text>
            </g>
          );
        })}
        <path d={linePath} fill="none" stroke="#000" strokeWidth="1.2" />
      </svg>
    );
  },
);

export const ZoomFactorCharts = memo(() => {
  const [vars, setVars] = useState<CreateAltitudeScaledWheelZoomOptions>({
    referenceAltitudeMeters: 100,
    min: 0,
    factor: 4,
    scale: 100,
  });

  const data = useMemo(() => {
    const ticks = 100;
    const maxFar = vars.referenceAltitudeMeters;
    const step = maxFar / ticks;

    const emit = createAltitudeScaledWheelZoom({
      referenceAltitudeMeters: maxFar,
      ...vars,
    });

    return new Array(ticks).fill(0).map((_, index) => {
      const far = step * index;
      return [far, emit(far)] as XyDataPoint;
    });
  }, [vars]);

  return (
    <div className="fixed right-2 bottom-2 ">
      <Panel className="1" defaultMinimized={true} title="Far - Zoom Sensitivity" description="">
        <div className=" w-3xl">
          <div className=" border p-2 rounded-2xl space-y-1">
            <label>maxfar: {vars.referenceAltitudeMeters}</label>
            <input
              placeholder="maxFar"
              type="range"
              min={100}
              max={10000}
              value={vars.referenceAltitudeMeters}
              onChange={(event) =>
                setVars({ ...vars, referenceAltitudeMeters: event.target.valueAsNumber })
              }
              className=" w-full px-2 text-jade-800 border rounded-lg"
            />

            <label>min: {vars.min}</label>
            <input
              placeholder="min"
              type="range"
              step={0.01}
              min={0.1}
              max={1}
              value={vars.min}
              onChange={(event) => setVars({ ...vars, min: event.target.valueAsNumber })}
              className=" w-full px-2 text-jade-800 border rounded-lg"
            />

            <label>factor: {vars.factor}</label>
            <input
              placeholder="factor"
              type="range"
              step={0.1}
              min={0.1}
              max={10}
              value={vars.factor}
              onChange={(event) => setVars({ ...vars, factor: event.target.valueAsNumber })}
              className=" w-full px-2 text-jade-800 border rounded-lg"
            />
            <label>mag: {vars.scale}</label>
            <input
              placeholder="mag"
              type="range"
              step={100}
              min={100}
              max={1000000}
              value={vars.scale}
              onChange={(event) => setVars({ ...vars, scale: event.target.valueAsNumber })}
              className=" w-full px-2 text-jade-800 border rounded-lg"
            />
          </div>

          <XyLineChart
            data={data}
            formatXTick={(tick) => formatNumber(tick / vars.referenceAltitudeMeters)}
          />
        </div>
      </Panel>
    </div>
  );
});

export const OrbitFactorCharts = memo(() => {
  const [vars, setVars] = useState<CreateAltitudeScaledOrbitSensitivityOptions>({
    referenceAltitudeMeters: 100,
    min: 0,
    scale: 1,
  });

  const data = useMemo(() => {
    const ticks = 100;
    const maxFar = vars.referenceAltitudeMeters;
    const step = maxFar / ticks;

    const emit = createAltitudeScaledOrbitSensitivity({
      referenceAltitudeMeters: maxFar,
      ...vars,
    });

    return new Array(ticks).fill(0).map((_, index) => {
      const far = step * index;
      return [far, emit(far)] as XyDataPoint;
    });
  }, [vars]);

  return (
    <div className="fixed right-2 top-2 ">
      <Panel className="1" defaultMinimized={true} title="Far - Zoom Sensitivity" description="">
        <div className=" w-3xl">
          <div className=" border p-2 rounded-2xl space-y-1">
            <label>maxfar: {vars.referenceAltitudeMeters}</label>
            <input
              placeholder="maxFar"
              type="range"
              min={100}
              max={10000}
              value={vars.referenceAltitudeMeters}
              onChange={(event) =>
                setVars({ ...vars, referenceAltitudeMeters: event.target.valueAsNumber })
              }
              className=" w-full px-2 text-jade-800 border rounded-lg"
            />

            <label>min: {vars.min}</label>
            <input
              placeholder="min"
              type="range"
              step={0.01}
              min={0.1}
              max={1}
              value={vars.min}
              onChange={(event) => setVars({ ...vars, min: event.target.valueAsNumber })}
              className=" w-full px-2 text-jade-800 border rounded-lg"
            />

            <label>scale: {vars.scale}</label>
            <input
              placeholder="mag"
              type="range"
              step={100}
              min={100}
              max={1000000}
              value={vars.scale}
              onChange={(event) => setVars({ ...vars, scale: event.target.valueAsNumber })}
              className=" w-full px-2 text-jade-800 border rounded-lg"
            />
          </div>

          <XyLineChart
            data={data}
            formatXTick={(tick) => formatNumber(tick / vars.referenceAltitudeMeters)}
          />
        </div>
      </Panel>
    </div>
  );
});
