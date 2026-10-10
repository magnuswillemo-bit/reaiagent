"use client";

import { APIProvider, Map, Marker } from "@vis.gl/react-google-maps";
import { useRouter } from "next/navigation";

type Asset = {
  id: number;
  site_code: string;
  common_name: string;
  latitude: number;
  longitude: number;
};

export default function MapWidget({ assets }: { assets: Asset[] }) {
  const router = useRouter();
  const defaultCenter = { lat: 20.0, lng: 15.0 };

  return (
    <APIProvider apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!}>
      <div className="w-full h-96 rounded overflow-hidden">
        <Map defaultCenter={defaultCenter} defaultZoom={2} gestureHandling={"greedy"}>
          {assets?.map((asset) => (
            asset.latitude && asset.longitude ? (
              <Marker
                key={asset.id}
                position={{ lat: Number(asset.latitude), lng: Number(asset.longitude) }}
                title={asset.common_name}
                icon="http://maps.google.com/mapfiles/ms/icons/blue-dot.png"
                onClick={() => router.push(`/database?id=${asset.id}`)}
              />
            ) : null
          ))}
        </Map>
      </div>
    </APIProvider>
  );
}