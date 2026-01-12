declare module "suncalc" {
  type GetPositionReturns = {
    /**
     * azimuth: sun azimuth in radians (direction along the horizon, measured from south to west), e.g. 0 is south and Math.PI * 3/4 is northwest
     */
    azimuth: number;
    /**
     * altitude: sun altitude above the horizon in radians, e.g. 0 at the horizon and PI/2 at the zenith (straight over your head)
     */
    altitude: number;
  };

  type GetTimesReturns = {
    solarNoon: Date;
    nadir: null;
    goldenHour: Date;
    sunset: Date;
    sunrise: Date;
    goldenHourEnd: Date;
  };

  export function getPosition(
    date: Date,
    lat: number,
    lng: number
  ): GetPositionReturns;

  export function getTimes(
    date: Date,
    lat: number,
    lng: number
  ): GetTimesReturns;
}
