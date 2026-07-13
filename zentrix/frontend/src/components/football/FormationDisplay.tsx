import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Crown } from 'lucide-react';

interface Player {
  name: string;
  number: number | null;
  position: string;
  grid: string | null;
  isCaptain: boolean;
  photo: string | null;
}

interface FormationDisplayProps {
  players: Player[];
  isHome: boolean;
  teamColor?: string;
}

/**
 * Parse grid position like "2:3" into row and column
 * Grid format from football-data.org: "row:col" where row 1=GK, 2=DEF, 3=MID, 4=FWD
 */
function parseGrid(grid: string | null): { row: number; col: number } | null {
  if (!grid) return null;
  const parts = grid.split(':');
  if (parts.length !== 2) return null;
  return { row: parseInt(parts[0]), col: parseInt(parts[1]) };
}

/**
 * Calculate player position on the pitch as percentage
 */
function getPositionOnPitch(grid: string | null, isHome: boolean): { top: string; left: string } {
  const parsed = parseGrid(grid);
  if (!parsed) return { top: '50%', left: '50%' };

  const { row, col } = parsed;

  // Map row to vertical position (0-100%)
  // Row 1 (GK) -> near goal, Row 4 (FWD) -> opponent goal
  const rowPositions: Record<number, number> = {
    1: isHome ? 92 : 8,   // GK
    2: isHome ? 70 : 30,  // DEF
    3: isHome ? 45 : 55,  // MID
    4: isHome ? 18 : 82,  // FWD
  };

  // Map column to horizontal position
  // Col 1 = left side, Col 3/4/5 = right side (depending on formation width)
  const maxCols = 5;
  const colWidth = 100 / (maxCols + 1);
  const left = colWidth * col;

  return {
    top: `${rowPositions[row] ?? 50}%`,
    left: `${Math.max(8, Math.min(92, left))}%`,
  };
}

/**
 * Get position abbreviation for display
 */
function getPositionAbbr(position: string): string {
  const map: Record<string, string> = {
    'Goalkeeper': 'GK',
    'Defence': 'DEF',
    'Defender': 'DEF',
    'Midfield': 'MID',
    'Midfielder': 'MID',
    'Offence': 'FWD',
    'Forward': 'FWD',
    'Attacker': 'FWD',
  };
  return map[position] || position.slice(0, 3).toUpperCase();
}

/**
 * Get color based on position
 */
function getPositionColor(position: string): string {
  const map: Record<string, string> = {
    'Goalkeeper': '#f59e0b',
    'Defence': '#3b82f6',
    'Defender': '#3b82f6',
    'Midfield': '#22c55e',
    'Midfielder': '#22c55e',
    'Offence': '#ef4444',
    'Forward': '#ef4444',
    'Attacker': '#ef4444',
  };
  return map[position] || '#888888';
}

export default function FormationDisplay({ players, isHome, teamColor = '#3b82f6' }: FormationDisplayProps) {
  const positionedPlayers = useMemo(() => {
    return players.map(p => ({
      ...p,
      pos: getPositionOnPitch(p.grid, isHome),
    }));
  }, [players, isHome]);

  return (
    <div className="relative w-full rounded-2xl overflow-hidden"
      style={{ aspectRatio: '2/2.2', background: '#0d2818' }}>

      {/* Pitch background */}
      <div className="absolute inset-0">
        {/* Grass texture with gradient */}
        <div className="absolute inset-0" style={{
          background: 'linear-gradient(180deg, #0d2818 0%, #1a4d2e 50%, #0d2818 100%)',
        }} />

        {/* Pitch lines */}
        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 110" preserveAspectRatio="none">
          {/* Halfway line */}
          <line x1="0" y1="55" x2="100" y2="55" stroke="rgba(255,255,255,0.3)" strokeWidth="0.3" />

          {/* Center circle */}
          <circle cx="50" cy="55" r="8" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="0.3" />
          <circle cx="50" cy="55" r="0.5" fill="rgba(255,255,255,0.4)" />

          {/* Home penalty area (top) */}
          <rect x="20" y="0" width="60" height="12" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="0.3" />
          <rect x="35" y="0" width="30" height="4" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="0.3" />
          <path d="M 40 12 Q 50 16 60 12" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="0.3" />

          {/* Away penalty area (bottom) */}
          <rect x="20" y="98" width="60" height="12" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="0.3" />
          <rect x="35" y="106" width="30" height="4" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="0.3" />
          <path d="M 40 98 Q 50 94 60 98" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="0.3" />

          {/* Corner arcs */}
          <path d="M 0 3 Q 3 3 3 0" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="0.3" />
          <path d="M 97 0 Q 97 3 100 3" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="0.3" />
          <path d="M 0 107 Q 3 107 3 110" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="0.3" />
          <path d="M 97 110 Q 97 107 100 107" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="0.3" />

          {/* Border */}
          <rect x="0.5" y="0.5" width="99" height="109" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="0.5" />
        </svg>
      </div>

      {/* Players */}
      {positionedPlayers.map((player, i) => (
        <motion.div
          key={`${player.name}-${i}`}
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: i * 0.05, type: 'spring', damping: 20 }}
          className="absolute flex flex-col items-center gap-0.5"
          style={{
            top: player.pos.top,
            left: player.pos.left,
            transform: 'translate(-50%, -50%)',
          }}
        >
          {/* Player dot */}
          <div className="relative">
            <div
              className="w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-[9px] sm:text-[10px] font-black text-white shadow-lg"
              style={{
                background: `linear-gradient(135deg, ${teamColor}, ${teamColor}dd)`,
                boxShadow: `0 2px 8px ${teamColor}44, inset 0 1px 0 rgba(255,255,255,0.2)`,
                border: '1.5px solid rgba(255,255,255,0.3)',
              }}
            >
              {player.number ?? getPositionAbbr(player.position).charAt(0)}
            </div>
            {/* Captain badge */}
            {player.isCaptain && (
              <div className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full flex items-center justify-center"
                style={{ background: '#fbbf24', border: '1.5px solid #fff' }}>
                <Crown size={7} className="text-white" style={{ fill: '#fff' }} />
              </div>
            )}
          </div>
          {/* Player name */}
          <span className="text-[7px] sm:text-[8px] font-bold text-white whitespace-nowrap px-1 py-0.5 rounded"
            style={{ background: 'rgba(0,0,0,0.5)', textShadow: '0 1px 2px rgba(0,0,0,0.8)' }}>
            {player.name.split(' ').pop()}
          </span>
        </motion.div>
      ))}
    </div>
  );
}
