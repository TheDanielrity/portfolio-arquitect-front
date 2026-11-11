/** Fit every corner of a centered world AABB to the camera. Geometry remains untouched. */
export function framingDistance(
  size: { x: number; y: number; z: number },
  aspect: number,
  fov: number,
  theta = 25,
  phi = 65,
): number {
  const t = (theta * Math.PI) / 180,
    p = (phi * Math.PI) / 180;
  const tangent = Math.tan((fov * Math.PI) / 360);
  if (
    ![size.x, size.y, size.z, aspect, tangent].every(Number.isFinite) ||
    aspect <= 0 ||
    tangent <= 0
  )
    return 0;
  let distance = 0;
  for (const x of [-size.x / 2, size.x / 2])
    for (const y of [-size.y / 2, size.y / 2])
      for (const z of [-size.z / 2, size.z / 2]) {
        const depth =
          x * Math.sin(p) * Math.sin(t) + y * Math.cos(p) + z * Math.sin(p) * Math.cos(t);
        const horizontal = x * Math.cos(t) - z * Math.sin(t);
        const vertical =
          -x * Math.cos(p) * Math.sin(t) + y * Math.sin(p) - z * Math.cos(p) * Math.cos(t);
        distance = Math.max(
          distance,
          depth + Math.max(Math.abs(horizontal) / (tangent * aspect), Math.abs(vertical) / tangent),
        );
      }
  return distance * 1.15;
}
