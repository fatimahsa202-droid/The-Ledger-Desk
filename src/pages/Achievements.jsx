import React from "react";
import { Icon } from "../lib/Icon.jsx";
import { Card, LevelAvatar, ProgressBar, StatCard } from "../components/primitives.jsx";
import { useAppData } from "../store/AppDataProvider.jsx";
import { BADGES, levelInfo, levelTitle, levelRankTier, xpProgressPercent } from "../lib/gamification.js";

const TIER_ORDER = ["platinum", "gold", "silver", "bronze"];
const TIER_LABEL = { platinum: "Platinum", gold: "Gold", silver: "Silver", bronze: "Bronze" };

export function Achievements() {
  const { game, setGame, currentLevel, totalDoneAllTime, totalWorkedSeconds } = useAppData();
  const info = levelInfo(game.xp);
  const tier = levelRankTier(info.level);

  const grouped = TIER_ORDER.map((t) => ({ tier: t, badges: BADGES.filter((b) => b.tier === t) }));

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="eyebrow">Insights</div>
          <h1 className="page-title mt-1">Achievements</h1>
          <p className="page-sub">{game.badges.length} of {BADGES.length} unlocked.</p>
        </div>
      </div>

      <Card className="mb-6">
        <div className="flex items-center gap-5 flex-wrap">
          <LevelAvatar level={info.level} tier={tier} size={72} />
          <div className="flex-1 min-w-[200px]">
            <div className="text-xl fw-bold font-display">{levelTitle(info.level)}</div>
            <div className="text-sm muted mt-1">Level {info.level} · {TIER_LABEL[tier]} tier</div>
            <div className="mt-2" style={{ maxWidth: 360 }}>
              <div className="flex justify-between text-xs mono muted mb-1">
                <span>{info.xpIntoLevel} XP</span>
                <span>{info.xpForLevel} XP to next level</span>
              </div>
              <ProgressBar percent={xpProgressPercent(game.xp)} />
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm fw-semibold" style={{ color: game.streak > 0 ? "var(--amber)" : "var(--muted)" }}>
            <Icon name="flame" size={18} fill={game.streak > 0 ? "var(--amber)" : "none"} />
            {game.streak > 0 ? `${game.streak}-day streak` : "No streak yet"}
          </div>
        </div>
      </Card>

      <div className="grid grid-auto-sm mb-6">
        <StatCard icon="crown" iconTone="gold" label="Total XP earned" value={game.xp} />
        <StatCard icon="check" iconTone="green" label="Tasks reconciled" value={totalDoneAllTime} />
        <StatCard icon="clock" iconTone="accent" label="Total hours logged" value={(totalWorkedSeconds / 3600).toFixed(1) + "h"} />
        <StatCard icon="medal" iconTone="purple" label="Badges unlocked" value={`${game.badges.length}/${BADGES.length}`} />
      </div>

      {game.badges.length > 0 && (
        <Card className="mb-6">
          <div className="eyebrow mb-2">Showcase badge</div>
          <div className="text-xs muted mb-3">Pick one earned badge to feature next to your name.</div>
          <div className="flex flex-wrap gap-2">
            {game.badges.map((id) => {
              const b = BADGES.find((x) => x.id === id);
              if (!b) return null;
              const active = game.showcaseBadge === id;
              return (
                <button
                  key={id}
                  onClick={() => setGame((prev) => ({ ...prev, showcaseBadge: active ? null : id }))}
                  className="tag-chip"
                  style={active ? { borderColor: "var(--gold)", color: "var(--gold)", background: "var(--gold-bg)" } : undefined}
                >
                  <Icon name={b.icon} size={13} /> {b.name}
                </button>
              );
            })}
          </div>
        </Card>
      )}

      {grouped.map(({ tier: t, badges }) => (
        <div key={t} className="mb-6">
          <div className="eyebrow mb-3">{TIER_LABEL[t]}</div>
          <div className="grid grid-auto-md">
            {badges.map((b) => {
              const unlocked = game.badges.includes(b.id);
              return (
                <Card key={b.id} hover className="flex items-start gap-3" style={{ opacity: unlocked ? 1 : 0.5 }}>
                  <div
                    className="shrink-0"
                    style={{
                      width: 38, height: 38, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                      background: unlocked ? "var(--gold)" : "var(--muted-soft)", color: unlocked ? "#20140a" : "var(--muted)",
                    }}
                  >
                    <Icon name={b.icon} size={17} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm fw-semibold">{b.name}</div>
                    <div className="text-xs muted mt-1">{b.desc}</div>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
