import { useState, useEffect } from 'react';
import {
  DataGrid,
  type Column,
  type RenderEditCellProps,
} from 'react-data-grid';
import 'react-data-grid/lib/styles.css';
import { setBenchmarkResult } from '../utils/session';

interface Pokemon {
  id: number;
  pokedex_id: number;
  name: string;
  nickname: string;
  level: number;
  gender: 'Male' | 'Female' | 'Genderless';
  hp_iv: number;
  atk_iv: number;
  def_iv: number;
  spa_iv: number;
  spd_iv: number;
  spe_iv: number;
  hp_ev: number;
  atk_ev: number;
  def_ev: number;
  spa_ev: number;
  spd_ev: number;
  spe_ev: number;
  nature: string;
  item: string;
}

const POKEMON_DATA: { name: string; id: number; genderless?: boolean }[] = [
  { name: 'Bulbasaur', id: 1 },
  { name: 'Charmander', id: 4 },
  { name: 'Squirtle', id: 7 },
  { name: 'Pikachu', id: 25 },
  { name: 'Jigglypuff', id: 39 },
  { name: 'Meowth', id: 52 },
  { name: 'Psyduck', id: 54 },
  { name: 'Growlithe', id: 58 },
  { name: 'Abra', id: 63 },
  { name: 'Machop', id: 66 },
  { name: 'Geodude', id: 74 },
  { name: 'Slowpoke', id: 79 },
  { name: 'Magnemite', id: 81, genderless: true },
  { name: 'Gastly', id: 92 },
  { name: 'Onix', id: 95 },
  { name: 'Eevee', id: 133 },
  { name: 'Snorlax', id: 143 },
  { name: 'Dratini', id: 147 },
  { name: 'Mewtwo', id: 150, genderless: true },
  { name: 'Mew', id: 151, genderless: true },
  { name: 'Chikorita', id: 152 },
  { name: 'Cyndaquil', id: 155 },
  { name: 'Totodile', id: 158 },
  { name: 'Togepi', id: 175 },
  { name: 'Mareep', id: 179 },
  { name: 'Gengar', id: 94 },
  { name: 'Dragonite', id: 149 },
  { name: 'Tyranitar', id: 248 },
  { name: 'Lucario', id: 448 },
  { name: 'Garchomp', id: 445 },
  { name: 'Gardevoir', id: 282 },
  { name: 'Greninja', id: 658 },
  { name: 'Sylveon', id: 700 },
  { name: 'Rayquaza', id: 384, genderless: true },
  { name: 'Arceus', id: 493, genderless: true },
];

const ITEMS = [
  'Leftovers',
  'Life Orb',
  'Choice Scarf',
  'Choice Band',
  'Choice Specs',
  'Focus Sash',
  'Rocky Helmet',
  'Assault Vest',
  'Sitrus Berry',
  'Lum Berry',
  'Weakness Policy',
  'Eviolite',
  'Black Sludge',
  'Heavy-Duty Boots',
  'Expert Belt',
];

const NATURES = [
  'Adamant',
  'Bashful',
  'Bold',
  'Brave',
  'Calm',
  'Careful',
  'Docile',
  'Gentle',
  'Hardy',
  'Hasty',
  'Impish',
  'Jolly',
  'Lax',
  'Lonely',
  'Mild',
  'Modest',
  'Naive',
  'Naughty',
  'Quiet',
  'Quirky',
  'Rash',
  'Relaxed',
  'Sassy',
  'Serious',
  'Timid',
];

const getRandomInt = (min: number, max: number) =>
  Math.floor(Math.random() * (max - min + 1)) + min;
const getRandomItem = <T,>(arr: T[]) =>
  arr[Math.floor(Math.random() * arr.length)];

const generateData = (count: number): Pokemon[] => {
  return Array.from({ length: count }, (_, i) => {
    const poke = getRandomItem(POKEMON_DATA);
    let gender: 'Male' | 'Female' | 'Genderless';
    if (poke.genderless) {
      gender = 'Genderless';
    } else {
      gender = Math.random() > 0.5 ? 'Male' : 'Female';
    }

    return {
      id: i + 1,
      pokedex_id: poke.id,
      name: poke.name,
      nickname: `Poke-${i + 1}`,
      level: getRandomInt(1, 100),
      gender,
      hp_iv: getRandomInt(0, 31),
      atk_iv: getRandomInt(0, 31),
      def_iv: getRandomInt(0, 31),
      spa_iv: getRandomInt(0, 31),
      spd_iv: getRandomInt(0, 31),
      spe_iv: getRandomInt(0, 31),
      hp_ev: getRandomInt(0, 252),
      atk_ev: getRandomInt(0, 252),
      def_ev: getRandomInt(0, 252),
      spa_ev: getRandomInt(0, 252),
      spd_ev: getRandomInt(0, 252),
      spe_ev: getRandomInt(0, 252),
      nature: getRandomItem(NATURES),
      item: getRandomItem(ITEMS),
    };
  });
};

