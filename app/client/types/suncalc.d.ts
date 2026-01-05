declare module "suncalc" {
  type GetPositionReturns = {
    azimuth: number;
    altitude: number;
  };

  type GetTimesReturns = {
    solarNoon: null;
    nadir: null;
  };

  export function getPosition(
    date: Date,
    lat: number,
    lng: number
  ): GetPositionReturns;
}
