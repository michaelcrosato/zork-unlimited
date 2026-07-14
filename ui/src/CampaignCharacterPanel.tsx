import type { CampaignCharacterView } from "./overworld.js";

type IdListProps = {
  values: readonly string[];
};

function idLabel(id: string): string {
  const local = id.includes(":") ? id.slice(id.lastIndexOf(":") + 1) : id;
  return local
    .split(/[_-]+/)
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");
}

function statusLabel(value: string): string {
  return value.replaceAll("_", " ");
}

function Empty(): JSX.Element {
  return <p className="character-empty">None</p>;
}

function IdList({ values }: IdListProps): JSX.Element {
  if (values.length === 0) return <Empty />;
  return (
    <ul className="character-tags">
      {values.map((value) => (
        <li key={value} title={value}>
          {idLabel(value)}
        </li>
      ))}
    </ul>
  );
}

export function CampaignCharacterPanel({
  character,
}: {
  character: CampaignCharacterView;
}): JSX.Element {
  return (
    <details className="character-panel">
      <summary className="character-heading">
        <h2 className="character-heading-layout">
          <span className="character-title-block">
            <span className="kicker">Persistent Character</span>
            <span className="character-title">Your Record</span>
          </span>
          <span className="character-heading-meta">
            <span className="character-summary">
              Health {character.health.current}/{character.health.max} · {character.money} coin
            </span>
            <span className="character-readonly">Read only</span>
            <span className="character-toggle" aria-hidden="true">
              ▾
            </span>
          </span>
        </h2>
      </summary>

      <dl className="character-vitals">
        <div>
          <dt>Background</dt>
          <dd title={character.background ?? undefined}>
            {character.background ? idLabel(character.background) : "Unchosen"}
          </dd>
        </div>
        <div>
          <dt>Health</dt>
          <dd>
            {character.health.current}/{character.health.max}
          </dd>
        </div>
        <div>
          <dt>Money</dt>
          <dd>{character.money}</dd>
        </div>
      </dl>

      <div className="character-groups">
        <section>
          <h3>Skills</h3>
          {character.skills.length === 0 ? (
            <Empty />
          ) : (
            <ul className="character-rows">
              {character.skills.map((skill) => (
                <li key={skill.skillId} title={skill.skillId}>
                  <span>{idLabel(skill.skillId)}</span>
                  <strong>Rank {skill.rank}</strong>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h3>Values</h3>
          {character.values.length === 0 ? (
            <Empty />
          ) : (
            <ul className="character-rows">
              {character.values.map((value) => (
                <li key={value.valueId} title={value.valueId}>
                  <span>{idLabel(value.valueId)}</span>
                  <strong>Strength {value.strength}</strong>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h3>Equipment</h3>
          {character.equipment.length === 0 ? (
            <Empty />
          ) : (
            <ul className="character-rows character-rows-wide">
              {character.equipment.map((item) => (
                <li key={item.equipmentId} title={`${item.equipmentId} · ${item.itemId}`}>
                  <span>
                    {idLabel(item.itemId)} ×{item.quantity}
                  </span>
                  <strong>
                    {item.condition}%{item.equipped ? " · equipped" : ""}
                  </strong>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h3>Wounds</h3>
          {character.wounds.length === 0 ? (
            <Empty />
          ) : (
            <ul className="character-rows character-rows-wide">
              {character.wounds.map((wound) => (
                <li key={wound.woundId} title={wound.woundId}>
                  <span>{idLabel(wound.woundId)}</span>
                  <strong>
                    Severity {wound.severity} · {statusLabel(wound.treatment)}
                  </strong>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h3>Abilities</h3>
          <IdList values={character.abilities} />
        </section>

        <section>
          <h3>Knowledge</h3>
          <IdList values={character.knowledge} />
        </section>

        <section>
          <h3>Promises</h3>
          {character.promises.length === 0 ? (
            <Empty />
          ) : (
            <ul className="character-rows character-rows-wide">
              {character.promises.map((promise) => (
                <li key={promise.promiseId} title={promise.promiseId}>
                  <span>{idLabel(promise.recipientId)}</span>
                  <strong>{statusLabel(promise.status)}</strong>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h3>Crimes</h3>
          {character.crimes.length === 0 ? (
            <Empty />
          ) : (
            <ul className="character-rows character-rows-wide">
              {character.crimes.map((crime) => (
                <li key={crime.crimeId} title={crime.crimeId}>
                  <span>{idLabel(crime.jurisdictionId)}</span>
                  <strong>
                    Severity {crime.severity} · {statusLabel(crime.status)}
                  </strong>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="character-group-wide">
          <h3>Relationships</h3>
          {character.relationships.length === 0 ? (
            <Empty />
          ) : (
            <ul className="character-relationships">
              {character.relationships.map((relationship) => (
                <li key={relationship.npcId}>
                  <strong title={relationship.npcId}>{idLabel(relationship.npcId)}</strong>
                  <span>
                    Trust {statusLabel(relationship.trust)} · Regard {statusLabel(relationship.regard)}
                  </span>
                  {(relationship.owesPlayer > 0 || relationship.playerOwes > 0) && (
                    <span>
                      Owes you {relationship.owesPlayer} · You owe {relationship.playerOwes}
                    </span>
                  )}
                  {relationship.memories.length > 0 && (
                    <span>Remembers: {relationship.memories.map(idLabel).join(", ")}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="character-group-wide">
          <h3>Faction Standing</h3>
          {character.factionStanding.length === 0 ? (
            <Empty />
          ) : (
            <ul className="character-rows">
              {character.factionStanding.map((faction) => (
                <li key={faction.factionId} title={faction.factionId}>
                  <span>{idLabel(faction.factionId)}</span>
                  <strong>{statusLabel(faction.standing)}</strong>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </details>
  );
}