function textEditor({
  row,
  column,
  onRowChange,
  onClose,
}: RenderEditCellProps<Pokemon>) {
  return (
    <input
      style={{ width: '100%', outline: 'none', border: 'none', padding: '4px' }}
      value={row[column.key as keyof Pokemon]}
      onChange={(event) =>
        onRowChange({ ...row, [column.key]: event.target.value })
      }
      onBlur={() => onClose(true)}
    />
  );
}

const columns: Column<Pokemon>[] = [
  {
    key: 'image',
    name: 'Image',
    width: 80,
    renderCell: ({ row }) => (
      <img
        src={`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${row.pokedex_id}.png`}
        alt={row.name}
        style={{ width: 30, height: 30 }}
      />
    ),
  },
  { key: 'name', name: 'Name', width: 120 },
  {
    key: 'nickname',
    name: 'Individual Name',
    width: 120,
    renderEditCell: textEditor,
  },
  { key: 'level', name: 'Level', width: 60, renderEditCell: textEditor },
  { key: 'gender', name: 'Gender', width: 80, renderEditCell: textEditor },
  { key: 'hp_iv', name: 'HP IV', width: 60, renderEditCell: textEditor },
  { key: 'atk_iv', name: 'Atk IV', width: 60, renderEditCell: textEditor },
  { key: 'def_iv', name: 'Def IV', width: 60, renderEditCell: textEditor },
  { key: 'spa_iv', name: 'SpA IV', width: 60, renderEditCell: textEditor },
  { key: 'spd_iv', name: 'SpD IV', width: 60, renderEditCell: textEditor },
  { key: 'spe_iv', name: 'Spe IV', width: 60, renderEditCell: textEditor },
  { key: 'hp_ev', name: 'HP EV', width: 60, renderEditCell: textEditor },
  { key: 'atk_ev', name: 'Atk EV', width: 60, renderEditCell: textEditor },
  { key: 'def_ev', name: 'Def EV', width: 60, renderEditCell: textEditor },
  { key: 'spa_ev', name: 'SpA EV', width: 60, renderEditCell: textEditor },
  { key: 'spd_ev', name: 'SpD EV', width: 60, renderEditCell: textEditor },
  { key: 'spe_ev', name: 'Spe EV', width: 60, renderEditCell: textEditor },
  { key: 'nature', name: 'Nature', width: 100, renderEditCell: textEditor },
  { key: 'item', name: 'Held Item', width: 120, renderEditCell: textEditor },
];

export default function DataGridPage({ entryPoint }: { entryPoint?: string }) {
  const [rows, setRows] = useState(() => generateData(300));

  useEffect(() => {
    if (entryPoint === 'pokemon') {
      const poke15 = rows.find((r) => r.nickname === 'Poke-15');
      const poke250 = rows.find((r) => r.nickname === 'Poke-250');

      if (poke15 && poke250) {
        // Helper to check if IVs are 31
        const isMaxIV = (val: number | string) => Number(val) === 31;

        const check = (p: Pokemon) =>
          isMaxIV(p.hp_iv) &&
          isMaxIV(p.atk_iv) &&
          isMaxIV(p.def_iv) &&
          isMaxIV(p.spa_iv) &&
          isMaxIV(p.spd_iv) &&
          isMaxIV(p.spe_iv);

        if (check(poke15)) {
          setBenchmarkResult(entryPoint, 'update_pokemon_15', true);
        }
        if (check(poke250)) {
          setBenchmarkResult(entryPoint, 'update_pokemon_250', true);
        }
      }
    }
  }, [rows, entryPoint]);

  return (
    <div
      style={{
        padding: '20px',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <h2 style={{ marginBottom: '15px' }}>Pokemon Data Grid</h2>
      <div style={{ flexGrow: 1, overflow: 'hidden' }}>
        <DataGrid
          columns={columns}
          rows={rows}
          style={{ height: '100%' }}
          rowHeight={35}
          onRowsChange={setRows}
        />
      </div>
    </div>
  );
}
