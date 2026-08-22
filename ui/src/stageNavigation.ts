import { useEffect, useLayoutEffect, useRef } from "react";
import type { NightWatchPanel } from "./NightWatchChrome.js";

export const useBrowserLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * Own the scroll/focus transition between Night Watch dock panels.
 *
 * Consequences and action projections deliberately are not dependencies: they
 * must leave the player's reading position alone. An explicit dock-panel change
 * or a new authored scene returns the shared stage to its new heading.
 */
export function useStagePanelNavigation(panel: NightWatchPanel, sceneIdentity: string) {
  const stageRef = useRef<HTMLDivElement>(null);
  const sceneHeadingRef = useRef<HTMLHeadingElement>(null);
  const utilityHeadingRef = useRef<HTMLHeadingElement>(null);
  const previousPanelRef = useRef(panel);
  const previousSceneRef = useRef(sceneIdentity);

  useEffect(() => {
    const panelChanged = previousPanelRef.current !== panel;
    const sceneChanged = previousSceneRef.current !== sceneIdentity;
    previousPanelRef.current = panel;
    previousSceneRef.current = sceneIdentity;
    if (!panelChanged && !sceneChanged) return;
    if (stageRef.current) stageRef.current.scrollTop = 0;
    const heading = panel === "scene" ? sceneHeadingRef.current : utilityHeadingRef.current;
    heading?.focus({ preventScroll: true });
  }, [panel, sceneIdentity]);

  return { sceneHeadingRef, stageRef, utilityHeadingRef };
}
