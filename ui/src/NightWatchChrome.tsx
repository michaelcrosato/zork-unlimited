import type { ReactNode } from "react";
import { Clock } from "@phosphor-icons/react/Clock";
import { FloppyDisk } from "@phosphor-icons/react/FloppyDisk";
import { Heart } from "@phosphor-icons/react/Heart";
import { Lightning } from "@phosphor-icons/react/Lightning";
import { List } from "@phosphor-icons/react/List";
import { MapTrifold } from "@phosphor-icons/react/MapTrifold";
import { Notebook } from "@phosphor-icons/react/Notebook";
import { Package } from "@phosphor-icons/react/Package";
import { Scales } from "@phosphor-icons/react/Scales";
import { User } from "@phosphor-icons/react/User";

export type NightWatchPanel = "scene" | "character" | "atlas" | "journal" | "terms" | "menu";

type NightWatchMastheadProps = {
  context: string;
  location: string;
  time: string;
  sessionStatus: string;
  health: string;
  supplies: string;
  fatigue: string;
  onScene: () => void;
};

export function NightWatchMasthead({
  context,
  location,
  time,
  sessionStatus,
  health,
  supplies,
  fatigue,
  onScene,
}: NightWatchMastheadProps): JSX.Element {
  return (
    <header className="nw-masthead">
      <button className="nw-wordmark" type="button" onClick={onScene}>
        AdventureForge
      </button>
      <span className="nw-masthead-divider" aria-hidden="true" />
      <button className="nw-context" type="button" onClick={onScene}>
        {context}
      </button>
      <span className="nw-masthead-divider" aria-hidden="true" />
      <strong className="nw-location">{location}</strong>
      <div className="nw-masthead-spacer" />
      <span className="nw-status-item">
        <Clock aria-hidden="true" /> {time}
      </span>
      <span className="nw-autosave">
        <FloppyDisk aria-hidden="true" /> {sessionStatus}
      </span>
      <span className="nw-masthead-divider" aria-hidden="true" />
      <span className="nw-status-item nw-health">
        <Heart aria-hidden="true" /> <b>HP</b> {health}
      </span>
      <span className="nw-status-item nw-supplies">
        <Package aria-hidden="true" /> <b>Supplies</b> {supplies}
      </span>
      <span className="nw-status-item nw-fatigue">
        <Lightning aria-hidden="true" /> <b>Fatigue</b> {fatigue}
      </span>
    </header>
  );
}

const PANELS: ReadonlyArray<{
  id: Exclude<NightWatchPanel, "scene">;
  label: string;
  detail: string;
  icon: (props: { "aria-hidden": true }) => ReactNode;
}> = [
  {
    id: "character",
    label: "Character",
    detail: "Record · Stats · Gear",
    icon: (props) => <User {...props} />,
  },
  {
    id: "atlas",
    label: "Atlas",
    detail: "Routes · Towns · Sites",
    icon: (props) => <MapTrifold {...props} />,
  },
  {
    id: "journal",
    label: "Journal",
    detail: "Goals · Scenes · Notes",
    icon: (props) => <Notebook {...props} />,
  },
  {
    id: "terms",
    label: "Exact terms",
    detail: "Checks · Costs · Outcomes",
    icon: (props) => <Scales {...props} />,
  },
  {
    id: "menu",
    label: "Menu",
    detail: "Journey · Help · Reset",
    icon: (props) => <List {...props} />,
  },
];

export function NightWatchDock({
  active,
  onSelect,
}: {
  active: NightWatchPanel;
  onSelect: (panel: NightWatchPanel) => void;
}): JSX.Element {
  return (
    <nav className="nw-dock" aria-label="Game utilities">
      {PANELS.map((panel) => (
        <button
          className={active === panel.id ? "is-active" : undefined}
          key={panel.id}
          type="button"
          aria-pressed={active === panel.id}
          onClick={() => onSelect(active === panel.id ? "scene" : panel.id)}
        >
          {panel.icon({ "aria-hidden": true })}
          <span>
            <strong>{panel.label}</strong>
            <small>{panel.detail}</small>
          </span>
        </button>
      ))}
    </nav>
  );
}
