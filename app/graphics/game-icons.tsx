import type { SVGProps } from "react";

type GameIconName = "world" | "roam" | "station" | "trade" | "community" | "expeditions" | "season" | "emblem" | "clear" | "rain" | "heat" | "storm";
type Props = SVGProps<SVGSVGElement> & { name: GameIconName; size?: number };

/** Small, hand drawn stepped silhouettes share the world's stone, foliage and copper palette. */
export default function GameIcon({ name, size = 32, className = "", ...props }: Props) {
  const ink = "var(--q-icon-shadow, #172b23)";
  const stone = "var(--q-icon-stone, #c4d0b5)";
  const light = "var(--q-icon-light, #f5e8c5)";
  const green = "var(--q-icon-green, #819f64)";
  const gold = "var(--q-icon-gold, #d5a65e)";
  const copper = "var(--q-icon-copper, #9e6c3f)";
  const water = "var(--q-icon-water, #74b6b4)";
  const cloud = <><path fill={ink} d="M5 17h3v-5h6V8h11v3h6v5h5v10H5z"/><path fill={stone} d="M7 18h4v-5h5v-3h8v3h6v5h4v6H7z"/><path fill={light} d="M11 16h6v-4h6v3h6v4H11z"/></>;
  let art;
  switch (name) {
    case "roam": art = <><path fill={ink} d="M15 2h12v4h4v12h-5v5h7v7h-6v12H16v-9H9v-9h5v-6h-4V6h5z"/><path fill={copper} d="M14 6h14v7H14zM9 25h6v6H9z"/><path fill={light} d="M15 11h12v8H15z"/><path fill={green} d="M15 20h12v12H15z"/><path fill={gold} d="M15 23h4v9h-4zM27 25h5v5h-5z"/><path fill={stone} d="M16 32h5v9h-5zm7 0h5v9h-5z"/><path fill={ink} d="M23 13h2v2h-2z"/></>; break;
    case "emblem": art = <><path fill={copper} d="M17 1h8v4h8v5h5v7h4v8h-4v8h-5v5h-8v4h-8v-4H9v-5H4v-8H0v-8h4v-7h5V5h8z"/><path fill={ink} d="M17 4h8v4h7v5h3v5h4v6h-4v7h-5v4h-5v4h-8v-4h-7v-5H7v-6H3v-6h4v-6h5V8h5z"/><path fill={green} d="M6 25h5v-6h4v-6h4v-6h5v9h5v4h5v6h4v4H6z"/><path fill={stone} d="M11 20h4v-6h4V8h5v9h5v4h-6v-4h-5v8h-7z"/><path fill={light} d="M16 14h3V9h4v8h-4v-3z"/><path fill={water} d="M20 23h7v4h-5v4h-5v4h-5v-5h5v-3h3z"/><path fill={gold} d="M8 28h4v4H8zm24-14h3v3h-3z"/></>; break;
    case "world": art = <><path fill={ink} d="M3 9l11-4 13 4 12-4v29l-12 5-13-4-11 4z"/><path fill={green} d="M5 11l9-3v25l-9 3zm22 0 10-3v24l-10 4z"/><path fill={stone} d="M15 8l11 3v25l-11-3z"/><path fill={light} d="M18 12h5v4h-5zm0 7h5v3h-5zm0 7h5v3h-5z"/><path fill={gold} d="M8 15h4v3H8zm21 8h5v3h-5z"/><path fill={copper} d="M25 6h3v29h-3zM12 8h3v25h-3z"/><path fill={water} d="M6 26h4v-5h3v3h4v4h-7v4H6z"/></>; break;
    case "station": art = <><path fill={ink} d="M3 20h4v-5h5v-5h6V6h7v4h6v5h5v5h3v19H3z"/><path fill={copper} d="M5 19h4v-5h6v-4h12v4h6v5h4v4H5z"/><path fill={gold} d="M10 17h6v-4h9v3h5v3H10z"/><path fill={stone} d="M8 23h26v13H8z"/><path fill={light} d="M10 24h5v5h-5zm18 0h4v5h-4z"/><path fill={ink} d="M18 25h8v13h-8z"/><path fill={gold} d="M19 27h5v10h-5z"/><path fill={green} d="M5 35h12v4H5zm23 0h10v4H28z"/><path fill={stone} d="M30 7h5v10h-5z"/></>; break;
    case "trade": art = <><path fill={ink} d="M17 5h9v5h10v5h-4v10h6v10H24v-8h3V15h-3v22h8v4H10v-4h8V15h-3v12h3v8H3V25h6V15H5v-5h12z"/><path fill={gold} d="M19 7h4v30h-4zM6 11h29v3H6zM11 38h20v2H11z"/><path fill={stone} d="M10 15h3v11h-3zm18 0h3v11h-3z"/><path fill={copper} d="M4 27h13v6H4zm21 0h12v6H25z"/><path fill={light} d="M7 24h7v4H7zm20 0h7v4h-7z"/></>; break;
    case "community": art = <><path fill={copper} d="M8 5h3v34H8zm22 0h3v34h-3z"/><path fill={green} d="M11 7h11v5h-4v8h-7z"/><path fill={gold} d="M21 7h9v15h-9v-5h-5v-5h5z"/><path fill={ink} d="M10 24h8v5h7v-5h8v8h5v9H4v-9h6z"/><path fill={stone} d="M11 25h6v5h-6zm15 0h6v5h-6z"/><path fill={green} d="M7 33h13v7H7z"/><path fill={copper} d="M23 33h13v7H23z"/><path fill={light} d="M19 20h6v7h-6z"/><path fill={gold} d="M18 30h8v10h-8z"/></>; break;
    case "expeditions": art = <><path fill={copper} d="M16 2h10v4h8v7h5v15h-5v8h-8v4H16v-4H8v-8H3V13h5V6h8z"/><path fill={ink} d="M16 6h10v4h6v5h4v11h-5v6h-6v5h-9v-5h-6v-6H6V15h5v-5h5z"/><path fill={stone} d="M20 9h3v6h-3zm10 11h4v3h-4zm-10 9h3v5h-3zM9 20h5v3H9z"/><path fill={gold} d="M22 12v10H12v-3h5v-4h3v-3z"/><path fill={green} d="M22 22h9v3h-5v4h-4v3h-3V22z"/><path fill={light} d="M19 18h6v7h-6z"/></>; break;
    case "season": art = <><path fill={copper} d="M8 4h4v35H8z"/><path fill={green} d="M12 7h22v8h-5v8H12z"/><path fill={stone} d="M13 8h19v3H13z"/><path fill={gold} d="M20 10h5v4h4v4h-4v4h-5v-4h-4v-4h4z"/><path fill={light} d="M21 13h3v5h-3z"/><path fill={stone} d="M5 37h11v4H5z"/><path fill={gold} d="M29 28h3v3h4v3h-4v4h-3v-4h-4v-3h4z"/></>; break;
    case "clear": case "heat": art = <><path fill={gold} d="M18 2h6v6h-6zm0 31h6v7h-6zM2 18h6v6H2zm31 0h7v6h-7zM6 6h5v5H6zm25 0h5v5h-5zM6 31h5v5H6zm25 0h5v5h-5z"/><path fill={copper} d="M14 9h14v5h5v14h-5v5H14v-5H9V14h5z"/><path fill={gold} d="M14 12h12v4h4v10h-4v4H14v-4h-3V16h3z"/><path fill={light} d="M16 14h9v4H16zm-3 5h4v6h-4z"/>{name === "heat" && <path fill={light} d="M31 30h3v7h-3zm5-3h3v6h-3z"/>}</>; break;
    case "rain": art = <>{cloud}<path fill={water} d="M9 28h3v6H9zm10 3h3v7h-3zm10-3h3v6h-3z"/><path fill={light} d="M10 28h2v3h-2zm10 3h2v3h-2zm10-3h2v3h-2z"/></>; break;
    case "storm": art = <>{cloud}<path fill={gold} d="M20 22h7l-4 7h5L16 41l4-11h-5z"/><path fill={water} d="M8 28h3v7H8zm23 1h3v7h-3z"/></>; break;
  }
  return <svg width={size} height={size} viewBox="0 0 42 42" fill="none" className={`q-game-icon ${className}`} aria-hidden="true" focusable="false" {...props}>{art}</svg>;
}
