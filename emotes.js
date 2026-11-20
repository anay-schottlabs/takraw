// Spectator emotes (keys 1–0). Placeholder — the full set is being animated.
// API: EMOTES[i] = { dur } (seconds); poseEmote(p, i, t, k) poses the rig at time t, blended over the normal pose by k (0..1).
export const EMOTES = Array.from({ length: 10 }, () => ({ dur: 3 }));
export function poseEmote(p, i, t, k) {
  const a = Math.sin(t * 8) * k;
  for (const A of p.arms) { A.sh.rotation.x += (-2.6 - A.sh.rotation.x) * k; A.sh.rotation.z += (A.sx * (0.4 + a * 0.3) - A.sh.rotation.z) * k; }
}
