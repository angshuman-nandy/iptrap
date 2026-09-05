import { useEffect, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

// Vite doesn't resolve Leaflet's default marker image paths automatically —
// point them at the bundled asset URLs instead.
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

const selectedIcon = new L.Icon({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
  iconSize: [29, 46],
  iconAnchor: [14, 46],
  className: "marker-selected",
});

function FlyToSelected({ selected }) {
  const map = useMap();
  useEffect(() => {
    if (selected && selected.geo_lat != null && selected.geo_lon != null) {
      map.flyTo([selected.geo_lat, selected.geo_lon], Math.max(map.getZoom(), 5), {
        duration: 0.6,
      });
    }
  }, [selected, map]);
  return null;
}

export default function MapView({ visits, selectedId, onSelect }) {
  const markerRefs = useRef({});
  const located = visits.filter((v) => v.geo_lat != null && v.geo_lon != null);
  const selected = located.find((v) => v.id === selectedId);

  useEffect(() => {
    if (selectedId != null) {
      markerRefs.current[selectedId]?.openPopup();
    }
  }, [selectedId]);

  if (located.length === 0) {
    return (
      <div className="map-empty">No geolocated visits to plot yet.</div>
    );
  }

  const center = [located[0].geo_lat, located[0].geo_lon];

  return (
    <div className="map-wrap">
      <MapContainer center={center} zoom={2} scrollWheelZoom={true}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />
        <FlyToSelected selected={selected} />
        {located.map((v) => (
          <Marker
            key={v.id}
            position={[v.geo_lat, v.geo_lon]}
            icon={v.id === selectedId ? selectedIcon : undefined}
            eventHandlers={{ click: () => onSelect(v.id) }}
            ref={(el) => {
              if (el) markerRefs.current[v.id] = el;
            }}
          >
            <Popup>
              <strong>{v.ip}</strong>
              <br />
              {[v.geo_city, v.geo_region, v.geo_country].filter(Boolean).join(", ")}
              <br />
              {v.geo_isp}
              <br />
              {new Date(v.ts * 1000).toLocaleString()}
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
