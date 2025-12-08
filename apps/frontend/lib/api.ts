export interface SatelliteStats {
  ndvi: {
    min: number;
    max: number;
    mean: number;
    std_dev: number;
  };
  metadata: Record<string, unknown>;
  rgb_url?: string;
}

export interface Geometry {
  type: string;
  coordinates: number[][][];
}

export interface DateRange {
  start_date: string;
  end_date: string;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export const fetchSatelliteStats = async (
  geometry: Geometry,
  dateRange: DateRange
): Promise<SatelliteStats> => {
  const response = await fetch(`${API_URL}/satellite/stats`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      geometry,
      date_range: dateRange,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || "Failed to fetch satellite stats");
  }

  return response.json();
};

export const fetchSatelliteTile = async (
  geometry: Geometry,
  dateRange: DateRange,
  layerType: string = "rgb"
): Promise<string> => {
  const response = await fetch(
    `${API_URL}/satellite/tile?layer_type=${layerType}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        geometry,
        date_range: dateRange,
      }),
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || "Failed to fetch satellite tile");
  }

  // Returns the URL string directly
  return response.json();
};
