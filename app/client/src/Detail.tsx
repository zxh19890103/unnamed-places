export default function (props: { latlng: L.LatLng }) {
  return <div className=" font-mono">{JSON.stringify(props.latlng)}</div>;
}
